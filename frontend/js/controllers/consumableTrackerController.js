let consumableTrackerEntries = [];
let consumableTrackerSummaries = [];
let pendingConsumableWorkbook = null;
let activeConsumableTrackerKey = 'double_sided_tape';
let consumableTrackerFiltersBound = false;
let consumableTrackerInlineEditId = '';

const CONSUMABLE_TRACKER_DEFINITIONS = [
    {
        key: 'double_sided_tape',
        label: 'Double Sided Tape',
        sheetName: 'Double Sided Tape Tracker',
        mode: 'issue',
        summaryRows: [
            { field: 'last_count_date', label: 'Date of last Tape count' },
            { field: 'last_movement_date', label: 'Date of last Tape movement' },
            { field: 'quantity_in_stock', label: 'Quantity in Stock' },
            { field: 'quantity_left_in_stock', label: 'Quantity left in stock' },
            { field: 'total_used_sales', label: 'Total tapes used' },
            { field: 'total_used_technical', label: 'Total Stock Used This Year' }
        ],
        columns: [
            { key: 'tracker_index', label: 'Index', shortLabel: 'Idx', type: 'number' },
            { key: 'customer_name', label: 'Customer Name', shortLabel: 'Customer', type: 'text' },
            { key: 'quantity_requested', label: 'Quantity Requested', shortLabel: 'Qty Req', type: 'number' },
            { key: 'date_requested', label: 'Date Requested', shortLabel: 'Req Date', type: 'date' },
            { key: 'completed_by_requested', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'quantity_given_to_technical', label: 'Quantity Given to Technical', shortLabel: 'Qty Tech', type: 'number' },
            { key: 'date_given_to_technical', label: 'Date given to technical', shortLabel: 'Tech Date', type: 'date' },
            { key: 'completed_by_technical', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'reason', label: 'Reason', shortLabel: 'Reason', type: 'textarea' }
        ]
    },
    {
        key: 'cable_ties',
        label: 'Cable Ties',
        sheetName: 'Copy of Cable Tie Tracker',
        mode: 'issue',
        summaryRows: [
            { field: 'last_count_date', label: 'Date of last cable tie count' },
            { field: 'last_movement_date', label: 'Date of last Cable Tie movement' },
            { field: 'quantity_in_stock', label: 'Quantity in Stock' },
            { field: 'quantity_left_in_stock', label: 'Quantity left in stock' },
            { field: 'total_used_sales', label: 'Total Cable Ties used' },
            { field: 'total_used_technical', label: 'Total Stock Used This Year' }
        ],
        columns: [
            { key: 'tracker_index', label: 'Index', shortLabel: 'Idx', type: 'number' },
            { key: 'customer_name', label: 'Customer Name', shortLabel: 'Customer', type: 'text' },
            { key: 'quantity_requested', label: 'Quantity Requested', shortLabel: 'Qty Req', type: 'number' },
            { key: 'date_requested', label: 'Date Requested', shortLabel: 'Req Date', type: 'date' },
            { key: 'completed_by_requested', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'quantity_given_to_technical', label: 'Quantity Given to Technical', shortLabel: 'Qty Tech', type: 'number' },
            { key: 'date_given_to_technical', label: 'Date given to technical', shortLabel: 'Tech Date', type: 'date' },
            { key: 'completed_by_technical', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'reason', label: 'Reason', shortLabel: 'Reason', type: 'textarea' }
        ]
    },
    {
        key: 'new_batteries',
        label: 'New Batteries',
        sheetName: 'Copy of New Battery Tracker',
        mode: 'issue',
        summaryRows: [
            { field: 'last_count_date', label: 'Date of last battery count' },
            { field: 'last_movement_date', label: 'Date of last battery movement' },
            { field: 'quantity_in_stock', label: 'Quantity in Stock' },
            { field: 'quantity_left_in_stock', label: 'Quantity left in stock' },
            { field: 'total_used_sales', label: 'Total Batteries used since last count' },
            { field: 'total_used_technical', label: 'Total Stock Used This Year' }
        ],
        columns: [
            { key: 'tracker_index', label: 'Index', shortLabel: 'Idx', type: 'number' },
            { key: 'customer_name', label: 'Customer Name', shortLabel: 'Customer', type: 'text' },
            { key: 'quantity_requested', label: 'Quantity Requested', shortLabel: 'Qty Req', type: 'number' },
            { key: 'date_requested', label: 'Date Requested', shortLabel: 'Req Date', type: 'date' },
            { key: 'completed_by_requested', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'quantity_given_to_technical', label: 'Quantity Given to Technical', shortLabel: 'Qty Tech', type: 'number' },
            { key: 'date_given_to_technical', label: 'Date given to technical', shortLabel: 'Tech Date', type: 'date' },
            { key: 'completed_by_technical', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'reason', label: 'Reason', shortLabel: 'Reason', type: 'textarea' }
        ]
    },
    {
        key: 'battery_disposal',
        label: 'Battery Disposal',
        sheetName: 'Copy of Battery Disposal Tracke',
        mode: 'disposal',
        summaryRows: [
            { field: 'last_disposal_date', label: 'Date of last battery disposed' },
            { field: 'total_quantity_disposed', label: 'Total Quantity Disposed' }
        ],
        columns: [
            { key: 'tracker_index', label: 'Index', shortLabel: 'Idx', type: 'number' },
            { key: 'customer_name', label: 'Customer Name', shortLabel: 'Customer', type: 'text' },
            { key: 'quantity_disposed', label: 'Quantity Given for Disposal', shortLabel: 'Qty Disp', type: 'number' },
            { key: 'date_requested', label: 'Date (YYYY/MM/DD)', shortLabel: 'Date', type: 'date' },
            { key: 'completed_by_requested', label: 'Completed By', shortLabel: 'By', type: 'text' },
            { key: 'reason', label: 'Reason for Disposal', shortLabel: 'Reason', type: 'textarea' }
        ]
    }
];

