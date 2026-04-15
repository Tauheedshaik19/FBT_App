let currentInventoryTab = 'dashboard';
let batchState = {
    out: [],
    in: [],
    register: []
};
let assetRegistryFiltersAttached = false;
let latestFilteredAssets = [];
let globalLoadingCount = 0;
const INVENTORY_DASHBOARD_CATEGORIES = ['CH Logger', 'TZ Logger', 'ITH Logger'];

function hasMappingPermission(permission, fallback = true) {
    return typeof hasAppPermission === 'function' ? hasAppPermission(permission) : fallback;
}

function showMappingPermissionError(message) {
    showToast(message, 'error');
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconClass = type === 'success'
        ? 'fa-check-circle'
        : type === 'info'
            ? 'fa-info-circle'
            : 'fa-exclamation-circle';
    const iconColor = type === 'success'
        ? '#10b981'
        : type === 'info'
            ? '#3b82f6'
            : '#ef4444';
    toast.innerHTML = `
        <i class="fas ${iconClass}" style="color: ${iconColor}"></i>
        <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function setGlobalLoading(isLoading, message = 'Loading...') {
    const overlay = document.getElementById('global-loading-overlay');
    const text = document.getElementById('global-loading-text');
    if (!overlay) return;

    if (isLoading) {
        globalLoadingCount += 1;
        if (text) text.innerText = message;
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');
        return;
    }

    globalLoadingCount = Math.max(0, globalLoadingCount - 1);
    if (globalLoadingCount === 0) {
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
        if (text) text.innerText = 'Loading...';
    }
}

function updateGlobalLoadingMessage(message) {
    const text = document.getElementById('global-loading-text');
    if (text && globalLoadingCount > 0) {
        text.innerText = message;
    }
}

async function withGlobalLoading(message, task) {
    setGlobalLoading(true, message);
    try {
        return await task();
    } finally {
        setGlobalLoading(false);
    }
}

/**
 * Navigation Control
 */
function switchInventorySubView(tab, btn) {
    currentInventoryTab = tab;
    
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.sub-view').forEach(v => v.style.display = 'none');
    const target = document.getElementById(`sub-view-${tab}`);
    if (target) {
        target.style.display = 'block';
        if (tab === 'dashboard') loadInventoryDashboard();
        if (tab === 'mapping') { loadMappingData(); populateInventoryDropdowns(); }
        if (tab === 'completed-reports') loadCompletedReports();
        if (tab === 'assets') { loadAdvancedAssets(); populateInventoryDropdowns(); }
        if (tab === 'history') loadHistory();
        if (tab === 'book-out') renderBatchTable('out');
        if (tab === 'book-in') renderBatchTable('in');
        if (tab === 'register') renderBatchTable('register');
    }
}

async function loadInventoryDashboard() {
    try {
        const { data: inventory, error } = await window.supabaseClient
            .from('inventory')
            .select('status, condition_status, category, name, ch_number, serial_number');
        if (error) throw error;

        const allAssets = inventory || [];
        const categories = [...INVENTORY_DASHBOARD_CATEGORIES];
        const categoryStats = {};

        categories.forEach(cat => {
            const catItems = allAssets.filter(i => inferInventoryCategory(i) === cat);
            categoryStats[cat] = {
                total: catItems.length,
                inStock: catItems.filter(i => getAssetAvailabilityState(i.status).bucket === 'available').length,
                bookedOut: catItems.filter(i => getAssetAvailabilityState(i.status).bucket === 'deployed').length,
                faulty: catItems.filter(i => getAssetConditionState(i.condition_status).bucket === 'faulty').length,
                damaged: catItems.filter(i => getAssetConditionState(i.condition_status).bucket === 'damaged').length,
                missing: catItems.filter(i => getAssetConditionState(i.condition_status).bucket === 'missing').length
            };
        });

        // Update UI for each category
        const prefixMap = { 'CH Logger': 'ch', 'TZ Logger': 'tz', 'ITH Logger': 'ith' };
        const totalAssets = allAssets.length;
        const totalAvailable = allAssets.filter(i => getAssetAvailabilityState(i.status).bucket === 'available').length;
        const totalDeployed = allAssets.filter(i => getAssetAvailabilityState(i.status).bucket === 'deployed').length;
        const totalAttention = allAssets.filter(i => {
            const bucket = getAssetConditionState(i.condition_status).bucket;
            return ['faulty', 'damaged', 'missing'].includes(bucket);
        }).length;

        categories.forEach(cat => {
            const prefix = prefixMap[cat];
            const stats = categoryStats[cat];
            const attention = stats.faulty + stats.damaged + stats.missing;
            const availability = stats.total ? Math.round((stats.inStock / stats.total) * 100) : 0;

            document.getElementById(`stats-${prefix}-total`).innerText = stats.total;
            document.getElementById(`stats-${prefix}-in-stock`).innerText = stats.inStock;
            document.getElementById(`stats-${prefix}-booked-out`).innerText = stats.bookedOut;
            document.getElementById(`stats-${prefix}-faulty`).innerText = stats.faulty;
            document.getElementById(`stats-${prefix}-damaged`).innerText = stats.damaged;
            document.getElementById(`stats-${prefix}-missing`).innerText = stats.missing;
            document.getElementById(`stats-${prefix}-availability`).innerText = availability;

            document.getElementById(`summary-${prefix}-total`).innerText = stats.total;
            document.getElementById(`summary-${prefix}-available`).innerText = stats.inStock;
            document.getElementById(`summary-${prefix}-deployed`).innerText = stats.bookedOut;
            document.getElementById(`summary-${prefix}-risk`).innerText = attention;
            document.getElementById(`summary-${prefix}-availability`).innerText = `${availability}%`;
        });

        document.getElementById('inventory-overview-total').innerText = totalAssets;
        document.getElementById('inventory-overview-available').innerText = totalAvailable;
        document.getElementById('inventory-overview-deployed').innerText = totalDeployed;
        document.getElementById('inventory-overview-alert').innerText = totalAttention;

    } catch (err) { console.error("Dashboard Load Error:", err); }
}

async function populateInventoryDropdowns() {
    try {
        const { data: clients } = await window.supabaseClient.from('clients').select('id, client_name').order('client_name');
        
        if (!clients || clients.length === 0) {
            console.warn('No clients found in database');
            return;
        }

        // repCustomer and assetCustomerFilter get "All" option
        ['repCustomer', 'assetCustomerFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="all">All</option>' + 
                    (clients || []).map(c => `<option value="${c.client_name}">${c.client_name}</option>`).join('');
            }
        });

        // mapCustomer does NOT get "All" option - user must select a specific customer
        const mapEl = document.getElementById('mapCustomer');
        if (mapEl) {
            mapEl.innerHTML = '<option value="">-- Select Customer --</option>' + 
                (clients || []).map(c => `<option value="${c.client_name}">${c.client_name}</option>`).join('');
        }

    } catch (err) { console.error("Dropdown Populate Error:", err); }
}

function attachAssetRegistryFilters() {
    if (assetRegistryFiltersAttached) return;
    assetRegistryFiltersAttached = true;

    const controls = [
        { id: 'assetSearchInput', event: 'input' },
        { id: 'assetStatusFilter', event: 'change' },
        { id: 'assetConditionFilter', event: 'change' },
        { id: 'assetTypeFilter', event: 'change' },
        { id: 'assetCustomerFilter', event: 'change' },
        { id: 'assetLimitFilter', event: 'change' }
    ];

    controls.forEach(({ id, event }) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener(event, () => {
            if (window.assetRegistryFilterTimeout) clearTimeout(window.assetRegistryFilterTimeout);
            window.assetRegistryFilterTimeout = setTimeout(() => {
                if (currentInventoryTab === 'assets') loadAdvancedAssets();
            }, 180);
        });
    });
}

function normalizeStatus(s) {
    if (s === null || s === undefined) return null;
    const v = String(s).trim();
    if (!v) return null;

    const lower = v.toLowerCase();
    if (/^booked\s*out$/i.test(lower)) return 'Booked Out';
    if (/^booked\s*in$/i.test(lower) || /^good$/i.test(lower) || /^in[\s-]*stock$/i.test(lower)) return 'In Stock';
    if (/^warning$/i.test(lower)) return 'Warning';
    return v;
}

function normalizeConditionStatus(s) {
    if (s === null || s === undefined) return 'Good';
    const v = String(s).trim();
    if (!v) return 'Good';

    const lower = v.toLowerCase();
    if (/^good$/i.test(lower) || /^ok$/i.test(lower) || /^in stock$/i.test(lower) || /^booked\s*in$/i.test(lower)) return 'Good';
    if (/^faulty$/i.test(lower) || /^warning$/i.test(lower)) return 'Faulty';
    if (/^damaged$/i.test(lower)) return 'Damaged';
    if (/^missing$/i.test(lower) || /^critical$/i.test(lower)) return 'Missing';
    if (/^needs\s*maintenance$/i.test(lower) || /^maintenance required$/i.test(lower)) return 'Needs Maintenance';
    return v;
}

function normalizeInventoryCategory(category) {
    if (category === null || category === undefined) return null;
    const value = String(category).trim();
    if (!value) return null;

    const lower = value.toLowerCase();
    if (lower === 'ch logger' || lower === 'ch') return 'CH Logger';
    if (lower === 'tz logger' || lower === 'tz') return 'TZ Logger';
    if (lower === 'ith logger' || lower === 'ith') return 'ITH Logger';
    return value;
}

function inferInventoryCategory(asset = {}) {
    const normalized = normalizeInventoryCategory(asset.category);
    if (INVENTORY_DASHBOARD_CATEGORIES.includes(normalized)) return normalized;

    const serial = String(asset.serial_number || '').trim().toUpperCase();
    const assetNumber = String(asset.ch_number || '').trim().toUpperCase();

    if (serial.startsWith('CH') || assetNumber.startsWith('CH')) return 'CH Logger';
    if (serial.startsWith('TZ') || assetNumber.startsWith('TZ')) return 'TZ Logger';
    if (serial.startsWith('ITH') || assetNumber.startsWith('ITH')) return 'ITH Logger';

    const searchSpace = [asset.category, asset.name, asset.ch_number, asset.serial_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    if (/(^|\b)ch([\s\-_]|\b)/i.test(searchSpace)) return 'CH Logger';
    if (/(^|\b)tz([\s\-_]|\b)/i.test(searchSpace)) return 'TZ Logger';
    if (/(^|\b)ith([\s\-_]|\b)/i.test(searchSpace)) return 'ITH Logger';
    return normalized;
}

function getAssetAvailabilityState(status) {
    const normalizedStatus = normalizeStatus(status);
    const isInStock = ['Booked In', 'In Stock'].includes(normalizedStatus) || !normalizedStatus;
    const isBookedOut = ['Booked Out', 'Warning'].includes(normalizedStatus);

    if (isBookedOut) {
        return {
            normalizedStatus,
            badgeClass: 'badge-orange',
            statusLabel: 'Booked Out',
            bucket: 'deployed'
        };
    }

    if (isInStock) {
        return {
            normalizedStatus: normalizedStatus || 'Booked In',
            badgeClass: 'badge-green',
            statusLabel: 'In Stock',
            bucket: 'available'
        };
    }

    return {
        normalizedStatus: normalizedStatus || 'Unknown',
        badgeClass: 'badge-gray',
        statusLabel: normalizedStatus || 'Unknown',
        bucket: 'unknown'
    };
}

function getAssetConditionState(condition) {
    const normalizedStatus = normalizeConditionStatus(condition);

    if (['Needs Maintenance', 'Faulty', 'Maintenance Required'].includes(normalizedStatus)) {
        return {
            normalizedStatus,
            badgeClass: 'badge-red',
            statusLabel: normalizedStatus,
            bucket: 'faulty'
        };
    }

    if (normalizedStatus === 'Damaged') {
        return {
            normalizedStatus,
            badgeClass: 'badge-red',
            statusLabel: 'Damaged',
            bucket: 'damaged'
        };
    }

    if (['Missing', 'Critical'].includes(normalizedStatus)) {
        return {
            normalizedStatus,
            badgeClass: 'badge-red',
            statusLabel: normalizedStatus,
            bucket: 'missing'
        };
    }

    return {
        normalizedStatus: normalizedStatus || 'Good',
        badgeClass: 'badge-green',
        statusLabel: normalizedStatus || 'Good',
        bucket: 'good'
    };
}

function isLoggerAsset(asset) {
    const category = inferInventoryCategory(asset) || normalizeInventoryCategory(asset.category);
    return ['Logger', 'CH Logger', 'TZ Logger', 'ITH Logger'].includes(category);
}

function getCalibrationReminder(asset) {
    if (!isLoggerAsset(asset) || !asset.calibration_date) {
        return { label: '-', sortDays: null, dueSoon: false, expired: false };
    }

    const calibrationDate = new Date(`${asset.calibration_date}T00:00:00`);
    if (Number.isNaN(calibrationDate.getTime())) {
        return { label: 'Invalid date', sortDays: null, dueSoon: false, expired: false };
    }

    const expiryDate = new Date(calibrationDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((expiryDate - today) / msPerDay);

    if (daysLeft < 0) {
        return {
            label: `Expired ${Math.abs(daysLeft)} day(s) ago`,
            expiryDate,
            sortDays: daysLeft,
            dueSoon: true,
            expired: true
        };
    }

    if (daysLeft <= 60) {
        return {
            label: `${daysLeft} day(s) left`,
            expiryDate,
            sortDays: daysLeft,
            dueSoon: true,
            expired: false
        };
    }

    return {
        label: 'Valid',
        expiryDate,
        sortDays: daysLeft,
        dueSoon: false,
        expired: false
    };
}

function formatSouthAfricaDateTime(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

function escapeCsvValue(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
}

function extractBatchSerial(value) {
    let serial = String(value || '').trim();
    if (!serial) return '';

    if (serial.includes('_')) {
        serial = serial.split('_').pop();
    }

    return serial.replace(/^"+|"+$/g, '').trim();
}

function normalizeSpreadsheetHeader(header) {
    return String(header || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function getSpreadsheetValue(row, aliases = []) {
    if (!row) return null;

    const normalizedEntries = new Map(
        Object.entries(row).map(([key, value]) => [normalizeSpreadsheetHeader(key), value])
    );

    for (const alias of aliases) {
        const value = normalizedEntries.get(normalizeSpreadsheetHeader(alias));
        if (value !== undefined && value !== null && String(value).trim() !== '') {
            return value;
        }
    }

    return null;
}

function normalizeImportedDate(value) {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }

    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed?.y && parsed?.m && parsed?.d) {
            const month = String(parsed.m).padStart(2, '0');
            const day = String(parsed.d).padStart(2, '0');
            return `${parsed.y}-${month}-${day}`;
        }
    }

    return String(value).trim();
}

function normalizeRegisterAvailabilityStatus(value, fallback = 'In Stock') {
    const normalized = normalizeStatus(value);
    if (['In Stock', 'Booked In', 'Booked Out', 'Warning'].includes(normalized)) {
        return normalized;
    }

    return fallback;
}

function getRegisterFormDefaults() {
    return {
        name: document.getElementById('regAssetName')?.value?.trim() || 'Logger',
        category: normalizeInventoryCategory(document.getElementById('regAssetCategory')?.value || 'Logger') || 'Logger',
        status: normalizeRegisterAvailabilityStatus(document.getElementById('regAssetStatus')?.value || 'In Stock'),
        condition_status: normalizeConditionStatus(document.getElementById('regAssetCondition')?.value || 'Good'),
        qty: 1,
        ch_number: document.getElementById('regAssetCH')?.value?.trim() || null,
        calibration_cert: document.getElementById('regCalibrationCert')?.value?.trim() || null,
        calibration_cert_number: document.getElementById('regCalibrationCert')?.value?.trim() || null,
        calibration_date: document.getElementById('regCalibrationDate')?.value?.trim() || null,
        re_calibration_date: document.getElementById('regReCalibrationDate')?.value?.trim() || null,
        current_site_name: document.getElementById('regCurrentSite')?.value?.trim() || null,
        current_customer: document.getElementById('regCurrentCustomer')?.value?.trim() || null,
        current_technician_name: document.getElementById('regCurrentTech')?.value?.trim() || null,
        current_protocol_number: document.getElementById('regCurrentProtocol')?.value?.trim() || null,
        last_movement_id: document.getElementById('regLastMovement')?.value?.trim() || null,
        notes: document.getElementById('regAssetNotes')?.value?.trim() || null
    };
}

function buildRegisterBatchItem(rawSerial, metadata = {}, formDefaults = getRegisterFormDefaults()) {
    const serial = extractBatchSerial(metadata.serial || metadata.serial_number || rawSerial);
    const defaultStatus = normalizeRegisterAvailabilityStatus(formDefaults.status, 'In Stock');
    const providedStatus = metadata.status ?? metadata.availability_status;
    const normalizedStatus = normalizeRegisterAvailabilityStatus(providedStatus, defaultStatus);
    const inferredConditionSource = metadata.condition_status
        ?? metadata.condition
        ?? (['In Stock', 'Booked In', 'Booked Out', 'Warning'].includes(normalizeStatus(providedStatus)) ? null : providedStatus)
        ?? formDefaults.condition_status;
    const categorySeed = {
        category: metadata.category,
        name: metadata.name,
        ch_number: metadata.ch_number,
        serial_number: serial
    };

    return {
        serial,
        scan: metadata.scan || rawSerial,
        imported: Boolean(metadata.imported),
        selected: metadata.selected !== false,
        verified: metadata.verified ?? null,
        verifyMsg: metadata.verifyMsg || '',
        status: normalizedStatus,
        condition_status: normalizeConditionStatus(inferredConditionSource),
        name: metadata.name?.toString().trim() || formDefaults.name || `Asset ${serial}`,
        category: normalizeInventoryCategory(metadata.category)
            || inferInventoryCategory(categorySeed)
            || formDefaults.category
            || 'Logger',
        qty: Number(metadata.qty ?? metadata.quantity ?? formDefaults.qty ?? 1) || 1,
        ch_number: metadata.ch_number?.toString().trim() || formDefaults.ch_number || null,
        calibration_cert: metadata.calibration_cert?.toString().trim()
            || metadata.calibration_cert_number?.toString().trim()
            || formDefaults.calibration_cert
            || null,
        calibration_cert_number: metadata.calibration_cert_number?.toString().trim()
            || metadata.calibration_cert?.toString().trim()
            || formDefaults.calibration_cert_number
            || formDefaults.calibration_cert
            || null,
        calibration_date: normalizeImportedDate(metadata.calibration_date) || formDefaults.calibration_date || null,
        re_calibration_date: normalizeImportedDate(metadata.re_calibration_date) || formDefaults.re_calibration_date || null,
        current_site_name: metadata.current_site_name?.toString().trim() || formDefaults.current_site_name || null,
        current_customer: metadata.current_customer?.toString().trim() || formDefaults.current_customer || null,
        current_technician_name: metadata.current_technician_name?.toString().trim() || formDefaults.current_technician_name || null,
        current_protocol_number: metadata.current_protocol_number?.toString().trim() || formDefaults.current_protocol_number || null,
        last_movement_id: metadata.last_movement_id?.toString().trim() || formDefaults.last_movement_id || null,
        notes: metadata.notes?.toString().trim() || formDefaults.notes || 'Initial registration'
    };
}

/**
 * Batch Scanning Logic
 */
function handleScanInput(event, type) {
    if (event.key === 'Enter') {
        const val = event.target.value.trim();
        if (!val) return;
        const metadata = type === 'register' ? getRegisterFormDefaults() : {};
        addSerialToBatch(val, type, false, metadata);
        event.target.value = '';
        renderBatchTable(type);
    }
}

function addSerialToBatch(val, type, isImported, metadata = {}) {
    const serial = extractBatchSerial(metadata.serial || metadata.serial_number || val);
    if (!serial) return;

    // Duplicate-in-list check
    if (batchState[type].some(item => String(item.serial || '').trim().toLowerCase() === serial.toLowerCase())) {
        showToast(`⚠️ ${serial} is already in the list — skipped`, 'error');
        return;
    }

    const item = type === 'register'
        ? buildRegisterBatchItem(val, { ...metadata, imported: isImported, scan: metadata.scan || val })
        : {
            serial,
            scan: val,
            imported: isImported,
            status: metadata.status || 'Good',
            verified: null,
            verifyMsg: '',
            selected: true,
            ...metadata
        };

    batchState[type].push(item);

    if (!isImported) {
        showToast(`✅ ${serial} added to list`, 'success');
    }
}

function appendBatchFromText(type) {
    const idMap = { out: 'bookOutListArea', in: 'bookInListArea', register: 'regListArea' };
    const area = document.getElementById(idMap[type]);
    if (!area) return;
    const lines = area.value.split('\n').map(s => s.trim()).filter(s => s);
    const registerDefaults = type === 'register' ? getRegisterFormDefaults() : {};
    let addedCount = 0;

    lines.forEach(line => {
        const beforeCount = batchState[type].length;
        addSerialToBatch(line, type, true, registerDefaults);
        if (batchState[type].length > beforeCount) {
            addedCount += 1;
        }
    });
    area.value = '';
    if (lines.length > 0) showToast(`✅ ${lines.length} serial(s) added to list`, 'success');
    renderBatchTable(type);
}

function replaceBatchFromText(type) {
    batchState[type] = [];
    appendBatchFromText(type);
}

function clearBatchList(type) {
    batchState[type] = [];
    renderBatchTable(type);
}

function undoLastScan(type) {
    batchState[type].pop();
    renderBatchTable(type);
}

function selectAllBatch(type) {
    batchState[type].forEach(i => i.selected = true);
    renderBatchTable(type);
}

function selectNoneBatch(type) {
    batchState[type].forEach(i => i.selected = false);
    renderBatchTable(type);
}

function applyBatchStatus(type) {
    const status = document.getElementById(`batchStatus${type === 'out' ? 'Out' : 'In'}`).value;
    const reason = document.getElementById(`batchReason${type === 'out' ? 'Out' : 'In'}`).value;
    if (!status) {
        showToast('Select a status first.', 'error');
        return;
    }
    
    batchState[type].forEach(item => {
        if (item.selected) {
            item.status = status;
            item.reason = reason;
        }
    });
    renderBatchTable(type);
}

/**
 * STRICT Verification Logic
 * 
 * Book Out: Asset MUST be in registry AND status must be 'Good' or 'Booked In'.
 *           Already 'Booked Out' → BLOCKED.
 *           Not in registry → BLOCKED (must register first).
 * 
 * Book In:  Asset MUST be in registry AND status must be 'Booked Out' or 'Warning'.
 *           Already 'Good'/'Booked In' → BLOCKED (already in stock).
 *           Not in registry → BLOCKED (use Register section).
 * 
 * Register: Serial must NOT already exist in registry → BLOCKED if found.
 */
async function verifyBatchList(type) {
    const selectedItems = batchState[type].filter(i => i.selected);
    if (selectedItems.length === 0) {
        showToast('No selected items in the list to verify', 'error');
        return;
    }

    try {
        // Reset all selected items to a "Verifying..." state first
        selectedItems.forEach(item => {
            item.verified = null;
            item.verifyMsg = '🔍 Verifying...';
        });
        renderBatchTable(type);

        const serials = selectedItems.map(i => i.serial);
        const { data: existing, error } = await window.supabaseClient
            .from('inventory')
            .select('serial_number, status')
            .in('serial_number', serials);

        if (error) throw error;

        const IN_STOCK_STATUSES = ['Good', 'Booked In'];
        const BOOKED_OUT_STATUSES = ['Booked Out', 'Warning'];

        // Process one-by-one visually
        for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i];
            const match = (existing || []).find(e => e.serial_number === item.serial);

            if (type === 'register') {
                if (match) {
                    item.verified = false;
                    item.verifyMsg = `❌ Already in registry (${match.status})`;
                } else {
                    item.verified = true;
                    item.verifyMsg = '✅ New — ready';
                }
            } else if (type === 'out') {
                if (!match) {
                    item.verified = false;
                    item.verifyMsg = '❌ Not in registry';
                } else if (BOOKED_OUT_STATUSES.includes(match.status)) {
                    item.verified = false;
                    item.verifyMsg = '❌ Already Booked Out';
                } else {
                    item.verified = true;
                    item.verifyMsg = `✅ Ready (Current: ${match.status})`;
                }
            } else if (type === 'in') {
                if (!match) {
                    item.verified = false;
                    item.verifyMsg = '❌ Not in registry';
                } else if (IN_STOCK_STATUSES.includes(match.status)) {
                    item.verified = false;
                    item.verifyMsg = '❌ Already In Stock';
                } else {
                    item.verified = true;
                    item.verifyMsg = `✅ Ready (Current: ${match.status})`;
                }
            }
            
            // Re-render every few items to show progress if the list is long
            if (i % 5 === 0 || i === selectedItems.length - 1) {
                renderBatchTable(type);
                // Tiny delay to make the animation visible
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const passed = selectedItems.filter(i => i.verified === true).length;
        const blocked = selectedItems.filter(i => i.verified === false).length;
        showToast(`Verification complete: ${passed} ready, ${blocked} blocked`, blocked > 0 ? 'error' : 'success');
        renderBatchTable(type);
    } catch (err) { 
        console.error(err); 
        showToast('Verification failed: ' + err.message, 'error');
    }
}

function renderBatchTable(type) {
    const tbody = document.getElementById(`batch-table-body-${type}`);
    if (!tbody) return;

    const countEl = document.getElementById(`scan-count-${type}`);
    if (countEl) countEl.innerText = batchState[type].length;

    const isRegister = (type === 'register');

    tbody.innerHTML = batchState[type].map((item, idx) => {
        const isReg = type === 'register';
        
        return `
        <tr>
            <td><input type="checkbox" ${item.selected ? 'checked' : ''} onchange="batchState['${type}'][${idx}].selected = this.checked"></td>
            ${isReg ? `<td><strong>${item.ch_number || '-'}</strong></td>` : ''}
            <td><strong>${item.serial}</strong>${item.imported ? ' <i class="fas fa-file-csv" style="color:#10b981; font-size:0.7rem;"></i>' : ''}</td>
            ${isReg ? `
                <td><span class="badge ${item.status === 'In Stock' || item.status === 'Booked In' ? 'badge-green' : 'badge-orange'}" style="font-size: 0.7rem;">${item.status}</span></td>
                <td style="font-size: 0.75rem;">${item.calibration_cert_number || item.calibration_cert || '-'}</td>
                <td style="font-size: 0.75rem;">${item.calibration_date || '-'}</td>
                <td style="font-size: 0.75rem;">${item.re_calibration_date || '-'}</td>
                <td style="font-size: 0.75rem;">
                    ${item.current_site_name || '-'}
                    ${item.current_customer ? `<br><small style="color:var(--text-secondary)">${item.current_customer}</small>` : ''}
                </td>
                <td style="font-size: 0.75rem;">${item.current_technician_name || '-'}</td>
                <td style="font-size: 0.75rem;">${item.current_protocol_number || '-'}</td>
            ` : `
                <td style="color: #64748b; font-size: 0.75rem;">${item.scan}</td>
                <td style="text-align: center;">${item.imported ? '✅' : '-'}</td>
                <td><span class="badge badge-gray">${item.status}</span></td>
            `}
            <td style="text-align: center;">
                <span class="verify-status ${
                    item.verified === true ? 'verify-ok' : 
                    item.verified === false ? 'verify-fail' : ''
                }">
                    ${item.verifyMsg || 'Not verified'}
                </span>
            </td>
            <td><button class="btn btn-small" onclick="batchState['${type}'].splice(${idx}, 1); renderBatchTable('${type}')">🗑️</button></td>
        </tr>
    `}).join('');
}

async function proceedBatchProcess(type) {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot book inventory in or out.');
        return;
    }

    const allSelected = batchState[type].filter(i => i.selected);
    if (allSelected.length === 0) {
        showToast('No items selected', 'error');
        return;
    }

    // HARD BLOCK: Must verify first
    const unverified = allSelected.filter(i => i.verified === null);
    if (unverified.length > 0) {
        showToast(`⚠️ Please run Verify Assets first before proceeding`, 'error');
        return;
    }

    // HARD BLOCK: Separate allowed vs blocked
    const allowed = allSelected.filter(i => i.verified === true);
    const blocked = allSelected.filter(i => i.verified === false);

    if (blocked.length > 0) {
        blocked.forEach(i => showToast(`⛔ ${i.serial}: ${i.verifyMsg} — skipped`, 'error'));
    }
    if (allowed.length === 0) {
        showToast('⛔ No valid items to process. Check verification results.', 'error');
        return;
    }

    try {
        setGlobalLoading(true, type === 'out' ? 'Booking assets out...' : 'Booking assets in...');
        const userResult = await window.supabaseClient.auth.getUser();
        const userEmail = userResult.data.user?.email || 'System';

        for (const item of allowed) {
            const newStatus = type === 'out' ? 'Booked Out' : 'Booked In';
            const selectedCondition = type === 'out'
                ? (item.status || 'Good')
                : (item.status || document.getElementById('bookInCondition')?.value || 'Good');
            const newCondition = normalizeConditionStatus(selectedCondition);

            // 1. Fetch current asset
            const { data: current } = await window.supabaseClient
                .from('inventory')
                .select('id, status, condition_status, ch_number, name, category, calibration_cert, calibration_date, created_at')
                .eq('serial_number', item.serial)
                .maybeSingle();

            const oldStatus = current ? current.status : 'Unknown';

            // 2. Update inventory status
            const { data: upsertedAsset, error: upsertError } = await window.supabaseClient
                .from('inventory')
                .upsert({ 
                    serial_number: item.serial,
                    status: newStatus,
                    condition_status: newCondition,
                    name: current?.name || `Asset ${item.serial}`,
                    category: current?.category || inferInventoryCategory(current || { serial_number: item.serial }) || 'Logger',
                    qty: 1,
                    ch_number: current?.ch_number || 'TBD',
                    calibration_cert: current?.calibration_cert || null,
                    calibration_date: current?.calibration_date || null,
                    created_at: current?.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'serial_number' }).select().single();

            if (upsertError) throw upsertError;

            // 3. Log the transaction
            const logEntry = {
                asset_id: upsertedAsset.id,
                serial_number: item.serial,
                asset_name: current?.name || `Asset ${item.serial}`,
                type: type === 'out' ? 'Book Out' : 'Book In',
                old_status: oldStatus,
                new_status: newStatus,
                performed_by: userEmail,
                ch_number: current?.ch_number,
                customer_name: type === 'out' 
                    ? document.getElementById('bookOutCustomer')?.value 
                    : document.getElementById('bookInCustomer')?.value,
                site_name: type === 'out' 
                    ? document.getElementById('bookOutSite')?.value 
                    : document.getElementById('bookInSite')?.value,
                technician_name: type === 'out' 
                    ? document.getElementById('bookOutTech')?.value 
                    : document.getElementById('bookInTech')?.value,
                protocol: type === 'out' ? document.getElementById('bookOutProtocol')?.value : null,
                notes: type === 'out' 
                    ? document.getElementById('bookOutReason')?.value 
                    : document.getElementById('bookInReason')?.value
            };

            const { data: insertedLog, error: logError } = await window.supabaseClient.from('inventory_logs').insert([logEntry]).select().single();
            if (logError) throw logError;
            await pruneAssetLogs(upsertedAsset.id, 10);
        }

        showToast(`✅ Successfully processed ${allowed.length} asset(s)`, 'success');
        if (blocked.length > 0) {
            showToast(`⚠️ ${blocked.length} item(s) were skipped due to status rules`, 'error');
        }

        batchState[type] = batchState[type].filter(i => !allowed.includes(i));
        renderBatchTable(type);
        loadInventoryDashboard();
        if (typeof loadAdvancedAssets === 'function') loadAdvancedAssets();
        if (typeof loadHistory === 'function') loadHistory();
        setGlobalLoading(false);

    } catch (err) { 
        setGlobalLoading(false);
        console.error('Batch Process Error:', err);
        showToast(`❌ Error: ${err.message}`, 'error');
    }
}

/**
 * Register New Assets — the ONLY way to add new serials to the system
 */
async function proceedRegisterAssets() {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot register inventory assets.');
        return;
    }

    const allSelected = batchState['register'].filter(i => i.selected);
    if (allSelected.length === 0) { showToast('No items selected', 'error'); return; }

    const unverified = allSelected.filter(i => i.verified === null);
    if (unverified.length > 0) { showToast('⚠️ Please run "Check for Duplicates" first', 'error'); return; }

    const allowed = allSelected.filter(i => i.verified === true);
    const blocked = allSelected.filter(i => i.verified === false);
    blocked.forEach(i => showToast(`⛔ ${i.serial}: ${i.verifyMsg} — skipped`, 'error'));
    if (allowed.length === 0) { showToast('⛔ All items already exist in registry', 'error'); return; }

    const name = document.getElementById('regAssetName')?.value || 'Logger';
    const category = document.getElementById('regAssetCategory')?.value || 'Logger';
    const status = normalizeStatus(document.getElementById('regAssetStatus')?.value || 'Booked In');
    const conditionStatus = normalizeConditionStatus(document.getElementById('regAssetCondition')?.value || 'Good');
    const chNumber = document.getElementById('regAssetCH')?.value || null;
    const calibrationCert = document.getElementById('regCalibrationCert')?.value?.trim() || null;
    const calibrationDate = document.getElementById('regCalibrationDate')?.value || null;
    
    // Expanded fields
    const reCalibrationDate = document.getElementById('regReCalibrationDate')?.value || null;
    const currentSiteName = document.getElementById('regCurrentSite')?.value || null;
    const currentCustomer = document.getElementById('regCurrentCustomer')?.value || null;
    const currentTechName = document.getElementById('regCurrentTech')?.value || null;
    const currentProtocol = document.getElementById('regCurrentProtocol')?.value || null;
    const lastMovementId = document.getElementById('regLastMovement')?.value || null;
    const notes = document.getElementById('regAssetNotes')?.value || null;

    try {
        setGlobalLoading(true, 'Registering assets...');
        const userResult = await window.supabaseClient.auth.getUser();
        const userEmail = userResult.data.user?.email || 'System';

        const inserts = allowed.map(item => ({
            serial_number: item.serial,
            name: item.name || name,
            category: item.category || category,
            status: item.status || status || 'Booked In',
            condition_status: item.condition_status || conditionStatus || 'Good',
            qty: item.qty || 1,
            ch_number: item.ch_number || chNumber || null,
            calibration_cert: item.calibration_cert || item.calibration_cert_number || calibrationCert || null,
            calibration_date: item.calibration_date || calibrationDate || null,
            re_calibration_date: item.re_calibration_date || reCalibrationDate || null,
            current_site_name: item.current_site_name || currentSiteName || null,
            current_customer: item.current_customer || currentCustomer || null,
            current_technician_name: item.current_technician_name || currentTechName || null,
            current_protocol_number: item.current_protocol_number || currentProtocol || null,
            last_movement_id: item.last_movement_id || lastMovementId || null,
            notes: item.notes || notes || 'Initial registration',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: userEmail
        }));

        console.log('Registering assets with data:', inserts);

        const { data: insertedAssets, error } = await window.supabaseClient
            .from('inventory')
            .insert(inserts)
            .select();
            
        if (error) {
            console.error('Supabase Registration Error:', error);
            showToast(`❌ Registration Failed: ${error.message}`, 'error');
            throw error;
        }

        // Log the registration
        if (insertedAssets && insertedAssets.length > 0) {
            const logEntries = insertedAssets.map(asset => ({
                asset_id: asset.id,
                serial_number: asset.serial_number,
                asset_name: asset.name,
                type: 'Register',
                old_status: 'None',
                new_status: asset.status,
                performed_by: userEmail,
                ch_number: asset.ch_number,
                customer_name: document.getElementById('regAssetCustomer')?.value || null,
                site_name: document.getElementById('regAssetSite')?.value || null,
                technician_name: document.getElementById('regAssetTech')?.value || null,
                notes: notes || 'Initial registration'
            }));
            const { error: logError } = await window.supabaseClient.from('inventory_logs').insert(logEntries);
            if (logError) throw logError;
            for (const asset of insertedAssets) {
                await pruneAssetLogs(asset.id, 10);
            }
        }

        if (typeof showRegistrationSuccess === 'function') {
            showRegistrationSuccess(`${allowed.length} Assets Registered!`);
        } else {
            showToast(`✅ ${allowed.length} asset(s) registered successfully!`, 'success');
        }
        batchState['register'] = batchState['register'].filter(i => !allowed.includes(i));
        renderBatchTable('register');
        loadInventoryDashboard();
        if (typeof loadAdvancedAssets === 'function') loadAdvancedAssets();
        if (typeof loadHistory === 'function') loadHistory();
    } catch (err) {
        console.error('Register Error:', err);
        showToast(`❌ Registration failed: ${err.message}`, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function pruneAssetLogs(assetId, keepCount = 10) {
    if (!assetId) return;

    try {
        const { data: extraLogs, error } = await window.supabaseClient
            .from('inventory_logs')
            .select('id')
            .eq('asset_id', assetId)
            .order('created_at', { ascending: false })
            .range(keepCount, 1000);

        if (error) {
            console.warn('Prune logs fetch failed:', error.message);
            return;
        }

        if (!extraLogs || extraLogs.length === 0) return;

        const idsToDelete = extraLogs.map(log => log.id);
        const { error: deleteError } = await window.supabaseClient
            .from('inventory_logs')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            console.warn('Prune logs delete failed:', deleteError.message);
        }
    } catch (err) {
        console.warn('PruneAssetLogs error:', err.message);
    }
}

/**
 * Mapping Logic
 */
async function createMappingJob() {
    if (!hasMappingPermission('canCreateJobs')) {
        showMappingPermissionError('Your role cannot create mapping jobs.');
        return;
    }

    // Get form elements
    const protoEl = document.getElementById('mapProto');
    const customerEl = document.getElementById('mapCustomer');
    const techEl = document.getElementById('mapTech');
    const qtyEl = document.getElementById('mapQty');
    const durEl = document.getElementById('mapDuration');
    const seasonEl = document.getElementById('mapSeason');
    const notesEl = document.getElementById('mapNotes');

    if (!protoEl || !customerEl) {
        showToast('Form elements not found. Please refresh the page.', 'error');
        return;
    }

    const proto = protoEl.value?.trim();
    const clientName = customerEl.value?.trim();
    const tech = hasMappingPermission('canAssignJobs') ? (techEl?.value?.trim() || '') : '';
    const qty = qtyEl?.value?.trim() || '1';
    const dur = durEl?.value?.trim() || '';
    const season = seasonEl?.value?.trim() || '';
    const notes = notesEl?.value?.trim() || '';

    if (!proto) return showToast('Protocol Number is required.', 'error');
    if (!clientName || clientName === '') return showToast('Please select a Customer from the dropdown.', 'error');

    console.log("Creating mapping job with:", { proto, clientName, tech, qty, dur, season, notes });

    try {
        setGlobalLoading(true, 'Creating mapping job...');
        const createdBy = (typeof getCurrentActorLabel === 'function') ? await getCurrentActorLabel() : 'Manager';
        console.log("Looking for client:", clientName);
        
        // Get client ID - use maybeSingle() to avoid error on no results
        const { data: client, error: clientError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name')
            .eq('client_name', clientName)
            .maybeSingle();

        console.log("Client lookup result:", { client, clientError });

        if (clientError) throw clientError;
        if (!client) throw new Error(`Client "${clientName}" not found. Please select from the dropdown.`);

        // Generate a UUID for the job
        const jobId = crypto.randomUUID();

        const { data: insertedJob, error } = await window.supabaseClient.from('jobs').insert([{
            id: jobId,
            client_id: client.id,
            title: `Job ${proto}`,
            protocol_number: proto,
            created_by: createdBy,
            technician_name: tech,
            qty: parseInt(qty) || 1,
            estimated_duration_hours: parseFloat(dur) || 2.0,
            season: season,
            notes: notes,
            status: 'In Progress',
            report_status: 'Pending'
        }]).select();

        if (error) throw error;
        if (!insertedJob || insertedJob.length === 0) throw new Error('Job was not created');

        console.log("Job created successfully:", insertedJob[0]);
        showToast('Mapping job created successfully!', 'success');
        
        loadMappingData();
        
        // Clear form
        protoEl.value = '';
        customerEl.value = '';
        if (techEl) techEl.value = '';
        if (qtyEl) qtyEl.value = '1';
        if (durEl) durEl.value = '';
        if (seasonEl) seasonEl.value = '';
        if (notesEl) notesEl.value = '';
    } catch (err) {
        console.error('Create mapping job error:', err);
        showToast('Failed to create mapping job: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function loadMappingData() {
    const container = document.getElementById('mapping-container');
    try {
        setGlobalLoading(true, 'Loading mapping jobs...');
        const { data: jobs } = await window.supabaseClient
            .from('jobs')
            .select('*')
            .neq('status', 'Completed')
            .order('created_at', { ascending: false });

        container.innerHTML = (jobs || []).map(job => `
            <div class="report-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>${job.protocol_number || 'No Prot'} • <span class="badge badge-orange">${job.report_status}</span></h3>
                    <button class="btn btn-small" onclick="updateJobMappingStatus('${job.id}', 'Completed')">Mark Completed</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: #64748b; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div>Customer: <strong>${job.technician_name || 'N/A'}</strong></div>
                    <div>Qty: ${job.qty || 0}</div>
                    <div>Season: ${job.season || '-'}</div>
                    <div>Duration: ${job.estimated_duration_hours ? (typeof formatDurationDisplay === 'function' ? formatDurationDisplay(job.estimated_duration_hours) : `${Math.floor(Number(job.estimated_duration_hours || 0) / 24)}d ${Number((Number(job.estimated_duration_hours || 0) % 24).toFixed(1))}h`) : '-'}</div>
                </div>
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                    <button class="btn btn-small" onclick="updateJobMappingReport('${job.id}', 'Installed')">Set Installed</button>
                    <button class="btn btn-small" onclick="updateJobMappingReport('${job.id}', 'Uninstalled')">Set Uninstalled</button>
                    <button class="btn btn-small" onclick="updateJobMappingReport('${job.id}', 'Handover')">Set Handover</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
        showToast('Failed to load mapping jobs: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function updateJobMappingReport(id, status) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot update mapping job reports.');
        return;
    }

    try {
        setGlobalLoading(true, 'Updating report status...');
        const { error } = await window.supabaseClient.from('jobs').update({ report_status: status }).eq('id', id);
        if (error) throw error;
        showToast(`Report status updated to ${status}.`, 'success');
        loadMappingData();
    } catch (err) {
        console.error('Update report status error:', err);
        showToast('Failed to update report status: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function updateJobMappingStatus(id, status) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot update mapping job statuses.');
        return;
    }

    try {
        setGlobalLoading(true, 'Updating job status...');
        const { error } = await window.supabaseClient.from('jobs').update({ status: status, report_status: 'Report Completed' }).eq('id', id);
        if (error) throw error;
        showToast('Moved to Completed Reports.', 'success');
        loadMappingData();
    } catch (err) {
        console.error('Update job status error:', err);
        showToast('Failed to update job status: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function loadCompletedReports() {
    const container = document.getElementById('completed-reports-container');
    try {
        const { data: jobs } = await window.supabaseClient
            .from('jobs')
            .select('*')
            .eq('status', 'Completed')
            .order('created_at', { ascending: false });

        container.innerHTML = (jobs || []).map(job => `
            <div class="report-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3>${job.protocol_number || 'N/A'} • <span class="badge badge-green">Report Completed</span></h3>
                    <button class="btn btn-small" onclick="exportReportCSV('${job.id}')">Export CSV</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.85rem; color: #64748b;">
                    Customer: ${job.technician_name} | Qty: ${job.qty} | Season: ${job.season}
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

/**
 * Action History Logic
 */
async function loadHistory() {
    console.log("Loading Inventory History Tracker...");
    const tbody = document.getElementById('history-table-body');
    if (!tbody) {
        console.error('History table body not found');
        return;
    }
    
    const kw = document.getElementById('histKeyword')?.value.toLowerCase() || '';
    const serial = document.getElementById('histSerial')?.value.trim() || '';
    const startDate = document.getElementById('histStart')?.value || '';
    const endDate = document.getElementById('histEnd')?.value || '';
    
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px;">Fetching logs...</td></tr>';

    try {
        setGlobalLoading(true, 'Loading asset history...');
        // Fetch logs first - get all fields needed for display
        const { data: logs, error: logsError } = await window.supabaseClient
            .from('inventory_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);

        if (logsError) {
            console.error('History query failed:', logsError);
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--accent-red);">Error loading history: ${logsError.message}</td></tr>`;
            return;
        }

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--text-secondary);">No history records found yet. Book In/Out assets to generate history.</td></tr>';
            const countEl = document.getElementById('history-results-count');
            if (countEl) countEl.innerText = '0 results found';
            return;
        }

        // Get unique asset IDs
        const assetIds = [...new Set((logs || []).map(l => l.asset_id).filter(id => id))];

        // Fetch inventory data for those assets
        let inventoryMap = new Map();
        if (assetIds.length > 0) {
            const { data: inventory, error: invError } = await window.supabaseClient
                .from('inventory')
                .select('id, ch_number, serial_number, category, status')
                .in('id', assetIds);

            if (!invError && inventory) {
                inventoryMap = new Map(inventory.map(inv => [inv.id, inv]));
            }
        }

        // Apply keyword and date filtering
        const filtered = (logs || []).filter(log => {
            try {
                const created = new Date(log.created_at);
                if (startDate && created < new Date(`${startDate}T00:00:00`)) return false;
                if (endDate && created > new Date(`${endDate}T23:59:59`)) return false;

                const inv = inventoryMap.get(log.asset_id);
                if (serial) {
                    const matchSerial = (inv?.serial_number || log.serial_number || '').toLowerCase() === serial.toLowerCase();
                    const matchCh = (inv?.ch_number || log.ch_number || '').toLowerCase() === serial.toLowerCase();
                    if (!matchSerial && !matchCh) return false;
                }

                if (!kw) return true;
                const target = `${log.notes || ''} ${log.performed_by || ''} ${log.customer_name || ''} ${log.site_name || ''} ${log.technician_name || ''} ${log.protocol || ''} ${log.type || ''} ${inv?.serial_number || ''} ${log.serial_number || ''} ${inv?.ch_number || ''} ${log.asset_name || ''} ${log.ch_number || ''}`.toLowerCase();
                return target.includes(kw);
            } catch (err) {
                console.error('Filter error:', err, log);
                return false;
            }
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--text-secondary);">No matching records found.</td></tr>';
            const countEl = document.getElementById('history-results-count');
            if (countEl) countEl.innerText = '0 results found';
            return;
        }

        tbody.innerHTML = filtered.map((log, idx) => {
            const inv = inventoryMap.get(log.asset_id);
            const timestamp = log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A';
            const typeBadge = log.type === 'Book Out' ? 'badge-orange' : log.type === 'Book In' ? 'badge-blue' : 'badge-green';
            
            return `
            <tr>
                <td style="font-size: 0.75rem; color: var(--text-secondary);">${timestamp}</td>
                <td><span class="badge ${typeBadge}">${log.type || '-'}</span></td>
                <td><strong>${inv?.ch_number || log.ch_number || '-'}</strong></td>
                <td><code>${inv?.serial_number || log.serial_number || 'N/A'}</code></td>
                <td><span style="font-size: 0.8rem;">${log.old_status || '-'} &rarr; ${log.new_status || '-'}</span></td>
                <td>
                    ${log.customer_name || '-'} ${log.site_name ? '• ' + log.site_name : ''}
                </td>
                <td>${log.protocol || '-'}</td>
                <td style="font-size: 0.75rem;">${log.notes || '-'}</td>
                <td style="font-size: 0.75rem;">${log.performed_by || 'System'}</td>
            </tr>
        `;}).join('');

        const countEl = document.getElementById('history-results-count');
        if (countEl) countEl.innerText = `${filtered.length} results found`;
    } catch (err) { 
        console.error("History Error:", err); 
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px; color: var(--accent-red);">Error: ${err.message}</td></tr>`;
    } finally {
        setGlobalLoading(false);
    }
}

