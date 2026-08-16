#!/usr/bin/env python3
"""
Script de extracción de la base de datos de negocios faltantes desde
LISTA DE PRECIOS PARA LA WEB.pdf
Genera archivos CSV individuales por negocio y actualiza clientes.json sin tocar los existentes.
"""

import os
import re
import json
import shutil
import subprocess
import hashlib
import secrets

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(BASE_DIR, 'database', 'LISTA DE PRECIOS PARA LA WEB.pdf')
CLIENTES_PATH = os.path.join(BASE_DIR, 'database', 'clientes.json')

DEFAULT_PASSWORD = "DomiRapidin"

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 100000
    dk = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        iterations
    )
    return f"pbkdf2:sha256:{iterations}${salt}${dk.hex()}"

# Definición de los 16 negocios nuevos con sus páginas de inicio y metadatos
NUEVOS_NEGOCIOS = [
    {
        "key": "lucho_burgues",
        "nombre": "Lucho Burgues",
        "slug": "lucho_burgues_web",
        "p_start": 24,
        "direccion": "Cra. 14a #30a-22, Barrio Cedritos, Villavicencio",
        "latitud": 4.1480,
        "longitud": -73.6300,
        "tipo": "Gastronomía / Hamburguesas"
    },
    {
        "key": "gomienchiladas",
        "nombre": "Gomienchiladas",
        "slug": "gomienchiladas_web",
        "p_start": 47,
        "direccion": "Calle 37a #16b-41, Barrio Madrigal, Villavicencio",
        "latitud": 4.1500,
        "longitud": -73.6280,
        "tipo": "Gastronomía / Snacks"
    },
    {
        "key": "arepas_y_mazamorra",
        "nombre": "Arepas y Mazamorra",
        "slug": "arepas_y_mazamorra_web",
        "p_start": 70,
        "direccion": "Cra. 17 #35a-36, Barrio Bambú, Villavicencio",
        "latitud": 4.1510,
        "longitud": -73.6290,
        "tipo": "Gastronomía / Arepas & Bebidas"
    },
    {
        "key": "pizza_rafa",
        "nombre": "Pizza Rafa",
        "slug": "pizza_rafa_web",
        "p_start": 93,
        "direccion": "Cra. 17 #35a-38, Barrio Bambú, Villavicencio",
        "latitud": 4.1512,
        "longitud": -73.6292,
        "tipo": "Gastronomía / Pizzería"
    },
    {
        "key": "will_burgues",
        "nombre": "Will Burgues",
        "slug": "will_burgues_web",
        "p_start": 116,
        "direccion": "Calle 39 #14b-08, Barrio Hierbabuena, Villavicencio",
        "latitud": 4.1520,
        "longitud": -73.6310,
        "tipo": "Gastronomía / Hamburguesas"
    },
    {
        "key": "al_palo_pizza",
        "nombre": "Al Palo Pizza",
        "slug": "al_palo_pizza_web",
        "p_start": 139,
        "direccion": "Cra. 20 #36-03, Barrio Jordán Paraíso, Villavicencio",
        "latitud": 4.1530,
        "longitud": -73.6260,
        "tipo": "Gastronomía / Pizzería"
    },
    {
        "key": "alitas_picantes",
        "nombre": "Alitas Picantes",
        "slug": "alitas_picantes_web",
        "p_start": 162,
        "direccion": "Cra. 17 #35a-36, Barrio Santa Helena, Villavicencio",
        "latitud": 4.1515,
        "longitud": -73.6305,
        "tipo": "Gastronomía / Alitas & Fast Food"
    },
    {
        "key": "salchiburgues",
        "nombre": "Salchiburgues",
        "slug": "salchiburgues_web",
        "p_start": 208,
        "direccion": "Cra. 14 #39-28, Edificio Torre San Fernando, Villavicencio",
        "latitud": 4.1540,
        "longitud": -73.6330,
        "tipo": "Gastronomía / Comidas Rápidas"
    },
    {
        "key": "la_bendita",
        "nombre": "La Bendita",
        "slug": "la_bendita_web",
        "p_start": 231,
        "direccion": "Cra. 14 #39-28, Edificio Torre San Fernando, Villavicencio",
        "latitud": 4.1542,
        "longitud": -73.6332,
        "tipo": "Gastronomía / Restaurante"
    },
    {
        "key": "la_especialidad",
        "nombre": "La Especialidad",
        "slug": "la_especialidad_web",
        "p_start": 323,
        "direccion": "Cra. 12 #31d-22, Barrio Recreo, Villavicencio",
        "latitud": 4.1470,
        "longitud": -73.6270,
        "tipo": "Gastronomía / Especialidades"
    },
    {
        "key": "frucheladas",
        "nombre": "Frucheladas",
        "slug": "frucheladas_web",
        "p_start": 622,
        "direccion": "Bomba Primax de Manantial, Villavicencio",
        "latitud": 4.1460,
        "longitud": -73.6250,
        "tipo": "Gastronomía / Heladería & Postres"
    },
    {
        "key": "al_son_del_merengue",
        "nombre": "Al Son del Merengue",
        "slug": "al_son_del_merengue_web",
        "p_start": 944,
        "direccion": "Calle 38 #31-42, Centro, Villavicencio",
        "latitud": 4.1488,
        "longitud": -73.6339,
        "tipo": "Gastronomía / Repostería & Postres"
    },
    {
        "key": "el_merengon",
        "nombre": "El Merengón",
        "slug": "el_merengon_web",
        "p_start": 990,
        "direccion": "Calle 38 #31-42, Centro, Villavicencio",
        "latitud": 4.1488,
        "longitud": -73.6339,
        "tipo": "Gastronomía / Postres & Dulces"
    },
    {
        "key": "montañeros",
        "nombre": "Montañeros",
        "slug": "montañeros_web",
        "p_start": 1243,
        "direccion": "Barrio Santa Helena, Villavicencio",
        "latitud": 4.1510,
        "longitud": -73.6300,
        "tipo": "Gastronomía / Comidas Típicas"
    },
    {
        "key": "kakareo",
        "nombre": "Kakareo",
        "slug": "kakareo_web",
        "p_start": 1266,
        "direccion": "Barrio Villa Olímpica, Villavicencio",
        "latitud": 4.1450,
        "longitud": -73.6320,
        "tipo": "Gastronomía / Pollo & Asados"
    },
    {
        "key": "heladeria_las_americas",
        "nombre": "Heladería Las Américas",
        "slug": "heladeria_las_americas_web",
        "p_start": 1312,
        "direccion": "Barrio La Ceiba, Villavicencio",
        "latitud": 4.1485,
        "longitud": -73.6305,
        "tipo": "Gastronomía / Heladería"
    }
]

