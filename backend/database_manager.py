#!/usr/bin/env python3
"""
DomiciliosRapidin - Multi-Mode Database Manager
Supports local JSON/CSV files and Cloud PostgreSQL (Supabase / Render / ElephantSQL)
"""

import os
import sys
import re
import json
import shutil
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LIB_DIR = os.path.join(BASE_DIR, 'lib')
if os.path.exists(LIB_DIR) and LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

CLIENTES_FILE = os.path.join(BASE_DIR, 'database', 'clientes.json')
PEDIDOS_FILE = os.path.join(BASE_DIR, 'database', 'pedidos.json')
CSV_FILE = os.path.join(BASE_DIR, 'database', 'tarifario_villavicencio.csv')

# Intentar cargar conector de PostgreSQL si está disponible (pg8000 o psycopg2)
pg8000 = None
psycopg2 = None
try:
    import pg8000.native
except ImportError:
    try:
        import psycopg2
    except ImportError:
        try:
            import subprocess
            subprocess.run([sys.executable, "-m", "pip", "install", "pg8000", "--break-system-packages", "--user"], capture_output=True)
            import pg8000.native
        except Exception:
            pass

def get_db_url():
    """ Retorna la URL de la base de datos de PostgreSQL desde el entorno si existe """
    raw_url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL") or os.environ.get("POSTGRES_URL")
    if raw_url:
        # Limpiar corchetes accidentales en la contraseña si el usuario escribió :[password]@
        raw_url = re.sub(r':\[(.*?)\]@', r':\1@', raw_url)
    return raw_url

import ssl

def get_pg_connection():
    """ Intenta conectar a PostgreSQL usando la URL del entorno """
    db_url = get_db_url()
    if not db_url:
        return None

    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    # Probar con pg8000
    if pg8000:
        parsed = urllib.parse.urlparse(db_url)
        # Intento 1: Con SSL Context
        try:
            conn = pg8000.native.Connection(
                user=parsed.username or "postgres",
                host=parsed.hostname,
                port=parsed.port or 5432,
                database=parsed.path.lstrip('/') or "postgres",
                password=urllib.parse.unquote(parsed.password or ""),
                timeout=8,
                ssl_context=ssl_ctx
            )
            return conn
        except Exception:
            pass

        # Intento 2: Conexión directa / Pooler
        try:
            conn = pg8000.native.Connection(
                user=parsed.username or "postgres",
                host=parsed.hostname,
                port=parsed.port or 5432,
                database=parsed.path.lstrip('/') or "postgres",
                password=urllib.parse.unquote(parsed.password or ""),
                timeout=8,
                ssl_context=None
            )
            return conn
        except Exception as e:
            print(f"⚠️ Error conectando con pg8000 ({db_url[:25]}...): {e}", file=sys.stderr)

    # Probar con psycopg2 como alternativa
    if psycopg2:
        try:
            conn = psycopg2.connect(db_url, sslmode='require')
            return conn
        except Exception as e:
            print(f"⚠️ Error conectando con psycopg2: {e}", file=sys.stderr)

    return None

