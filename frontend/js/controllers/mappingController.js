let currentInventoryTab = 'dashboard';
let batchState = {
    out: [],
    in: [],
    register: []
};
let assetRegistryFiltersAttached = false;
let completedReportFiltersAttached = false;
let latestFilteredAssets = [];
let selectedAssetIds = new Set();
let currentAssetUpdateTargets = [];
let globalLoadingCount = 0;
let editingMappingJobId = null;
let mappingReportModalEditMode = false;
const INVENTORY_DASHBOARD_CATEGORIES = ['CH Logger', 'TZ Logger', 'ITH Logger'];
const recentToastRegistry = new Map();

function hasMappingPermission(permission, fallback = true) {
    return typeof hasAppPermission === 'function' ? hasAppPermission(permission) : fallback;
}

const HISTORICAL_TRACKER_IMPORT_CREATED_BY = 'Historical Tracker Import';

function showMappingPermissionError(message) {
    showToast(message, 'error');
}

function getAssetUpdateActorLabel() {
    if (typeof getCurrentUserProfile === 'function') {
        const profile = getCurrentUserProfile();
        if (profile?.username) return profile.username;
        if (profile?.email) return profile.email;
    }
    return 'System';
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const normalizedType = ['success', 'error', 'info', 'loading'].includes(type) ? type : 'info';
    const dedupeKey = `${normalizedType}:${String(message).trim()}`;
    const now = Date.now();
    const lastShownAt = recentToastRegistry.get(dedupeKey) || 0;
    if (now - lastShownAt < 900) return;
    recentToastRegistry.set(dedupeKey, now);

    const toast = document.createElement('div');
    toast.className = `toast ${normalizedType}`;
    const iconClass = normalizedType === 'success'
        ? 'fa-check-circle'
        : normalizedType === 'loading'
            ? 'fa-spinner'
            : normalizedType === 'info'
            ? 'fa-info-circle'
            : 'fa-exclamation-circle';
    const iconColor = normalizedType === 'success'
        ? '#10b981'
        : normalizedType === 'loading'
            ? '#1f9bd7'
            : normalizedType === 'info'
            ? '#3b82f6'
            : '#ef4444';
    const toastTitle = normalizedType === 'success'
        ? 'Success'
        : normalizedType === 'loading'
            ? 'Working'
            : normalizedType === 'info'
                ? 'Update'
                : 'Something Needs Attention';
    toast.innerHTML = `
        <i class="fas ${iconClass} toast-icon" style="color: ${iconColor}"></i>
        <div class="toast-copy">
            <strong>${toastTitle}</strong>
            <span>${message}</span>
        </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, normalizedType === 'loading' ? 1800 : 3600);
}

function setGlobalLoading(isLoading, message = 'Loading...') {
    const overlay = document.getElementById('global-loading-overlay');
    const text = document.getElementById('global-loading-text');
    if (!overlay) return;

    if (isLoading) {
        const isStartingFresh = globalLoadingCount === 0;
        globalLoadingCount += 1;
        if (text) text.innerText = message;
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');
        if (isStartingFresh) {
            showToast(message, 'loading');
        }
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

function getSelectedAssetsFromRegistry() {
    return latestFilteredAssets.filter(asset => selectedAssetIds.has(asset.id));
}

function syncSelectedAssetsWithVisibleRows() {
    const visibleIds = new Set(latestFilteredAssets.map(asset => asset.id));
    selectedAssetIds = new Set([...selectedAssetIds].filter(id => visibleIds.has(id)));
}

function updateAssetSelectionControls() {
    const selectedAssets = getSelectedAssetsFromRegistry();
    const count = selectedAssets.length;
    const summaryEl = document.getElementById('asset-selection-summary');
    const clearBtn = document.getElementById('asset-clear-selection-btn');
    const bulkBtn = document.getElementById('asset-bulk-update-btn');
    const selectAll = document.getElementById('asset-select-all');

    if (summaryEl) {
        summaryEl.style.display = count ? 'block' : 'none';
        summaryEl.textContent = count ? `${count} asset${count === 1 ? '' : 's'} selected for bulk update.` : '';
    }

    if (clearBtn) clearBtn.style.display = count ? 'inline-flex' : 'none';
    if (bulkBtn) bulkBtn.style.display = count ? 'inline-flex' : 'none';

    if (selectAll) {
        const visibleCount = latestFilteredAssets.length;
        selectAll.checked = visibleCount > 0 && count === visibleCount;
        selectAll.indeterminate = count > 0 && count < visibleCount;
    }
}

function toggleAssetSelection(assetId, isChecked) {
    if (!assetId) return;
    if (isChecked) selectedAssetIds.add(assetId);
    else selectedAssetIds.delete(assetId);
    updateAssetSelectionControls();
}

function toggleSelectAllVisibleAssets(isChecked) {
    latestFilteredAssets.forEach(asset => {
        if (!asset?.id) return;
        if (isChecked) selectedAssetIds.add(asset.id);
        else selectedAssetIds.delete(asset.id);
    });
    updateAssetSelectionControls();
    loadAdvancedAssets();
}

function clearSelectedAssets() {
    selectedAssetIds.clear();
    updateAssetSelectionControls();
    loadAdvancedAssets();
}

function buildAssetUpdateSummary(targets) {
    if (!targets.length) return 'No assets selected.';
    if (targets.length === 1) {
        const asset = targets[0];
        return `${asset.serial_number || asset.ch_number || asset.name || 'Selected asset'} will be updated.`;
    }
    const preview = targets.slice(0, 4).map(asset => asset.serial_number || asset.ch_number || asset.name || 'Asset').join(', ');
    return `${targets.length} assets will receive the same recalibration update: ${preview}${targets.length > 4 ? ', ...' : ''}`;
}

function resetAssetUpdateForm() {
    const form = document.getElementById('assetUpdateForm');
    if (form) form.reset();
}

function openAssetUpdateModal(assetId = null) {
    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot update inventory assets.');
        return;
    }

    const targets = assetId
        ? latestFilteredAssets.filter(asset => asset.id === assetId)
        : getSelectedAssetsFromRegistry();

    if (!targets.length) {
        showToast('Select at least one asset to update.', 'error');
        return;
    }

    currentAssetUpdateTargets = targets;
    resetAssetUpdateForm();

    const modal = document.getElementById('assetUpdateModal');
    const subtitle = document.getElementById('assetUpdateModalSubtitle');
    const summary = document.getElementById('asset-update-target-summary');
    const firstAsset = targets[0];
    const isBulk = targets.length > 1;

    if (subtitle) {
        subtitle.textContent = isBulk
            ? 'Apply one recalibration update across all selected loggers.'
            : 'Update the saved calibration details for the selected asset.';
    }

    if (summary) summary.textContent = buildAssetUpdateSummary(targets);

    if (!isBulk && firstAsset) {
        const certInput = document.getElementById('assetUpdateCert');
        const certNumberInput = document.getElementById('assetUpdateCertNumber');
        const calibrationDateInput = document.getElementById('assetUpdateCalibrationDate');
        const reCalibrationDateInput = document.getElementById('assetUpdateReCalibrationDate');
        const statusInput = document.getElementById('assetUpdateStatus');
        const conditionInput = document.getElementById('assetUpdateCondition');

        if (certInput) certInput.value = firstAsset.calibration_cert || '';
        if (certNumberInput) certNumberInput.value = firstAsset.calibration_cert_number || '';
        if (calibrationDateInput) calibrationDateInput.value = firstAsset.calibration_date || '';
        if (reCalibrationDateInput) reCalibrationDateInput.value = firstAsset.re_calibration_date || '';
        if (statusInput) statusInput.value = firstAsset.status || '';
        if (conditionInput) conditionInput.value = firstAsset.condition_status || '';
    }

    if (modal) modal.style.display = 'flex';
}

function openBulkAssetUpdateModal() {
    openAssetUpdateModal();
}

function closeAssetUpdateModal() {
    const modal = document.getElementById('assetUpdateModal');
    if (modal) modal.style.display = 'none';
    currentAssetUpdateTargets = [];
    resetAssetUpdateForm();
}

function buildAssetUpdatePayload(isBulkMode = false) {
    const referenceAsset = !isBulkMode && currentAssetUpdateTargets.length === 1 ? currentAssetUpdateTargets[0] : null;
    const calibrationCert = document.getElementById('assetUpdateCert')?.value?.trim() || '';
    const calibrationCertNumber = document.getElementById('assetUpdateCertNumber')?.value?.trim() || '';
    const calibrationDate = document.getElementById('assetUpdateCalibrationDate')?.value || '';
    const reCalibrationDate = document.getElementById('assetUpdateReCalibrationDate')?.value || '';
    const status = document.getElementById('assetUpdateStatus')?.value || '';
    const conditionStatus = document.getElementById('assetUpdateCondition')?.value || '';
    const notes = document.getElementById('assetUpdateNotes')?.value?.trim() || '';

    const payload = {};
    if (calibrationCert && (!referenceAsset || calibrationCert !== (referenceAsset.calibration_cert || ''))) payload.calibration_cert = calibrationCert;
    if (calibrationCertNumber && (!referenceAsset || calibrationCertNumber !== (referenceAsset.calibration_cert_number || ''))) payload.calibration_cert_number = calibrationCertNumber;
    if (calibrationDate && (!referenceAsset || calibrationDate !== (referenceAsset.calibration_date || ''))) payload.calibration_date = calibrationDate;
    if (reCalibrationDate && (!referenceAsset || reCalibrationDate !== (referenceAsset.re_calibration_date || ''))) payload.re_calibration_date = reCalibrationDate;
    if (status && (!referenceAsset || status !== (referenceAsset.status || ''))) payload.status = status;
    if (conditionStatus && (!referenceAsset || conditionStatus !== (referenceAsset.condition_status || ''))) payload.condition_status = conditionStatus;
    if (notes && !isBulkMode && (!referenceAsset || notes !== (referenceAsset.notes || ''))) payload.notes = notes;

    return { payload, note: notes };
}

function describeAssetFieldChange(field, oldValue, newValue) {
    const labelMap = {
        calibration_cert: 'Calibration certificate',
        calibration_cert_number: 'Certificate number',
        calibration_date: 'Calibration date',
        re_calibration_date: 'Next re-calibration date',
        status: 'Availability',
        condition_status: 'Condition',
        notes: 'Notes'
    };
    const label = labelMap[field] || field;
    const previous = oldValue || 'blank';
    const next = newValue || 'blank';
    return `${label}: ${previous} -> ${next}`;
}

async function saveAssetUpdate(event) {
    event.preventDefault();

    if (!hasMappingPermission('canEditInventory')) {
        showMappingPermissionError('Your role cannot update inventory assets.');
        return;
    }

    const targets = Array.isArray(currentAssetUpdateTargets) ? currentAssetUpdateTargets : [];
    if (!targets.length) {
        showToast('No assets selected for update.', 'error');
        return;
    }

    const isBulkMode = targets.length > 1;
    const { payload, note } = buildAssetUpdatePayload(isBulkMode);
    const changedKeys = Object.keys(payload);

    if (!changedKeys.length && !note) {
        showToast('Enter at least one value to update.', 'error');
        return;
    }

    const saveBtn = document.getElementById('assetUpdateSaveBtn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = isBulkMode ? 'Saving Bulk Update...' : 'Saving Update...';
    }

    try {
        setGlobalLoading(true, isBulkMode ? 'Updating selected assets...' : 'Updating asset...');
        const actor = getAssetUpdateActorLabel();

        for (const target of targets) {
            const perAssetPayload = { ...payload };
            if (note) {
                perAssetPayload.notes = isBulkMode
                    ? [target.notes || '', note].filter(Boolean).join(' | ')
                    : note;
            }

            const { error } = await window.supabaseClient
                .from('inventory')
                .update(perAssetPayload)
                .eq('id', target.id);

            if (error) throw error;

            const changeSummary = Object.entries(perAssetPayload)
                .map(([field, value]) => describeAssetFieldChange(field, target[field], value))
                .join(' | ');

            const historyNote = note
                ? `${changeSummary} | Note: ${note}`
                : changeSummary;

            const { error: logError } = await window.supabaseClient
                .from('inventory_logs')
                .insert([{
                    asset_id: target.id,
                    type: isBulkMode ? 'Bulk Recalibration Update' : 'Asset Recalibration Update',
                    old_status: target.status || null,
                    new_status: perAssetPayload.status || target.status || null,
                    performed_by: actor,
                    serial_number: target.serial_number || null,
                    asset_name: target.name || null,
                    ch_number: target.ch_number || null,
                    customer_name: target.current_customer || target.latestLog?.customer_name || null,
                    site_name: target.current_site_name || target.latestLog?.site_name || null,
                    technician_name: target.current_technician_name || target.latestLog?.technician_name || null,
                    protocol: target.current_protocol_number || null,
                    notes: historyNote || 'Asset details updated'
                }]);

            if (logError) throw logError;
        }

        showToast(isBulkMode ? `${targets.length} assets updated successfully.` : 'Asset updated successfully.', 'success');
        selectedAssetIds.clear();
        closeAssetUpdateModal();
        await loadAdvancedAssets();
        if (currentInventoryTab === 'history') await loadHistory();
    } catch (err) {
        console.error('Asset update error:', err);
        showToast('Failed to update asset(s): ' + err.message, 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Update';
        }
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
        if (tab === 'completed-reports') { attachCompletedReportFilters(); loadCompletedReports(); }
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
                const previousValue = el.value;
                el.innerHTML = '<option value="all">All</option>' + 
                    (clients || []).map(c => `<option value="${c.client_name}">${c.client_name}</option>`).join('');
                el.value = (clients || []).some(c => c.client_name === previousValue) ? previousValue : 'all';
            }
        });

        // mapCustomer does NOT get "All" option - user must select a specific customer
        const mapEl = document.getElementById('mapCustomer');
        if (mapEl) {
            const previousValue = mapEl.value;
            mapEl.innerHTML = '<option value="">-- Select Customer --</option>' + 
                (clients || []).map(c => `<option value="${c.client_name}">${c.client_name}</option>`).join('');
            mapEl.value = (clients || []).some(c => c.client_name === previousValue) ? previousValue : '';
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

function attachCompletedReportFilters() {
    if (completedReportFiltersAttached) return;
    completedReportFiltersAttached = true;

    const controls = [
        { id: 'repStart', event: 'change' },
        { id: 'repEnd', event: 'change' },
        { id: 'repCustomer', event: 'change' },
        { id: 'repSeason', event: 'change' },
        { id: 'repResult', event: 'change' },
        { id: 'repYear', event: 'change' },
        { id: 'repStatusInput', event: 'input' },
        { id: 'repTechInput', event: 'input' },
        { id: 'repProtoInput', event: 'input' }
    ];

    controls.forEach(({ id, event }) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener(event, () => {
            if (window.completedReportFilterTimeout) clearTimeout(window.completedReportFilterTimeout);
            window.completedReportFilterTimeout = setTimeout(() => {
                if (currentInventoryTab === 'completed-reports') loadCompletedReports();
            }, event === 'input' ? 180 : 0);
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
    const isInStock = ['Good', 'Booked In', 'In Stock'].includes(normalizedStatus) || !normalizedStatus;
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
    if (!isLoggerAsset(asset) || (!asset.calibration_date && !asset.re_calibration_date)) {
        return { label: '-', sortDays: null, dueSoon: false, expired: false };
    }

    const normalizedCalibrationDate = normalizeImportedDate(asset.calibration_date, { prefer: 'start' });
    const normalizedReCalibrationDate = normalizeImportedDate(asset.re_calibration_date, { prefer: 'end' })
        || deriveImportedRangeEndDate(asset.calibration_date);
    const dueDateValue = normalizedReCalibrationDate || addMonthsToMappingDate(normalizedCalibrationDate, 12);
    const dueDate = parseMappingDateValue(dueDateValue);
    if (!dueDate) {
        return { label: 'Invalid date', sortDays: null, dueSoon: false, expired: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = Math.ceil((dueDate - today) / msPerDay);

    if (daysLeft < 0) {
        return {
            label: `Expired ${Math.abs(daysLeft)} day(s) ago`,
            expiryDate: dueDate,
            sortDays: daysLeft,
            dueSoon: true,
            expired: true
        };
    }

    if (daysLeft <= 60) {
        return {
            label: `${daysLeft} day(s) left`,
            expiryDate: dueDate,
            sortDays: daysLeft,
            dueSoon: true,
            expired: false
        };
    }

    return {
        label: 'Valid',
        expiryDate: dueDate,
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

function formatImportedDateParts(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatImportedDateValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return formatImportedDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function isValidImportedDateParts(year, month, day) {
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function extractImportedDateCandidates(value) {
    if (value === null || value === undefined || value === '') return [];

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return [formatImportedDateValue(value)];
    }

    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed?.y && parsed?.m && parsed?.d) {
            return [formatImportedDateParts(parsed.y, parsed.m, parsed.d)];
        }
    }

    const text = String(value).trim();
    if (!text) return [];

    const normalizedText = text.replace(/[–—]/g, '-');
    const matches = [];
    const seen = new Set();
    const pushCandidate = (year, month, day) => {
        const y = Number(year);
        const m = Number(month);
        const d = Number(day);
        if (!isValidImportedDateParts(y, m, d)) return;
        const formatted = formatImportedDateParts(y, m, d);
        if (seen.has(formatted)) return;
        seen.add(formatted);
        matches.push(formatted);
    };

    normalizedText.replace(/(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})/g, (_, year, month, day) => {
        pushCandidate(year, month, day);
        return _;
    });

    normalizedText.replace(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/g, (_, day, month, year) => {
        pushCandidate(year, month, day);
        return _;
    });

    normalizedText.replace(/([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/g, (match) => {
        const parsed = new Date(match);
        const formatted = formatImportedDateValue(parsed);
        if (formatted && !seen.has(formatted)) {
            seen.add(formatted);
            matches.push(formatted);
        }
        return match;
    });

    if (!matches.length) {
        const parsed = new Date(normalizedText);
        const formatted = formatImportedDateValue(parsed);
        if (formatted) matches.push(formatted);
    }

    return matches;
}

function normalizeImportedDate(value, options = {}) {
    const candidates = extractImportedDateCandidates(value);
    if (!candidates.length) return null;
    return options.prefer === 'end' ? candidates[candidates.length - 1] : candidates[0];
}

function deriveImportedRangeEndDate(value) {
    const candidates = extractImportedDateCandidates(value);
    return candidates.length > 1 ? candidates[candidates.length - 1] : null;
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
        calibration_date: normalizeImportedDate(metadata.calibration_date, { prefer: 'start' }) || formDefaults.calibration_date || null,
        re_calibration_date: normalizeImportedDate(metadata.re_calibration_date, { prefer: 'end' })
            || deriveImportedRangeEndDate(metadata.calibration_date)
            || formDefaults.re_calibration_date
            || null,
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
const MAPPING_REMINDER_WINDOW_DAYS = 30;
let mappingReportModalJob = null;

function escapeMappingHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseMappingDateValue(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const text = String(value).trim();
    if (!text) return null;

    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const normalizedCandidate = normalizeImportedDate(text, { prefer: 'start' });
    if (normalizedCandidate) {
        const [year, month, day] = normalizedCandidate.split('-').map(Number);
        const parsed = new Date(year, month - 1, day);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function toMappingDateInputValue(value) {
    const date = parseMappingDateValue(value);
    if (!date) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addMonthsToMappingDate(value, months) {
    const date = parseMappingDateValue(value);
    if (!date) return '';

    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setMonth(result.getMonth() + months);
    return toMappingDateInputValue(result);
}

function normalizeMappingSeason(value) {
    const text = String(value || '').trim().toUpperCase();
    if (text === 'SUMMER' || text === 'WINTER') return text;
    return '';
}

function normalizeMappingResult(value) {
    const text = String(value || '').trim().toUpperCase();
    if (['PASS', 'PASSED', 'SUCCESS', 'SUCCESSFUL'].includes(text)) return 'PASS';
    if (['FAIL', 'FAILED', 'UNSUCCESSFUL'].includes(text)) return 'FAIL';
    return '';
}

function parseMappingDurationHours(value) {
    if (value === null || value === undefined) return 2;

    const text = String(value).trim().toLowerCase();
    if (!text) return 2;
    if (/^\d+(\.\d+)?$/.test(text)) return Number(text);

    const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*d(?:ay|ays)?/i);
    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h(?:our|hours)?/i);
    const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?:in|ins|inute|inutes)?/i);

    let totalHours = 0;
    if (dayMatch) totalHours += Number(dayMatch[1]) * 24;
    if (hourMatch) totalHours += Number(hourMatch[1]);
    if (minuteMatch) totalHours += Number(minuteMatch[1]) / 60;

    return totalHours > 0 ? Number(totalHours.toFixed(2)) : 2;
}

function formatMappingDuration(job) {
    const hours = Number(job?.estimated_duration_hours || parseMappingDurationHours(job?.duration));
    if (!Number.isFinite(hours) || hours <= 0) return '-';

    const wholeDays = Math.floor(hours / 24);
    const remainingHours = Number((hours % 24).toFixed(1));

    if (wholeDays > 0 && remainingHours > 0) return `${wholeDays}d ${remainingHours}h`;
    if (wholeDays > 0) return `${wholeDays}d`;
    return `${Number(hours.toFixed(1))}h`;
}

function formatMappingDate(value) {
    const date = parseMappingDateValue(value);
    if (!date) return '-';

    return new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function getMappingDueDateValue(job) {
    if (job?.mapping_due_date) return toMappingDateInputValue(job.mapping_due_date);
    if (job?.report_completion_date) return addMonthsToMappingDate(job.report_completion_date, 6);
    if (job?.completed_at) return addMonthsToMappingDate(job.completed_at, 6);
    return '';
}

function getMappingReminderMeta(job) {
    const dueDateValue = getMappingDueDateValue(job);
    const dueDate = parseMappingDateValue(dueDateValue);
    const isCompleted = job?.isCompleted || job?.status === 'Completed' || job?.report_status === 'Report Completed';

    if (!dueDate) {
        return {
            label: isCompleted ? 'Due date unavailable' : 'Due 6 months after completion',
            badgeClass: 'badge-blue',
            daysUntil: null,
            dueDateDisplay: '-'
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000);

    if (daysUntil < 0) {
        return {
            label: `Overdue by ${Math.abs(daysUntil)} day(s)`,
            badgeClass: 'badge-red',
            daysUntil,
            dueDateDisplay: formatMappingDate(dueDateValue)
        };
    }

    if (daysUntil <= MAPPING_REMINDER_WINDOW_DAYS) {
        return {
            label: `Due in ${daysUntil} day(s)`,
            badgeClass: 'badge-orange',
            daysUntil,
            dueDateDisplay: formatMappingDate(dueDateValue)
        };
    }

    return {
        label: `Due in ${daysUntil} day(s)`,
        badgeClass: 'badge-green',
        daysUntil,
        dueDateDisplay: formatMappingDate(dueDateValue)
    };
}

function buildMappingJobViewModel(job, clientsById) {
    const season = normalizeMappingSeason(job.season) || '-';
    const result = normalizeMappingResult(job.report_result);
    const customerName = clientsById.get(job.client_id) || job.current_customer || 'Unknown customer';
    const reportDateValue = job.report_completion_date || job.completed_at || job.created_at || '';
    const reportDate = parseMappingDateValue(reportDateValue);
    const isCompleted = job.status === 'Completed' || job.report_status === 'Report Completed';
    const reminder = getMappingReminderMeta({ ...job, isCompleted });

    return {
        ...job,
        isCompleted,
        displayTitle: job.title || job.protocol_number || 'Mapping Job',
        customerName,
        technicianLabel: job.technician_name || 'Unassigned',
        seasonLabel: season,
        qtyLabel: job.qty || job.logger_qty || 1,
        durationLabel: job.duration || formatMappingDuration(job),
        resultLabel: result || 'PENDING',
        resultBadgeClass: result === 'PASS' ? 'badge-green' : result === 'FAIL' ? 'badge-red' : 'badge-orange',
        reportStatusLabel: job.report_status || (isCompleted ? 'Report Completed' : 'In Progress'),
        reportStatusBadgeClass: isCompleted ? 'badge-green' : 'badge-blue',
        installDateDisplay: formatMappingDate(job.install_date),
        uninstallDateDisplay: formatMappingDate(job.uninstall_date),
        handoverDateDisplay: formatMappingDate(job.handover_date),
        reportDateDisplay: formatMappingDate(job.report_completion_date),
        completedDateDisplay: formatSouthAfricaDateTime(job.completed_at),
        dueDateValue: getMappingDueDateValue(job),
        dueDateDisplay: reminder.dueDateDisplay,
        reminder,
        reportYear: reportDate ? String(reportDate.getFullYear()) : '',
        notesDisplay: job.notes || '-'
    };
}

async function fetchMappingJobsDataset() {
    const { data: jobs, error: jobsError } = await window.supabaseClient
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false });

    if (jobsError) throw jobsError;

    const mappingJobs = (jobs || []).filter(job => {
        if (String(job.created_by || '').trim() === HISTORICAL_TRACKER_IMPORT_CREATED_BY) {
            return false;
        }

        const workflowModule = String(job.workflow_module || '').trim().toLowerCase();
        const jobType = String(job.job_type || '').trim().toLowerCase();
        const title = String(job.title || '').trim().toLowerCase();
        const hasMappingFields = Boolean(
            job.mapping_due_date ||
            job.install_date ||
            job.uninstall_date ||
            job.handover_date ||
            job.report_completion_date ||
            normalizeMappingSeason(job.season) ||
            normalizeMappingResult(job.report_result) ||
            title.includes('mapping')
        );

        return workflowModule === 'mapping' || jobType === 'mapping' || hasMappingFields;
    });

    const clientIds = [...new Set(mappingJobs.map(job => job.client_id).filter(Boolean))];
    const clientsById = new Map();

    if (clientIds.length) {
        const { data: clients, error: clientsError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name')
            .in('id', clientIds);

        if (clientsError) throw clientsError;
        (clients || []).forEach(client => clientsById.set(client.id, client.client_name || 'Unknown customer'));
    }

    return mappingJobs.map(job => buildMappingJobViewModel(job, clientsById));
}

function populateReportYearFilter(jobs) {
    const yearSelect = document.getElementById('repYear');
    if (!yearSelect) return;

    const selectedValue = yearSelect.value || 'all';
    const years = [...new Set((jobs || []).map(job => job.reportYear).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

    yearSelect.innerHTML = '<option value="all">All Years</option>' + years.map(year => `<option value="${escapeMappingHtml(year)}">${escapeMappingHtml(year)}</option>`).join('');
    yearSelect.value = years.includes(selectedValue) ? selectedValue : 'all';
}

function normalizeMappingSearchText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getMappingReportFilterDateValue(job) {
    return toMappingDateInputValue(job.report_completion_date || job.completed_at || job.created_at || '');
}

function renderMappingReminderBanner(targetId, jobs) {
    const container = document.getElementById(targetId);
    if (!container) return;

    const dueSoon = (jobs || [])
        .filter(job => job.isCompleted && job.reminder?.daysUntil !== null && job.reminder.daysUntil <= MAPPING_REMINDER_WINDOW_DAYS)
        .sort((a, b) => (a.reminder?.daysUntil ?? Number.MAX_SAFE_INTEGER) - (b.reminder?.daysUntil ?? Number.MAX_SAFE_INTEGER));

    if (!dueSoon.length) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="mapping-reminder-banner">
            <div>
                <span class="mapping-kicker"><i class="fas fa-bell"></i> Mapping Reminder</span>
                <h3 style="margin: 10px 0 6px;">${dueSoon.length} mapping report(s) need attention</h3>
                <p style="margin: 0; color: var(--text-secondary); font-size: 0.88rem;">Reports are flagged when the next mapping date is overdue or due within ${MAPPING_REMINDER_WINDOW_DAYS} days.</p>
            </div>
            <ul class="mapping-reminder-list">
                ${dueSoon.slice(0, 5).map(job => `
                    <li>
                        <strong>${escapeMappingHtml(job.displayTitle)}</strong>
                        <span>${escapeMappingHtml(job.customerName)} • ${escapeMappingHtml(job.reminder.label)} • Due ${escapeMappingHtml(job.dueDateDisplay)}</span>
                    </li>
                `).join('')}
            </ul>
        </div>
    `;
}

