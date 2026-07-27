/**
 * DomiciliosRapidin Corporativo - Spreadsheet Backend Manager
 * Interactive CSV Database Grid Manager connected to backend/database/tarifario_villavicencio.csv
 */

window.RapidinSpreadsheet = (function() {
    let currentData = [];

    async function loadSpreadsheet() {
        const clientSelect = document.getElementById('admin-select-client-db');
        const selectedClient = clientSelect ? clientSelect.value : '';

        const placeholder = document.getElementById('spreadsheet-placeholder');
        const editorContent = document.getElementById('spreadsheet-editor-content');
        const toolbarButtons = document.getElementById('spreadsheet-toolbar-buttons');

        if (!selectedClient) {
            // Ocultar grilla y botones cuando no hay cliente seleccionado
            if (placeholder) placeholder.style.display = 'block';
            if (editorContent) editorContent.style.display = 'none';
            if (toolbarButtons) toolbarButtons.style.display = 'none';
            currentData = [];
            return;
        }

        // Mostrar grilla y botones cuando se selecciona un cliente
        if (placeholder) placeholder.style.display = 'none';
        if (editorContent) editorContent.style.display = 'block';
        if (toolbarButtons) toolbarButtons.style.display = 'flex';

        try {
            const response = await fetch(`/api/hoja-calculo?cliente=${encodeURIComponent(selectedClient)}`);
            const res = await response.json();
            if (res.status === 'success') {
                currentData = res.data;
                renderSpreadsheet(currentData);
                updateStats(currentData.length);
                
                const fileLabel = document.querySelector('.spreadsheet-stats .stat-pill .val');
                if (fileLabel && res.archivo) {
                    fileLabel.textContent = res.archivo.split('/').pop();
                }
            }
        } catch (err) {
            console.error("Error al cargar hoja de cálculo:", err);
        }
    }

    function renderSpreadsheet(data) {
        const tbody = document.getElementById('spreadsheet-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        data.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;

            tr.innerHTML = `
                <td style="text-align: center; font-weight: 700; color: #64748b;">${index + 1}</td>
                <td><input type="text" data-field="barrio" value="${escapeHtml(row.barrio)}"></td>
                <td><input type="text" data-field="zona" value="${escapeHtml(row.zona)}"></td>
                <td><input type="number" step="0.0001" data-field="latitud" value="${row.latitud}"></td>
                <td><input type="number" step="0.0001" data-field="longitud" value="${row.longitud}"></td>
                <td><input type="number" step="0.1" data-field="distancia_km" value="${row.distancia_km}"></td>
                <td><input type="number" step="500" data-field="tarifa_base" value="${row.tarifa_base}"></td>
                <td><input type="number" step="500" data-field="recargo_distancia" value="${row.recargo_distancia}"></td>
                <td><input type="number" data-field="tarifa_total" value="${row.tarifa_total}" readonly style="font-weight:800; color:#1d4ed8; background-color:#eff6ff;"></td>
                <td><input type="number" data-field="tiempo_entrega_min" value="${row.tiempo_entrega_min}"></td>
                <td style="text-align: center;">
                    <button type="button" class="btn-del-row" data-index="${index}" title="Eliminar Barrio">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        attachCellEvents();
    }

    function attachCellEvents() {
        const tbody = document.getElementById('spreadsheet-tbody');
        if (!tbody) return;

        // Auto-calcular tarifa_total cuando cambian tarifa_base o recargo_distancia
        tbody.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const tr = e.target.closest('tr');
                const index = parseInt(tr.dataset.index);
                const field = e.target.dataset.field;
                let val = e.target.value;

                if (field === 'tarifa_base' || field === 'recargo_distancia' || field === 'distancia_km' || field === 'latitud' || field === 'longitud' || field === 'tiempo_entrega_min') {
                    val = parseFloat(val) || 0;
                }

                currentData[index][field] = val;

                if (field === 'tarifa_base' || field === 'recargo_distancia') {
                    const base = parseFloat(tr.querySelector('[data-field="tarifa_base"]').value) || 0;
                    const rec = parseFloat(tr.querySelector('[data-field="recargo_distancia"]').value) || 0;
                    const total = base + rec;
                    currentData[index]['tarifa_total'] = total;
                    tr.querySelector('[data-field="tarifa_total"]').value = total;
                }
            });
        });

        // Botones eliminar fila
        tbody.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                currentData.splice(idx, 1);
                renderSpreadsheet(currentData);
                updateStats(currentData.length);
            });
        });
    }

    function addRow() {
        const newRow = {
            id: currentData.length + 1,
            barrio: "Nuevo Barrio",
            zona: "General",
            latitud: 4.1488,
            longitud: -73.6339,
            distancia_km: 3.0,
            tarifa_base: 6000,
            recargo_distancia: 2000,
            tarifa_total: 8000,
            tiempo_entrega_min: 20
        };
        currentData.push(newRow);
        renderSpreadsheet(currentData);
        updateStats(currentData.length);
    }

    async function saveSpreadsheet() {
        const clientSelect = document.getElementById('admin-select-client-db');
        const selectedClient = clientSelect ? clientSelect.value : '';
        try {
            const response = await fetch(`/api/hoja-calculo?cliente=${encodeURIComponent(selectedClient)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ barrios: currentData })
            });
            const res = await response.json();
            if (res.status === 'success') {
                window.RapidinApp.showToast("✅ Base de datos (Hoja de cálculo CSV) guardada exitosamente en backend.");
                // Recargar cotizador
                window.RapidinApp.loadBarrios();
            } else {
                window.RapidinApp.showToast("❌ Error al guardar en servidor.");
            }
        } catch (err) {
            console.error(err);
            window.RapidinApp.showToast("❌ Error de conexión al servidor.");
        }
    }

    function exportCSV() {
        if (!currentData || currentData.length === 0) return;
        const headers = ["id", "barrio", "zona", "latitud", "longitud", "distancia_km", "tarifa_base", "recargo_distancia", "tarifa_total", "tiempo_entrega_min"];
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n";

        currentData.forEach(row => {
            const rowValues = headers.map(h => `"${row[h]}"`);
            csvContent += rowValues.join(",") + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `tarifario_villavicencio_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function updateStats(total) {
        const el = document.getElementById('stat-total-barrios');
        if (el) el.textContent = total;
    }

    function escapeHtml(str) {
        return String(str || '').replace(/"/g, '&quot;');
    }

    return {
        load: loadSpreadsheet,
        addRow: addRow,
        save: saveSpreadsheet,
        exportCSV: exportCSV
    };
})();