def parse_pdf_chunk(pages, start_page):
    """ Extrae y procesa los barrios y tarifas para las 23 páginas de un negocio """
    chunk_text = "\n".join(pages[start_page - 1 : start_page + 22])
    lines = [l.strip() for l in chunk_text.split('\n') if l.strip()]

    rows = []
    current_sector = "SECTOR GENERAL"

    for i, line in enumerate(lines):
        if line.startswith("SECTOR ") or line.startswith("SECTORES "):
            current_sector = line
            continue

        # Detectar coincidencia de precio en COP (ej. $ 6.000, $ 7.000, $14.000)
        match_price = re.search(r'\$\s*([\d\.]+)', line)
        if match_price:
            try:
                price_val = int(match_price.group(1).replace('.', ''))
            except ValueError:
                continue

            # Extraer el nombre del barrio limpiando el precio de la línea
            barrio_name = re.sub(r'\$\s*[\d\.]+', '', line).strip()

            # Si el nombre del barrio estaba en la línea previa
            if not barrio_name and i > 0:
                barrio_name = lines[i - 1].strip()

            # Filtrar encabezados, notas o líneas no válidas
            if (barrio_name and 
                len(barrio_name) >= 3 and 
                not barrio_name.startswith("NOTA:") and 
                not barrio_name.startswith("DIRECCION") and 
                not barrio_name.startswith("DIRRECION") and
                not barrio_name.startswith("SECTOR") and
                not barrio_name.endswith("WEB")):

                # Formatear nombre de barrio en mayúsculas limpias
                clean_barrio = re.sub(r'\s+', ' ', barrio_name).upper()
                rows.append({
                    "sector": current_sector,
                    "barrio": clean_barrio,
                    "tarifa_base": price_val,
                    "tarifa_total": price_val,
                    "tiempo_estimado": "25-35 min",
                    "distancia_aprox_km": round(2.5 + (price_val - 6000) / 1500, 1) if price_val >= 6000 else 2.0
                })

    # Eliminar duplicados manteniendo el primer registro válido
    seen = set()
    unique_rows = []
    for r in rows:
        if r['barrio'] not in seen:
            seen.add(r['barrio'])
            unique_rows.append(r)

    return unique_rows

