#!/usr/bin/env python3
import json
import csv
import glob
import os
import math

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_DIR = os.path.join(BASE_DIR, 'database')
CACHE_FILE = os.path.join(DB_DIR, 'geocache_villavicencio.json')

# Complete Master Geodata Map for Villavicencio Neighborhoods, Sectors and Landmarks
VILLAVICENCIO_BARRIOS_GEODATA = {
    # Sector Centro & Mínima
    "CENTRO": (4.1488, -73.6339),
    "LA CEIBA": (4.1485, -73.6305),
    "CEIBA": (4.1485, -73.6305),
    "SANTA HELENA": (4.1510, -73.6300),
    "EL BOSQUE": (4.1495, -73.6310),
    "BOSQUE BAJO": (4.1490, -73.6315),
    "CEDRITOS": (4.1502, -73.6320),
    "SAUCES": (4.1515, -73.6335),
    "ROSALES": (4.1495, -73.6295),
    "CONJUNTO LLANO GRANDE": (4.1478, -73.6288),
    "SANTA LUCIA": (4.1482, -73.6275),
    "BARCELONA": (4.1470, -73.6260),
    "POPULAR": (4.1460, -73.6350),
    "DOS MIL BAJO": (4.1455, -73.6370),
    "DOS MIL ALTO": (4.1448, -73.6385),
    "BAMBU": (4.1472, -73.6360),
    "JORDAN": (4.1540, -73.6270),
    "JORDAN PARAISO": (4.1548, -73.6265),
    "JORDAN ALTO": (4.1555, -73.6258),
    "SAN LUIS": (4.1465, -73.6325),
    "MADRIGAL": (4.1505, -73.6285),
    "VILLA FABIOLA": (4.1512, -73.6278),
    "CAMINO REAL": (4.1530, -73.6250),
    "VILLA CRISTINA": (4.1525, -73.6240),
    "CASTILLA": (4.1498, -73.6265),
    "RECREO": (4.1480, -73.6290),
    "20 DE JULIO": (4.1520, -73.6340),
    "20 JULIO": (4.1520, -73.6340),
    "SAN BENITO": (4.1500, -73.6360),
    "SIMON BOLIVAR": (4.1515, -73.6375),
    "PORVENIR": (4.1532, -73.6355),
    "NOGAL": (4.1475, -73.6330),
    "CANEY": (4.1468, -73.6318),

    # Sector Salud & Barzal
    "BARZAL": (4.1442, -73.6365),
    "BARZAL ALTO": (4.1435, -73.6375),
    "HOSPITAL DEPARTAMENTAL": (4.1440, -73.6370),
    "CLINICA META": (4.1438, -73.6362),
    "SERVIMEDICOS": (4.1445, -73.6358),
    "SANITAS": (4.1448, -73.6360),

    # Sector Buque & Trapiche
    "EL BUQUE": (4.1350, -73.6420),
    "BUQUE": (4.1350, -73.6420),
    "RINCON DEL BUQUE": (4.1342, -73.6428),
    "TRAPICHE": (4.1330, -73.6435),
    "SAN ANGEL": (4.1360, -73.6410),

    # Sector Grama & Caudal
    "LA GRAMA": (4.1585, -73.6415),
    "GRAMA": (4.1585, -73.6415),
    "EL CAUDAL": (4.1595, -73.6380),
    "CAUDAL": (4.1595, -73.6380),
    "PARQUE DE LA CRUZ": (4.1550, -73.6390),

    # Sector Catama & Kirpas
    "CATAMA": (4.1470, -73.6080),
    "COFREM CATAMA": (4.1450, -73.6120),
    "ESTERO": (4.1430, -73.6150),
    "MACUNAIMA": (4.1420, -73.6170),
    "KIRPAS": (4.1380, -73.6050),
    "SABANA DE KIRPAS": (4.1365, -73.6020),
    "LA RELIQUIA": (4.1390, -73.5920),
    "RELIQUIA": (4.1390, -73.5920),
    "13 DE MAYO": (4.1350, -73.5980),

    # Sector Amarilo & Centauros
    "AMARILO": (4.1080, -73.6050),
    "MORICHAL": (4.1095, -73.6070),
    "CIMARRON": (4.1070, -73.6030),
    "ALBORADA": (4.1110, -73.6060),
    "PASOLLANO": (4.1060, -73.6040),
    "LOS CENTAUROS": (4.1120, -73.6100),
    "UNIMINUTO": (4.1140, -73.6120),

    # Sector Porfía & Sur
    "CIUDAD PORFIA": (4.0820, -73.6210),
    "PORFIA": (4.0820, -73.6210),
    "LA MADRID": (4.0750, -73.6150),
    "MADRID": (4.0750, -73.6150),
    "MONTECARLO": (4.0950, -73.6250),
    "ROCHELA": (4.0920, -73.6280),
    "VILLA BOLIVAR": (4.0880, -73.6230),

    # Sector Vanguardia & Veredas
    "VANGUARDIA": (4.1680, -73.6220),
    "VEREDA VANGUARDIA": (4.1680, -73.6220),
    "AEROPUERTO": (4.1670, -73.6150),
    "VEREDA APIAY": (4.0750, -73.5450),
    "APIAY": (4.0750, -73.5450),
    "VEREDA BARCELONA": (4.0910, -73.5820),
    "UNIVERSIDAD DE LOS LLANOS": (4.0900, -73.5850),
    "UNILLANOS": (4.0900, -73.5850),
    "CAIRO": (4.1820, -73.6100),
    "VEREDA EL CAIRO": (4.1820, -73.6100),

    # Centros Comerciales
    "UNIVIVA": (4.1340, -73.6360),
    "VIVA": (4.1340, -73.6360),
    "UNICENTRO": (4.1380, -73.6345),
    "VILLACENTRO": (4.1395, -73.6355),
    "LLANOCENTRO": (4.1410, -73.6362),
    "PRIMAVERA URBANA": (4.1365, -73.6370),
    "UNICO": (4.1520, -73.6150),
    "TERMINAL": (4.1280, -73.6290)
}

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def resolve_coords(barrio_name, zone_name):
    b_upper = barrio_name.upper().strip()
    z_upper = zone_name.upper().strip()

    # 1. Direct match in Master Geodata
    if b_upper in VILLAVICENCIO_BARRIOS_GEODATA:
        return VILLAVICENCIO_BARRIOS_GEODATA[b_upper]

    # 2. Substring match in Master Geodata
    for key, coords in VILLAVICENCIO_BARRIOS_GEODATA.items():
        if key in b_upper or b_upper in key:
            return coords

    # 3. Zone-based intelligent fallback
    for key, coords in VILLAVICENCIO_BARRIOS_GEODATA.items():
        if key in z_upper:
            # Add small offset based on hash of barrio_name for visual distinction on maps
            h = hash(barrio_name) % 100
            lat_off = (h - 50) * 0.0001
            lng_off = ((hash(barrio_name[::-1]) % 100) - 50) * 0.0001
            return (round(coords[0] + lat_off, 5), round(coords[1] + lng_off, 5))

    # Default fallback
    h = hash(barrio_name) % 100
    lat_off = (h - 50) * 0.0002
    lng_off = ((hash(barrio_name[::-1]) % 100) - 50) * 0.0002
    return (round(4.1488 + lat_off, 5), round(-73.6339 + lng_off, 5))

