#!/usr/bin/env python3
import http.server
import socketserver
import json
import csv
import re
import urllib.parse
import urllib.request
import os
import sys
import math
from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import shutil

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
CSV_FILE = os.path.join(BASE_DIR, 'database', 'tarifario_villavicencio.csv')
PEDIDOS_FILE = os.path.join(BASE_DIR, 'database', 'pedidos.json')
CLIENTES_FILE = os.path.join(BASE_DIR, 'database', 'clientes.json')

def haversine_km(lat1, lon1, lat2, lon2):
    try:
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
        R = 6371.0  # Radio de la Tierra en km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c
    except Exception:
        return 99999.0

def geocode_address(direccion):
    if not direccion:
        return None
    try:
        query_str = urllib.parse.quote(f"{direccion}, Villavicencio, Meta, Colombia")
        url = f"https://nominatim.openstreetmap.org/search?q={query_str}&format=json&addressdetails=1&limit=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'DomiciliosRapidin/1.0'})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data and len(data) > 0:
                lat = float(data[0]['lat'])
                lon = float(data[0]['lon'])
                display_name = data[0].get('display_name', '')
                return {"lat": lat, "lon": lon, "display_name": display_name}
    except Exception as e:
        print(f"Geocoding info ({direccion}): {e}", file=sys.stderr)
    return None

def load_env():
    env_file = os.path.join(os.path.dirname(BASE_DIR), '.env')
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, val = line.split('=', 1)
                    os.environ[key.strip()] = val.strip()

load_env()
ADMIN_PIN = os.environ.get("ADMIN_PIN", "Rapidin123")
DEFAULT_CLIENT_CODE = os.environ.get("DEFAULT_CLIENT_CODE", "DomiRapidin")

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

def verify_password(password: str, hashed_value: str) -> bool:
    if not hashed_value or not hashed_value.startswith("pbkdf2:sha256:"):
        return False
    try:
        parts = hashed_value.split('$')
        if len(parts) != 3:
            return False
        meta = parts[0]
        iterations = int(meta.split(':')[-1])
        salt = parts[1]
        stored_hash = parts[2]
        
        dk = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            iterations
        )
        return dk.hex() == stored_hash
    except Exception:
        return False

ORIGEN_SEDE = {
    "nombre": "Sede Principal Rapidin - Centro",
    "direccion": "Calle 38 #31-42, Centro, Villavicencio, Meta",
    "latitud": 4.1488,
    "longitud": -73.6339
}