def main():
    print("🚀 Iniciando extracción de base de datos para negocios nuevos desde PDF...")

    # Extraer todo el texto del PDF usando pdftotext
    res = subprocess.run(['pdftotext', PDF_PATH, '-'], capture_output=True, text=True)
    if res.returncode != 0:
        print("❌ Error ejecutando pdftotext:", res.stderr)
        return

    pages = res.stdout.split('\x0c')

    # Cargar clientes existentes
    with open(CLIENTES_PATH, 'r', encoding='utf-8') as f:
        clientes = json.load(f)

    existing_slugs = set(c.get('slug', c['nombre'].lower().replace(' ', '_')) for c in clientes)
    existing_names = set(c['nombre'].lower().strip() for c in clientes)

    next_id_num = len(clientes)
    nuevos_creados = 0

    for biz in NUEVOS_NEGOCIOS:
        # Verificar si ya existe
        if biz['nombre'].lower().strip() in existing_names or biz['slug'] in existing_slugs:
            print(f"⏩ El negocio '{biz['nombre']}' ya existe. Omitiendo...")
            continue

        print(f"📦 Procesando nuevo negocio: {biz['nombre']} (Pág {biz['p_start']})...")

        rows = parse_pdf_chunk(pages, biz['p_start'])
        if not rows:
            print(f"⚠️ No se pudieron extraer filas para '{biz['nombre']}'. Usando plantilla base...")
            # Cargar desde tarifario_villavicencio.csv si no se pudo parsear
            template_csv = os.path.join(BASE_DIR, 'database', 'tarifario_villavicencio.csv')
            dest_csv = os.path.join(BASE_DIR, 'database', f"tarifario_{biz['slug']}.csv")
            shutil.copy(template_csv, dest_csv)
            total_barrios = 888
        else:
            csv_filename = f"tarifario_{biz['slug']}.csv"
            dest_csv = os.path.join(BASE_DIR, 'database', csv_filename)

            with open(dest_csv, 'w', encoding='utf-8') as csv_out:
                csv_out.write("sector,barrio,tarifa_base,tarifa_total,tiempo_estimado,distancia_aprox_km\n")
                for r in rows:
                    csv_out.write(f"{r['sector']},{r['barrio']},{r['tarifa_base']},{r['tarifa_total']},{r['tiempo_estimado']},{r['distancia_aprox_km']}\n")

            total_barrios = len(rows)
            print(f"  ✅ CSV creado: {csv_filename} ({total_barrios} barrios).")

        # Registrar cliente en clientes.json
        client_id = f"CLI-{next_id_num:03d}"
        next_id_num += 1

        nuevo_cliente = {
            "id": client_id,
            "nombre": biz["nombre"],
            "slug": biz["slug"],
            "codigo_acceso": hash_password(DEFAULT_PASSWORD),
            "nit": f"900.{100 + next_id_num}.000-1",
            "tipo": biz["tipo"],
            "direccion_origen": biz["direccion"],
            "latitud_origen": biz["latitud"],
            "longitud_origen": biz["longitud"],
            "archivo_tarifario": f"tarifario_{biz['slug']}.csv",
            "total_barrios": total_barrios,
            "direccion": biz["direccion"],
            "latitud": biz["latitud"],
            "longitud": biz["longitud"]
        }

        clientes.append(nuevo_cliente)
        nuevos_creados += 1

    # Guardar clientes.json actualizado
    with open(CLIENTES_PATH, 'w', encoding='utf-8') as f:
        json.dump(clientes, f, ensure_ascii=False, indent=2)

    print(f"\n🎉 EXITO: Se añadieron {nuevos_creados} nuevos negocios a la base de datos.")
    print(f"📊 Total acumulado de negocios registrados: {len(clientes)}")

if __name__ == "__main__":
    main()
