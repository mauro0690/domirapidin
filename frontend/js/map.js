/**
 * DomiciliosRapidin Corporativo - Map Controller (Villavicencio, Colombia)
 * Integrated Leaflet Map with Google Maps styled tiles & routing visualizer
 */

window.RapidinMap = (function() {
    let map = null;
    let originMarker = null;
    let destinationMarker = null;
    let routeLine = null;

    // Coordenadas Sede Principal (Centro de Villavicencio)
    let currentOriginCoords = [4.1488, -73.6339];
    let currentOriginTitle = "Sede Principal Rapidin - Centro";
    let currentOriginAddress = "Calle 38 #31-42, Centro";

    function initMap() {
        if (map) return; // Ya inicializado

        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        // Inicializar mapa centrado en Villavicencio
        map = L.map('map', {
            center: currentOriginCoords,
            zoom: 14,
            zoomControl: true
        });

        // Tile layer estilo Google Maps / CartoDB Positron (Limpio y claro)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(map);

        // Icono Sede Origen (Edificio Corporativo)
        const originIcon = L.divIcon({
            className: 'custom-map-pin origin-pin',
            html: `<div style="background-color: #0f4c81; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.3);"><i class="fa-solid fa-building"></i></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17]
        });

        // Marcador Sede Origen
        originMarker = L.marker(currentOriginCoords, { icon: originIcon }).addTo(map);
        originMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px;">
                <strong style="color: #0f4c81;"><i class="fa-solid fa-building"></i> ${currentOriginTitle}</strong><br>
                <span>${currentOriginAddress}</span><br>
                <small style="color: #64748b;">Punto de Despacho</small>
            </div>
        `);

        // Evento recentrar mapa
        const recenterBtn = document.getElementById('btn-recenter-map');
        if (recenterBtn) {
            recenterBtn.addEventListener('click', () => {
                recenterMap();
            });
        }
    }

    function setOrigin(lat, lng, name, address) {
        currentOriginCoords = [parseFloat(lat) || 4.1488, parseFloat(lng) || -73.6339];
        currentOriginTitle = name || "Sede Principal Rapidin - Centro";
        currentOriginAddress = address || "Calle 38 #31-42, Centro";

        if (!map) initMap();

        if (originMarker) {
            originMarker.setLatLng(currentOriginCoords);
            originMarker.setPopupContent(`
                <div style="font-family: sans-serif; font-size: 13px;">
                    <strong style="color: #0f4c81;"><i class="fa-solid fa-building"></i> ${currentOriginTitle}</strong><br>
                    <span>${currentOriginAddress}</span><br>
                    <small style="color: #64748b;">Punto de Despacho</small>
                </div>
            `);
        }

        // If there's an active route, redraw it
        if (destinationMarker) {
            const destCoords = destinationMarker.getLatLng();
            if (routeLine) {
                routeLine.setLatLngs([currentOriginCoords, destCoords]);
            }
            recenterMap();
        } else {
            map.setView(currentOriginCoords, 14);
        }
    }

    function updateRoute(destinationData) {
        if (!map) initMap();
        if (!destinationData || !destinationData.latitud || !destinationData.longitud) return;

        const destCoords = [destinationData.latitud, destinationData.longitud];

        // Remover marcador de destino previo si existe
        if (destinationMarker) {
            map.removeLayer(destinationMarker);
        }

        // Remover línea de ruta previa si existe
        if (routeLine) {
            map.removeLayer(routeLine);
        }

        // Icono Marcador Destino Barrio
        const destIcon = L.divIcon({
            className: 'custom-map-pin dest-pin',
            html: `<div style="background-color: #2563eb; color: white; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 4px 12px rgba(37,99,235,0.4);"><i class="fa-solid fa-location-dot"></i></div>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19]
        });

        const isExactAddr = !!destinationData.direccion_exacta;
        const addrHtml = isExactAddr ? `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; color: #1e293b; font-weight: 700;"><i class="fa-solid fa-location-dot" style="color: #2563eb;"></i> ${destinationData.direccion_exacta}</div>` : '';

        destinationMarker = L.marker(destCoords, { icon: destIcon }).addTo(map);
        destinationMarker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 13px;">
                ${addrHtml}
                <strong style="color: #1e40af;"><i class="fa-solid fa-flag-checkered"></i> Barrio: ${destinationData.barrio}</strong><br>
                <span>Zona: ${destinationData.zona}</span><br>
                <strong style="color: #0f4c81;">Tarifa: $${destinationData.tarifa_total.toLocaleString('es-CO')} COP</strong>
            </div>
        `).openPopup();

        // Trazar línea de ruta (Estilo Google Maps Azul)
        routeLine = L.polyline([currentOriginCoords, destCoords], {
            color: '#2563eb',
            weight: 5,
            opacity: 0.85,
            dashArray: '8, 8',
            lineJoin: 'round'
        }).addTo(map);

        // Ajustar vista del mapa para cubrir origen y destino
        const bounds = L.latLngBounds([currentOriginCoords, destCoords]);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });

        // Actualizar overlay informativo en el mapa
        const overlay = document.getElementById('map-overlay-info');
        const overlayText = document.getElementById('map-overlay-text');
        if (overlay && overlayText) {
            overlayText.innerHTML = isExactAddr 
                ? `Ruta a <strong>${destinationData.direccion_exacta}</strong> (${destinationData.barrio})`
                : `Ruta a <strong>${destinationData.barrio}</strong> (${destinationData.distancia_km} km approx)`;
            overlay.style.display = 'flex';
        }
    }

    function recenterMap() {
        if (!map) return;
        map.invalidateSize();
        if (destinationMarker) {
            const bounds = L.latLngBounds([currentOriginCoords, destinationMarker.getLatLng()]);
            map.fitBounds(bounds, { padding: [60, 60] });
        } else {
            map.setView(currentOriginCoords, 14);
        }
    }

    // Auto-invalidar tamaño de mapa al cambiar dimensión de pantalla/orientación móvil
    window.addEventListener('resize', () => {
        if (map) {
            map.invalidateSize();
        }
    });

    return {
        init: initMap,
        setOrigin: setOrigin,
        updateRoute: updateRoute,
        recenter: recenterMap,
        invalidateSize: function() {
            if (map) map.invalidateSize();
        }
    };
})();