/**
 * Asset Registry
 */
async function loadAdvancedAssets() {
    console.log("Loading Asset Registry...");
    const tbody = document.getElementById('asset-registry-table-body');
    const reminderBar = document.getElementById('assetCertificateReminderBar');
    if (!tbody) return;

    try {
        setGlobalLoading(true, 'Loading assets...');
        // Fetch base inventory first
        const { data: assets, error: invError } = await window.supabaseClient
            .from('inventory')
            .select('*')
            .order('created_at', { ascending: false });

        if (invError) throw invError;

        // Fetch logs separately to avoid complex join failures
        const { data: logs, error: logsError } = await window.supabaseClient
            .from('inventory_logs')
            .select('asset_id, site_name, technician_name, customer_name')
            .order('created_at', { ascending: false });

        if (logsError) {
            console.warn('Asset registry log fetch failed:', logsError.message);
        }

        console.log('Asset registry fetched:', {
            assetCount: assets?.length ?? 0,
            logCount: logs?.length ?? 0,
            assetsSample: assets?.slice(0, 3)
        });

        if (!assets || assets.length === 0) {
            latestFilteredAssets = [];
            if (reminderBar) reminderBar.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No assets found in registry.</td></tr>';
            return;
        }

        const searchKeyword = document.getElementById('assetSearchInput')?.value.trim().toLowerCase() || '';
        const statusFilter = document.getElementById('assetStatusFilter')?.value || 'all';
        const conditionFilter = document.getElementById('assetConditionFilter')?.value || 'all';
        const typeFilter = document.getElementById('assetTypeFilter')?.value || 'all';
        const customerFilter = document.getElementById('assetCustomerFilter')?.value || 'all';
        const limitFilter = Number(document.getElementById('assetLimitFilter')?.value || '50');
        console.log('Asset registry filters:', { statusFilter, conditionFilter, typeFilter, customerFilter, searchKeyword, limitFilter });

        attachAssetRegistryFilters();

        const filteredAssets = (assets || []).filter(asset => {
            const latestLog = (logs || []).find(l => l.asset_id === asset.id);
            const latestCustomer = (latestLog?.customer_name || '').toLowerCase();
            const availabilityState = getAssetAvailabilityState(asset.status);
            const conditionState = getAssetConditionState(asset.condition_status || asset.status);
            const displayCategory = inferInventoryCategory(asset) || normalizeInventoryCategory(asset.category) || asset.category || 'Other';

            if (statusFilter !== 'all' && availabilityState.statusLabel !== statusFilter) return false;
            if (conditionFilter !== 'all' && conditionState.statusLabel !== conditionFilter) return false;
            if (typeFilter !== 'all' && displayCategory !== typeFilter) return false;
            if (customerFilter !== 'all' && latestCustomer !== customerFilter.toLowerCase()) return false;

            if (!searchKeyword) return true;
            const target = `${asset.ch_number || ''} ${asset.serial_number || ''} ${asset.name || ''} ${displayCategory || ''} ${availabilityState.statusLabel || ''} ${conditionState.statusLabel || ''} ${latestLog?.site_name || ''} ${latestCustomer} ${asset.calibration_cert || ''} ${asset.calibration_date || ''}`.toLowerCase();
            return target.includes(searchKeyword);
        }).slice(0, limitFilter);

        latestFilteredAssets = filteredAssets.map(asset => {
            const latestLog = (logs || []).find(l => l.asset_id === asset.id);
            const availabilityState = getAssetAvailabilityState(asset.status);
            const conditionState = getAssetConditionState(asset.condition_status || asset.status);
            const reminder = getCalibrationReminder(asset);
            const site = latestLog?.site_name || 'Warehouse';
            const customer = latestLog?.customer_name || '';

            return {
                ...asset,
                latestLog,
                availabilityState,
                conditionState,
                reminder,
                location: customer ? `${site} • ${customer}` : site,
                updatedAtDisplay: formatSouthAfricaDateTime(asset.updated_at || asset.created_at || null)
            };
        });

        console.log('Asset registry filtered count:', latestFilteredAssets.length);
        if (latestFilteredAssets.length === 0) {
            if (reminderBar) reminderBar.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No assets match the filters.</td></tr>';
            return;
        }

        const expiringSoon = latestFilteredAssets
            .filter(asset => asset.reminder.dueSoon)
            .sort((a, b) => (a.reminder.sortDays ?? 9999) - (b.reminder.sortDays ?? 9999));

        if (reminderBar) {
            reminderBar.innerHTML = expiringSoon.length > 0
                ? `<strong>${expiringSoon.length}</strong> logger certificate(s) need attention in the next 60 days: ${expiringSoon.slice(0, 5).map(asset => `${asset.serial_number} (${asset.reminder.label})`).join(', ')}`
                : 'No logger calibration certificates are due in the next 60 days.';
        }

        tbody.innerHTML = latestFilteredAssets.map(asset => {
            const reminderBadgeClass = asset.reminder.expired
                ? 'badge-red'
                : asset.reminder.dueSoon
                    ? 'badge-orange'
                    : 'badge-green';
            const latestLog = asset.latestLog;
            const availabilityState = asset.availabilityState;
            const displayState = asset.conditionState;
            
            // Format site/customer as "Site • Customer"
            const site = latestLog?.site_name || 'Warehouse';
            const customer = latestLog?.customer_name || '';
            const locationStr = customer ? `${site} • ${customer}` : site;

            return `
                <tr>
                    <td><strong>${asset.ch_number || '-'}</strong></td>
                    <td><code>${asset.serial_number}</code></td>
                    <td>${asset.calibration_cert || 'N/A'}</td>
                    <td>
                        <div style="font-size: 0.85rem;">Cal: ${asset.calibration_date || 'N/A'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">Recal: ${asset.re_calibration_date || 'N/A'}</div>
                    </td>
                    <td><span class="badge ${reminderBadgeClass}">${asset.reminder.label}</span></td>
                    <td><span class="badge ${availabilityState.badgeClass}">${availabilityState.statusLabel}</span></td>
                    <td><span class="badge ${displayState.badgeClass}">${displayState.statusLabel}</span></td>
                    <td>
                        <div style="font-weight: 500;">${locationStr}</div>
                        ${asset.current_protocol_number ? `<div style="font-size: 0.7rem; color: #6366f1;">Protocol: ${asset.current_protocol_number}</div>` : ''}
                    </td>
                    <td>${asset.current_technician_name || latestLog?.technician_name || 'None'}</td>
                    <td style="font-size: 0.75rem; color: var(--text-secondary);">${asset.updatedAtDisplay}</td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <button class="btn btn-small" onclick="showToast('Update asset feature coming soon.', 'info')">Update</button>
                            <button class="btn btn-small" onclick="showAssetHistory('${asset.serial_number || asset.ch_number}')">History</button>
                            <button class="btn btn-small btn-delete" onclick="deleteInventoryAsset('${asset.id}')">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) { 
        console.error("Registry Load Error:", err); 
        latestFilteredAssets = [];
        if (reminderBar) reminderBar.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; color: var(--accent-red);">Error: ${err.message}</td></tr>`;
    } finally {
        setGlobalLoading(false);
    }
}

/**
 * Export Helpers
 */
function exportReportCSV(jobId) {
    // Basic implementation for job-specific export
    showToast(`CSV export for job ${jobId} is not built yet.`, 'info');
}

function exportAssetsCSV() {
    try {
        if (!latestFilteredAssets || latestFilteredAssets.length === 0) {
            showToast('No filtered assets to export.', 'error');
            return;
        }

        const csv = [];
        csv.push([
            'Asset Number',
            'Serial Number',
            'Logger Type',
            'Availability',
            'Condition Status',
            'Calibration Certificate',
            'Calibration Date',
            'Certificate Reminder',
            'Current Site / Customer',
            'Technician',
            'Updated At (South Africa)'
        ].map(escapeCsvValue).join(','));

        latestFilteredAssets.forEach(asset => {
            csv.push([
                asset.ch_number || '-',
                asset.serial_number || '',
                inferInventoryCategory(asset) || asset.category || 'Other',
                asset.availabilityState?.statusLabel || getAssetAvailabilityState(asset.status).statusLabel,
                asset.conditionState?.statusLabel || getAssetConditionState(asset.condition_status || asset.status).statusLabel,
                asset.calibration_cert || '',
                asset.calibration_date || '',
                asset.reminder?.label || getCalibrationReminder(asset).label,
                asset.location || 'Warehouse',
                asset.latestLog?.technician_name || '',
                asset.updatedAtDisplay || formatSouthAfricaDateTime(asset.updated_at || asset.created_at || null)
            ].map(escapeCsvValue).join(','));
        });

        const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const fileName = `Assets_Export_${new Date().toISOString().split('T')[0]}.csv`;
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Assets exported to ${fileName}`, 'success');
    } catch (err) {
        console.error('Asset CSV Export Error:', err);
        showToast(`Asset export failed: ${err.message}`, 'error');
    }
}

function exportHistoryCSV() {
    try {
        const table = document.querySelector('#sub-view-history .batch-table');
        if (!table) {
            console.warn('History table not found');
            showToast('No data to export. Load history first.', 'error');
            return;
        }

        let csv = [];
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) {
            showToast('No records found to export', 'error');
            return;
        }

        // Add header row
        const headerRow = table.querySelector('thead tr');
        if (headerRow) {
            const headers = Array.from(headerRow.querySelectorAll('th')).map(h => `"${h.innerText.trim()}"`);
            csv.push(headers.join(','));
        }

        // Add data rows (skip header row)
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            const cols = row.querySelectorAll('td');
            const rowData = Array.from(cols).map(c => {
                let text = c.innerText.trim();
                // Remove badge HTML artifacts
                text = text.replace(/[^a-zA-Z0-9\s\-→:./,()&|]/g, '');
                return `"${text.replace(/"/g, '""')}"`;
            });
            if (rowData.length > 0) csv.push(rowData.join(','));
        });

        if (csv.length === 0) {
            showToast('No data to export', 'error');
            return;
        }

        const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const fileName = `History_Export_${new Date().toISOString().split('T')[0]}_${new Date().toLocaleTimeString().replace(/:/g, '-')}.csv`;
        
        if (navigator.msSaveBlob) {
            // IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
        
        showToast(`✅ History exported to ${fileName}`, 'success');
    } catch (err) {
        console.error('CSV Export Error:', err);
        showToast(`Export failed: ${err.message}`, 'error');
    }
}