function buildMappingCard(job) {
    const canDeleteJobs = hasMappingPermission('canDeleteJobs');

    return `
        <article class="mapping-card">
            <div class="mapping-card-header">
                <div>
                    <span class="mapping-kicker"><i class="fas fa-map-marked-alt"></i> Seasonal Mapping</span>
                    <h3>${escapeMappingHtml(job.displayTitle)} • <span class="badge ${escapeMappingHtml(job.reportStatusBadgeClass)}">${escapeMappingHtml(job.reportStatusLabel)}</span></h3>
                    <div class="mapping-meta-line">Customer: <strong>${escapeMappingHtml(job.customerName)}</strong> • Protocol: <strong>${escapeMappingHtml(job.protocol_number || '-')}</strong> • Tech: <strong>${escapeMappingHtml(job.technicianLabel)}</strong></div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge ${escapeMappingHtml(job.resultBadgeClass)}">${escapeMappingHtml(job.resultLabel)}</span>
                    <span class="badge ${escapeMappingHtml(job.reminder.badgeClass)}">${escapeMappingHtml(job.reminder.label)}</span>
                </div>
            </div>
            <div class="mapping-detail-grid">
                <div class="mapping-detail-item"><strong>Qty</strong><span>${escapeMappingHtml(job.qtyLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Duration</strong><span>${escapeMappingHtml(job.durationLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Season</strong><span>${escapeMappingHtml(job.seasonLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Install</strong><span>${escapeMappingHtml(job.installDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Uninstall</strong><span>${escapeMappingHtml(job.uninstallDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Handover</strong><span>${escapeMappingHtml(job.handoverDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Report Done</strong><span>${escapeMappingHtml(job.reportDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Next Due</strong><span>${escapeMappingHtml(job.dueDateDisplay)}</span></div>
            </div>
            <div class="mapping-notes-block">
                <strong>Notes</strong>
                <div>${escapeMappingHtml(job.notesDisplay)}</div>
            </div>
            <div class="mapping-card-actions">
                <button class="btn btn-small" onclick="setMappingDateField('${job.id}', 'install_date')">Install Done</button>
                <button class="btn btn-small" onclick="setMappingDateField('${job.id}', 'uninstall_date')">Uninstall Done</button>
                <button class="btn btn-small" onclick="setMappingDateField('${job.id}', 'handover_date')">Handover Done</button>
                <button class="btn btn-small" onclick="setMappingDateField('${job.id}', 'report_completion_date')">Report Done</button>
                <button class="btn btn-small" onclick="setMappingResult('${job.id}', 'PASS')">Pass</button>
                <button class="btn btn-small" onclick="setMappingResult('${job.id}', 'FAIL')">Fail</button>
                <button class="btn btn-primary btn-small" onclick="completeMappingReport('${job.id}')">Complete Report</button>
                <button class="btn btn-small" onclick="startEditingMappingJob('${job.id}')">Edit</button>
                <button class="btn btn-small" onclick="openMappingReportModal('${job.id}')">View</button>
                ${canDeleteJobs ? `<button class="btn btn-small btn-delete" onclick="deleteMappingReport('${job.id}')">Delete</button>` : ''}
            </div>
        </article>
    `;
}

