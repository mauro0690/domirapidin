#!/usr/bin/env python3
import urllib.request
import json
import time
import subprocess
import os

BASE_URL = "http://127.0.0.1:8080"

def get_opener():
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))

def ensure_server_running():
    opener = get_opener()
    try:
        req = opener.open(f"{BASE_URL}/api/barrios")
        return None
    except Exception:
        # Servidor no respondiendo en 8080, inicie el proceso
        base_dir = os.path.dirname(os.path.abspath(__file__))
        server_script = os.path.join(base_dir, 'server.py')
        p = subprocess.Popen(['python3', server_script])
        time.sleep(1.5)
        return p

def run_tests():
    proc = ensure_server_running()
    print("Iniciando pruebas de la API DomiciliosRapidin...")
    opener = get_opener()
    
    try:
        # 1. Test /api/barrios
        req = opener.open(f"{BASE_URL}/api/barrios")
        res = json.loads(req.read().decode('utf-8'))
        assert res["status"] == "success", "Error en /api/barrios"
        assert res["count"] > 0, "No hay barrios en la base de datos"
        print(f"✅ /api/barrios OK: {res['count']} barrios encontrados.")

        # 2. Test /api/cotizar?barrio=Amarilo
        req = opener.open(f"{BASE_URL}/api/cotizar?barrio=Amarilo")
        res = json.loads(req.read().decode('utf-8'))
        assert res["status"] == "success", "Error en /api/cotizar"
        cot = res["cotizacion"]
        assert "amarilo" in cot["destino"]["barrio"].lower(), "Barrio retornado no contiene Amarilo"
        assert "google_maps_url" in cot, "URL de Google Maps no generada"
        print(f"✅ /api/cotizar?barrio=Amarilo OK: Tarifa ${cot['tarifa_total']:,} COP | Distancia {cot['distancia_km']} km.")

        # 3. Test /api/hoja-calculo
        req = opener.open(f"{BASE_URL}/api/hoja-calculo")
        res = json.loads(req.read().decode('utf-8'))
        assert res["status"] == "success", "Error en /api/hoja-calculo"
        print(f"✅ /api/hoja-calculo OK: Base de datos CSV de {res['filas']} filas leída correctamente.")

        # 4. Test /api/pedidos
        req = opener.open(f"{BASE_URL}/api/pedidos")
        res = json.loads(req.read().decode('utf-8'))
        assert res["status"] == "success", "Error en /api/pedidos"
        print(f"✅ /api/pedidos OK: {len(res['data'])} pedidos cargados.")

        print("\n🎉 TODAS LAS PRUEBAS DE LA API PASARON EXITOSAMENTE.")

    finally:
        if proc:
            proc.kill()

if __name__ == "__main__":
    run_tests()