async function loadConsumableInventoryView() {
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading consumable tracker...');
        const [entriesResult, summariesResult] = await Promise.all([
            window.supabaseClient.from('consumable_tracker_entries').select('*').order('tracker_key').order('tracker_index'),
            window.supabaseClient.from('consumable_tracker_summaries').select('*').order('tracker_name')
        ]);
        if (entriesResult.error) throw entriesResult.error;
        if (summariesResult.error) throw summariesResult.error;

        consumableTrackerEntries = entriesResult.data || [];
        consumableTrackerSummaries = summariesResult.data || [];
        bindConsumableTrackerFilters();
        renderConsumableTrackerWorkspace();
    } catch (error) {
        console.error('Consumable tracker load error:', error);
        const banner = document.getElementById('consumable-tracker-status-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.textContent = `Consumable tracker is unavailable until the latest schema is applied: ${error.message}`;
        }
        if (typeof showToast === 'function') showToast('Failed to load consumable tracker: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function bindConsumableTrackerFilters() {
    if (consumableTrackerFiltersBound) return;
    ['consumable-tracker-search'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('input', renderConsumableTrackerWorkspace);
    });
    consumableTrackerFiltersBound = true;
}

function renderConsumableTrackerWorkspace() {
    renderConsumableTrackerChips();
    renderConsumableTrackerOverview();
    renderConsumableTrackerSummaryCards();
    renderConsumableTrackerSummaryForm();
    renderConsumableTrackerTable();
    renderConsumableTrackerForm();
}

function renderConsumableTrackerChips() {
    const container = document.getElementById('consumable-tracker-switcher');
    if (!container) return;
    container.innerHTML = CONSUMABLE_TRACKER_DEFINITIONS.map(definition => `
        <button
            type="button"
            class="sales-section-chip ${definition.key === activeConsumableTrackerKey ? 'active' : ''}"
            onclick="setActiveConsumableTracker('${escapeConsumableHtml(definition.key)}')"
        >${escapeConsumableHtml(definition.label)}</button>
    `).join('');
}

function renderConsumableTrackerOverview() {
    const entries = getConsumableEntriesForActiveTracker();
    const definition = getActiveConsumableTrackerDefinition();
    const summary = getConsumableSummary(definition.key);
    setConsumableText('consumable-tracker-count', String(entries.length));
    setConsumableText('reports-count', String(entries.length));
    setConsumableText('consumable-tracker-stock', formatConsumableNumber(summary?.quantity_in_stock));
    setConsumableText('consumable-tracker-balance', formatConsumableNumber(summary?.quantity_left_in_stock));
    setConsumableText('consumable-tracker-moved', formatConsumableNumber(getConsumableTotalMoved(entries, definition)));
    setConsumableText('consumable-tracker-last-date', formatConsumableDate(summary?.last_movement_date || summary?.last_disposal_date || summary?.last_count_date));
}

function renderConsumableTrackerSummaryCards() {
    const container = document.getElementById('consumable-tracker-summary-grid');
    if (!container) return;
    const definition = getActiveConsumableTrackerDefinition();
    const summary = getConsumableSummary(definition.key) || {};
    const cards = definition.summaryRows.map(item => `
        <div class="historical-jobs-import-card">
            <span>${escapeConsumableHtml(item.label)}</span>
            <strong>${escapeConsumableHtml(isConsumableSummaryDateField(item.field) ? formatConsumableDate(summary[item.field]) : formatConsumableNumber(summary[item.field]))}</strong>
        </div>
    `).join('');
    container.innerHTML = cards || '<div class="dashboard-empty-state">Import the workbook or save summary values to track this consumable sheet.</div>';
}