function buildCompletedReportCard(job) {
    const canDeleteJobs = hasMappingPermission('canDeleteJobs');

    return `
        <article class="mapping-card">
            <div class="mapping-report-header">
                <div>
                    <span class="mapping-kicker"><i class="fas fa-file-signature"></i> Report Completed</span>
                    <h3>${escapeMappingHtml(job.displayTitle)} • <span class="badge badge-green">Report Completed</span></h3>
                    <div class="mapping-meta-line">Customer: <strong>${escapeMappingHtml(job.customerName)}</strong> • Protocol: <strong>${escapeMappingHtml(job.protocol_number || '-')}</strong> • Tech: <strong>${escapeMappingHtml(job.technicianLabel)}</strong></div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge ${escapeMappingHtml(job.resultBadgeClass)}">${escapeMappingHtml(job.resultLabel)}</span>
                    <span class="badge ${escapeMappingHtml(job.reminder.badgeClass)}">${escapeMappingHtml(job.reminder.label)}</span>
                </div>
            </div>
            <div class="mapping-detail-grid">
                <div class="mapping-detail-item"><strong>Qty</strong><span>${escapeMappingHtml(job.qtyLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Duration</strong><span>${escapeMappingHtml(job.durationLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Season</strong><span>${escapeMappingHtml(job.seasonLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Install</strong><span>${escapeMappingHtml(job.installDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Uninstall</strong><span>${escapeMappingHtml(job.uninstallDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Handover</strong><span>${escapeMappingHtml(job.handoverDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Report Done</strong><span>${escapeMappingHtml(job.reportDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Next Due</strong><span>${escapeMappingHtml(job.dueDateDisplay)}</span></div>
            </div>
            <div class="mapping-notes-block">
                <strong>Notes</strong>
                <div>${escapeMappingHtml(job.notesDisplay)}</div>
            </div>
            <div class="mapping-card-actions">
                <button class="btn btn-small" onclick="startEditingMappingJob('${job.id}')">Edit</button>
                <button class="btn btn-small" onclick="openMappingReportModal('${job.id}')">View Report</button>
                <button class="btn btn-small" onclick="exportReportCSV('${job.id}')">Export CSV</button>
                ${canDeleteJobs ? `<button class="btn btn-small btn-delete" onclick="deleteMappingReport('${job.id}')">Delete</button>` : ''}
            </div>
        </article>
    `;
}

