#!/usr/bin/env python3
"""
Test PDF Price Extractor for DomiciliosRapidin
Parses neighborhood table pricing by matching vertical Y-coordinates to right-column price cell boundaries.
"""

import sys
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE_DIR, 'lib')
if os.path.exists(LIB_DIR) and LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

import pymupdf

pdf_path = os.path.join(BASE_DIR, 'database', 'LISTA DE PRECIOS PARA LA WEB.2.pdf')
doc = pymupdf.open(pdf_path)

def extract_page_neighborhood_prices(page):
    words = page.get_text('words')
    drawings = page.get_drawings()

    # Horizontal lines across right column (x1 > 400)
    right_dividers = []
    all_dividers = []
    for p in drawings:
        r = p['rect']
        if r.height <= 5 and r.width > 50:
            y = round(r.y0, 1)
            all_dividers.append(y)
            if r.x1 > 400:
                right_dividers.append(y)

    right_dividers = sorted(list(set(right_dividers)))
    all_dividers = sorted(list(set(all_dividers)))

    # Find price words (contain $ or numbers like 6.000) on right side (x > 350)
    price_items = []
    for w in words:
        if w[0] > 350 and ('$' in w[4] or re.match(r'^\d+[\.,]\d+$', w[4])):
            price_items.append(w)

    # Group price words by line Y
    price_lines = {}
    for pw in price_items:
        y_key = round(pw[1] / 5.0) * 5.0
        if y_key not in price_lines:
            price_lines[y_key] = []
        price_lines[y_key].append(pw)

    price_blocks = []
    for y_key in sorted(price_lines.keys()):
        p_words = price_lines[y_key]
        full_text = ' '.join([w[4] for w in p_words])
        y_val = p_words[0][1]

        num_match = re.search(r'\d+[\.,]?\d*', full_text.replace('$','').replace(' ',''))
        if num_match:
            raw_num = num_match.group(0).replace('.','').replace(',','')
            if raw_num.isdigit():
                val = int(raw_num)
                price_blocks.append({
                    'y': y_val,
                    'price': val,
                    'text': full_text
                })

    price_blocks = sorted(price_blocks, key=lambda x: x['y'])

    # Calculate Y-ranges for price blocks using right_dividers
    for idx, pb in enumerate(price_blocks):
        py = pb['y']
        # Find top boundary (last divider <= py)
        top_y = 0.0
        for d in right_dividers:
            if d <= py + 5:
                top_y = d
            else:
                break

        # Find bottom boundary (first divider > py)
        bottom_y = 9999.0
        for d in right_dividers:
            if d > py + 5:
                bottom_y = d
                break

        pb['top_y'] = top_y
        pb['bottom_y'] = bottom_y

    # Group left-side words (x < 350) into neighborhood lines
    left_words = [w for w in words if w[0] < 350]
    line_dict = {}
    for w in left_words:
        y_key = round(w[1], 1)
        matched_y = None
        for k in line_dict:
            if abs(k - y_key) < 4:
                matched_y = k
                break
        if matched_y is None:
            matched_y = y_key
            line_dict[matched_y] = []
        line_dict[matched_y].append(w)

    results = []
    current_sector = 'SECTOR GENERAL'

    for y_key in sorted(line_dict.keys()):
        words_in_line = sorted(line_dict[y_key], key=lambda item: item[0])
        line_text = ' '.join([w[4] for w in words_in_line]).strip()

        # Filter out header titles / notes
        if any(h_kw in line_text.upper() for h_kw in ['SECTOR', 'CONJUNTOS', 'MINIMA', 'TARIFAS', 'NOTA', 'DIRECCION', 'MAILYS', 'DESMONTAJE', 'DISMINUCION', 'AUMENTO']):
            if 'SECTOR' in line_text.upper() or 'CONJUNTOS' in line_text.upper():
                current_sector = line_text
            continue

        if len(line_text) < 2:
            continue

        # Match neighborhood line Y to price block
        matched_price = 6000
        if price_blocks:
            # Default to first price block if above all or last if below all
            if y_key < price_blocks[0]['top_y']:
                matched_price = price_blocks[0]['price']
            elif y_key > price_blocks[-1]['bottom_y']:
                matched_price = price_blocks[-1]['price']
            else:
                for pb in price_blocks:
                    if pb['top_y'] - 5 <= y_key <= pb['bottom_y'] + 5:
                        matched_price = pb['price']
                        break

        results.append({
            'barrio': line_text,
            'sector': current_sector,
            'tarifa': matched_price,
            'y': y_key
        })

    return results

if __name__ == '__main__':
    print("=== PRUEBA EN PAGINA 1 (MAILYS WEB) ===")
    res1 = extract_page_neighborhood_prices(doc[0])
    for r in res1:
        print(f"{r['barrio']:32s} | {r['sector']:25s} | ${r['tarifa']:,} COP (Y={r['y']:.1f})")

    print("\n=== PRUEBA EN PAGINA 2 (MAILYS WEB) ===")
    res2 = extract_page_neighborhood_prices(doc[1])
    for r in res2:
        print(f"{r['barrio']:32s} | {r['sector']:25s} | ${r['tarifa']:,} COP (Y={r['y']:.1f})")
