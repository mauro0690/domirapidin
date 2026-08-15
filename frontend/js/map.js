/**
 * DomiciliosRapidin Corporativo - Direct Google Maps Live Controller & Route Visualizer
 * Renders Live Google Maps Driving Routes (Origen Sede -> Destino Domicilio)
 */

window.RapidinMap = (function() {
    let mapContainer = null;
    let currentOriginCoords = [4.1488, -73.6339];
    let currentOriginTitle = "Sede Principal Rapidin";
    let currentOriginAddress = "Calle 38 #31-42, Centro, Villavicencio";
    let activeDestinationQuery = null;

    function initMap() {
        mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        // Render initial Google Maps Live View centered on Sede Origin
        renderGoogleSingleLocation(currentOriginAddress || "Centro, Villavicencio");
    }

    function renderGoogleSingleLocation(searchQuery) {
        if (!mapContainer) return;

        const cleanQuery = encodeURIComponent(`${searchQuery}, Villavicencio, Meta, Colombia`);
        const googleEmbedUrl = `https://maps.google.com/maps?q=${cleanQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

        mapContainer.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; min-height: 400px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
                <iframe 
                    id="google-maps-iframe"
                    title="Google Maps Ubicación de Origen"
                    width="100%" 
                    height="100%" 
                    style="border:0; min-height: 400px;" 
                    allowfullscreen="" 
                    loading="lazy" 
                    referrerpolicy="no-referrer-when-downgrade"
                    src="${googleEmbedUrl}">
                </iframe>
                <div style="position: absolute; top: 12px; left: 12px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 8px 14px; border-radius: 8px; font-family: sans-serif; font-size: 12px; font-weight: 700; color: #1e293b; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 6px;">
                    <i class="fa-solid fa-building" style="color: #1d4ed8; font-size: 14px;"></i>
                    <span>Sede de Origen Negocio</span>
                </div>
            </div>
        `;
    }

    function renderGoogleRouteView(originQuery, destinationQuery, destinationTitle) {
        if (!mapContainer) return;

        const cleanOrigin = encodeURIComponent(`${originQuery}, Villavicencio, Meta, Colombia`);
        const cleanDest = encodeURIComponent(`${destinationQuery}, Villavicencio, Meta, Colombia`);
        
        // Petición directa a Google Maps con trazado de ruta de conducción (saddr -> daddr)
        const googleRouteEmbedUrl = `https://maps.google.com/maps?saddr=${cleanOrigin}&daddr=${cleanDest}&t=&z=14&ie=UTF8&output=embed`;

        mapContainer.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%; min-height: 400px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">
                <iframe 
                    id="google-maps-iframe"
                    title="Google Maps Ruta de Domicilio"
                    width="100%" 
                    height="100%" 
                    style="border:0; min-height: 400px;" 
                    allowfullscreen="" 
                    loading="lazy" 
                    referrerpolicy="no-referrer-when-downgrade"
                    src="${googleRouteEmbedUrl}">
                </iframe>
                <div style="position: absolute; top: 12px; left: 12px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 8px 14px; border-radius: 8px; font-family: sans-serif; font-size: 12px; font-weight: 700; color: #1e293b; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid fa-route" style="color: #2563eb; font-size: 15px;"></i>
                    <span>Ruta Google Maps: Origen → ${escapeHtml(destinationTitle)}</span>
                </div>
            </div>
        `;
    }

    function setOrigin(lat, lng, name, address) {
        currentOriginCoords = [parseFloat(lat) || 4.1488, parseFloat(lng) || -73.6339];
        currentOriginTitle = name || "Sede Principal";
        currentOriginAddress = address || "Centro, Villavicencio";

        if (activeDestinationQuery) {
            renderGoogleRouteView(currentOriginAddress, activeDestinationQuery.destQuery, activeDestinationQuery.title);
        } else {
            renderGoogleSingleLocation(currentOriginAddress);
        }
    }

    function updateRoute(destinationData) {
        if (!destinationData) return;

        const barrio = destinationData.barrio || destinationData.barrio_destino || "Villavicencio";
        const direccion = destinationData.direccion_exacta || "";

        const destQuery = direccion ? `${direccion}, ${barrio}` : `Barrio ${barrio}`;
        const title = direccion ? `${barrio} (${direccion})` : barrio;

        activeDestinationQuery = { destQuery: destQuery, title: title };

        renderGoogleRouteView(currentOriginAddress, destQuery, title);
    }

    function recenterMap() {
        if (activeDestinationQuery) {
            renderGoogleRouteView(currentOriginAddress, activeDestinationQuery.destQuery, activeDestinationQuery.title);
        } else {
            renderGoogleSingleLocation(currentOriginAddress);
        }
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    return {
        init: initMap,
        setOrigin: setOrigin,
        updateRoute: updateRoute,
        recenter: recenterMap
    };
})();