function getMappingFormElements() {
    return {
        protoEl: document.getElementById('mapProto'),
        customerEl: document.getElementById('mapCustomer'),
        techEl: document.getElementById('mapTech'),
        qtyEl: document.getElementById('mapQty'),
        durEl: document.getElementById('mapDuration'),
        seasonEl: document.getElementById('mapSeason'),
        installDateEl: document.getElementById('mapInstallDate'),
        uninstallDateEl: document.getElementById('mapUninstallDate'),
        handoverDateEl: document.getElementById('mapHandoverDate'),
        reportDateEl: document.getElementById('mapReportDate'),
        resultEl: document.getElementById('mapResult'),
        notesEl: document.getElementById('mapNotes')
    };
}

function getMappingFormValues() {
    const elements = getMappingFormElements();
    const {
        protoEl, customerEl, techEl, qtyEl, durEl, seasonEl,
        installDateEl, uninstallDateEl, handoverDateEl, reportDateEl, resultEl, notesEl
    } = elements;

    return {
        elements,
        values: {
            proto: protoEl?.value?.trim() || '',
            clientName: customerEl?.value?.trim() || '',
            tech: hasMappingPermission('canAssignJobs') ? (techEl?.value?.trim() || '') : '',
            qty: qtyEl?.value?.trim() || '1',
            dur: durEl?.value?.trim() || '',
            season: normalizeMappingSeason(seasonEl?.value),
            installDate: installDateEl?.value || '',
            uninstallDate: uninstallDateEl?.value || '',
            handoverDate: handoverDateEl?.value || '',
            reportCompletionDate: reportDateEl?.value || '',
            reportResult: normalizeMappingResult(resultEl?.value),
            notes: notesEl?.value?.trim() || ''
        }
    };
}

function setMappingFormMode(isEditing) {
    const saveButton = document.getElementById('saveMappingJobBtn');
    const cancelButton = document.getElementById('cancelMappingEditBtn');
    const heading = document.querySelector('#sub-view-mapping .card h3');
    const description = document.querySelector('#sub-view-mapping .card p');

    if (saveButton) saveButton.textContent = isEditing ? 'Save Changes' : 'Initialize Job';
    if (cancelButton) cancelButton.style.display = isEditing ? 'inline-flex' : 'none';
    if (heading) heading.textContent = isEditing ? 'Edit Mapping Job' : 'Create Mapping Job';
    if (description) {
        description.textContent = isEditing
            ? 'Update the seasonal mapping details here. The due reminder will recalculate from the report done date.'
            : 'Capture the seasonal mapping details here. A due reminder will automatically calculate for 6 months after the report is completed.';
    }
}