function clearHistoryFilters() {
    ['histKeyword', 'histSerial', 'histStart', 'histEnd'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadHistory();
}

function clearReportFilters() {
    ['repStart', 'repEnd', 'repStatusInput', 'repTechInput', 'repProtoInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    loadCompletedReports();
}

// Replaced by Action History Logic above

async function showAssetHistory(serial) {
    document.getElementById('assetHistoryModal').style.display = 'flex';
    document.getElementById('histModalSerial').innerText = serial || 'Unknown';
    const tbody = document.getElementById('asset-history-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Fetching asset logs...</td></tr>';

    try {
        // 1. First get the asset ID by serial or asset number
        const { data: asset } = await window.supabaseClient
            .from('inventory')
            .select('id')
            .or(`serial_number.eq.${serial},ch_number.eq.${serial}`)
            .maybeSingle();

        if (!asset) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">Asset not found in registry.</td></tr>';
            return;
        }

        // 2. Fetch logs for this asset ID
        const { data: logs, error } = await window.supabaseClient
            .from('inventory_logs')
            .select('*')
            .eq('asset_id', asset.id)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!logs || logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No history found for this asset.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="font-size: 0.8rem;">${new Date(l.created_at).toLocaleString()}</td>
                <td><span class="badge ${l.type === 'Book Out' ? 'badge-orange' : l.type === 'Book In' ? 'badge-blue' : 'badge-green'}">${l.type}</span></td>
                <td style="font-size: 0.8rem;">${l.old_status || '-'} &rarr; ${l.new_status || '-'}</td>
                <td>${l.technician_name || l.performed_by || 'System'}</td>
                <td style="font-size: 0.8rem;">${l.site_name || '-'} ${l.customer_name ? '• ' + l.customer_name : ''}</td>
                <td style="font-size: 0.8rem;">${l.notes || '-'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: var(--accent-red);">Error loading history.</td></tr>';
    }
}

async function deleteInventoryAsset(id, serial) {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot delete assets.');
        return;
    }

    const confirmed = confirm(`âš ï¸ PERMANENT DELETE: Are you sure you want to remove asset ${serial} from the registry?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
        setGlobalLoading(true, 'Deleting asset...');
        const { error } = await window.supabaseClient
            .from('inventory')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast(`âœ… Asset ${serial} removed successfully`, 'success');
        
        // Refresh views
        await loadAdvancedAssets();
        await loadInventoryDashboard();
    } catch (err) {
        console.error('Delete Asset Error:', err);
        showToast('Delete failed: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

function closeAssetHistoryModal() {
    document.getElementById('assetHistoryModal').style.display = 'none';
}

// Register flow overrides: keep a single normalized shape for manual entry,
// spreadsheet import, duplicate verification, and final asset registration.
function handleScanInput(event, type) {
    if (event.key !== 'Enter') return;

    const val = event.target.value.trim();
    if (!val) return;

    const metadata = type === 'register' ? getRegisterFormDefaults() : {};
    addSerialToBatch(val, type, false, metadata);
    event.target.value = '';
    renderBatchTable(type);
}

function addSerialToBatch(val, type, isImported, metadata = {}) {
    const serial = extractBatchSerial(metadata.serial || metadata.serial_number || val);
    if (!serial) return;

    if (batchState[type].some(item => String(item.serial || '').trim().toLowerCase() === serial.toLowerCase())) {
        showToast(`${serial} is already in the list and was skipped.`, 'error');
        return;
    }

    const item = type === 'register'
        ? buildRegisterBatchItem(val, { ...metadata, imported: isImported, scan: metadata.scan || val })
        : {
            serial,
            scan: val,
            imported: isImported,
            status: metadata.status || 'Good',
            verified: null,
            verifyMsg: '',
            selected: true,
            ...metadata
        };

    batchState[type].push(item);

    if (!isImported) {
        showToast(`${serial} added to the list.`, 'success');
    }
}

function appendBatchFromText(type) {
    const idMap = { out: 'bookOutListArea', in: 'bookInListArea', register: 'regListArea' };
    const area = document.getElementById(idMap[type]);
    if (!area) return;

    const lines = area.value.split('\n').map(s => s.trim()).filter(Boolean);
    const registerDefaults = type === 'register' ? getRegisterFormDefaults() : {};
    let addedCount = 0;

    lines.forEach(line => {
        const beforeCount = batchState[type].length;
        addSerialToBatch(line, type, true, registerDefaults);
        if (batchState[type].length > beforeCount) {
            addedCount += 1;
        }
    });

    area.value = '';
    if (addedCount > 0) {
        showToast(`${addedCount} serial(s) added to the list.`, 'success');
    }
    renderBatchTable(type);
}

function removeBatchItem(type, index) {
    const [removed] = batchState[type].splice(index, 1);
    renderBatchTable(type);

    if (removed?.serial) {
        showToast(`${removed.serial} removed from the list.`, 'info');
    }
}

async function verifyBatchList(type) {
    const selectedItems = batchState[type].filter(i => i.selected);
    if (selectedItems.length === 0) {
        showToast('No selected items in the list to verify.', 'error');
        return;
    }

    try {
        setGlobalLoading(true, `Verifying ${selectedItems.length} asset(s)...`);

        selectedItems.forEach(item => {
            item.verified = null;
            item.verifyMsg = 'Verifying...';
        });
        renderBatchTable(type);

        const serials = selectedItems.map(i => i.serial);
        const { data: existing, error } = await window.supabaseClient
            .from('inventory')
            .select('serial_number, status, name, ch_number')
            .in('serial_number', serials);

        if (error) throw error;

        const inStockStatuses = ['Good', 'Booked In', 'In Stock'];
        const bookedOutStatuses = ['Booked Out', 'Warning'];

        for (let i = 0; i < selectedItems.length; i++) {
            const item = selectedItems[i];
            const match = (existing || []).find(entry => entry.serial_number === item.serial);
            updateGlobalLoadingMessage(`Verifying ${i + 1} of ${selectedItems.length} asset(s)...`);

            if (type === 'register') {
                item.verified = !match;
                item.verifyMsg = match
                    ? `Already in registry (${match.status || 'existing'})`
                    : 'Ready to register';
            } else if (type === 'out') {
                if (!match) {
                    item.verified = false;
                    item.verifyMsg = 'Not in registry';
                } else if (bookedOutStatuses.includes(match.status)) {
                    item.verified = false;
                    item.verifyMsg = 'Already booked out';
                } else {
                    item.verified = true;
                    item.verifyMsg = `Ready (current: ${match.status})`;
                }
            } else if (type === 'in') {
                if (!match) {
                    item.verified = false;
                    item.verifyMsg = 'Not in registry';
                } else if (inStockStatuses.includes(match.status)) {
                    item.verified = false;
                    item.verifyMsg = 'Already in stock';
                } else {
                    item.verified = true;
                    item.verifyMsg = `Ready (current: ${match.status})`;
                }
            }

            if (i % 5 === 0 || i === selectedItems.length - 1) {
                renderBatchTable(type);
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const passed = selectedItems.filter(i => i.verified === true).length;
        const blocked = selectedItems.filter(i => i.verified === false).length;
        showToast(`Verification complete: ${passed} ready, ${blocked} blocked.`, blocked > 0 ? 'error' : 'success');
        renderBatchTable(type);
    } catch (err) {
        console.error('Verification Error:', err);
        showToast(`Verification failed: ${err.message}`, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

function renderBatchTable(type) {
    const tbody = document.getElementById(`batch-table-body-${type}`);
    if (!tbody) return;

    const countEl = document.getElementById(`scan-count-${type}`);
    if (countEl) countEl.innerText = batchState[type].length;

    const isRegister = type === 'register';
    const emptyColspan = isRegister ? 12 : 7;

    if (batchState[type].length === 0) {
        tbody.innerHTML = `<tr><td colspan="${emptyColspan}" style="text-align:center; color: var(--text-secondary); padding: 24px;">No assets in this list yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = batchState[type].map((item, idx) => {
        if (isRegister) {
            const availabilityState = getAssetAvailabilityState(item.status);
            return `
                <tr>
                    <td><input type="checkbox" ${item.selected ? 'checked' : ''} onchange="batchState['${type}'][${idx}].selected = this.checked"></td>
                    <td><strong>${item.ch_number || '-'}</strong></td>
                    <td>
                        <strong>${item.serial}</strong>${item.imported ? ' <i class="fas fa-file-csv" style="color:#10b981; font-size:0.7rem;"></i>' : ''}
                        <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px;">${item.name || 'Asset'} | ${item.category || 'Logger'}</div>
                    </td>
                    <td><span class="badge ${availabilityState?.badgeClass || 'badge-gray'}" style="font-size: 0.7rem;">${availabilityState?.statusLabel || item.status || 'Unknown'}</span></td>
                    <td style="font-size: 0.75rem;">${item.calibration_cert_number || item.calibration_cert || '-'}</td>
                    <td style="font-size: 0.75rem;">${item.calibration_date || '-'}</td>
                    <td style="font-size: 0.75rem;">${item.re_calibration_date || '-'}</td>
                    <td style="font-size: 0.75rem;">
                        ${item.current_site_name || '-'}
                        ${item.current_customer ? `<br><small style="color:var(--text-secondary)">${item.current_customer}</small>` : ''}
                    </td>
                    <td style="font-size: 0.75rem;">${item.current_technician_name || '-'}</td>
                    <td style="font-size: 0.75rem;">${item.current_protocol_number || '-'}</td>
                    <td style="text-align: center;">
                        <span class="verify-status ${
                            item.verified === true ? 'verify-ok' :
                            item.verified === false ? 'verify-fail' :
                            item.verifyMsg ? 'verify-warn' : ''
                        }">
                            ${item.verifyMsg || 'Pending verification'}
                        </span>
                    </td>
                    <td><button class="btn btn-small btn-delete" onclick="removeBatchItem('${type}', ${idx})">Remove</button></td>
                </tr>
            `;
        }

        return `
            <tr>
                <td><input type="checkbox" ${item.selected ? 'checked' : ''} onchange="batchState['${type}'][${idx}].selected = this.checked"></td>
                <td><strong>${item.serial}</strong>${item.imported ? ' <i class="fas fa-file-csv" style="color:#10b981; font-size:0.7rem;"></i>' : ''}</td>
                <td style="color: #64748b; font-size: 0.75rem;">${item.scan}</td>
                <td style="text-align: center;">${item.imported ? 'Yes' : '-'}</td>
                <td><span class="badge badge-gray">${item.status}</span></td>
                <td style="text-align: center;">
                    <span class="verify-status ${
                        item.verified === true ? 'verify-ok' :
                        item.verified === false ? 'verify-fail' :
                        item.verifyMsg ? 'verify-warn' : ''
                    }">
                        ${item.verifyMsg || 'Pending verification'}
                    </span>
                </td>
                <td><button class="btn btn-small btn-delete" onclick="removeBatchItem('${type}', ${idx})">Remove</button></td>
            </tr>
        `;
    }).join('');
}

async function handleBulkSpreadsheetImport(event) {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot import inventory assets.');
        if (event?.target) event.target.value = '';
        return;
    }

    const file = event?.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (loadEvent) => {
        try {
            setGlobalLoading(true, `Reading ${file.name}...`);
            const data = new Uint8Array(loadEvent.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true });

            if (!rows.length) {
                showToast('The selected spreadsheet is empty.', 'error');
                return;
            }

            const formDefaults = getRegisterFormDefaults();
            const parsedItems = rows.map((row) => {
                const serial = getSpreadsheetValue(row, [
                    'serial number', 'serial_number', 'serial', 'serial no', 'serial no.', 'serial #', 'asset serial'
                ]);

                if (!serial) return null;

                return buildRegisterBatchItem(serial, {
                    imported: true,
                    scan: file.name,
                    name: getSpreadsheetValue(row, ['asset name', 'name', 'description', 'asset description']),
                    category: getSpreadsheetValue(row, ['category', 'asset type', 'type']),
                    status: getSpreadsheetValue(row, ['status', 'availability', 'asset status']),
                    condition_status: getSpreadsheetValue(row, ['condition status', 'condition', 'asset condition']),
                    ch_number: getSpreadsheetValue(row, ['ch number', 'ch_number', 'asset number', 'asset #', 'ch #', 'ch no']),
                    calibration_cert: getSpreadsheetValue(row, [
                        'calibration certificate', 'calibration cert', 'cert number', 'certificate number'
                    ]),
                    calibration_cert_number: getSpreadsheetValue(row, [
                        'calibration certificate number', 'calibration_cert_number', 'certificate no', 'certificate #'
                    ]),
                    calibration_date: normalizeImportedDate(getSpreadsheetValue(row, [
                        'calibration date', 'calibration_date', 'calibration date range', 'last calibration date'
                    ])),
                    re_calibration_date: normalizeImportedDate(getSpreadsheetValue(row, [
                        're calibration date', 're-calibration date', 're_calibration_date', 'recalibration date', 'next calibration date'
                    ])),
                    current_site_name: getSpreadsheetValue(row, ['current site name', 'site name', 'site', 'current site']),
                    current_customer: getSpreadsheetValue(row, ['current customer', 'customer', 'client', 'client name']),
                    current_technician_name: getSpreadsheetValue(row, ['current technician', 'technician', 'tech', 'technician name']),
                    current_protocol_number: getSpreadsheetValue(row, ['current protocol number', 'protocol number', 'protocol']),
                    last_movement_id: getSpreadsheetValue(row, ['last movement id', 'movement id', 'last movement']),
                    qty: getSpreadsheetValue(row, ['quantity', 'qty']),
                    notes: getSpreadsheetValue(row, ['notes', 'comment', 'comments', 'remarks'])
                }, formDefaults);
            }).filter(Boolean);

            if (!parsedItems.length) {
                showToast('No usable serial numbers were found in the spreadsheet.', 'error');
                return;
            }

            let addedCount = 0;
            parsedItems.forEach(item => {
                const beforeCount = batchState.register.length;
                addSerialToBatch(item.serial, 'register', true, item);
                if (batchState.register.length > beforeCount) {
                    addedCount += 1;
                }
            });

            renderBatchTable('register');

            if (addedCount === 0) {
                showToast('All spreadsheet rows were skipped because they are already in the current list.', 'info');
                return;
            }

            showToast(`${addedCount} asset(s) imported from ${file.name}. Starting duplicate check...`, 'success');
            await verifyBatchList('register');
        } catch (err) {
            console.error('Bulk Import Error:', err);
            showToast(`Bulk import failed: ${err.message}`, 'error');
        } finally {
            setGlobalLoading(false);
            if (event?.target) event.target.value = '';
        }
    };

    reader.readAsArrayBuffer(file);
}

async function proceedRegisterAssets() {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot register inventory assets.');
        return;
    }

    const selectedItems = batchState.register.filter(item => item.selected);
    if (selectedItems.length === 0) {
        showToast('No items selected.', 'error');
        return;
    }

    const unverified = selectedItems.filter(item => item.verified === null);
    if (unverified.length > 0) {
        showToast('Please run Check for Duplicates first.', 'error');
        return;
    }

    const allowed = selectedItems.filter(item => item.verified === true);
    const blocked = selectedItems.filter(item => item.verified === false);

    blocked.forEach(item => showToast(`${item.serial}: ${item.verifyMsg}. Skipped.`, 'error'));
    if (allowed.length === 0) {
        showToast('All selected items already exist in the registry.', 'error');
        return;
    }

    const formDefaults = getRegisterFormDefaults();

    try {
        showToast(`Saving ${allowed.length} asset(s) to the registry...`, 'info');
        setGlobalLoading(true, 'Registering assets...');
        const userResult = await window.supabaseClient.auth.getUser();
        const userEmail = userResult.data.user?.email || 'System';

        const inserts = allowed.map(item => ({
            serial_number: item.serial,
            name: item.name || formDefaults.name,
            category: normalizeInventoryCategory(item.category) || formDefaults.category || 'Logger',
            status: normalizeRegisterAvailabilityStatus(item.status, formDefaults.status || 'In Stock'),
            condition_status: normalizeConditionStatus(item.condition_status || formDefaults.condition_status || 'Good'),
            qty: item.qty || 1,
            ch_number: item.ch_number || formDefaults.ch_number || null,
            calibration_cert: item.calibration_cert || item.calibration_cert_number || formDefaults.calibration_cert || null,
            calibration_cert_number: item.calibration_cert_number || item.calibration_cert || formDefaults.calibration_cert_number || formDefaults.calibration_cert || null,
            calibration_date: item.calibration_date || formDefaults.calibration_date || null,
            re_calibration_date: item.re_calibration_date || formDefaults.re_calibration_date || null,
            current_site_name: item.current_site_name || formDefaults.current_site_name || null,
            current_customer: item.current_customer || formDefaults.current_customer || null,
            current_technician_name: item.current_technician_name || formDefaults.current_technician_name || null,
            current_protocol_number: item.current_protocol_number || formDefaults.current_protocol_number || null,
            last_movement_id: item.last_movement_id || formDefaults.last_movement_id || null,
            notes: item.notes || formDefaults.notes || 'Initial registration',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            updated_by: userEmail
        }));

        const { data: insertedAssets, error } = await window.supabaseClient
            .from('inventory')
            .insert(inserts)
            .select();

        if (error) throw error;

        if (insertedAssets?.length) {
            const logEntries = insertedAssets.map(asset => ({
                asset_id: asset.id,
                serial_number: asset.serial_number,
                asset_name: asset.name,
                type: 'Register',
                old_status: 'None',
                new_status: asset.status,
                performed_by: userEmail,
                ch_number: asset.ch_number,
                customer_name: asset.current_customer || formDefaults.current_customer || null,
                site_name: asset.current_site_name || formDefaults.current_site_name || null,
                technician_name: asset.current_technician_name || formDefaults.current_technician_name || null,
                protocol: asset.current_protocol_number || formDefaults.current_protocol_number || null,
                notes: asset.notes || formDefaults.notes || 'Initial registration'
            }));

            const { error: logError } = await window.supabaseClient.from('inventory_logs').insert(logEntries);
            if (logError) throw logError;

            for (const asset of insertedAssets) {
                await pruneAssetLogs(asset.id, 10);
            }
        }

        if (typeof showRegistrationSuccess === 'function') {
            showRegistrationSuccess(`${allowed.length} Assets Registered!`);
        }
        showToast(`${allowed.length} asset(s) registered successfully.`, 'success');

        batchState.register = batchState.register.filter(item => !allowed.includes(item));
        renderBatchTable('register');
        await loadInventoryDashboard();
        if (typeof loadAdvancedAssets === 'function') await loadAdvancedAssets();
        if (typeof loadHistory === 'function') await loadHistory();
    } catch (err) {
        console.error('Register Error:', err);
        showToast(`Registration failed: ${err.message}`, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function deleteInventoryAsset(id, serial) {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot delete assets.');
        return;
    }

    let assetLabel = serial || 'this asset';

    try {
        if (!serial) {
            const { data: asset, error: fetchError } = await window.supabaseClient
                .from('inventory')
                .select('serial_number, ch_number, name')
                .eq('id', id)
                .maybeSingle();

            if (fetchError) throw fetchError;
            assetLabel = asset?.serial_number || asset?.ch_number || asset?.name || assetLabel;
        }
    } catch (err) {
        console.warn('Delete Asset Prefetch Error:', err);
    }

    const confirmed = confirm(`Permanent delete: remove asset ${assetLabel} from the registry?\n\nThis action cannot be undone.`);
    if (!confirmed) return;

    try {
        showToast(`Deleting ${assetLabel}...`, 'info');
        setGlobalLoading(true, 'Deleting asset...');
        const { error } = await window.supabaseClient
            .from('inventory')
            .delete()
            .eq('id', id);

        if (error) throw error;

        showToast(`Asset ${assetLabel} removed successfully.`, 'success');
        await loadAdvancedAssets();
        await loadInventoryDashboard();
        if (typeof loadInventoryData === 'function') await loadInventoryData();
    } catch (err) {
        console.error('Delete Asset Error:', err);
        showToast(`Delete failed for ${assetLabel}: ${err.message}`, 'error');
    } finally {
        setGlobalLoading(false);
    }
}