def update_all_csvs():
    csv_files = glob.glob(os.path.join(DB_DIR, 'tarifario_*.csv'))
    print(f"Actualizando coordenadas en {len(csv_files)} archivos CSV...")

    clientes_path = os.path.join(DB_DIR, 'clientes.json')
    clientes = []
    if os.path.exists(clientes_path):
        with open(clientes_path, 'r', encoding='utf-8') as f:
            clientes = json.load(f)

    client_map = {c.get("archivo_tarifario"): c for c in clientes}

    total_geocoded = 0
    for csv_path in csv_files:
        filename = os.path.basename(csv_path)
        client_info = client_map.get(filename, {})
        orig_lat = client_info.get("latitud_origen", 4.1485)
        orig_lng = client_info.get("longitud_origen", -73.6305)

        rows = []
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                barrio = row["barrio"]
                zona = row["zona"]
                lat, lng = resolve_coords(barrio, zona)
                
                dist_real = round(haversine_km(orig_lat, orig_lng, lat, lng), 1)
                if dist_real < 0.5:
                    dist_real = 1.0

                rows.append({
                    "id": row["id"],
                    "barrio": barrio,
                    "zona": zona,
                    "latitud": lat,
                    "longitud": lng,
                    "distancia_km": dist_real,
                    "tarifa_base": row["tarifa_base"],
                    "recargo_distancia": row["recargo_distancia"],
                    "tarifa_total": row["tarifa_total"],
                    "tiempo_entrega_min": row.get("tiempo_entrega_min", 20)
                })
                total_geocoded += 1

        fieldnames = ["id", "barrio", "zona", "latitud", "longitud", "distancia_km", "tarifa_base", "recargo_distancia", "tarifa_total", "tiempo_entrega_min"]
        with open(csv_path, mode='w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

    print(f"✅ Se actualizaron las geocoordenadas de {total_geocoded} registros en todos los CSVs.")

if __name__ == '__main__':
    update_all_csvs()