function resetMappingForm() {
    const { elements } = getMappingFormValues();
    Object.entries(elements).forEach(([key, el]) => {
        if (!el) return;
        el.value = key === 'qtyEl' ? '1' : '';
    });

    editingMappingJobId = null;
    setMappingFormMode(false);
}

async function startEditingMappingJob(jobId) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot edit mapping jobs.');
        return;
    }

    await openMappingReportModal(jobId, true);
}

function cancelMappingEdit() {
    resetMappingForm();
    showToast('Mapping edit cancelled.', 'info');
}

async function createMappingJob() {
    if (!hasMappingPermission('canCreateJobs')) {
        showMappingPermissionError('Your role cannot create mapping jobs.');
        return;
    }

    const { elements, values } = getMappingFormValues();
    const {
        protoEl, customerEl, techEl, qtyEl, durEl, seasonEl,
        installDateEl, uninstallDateEl, handoverDateEl, reportDateEl, resultEl, notesEl
    } = elements;
    const {
        proto, clientName, tech, qty, dur, season,
        installDate, uninstallDate, handoverDate, reportCompletionDate, reportResult, notes
    } = values;

    if (!protoEl || !customerEl) {
        showToast('Form elements not found. Please refresh the page.', 'error');
        return;
    }

    if (!proto) return showToast('Protocol Number is required.', 'error');
    if (!clientName) return showToast('Please select a Customer from the dropdown.', 'error');

    try {
        setGlobalLoading(true, 'Creating mapping job...');
        const createdBy = (typeof getCurrentActorLabel === 'function') ? await getCurrentActorLabel() : 'Manager';
        const { data: client, error: clientError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name')
            .eq('client_name', clientName)
            .maybeSingle();

        if (clientError) throw clientError;
        if (!client) throw new Error(`Client "${clientName}" not found. Please select from the dropdown.`);

        const safeQty = Math.max(1, parseInt(qty, 10) || 1);
        const estimatedDurationHours = parseMappingDurationHours(dur);
        const mappingDueDate = reportCompletionDate ? addMonthsToMappingDate(reportCompletionDate, 6) : '';

        const { data: insertedJob, error } = await window.supabaseClient
            .from('jobs')
            .insert([{
                id: crypto.randomUUID(),
                client_id: client.id,
                title: `Mapping ${proto}`,
                protocol_number: proto,
                job_type: 'Mapping',
                workflow_module: 'mapping',
                created_by: createdBy,
                technician_name: tech,
                qty: safeQty,
                logger_qty: safeQty,
                duration: dur || '',
                estimated_duration_hours: estimatedDurationHours,
                season: season || null,
                install_date: installDate || null,
                uninstall_date: uninstallDate || null,
                handover_date: handoverDate || null,
                report_completion_date: reportCompletionDate || null,
                report_result: reportResult || null,
                mapping_due_date: mappingDueDate || null,
                notes,
                status: 'In Progress',
                report_status: 'In Progress'
            }])
            .select();

        if (error) throw error;
        if (!insertedJob || insertedJob.length === 0) throw new Error('Job was not created');

        showToast('Mapping job created successfully.', 'success');
        await loadMappingData();

        protoEl.value = '';
        customerEl.value = '';
        if (techEl) techEl.value = '';
        if (qtyEl) qtyEl.value = '1';
        if (durEl) durEl.value = '';
        if (seasonEl) seasonEl.value = '';
        if (installDateEl) installDateEl.value = '';
        if (uninstallDateEl) uninstallDateEl.value = '';
        if (handoverDateEl) handoverDateEl.value = '';
        if (reportDateEl) reportDateEl.value = '';
        if (resultEl) resultEl.value = '';
        if (notesEl) notesEl.value = '';
        resetMappingForm();
    } catch (err) {
        console.error('Create mapping job error:', err);
        showToast('Failed to create mapping job: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function saveMappingJob() {
    if (editingMappingJobId) {
        await updateExistingMappingJob(editingMappingJobId);
        return;
    }

    await createMappingJob();
}

async function updateExistingMappingJob(id) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot edit mapping jobs.');
        return;
    }

    const { values } = getMappingFormValues();
    const {
        proto, clientName, tech, qty, dur, season,
        installDate, uninstallDate, handoverDate, reportCompletionDate, reportResult, notes
    } = values;

    if (!proto) return showToast('Protocol Number is required.', 'error');
    if (!clientName) return showToast('Please select a Customer from the dropdown.', 'error');

    try {
        setGlobalLoading(true, 'Saving mapping changes...');
        const { data: existingJob, error: fetchError } = await window.supabaseClient
            .from('jobs')
            .select('completed_at')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!existingJob) throw new Error('Mapping job not found.');

        const { data: client, error: clientError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name')
            .eq('client_name', clientName)
            .maybeSingle();

        if (clientError) throw clientError;
        if (!client) throw new Error(`Client "${clientName}" not found. Please select from the dropdown.`);

        const safeQty = Math.max(1, parseInt(qty, 10) || 1);
        const estimatedDurationHours = parseMappingDurationHours(dur);
        const isCompleted = Boolean(reportCompletionDate);

        const { error } = await window.supabaseClient
            .from('jobs')
            .update({
                client_id: client.id,
                title: `Mapping ${proto}`,
                protocol_number: proto,
                technician_name: tech,
                qty: safeQty,
                logger_qty: safeQty,
                duration: dur || '',
                estimated_duration_hours: estimatedDurationHours,
                season: season || null,
                install_date: installDate || null,
                uninstall_date: uninstallDate || null,
                handover_date: handoverDate || null,
                report_completion_date: reportCompletionDate || null,
                report_result: reportResult || null,
                mapping_due_date: reportCompletionDate ? addMonthsToMappingDate(reportCompletionDate, 6) : null,
                notes,
                status: isCompleted ? 'Completed' : 'In Progress',
                report_status: isCompleted ? 'Report Completed' : 'In Progress',
                completed_at: isCompleted ? (existingJob.completed_at || new Date().toISOString()) : null,
                workflow_module: 'mapping',
                job_type: 'Mapping'
            })
            .eq('id', id);

        if (error) throw error;

        showToast('Mapping report updated.', 'success');
        resetMappingForm();
        await loadMappingData();
        await loadCompletedReports();

        if (mappingReportModalJob?.id === id) {
            await openMappingReportModal(id);
        }
    } catch (err) {
        console.error('Update existing mapping job error:', err);
        showToast('Failed to save mapping changes: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function loadMappingData() {
    const container = document.getElementById('mapping-container');
    if (!container) return;

    try {
        setGlobalLoading(true, 'Loading mapping jobs...');
        await populateInventoryDropdowns();
        const jobs = await fetchMappingJobsDataset();
        const activeJobs = jobs.filter(job => !job.isCompleted);

        renderMappingReminderBanner('mappingDueReminderBar', jobs);

        if (!activeJobs.length) {
            container.className = '';
            container.innerHTML = `
                <div class="card" style="text-align:center; padding: 32px;">
                    <i class="fas fa-map-marked-alt" style="font-size: 2rem; color: #94a3b8; margin-bottom: 12px;"></i>
                    <h3 style="margin-bottom: 8px;">No active mapping jobs</h3>
                    <p style="margin: 0; color: var(--text-secondary);">Create a summer or winter mapping job above to start tracking the process.</p>
                </div>
            `;
            return;
        }

        container.className = 'mapping-grid';
        container.innerHTML = activeJobs.map(buildMappingCard).join('');
    } catch (err) {
        console.error('Load mapping data error:', err);
        container.className = '';
        container.innerHTML = `<div class="card" style="padding: 24px; color: var(--accent-red);">Failed to load mapping jobs: ${escapeMappingHtml(err.message)}</div>`;
        showToast('Failed to load mapping jobs: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function updateMappingJobFields(id, updates, successMessage) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot update mapping job details.');
        return;
    }

    try {
        setGlobalLoading(true, 'Updating mapping job...');
        const { error } = await window.supabaseClient
            .from('jobs')
            .update({
                ...updates,
                workflow_module: 'mapping',
                job_type: 'Mapping'
            })
            .eq('id', id);

        if (error) throw error;
        if (successMessage) showToast(successMessage, 'success');

        if (currentInventoryTab === 'completed-reports') {
            await loadCompletedReports();
        } else {
            await loadMappingData();
        }
    } catch (err) {
        console.error('Update mapping job error:', err);
        showToast('Failed to update mapping job: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function setMappingDateField(id, fieldName) {
    const today = toMappingDateInputValue(new Date());
    const fieldLabels = {
        install_date: 'Installed',
        uninstall_date: 'Uninstalled',
        handover_date: 'Handover',
        report_completion_date: 'Report Done'
    };

    const updates = {
        [fieldName]: today,
        report_status: fieldLabels[fieldName] || 'In Progress'
    };

    if (fieldName === 'report_completion_date') {
        updates.mapping_due_date = addMonthsToMappingDate(today, 6);
    }

    await updateMappingJobFields(id, updates, `${fieldLabels[fieldName] || 'Date'} captured.`);
}

async function setMappingResult(id, result) {
    const normalized = normalizeMappingResult(result);
    if (!normalized) {
        showToast('Please choose PASS or FAIL for the mapping result.', 'error');
        return;
    }

    await updateMappingJobFields(id, { report_result: normalized }, `Mapping result set to ${normalized}.`);
}

async function completeMappingReport(id) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot complete mapping reports.');
        return;
    }

    try {
        setGlobalLoading(true, 'Completing mapping report...');
        const { data: job, error: fetchError } = await window.supabaseClient
            .from('jobs')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!job) throw new Error('Mapping job not found.');

        let reportResult = normalizeMappingResult(job.report_result);
        if (!reportResult) {
            reportResult = normalizeMappingResult(prompt('Enter the mapping result as PASS or FAIL.', 'PASS'));
        }

        if (!reportResult) {
            showToast('A PASS or FAIL result is required before completion.', 'error');
            return;
        }

        const reportCompletionDate = job.report_completion_date || toMappingDateInputValue(new Date());
        const mappingDueDate = addMonthsToMappingDate(reportCompletionDate, 6);

        const { error } = await window.supabaseClient
            .from('jobs')
            .update({
                workflow_module: 'mapping',
                job_type: 'Mapping',
                report_result: reportResult,
                report_completion_date: reportCompletionDate,
                mapping_due_date: mappingDueDate,
                status: 'Completed',
                report_status: 'Report Completed',
                completed_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        showToast('Mapping report completed and saved.', 'success');
        await loadMappingData();
        await loadCompletedReports();
    } catch (err) {
        console.error('Complete mapping report error:', err);
        showToast('Failed to complete mapping report: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function loadCompletedReports() {
    const container = document.getElementById('completed-reports-container');
    if (!container) return;

    try {
        setGlobalLoading(true, 'Loading completed mapping reports...');
        await populateInventoryDropdowns();
        const jobs = await fetchMappingJobsDataset();
        const completedJobs = jobs.filter(job => job.isCompleted);

        populateReportYearFilter(completedJobs);
        renderMappingReminderBanner('completedReportsReminderBar', completedJobs);

        const startDate = document.getElementById('repStart')?.value || '';
        const endDate = document.getElementById('repEnd')?.value || '';
        const customerFilter = document.getElementById('repCustomer')?.value || 'all';
        const seasonFilter = normalizeMappingSeason(document.getElementById('repSeason')?.value) || 'all';
        const resultFilter = normalizeMappingResult(document.getElementById('repResult')?.value) || 'all';
        const yearFilter = document.getElementById('repYear')?.value || 'all';
        const statusSearch = normalizeMappingSearchText(document.getElementById('repStatusInput')?.value || '');
        const techSearch = normalizeMappingSearchText(document.getElementById('repTechInput')?.value || '');
        const protoSearch = normalizeMappingSearchText(document.getElementById('repProtoInput')?.value || '');
        const customerFilterNormalized = normalizeMappingSearchText(customerFilter);

        const filteredJobs = completedJobs.filter(job => {
            const reportDateValue = getMappingReportFilterDateValue(job);
            const customerNameNormalized = normalizeMappingSearchText(job.customerName);
            const seasonLabelNormalized = normalizeMappingSearchText(job.seasonLabel);
            const resultLabelNormalized = normalizeMappingSearchText(job.resultLabel);
            const statusLabelNormalized = normalizeMappingSearchText(job.reportStatusLabel);
            const technicianLabelNormalized = normalizeMappingSearchText(job.technicianLabel);
            const protocolNormalized = normalizeMappingSearchText(job.protocol_number);
            const titleNormalized = normalizeMappingSearchText(job.displayTitle);

            if (startDate && (!reportDateValue || reportDateValue < startDate)) return false;
            if (endDate && (!reportDateValue || reportDateValue > endDate)) return false;
            if (customerFilter !== 'all' && customerNameNormalized !== customerFilterNormalized) return false;
            if (seasonFilter !== 'all' && seasonLabelNormalized !== normalizeMappingSearchText(seasonFilter)) return false;
            if (resultFilter !== 'all' && resultLabelNormalized !== normalizeMappingSearchText(resultFilter)) return false;
            if (yearFilter !== 'all' && job.reportYear !== yearFilter) return false;
            if (statusSearch && !statusLabelNormalized.includes(statusSearch)) return false;
            if (techSearch && !technicianLabelNormalized.includes(techSearch)) return false;
            if (protoSearch && !protocolNormalized.includes(protoSearch) && !titleNormalized.includes(protoSearch)) return false;
            return true;
        });

        if (!filteredJobs.length) {
            container.className = '';
            container.innerHTML = `
                <div class="card" style="text-align:center; padding: 32px;">
                    <i class="fas fa-file-alt" style="font-size: 2rem; color: #94a3b8; margin-bottom: 12px;"></i>
                    <h3 style="margin-bottom: 8px;">No completed mapping reports found</h3>
                    <p style="margin: 0; color: var(--text-secondary);">Adjust your filters or complete a mapping job to build the report archive.</p>
                </div>
            `;
            return;
        }

        container.className = 'mapping-grid';
        container.innerHTML = filteredJobs.map(buildCompletedReportCard).join('');
    } catch (err) {
        console.error('Load completed reports error:', err);
        container.className = '';
        container.innerHTML = `<div class="card" style="padding: 24px; color: var(--accent-red);">Failed to load completed reports: ${escapeMappingHtml(err.message)}</div>`;
        showToast('Failed to load completed reports: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

function buildMappingReportEditForm(job) {
    const selectedSeason = normalizeMappingSeason(job.season);
    const selectedResult = normalizeMappingResult(job.report_result);

    return `
        <section class="mapping-report-section">
            <div class="mapping-report-header">
                <div>
                    <span class="mapping-kicker"><i class="fas fa-pen"></i> Edit Mapping Report</span>
                    <h3>${escapeMappingHtml(job.displayTitle)}</h3>
                    <div class="mapping-meta-line">Update the saved fields directly here.</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge ${escapeMappingHtml(job.resultBadgeClass)}">${escapeMappingHtml(job.resultLabel)}</span>
                    <span class="badge ${escapeMappingHtml(job.reminder.badgeClass)}">${escapeMappingHtml(job.reminder.label)}</span>
                </div>
            </div>
        </section>
        <section class="mapping-report-section">
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
                <div class="form-group"><label>Protocol</label><input type="text" id="mappingModalProtocol" class="form-control" value="${escapeMappingHtml(job.protocol_number || '')}"></div>
                <div class="form-group"><label>Customer</label><input type="text" id="mappingModalCustomer" class="form-control" value="${escapeMappingHtml(job.customerName || '')}"></div>
                <div class="form-group"><label>Technician</label><input type="text" id="mappingModalTechnician" class="form-control" value="${escapeMappingHtml(job.technician_name || '')}"></div>
                <div class="form-group"><label>Qty</label><input type="number" min="1" id="mappingModalQty" class="form-control" value="${escapeMappingHtml(job.qty || job.logger_qty || 1)}"></div>
                <div class="form-group"><label>Duration</label><input type="text" id="mappingModalDuration" class="form-control" value="${escapeMappingHtml(job.duration || '')}"></div>
                <div class="form-group"><label>Season</label><select id="mappingModalSeason" class="form-control"><option value="" ${!selectedSeason ? 'selected' : ''}>Select season</option><option value="SUMMER" ${selectedSeason === 'SUMMER' ? 'selected' : ''}>SUMMER</option><option value="WINTER" ${selectedSeason === 'WINTER' ? 'selected' : ''}>WINTER</option></select></div>
                <div class="form-group"><label>Install Date</label><input type="date" id="mappingModalInstallDate" class="form-control" value="${escapeMappingHtml(toMappingDateInputValue(job.install_date))}"></div>
                <div class="form-group"><label>Uninstall Date</label><input type="date" id="mappingModalUninstallDate" class="form-control" value="${escapeMappingHtml(toMappingDateInputValue(job.uninstall_date))}"></div>
                <div class="form-group"><label>Handover Date</label><input type="date" id="mappingModalHandoverDate" class="form-control" value="${escapeMappingHtml(toMappingDateInputValue(job.handover_date))}"></div>
                <div class="form-group"><label>Report Done</label><input type="date" id="mappingModalReportDate" class="form-control" value="${escapeMappingHtml(toMappingDateInputValue(job.report_completion_date))}"></div>
                <div class="form-group"><label>Result</label><select id="mappingModalResult" class="form-control"><option value="" ${!selectedResult ? 'selected' : ''}>Pending</option><option value="PASS" ${selectedResult === 'PASS' ? 'selected' : ''}>PASS</option><option value="FAIL" ${selectedResult === 'FAIL' ? 'selected' : ''}>FAIL</option></select></div>
            </div>
        </section>
        <section class="mapping-report-section">
            <div class="mapping-notes-block">
                <strong>Notes</strong>
                <textarea id="mappingModalNotes" rows="4" class="form-control" style="margin-top: 10px;">${escapeMappingHtml(job.notes || '')}</textarea>
            </div>
        </section>
    `;
}

function getMappingModalEditValues() {
    return {
        protocol: document.getElementById('mappingModalProtocol')?.value?.trim() || '',
        customer: document.getElementById('mappingModalCustomer')?.value?.trim() || '',
        technician: document.getElementById('mappingModalTechnician')?.value?.trim() || '',
        qty: document.getElementById('mappingModalQty')?.value?.trim() || '1',
        duration: document.getElementById('mappingModalDuration')?.value?.trim() || '',
        season: normalizeMappingSeason(document.getElementById('mappingModalSeason')?.value),
        installDate: document.getElementById('mappingModalInstallDate')?.value || '',
        uninstallDate: document.getElementById('mappingModalUninstallDate')?.value || '',
        handoverDate: document.getElementById('mappingModalHandoverDate')?.value || '',
        reportDate: document.getElementById('mappingModalReportDate')?.value || '',
        result: normalizeMappingResult(document.getElementById('mappingModalResult')?.value),
        notes: document.getElementById('mappingModalNotes')?.value?.trim() || ''
    };
}

async function saveMappingReportModalEdits(jobId) {
    if (!hasMappingPermission('canEditJobs')) {
        showMappingPermissionError('Your role cannot edit mapping jobs.');
        return;
    }

    const values = getMappingModalEditValues();
    if (!values.protocol) return showToast('Protocol Number is required.', 'error');
    if (!values.customer) return showToast('Customer is required.', 'error');

    try {
        setGlobalLoading(true, 'Saving mapping report...');
        const { data: existingJob, error: fetchError } = await window.supabaseClient
            .from('jobs')
            .select('completed_at')
            .eq('id', jobId)
            .maybeSingle();

        if (fetchError) throw fetchError;
        if (!existingJob) throw new Error('Mapping job not found.');

        const { data: client, error: clientError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name')
            .eq('client_name', values.customer)
            .maybeSingle();

        if (clientError) throw clientError;
        if (!client) throw new Error(`Client "${values.customer}" not found. Please use the saved customer name.`);

        const safeQty = Math.max(1, parseInt(values.qty, 10) || 1);
        const isCompleted = Boolean(values.reportDate);

        const { error } = await window.supabaseClient
            .from('jobs')
            .update({
                client_id: client.id,
                title: `Mapping ${values.protocol}`,
                protocol_number: values.protocol,
                technician_name: values.technician,
                qty: safeQty,
                logger_qty: safeQty,
                duration: values.duration || '',
                estimated_duration_hours: parseMappingDurationHours(values.duration),
                season: values.season || null,
                install_date: values.installDate || null,
                uninstall_date: values.uninstallDate || null,
                handover_date: values.handoverDate || null,
                report_completion_date: values.reportDate || null,
                report_result: values.result || null,
                mapping_due_date: values.reportDate ? addMonthsToMappingDate(values.reportDate, 6) : null,
                notes: values.notes,
                status: isCompleted ? 'Completed' : 'In Progress',
                report_status: isCompleted ? 'Report Completed' : 'In Progress',
                completed_at: isCompleted ? (existingJob.completed_at || new Date().toISOString()) : null,
                workflow_module: 'mapping',
                job_type: 'Mapping'
            })
            .eq('id', jobId);

        if (error) throw error;

        showToast('Mapping report updated.', 'success');
        mappingReportModalEditMode = false;
        await openMappingReportModal(jobId, false);
        await loadMappingData();
        await loadCompletedReports();
    } catch (err) {
        console.error('Save mapping modal edit error:', err);
        showToast('Failed to save mapping report: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

async function openMappingReportModal(jobId, editMode = false) {
    try {
        setGlobalLoading(true, 'Opening mapping report...');
        const jobs = await fetchMappingJobsDataset();
        const job = jobs.find(item => item.id === jobId);
        if (!job) throw new Error('Mapping report not found.');

        mappingReportModalJob = job;
        mappingReportModalEditMode = editMode;
        renderMappingReportModal(job, editMode);

        const modal = document.getElementById('mappingReportModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error('Open mapping modal error:', err);
        showToast('Unable to open report: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
}

function renderMappingReportModal(job) {
    const titleEl = document.getElementById('mappingReportModalTitle');
    const subtitleEl = document.getElementById('mappingReportModalSubtitle');
    const bodyEl = document.getElementById('mappingReportModalBody');
    const footerEl = document.querySelector('#mappingReportModal .mapping-report-modal-footer');

    if (titleEl) titleEl.textContent = job.displayTitle;
    if (subtitleEl) subtitleEl.textContent = `${job.customerName} • ${job.protocol_number || 'No protocol'} • ${job.seasonLabel}`;

    if (bodyEl) {
        bodyEl.innerHTML = `
            <section class="mapping-report-section">
                <div class="mapping-report-header">
                    <div>
                        <span class="mapping-kicker"><i class="fas fa-clipboard-check"></i> Seasonal Mapping Report</span>
                        <h3>${escapeMappingHtml(job.displayTitle)} • <span class="badge ${escapeMappingHtml(job.reportStatusBadgeClass)}">${escapeMappingHtml(job.reportStatusLabel)}</span></h3>
                        <div class="mapping-meta-line">Customer: <strong>${escapeMappingHtml(job.customerName)}</strong> • Protocol: <strong>${escapeMappingHtml(job.protocol_number || '-')}</strong> • Tech: <strong>${escapeMappingHtml(job.technicianLabel)}</strong></div>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <span class="badge ${escapeMappingHtml(job.resultBadgeClass)}">${escapeMappingHtml(job.resultLabel)}</span>
                        <span class="badge ${escapeMappingHtml(job.reminder.badgeClass)}">${escapeMappingHtml(job.reminder.label)}</span>
                    </div>
                </div>
            </section>
            <section class="mapping-report-section">
                <div class="mapping-detail-grid">
                    <div class="mapping-detail-item"><strong>Job Title</strong><span>${escapeMappingHtml(job.displayTitle)}</span></div>
                    <div class="mapping-detail-item"><strong>Customer</strong><span>${escapeMappingHtml(job.customerName)}</span></div>
                    <div class="mapping-detail-item"><strong>Protocol</strong><span>${escapeMappingHtml(job.protocol_number || '-')}</span></div>
                    <div class="mapping-detail-item"><strong>Technician</strong><span>${escapeMappingHtml(job.technicianLabel)}</span></div>
                    <div class="mapping-detail-item"><strong>Qty</strong><span>${escapeMappingHtml(job.qtyLabel)}</span></div>
                    <div class="mapping-detail-item"><strong>Duration</strong><span>${escapeMappingHtml(job.durationLabel)}</span></div>
                    <div class="mapping-detail-item"><strong>Season</strong><span>${escapeMappingHtml(job.seasonLabel)}</span></div>
                    <div class="mapping-detail-item"><strong>Result</strong><span>${escapeMappingHtml(job.resultLabel)}</span></div>
                    <div class="mapping-detail-item"><strong>Install Date</strong><span>${escapeMappingHtml(job.installDateDisplay)}</span></div>
                    <div class="mapping-detail-item"><strong>Uninstall Date</strong><span>${escapeMappingHtml(job.uninstallDateDisplay)}</span></div>
                    <div class="mapping-detail-item"><strong>Handover Date</strong><span>${escapeMappingHtml(job.handoverDateDisplay)}</span></div>
                    <div class="mapping-detail-item"><strong>Report Done</strong><span>${escapeMappingHtml(job.reportDateDisplay)}</span></div>
                    <div class="mapping-detail-item"><strong>Completed At</strong><span>${escapeMappingHtml(job.completedDateDisplay)}</span></div>
                    <div class="mapping-detail-item"><strong>Next Due</strong><span>${escapeMappingHtml(job.dueDateDisplay)}</span></div>
                </div>
            </section>
            <section class="mapping-report-section">
                <div class="mapping-notes-block">
                    <strong>Notes</strong>
                    <div>${escapeMappingHtml(job.notesDisplay)}</div>
                </div>
            </section>
        `;
    }

    if (footerEl) {
        footerEl.innerHTML = `
            <button type="button" class="btn btn-small" onclick="startEditingMappingJob('${job.id}')">Edit</button>
            <button type="button" class="btn btn-small" onclick="exportReportCSV('${job.id}')">Export CSV</button>
            ${hasMappingPermission('canDeleteJobs') ? `<button type="button" class="btn btn-small btn-delete" onclick="deleteMappingReport('${job.id}')">Delete</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="closeMappingReportModal()">Close</button>
        `;
    }
}

function closeMappingReportModal() {
    const modal = document.getElementById('mappingReportModal');
    if (modal) modal.style.display = 'none';
    mappingReportModalJob = null;
}

function buildMappingReportReadOnlyBody(job) {
    return `
        <section class="mapping-report-section">
            <div class="mapping-report-header">
                <div>
                    <span class="mapping-kicker"><i class="fas fa-clipboard-check"></i> Seasonal Mapping Report</span>
                    <h3>${escapeMappingHtml(job.displayTitle)} • <span class="badge ${escapeMappingHtml(job.reportStatusBadgeClass)}">${escapeMappingHtml(job.reportStatusLabel)}</span></h3>
                    <div class="mapping-meta-line">Customer: <strong>${escapeMappingHtml(job.customerName)}</strong> • Protocol: <strong>${escapeMappingHtml(job.protocol_number || '-')}</strong> • Tech: <strong>${escapeMappingHtml(job.technicianLabel)}</strong></div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span class="badge ${escapeMappingHtml(job.resultBadgeClass)}">${escapeMappingHtml(job.resultLabel)}</span>
                    <span class="badge ${escapeMappingHtml(job.reminder.badgeClass)}">${escapeMappingHtml(job.reminder.label)}</span>
                </div>
            </div>
        </section>
        <section class="mapping-report-section">
            <div class="mapping-detail-grid">
                <div class="mapping-detail-item"><strong>Job Title</strong><span>${escapeMappingHtml(job.displayTitle)}</span></div>
                <div class="mapping-detail-item"><strong>Customer</strong><span>${escapeMappingHtml(job.customerName)}</span></div>
                <div class="mapping-detail-item"><strong>Protocol</strong><span>${escapeMappingHtml(job.protocol_number || '-')}</span></div>
                <div class="mapping-detail-item"><strong>Technician</strong><span>${escapeMappingHtml(job.technicianLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Qty</strong><span>${escapeMappingHtml(job.qtyLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Duration</strong><span>${escapeMappingHtml(job.durationLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Season</strong><span>${escapeMappingHtml(job.seasonLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Result</strong><span>${escapeMappingHtml(job.resultLabel)}</span></div>
                <div class="mapping-detail-item"><strong>Install Date</strong><span>${escapeMappingHtml(job.installDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Uninstall Date</strong><span>${escapeMappingHtml(job.uninstallDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Handover Date</strong><span>${escapeMappingHtml(job.handoverDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Report Done</strong><span>${escapeMappingHtml(job.reportDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Completed At</strong><span>${escapeMappingHtml(job.completedDateDisplay)}</span></div>
                <div class="mapping-detail-item"><strong>Next Due</strong><span>${escapeMappingHtml(job.dueDateDisplay)}</span></div>
            </div>
        </section>
        <section class="mapping-report-section">
            <div class="mapping-notes-block">
                <strong>Notes</strong>
                <div>${escapeMappingHtml(job.notesDisplay)}</div>
            </div>
        </section>
    `;
}

function renderMappingReportModal(job, editMode = false) {
    const titleEl = document.getElementById('mappingReportModalTitle');
    const subtitleEl = document.getElementById('mappingReportModalSubtitle');
    const bodyEl = document.getElementById('mappingReportModalBody');
    const footerEl = document.querySelector('#mappingReportModal .mapping-report-modal-footer');

    if (titleEl) titleEl.textContent = job.displayTitle;
    if (subtitleEl) {
        subtitleEl.textContent = editMode
            ? 'Edit the saved mapping report fields directly here.'
            : `${job.customerName} • ${job.protocol_number || 'No protocol'} • ${job.seasonLabel}`;
    }

    if (bodyEl) {
        bodyEl.innerHTML = editMode ? buildMappingReportEditForm(job) : buildMappingReportReadOnlyBody(job);
    }

    if (footerEl) {
        footerEl.innerHTML = editMode
            ? `
                <button type="button" class="btn btn-primary" onclick="saveMappingReportModalEdits('${job.id}')">Save Changes</button>
                <button type="button" class="btn btn-secondary" onclick="openMappingReportModal('${job.id}', false)">Cancel</button>
            `
            : `
                <button type="button" class="btn btn-small" onclick="startEditingMappingJob('${job.id}')">Edit</button>
                <button type="button" class="btn btn-small" onclick="exportReportCSV('${job.id}')">Export CSV</button>
                ${hasMappingPermission('canDeleteJobs') ? `<button type="button" class="btn btn-small btn-delete" onclick="deleteMappingReport('${job.id}')">Delete</button>` : ''}
                <button type="button" class="btn btn-secondary" onclick="closeMappingReportModal()">Close</button>
            `;
    }
}

function closeMappingReportModal() {
    const modal = document.getElementById('mappingReportModal');
    if (modal) modal.style.display = 'none';
    mappingReportModalJob = null;
    mappingReportModalEditMode = false;
}

function handleMappingReportModalBackdropClick(event) {
    if (event.target?.id === 'mappingReportModal') {
        closeMappingReportModal();
    }
}

async function deleteMappingReport(jobId, protocol) {
    if (!hasMappingPermission('canDeleteJobs')) {
        showMappingPermissionError('Your role cannot delete mapping reports.');
        return;
    }

    try {
        let reportLabel = protocol || 'this mapping report';

        if (!protocol) {
            const { data: job, error: jobError } = await window.supabaseClient
                .from('jobs')
                .select('protocol_number, title')
                .eq('id', jobId)
                .maybeSingle();

            if (jobError) throw jobError;
            reportLabel = job?.protocol_number || job?.title || reportLabel;
        }

        const confirmed = confirm(`Delete ${reportLabel} permanently?\n\nThis will remove the saved mapping report and cannot be undone.`);
        if (!confirmed) return;

        setGlobalLoading(true, 'Deleting mapping report...');
        const { error } = await window.supabaseClient
            .from('jobs')
            .delete()
            .eq('id', jobId);

        if (error) throw error;

        if (mappingReportModalJob?.id === jobId) {
            closeMappingReportModal();
        }

        showToast('Mapping report deleted.', 'success');
        await loadMappingData();
        await loadCompletedReports();
    } catch (err) {
        console.error('Delete mapping report error:', err);
        showToast('Failed to delete mapping report: ' + err.message, 'error');
    } finally {
        setGlobalLoading(false);
    }
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
            selectedAssetIds.clear();
            updateAssetSelectionControls();
            if (reminderBar) reminderBar.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No assets found in registry.</td></tr>';
            return;
        }

        const searchKeyword = document.getElementById('assetSearchInput')?.value.trim().toLowerCase() || '';
        const statusFilter = document.getElementById('assetStatusFilter')?.value || 'all';
        const conditionFilter = document.getElementById('assetConditionFilter')?.value || 'all';
        const typeFilter = document.getElementById('assetTypeFilter')?.value || 'all';
        const customerFilter = document.getElementById('assetCustomerFilter')?.value || 'all';
        const limitFilterRaw = document.getElementById('assetLimitFilter')?.value || '50';
        const limitFilter = limitFilterRaw === 'all' ? Number.POSITIVE_INFINITY : Number(limitFilterRaw || '50');
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
        });

        const visibleAssets = Number.isFinite(limitFilter)
            ? filteredAssets.slice(0, limitFilter)
            : filteredAssets;

        latestFilteredAssets = visibleAssets.map(asset => {
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
        syncSelectedAssetsWithVisibleRows();
        updateAssetSelectionControls();

        console.log('Asset registry filtered count:', latestFilteredAssets.length);
        if (latestFilteredAssets.length === 0) {
            if (reminderBar) reminderBar.innerHTML = '';
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;">No assets match the filters.</td></tr>';
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
                    <td style="text-align:center;">
                        <input type="checkbox" ${selectedAssetIds.has(asset.id) ? 'checked' : ''} onchange="toggleAssetSelection('${asset.id}', this.checked)">
                    </td>
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
                            <button class="btn btn-small" onclick="openAssetUpdateModal('${asset.id}')">Update</button>
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
        selectedAssetIds.clear();
        updateAssetSelectionControls();
        if (reminderBar) reminderBar.innerHTML = '';
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; color: var(--accent-red);">Error: ${err.message}</td></tr>`;
    } finally {
        setGlobalLoading(false);
    }
}

/**
 * Export Helpers
 */
async function exportReportCSV(jobId) {
    try {
        setGlobalLoading(true, 'Exporting mapping report...');

        let job = mappingReportModalJob?.id === jobId ? mappingReportModalJob : null;
        if (!job) {
            const jobs = await fetchMappingJobsDataset();
            job = jobs.find(item => item.id === jobId) || null;
        }

        if (!job) throw new Error('Mapping report not found.');

        const rows = [
            ['Field', 'Value'],
            ['Job Title', job.displayTitle],
            ['Customer', job.customerName],
            ['Protocol Number', job.protocol_number || ''],
            ['Technician', job.technicianLabel],
            ['Quantity', job.qtyLabel],
            ['Duration', job.durationLabel],
            ['Season', job.seasonLabel],
            ['Status', job.reportStatusLabel],
            ['Result', job.resultLabel],
            ['Install Date', job.installDateDisplay],
            ['Uninstall Date', job.uninstallDateDisplay],
            ['Handover Date', job.handoverDateDisplay],
            ['Report Done Date', job.reportDateDisplay],
            ['Completed At', job.completedDateDisplay],
            ['Next Mapping Due', job.dueDateDisplay],
            ['Reminder Status', job.reminder?.label || ''],
            ['Notes', job.notesDisplay]
        ];

        const csv = rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const fileName = `Mapping_Report_${String(job.protocol_number || job.displayTitle || job.id).replace(/[^a-z0-9_-]+/gi, '_')}_${toMappingDateInputValue(new Date())}.csv`;
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast(`Mapping report exported to ${fileName}`, 'success');
    } catch (err) {
        console.error('Mapping CSV Export Error:', err);
        showToast(`Mapping export failed: ${err.message}`, 'error');
    } finally {
        setGlobalLoading(false);
    }
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

    ['repCustomer', 'repSeason', 'repResult', 'repYear'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'all';
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
                    ]), { prefer: 'start' }),
                    re_calibration_date: normalizeImportedDate(getSpreadsheetValue(row, [
                        're calibration date', 're-calibration date', 're_calibration_date', 'recalibration date', 'next calibration date'
                    ]), { prefer: 'end' }) || deriveImportedRangeEndDate(getSpreadsheetValue(row, [
                        'calibration date', 'calibration_date', 'calibration date range', 'last calibration date'
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
