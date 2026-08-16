#!/usr/bin/env python3
"""
Script de Migración de Base de Datos para Supabase / PostgreSQL
Migra automáticamente los 45 negocios de clientes.json y sus tablas CSV hacia la base de datos en la nube.
Uso: python3 backend/init_supabase.py [DATABASE_URL]
"""

import os
import sys
import csv
import json
import urllib.parse
from database_manager import get_pg_connection, init_cloud_tables, CLIENTES_FILE, BASE_DIR

def sql_quote(val):
    if val is None:
        return 'NULL'
    clean = str(val).replace("'", "''")
    return f"'{clean}'"

def migrate():
    print("🚀 Iniciando migración a Supabase / PostgreSQL...")

    import re
    # Permitir pasar la URL por argumento de consola si no está en la variable de entorno
    if len(sys.argv) > 1 and "postgres" in sys.argv[1]:
        clean_url = re.sub(r':\[(.*?)\]@', r':\1@', sys.argv[1].strip())
        os.environ["DATABASE_URL"] = clean_url

    db_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL") or os.environ.get("POSTGRES_URL")
    if not db_url:
        print("❌ Error: No se encontró la variable DATABASE_URL.")
        print("Por favor ejecuta el comando pasando tu enlace de Supabase de la siguiente forma:")
        print("python3 backend/init_supabase.py \"postgresql://postgres:TU_CONTRASEÑA@db.xxx.supabase.co:5432/postgres\"")
        return

    # Inicializar las tablas
    print("📋 Verificando esquemas de tablas en la nube...")
    if not init_cloud_tables():
        print("❌ No se pudo inicializar las tablas en la nube. Revisa la URL y contraseña.")
        print("💡 CONSEJO: Asegúrate de quitar los corchetes [ ] de la contraseña al pegar la URL.")
        return

    # Cargar clientes locales
    if not os.path.exists(CLIENTES_FILE):
        print(f"❌ No se encontró el archivo local {CLIENTES_FILE}.")
        return

    with open(CLIENTES_FILE, 'r', encoding='utf-8') as f:
        clientes = json.load(f)

    print(f"📦 Migrando {len(clientes)} negocios corporativos a Supabase...")

    conn = get_pg_connection()
    if not conn:
        print("❌ Falló la conexión con la base de datos.")
        return

    # Migrar Clientes
    migrated_clients = 0
    for c in clientes:
        slug = c.get("slug", c["nombre"].lower().replace(' ', '_'))
        c_id = sql_quote(c.get("id"))
        nombre = sql_quote(c.get("nombre"))
        c_slug = sql_quote(slug)
        codigo = sql_quote(c.get("codigo_acceso"))
        nit = sql_quote(c.get("nit"))
        tipo = sql_quote(c.get("tipo"))
        dir_origen = sql_quote(c.get("direccion_origen"))
        lat_origen = c.get("latitud_origen", 4.1488) or 4.1488
        lng_origen = c.get("longitud_origen", -73.6339) or -73.6339
        archivo = sql_quote(c.get("archivo_tarifario"))
        total_barrios = c.get("total_barrios", 0) or 0
        direccion = sql_quote(c.get("direccion"))
        lat = c.get("latitud", 4.1488) or 4.1488
        lng = c.get("longitud", -73.6339) or -73.6339
        foto = sql_quote(c.get("foto_perfil"))
        desc = sql_quote(c.get("descripcion"))
        cat = sql_quote(c.get("categoria"))

        query_client = f"""
        INSERT INTO clientes (id, nombre, slug, codigo_acceso, nit, tipo, direccion_origen, latitud_origen, longitud_origen, archivo_tarifario, total_barrios, direccion, latitud, longitud, foto_perfil, descripcion, categoria)
        VALUES ({c_id}, {nombre}, {c_slug}, {codigo}, {nit}, {tipo}, {dir_origen}, {lat_origen}, {lng_origen}, {archivo}, {total_barrios}, {direccion}, {lat}, {lng}, {foto}, {desc}, {cat})
        ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            slug = EXCLUDED.slug,
            codigo_acceso = EXCLUDED.codigo_acceso,
            nit = EXCLUDED.nit,
            tipo = EXCLUDED.tipo,
            direccion_origen = EXCLUDED.direccion_origen,
            latitud_origen = EXCLUDED.latitud_origen,
            longitud_origen = EXCLUDED.longitud_origen,
            archivo_tarifario = EXCLUDED.archivo_tarifario,
            total_barrios = EXCLUDED.total_barrios,
            direccion = EXCLUDED.direccion,
            latitud = EXCLUDED.latitud,
            longitud = EXCLUDED.longitud,
            foto_perfil = EXCLUDED.foto_perfil,
            descripcion = EXCLUDED.descripcion,
            categoria = EXCLUDED.categoria;
        """
        conn.run(query_client)
        migrated_clients += 1

        # Migrar tarifario CSV si existe
        csv_file = c.get("archivo_tarifario", "tarifario_villavicencio.csv")
        csv_path = os.path.join(BASE_DIR, 'database', csv_file)

        if os.path.exists(csv_path):
            with open(csv_path, 'r', encoding='utf-8') as csv_f:
                reader = csv.DictReader(csv_f)
                rows = list(reader)

                # Limpiar tarifas previas de este slug
                conn.run(f"DELETE FROM tarifas WHERE cliente_slug = {c_slug};")

                batch_inserts = []
                for r in rows:
                    try:
                        base = int(r.get('tarifa_base', r.get('tarifa_total', 6000)))
                        tot = int(r.get('tarifa_total', base))
                    except ValueError:
                        base, tot = 6000, 6000

                    sector = sql_quote(r.get('sector', r.get('zona', 'SECTOR GENERAL')))
                    barrio = sql_quote(r.get('barrio', ''))

                    if not r.get('barrio', '').strip():
                        continue

                    batch_inserts.append(f"({c_slug}, {sector}, {barrio}, {base}, {tot})")

                # Insertar en lotes de 100 registros para alta velocidad
                for chunk_idx in range(0, len(batch_inserts), 100):
                    chunk = batch_inserts[chunk_idx : chunk_idx + 100]
                    query_tarifa = f"""
                    INSERT INTO tarifas (cliente_slug, sector, barrio, tarifa_base, tarifa_total)
                    VALUES {','.join(chunk)};
                    """
                    conn.run(query_tarifa)

    conn.close()
    print(f"🎉 MIGRACION EXITOSA: Se migraron {migrated_clients} negocios y todas sus tablas de precios hacia Supabase / PostgreSQL.")

if __name__ == "__main__":
    migrate()
