/**
 * DomiciliosRapidin Corporativo - Main Application Controller
 * Multi-Tenant Business Session, Admin Mode & Tariff Lookup
 */

window.RapidinApp = (function () {
    let barriosData = [];
    let clientsData = [];
    let selectedCotizacion = null;
    let pendingBarrioToQuery = null;
    let activeBusiness = null;
    let activePricingClient = null;
    let isAdmin = false;

    document.addEventListener('DOMContentLoaded', () => {
        initBusinessSession();
        initNavigation();
        initAdminPortal();
        loadBarrios();
        initSearchAndAutocomplete();
        initOrderModal();

        // Initialize Map
        window.RapidinMap.init();

        // Initialize Backend Spreadsheet Events
        document.getElementById('btn-save-spreadsheet')?.addEventListener('click', () => window.RapidinSpreadsheet.save());
        document.getElementById('btn-add-row')?.addEventListener('click', () => window.RapidinSpreadsheet.addRow());
        document.getElementById('btn-export-csv')?.addEventListener('click', () => window.RapidinSpreadsheet.exportCSV());

        // Business Switch & Login Modal buttons
        document.getElementById('btn-switch-business')?.addEventListener('click', switchBusiness);
        document.getElementById('btn-change-business-link')?.addEventListener('click', switchBusiness);
        document.getElementById('btn-open-admin')?.addEventListener('click', openAdminModal);
        document.getElementById('close-login-modal-btn')?.addEventListener('click', closeLoginModal);
        document.getElementById('close-admin-modal-btn')?.addEventListener('click', closeAdminModal);
        document.getElementById('btn-logout')?.addEventListener('click', logout);
        document.getElementById('origin-admin-select-client')?.addEventListener('change', (e) => {
            updateActivePricingClient(e.target.value);
            window.RapidinSpreadsheet.load();
            loadBarrios();
        });
        // Visitor landing login CTA
        document.getElementById('btn-visitor-login')?.addEventListener('click', () => openLoginModal());

        setupPasswordToggle('admin-pin-input', 'btn-toggle-admin-pin');
        setupPasswordToggle('login-business-code', 'btn-toggle-login-code');
        initUserDropdown();
        initProfileTab();
        loadRegisteredBusinesses();
    });

    /* Business Session Management */
    async function initBusinessSession() {
        const saved = localStorage.getItem('rapidin_business');
        if (saved) {
            try {
                activeBusiness = JSON.parse(saved);
                applyBusinessSession(activeBusiness);
            } catch (e) {
                activeBusiness = null;
                applyBusinessSession(null);
            }
        } else {
            // No session: show visitor landing
            applyBusinessSession(null);
        }

        loadRegisteredBusinesses();

        const loginForm = document.getElementById('login-form');
        loginForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('login-business-name').value.trim();
            const codeInput = document.getElementById('login-business-code').value.trim();
            if (nameInput && codeInput) {
                await loginBusiness(nameInput, codeInput);
            }
        });
    }

    async function loginBusiness(nombre, codigo) {
        try {
            const response = await fetch('/api/clientes/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: nombre, codigo: codigo })
            });
            const res = await response.json();
            if (res.status === 'success') {
                activeBusiness = res.cliente;
                localStorage.setItem('rapidin_business', JSON.stringify(activeBusiness));
                applyBusinessSession(activeBusiness);
                closeLoginModal();
                if (res.cliente.codigo_acceso_texto) {
                    showToast(`🏢 Acceso concedido para ${activeBusiness.nombre}.<br><strong style="color: #f59e0b; font-size: 1.1em;">¡Guarda tu código único!: ${res.cliente.codigo_acceso_texto}</strong>`);
                } else {
                    showToast(`🏢 Acceso concedido para ${activeBusiness.nombre}.`);
                }

                if (pendingBarrioToQuery) {
                    const barrioToExecute = pendingBarrioToQuery;
                    pendingBarrioToQuery = null;
                    seleccionarBarrio(barrioToExecute);
                }
            } else {
                showToast("❌ " + res.message);
            }
        } catch (err) {
            console.error(err);
            showToast("❌ Error al verificar credenciales: " + err.message);
        }
    }

    function initUserDropdown() {
        const toggleBtn = document.getElementById('btn-user-menu-toggle');
        const dropdownMenu = document.getElementById('user-dropdown-menu');

        if (!toggleBtn || !dropdownMenu) return;

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdownMenu.style.display !== 'none';
            dropdownMenu.style.display = isVisible ? 'none' : 'block';
            toggleBtn.classList.toggle('active', !isVisible);
        });

        // Cerrar menú al hacer clic en cualquier opción
        dropdownMenu.querySelectorAll('.dropdown-item').forEach(btn => {
            btn.addEventListener('click', () => {
                dropdownMenu.style.display = 'none';
                toggleBtn.classList.remove('active');
            });
        });

        // Cerrar menú al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!toggleBtn.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.style.display = 'none';
                toggleBtn.classList.remove('active');
            }
        });
    }

    function applyBusinessSession(business) {
        const adminTab = document.querySelector('[data-tab="backend"]');
        const adminBtn = document.getElementById('btn-open-admin');
        const switchBusinessBtn = document.getElementById('btn-switch-business');
        const logoutBtn = document.getElementById('btn-logout');
        const profileTab = document.getElementById('nav-tab-profile');
        const navbar = document.querySelector('.navbar');

        const originBox = document.querySelector('.origin-box');
        const originName = document.getElementById('origin-business-name');
        const originAddr = document.getElementById('origin-business-address');
        const selectOrigin = document.getElementById('origin-admin-select-client');

        const visitorLanding = document.getElementById('visitor-landing');
        const mainContent = document.getElementById('app-main-content');

        if (!business) {
            isAdmin = false;
            activePricingClient = null;
            document.getElementById('header-business-name').textContent = "Acceso Libre";
            document.getElementById('header-business-role').innerHTML = `<i class="fa-solid fa-store"></i> Cliente`;
            document.getElementById('header-business-avatar').innerHTML = `<span>DL</span>`;
            if (adminTab) adminTab.style.display = 'none';
            if (adminBtn) adminBtn.style.display = 'none';
            if (profileTab) profileTab.style.display = 'none';
            if (switchBusinessBtn) switchBusinessBtn.style.display = 'flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (originBox) originBox.style.display = 'none';
            if (originName) { originName.style.display = 'inline'; originName.textContent = "Sede Principal Centro"; }
            if (selectOrigin) selectOrigin.style.display = 'none';
            if (originAddr) originAddr.textContent = "Calle 38 #31-42, Centro - Villavicencio";

            // Hide navbar, show visitor landing
            if (navbar) navbar.style.display = 'none';
            if (visitorLanding) visitorLanding.style.display = 'block';
            if (mainContent) mainContent.style.display = 'none';
            renderVisitorLanding();

            loadBarrios();
            return;
        }

        // Show navbar, hide visitor landing, show main app
        const navbar2 = document.querySelector('.navbar');
        if (navbar2) navbar2.style.display = '';
        const visitorLanding2 = document.getElementById('visitor-landing');
        const mainContent2 = document.getElementById('app-main-content');
        if (visitorLanding2) visitorLanding2.style.display = 'none';
        if (mainContent2) mainContent2.style.display = 'flex';

        if (business.rol === 'admin' || business.id === 'ADMIN') {
            isAdmin = true;
        } else {
            isAdmin = false;
        }

        if (isAdmin) {
            document.getElementById('header-business-role').innerHTML = `<i class="fa-solid fa-user-shield text-success"></i> Administrador`;
            if (adminTab) adminTab.style.display = 'inline-flex';
            if (adminBtn) adminBtn.style.display = 'flex';
            if (profileTab) profileTab.style.display = 'none';  // Admin has Panel, not Mi Negocio
        } else {
            document.getElementById('header-business-role').innerHTML = `<i class="fa-solid fa-store"></i> Cliente`;
            if (adminTab) adminTab.style.display = 'none';
            if (adminBtn) adminBtn.style.display = 'none';
            if (profileTab) profileTab.style.display = 'inline-flex';
        }

        if (switchBusinessBtn) switchBusinessBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'flex';

        const headerName = document.getElementById('header-business-name');
        const headerAvatar = document.getElementById('header-business-avatar');
        if (headerName) headerName.textContent = business.nombre;
        if (headerAvatar) {
            const initials = business.nombre.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            headerAvatar.innerHTML = `<span>${initials}</span>`;
        }

        const orderEmpresaInput = document.getElementById('order-empresa');
        if (orderEmpresaInput) orderEmpresaInput.value = business.nombre;

        if (originBox) originBox.style.display = 'flex';

        if (isAdmin) {
            if (originName) originName.style.display = 'none';
            if (selectOrigin) {
                selectOrigin.style.display = 'inline-block';
                populateOriginClientSelect();
            }
            if (!activePricingClient && clientsData.length > 0) {
                activePricingClient = clientsData[0].nombre;
            }
            const activeClientObj = clientsData.find(c => c.nombre === activePricingClient);
            if (originAddr) {
                originAddr.textContent = activeClientObj ? (activeClientObj.direccion || '') : "Calle 38 #31-42, Centro - Villavicencio";
            }
            if (activeClientObj) {
                window.RapidinMap.setOrigin(activeClientObj.latitud || 4.1488, activeClientObj.longitud || -73.6339, activeClientObj.nombre, activeClientObj.direccion);
            } else {
                window.RapidinMap.setOrigin(4.1488, -73.6339, "Sede Principal Centro", "Calle 38 #31-42, Centro - Villavicencio");
            }
        } else {
            if (originName) {
                originName.style.display = 'inline';
                originName.textContent = business.nombre;
            }
            if (selectOrigin) selectOrigin.style.display = 'none';
            if (originAddr) originAddr.textContent = business.direccion || "Calle 38 #31-42, Centro - Villavicencio";
            activePricingClient = business.nombre;
            window.RapidinMap.setOrigin(business.latitud || 4.1488, business.longitud || -73.6339, business.nombre, business.direccion);
        }

        loadBarrios();
        // Load profile data into Mi Negocio tab
        loadProfileFromBusiness(business);
    }

    function openLoginModal(barrioToQuery = null) {
        if (barrioToQuery) pendingBarrioToQuery = barrioToQuery;
        const modal = document.getElementById('modal-login');
        if (modal) modal.style.display = 'flex';
        document.getElementById('login-business-name')?.focus();
    }

    function closeLoginModal() {
        const modal = document.getElementById('modal-login');
        if (modal) modal.style.display = 'none';
        const adminModal = document.getElementById('modal-admin-login');
        if (adminModal) adminModal.style.display = 'none';
    }

    function switchBusiness() {
        openLoginModal();
    }

    function logout() {
        activeBusiness = null;
        isAdmin = false;
        localStorage.removeItem('rapidin_business');
        applyBusinessSession(null);
        showToast("🚪 Sesión cerrada correctamente.");

        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab && activeTab.dataset.tab === 'backend') {
            document.querySelector('[data-tab="cotizador"]')?.click();
        }
    }

    async function editOriginAddress() {
        if (!activeBusiness) return;
        const currentAddr = activeBusiness.direccion || "Calle 38 #31-42, Centro - Villavicencio";
        const newAddress = prompt("Ingresa la nueva dirección de origen de tu negocio:", currentAddr);
        if (newAddress === null) return;

        const trimmed = newAddress.trim();
        if (!trimmed) {
            showToast("⚠️ La dirección no puede estar vacía.");
            return;
        }

        try {
            const response = await fetch('/api/clientes/update-address', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliente: activeBusiness.nombre, direccion: trimmed })
            });
            const res = await response.json();
            if (res.status === 'success') {
                activeBusiness.direccion = trimmed;
                localStorage.setItem('rapidin_business', JSON.stringify(activeBusiness));
                document.getElementById('origin-business-address').textContent = trimmed;
                showToast("✅ Dirección de origen actualizada con éxito.");
            } else {
                showToast("❌ " + res.message);
            }
        } catch (err) {
            console.error(err);
            showToast("❌ Error al actualizar la dirección.");
        }
    }

    function populateClientDbSelect() {
        const select = document.getElementById('admin-select-client-db');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '';

        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '-- Selecciona un Negocio --';
        select.appendChild(defaultOpt);

        if (clientsData.length > 0) {
            clientsData.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nombre;
                opt.textContent = c.nombre;
                select.appendChild(opt);
            });
        }

        if (currentValue && Array.from(select.options).some(o => o.value === currentValue)) {
            select.value = currentValue;
        } else {
            select.value = '';
        }

        window.RapidinSpreadsheet.load();
    }

    function populateOriginClientSelect() {
        const select = document.getElementById('origin-admin-select-client');
        if (!select) return;

        const currentValue = select.value || (activePricingClient || '');
        select.innerHTML = '';

        if (clientsData.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'Sin Clientes';
            select.appendChild(opt);
        } else {
            clientsData.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.nombre;
                opt.textContent = c.nombre;
                select.appendChild(opt);
            });
        }

        if (currentValue && Array.from(select.options).some(o => o.value === currentValue)) {
            select.value = currentValue;
        } else if (clientsData.length > 0) {
            select.value = clientsData[0].nombre;
            activePricingClient = clientsData[0].nombre;
        }
    }

    function updateActivePricingClient(clientName) {
        activePricingClient = clientName;

        const selectDb = document.getElementById('admin-select-client-db');
        if (selectDb && selectDb.value !== clientName) {
            selectDb.value = clientName;
        }

        const selectOrigin = document.getElementById('origin-admin-select-client');
        if (selectOrigin && selectOrigin.value !== clientName) {
            selectOrigin.value = clientName;
        }

        const client = clientsData.find(c => c.nombre === clientName);
        const originAddr = document.getElementById('origin-business-address');
        if (originAddr) {
            originAddr.textContent = client ? (client.direccion || '') : "Calle 38 #31-42, Centro - Villavicencio";
        }
        if (client) {
            window.RapidinMap.setOrigin(client.latitud || 4.1488, client.longitud || -73.6339, client.nombre, client.direccion);
        } else {
            window.RapidinMap.setOrigin(4.1488, -73.6339, "Sede Principal Centro", "Calle 38 #31-42, Centro - Villavicencio");
        }
    }

    async function loadRegisteredBusinesses() {
        const suggestionsContainer = document.getElementById('business-suggestions');
        try {
            const res = await fetch('/api/clientes');
            const data = await res.json();
            if (data.status === 'success') {
                clientsData = data.data;

                if (activeBusiness && activeBusiness.id !== 'ADMIN') {
                    const exists = clientsData.some(c => c.nombre.toLowerCase() === activeBusiness.nombre.toLowerCase());
                    if (!exists) {
                        activeBusiness = null;
                        localStorage.removeItem('rapidin_business');
                        applyBusinessSession(null);
                    }
                }

                if (suggestionsContainer) {
                    suggestionsContainer.innerHTML = '';
                    clientsData.forEach(c => {
                        const chip = document.createElement('span');
                        chip.className = 'b-suggestion-chip';
                        chip.textContent = c.nombre;
                        chip.addEventListener('click', () => {
                            document.getElementById('login-business-name').value = c.nombre;
                            document.getElementById('login-business-code').value = '';
                            document.getElementById('login-business-code').focus();
                        });
                        suggestionsContainer.appendChild(chip);
                    });
                }

                if (isAdmin) {
                    renderClientsAdminTable(clientsData);
                    populateClientDbSelect();
                    populateOriginClientSelect();
                }
                // Refresh visitor cards if landing is visible
                if (!activeBusiness) {
                    renderVisitorLanding();
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    /* Admin Authentication & Management Portal (Rapidin123) */
    function initAdminPortal() {
        const adminModal = document.getElementById('modal-admin-login');
        const adminForm = document.getElementById('admin-login-form');
        const btnCancelAdmin = document.getElementById('btn-cancel-admin-modal');

        btnCancelAdmin?.addEventListener('click', closeAdminModal);

        adminForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pin = document.getElementById('admin-pin-input').value.trim();

            try {
                const response = await fetch('/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: pin })
                });
                const res = await response.json();

                if (res.status === 'success') {
                    isAdmin = true;
                    closeAdminModal();
                    showToast("🔑 Sesión de Administrador Máster concedida.");

                    const adminSession = { id: 'ADMIN', nombre: 'Administrador', rol: 'admin' };
                    activeBusiness = adminSession;
                    localStorage.setItem('rapidin_business', JSON.stringify(adminSession));
                    applyBusinessSession(adminSession);

                    document.querySelector('[data-tab="backend"]')?.click();
                    loadRegisteredBusinesses();
                } else {
                    showToast("❌ " + res.message);
                }
            } catch (err) {
                console.error(err);
                showToast("❌ Error al autenticar administrador: " + err.message);
            }
        });

        document.querySelectorAll('.admin-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.admin-subtab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const targetSub = btn.dataset.subtab;
                document.querySelectorAll('.admin-subtab-content').forEach(c => c.classList.remove('active'));
                document.getElementById(`subtab-${targetSub}`)?.classList.add('active');
            });
        });

        document.getElementById('btn-add-client-row')?.addEventListener('click', addClientRow);
        document.getElementById('btn-save-clients')?.addEventListener('click', saveClientsAdmin);
        document.getElementById('admin-select-client-db')?.addEventListener('change', (e) => {
            updateActivePricingClient(e.target.value);
            window.RapidinSpreadsheet.load();
            loadBarrios();
        });
    }

    function openAdminModal() {
        if (isAdmin) {
            document.querySelector('[data-tab="backend"]')?.click();
            return;
        }
        const modal = document.getElementById('modal-admin-login');
        if (modal) modal.style.display = 'flex';
        document.getElementById('admin-pin-input')?.focus();
    }

    function closeAdminModal() {
        const modal = document.getElementById('modal-admin-login');
        if (modal) modal.style.display = 'none';
        const loginModal = document.getElementById('modal-login');
        if (loginModal) loginModal.style.display = 'none';
    }

    function renderClientsAdminTable(data) {
        const tbody = document.getElementById('clients-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        data.forEach((c, index) => {
            const tr = document.createElement('tr');
            tr.dataset.index = index;

            tr.innerHTML = `
                <td><strong>${escapeHtml(c.id)}</strong></td>
                <td><input type="text" data-field="nombre" value="${escapeHtml(c.nombre)}"></td>
                <td>
                    <div style="position: relative; display: flex; align-items: center; width: 100%;">
                        <input type="password" data-field="codigo_acceso" value="${c.codigo_acceso && c.codigo_acceso.startsWith('pbkdf2:') ? '••••••••' : escapeHtml(c.codigo_acceso || '')}" style="font-weight:700; color:#1d4ed8; padding-right: 2.2rem; width: 100%;">
                        <button type="button" class="btn-toggle-row-pwd" style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #64748b;" title="Mostrar/Ocultar Contraseña">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </td>
                <td><input type="text" data-field="direccion" value="${escapeHtml(c.direccion || 'Calle 38 #31-42, Centro - Villavicencio')}"></td>
                <td><input type="number" step="0.0001" data-field="latitud" value="${c.latitud !== undefined ? c.latitud : 4.1488}" style="width: 90px;"></td>
                <td><input type="number" step="0.0001" data-field="longitud" value="${c.longitud !== undefined ? c.longitud : -73.6339}" style="width: 90px;"></td>
                <td><input type="text" data-field="tipo" value="${escapeHtml(c.tipo || 'Comercial')}"></td>
                <td style="text-align:center;">
                    <button class="btn-del-row" data-index="${index}" title="Eliminar Negocio">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const tr = e.target.closest('tr');
                const idx = parseInt(tr.dataset.index);
                const field = e.target.dataset.field;
                clientsData[idx][field] = e.target.value;
            });
        });

        tbody.querySelectorAll('.btn-toggle-row-pwd').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tr = e.target.closest('tr');
                const input = tr.querySelector('[data-field="codigo_acceso"]');
                if (input) {
                    const isPassword = input.type === 'password';
                    input.type = isPassword ? 'text' : 'password';

                    const icon = btn.querySelector('i');
                    if (icon) {
                        icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
                    }
                }
            });
        });

        tbody.querySelectorAll('.btn-del-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                clientsData.splice(idx, 1);
                renderClientsAdminTable(clientsData);
            });
        });
    }

    function generateUnique6DigitCode() {
        let code;
        let exists = true;
        while (exists) {
            code = Math.floor(100000 + Math.random() * 900000).toString();
            exists = clientsData.some(c => c.codigo_acceso === code);
        }
        return code;
    }

    function addClientRow() {
        const newClient = {
            id: `CLI-${String(clientsData.length + 1).padStart(3, '0')}`,
            nombre: "Nuevo Negocio",
            codigo_acceso: generateUnique6DigitCode(),
            direccion: "Calle 38 #31-42, Centro - Villavicencio",
            latitud: 4.1488,
            longitud: -73.6339,
            tipo: "Comercial",
            categoria: "Comercial",
            descripcion: "",
            foto_perfil: "",
            archivo_tarifario: "tarifario_villavicencio.csv"
        };
        clientsData.push(newClient);
        renderClientsAdminTable(clientsData);
    }

    async function saveClientsAdmin() {
        try {
            const response = await fetch('/api/clientes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientes: clientsData })
            });
            const res = await response.json();
            if (res.status === 'success') {
                showToast("✅ Base de datos de negocios guardada exitosamente.");
                loadRegisteredBusinesses();
            } else {
                showToast("❌ Error al guardar negocios.");
            }
        } catch (err) {
            console.error(err);
            showToast("❌ Error de conexión con el servidor.");
        }
    }

    /* Navigation Tabs Handler */
    function initNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;

                if (targetTab === 'backend' && !isAdmin) {
                    openAdminModal();
                    return;
                }

                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });

                const activeContent = document.getElementById(`tab-${targetTab}`);
                if (activeContent) {
                    activeContent.classList.add('active');
                }

                if (targetTab === 'cotizador') {
                    setTimeout(() => window.RapidinMap.recenter(), 200);
                } else if (targetTab === 'backend') {
                    window.RapidinSpreadsheet.load();
                    if (isAdmin) renderClientsAdminTable(clientsData);
                }
            });
        });
    }

    /* Load Barrios list from backend API */
    async function loadBarrios() {
        const clienteQuery = activePricingClient ? encodeURIComponent(activePricingClient) : '';
        try {
            const res = await fetch(`/api/barrios?cliente=${clienteQuery}`);
            const data = await res.json();
            if (data.status === 'success') {
                barriosData = data.data;
                renderQuickChips(barriosData);
            }
        } catch (err) {
            console.error("Error al cargar barrios:", err);
        }
    }

    /* Popular Barrio Chips */
    function renderQuickChips(data) {
        const container = document.getElementById('quick-chips-container');
        if (!container) return;

        const popularNames = ["Barzal", "El Buque", "Amarilo", "Ciudad Porfía", "Catama", "La Grama"];
        const filtered = data.filter(b => popularNames.includes(b.barrio));

        container.innerHTML = '';
        filtered.forEach(b => {
            const chip = document.createElement('span');
            chip.className = 'chip';
            chip.textContent = b.barrio;
            chip.addEventListener('click', () => {
                document.getElementById('barrio-input').value = b.barrio;
                document.getElementById('clear-search-btn').style.display = 'block';
                seleccionarBarrio(b.barrio);
            });
            container.appendChild(chip);
        });
    }

    /* Search Input & Live Autocomplete (Smart Address & Barrio Search) */
    function initSearchAndAutocomplete() {
        const input = document.getElementById('barrio-input');
        const clearBtn = document.getElementById('clear-search-btn');
        const dropdown = document.getElementById('autocomplete-list');

        if (!input || !dropdown) return;

        // Función para extraer barrio presente en texto de dirección
        function detectBarrioFromAddress(text) {
            const valLower = text.toLowerCase();
            const barriosSorted = [...barriosData].sort((a, b) => b.barrio.length - a.barrio.length);
            return barriosSorted.find(b => valLower.includes(b.barrio.toLowerCase()));
        }

        input.addEventListener('input', (e) => {
            const rawVal = e.target.value;
            const val = rawVal.trim().toLowerCase();
            clearBtn.style.display = val ? 'block' : 'none';

            if (!val) {
                dropdown.classList.remove('show');
                return;
            }

            // Comprobar si el texto ingresado parece una dirección (contiene números, #, o prefijos de vía)
            const isAddressLike = /[0-9#]|\b(calle|cra|carrera|cll|av|avenida|diagonal|transversal|trv|dg|tv|apto|casa|manzana|mz)\b/i.test(rawVal);
            const detectedBarrio = detectBarrioFromAddress(rawVal);

            // Filtrar coincidencias directas de barrio o zona
            const matches = barriosData.filter(b =>
                b.barrio.toLowerCase().includes(val) || b.zona.toLowerCase().includes(val)
            );

            renderAutocompleteDropdown(matches, dropdown, input, rawVal, isAddressLike, detectedBarrio);
        });

        // Soporte para presionar ENTER en el input de búsqueda
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = input.value.trim();
                if (!rawVal) return;

                dropdown.classList.remove('show');
                const detectedBarrio = detectBarrioFromAddress(rawVal);
                const isAddressLike = /[0-9#]|\b(calle|cra|carrera|cll|av|avenida|diagonal|transversal|trv|dg|tv)\b/i.test(rawVal);

                if (isAddressLike) {
                    const bName = detectedBarrio ? detectedBarrio.barrio : '';
                    seleccionarBarrio(bName, rawVal);
                } else if (detectedBarrio) {
                    seleccionarBarrio(detectedBarrio.barrio, '');
                } else {
                    // Si ingresó texto general, intentar cotizar como barrio
                    seleccionarBarrio(rawVal, '');
                }
            }
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            dropdown.classList.remove('show');
            resetResultCard();
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    function renderAutocompleteDropdown(matches, dropdown, input, rawSearchVal, isAddressLike, detectedBarrio) {
        dropdown.innerHTML = '';

        // Si el usuario ingresó una dirección exacta, mostrar una opción destacada de Dirección Cotizada
        if (isAddressLike) {
            const addrDiv = document.createElement('div');
            addrDiv.className = 'suggestion-item address-item';
            const barrioTxt = detectedBarrio ? `Barrio detectado: <strong>${escapeHtml(detectedBarrio.barrio)}</strong>` : `Buscar barrio en dirección...`;
            addrDiv.innerHTML = `
                <div>
                    <div class="item-title"><i class="fa-solid fa-location-dot text-blue"></i> Cotizar Dirección: <strong>${escapeHtml(rawSearchVal)}</strong></div>
                    <div class="item-sub">${barrioTxt}</div>
                </div>
                <div class="item-price"><i class="fa-solid fa-arrow-right"></i></div>
            `;
            addrDiv.addEventListener('click', () => {
                dropdown.classList.remove('show');
                const bName = detectedBarrio ? detectedBarrio.barrio : '';
                seleccionarBarrio(bName, rawSearchVal);
            });
            dropdown.appendChild(addrDiv);
        }

        if (matches.length === 0 && !isAddressLike) {
            dropdown.innerHTML = `<div class="suggestion-item"><span class="item-sub">No se encontró el barrio ni la dirección. Revisa la ortografía o ingresa una dirección completa.</span></div>`;
            dropdown.classList.add('show');
            return;
        }

        matches.forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <div>
                    <div class="item-title">${escapeHtml(item.barrio)}</div>
                    <div class="item-sub">Zona: ${escapeHtml(item.zona)}</div>
                </div>
                <div class="item-price">$${item.tarifa_total.toLocaleString('es-CO')}</div>
            `;
            div.addEventListener('click', () => {
                input.value = isAddressLike ? rawSearchVal : item.barrio;
                dropdown.classList.remove('show');
                if (isAddressLike) {
                    seleccionarBarrio(item.barrio, rawSearchVal);
                } else {
                    seleccionarBarrio(item.barrio, '');
                }
            });
            dropdown.appendChild(div);
        });

        dropdown.classList.add('show');
    }

    /* Query Quotation for selected barrio / direccion */
    async function seleccionarBarrio(nombreBarrio, direccionExacta = '') {
        if (!activeBusiness) {
            // Solicitar autenticación de cliente antes de cotizar
            openLoginModal(nombreBarrio || direccionExacta);
            return;
        }

        const clienteName = activePricingClient || activeBusiness.nombre;
        try {
            const queryParams = new URLSearchParams({
                cliente: clienteName,
                barrio: nombreBarrio || '',
                direccion: direccionExacta || ''
            });

            const response = await fetch(`/api/cotizar?${queryParams.toString()}`);
            const data = await response.json();

            if (data.status === 'success') {
                selectedCotizacion = data.cotizacion;
                renderResultCard(selectedCotizacion);
                const destData = {
                    ...selectedCotizacion.destino,
                    direccion_exacta: selectedCotizacion.direccion_exacta,
                    tarifa_total: selectedCotizacion.tarifa_total,
                    distancia_km: selectedCotizacion.distancia_km
                };
                window.RapidinMap.updateRoute(destData);
            } else {
                showToast("⚠️ " + (data.message || "No se pudo realizar la cotización para el destino seleccionado."));
            }
        } catch (err) {
            console.error("Error al cotizar barrio/dirección:", err);
            showToast("❌ Error al conectar con el servidor backend.");
        }
    }

    /* Render Quotation Result Card */
    function renderResultCard(cot) {
        const resultCard = document.getElementById('result-card');
        const emptyState = document.getElementById('empty-result-state');

        if (!resultCard || !emptyState) return;

        document.getElementById('res-barrio-name').textContent = cot.destino.barrio;
        document.getElementById('res-barrio-zona').textContent = `Zona ${cot.destino.zona}`;

        // Mostrar u ocultar bloque de dirección exacta
        const dirBox = document.getElementById('res-direccion-box');
        const dirVal = document.getElementById('res-direccion-exacta');
        if (dirBox && dirVal) {
            if (cot.direccion_exacta) {
                if (cot.barrio_asignado_cercano) {
                    dirVal.innerHTML = `${escapeHtml(cot.direccion_exacta)} <small style="display:block; color:#475569; font-weight:600; font-size:0.8rem; margin-top:2px;"><i class="fa-solid fa-crosshairs text-blue"></i> Barrio asignado por cercanía: <strong>${escapeHtml(cot.barrio_asignado_cercano)}</strong></small>`;
                } else {
                    dirVal.textContent = cot.direccion_exacta;
                }
                dirBox.style.display = 'flex';
            } else {
                dirBox.style.display = 'none';
            }
        }

        document.getElementById('res-price-amount').textContent = cot.tarifa_total.toLocaleString('es-CO');
        document.getElementById('res-distancia').textContent = `${cot.distancia_km} km`;
        document.getElementById('res-tiempo').textContent = `${cot.tiempo_entrega_min} min`;

        document.getElementById('res-tarifa-base').textContent = `$${cot.tarifa_base.toLocaleString('es-CO')} COP`;
        document.getElementById('res-recargo').textContent = `$${cot.recargo_distancia.toLocaleString('es-CO')} COP`;
        document.getElementById('res-total-breakdown').textContent = `$${cot.tarifa_total.toLocaleString('es-CO')} COP`;

        const gmapsBtn = document.getElementById('btn-google-maps');
        if (gmapsBtn) {
            gmapsBtn.href = cot.google_maps_url;
        }

        emptyState.style.display = 'none';
        resultCard.style.display = 'block';
    }

    function resetResultCard() {
        document.getElementById('result-card').style.display = 'none';
        document.getElementById('empty-result-state').style.display = 'block';
    }

    /* Order Creation Modal Handler */
    function initOrderModal() {
        const modal = document.getElementById('modal-pedido');
        const btnCrear = document.getElementById('btn-crear-orden');
        const btnClose = document.getElementById('close-modal-btn');
        const btnCancel = document.getElementById('btn-cancel-modal');
        const orderForm = document.getElementById('order-form');

        if (!modal) return;

        btnCrear?.addEventListener('click', () => {
            if (!selectedCotizacion) return;
            if (!activeBusiness) {
                openLoginModal();
                return;
            }
            document.getElementById('order-barrio').value = selectedCotizacion.destino.barrio;
            document.getElementById('order-precio').value = `$${selectedCotizacion.tarifa_total.toLocaleString('es-CO')} COP`;
            document.getElementById('order-empresa').value = activeBusiness.nombre;

            // Autocompletar la dirección exacta si el usuario la cotizó previamente
            const dirInput = document.getElementById('order-direccion');
            if (dirInput && selectedCotizacion.direccion_exacta) {
                dirInput.value = selectedCotizacion.direccion_exacta;
            }

            modal.style.display = 'flex';
        });

        const closeModal = () => modal.style.display = 'none';
        btnClose?.addEventListener('click', closeModal);
        btnCancel?.addEventListener('click', closeModal);

        orderForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedCotizacion) return;

            const direccion = document.getElementById('order-direccion').value.trim();
            const notas = document.getElementById('order-notas').value.trim();

            const payload = {
                cliente_empresa: activeBusiness ? activeBusiness.nombre : "Mailys",
                barrio_destino: selectedCotizacion.destino.barrio,
                direccion_destino: direccion,
                notas: notas,
                tarifa_total: selectedCotizacion.tarifa_total,
                distancia_km: selectedCotizacion.distancia_km
            };

            try {
                const response = await fetch('/api/pedidos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const res = await response.json();
                if (res.status === 'success') {
                    closeModal();
                    showToast(`✅ Domicilio ${res.pedido.id} creado con éxito para ${res.pedido.barrio_destino}.`);
                    document.getElementById('order-direccion').value = '';
                    document.getElementById('order-notas').value = '';
                }
            } catch (err) {
                console.error("Error al crear pedido:", err);
                showToast("❌ Error al guardar la solicitud.");
            }
        });
    }

    function setupPasswordToggle(inputId, toggleId) {
        const input = document.getElementById(inputId);
        const toggle = document.getElementById(toggleId);
        if (!input || !toggle) return;

        toggle.addEventListener('click', () => {
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';

            const icon = toggle.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            }
        });
    }

    function showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.innerHTML = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    function escapeHtml(str) {
        return String(str || '').replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }

    /* =========================================================================
     * Visitor Landing - Business Cards Rendering
     * ======================================================================= */
    function renderVisitorLanding() {
        const grid = document.getElementById('visitor-cards-grid');
        if (!grid) return;

        if (!clientsData || clientsData.length === 0) {
            grid.innerHTML = `
                <div class="visitor-no-businesses">
                    <i class="fa-solid fa-store-slash"></i>
                    <p>No hay negocios registrados todavía.</p>
                </div>`;
            return;
        }

        grid.innerHTML = clientsData.map(c => {
            const name = escapeHtml(c.nombre || 'Negocio');
            const desc = escapeHtml(c.descripcion || 'Gestión de domicilios con Rapidin Corp.');
            const cat = escapeHtml(c.categoria || 'Comercial');
            const photo = c.foto_perfil || '';

            const photoHtml = photo
                ? `<img class="biz-card-photo" src="${photo}" alt="${name}">`
                : `<div class="biz-card-photo-placeholder"><i class="fa-solid fa-store"></i></div>`;

            return `
                <div class="biz-card">
                    ${photoHtml}
                    <div class="biz-card-body">
                        <span class="biz-card-category"><i class="fa-solid fa-tag"></i> ${cat}</span>
                        <h3 class="biz-card-name">${name}</h3>
                        <p class="biz-card-desc">${desc}</p>
                        <span class="biz-card-cta"><img src="img/logo.png" alt="Logo" class="biz-cta-logo-img"> Domicilios Rapidin</span>
                    </div>
                </div>`;
        }).join('');
    }

    /* =========================================================================
     * Profile / Mi Negocio Tab
     * ======================================================================= */
    let profilePhotoBase64 = null;

    function initProfileTab() {
        const uploadArea = document.getElementById('photo-upload-area');
        const fileInput = document.getElementById('input-profile-photo');
        const clearBtn = document.getElementById('btn-clear-photo');
        const descTA = document.getElementById('profile-descripcion');
        const charCount = document.getElementById('profile-desc-chars');
        const saveBtn = document.getElementById('btn-save-profile');

        if (uploadArea && fileInput) {
            uploadArea.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    showToast('⚠️ La imagen supera los 2MB. Elige una más pequeña.');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    profilePhotoBase64 = ev.target.result;
                    // Update large preview
                    const largePreview = document.getElementById('photo-preview-large');
                    const placeholder = document.getElementById('photo-upload-placeholder');
                    if (largePreview) { largePreview.src = profilePhotoBase64; largePreview.style.display = 'block'; }
                    if (placeholder) placeholder.style.display = 'none';
                    if (clearBtn) clearBtn.style.display = 'inline-flex';
                    // Update small preview card
                    updateProfilePreviewPhoto(profilePhotoBase64);
                };
                reader.readAsDataURL(file);
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                profilePhotoBase64 = '';
                const largePreview = document.getElementById('photo-preview-large');
                const placeholder = document.getElementById('photo-upload-placeholder');
                if (largePreview) { largePreview.src = ''; largePreview.style.display = 'none'; }
                if (placeholder) placeholder.style.display = 'flex';
                clearBtn.style.display = 'none';
                if (fileInput) fileInput.value = '';
                updateProfilePreviewPhoto('');
            });
        }

        if (descTA && charCount) {
            descTA.addEventListener('input', () => {
                charCount.textContent = `${descTA.value.length} / 140`;
                const previewDesc = document.getElementById('preview-description');
                if (previewDesc) previewDesc.textContent = descTA.value || 'Descripción corta de tu negocio...';
            });
        }

        const catSelect = document.getElementById('profile-categoria');
        if (catSelect) {
            catSelect.addEventListener('change', () => {
                const badge = document.getElementById('preview-category-badge');
                if (badge) badge.textContent = catSelect.value;
            });
        }

        const dirInput = document.getElementById('profile-direccion');
        if (dirInput) {
            dirInput.addEventListener('input', () => {
                const previewAddr = document.getElementById('preview-address');
                if (previewAddr) previewAddr.textContent = dirInput.value || 'Dirección';
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', saveProfile);
        }
    }

    function loadProfileFromBusiness(business) {
        if (!business) return;
        const nameInput = document.getElementById('profile-nombre');
        const catSelect = document.getElementById('profile-categoria');
        const descTA = document.getElementById('profile-descripcion');
        const dirInput = document.getElementById('profile-direccion');
        const charCount = document.getElementById('profile-desc-chars');

        if (nameInput) nameInput.value = business.nombre || '';
        if (catSelect && business.categoria) {
            const opt = catSelect.querySelector(`option[value="${business.categoria}"]`);
            if (opt) catSelect.value = business.categoria;
        }
        if (descTA) {
            descTA.value = business.descripcion || '';
            if (charCount) charCount.textContent = `${descTA.value.length} / 140`;
        }
        if (dirInput) dirInput.value = business.direccion || '';

        // Photo
        profilePhotoBase64 = business.foto_perfil || null;
        const largePreview = document.getElementById('photo-preview-large');
        const placeholder = document.getElementById('photo-upload-placeholder');
        const clearBtn = document.getElementById('btn-clear-photo');

        if (profilePhotoBase64) {
            if (largePreview) { largePreview.src = profilePhotoBase64; largePreview.style.display = 'block'; }
            if (placeholder) placeholder.style.display = 'none';
            if (clearBtn) clearBtn.style.display = 'inline-flex';
        } else {
            if (largePreview) { largePreview.src = ''; largePreview.style.display = 'none'; }
            if (placeholder) placeholder.style.display = 'flex';
            if (clearBtn) clearBtn.style.display = 'none';
        }

        // Update preview card
        const previewName = document.getElementById('preview-business-name');
        const previewDesc = document.getElementById('preview-description');
        const previewBadge = document.getElementById('preview-category-badge');
        const previewAddr = document.getElementById('preview-address');
        if (previewName) previewName.textContent = business.nombre || 'Nombre del Negocio';
        if (previewDesc) previewDesc.textContent = business.descripcion || 'Descripción corta de tu negocio...';
        if (previewBadge) previewBadge.textContent = business.categoria || 'Categoría';
        if (previewAddr) previewAddr.textContent = business.direccion || 'Dirección';
        updateProfilePreviewPhoto(profilePhotoBase64 || '');
    }

    function updateProfilePreviewPhoto(src) {
        const wrap = document.getElementById('preview-photo-img');
        if (!wrap) return;
        if (src) {
            wrap.innerHTML = `<img src="${src}" alt="Foto" style="width:100%;height:100%;object-fit:cover;">`;
        } else {
            wrap.innerHTML = `<i class="fa-solid fa-store preview-default-icon"></i>`;
        }
    }

    async function saveProfile() {
        if (!activeBusiness) {
            showToast('⚠️ Debes iniciar sesión para guardar tu perfil.');
            return;
        }

        const catSelect = document.getElementById('profile-categoria');
        const descTA = document.getElementById('profile-descripcion');
        const dirInput = document.getElementById('profile-direccion');
        const saveBtn = document.getElementById('btn-save-profile');

        const payload = {
            cliente: activeBusiness.nombre,
            categoria: catSelect ? catSelect.value : '',
            descripcion: descTA ? descTA.value : '',
            direccion: dirInput ? dirInput.value : '',
        };

        if (profilePhotoBase64 !== null) {
            payload.foto_perfil = profilePhotoBase64;
        }

        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

        try {
            const res = await fetch('/api/clientes/update-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'success') {
                // Update local activeBusiness
                activeBusiness = { ...activeBusiness, ...data.cliente };
                localStorage.setItem('rapidin_business', JSON.stringify(activeBusiness));
                // Also update map origin address if changed
                if (dirInput && dirInput.value) {
                    const addrEl = document.getElementById('origin-business-address');
                    if (addrEl) addrEl.textContent = dirInput.value;
                }
                showToast('✅ Perfil actualizado con éxito. ¡Tu tarjeta ya es visible para los visitantes!');
                // Refresh visitor cards data
                loadRegisteredBusinesses();
            } else {
                showToast(`❌ Error: ${data.message}`);
            }
        } catch (err) {
            showToast('❌ Error de conexión al guardar el perfil.');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Cambios de Perfil'; }
        }
    }

    return {
        showToast: showToast,
        loadBarrios: loadBarrios,
        switchBusiness: switchBusiness
    };
})();
