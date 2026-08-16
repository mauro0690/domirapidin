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

        // Iniciar reloj en vivo de Colombia y comprobación de recargo nocturno cada segundo
        checkColombiaNightSurcharge();
        setInterval(checkColombiaNightSurcharge, 1000);

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
            const clientAddrStr = activeClientObj ? (activeClientObj.direccion_origen || activeClientObj.direccion || '') : "Calle 38 #31-42, Centro - Villavicencio";
            if (originAddr) {
                originAddr.textContent = clientAddrStr;
            }
            if (activeClientObj) {
                window.RapidinMap.setOrigin(activeClientObj.latitud_origen || activeClientObj.latitud || 4.1488, activeClientObj.longitud_origen || activeClientObj.longitud || -73.6339, activeClientObj.nombre, clientAddrStr);
            } else {
                window.RapidinMap.setOrigin(4.1488, -73.6339, "Sede Principal Centro", "Calle 38 #31-42, Centro - Villavicencio");
            }
        } else {
            if (originName) {
                originName.style.display = 'inline';
                originName.textContent = business.nombre;
            }
            const bizAddrStr = business.direccion_origen || business.direccion || "Calle 38 #31-42, Centro - Villavicencio";
            if (originAddr) originAddr.textContent = bizAddrStr;
            activePricingClient = business.nombre;
            window.RapidinMap.setOrigin(
                business.latitud_origen || business.latitud || 4.1488,
                business.longitud_origen || business.longitud || -73.6339,
                business.nombre,
                bizAddrStr
            );
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
        const clientAddrStr = client ? (client.direccion_origen || client.direccion || '') : "Calle 38 #31-42, Centro - Villavicencio";
        if (originAddr) {
            originAddr.textContent = clientAddrStr;
        }
        if (client) {
            window.RapidinMap.setOrigin(client.latitud_origen || client.latitud || 4.1488, client.longitud_origen || client.longitud || -73.6339, client.nombre, clientAddrStr);
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
                    const freshClient = clientsData.find(c => c.nombre.toLowerCase() === activeBusiness.nombre.toLowerCase() || c.id === activeBusiness.id);
                    if (freshClient) {
                        activeBusiness = { ...activeBusiness, ...freshClient };
                        localStorage.setItem('rapidin_business', JSON.stringify(activeBusiness));
                        applyBusinessSession(activeBusiness);
                    } else {
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
                <td><input type="text" data-field="usuario" value="${escapeHtml(c.usuario || ('user_' + (c.slug || '')))}" style="font-weight:600; color:#0f172a;"></td>
                <td>
                    <div style="position: relative; display: flex; align-items: center; width: 100%;">
                        <input type="password" data-field="codigo_acceso" value="${c.codigo_acceso && c.codigo_acceso.startsWith('pbkdf2:') ? '••••••••' : escapeHtml(c.codigo_acceso || '')}" style="font-weight:700; color:#1d4ed8; padding-right: 2.2rem; width: 100%;">
                        <button type="button" class="btn-toggle-row-pwd" style="position: absolute; right: 8px; background: none; border: none; cursor: pointer; color: #64748b;" title="Mostrar/Ocultar Contraseña">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </td>
                <td><input type="text" data-field="direccion_origen" value="${escapeHtml(c.direccion_origen || c.direccion || '')}"></td>
                <td><input type="number" step="0.0001" data-field="latitud_origen" value="${c.latitud_origen !== undefined ? c.latitud_origen : (c.latitud !== undefined ? c.latitud : 4.1488)}" style="width: 90px;"></td>
                <td><input type="number" step="0.0001" data-field="longitud_origen" value="${c.longitud_origen !== undefined ? c.longitud_origen : (c.longitud !== undefined ? c.longitud : -73.6339)}" style="width: 90px;"></td>
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

    let currentSelectedBarrio = null;

    /* Check Colombia Timezone & Update Live Clock / Night Surcharge Card (10 PM to 6 AM) */
    function checkColombiaNightSurcharge() {
        const now = new Date();
        let hour = now.getHours();
        let timeStr = "";

        try {
            timeStr = now.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            const colHourStr = now.toLocaleTimeString('en-US', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit' });
            hour = parseInt(colHourStr, 10);
        } catch (e) {
            timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        }

        const esNocturno = hour >= 22 || hour < 6;

        // Update Live Colombia Clock
        const clockEl = document.getElementById('clock-colombia-time');
        if (clockEl) clockEl.textContent = timeStr;

        // Update Night Surcharge Badge & Card UI
        const badge = document.getElementById('night-status-badge');
        const badgeText = document.getElementById('night-badge-text');
        const iconBg = document.getElementById('night-icon-bg');
        const iconSymbol = document.getElementById('night-icon-symbol');

        if (badge && badgeText) {
            if (esNocturno) {
                badge.style.background = '#e0e7ff';
                badge.style.color = '#3730a3';
                badge.style.border = '1px solid #c7d2fe';
                badgeText.innerHTML = '<i class="fa-solid fa-moon"></i> 🌙 ACTIVO (+$1.000 COP)';
                if (iconBg) iconBg.style.background = '#e0e7ff';
                if (iconSymbol) { iconSymbol.className = 'fa-solid fa-moon'; iconSymbol.style.color = '#4f46e5'; }
            } else {
                badge.style.background = '#fef3c7';
                badge.style.color = '#92400e';
                badge.style.border = '1px solid #fde68a';
                badgeText.innerHTML = '<i class="fa-solid fa-sun"></i> ☀️ Horario Diurno (+$0 COP)';
                if (iconBg) iconBg.style.background = '#fef3c7';
                if (iconSymbol) { iconSymbol.className = 'fa-solid fa-sun'; iconSymbol.style.color = '#d97706'; }
            }
        }

        return esNocturno;
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

    /* Search Input & Live Autocomplete (Exclusivo por Barrio) */
    function initSearchAndAutocomplete() {
        const input = document.getElementById('barrio-input');
        const clearBtn = document.getElementById('clear-search-btn');
        const dropdown = document.getElementById('autocomplete-list');

        if (!input || !dropdown) return;

        checkColombiaNightSurcharge();

        function recalculateSurchargesLive() {
            const selectedRainOpt = document.querySelector('input[name="rain-option"]:checked')?.value || 'no';
            const isRainChecked = selectedRainOpt === 'si';
            const esNocturno = checkColombiaNightSurcharge();

            const lblSi = document.getElementById('lbl-rain-si');
            const lblNo = document.getElementById('lbl-rain-no');
            if (lblSi && lblNo) {
                if (isRainChecked) {
                    lblSi.style.borderColor = '#2563eb';
                    lblSi.style.background = '#eff6ff';
                    lblSi.style.color = '#1e40af';
                    lblNo.style.borderColor = '#cbd5e1';
                    lblNo.style.background = '#f8fafc';
                    lblNo.style.color = '#1e293b';
                } else {
                    lblNo.style.borderColor = '#2563eb';
                    lblNo.style.background = '#eff6ff';
                    lblNo.style.color = '#1e40af';
                    lblSi.style.borderColor = '#cbd5e1';
                    lblSi.style.background = '#f8fafc';
                    lblSi.style.color = '#1e293b';
                }
            }

            if (selectedCotizacion) {
                const baseBarrio = selectedCotizacion.tarifa_barrio || selectedCotizacion.destino?.tarifa_total || 6000;
                const recargoLluvia = isRainChecked ? 1000 : 0;
                const recargoNocturno = esNocturno ? 1000 : 0;
                const totalCalculado = baseBarrio + recargoNocturno + recargoLluvia;

                selectedCotizacion.recargo_lluvia = recargoLluvia;
                selectedCotizacion.recargo_nocturno = recargoNocturno;
                selectedCotizacion.tarifa_total = totalCalculado;

                renderResultCard(selectedCotizacion);
            }
        }

        document.querySelectorAll('input[name="rain-option"]').forEach(radio => {
            radio.addEventListener('change', recalculateSurchargesLive);
        });

        input.addEventListener('input', (e) => {
            const rawVal = e.target.value;
            const val = rawVal.trim().toLowerCase();
            clearBtn.style.display = val ? 'block' : 'none';

            if (!val) {
                dropdown.classList.remove('show');
                return;
            }

            // Filtrar exclusivamente por coincidencias de nombre de barrio o zona
            const matches = barriosData.filter(b =>
                b.barrio.toLowerCase().includes(val) || b.zona.toLowerCase().includes(val)
            );

            renderAutocompleteDropdown(matches, dropdown, input);
        });

        // Soporte para presionar ENTER en el input de búsqueda
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const rawVal = input.value.trim();
                if (!rawVal) return;

                dropdown.classList.remove('show');

                // Encontrar el primer barrio coincidente en la base de datos
                const match = barriosData.find(b => b.barrio.toLowerCase() === rawVal.toLowerCase()) ||
                    barriosData.find(b => b.barrio.toLowerCase().includes(rawVal.toLowerCase()));

                if (match) {
                    input.value = match.barrio;
                    seleccionarBarrio(match.barrio);
                } else {
                    showToast("⚠️ Barrio no encontrado en la base de datos de " + (activePricingClient || "este negocio") + ". Elige un barrio de la lista desplegable.");
                }
            }
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            dropdown.classList.remove('show');
            currentSelectedBarrio = null;
            resetResultCard();
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    function renderAutocompleteDropdown(matches, dropdown, input) {
        dropdown.innerHTML = '';

        if (matches.length === 0) {
            dropdown.innerHTML = `<div class="suggestion-item"><span class="item-sub">No se encontró ningún barrio con ese nombre en la base de datos. Revisa la ortografía.</span></div>`;
            dropdown.classList.add('show');
            return;
        }

        matches.slice(0, 15).forEach(item => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.innerHTML = `
                <div>
                    <div class="item-title"><i class="fa-solid fa-city text-blue"></i> ${escapeHtml(item.barrio)}</div>
                    <div class="item-sub">Zona: ${escapeHtml(item.zona)}</div>
                </div>
                <div class="item-price">$${item.tarifa_total.toLocaleString('es-CO')}</div>
            `;
            div.addEventListener('click', () => {
                input.value = item.barrio;
                dropdown.classList.remove('show');
                seleccionarBarrio(item.barrio);
            });
            dropdown.appendChild(div);
        });

        dropdown.classList.add('show');
    }

    /* Query Quotation for selected barrio */
    async function seleccionarBarrio(nombreBarrio) {
        if (!nombreBarrio) return;

        if (!activeBusiness) {
            // Solicitar autenticación de cliente antes de cotizar
            openLoginModal(nombreBarrio);
            return;
        }

        currentSelectedBarrio = nombreBarrio;
        const clienteName = activePricingClient || activeBusiness.nombre;
        const rainOpt = document.querySelector('input[name="rain-option"]:checked')?.value || 'no';

        try {
            const queryParams = new URLSearchParams({
                cliente: clienteName,
                barrio: nombreBarrio,
                lluvia: rainOpt === 'si' ? '1' : '0'
            });

            const response = await fetch(`/api/cotizar?${queryParams.toString()}`);
            const data = await response.json();

            if (data.status === 'success') {
                selectedCotizacion = data.cotizacion;
                renderResultCard(selectedCotizacion);
                const destData = {
                    ...selectedCotizacion.destino,
                    tarifa_total: selectedCotizacion.tarifa_total,
                    distancia_km: selectedCotizacion.distancia_km
                };
                window.RapidinMap.updateRoute(destData);
            } else {
                showToast("⚠️ " + (data.message || "No se pudo realizar la cotización para el barrio seleccionado."));
            }
        } catch (err) {
            console.error("Error al cotizar barrio:", err);
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

        document.getElementById('res-price-amount').textContent = cot.tarifa_total.toLocaleString('es-CO');
        document.getElementById('res-distancia').textContent = `${cot.distancia_km} km`;
        document.getElementById('res-tiempo').textContent = `${cot.tiempo_entrega_min} min`;

        // Desglose de Tarifas y Recargos Especiales
        document.getElementById('res-tarifa-barrio').textContent = `$${(cot.tarifa_barrio || cot.tarifa_total).toLocaleString('es-CO')} COP`;

        const resNocturno = document.getElementById('res-recargo-nocturno');
        if (resNocturno) {
            if (cot.recargo_nocturno > 0) {
                resNocturno.textContent = `+$${cot.recargo_nocturno.toLocaleString('es-CO')} COP`;
                resNocturno.style.color = '#4f46e5';
                resNocturno.style.fontWeight = '700';
            } else {
                resNocturno.textContent = `$0 COP`;
                resNocturno.style.color = '#64748b';
                resNocturno.style.fontWeight = '500';
            }
        }

        const resLluvia = document.getElementById('res-recargo-lluvia');
        if (resLluvia) {
            if (cot.recargo_lluvia > 0) {
                resLluvia.textContent = `+$${cot.recargo_lluvia.toLocaleString('es-CO')} COP`;
                resLluvia.style.color = '#2563eb';
                resLluvia.style.fontWeight = '700';
            } else {
                resLluvia.textContent = `$0 COP`;
                resLluvia.style.color = '#64748b';
                resLluvia.style.fontWeight = '500';
            }
        }

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

            const clienteEmpresa = activeBusiness ? activeBusiness.nombre : "Mailys";
            const direccionOrigen = activeBusiness ? (activeBusiness.direccion_origen || activeBusiness.direccion || "Villavicencio") : "Villavicencio";
            const barrioDestino = selectedCotizacion.destino.barrio;
            const zonaDestino = selectedCotizacion.destino.zona;
            const tarifaBarrio = selectedCotizacion.tarifa_barrio || selectedCotizacion.destino.tarifa_total || selectedCotizacion.tarifa_total;
            const recargoNocturno = selectedCotizacion.recargo_nocturno || 0;
            const recargoLluvia = selectedCotizacion.recargo_lluvia || 0;
            const totalPagar = selectedCotizacion.tarifa_total;
            const tiempoEntrega = selectedCotizacion.tiempo_entrega_min;
            const mapsUrl = selectedCotizacion.google_maps_url;

            // Construir mensaje estructurado para WhatsApp (+57 310 3421690)
            const waMessage = 
`🚀 *SOLICITUD DE DOMICILIO - DOMICILIOS RAPIDIN* 🚀

🏢 *Cliente / Empresa:* ${clienteEmpresa}
📍 *Origen (Sede Despacho):* ${direccionOrigen}

🏘️ *Barrio Destino:* ${barrioDestino} (Zona ${zonaDestino})
📍 *Dirección de Entrega:* ${direccion || 'No especificada'}
📝 *Notas / Indicaciones:* ${notas || 'Sin observaciones'}

💰 *DESGLOSE DE TARIFA:*
• Tarifa Base Barrio: $${tarifaBarrio.toLocaleString('es-CO')} COP
• Recargo Nocturno: +$${recargoNocturno.toLocaleString('es-CO')} COP
• Recargo por Lluvia: +$${recargoLluvia.toLocaleString('es-CO')} COP
📌 *TOTAL DOMICILIO:* $${totalPagar.toLocaleString('es-CO')} COP

⏱️ *Tiempo Estimado:* ${tiempoEntrega} min
🗺️ *Ruta Google Maps:* ${mapsUrl}`;

            const phoneWhatsApp = "573103421690";
            const waUrl = `https://api.whatsapp.com/send?phone=${phoneWhatsApp}&text=${encodeURIComponent(waMessage)}`;

            // Guardar registro en el servidor backend (/api/pedidos)
            const payload = {
                cliente_empresa: clienteEmpresa,
                barrio_destino: barrioDestino,
                direccion_destino: direccion,
                notas: notas,
                tarifa_total: totalPagar,
                distancia_km: selectedCotizacion.distancia_km,
                whatsapp_destino: "+57 310 3421690"
            };

            try {
                await fetch('/api/pedidos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (err) {
                console.error("Error al registrar pedido:", err);
            }

            // Redirigir a WhatsApp
            window.open(waUrl, '_blank');
            closeModal();
            showToast(`📲 Solicitud de Domicilio enviada a WhatsApp (+57 310 3421690).`);
            document.getElementById('order-direccion').value = '';
            document.getElementById('order-notas').value = '';
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
        const userInput = document.getElementById('profile-usuario');
        const catSelect = document.getElementById('profile-categoria');
        const descTA = document.getElementById('profile-descripcion');
        const dirInput = document.getElementById('profile-direccion');
        const charCount = document.getElementById('profile-desc-chars');

        if (nameInput) nameInput.value = business.nombre || '';
        if (userInput) userInput.value = business.usuario || ('user_' + (business.slug || ''));
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