def load_spreadsheet_data(file_path=CSV_FILE):
    data = []
    if not os.path.exists(file_path):
        return data
    with open(file_path, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                base_t = int(row.get("tarifa_base", row.get("tarifa_total", 6000)))
                tot_t = int(row.get("tarifa_total", base_t))
                rec_t = int(row.get("recargo_distancia", 0))
                dist = float(row.get("distancia_aprox_km", row.get("distancia_km", 2.5)))
            except (ValueError, TypeError):
                base_t, tot_t, rec_t, dist = 6000, 6000, 0, 2.5

            data.append({
                "id": int(row.get("id", 1)),
                "barrio": row.get("barrio", "").strip(),
                "zona": row.get("zona", row.get("sector", "General")).strip(),
                "latitud": float(row.get("latitud", 4.1488)),
                "longitud": float(row.get("longitud", -73.6339)),
                "distancia_km": dist,
                "tarifa_base": base_t,
                "recargo_distancia": rec_t,
                "tarifa_total": tot_t,
                "tiempo_entrega_min": int(row.get("tiempo_entrega_min", 25))
            })
    return data

def save_spreadsheet_data(barrios_list, file_path=CSV_FILE):
    fieldnames = ["id", "barrio", "zona", "latitud", "longitud", "distancia_km", "tarifa_base", "recargo_distancia", "tarifa_total", "tiempo_entrega_min"]
    with open(file_path, mode='w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for idx, item in enumerate(barrios_list, 1):
            writer.writerow({
                "id": idx,
                "barrio": item.get("barrio", "").strip(),
                "zona": item.get("zona", "General").strip(),
                "latitud": float(item.get("latitud", 4.1488)),
                "longitud": float(item.get("longitud", -73.6339)),
                "distancia_km": float(item.get("distancia_km", 2.0)),
                "tarifa_base": int(item.get("tarifa_base", 6000)),
                "recargo_distancia": int(item.get("recargo_distancia", 1000)),
                "tarifa_total": int(item.get("tarifa_total", 7000)),
                "tiempo_entrega_min": int(item.get("tiempo_entrega_min", 20))
            })

from database_manager import load_clientes_db, save_clientes_db, get_pedidos_db, save_pedido_db, init_cloud_tables

# Inicializar esquemas de la nube si DATABASE_URL está configurado
init_cloud_tables()

def load_pedidos():
    return get_pedidos_db()

def save_pedidos(pedidos):
    if isinstance(pedidos, list) and len(pedidos) > 0:
        save_pedido_db(pedidos[0])
    elif isinstance(pedidos, dict):
        save_pedido_db(pedidos)

def load_clientes():
    return load_clientes_db()

def save_clientes(clientes):
    save_clientes_db(clientes)

class DomiciliosRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        # API Endpoints
        if path == '/api/clientes':
            clientes = load_clientes()
            self.send_json_response({"status": "success", "count": len(clientes), "data": clientes})
            return

        elif path == '/api/barrios':
            cliente_nombre = query.get('cliente', [''])[0].strip()
            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            
            csv_path = CSV_FILE
            if c and c.get("archivo_tarifario"):
                csv_path = os.path.join(BASE_DIR, 'database', c["archivo_tarifario"])

            barrios = load_spreadsheet_data(csv_path)
            q = query.get('q', [''])[0].lower().strip()
            if q:
                barrios = [b for b in barrios if q in b['barrio'].lower() or q in b['zona'].lower()]
            self.send_json_response({"status": "success", "count": len(barrios), "data": barrios})
            return

        elif path == '/api/cotizar':
            cliente_nombre = query.get('cliente', ['Mailys'])[0].strip()
            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            
            csv_path = CSV_FILE
            if c and c.get("archivo_tarifario"):
                csv_path = os.path.join(BASE_DIR, 'database', c["archivo_tarifario"])

            barrios = load_spreadsheet_data(csv_path)
            raw_query = (query.get('barrio', [''])[0] or query.get('direccion', [''])[0] or query.get('q', [''])[0]).strip()
            b_id = query.get('id', [''])[0].strip()
            explicit_dir = query.get('direccion', [''])[0].strip()

            target = None
            geo_res = None
            is_geocoded_proximity = False

            if b_id:
                target = next((b for b in barrios if str(b['id']) == b_id), None)

            # Detectar si el texto ingresado tiene estructura de dirección exacta (contiene números o prefijos de vía)
            is_address_like = bool(explicit_dir or re.search(r'\d+', raw_query) or any(k in raw_query.lower() for k in ['cl', 'calle', 'cra', 'carrera', 'diag', 'diagonal', 'tv', 'transversal', 'av', 'avenida', '#', 'apto', 'casa']))

            direccion_str = explicit_dir if explicit_dir else (raw_query if is_address_like else "")

            # 1. Si no hay ID, intentar encontrar coincidencia de barrio en la consulta
            if not target and raw_query:
                # Coincidencia exacta de barrio
                target = next((b for b in barrios if b['barrio'].lower() == raw_query.lower()), None)
                
                # Coincidencia parcial si no es exacta
                if not target and not is_address_like:
                    target = next((b for b in barrios if raw_query.lower() in b['barrio'].lower() or b['barrio'].lower() in raw_query.lower()), None)

                # Si la consulta incluye dirección, buscar si incluye el nombre de algún barrio de la lista
                if not target or is_address_like:
                    raw_lower = raw_query.lower()
                    barrios_sorted = sorted(barrios, key=lambda x: len(x['barrio']), reverse=True)
                    for b in barrios_sorted:
                        if b['barrio'].lower() in raw_lower:
                            target = b
                            break

            # 2. Si se detectó una dirección o sigue sin target, geocodificar con Nominatim
            if is_address_like or not target:
                query_to_geo = direccion_str or raw_query
                if query_to_geo:
                    geo_res = geocode_address(query_to_geo)
                    if geo_res:
                        # Encontrar el barrio más cercano espacialmente a las coordenadas de la dirección
                        closest_barrio = None
                        min_dist = float('inf')
                        for b in barrios:
                            dist = haversine_km(geo_res['lat'], geo_res['lon'], b['latitud'], b['longitud'])
                            if dist < min_dist:
                                min_dist = dist
                                closest_barrio = b
                        
                        if closest_barrio:
                            target = closest_barrio
                            is_geocoded_proximity = True

            if not target:
                err_msg = f"No se pudo ubicar ni calcular tarifa para '{raw_query}' en {cliente_nombre}."
                self.send_json_response({"status": "error", "message": err_msg}, status=404)
                return

            final_lat = geo_res['lat'] if geo_res else target['latitud']
            final_lon = geo_res['lon'] if geo_res else target['longitud']
            origen_payload = {
                "nombre": f"Sede Principal {c['nombre']}" if c else ORIGEN_SEDE['nombre'],
                "direccion": c.get("direccion_origen", ORIGEN_SEDE['direccion']) if c else ORIGEN_SEDE['direccion'],
                "latitud": c.get("latitud_origen", ORIGEN_SEDE['latitud']) if c else ORIGEN_SEDE['latitud'],
                "longitud": c.get("longitud_origen", ORIGEN_SEDE['longitud']) if c else ORIGEN_SEDE['longitud']
            }

            # Construir la búsqueda directa para Google Maps utilizando el nombre del barrio/lugar de la base de datos
            dest_text = direccion_str if direccion_str else f"{target['barrio']}, Villavicencio, Meta, Colombia"
            dest_query = urllib.parse.quote(dest_text)

            orig_addr = origen_payload.get('direccion', '')
            if orig_addr:
                orig_query = urllib.parse.quote(f"{orig_addr}, Villavicencio, Meta, Colombia")
            else:
                orig_query = f"{origen_payload['latitud']},{origen_payload['longitud']}"

            google_maps_url = (
                f"https://www.google.com/maps/dir/?api=1"
                f"&origin={orig_query}"
                f"&destination={dest_query}"
                f"&travelmode=driving"
            )

            # 3. Cálculo de Recargos Especiales (Nocturno y Lluvia)
            # Recargo Nocturno: 10:00 PM a 6:00 AM (Zona Horaria Colombia UTC-5)
            now_utc = datetime.now(timezone.utc)
            bogota_dt = now_utc - timedelta(hours=5)
            bogota_hour = bogota_dt.hour
            es_nocturno = bool(bogota_hour >= 22 or bogota_hour < 6)
            recargo_nocturno = 1000 if es_nocturno else 0

            # Recargo por Lluvia: Indicado por el cliente
            lluvia_param = query.get('lluvia', ['0'])[0].lower() or query.get('es_lluvia', ['0'])[0].lower()
            es_lluvia = bool(lluvia_param in ['1', 'true', 'si', 'yes', 'on'])
            recargo_lluvia = 1000 if es_lluvia else 0

            tarifa_barrio = target["tarifa_total"]
            tarifa_final = tarifa_barrio + recargo_nocturno + recargo_lluvia

            response_payload = {
                "status": "success",
                "cotizacion": {
                    "cliente": cliente_nombre,
                    "origen": origen_payload,
                    "destino": {
                        "id": target["id"],
                        "barrio": target["barrio"],
                        "zona": target["zona"],
                        "latitud": final_lat,
                        "longitud": final_lon,
                        "barrio_latitud": target["latitud"],
                        "barrio_longitud": target["longitud"]
                    },
                    "direccion_exacta": direccion_str if direccion_str else None,
                    "barrio_asignado_cercano": target["barrio"] if is_geocoded_proximity else None,
                    "distancia_km": target["distancia_km"],
                    "tarifa_base": target["tarifa_base"],
                    "recargo_distancia": target["recargo_distancia"],
                    "tarifa_barrio": tarifa_barrio,
                    "es_nocturno": es_nocturno,
                    "recargo_nocturno": recargo_nocturno,
                    "es_lluvia": es_lluvia,
                    "recargo_lluvia": recargo_lluvia,
                    "tarifa_total": tarifa_final,
                    "tiempo_entrega_min": target["tiempo_entrega_min"],
                    "moneda": "COP",
                    "google_maps_url": google_maps_url
                }
            }
            self.send_json_response(response_payload)
            return

        elif path == '/api/hoja-calculo':
            cliente_nombre = query.get('cliente', [''])[0].strip()
            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            
            csv_path = CSV_FILE
            if c and c.get("archivo_tarifario"):
                csv_path = os.path.join(BASE_DIR, 'database', c["archivo_tarifario"])

            barrios = load_spreadsheet_data(csv_path)
            self.send_json_response({
                "status": "success",
                "archivo": os.path.relpath(csv_path, BASE_DIR),
                "filas": len(barrios),
                "data": barrios
            })
            return

        elif path == '/api/pedidos':
            pedidos = load_pedidos()
            cliente_nombre = query.get('cliente', [''])[0].strip().lower()
            if cliente_nombre and cliente_nombre not in ["administrador", "admin"]:
                pedidos = [p for p in pedidos if cliente_nombre in p.get('cliente_empresa', '').lower()]
            self.send_json_response({"status": "success", "data": pedidos})
            return

        # Servir archivos estáticos del frontend
        self.serve_static_file(path)

    def serve_static_file(self, rel_path):
        if rel_path == '/' or not rel_path:
            rel_path = '/index.html'

        safe_path = os.path.normpath(rel_path.lstrip('/'))
        full_path = os.path.join(FRONTEND_DIR, safe_path)

        if not os.path.exists(full_path) or os.path.isdir(full_path):
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b"<h1>404 File Not Found</h1>")
            return

        content_type = "text/html; charset=utf-8"
        if full_path.endswith('.css'):
            content_type = "text/css; charset=utf-8"
        elif full_path.endswith('.js'):
            content_type = "application/javascript; charset=utf-8"
        elif full_path.endswith('.json'):
            content_type = "application/json; charset=utf-8"
        elif full_path.endswith('.png'):
            content_type = "image/png"
        elif full_path.endswith('.jpg') or full_path.endswith('.jpeg'):
            content_type = "image/jpeg"
        elif full_path.endswith('.svg'):
            content_type = "image/svg+xml"

        try:
            with open(full_path, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        except Exception as e:
            self.send_response(500)
            self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        try:
            payload = json.loads(post_data.decode('utf-8')) if post_data else {}
        except Exception as e:
            self.send_json_response({"status": "error", "message": "JSON inválido"}, status=400)
            return

        if path == '/api/admin/login':
            pin = payload.get("pin", "").strip()
            if pin == ADMIN_PIN:
                self.send_json_response({
                    "status": "success",
                    "message": "Autenticación administrativa concedida",
                    "role": "admin"
                })
            else:
                self.send_json_response({"status": "error", "message": "Clave administrativa incorrecta."}, status=401)
            return

        elif path == '/api/clientes/login':
            usuario_o_nombre = payload.get("usuario", payload.get("nombre", "")).strip()
            codigo = payload.get("codigo", "").strip()

            if not usuario_o_nombre:
                self.send_json_response({"status": "error", "message": "El nombre de usuario o nombre del negocio es obligatorio."}, status=400)
                return

            if not codigo:
                self.send_json_response({"status": "error", "message": "El código o contraseña del negocio es obligatorio."}, status=400)
                return

            if usuario_o_nombre.lower() in ["admin", "administrador"] and codigo == ADMIN_PIN:
                self.send_json_response({
                    "status": "success",
                    "message": "Acceso verificado correctamente para Administrador",
                    "cliente": {
                        "id": "ADMIN",
                        "nombre": "Administrador",
                        "usuario": "admin",
                        "rol": "admin"
                    }
                })
                return

            clientes = load_clientes()
            existente = next((c for c in clientes if c.get("usuario", "").lower() == usuario_o_nombre.lower() or c.get("nombre", "").lower() == usuario_o_nombre.lower() or c.get("slug", "").lower() == usuario_o_nombre.lower() or c.get("id", "").lower() == usuario_o_nombre.lower()), None)

            if existente:
                codigo_valido = existente.get("codigo_acceso", DEFAULT_CLIENT_CODE)
                is_valid = False
                needs_migration = False
                
                if codigo_valido.startswith("pbkdf2:sha256:"):
                    if verify_password(codigo, codigo_valido):
                        is_valid = True
                else:
                    if codigo == codigo_valido:
                        is_valid = True
                        needs_migration = True
                
                if not is_valid:
                    self.send_json_response({"status": "error", "message": "Contraseña o código de acceso incorrecto."}, status=401)
                    return
                
                if needs_migration:
                    existente["codigo_acceso"] = hash_password(codigo if codigo != ADMIN_PIN else DEFAULT_CLIENT_CODE)
                    save_clientes(clientes)
                
                cliente_actual = existente
            else:
                if codigo != DEFAULT_CLIENT_CODE and codigo != ADMIN_PIN:
                    self.send_json_response({"status": "error", "message": "Contraseña o código de activación incorrecto."}, status=401)
                    return

                import random
                while True:
                    candidate = f"{random.randint(100000, 999999)}"
                    found = False
                    for c in clientes:
                        db_code = c.get("codigo_acceso", "")
                        if db_code == candidate or (db_code.startswith("pbkdf2:") and verify_password(candidate, db_code)):
                            found = True
                            break
                    if not found:
                        unique_code = candidate
                        break

                client_id = f"CLI-{len(clientes)+1:03d}"
                if nombre.lower() == "mailys":
                    archivo_csv = "tarifario_villavicencio.csv"
                else:
                    archivo_csv = f"tarifario_{client_id.lower().replace('-', '_')}.csv"
                    template_path = CSV_FILE
                    dest_path = os.path.join(BASE_DIR, 'database', archivo_csv)
                    if os.path.exists(template_path) and not os.path.exists(dest_path):
                        shutil.copy(template_path, dest_path)

                nuevo_cliente = {
                    "id": client_id,
                    "nombre": nombre,
                    "codigo_acceso": hash_password(unique_code),
                    "direccion": payload.get("direccion", "Calle 38 #31-42, Centro - Villavicencio"),
                    "latitud": 4.1488,
                    "longitud": -73.6339,
                    "tipo": payload.get("tipo", "Negocio Corporativo"),
                    "archivo_tarifario": archivo_csv
                }
                clientes.append(nuevo_cliente)
                save_clientes(clientes)
                
                cliente_retorno = nuevo_cliente.copy()
                cliente_retorno["codigo_acceso_texto"] = unique_code

                self.send_json_response({
                    "status": "success",
                    "message": f"Acceso verificado correctamente para {nuevo_cliente['nombre']}",
                    "cliente": cliente_retorno
                })
                return

            self.send_json_response({
                "status": "success",
                "message": f"Acceso verificado correctamente para {cliente_actual['nombre']}",
                "cliente": cliente_actual
            })
            return

        elif path == '/api/clientes/save':
            nuevos_clientes = payload.get("clientes", [])
            if isinstance(nuevos_clientes, list):
                clientes_actuales = load_clientes()
                clientes_actuales_dict = {c["id"]: c for c in clientes_actuales}
                
                for c in nuevos_clientes:
                    client_id = c.get("id")
                    new_code = c.get("codigo_acceso", "").strip()
                    
                    if new_code == "••••••••" and client_id in clientes_actuales_dict:
                        c["codigo_acceso"] = clientes_actuales_dict[client_id].get("codigo_acceso", DEFAULT_CLIENT_CODE)
                        c["archivo_tarifario"] = clientes_actuales_dict[client_id].get("archivo_tarifario", "tarifario_villavicencio.csv")
                    elif not new_code:
                        c["codigo_acceso"] = hash_password(DEFAULT_CLIENT_CODE)
                    elif not new_code.startswith("pbkdf2:sha256:"):
                        c["codigo_acceso"] = hash_password(new_code)

                    # Sincronizar dirección y coordenadas
                    addr = c.get("direccion_origen") or c.get("direccion") or "Calle 38 #31-42, Centro - Villavicencio"
                    c["direccion_origen"] = addr
                    c["direccion"] = addr

                    # Ensure latitud and longitud are floats
                    for coord_field, default_val in [("latitud_origen", 4.1488), ("longitud_origen", -73.6339), ("latitud", 4.1488), ("longitud", -73.6339)]:
                        val = c.get(coord_field)
                        try:
                            c[coord_field] = float(val) if val is not None else default_val
                        except (ValueError, TypeError):
                            c[coord_field] = default_val

                    # Assign archivo_tarifario if not present
                    if not c.get("archivo_tarifario"):
                        if c.get("nombre", "").lower() == "mailys":
                            archivo_csv = "tarifario_villavicencio.csv"
                        else:
                            archivo_csv = f"tarifario_{client_id.lower().replace('-', '_')}.csv"
                            template_path = CSV_FILE
                            dest_path = os.path.join(BASE_DIR, 'database', archivo_csv)
                            if os.path.exists(template_path) and not os.path.exists(dest_path):
                                shutil.copy(template_path, dest_path)
                        c["archivo_tarifario"] = archivo_csv
                
                save_clientes(nuevos_clientes)
                self.send_json_response({"status": "success", "message": "Base de datos de negocios actualizada con éxito."})
                return
            self.send_json_response({"status": "error", "message": "Payload inválido"}, status=400)
            return

        elif path == '/api/clientes/update-address':
            cliente_nombre = payload.get("cliente", "").strip()
            nueva_direccion = payload.get("direccion", "").strip()

            if not cliente_nombre or not nueva_direccion:
                self.send_json_response({"status": "error", "message": "Datos incompletos para actualizar la dirección."}, status=400)
                return

            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            if not c:
                self.send_json_response({"status": "error", "message": f"Negocio '{cliente_nombre}' no encontrado."}, status=404)
                return

            c["direccion_origen"] = nueva_direccion
            c["direccion"] = nueva_direccion
            save_clientes(clientes)

            self.send_json_response({
                "status": "success",
                "message": "Dirección de origen actualizada con éxito.",
                "direccion": nueva_direccion
            })
            return

        elif path == '/api/clientes/update-profile':
            cliente_nombre = payload.get("cliente", "").strip()
            if not cliente_nombre:
                self.send_json_response({"status": "error", "message": "Nombre de cliente requerido."}, status=400)
                return

            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            if not c:
                self.send_json_response({"status": "error", "message": f"Negocio '{cliente_nombre}' no encontrado."}, status=404)
                return

            if "descripcion" in payload:
                c["descripcion"] = str(payload["descripcion"])[:280]
            if "categoria" in payload:
                c["categoria"] = str(payload["categoria"])[:80]
            if "direccion" in payload and str(payload["direccion"]).strip():
                addr_str = str(payload["direccion"]).strip()
                c["direccion_origen"] = addr_str
                c["direccion"] = addr_str
            if "foto_perfil" in payload:
                foto = payload["foto_perfil"]
                if isinstance(foto, str) and (foto.startswith("data:image") or foto == ""):
                    c["foto_perfil"] = foto

            save_clientes(clientes)
            self.send_json_response({
                "status": "success",
                "message": "Perfil actualizado con éxito.",
                "cliente": c
            })
            return

        elif path == '/api/pedidos':
            pedidos = load_pedidos()
            nuevo_pedido = {
                "id": f"DOM-{int(datetime.now().timestamp())}",
                "cliente_empresa": payload.get("cliente_empresa", "Cliente Corporativo"),
                "barrio_destino": payload.get("barrio_destino", ""),
                "direccion_destino": payload.get("direccion_destino", ""),
                "notas": payload.get("notas", ""),
                "tarifa_total": payload.get("tarifa_total", 0),
                "distancia_km": payload.get("distancia_km", 0),
                "fecha": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "estado": "Confirmado"
            }
            pedidos.insert(0, nuevo_pedido)
            save_pedidos(pedidos)
            self.send_json_response({"status": "success", "pedido": nuevo_pedido})
            return

        elif path == '/api/pedidos/delete':
            pedido_id = payload.get("id", "").strip()
            if not pedido_id:
                self.send_json_response({"status": "error", "message": "ID de pedido no especificado"}, status=400)
                return

            pedidos = load_pedidos()
            filtered_pedidos = [p for p in pedidos if p.get("id") != pedido_id]
            if len(filtered_pedidos) == len(pedidos):
                self.send_json_response({"status": "error", "message": "Pedido no encontrado"}, status=404)
                return

            save_pedidos(filtered_pedidos)
            self.send_json_response({"status": "success", "message": "Solicitud de domicilio eliminada exitosamente"})
            return

        elif path == '/api/hoja-calculo':
            cliente_nombre = query.get('cliente', [''])[0].strip()
            clientes = load_clientes()
            c = next((cl for cl in clientes if cl["nombre"].lower() == cliente_nombre.lower()), None)
            
            csv_path = CSV_FILE
            if c and c.get("archivo_tarifario"):
                csv_path = os.path.join(BASE_DIR, 'database', c["archivo_tarifario"])

            nueva_lista = payload.get("barrios", [])
            if not isinstance(nueva_lista, list):
                self.send_json_response({"status": "error", "message": "Se requiere una lista de barrios"}, status=400)
                return
            
            save_spreadsheet_data(nueva_lista, csv_path)
            self.send_json_response({"status": "success", "message": "Hoja de cálculo actualizada con éxito", "filas": len(nueva_lista)})
            return

        self.send_json_response({"status": "error", "message": "Endpoint no existe"}, status=404)

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    print(f"Servidor DomiciliosRapidin iniciado en puerto {PORT}...")
    print(f"Carpeta estática: {FRONTEND_DIR}")
    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer(("0.0.0.0", PORT), DomiciliosRequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