def init_cloud_tables():
    """ Crea las tablas necesarias en la base de datos en la nube si no existen """
    conn = get_pg_connection()
    if not conn:
        return False

    try:
        conn.run("""
        CREATE TABLE IF NOT EXISTS clientes (
            id VARCHAR(50) PRIMARY KEY,
            nombre VARCHAR(255) NOT NULL,
            usuario VARCHAR(255),
            slug VARCHAR(255) NOT NULL,
            codigo_acceso TEXT NOT NULL,
            nit VARCHAR(50),
            tipo VARCHAR(100),
            direccion_origen TEXT,
            latitud_origen FLOAT,
            longitud_origen FLOAT,
            archivo_tarifario VARCHAR(255),
            total_barrios INT DEFAULT 0,
            direccion TEXT,
            latitud FLOAT,
            longitud FLOAT,
            foto_perfil TEXT,
            descripcion TEXT,
            categoria VARCHAR(100)
        );
        ALTER TABLE clientes ADD COLUMN IF NOT EXISTS usuario VARCHAR(255);
        """)

        conn.run("""
        CREATE TABLE IF NOT EXISTS tarifas (
            id SERIAL PRIMARY KEY,
            cliente_slug VARCHAR(255) NOT NULL,
            sector VARCHAR(255),
            barrio VARCHAR(255) NOT NULL,
            tarifa_base INT DEFAULT 6000,
            tarifa_total INT DEFAULT 6000
        );
        """)

        conn.run("""
        CREATE TABLE IF NOT EXISTS pedidos (
            id VARCHAR(100) PRIMARY KEY,
            cliente_empresa VARCHAR(255) NOT NULL,
            barrio_destino VARCHAR(255) NOT NULL,
            direccion_destino TEXT,
            notas TEXT,
            tarifa_total INT DEFAULT 0,
            distancia_km FLOAT DEFAULT 0.0,
            whatsapp_destino VARCHAR(50),
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.close()
        print("✅ Tablas de Supabase / PostgreSQL verificadas correctamente.", file=sys.stderr)
        return True
    except Exception as e:
        print(f"❌ Error al inicializar tablas en la nube: {e}", file=sys.stderr)
        return False

def load_clientes_db():
    """ Carga los clientes desde PostgreSQL o desde clientes.json local """
    conn = get_pg_connection()
    if conn:
        try:
            rows = conn.run("SELECT id, nombre, usuario, slug, codigo_acceso, nit, tipo, direccion_origen, latitud_origen, longitud_origen, archivo_tarifario, total_barrios, direccion, latitud, longitud, foto_perfil, descripcion, categoria FROM clientes ORDER BY id ASC;")
            conn.close()
            clientes = []
            for r in rows:
                clientes.append({
                    "id": r[0],
                    "nombre": r[1],
                    "usuario": r[2] or f"user_{r[3]}",
                    "slug": r[3],
                    "codigo_acceso": r[4],
                    "nit": r[5],
                    "tipo": r[6],
                    "direccion_origen": r[7],
                    "latitud_origen": r[8],
                    "longitud_origen": r[9],
                    "archivo_tarifario": r[10],
                    "total_barrios": r[11] or 0,
                    "direccion": r[12] or r[7],
                    "latitud": r[13] or r[8],
                    "longitud": r[14] or r[9],
                    "foto_perfil": r[15],
                    "descripcion": r[16],
                    "categoria": r[17]
                })
            return clientes
        except Exception as e:
            print(f"⚠️ Error leyendo clientes de la nube, usando fallback local: {e}", file=sys.stderr)

    # Fallback local
    if os.path.exists(CLIENTES_FILE):
        try:
            with open(CLIENTES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_clientes_db(clientes_list):
    """ Guarda la lista de clientes en PostgreSQL y en clientes.json local """
    # Guardar local primero
    try:
        with open(CLIENTES_FILE, 'w', encoding='utf-8') as f:
            json.dump(clientes_list, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error al guardar clientes local: {e}", file=sys.stderr)

    conn = get_pg_connection()
    if conn:
        try:
            for c in clientes_list:
                slug_val = c.get("slug", c.get("nombre","").lower().replace(' ','_'))
                user_val = c.get("usuario", f"user_{slug_val}")
                conn.run("""
                INSERT INTO clientes (id, nombre, usuario, slug, codigo_acceso, nit, tipo, direccion_origen, latitud_origen, longitud_origen, archivo_tarifario, total_barrios, direccion, latitud, longitud, foto_perfil, descripcion, categoria)
                VALUES (:id, :nombre, :usuario, :slug, :codigo_acceso, :nit, :tipo, :direccion_origen, :latitud_origen, :longitud_origen, :archivo_tarifario, :total_barrios, :direccion, :latitud, :longitud, :foto_perfil, :descripcion, :categoria)
                ON CONFLICT (id) DO UPDATE SET
                    nombre = EXCLUDED.nombre,
                    usuario = EXCLUDED.usuario,
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
                """, id=c.get("id"), nombre=c.get("nombre"), usuario=user_val, slug=slug_val,
                codigo_acceso=c.get("codigo_acceso"), nit=c.get("nit"), tipo=c.get("tipo"),
                direccion_origen=c.get("direccion_origen"), latitud_origen=c.get("latitud_origen"), longitud_origen=c.get("longitud_origen"),
                archivo_tarifario=c.get("archivo_tarifario"), total_barrios=c.get("total_barrios", 0),
                direccion=c.get("direccion"), latitud=c.get("latitud"), longitud=c.get("longitud"),
                foto_perfil=c.get("foto_perfil"), descripcion=c.get("descripcion"), categoria=c.get("categoria"))
            conn.close()
            print("✅ Clientes sincronizados con la nube (Supabase / PostgreSQL).", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Error al guardar clientes en la nube: {e}", file=sys.stderr)

def get_pedidos_db():
    """ Carga pedidos desde la nube o desde pedidos.json local """
    conn = get_pg_connection()
    if conn:
        try:
            rows = conn.run("SELECT id, cliente_empresa, barrio_destino, direccion_destino, notas, tarifa_total, distancia_km, whatsapp_destino, fecha_creacion FROM pedidos ORDER BY fecha_creacion DESC;")
            conn.close()
            pedidos = []
            for r in rows:
                pedidos.append({
                    "id": r[0],
                    "cliente_empresa": r[1],
                    "barrio_destino": r[2],
                    "direccion_destino": r[3],
                    "notas": r[4],
                    "tarifa_total": r[5],
                    "distancia_km": r[6],
                    "whatsapp_destino": r[7],
                    "fecha_creacion": str(r[8])
                })
            return pedidos
        except Exception as e:
            print(f"⚠️ Error leyendo pedidos de la nube: {e}", file=sys.stderr)

    if os.path.exists(PEDIDOS_FILE):
        try:
            with open(PEDIDOS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return []

def save_pedido_db(pedido):
    """ Guarda un nuevo pedido en la nube y localmente """
    pedidos = get_pedidos_db()
    pedidos.insert(0, pedido)
    try:
        with open(PEDIDOS_FILE, 'w', encoding='utf-8') as f:
            json.dump(pedidos, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error guardando pedido local: {e}", file=sys.stderr)

    conn = get_pg_connection()
    if conn:
        try:
            conn.run("""
            INSERT INTO pedidos (id, cliente_empresa, barrio_destino, direccion_destino, notas, tarifa_total, distancia_km, whatsapp_destino)
            VALUES (:id, :cliente_empresa, :barrio_destino, :direccion_destino, :notas, :tarifa_total, :distancia_km, :whatsapp_destino);
            """, id=pedido.get("id"), cliente_empresa=pedido.get("cliente_empresa"), barrio_destino=pedido.get("barrio_destino"),
            direccion_destino=pedido.get("direccion_destino"), notas=pedido.get("notas"), tarifa_total=pedido.get("tarifa_total"),
            distancia_km=pedido.get("distancia_km"), whatsapp_destino=pedido.get("whatsapp_destino"))
            conn.close()
            print("✅ Pedido guardado en la nube.", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Error guardando pedido en la nube: {e}", file=sys.stderr)

def load_tarifas_db(cliente_slug):
    """ Carga la lista de tarifas de un cliente directamente desde Supabase / PostgreSQL """
    conn = get_pg_connection()
    if conn and cliente_slug:
        try:
            parsed_slug = str(cliente_slug).strip()
            rows = conn.run(
                "SELECT sector, barrio, tarifa_base, tarifa_total FROM tarifas WHERE cliente_slug = :slug ORDER BY id ASC;",
                slug=parsed_slug
            )
            conn.close()
            if rows and len(rows) > 0:
                barrios = []
                for r in rows:
                    sec = r[0] or "SECTOR GENERAL"
                    barrio = r[1] or ""
                    base_t = r[2] if r[2] is not None else 6000
                    tot_t = r[3] if r[3] is not None else base_t
                    rec_t = max(0, tot_t - base_t)
                    barrios.append({
                        "sector": sec,
                        "barrio": barrio,
                        "zona": sec,
                        "tarifa_base": base_t,
                        "recargo_distancia": rec_t,
                        "tarifa_total": tot_t,
                        "sin_cobertura": (tot_t == 0)
                    })
                return barrios
        except Exception as e:
            print(f"⚠️ Error leyendo tarifas de Supabase para '{cliente_slug}': {e}", file=sys.stderr)
    return None

def save_tarifas_db(cliente_slug, barrios_list):
    """ Sincroniza en tiempo real la lista de tarifas de un cliente con Supabase PostgreSQL """
    conn = get_pg_connection()
    if conn and cliente_slug:
        try:
            parsed_slug = str(cliente_slug).strip()

            def sql_quote(v):
                if v is None:
                    return "NULL"
                s = str(v).replace("'", "''")
                return f"'{s}'"

            c_slug = sql_quote(parsed_slug)
            conn.run(f"DELETE FROM tarifas WHERE cliente_slug = {c_slug};")

            batch_inserts = []
            for r in barrios_list:
                b_name = r.get("barrio", "").strip()
                if not b_name:
                    continue
                sec = sql_quote(r.get("sector", r.get("zona", "SECTOR GENERAL")))
                barrio = sql_quote(b_name)
                
                try:
                    base = int(r.get("tarifa_base", 6000))
                    tot = int(r.get("tarifa_total", base))
                except Exception:
                    base, tot = 6000, 6000

                batch_inserts.append(f"({c_slug}, {sec}, {barrio}, {base}, {tot})")

            for chunk_idx in range(0, len(batch_inserts), 100):
                chunk = batch_inserts[chunk_idx : chunk_idx + 100]
                query_tarifa = f"""
                INSERT INTO tarifas (cliente_slug, sector, barrio, tarifa_base, tarifa_total)
                VALUES {','.join(chunk)};
                """
                conn.run(query_tarifa)
            conn.close()
            print(f"✅ {len(barrios_list)} tarifas sincronizadas en Supabase para '{cliente_slug}'.", file=sys.stderr)
            return True
        except Exception as e:
            print(f"⚠️ Error al guardar tarifas en Supabase para '{cliente_slug}': {e}", file=sys.stderr)
    return False