function renderConsumableTrackerSummaryForm() {
    const shell = document.getElementById('consumable-tracker-summary-form-shell');
    if (!shell) return;
    const definition = getActiveConsumableTrackerDefinition();
    const summary = getConsumableSummary(definition.key) || {};
    shell.innerHTML = `
        <div class="consumable-summary-editor">
            <div class="form-row">
                ${definition.summaryRows.map(item => `
                    <div class="form-group calibration-form-group">
                        <label>${escapeConsumableHtml(item.label)}</label>
                        <input
                            type="${isConsumableSummaryDateField(item.field) ? 'date' : 'number'}"
                            id="consumable-summary-${escapeConsumableHtml(item.field)}"
                            class="form-control"
                            ${isConsumableSummaryDateField(item.field) ? '' : 'step="1"'}
                            value="${escapeConsumableHtml(isConsumableSummaryDateField(item.field) ? normalizeConsumableDateForInput(summary[item.field]) : (summary[item.field] ?? ''))}"
                        >
                    </div>
                `).join('')}
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:14px;">
                <button type="button" class="btn btn-small" onclick="saveConsumableTrackerSummary()">Save Summary</button>
            </div>
        </div>
    `;
}

function renderConsumableTrackerTable() {
    const thead = document.getElementById('consumable-tracker-table-head');
    const tbody = document.getElementById('consumable-tracker-table-body');
    if (!thead || !tbody) return;
    const definition = getActiveConsumableTrackerDefinition();
    const entries = getFilteredConsumableEntries();

    thead.innerHTML = `<tr>${definition.columns.map(column => `<th>${escapeConsumableHtml(column.label)}</th>`).join('')}<th class="calibration-tracker-actions-head">Actions</th></tr>`;
    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="${definition.columns.length + 1}" style="text-align:center; color: var(--text-secondary);">No consumable rows found for this tracker.</td></tr>`;
        return;
    }

    tbody.innerHTML = entries.map(entry => {
        const isEditing = String(entry.id) === String(consumableTrackerInlineEditId);
        return `
            <tr class="${isEditing ? 'calibration-inline-edit-row' : ''}">
                ${definition.columns.map(column => `
                    <td class="calibration-tracker-cell consumable-tracker-cell consumable-tracker-cell-${escapeConsumableHtml(column.key)}">
                        ${isEditing
                            ? renderConsumableInlineInput(entry, column)
                            : `<span>${escapeConsumableHtml(formatConsumableCell(entry[column.key], column.type))}</span>`}
                    </td>
                `).join('')}
                <td class="calibration-tracker-cell consumable-tracker-actions-cell">
                    <div class="sales-table-actions calibration-inline-actions">
                        ${isEditing
                            ? `
                                <button type="button" class="btn btn-small btn-primary" onclick="event.stopPropagation(); saveInlineConsumableEntry('${escapeConsumableHtml(entry.id)}')">Save</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); cancelConsumableInlineEdit()">Cancel</button>
                            `
                            : `
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); startConsumableInlineEdit('${escapeConsumableHtml(entry.id)}')">Quick Edit</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); loadConsumableEntryIntoForm('${escapeConsumableHtml(entry.id)}')">Form Edit</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); deleteConsumableEntry('${escapeConsumableHtml(entry.id)}')">Delete</button>
                            `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderConsumableTrackerForm() {
    const shell = document.getElementById('consumable-tracker-form-shell');
    if (!shell) return;
    const definition = getActiveConsumableTrackerDefinition();
    shell.innerHTML = `
        <input type="hidden" id="consumable-tracker-entry-id">
        <div class="form-row">
            ${definition.columns.map(column => renderConsumableFormField(column)).join('')}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:18px;">
            <button type="button" class="btn" onclick="resetConsumableTrackerForm()">Clear</button>
            <button type="button" class="btn btn-primary" onclick="saveConsumableTrackerEntry()">Save Tracker Row</button>
        </div>
    `;
}

function renderConsumableInlineInput(entry, column) {
    const value = column.type === 'date'
        ? normalizeConsumableDateForInput(entry[column.key])
        : column.type === 'number'
            ? String(entry[column.key] ?? '')
            : escapeConsumableHtml(String(entry[column.key] ?? ''));
    const commonAttrs = `
        data-consumable-inline-id="${escapeConsumableHtml(entry.id)}"
        data-consumable-key="${escapeConsumableHtml(column.key)}"
        class="form-control calibration-inline-input"
        onclick="event.stopPropagation()"
    `;
    if (column.type === 'textarea') {
        return `<textarea ${commonAttrs} rows="2">${value}</textarea>`;
    }
    return `<input type="${column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}" value="${value}" ${commonAttrs} ${column.type === 'number' ? 'step="1" min="0"' : ''}>`;
}

function renderConsumableFormField(column) {
    if (column.type === 'textarea') {
        return `
            <div class="form-group calibration-form-group calibration-form-group-wide">
                <label>${escapeConsumableHtml(column.label)}</label>
                <textarea id="consumable-form-${escapeConsumableHtml(column.key)}" class="form-control" rows="3"></textarea>
            </div>
        `;
    }
    return `
        <div class="form-group calibration-form-group">
            <label>${escapeConsumableHtml(column.label)}</label>
            <input
                type="${column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}"
                id="consumable-form-${escapeConsumableHtml(column.key)}"
                class="form-control"
                ${column.type === 'number' ? 'step="1" min="0"' : ''}
            >
        </div>
    `;
}

function setActiveConsumableTracker(key) {
    activeConsumableTrackerKey = key;
    consumableTrackerInlineEditId = '';
    resetConsumableTrackerForm();
    renderConsumableTrackerWorkspace();
}

function getActiveConsumableTrackerDefinition() {
    return CONSUMABLE_TRACKER_DEFINITIONS.find(item => item.key === activeConsumableTrackerKey) || CONSUMABLE_TRACKER_DEFINITIONS[0];
}

function getConsumableEntriesForActiveTracker() {
    const definition = getActiveConsumableTrackerDefinition();
    return consumableTrackerEntries
        .filter(entry => entry.tracker_key === definition.key)
        .sort((left, right) => Number(left.tracker_index || 0) - Number(right.tracker_index || 0));
}

function getFilteredConsumableEntries() {
    const search = String(document.getElementById('consumable-tracker-search')?.value || '').trim().toLowerCase();
    return getConsumableEntriesForActiveTracker().filter(entry => {
        if (!search) return true;
        return ['customer_name', 'reason', 'completed_by_requested', 'completed_by_technical'].some(key => String(entry[key] || '').toLowerCase().includes(search));
    });
}

function getConsumableSummary(trackerKey) {
    return consumableTrackerSummaries.find(item => item.tracker_key === trackerKey) || null;
}

function getConsumableTotalMoved(entries, definition) {
    if (definition.mode === 'disposal') {
        return entries.reduce((sum, entry) => sum + Number(entry.quantity_disposed || 0), 0);
    }
    return entries.reduce((sum, entry) => sum + Number(entry.quantity_requested || 0), 0);
}

async function handleConsumableWorkbookImport(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Reading consumable workbook...');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        pendingConsumableWorkbook = parseConsumableWorkbook(workbook, file.name);
        renderConsumableImportPreview();
        if (typeof showToast === 'function') showToast(`Loaded ${pendingConsumableWorkbook.entries.length} consumable rows across ${pendingConsumableWorkbook.summaries.length} trackers.`, 'success');
    } catch (error) {
        console.error('Consumable workbook parse error:', error);
        pendingConsumableWorkbook = null;
        renderConsumableImportPreview();
        if (typeof showToast === 'function') showToast('Failed to parse consumable workbook: ' + error.message, 'error');
    } finally {
        event.target.value = '';
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function parseConsumableWorkbook(workbook, fileName) {
    const entries = [];
    const summaries = [];

    CONSUMABLE_TRACKER_DEFINITIONS.forEach(definition => {
        const worksheet = workbook.Sheets[definition.sheetName];
        if (!worksheet) return;
        const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
        const summary = extractConsumableSummary(definition, matrix, fileName);
        if (summary) summaries.push(summary);
        const sheetEntries = extractConsumableEntries(definition, matrix, fileName);
        entries.push(...sheetEntries);
    });

    return { entries, summaries, fileName };
}

function extractConsumableSummary(definition, matrix, fileName) {
    const summary = {
        tracker_key: definition.key,
        tracker_name: definition.label,
        source_file_name: fileName,
        imported_batch_label: `${fileName} | ${new Date().toISOString()}`,
        created_by: window.currentUserProfile?.username || window.currentUserProfile?.email || 'Consumable Import',
        updated_by: window.currentUserProfile?.username || window.currentUserProfile?.email || 'Consumable Import'
    };

    if (definition.mode === 'disposal') {
        summary.last_disposal_date = normalizeConsumableDateForStorage(matrix?.[1]?.[2]);
        summary.total_quantity_disposed = normalizeConsumableNumber(matrix?.[2]?.[2]);
        return summary;
    }

    summary.last_count_date = normalizeConsumableDateForStorage(matrix?.[1]?.[2]);
    summary.last_movement_date = normalizeConsumableDateForStorage(matrix?.[1]?.[4]);
    summary.quantity_in_stock = normalizeConsumableNumber(matrix?.[2]?.[2]);
    summary.quantity_left_in_stock = normalizeConsumableNumber(matrix?.[2]?.[4]);
    summary.total_used_sales = normalizeConsumableNumber(matrix?.[3]?.[4]);
    summary.total_used_technical = normalizeConsumableNumber(matrix?.[3]?.[5] || matrix?.[2]?.[5]);
    return summary;
}

function extractConsumableEntries(definition, matrix, fileName) {
    const headerIndex = matrix.findIndex(row => String(row?.[0] || '').trim() === 'Index' && String(row?.[1] || '').trim() === 'Customer Name');
    if (headerIndex < 0) return [];
    return matrix
        .slice(headerIndex + 1)
        .filter(row => Array.isArray(row) && row.slice(1).some(cell => String(cell ?? '').trim()))
        .map((row, index) => ({
            tracker_key: definition.key,
            tracker_name: definition.label,
            tracker_mode: definition.mode,
            tracker_index: normalizeConsumableNumber(row[0]) ?? index + 1,
            customer_name: normalizeConsumableString(row[1]),
            quantity_requested: definition.mode === 'issue' ? normalizeConsumableNumber(row[2]) : null,
            quantity_given_to_technical: definition.mode === 'issue' ? normalizeConsumableNumber(row[5]) : null,
            quantity_disposed: definition.mode === 'disposal' ? normalizeConsumableNumber(row[2]) : null,
            date_requested: normalizeConsumableDateForStorage(row[3]),
            date_given_to_technical: definition.mode === 'issue' ? normalizeConsumableDateForStorage(row[6]) : null,
            completed_by_requested: normalizeConsumableString(row[4]),
            completed_by_technical: definition.mode === 'issue' ? normalizeConsumableString(row[7]) : null,
            reason: normalizeConsumableString(definition.mode === 'disposal' ? row[5] : row[8]),
            source_file_name: fileName,
            source_sheet_name: definition.sheetName,
            imported_batch_label: `${fileName} | ${new Date().toISOString()}`,
            created_by: window.currentUserProfile?.username || window.currentUserProfile?.email || 'Consumable Import',
            updated_by: window.currentUserProfile?.username || window.currentUserProfile?.email || 'Consumable Import'
        }));
}

function renderConsumableImportPreview() {
    const container = document.getElementById('consumable-import-preview');
    if (!container) return;
    if (!pendingConsumableWorkbook) {
        container.innerHTML = '<div class="dashboard-empty-state">Load the consumable inventory workbook to preview tracker imports here.</div>';
        setConsumableText('consumable-import-file-name', '');
        setConsumableText('consumable-import-row-count', '0');
        return;
    }
    setConsumableText('consumable-import-file-name', pendingConsumableWorkbook.fileName);
    setConsumableText('consumable-import-row-count', String(pendingConsumableWorkbook.entries.length));
    container.innerHTML = pendingConsumableWorkbook.summaries.map(summary => {
        const count = pendingConsumableWorkbook.entries.filter(entry => entry.tracker_key === summary.tracker_key).length;
        return `<div class="historical-jobs-import-card"><span>${escapeConsumableHtml(summary.tracker_name)}</span><strong>${escapeConsumableHtml(String(count))} rows ready</strong></div>`;
    }).join('');
}

async function commitConsumableWorkbookImport() {
    if (!pendingConsumableWorkbook) {
        if (typeof showToast === 'function') showToast('Load the consumable workbook before importing.', 'error');
        return;
    }
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Importing consumable workbook...');
        const trackerKeys = pendingConsumableWorkbook.summaries.map(item => item.tracker_key);
        if (trackerKeys.length) {
            await window.supabaseClient.from('consumable_tracker_entries').delete().in('tracker_key', trackerKeys);
            await window.supabaseClient.from('consumable_tracker_summaries').delete().in('tracker_key', trackerKeys);
        }
        const summaryInsert = await window.supabaseClient.from('consumable_tracker_summaries').insert(pendingConsumableWorkbook.summaries);
        if (summaryInsert.error) throw summaryInsert.error;
        const entryInsert = await window.supabaseClient.from('consumable_tracker_entries').insert(pendingConsumableWorkbook.entries);
        if (entryInsert.error) throw entryInsert.error;
        pendingConsumableWorkbook = null;
        renderConsumableImportPreview();
        await loadConsumableInventoryView();
        if (typeof showToast === 'function') showToast('Consumable inventory workbook imported successfully.', 'success');
    } catch (error) {
        console.error('Consumable workbook import error:', error);
        if (typeof showToast === 'function') showToast('Failed to import consumable workbook: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function clearConsumableImportPreview() {
    pendingConsumableWorkbook = null;
    renderConsumableImportPreview();
}

async function saveConsumableTrackerEntry() {
    const definition = getActiveConsumableTrackerDefinition();
    const recordId = document.getElementById('consumable-tracker-entry-id')?.value || '';
    const existingEntry = recordId ? consumableTrackerEntries.find(item => String(item.id) === String(recordId)) : null;
    const payload = buildConsumableEntryPayload(definition, existingEntry);
    if (!payload.customer_name && !payload.reason) {
        if (typeof showToast === 'function') showToast('Customer Name or Reason is required.', 'error');
        return;
    }
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving consumable tracker row...');
        if (recordId) delete payload.created_by;
        const request = recordId
            ? window.supabaseClient.from('consumable_tracker_entries').update(payload).eq('id', recordId)
            : window.supabaseClient.from('consumable_tracker_entries').insert([payload]);
        const { error } = await request;
        if (error) throw error;
        resetConsumableTrackerForm();
        await loadConsumableInventoryView();
        if (typeof showToast === 'function') showToast(recordId ? 'Consumable row updated.' : 'Consumable row created.', 'success');
    } catch (error) {
        console.error('Consumable tracker save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save consumable row: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function saveConsumableTrackerSummary() {
    const definition = getActiveConsumableTrackerDefinition();
    const existing = getConsumableSummary(definition.key);
    const currentProfile = window.currentUserProfile || {};
    const payload = {
        tracker_key: definition.key,
        tracker_name: definition.label,
        tracker_mode: definition.mode,
        updated_by: currentProfile?.username || currentProfile?.email || 'Consumable Tracker'
    };
    if (!existing) {
        payload.created_by = currentProfile?.username || currentProfile?.email || 'Consumable Tracker';
    }
    definition.summaryRows.forEach(item => {
        const field = document.getElementById(`consumable-summary-${item.field}`);
        payload[item.field] = isConsumableSummaryDateField(item.field)
            ? normalizeConsumableDateForStorage(field?.value)
            : normalizeConsumableNumber(field?.value);
    });

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving consumable summary...');
        const request = existing?.id
            ? window.supabaseClient.from('consumable_tracker_summaries').update(payload).eq('id', existing.id)
            : window.supabaseClient.from('consumable_tracker_summaries').insert([payload]);
        const { error } = await request;
        if (error) throw error;
        await loadConsumableInventoryView();
        if (typeof showToast === 'function') showToast('Consumable summary saved.', 'success');
    } catch (error) {
        console.error('Consumable summary save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save consumable summary: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function buildConsumableEntryPayload(definition, existingEntry = null) {
    const currentProfile = window.currentUserProfile || {};
    const payload = {
        tracker_key: definition.key,
        tracker_name: definition.label,
        tracker_mode: definition.mode,
        source_sheet_name: definition.sheetName,
        created_by: currentProfile?.username || currentProfile?.email || 'Consumable Tracker',
        updated_by: currentProfile?.username || currentProfile?.email || 'Consumable Tracker'
    };
    definition.columns.forEach(column => {
        const field = document.getElementById(`consumable-form-${column.key}`);
        payload[column.key] = normalizeConsumableFormValue(field?.value, column.type);
    });
    if (!payload.tracker_index && existingEntry?.tracker_index) {
        payload.tracker_index = existingEntry.tracker_index;
    }
    if (!payload.tracker_index) {
        const currentRows = getConsumableEntriesForActiveTracker();
        payload.tracker_index = (currentRows.length ? Math.max(...currentRows.map(item => Number(item.tracker_index || 0))) : 0) + 1;
    }
    return payload;
}

function loadConsumableEntryIntoForm(id) {
    const entry = consumableTrackerEntries.find(item => String(item.id) === String(id));
    if (!entry) return;
    activeConsumableTrackerKey = entry.tracker_key;
    consumableTrackerInlineEditId = '';
    renderConsumableTrackerWorkspace();
    document.getElementById('consumable-tracker-entry-id').value = entry.id;
    const definition = getActiveConsumableTrackerDefinition();
    definition.columns.forEach(column => {
        const field = document.getElementById(`consumable-form-${column.key}`);
        if (!field) return;
        field.value = column.type === 'date' ? normalizeConsumableDateForInput(entry[column.key]) : String(entry[column.key] ?? '');
    });
}

function resetConsumableTrackerForm() {
    const entryId = document.getElementById('consumable-tracker-entry-id');
    if (entryId) entryId.value = '';
    const definition = getActiveConsumableTrackerDefinition();
    definition.columns.forEach(column => {
        const field = document.getElementById(`consumable-form-${column.key}`);
        if (field) field.value = '';
    });
}

function startConsumableInlineEdit(id) {
    consumableTrackerInlineEditId = id;
    renderConsumableTrackerWorkspace();
}

function cancelConsumableInlineEdit() {
    consumableTrackerInlineEditId = '';
    renderConsumableTrackerWorkspace();
}

async function saveInlineConsumableEntry(id) {
    const entry = consumableTrackerEntries.find(item => String(item.id) === String(id));
    if (!entry) {
        if (typeof showToast === 'function') showToast('Consumable tracker row was not found.', 'error');
        return;
    }

    const definition = CONSUMABLE_TRACKER_DEFINITIONS.find(item => item.key === entry.tracker_key) || getActiveConsumableTrackerDefinition();
    const currentProfile = window.currentUserProfile || {};
    const payload = {
        tracker_key: definition.key,
        tracker_name: definition.label,
        tracker_mode: definition.mode,
        source_sheet_name: definition.sheetName,
        updated_by: currentProfile?.username || currentProfile?.email || 'Consumable Tracker'
    };

    definition.columns.forEach(column => {
        const field = document.querySelector(`[data-consumable-inline-id="${escapeConsumableSelectorValue(id)}"][data-consumable-key="${escapeConsumableSelectorValue(column.key)}"]`);
        payload[column.key] = normalizeConsumableFormValue(field?.value, column.type);
    });
    if (!payload.tracker_index) payload.tracker_index = entry.tracker_index;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving consumable row...');
        const { error } = await window.supabaseClient.from('consumable_tracker_entries').update(payload).eq('id', id);
        if (error) throw error;
        consumableTrackerInlineEditId = '';
        await loadConsumableInventoryView();
        if (typeof showToast === 'function') showToast('Consumable row updated.', 'success');
    } catch (error) {
        console.error('Consumable inline save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save consumable row: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function deleteConsumableEntry(id) {
    if (!window.confirm('Delete this consumable tracker row?')) return;
    try {
        const { error } = await window.supabaseClient.from('consumable_tracker_entries').delete().eq('id', id);
        if (error) throw error;
        if (String(consumableTrackerInlineEditId) === String(id)) consumableTrackerInlineEditId = '';
        await loadConsumableInventoryView();
        if (typeof showToast === 'function') showToast('Consumable row deleted.', 'success');
    } catch (error) {
        console.error('Consumable delete error:', error);
        if (typeof showToast === 'function') showToast('Failed to delete consumable row: ' + error.message, 'error');
    }
}

function exportConsumableWorkbook() {
    const workbook = XLSX.utils.book_new();
    CONSUMABLE_TRACKER_DEFINITIONS.forEach(definition => {
        const summary = getConsumableSummary(definition.key) || {};
        const entries = consumableTrackerEntries
            .filter(entry => entry.tracker_key === definition.key)
            .sort((left, right) => Number(left.tracker_index || 0) - Number(right.tracker_index || 0));
        const rows = buildConsumableExportRows(definition, summary, entries);
        const worksheet = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(workbook, worksheet, definition.sheetName.slice(0, 31));
    });
    XLSX.writeFile(workbook, 'fairbridge-consumable-inventory-export.xlsx');
}

function buildConsumableExportRows(definition, summary, entries) {
    if (definition.mode === 'disposal') {
        return [
            ['', '', '', '', '', ''],
            ['', 'Date of last battery disposed : ', formatConsumableExportDate(summary.last_disposal_date), '', '', ''],
            ['', 'Total Quantity Disposed', summary.total_quantity_disposed ?? '', '', '', ''],
            [],
            [],
            definition.columns.map(column => column.label),
            ...entries.map(entry => definition.columns.map(column => formatConsumableExportValue(entry[column.key], column.type)))
        ];
    }
    return [
        ['', '', '', '', '', '', '', '', ''],
        ['', `${definition.label} count date :`, formatConsumableExportDate(summary.last_count_date), 'Date of last movement :', formatConsumableExportDate(summary.last_movement_date), 'Total Stock Used This Year', '', '', ''],
        ['', 'Quantity in Stock :', summary.quantity_in_stock ?? '', 'Quantity left in stock :', summary.quantity_left_in_stock ?? '', '', 'Sales Department', '', ''],
        ['', '', '', 'Total used :', summary.total_used_sales ?? '', summary.total_used_technical ?? '', 'Technical Department', '', ''],
        [],
        definition.columns.map(column => column.label),
        ...entries.map(entry => definition.columns.map(column => formatConsumableExportValue(entry[column.key], column.type)))
    ];
}

function normalizeConsumableDateForStorage(value) {
    const parsed = parseConsumableDate(value);
    return parsed ? toConsumableDateKey(parsed) : null;
}

function normalizeConsumableDateForInput(value) {
    const parsed = parseConsumableDate(value);
    return parsed ? toConsumableDateKey(parsed) : '';
}

function normalizeConsumableFormValue(value, type) {
    if (type === 'date') return normalizeConsumableDateForStorage(value);
    if (type === 'number') return normalizeConsumableNumber(value);
    return normalizeConsumableString(value);
}

function normalizeConsumableString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
}

function normalizeConsumableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatConsumableCell(value, type) {
    if (value === null || value === undefined || value === '') return '';
    if (type === 'date') return formatConsumableDate(value);
    if (type === 'number') return formatConsumableNumber(value);
    return String(value);
}

function formatConsumableNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    return String(Number.isFinite(Number(value)) ? Number(value) : value);
}

function formatConsumableDate(value) {
    if (!value) return '-';
    const parsed = parseConsumableDate(value);
    if (!parsed) return String(value);
    return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatConsumableExportDate(value) {
    if (!value) return '';
    const parsed = parseConsumableDate(value);
    if (!parsed) return String(value);
    return `${parsed.getFullYear()}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}`;
}

function parseConsumableDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return parseConsumableExcelSerialDate(value);
    }

    const text = String(value).trim();
    if (!text) return null;
    if (/^\d+(\.\d+)?$/.test(text)) {
        return parseConsumableExcelSerialDate(Number(text));
    }

    const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (isoMatch) {
        return buildConsumableDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    }

    const localMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (localMatch) {
        const year = normalizeConsumableYear(Number(localMatch[3]));
        return buildConsumableDate(year, Number(localMatch[2]), Number(localMatch[1]));
    }

    const namedMonthMatch = text.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/);
    if (namedMonthMatch) {
        const monthLookup = {
            jan: 1, january: 1,
            feb: 2, february: 2,
            mar: 3, march: 3,
            apr: 4, april: 4,
            may: 5,
            jun: 6, june: 6,
            jul: 7, july: 7,
            aug: 8, august: 8,
            sep: 9, sept: 9, september: 9,
            oct: 10, october: 10,
            nov: 11, november: 11,
            dec: 12, december: 12
        };
        const monthNumber = monthLookup[namedMonthMatch[2].toLowerCase()];
        if (monthNumber) {
            const year = normalizeConsumableYear(Number(namedMonthMatch[3]));
            return buildConsumableDate(year, monthNumber, Number(namedMonthMatch[1]));
        }
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function parseConsumableExcelSerialDate(value) {
    if (!Number.isFinite(value) || value <= 0) return null;
    const xlsxDate = window.XLSX?.SSF?.parse_date_code?.(value);
    if (xlsxDate?.y && xlsxDate?.m && xlsxDate?.d) {
        return buildConsumableDate(xlsxDate.y, xlsxDate.m, xlsxDate.d);
    }
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + Math.floor(value) * 86400000);
    return new Date(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function buildConsumableDate(year, month, day) {
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
    return parsed;
}

function normalizeConsumableYear(year) {
    if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
    return year;
}

function toConsumableDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatConsumableExportValue(value, type) {
    if (value === null || value === undefined) return '';
    if (type === 'date') return formatConsumableExportDate(value);
    return value;
}

function isConsumableSummaryDateField(field) {
    return field.includes('date');
}

function setConsumableText(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        node.value = value;
        return;
    }
    node.textContent = value;
}

function escapeConsumableHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeConsumableSelectorValue(value) {
    if (window.CSS?.escape) return window.CSS.escape(String(value ?? ''));
    return String(value ?? '').replace(/["\\]/g, '\\$&');
}

window.loadConsumableInventoryView = loadConsumableInventoryView;
window.loadReportsView = loadConsumableInventoryView;
window.handleConsumableWorkbookImport = handleConsumableWorkbookImport;
window.commitConsumableWorkbookImport = commitConsumableWorkbookImport;
window.clearConsumableImportPreview = clearConsumableImportPreview;
window.setActiveConsumableTracker = setActiveConsumableTracker;
window.saveConsumableTrackerEntry = saveConsumableTrackerEntry;
window.saveConsumableTrackerSummary = saveConsumableTrackerSummary;
window.resetConsumableTrackerForm = resetConsumableTrackerForm;
window.loadConsumableEntryIntoForm = loadConsumableEntryIntoForm;
window.startConsumableInlineEdit = startConsumableInlineEdit;
window.cancelConsumableInlineEdit = cancelConsumableInlineEdit;
window.saveInlineConsumableEntry = saveInlineConsumableEntry;
window.deleteConsumableEntry = deleteConsumableEntry;
window.exportConsumableWorkbook = exportConsumableWorkbook;
