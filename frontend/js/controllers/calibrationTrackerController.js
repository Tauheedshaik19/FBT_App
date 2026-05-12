let calibrationTrackerEntries = [];
let calibrationTrackerFiltersBound = false;
let activeCalibrationTrackerId = '';
let calibrationTrackerInlineEditId = '';
let pendingCalibrationImportRows = [];
let calibrationTrackerDenseMode = true;

const CALIBRATION_TRACKER_COLUMNS = [
    { key: 'tracker_index', label: 'Index', shortLabel: 'Idx', type: 'number' },
    { key: 'customer_name', label: 'Customer Name', shortLabel: 'Customer', type: 'text' },
    { key: 'logger_description', label: 'Logger Description', shortLabel: 'Logger', type: 'text' },
    { key: 'calibration_type', label: 'Calibration Type', shortLabel: 'Cal Type', type: 'text' },
    { key: 'item_condition', label: 'New/Used', shortLabel: 'Condition', type: 'text' },
    { key: 'quantity', label: 'Quantity', shortLabel: 'Qty', type: 'number' },
    { key: 'date_received', label: 'Date Received (YYYY/MM/DD)', shortLabel: 'Received', type: 'date' },
    { key: 'received_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'date_given_to_technical', label: 'Date given to technical', shortLabel: 'To Tech', type: 'date' },
    { key: 'given_to_technical_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'date_technical_handed_back', label: 'Date Technical handed back', shortLabel: 'Tech Back', type: 'date' },
    { key: 'technical_handed_back_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'date_booked_into_lab', label: 'Date Booked into lab (YYYY/MM/DD)', shortLabel: 'In Lab', type: 'date' },
    { key: 'booked_into_lab_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'estimated_completion_date', label: 'Estimated completion date', shortLabel: 'ETA', type: 'date' },
    { key: 'days_overdue', label: 'Days overdue', shortLabel: 'Late', type: 'number' },
    { key: 'reason_for_delay', label: 'Reason for Delay', shortLabel: 'Delay Reason', type: 'text' },
    { key: 'date_calibration_completed', label: 'Date Calibration was completed (YYYY/MM/DD)', shortLabel: 'Cal Done', type: 'date' },
    { key: 'calibration_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'date_returned_to_sales_with_certificates', label: 'Date Completed & devices handed back to Sales with Certificates (YYYY/MM/DD)', shortLabel: 'Back To Sales', type: 'date' },
    { key: 'sales_certificates_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'calibration_reminder', label: 'Calibration Reminder', shortLabel: 'Reminder', type: 'text' },
    { key: 'calibration_notes', label: 'Calibration Notes', shortLabel: 'Notes', type: 'textarea' },
    { key: 'date_dispatched_to_customer', label: 'Date dispatched to customer', shortLabel: 'Dispatch', type: 'date' },
    { key: 'dispatched_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' },
    { key: 'date_handed_to_technical_for_install', label: 'Date handed to Technical For Install', shortLabel: 'To Install', type: 'date' },
    { key: 'install_handover_completed_by', label: 'Completed By', shortLabel: 'By', type: 'text' }
];

const CALIBRATION_FORM_SECTIONS = [
    {
        title: 'Core Row Data',
        fields: ['customer_name', 'logger_description', 'calibration_type', 'item_condition', 'quantity']
    },
    {
        title: 'Sales Intake',
        fields: ['date_received', 'received_completed_by']
    },
    {
        title: 'Technical Handover',
        fields: ['date_given_to_technical', 'given_to_technical_completed_by', 'date_technical_handed_back', 'technical_handed_back_completed_by']
    },
    {
        title: 'Lab Stage',
        fields: ['date_booked_into_lab', 'booked_into_lab_completed_by', 'estimated_completion_date', 'days_overdue', 'reason_for_delay']
    },
    {
        title: 'Calibration Completion',
        fields: ['date_calibration_completed', 'calibration_completed_by', 'date_returned_to_sales_with_certificates', 'sales_certificates_completed_by']
    },
    {
        title: 'Dispatch And Install',
        fields: ['calibration_reminder', 'calibration_notes', 'date_dispatched_to_customer', 'dispatched_completed_by', 'date_handed_to_technical_for_install', 'install_handover_completed_by']
    }
];

const CALIBRATION_HEADER_ROWS = [
    ['', 'Sales Department', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Calibration Laboratory', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', 'Technical Department', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    []
];

async function loadCalibrationTrackerView() {
    try {
        calibrationTrackerDenseMode = loadCalibrationTrackerDenseMode();
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading calibration tracker...');
        const { data, error } = await window.supabaseClient
            .from('calibration_tracker_entries')
            .select('*')
            .order('tracker_index', { ascending: true, nullsFirst: false });
        if (error) throw error;

        calibrationTrackerEntries = (data || []).sort((left, right) => {
            const leftIndex = Number(left.tracker_index || 0);
            const rightIndex = Number(right.tracker_index || 0);
            if (leftIndex && rightIndex) return leftIndex - rightIndex;
            return new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0);
        });
        bindCalibrationTrackerFilters();
        renderCalibrationTrackerForm();
        renderCalibrationTrackerWorkspace();
    } catch (error) {
        console.error('Calibration tracker load error:', error);
        const banner = document.getElementById('calibration-tracker-status-banner');
        if (banner) {
            banner.style.display = 'block';
            banner.textContent = `Calibration tracker is unavailable until the latest schema is applied: ${error.message}`;
        }
        if (typeof showToast === 'function') showToast('Failed to load calibration tracker: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function bindCalibrationTrackerFilters() {
    if (calibrationTrackerFiltersBound) return;
    ['calibration-tracker-search', 'calibration-tracker-stage-filter'].forEach(id => {
        const field = document.getElementById(id);
        if (!field) return;
        field.addEventListener('input', renderCalibrationTrackerWorkspace);
        field.addEventListener('change', renderCalibrationTrackerWorkspace);
    });
    calibrationTrackerFiltersBound = true;
}

function renderCalibrationTrackerForm() {
    const shell = document.getElementById('calibration-tracker-form-shell');
    if (!shell) return;
    shell.innerHTML = CALIBRATION_FORM_SECTIONS.map(section => `
        <div class="calibration-form-section">
            <div class="calibration-form-section-header">
                <h4>${escapeCalibrationTrackerHtml(section.title)}</h4>
            </div>
            <div class="form-row">
                ${section.fields.map(key => renderCalibrationFormField(key)).join('')}
            </div>
        </div>
    `).join('');
}

function renderCalibrationFormField(key) {
    const column = getCalibrationColumn(key);
    if (!column) return '';
    const inputId = `calibration-form-${column.key}`;
    if (column.type === 'textarea') {
        return `
            <div class="form-group calibration-form-group calibration-form-group-wide">
                <label>${escapeCalibrationTrackerHtml(column.label)}</label>
                <textarea id="${escapeCalibrationTrackerHtml(inputId)}" rows="3" class="form-control"></textarea>
            </div>
        `;
    }
    return `
        <div class="form-group calibration-form-group">
            <label>${escapeCalibrationTrackerHtml(column.label)}</label>
            <input
                type="${column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}"
                id="${escapeCalibrationTrackerHtml(inputId)}"
                class="form-control"
                ${column.type === 'number' ? 'step="1" min="0"' : ''}
            >
        </div>
    `;
}

function renderCalibrationTrackerWorkspace() {
    const filtered = getFilteredCalibrationTrackerEntries();
    renderCalibrationTrackerDensityState();
    renderCalibrationTrackerStats();
    renderCalibrationTrackerTable(filtered);
}

function getFilteredCalibrationTrackerEntries() {
    const search = String(document.getElementById('calibration-tracker-search')?.value || '').trim().toLowerCase();
    const stageFilter = String(document.getElementById('calibration-tracker-stage-filter')?.value || '').trim().toLowerCase();

    return calibrationTrackerEntries.filter(entry => {
        const stage = getCalibrationTrackerWorkflowStage(entry);
        const overdue = isCalibrationTrackerOverdue(entry);
        const matchesSearch = !search || CALIBRATION_TRACKER_COLUMNS.some(column => String(entry[column.key] || '').toLowerCase().includes(search));
        const matchesStage = !stageFilter
            || (stageFilter === 'overdue' && overdue)
            || (stageFilter === 'open' && stage !== 'completed')
            || stage === stageFilter;
        return matchesSearch && matchesStage;
    });
}

function renderCalibrationTrackerStats() {
    const inTechnical = calibrationTrackerEntries.filter(entry => getCalibrationTrackerWorkflowStage(entry) === 'in_technical').length;
    const inLab = calibrationTrackerEntries.filter(entry => getCalibrationTrackerWorkflowStage(entry) === 'in_lab').length;
    const overdue = calibrationTrackerEntries.filter(isCalibrationTrackerOverdue).length;
    const completed = calibrationTrackerEntries.filter(entry => getCalibrationTrackerWorkflowStage(entry) === 'completed').length;

    setCalibrationTrackerText('calibration-tracker-count', calibrationTrackerEntries.length);
    setCalibrationTrackerText('calibration-tracker-technical', inTechnical);
    setCalibrationTrackerText('calibration-tracker-lab', inLab);
    setCalibrationTrackerText('calibration-tracker-overdue', overdue);
    setCalibrationTrackerText('calibration-tracker-completed', completed);
}

function renderCalibrationTrackerTable(entries) {
    const thead = document.getElementById('calibration-tracker-table-head');
    const tbody = document.getElementById('calibration-tracker-table-body');
    const grid = document.querySelector('#view-certification .calibration-tracker-grid');
    if (!thead || !tbody) return;
    if (grid) grid.classList.toggle('calibration-tracker-grid-dense', calibrationTrackerDenseMode);

    thead.innerHTML = `
        <tr class="calibration-tracker-group-row">
            <th colspan="6">Core Row</th>
            <th colspan="2">Sales Intake</th>
            <th colspan="4">Technical Handover</th>
            <th colspan="5">Calibration Lab</th>
            <th colspan="4">Completion To Sales</th>
            <th colspan="6">Dispatch And Install</th>
            <th class="calibration-tracker-actions-head">Actions</th>
        </tr>
        <tr>
            ${CALIBRATION_TRACKER_COLUMNS.map(column => `<th title="${escapeCalibrationTrackerHtml(column.label)}">${escapeCalibrationTrackerHtml(getCalibrationColumnHeaderLabel(column))}</th>`).join('')}
            <th class="calibration-tracker-actions-head">Actions</th>
        </tr>
    `;

    if (!entries.length) {
        tbody.innerHTML = `<tr><td colspan="${CALIBRATION_TRACKER_COLUMNS.length + 1}" style="text-align:center; color: var(--text-secondary);">No calibration tracker rows match the current filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = entries.map(entry => {
        const isSelected = String(entry.id) === String(activeCalibrationTrackerId);
        const isEditing = String(entry.id) === String(calibrationTrackerInlineEditId);
        const rowClass = [isSelected ? 'sales-client-row-active' : '', isEditing ? 'calibration-inline-edit-row' : ''].filter(Boolean).join(' ');
        return `
            <tr class="${rowClass}">
                ${CALIBRATION_TRACKER_COLUMNS.map(column => `
                    <td class="calibration-tracker-cell calibration-tracker-cell-${escapeCalibrationTrackerHtml(column.key)}">
                        ${isEditing
                            ? renderCalibrationInlineInput(entry, column)
                            : `<span>${escapeCalibrationTrackerHtml(formatCalibrationTrackerCellValue(entry[column.key], column.type))}</span>`}
                    </td>
                `).join('')}
                <td class="calibration-tracker-actions-cell">
                    <div class="sales-table-actions calibration-inline-actions">
                        ${isEditing
                            ? `
                                <button type="button" class="btn btn-small btn-primary" onclick="event.stopPropagation(); saveInlineCalibrationTrackerEntry('${escapeCalibrationTrackerHtml(entry.id)}')">Save</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); cancelCalibrationTrackerInlineEdit()">Cancel</button>
                            `
                            : `
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); startCalibrationTrackerInlineEdit('${escapeCalibrationTrackerHtml(entry.id)}')">Quick Edit</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); loadCalibrationTrackerEntryIntoForm('${escapeCalibrationTrackerHtml(entry.id)}')">Form Edit</button>
                                <button type="button" class="btn btn-small" onclick="event.stopPropagation(); deleteCalibrationTrackerEntry('${escapeCalibrationTrackerHtml(entry.id)}')">Delete</button>
                            `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderCalibrationInlineInput(entry, column) {
    const value = column.type === 'date'
        ? normalizeCalibrationDateForInput(entry[column.key])
        : column.type === 'number'
            ? String(entry[column.key] ?? '')
            : escapeCalibrationTrackerHtml(String(entry[column.key] ?? ''));
    const commonAttrs = `
        data-calibration-inline-id="${escapeCalibrationTrackerHtml(entry.id)}"
        data-calibration-key="${escapeCalibrationTrackerHtml(column.key)}"
        class="form-control calibration-inline-input"
        onclick="event.stopPropagation()"
    `;
    if (column.type === 'textarea') {
        return `<textarea ${commonAttrs} rows="2">${value}</textarea>`;
    }
    return `<input type="${column.type === 'date' ? 'date' : column.type === 'number' ? 'number' : 'text'}" value="${value}" ${commonAttrs} ${column.type === 'number' ? 'step="1" min="0"' : ''}>`;
}

async function saveCalibrationTrackerEntry(event) {
    event.preventDefault();
    const recordId = document.getElementById('calibration-tracker-entry-id')?.value || '';
    const payload = readCalibrationTrackerForm();
    if (!payload.customer_name && !payload.logger_description) {
        if (typeof showToast === 'function') showToast('Customer Name or Logger Description is required.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving calibration tracker row...');
        if (recordId) delete payload.created_by;
        const request = recordId
            ? window.supabaseClient.from('calibration_tracker_entries').update(payload).eq('id', recordId)
            : window.supabaseClient.from('calibration_tracker_entries').insert([payload]);
        const { error } = await request;
        if (error) throw error;

        resetCalibrationTrackerForm();
        await loadCalibrationTrackerView();
        if (typeof showToast === 'function') showToast(recordId ? 'Calibration tracker row updated.' : 'Calibration tracker row created.', 'success');
    } catch (error) {
        console.error('Calibration tracker save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save calibration tracker row: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function readCalibrationTrackerForm() {
    const payload = {};
    CALIBRATION_TRACKER_COLUMNS.forEach(column => {
        const field = document.getElementById(`calibration-form-${column.key}`);
        payload[column.key] = normalizeCalibrationFieldValue(field?.value, column.type);
    });

    const currentProfile = window.currentUserProfile || {};
    payload.customer_name = payload.customer_name || null;
    payload.logger_description = payload.logger_description || null;
    payload.calibration_type = payload.calibration_type || null;
    payload.quantity = payload.quantity ?? 0;
    payload.calibration_notes = payload.calibration_notes || null;
    payload.updated_by = currentProfile?.username || currentProfile?.email || 'Calibration Tracker';
    payload.created_by = currentProfile?.username || currentProfile?.email || 'Calibration Tracker';
    payload.source_file_name = payload.source_file_name || null;
    payload.calibration_status = deriveLegacyCalibrationStatus(payload);
    payload.asset_name = payload.logger_description || payload.customer_name || 'Calibration Row';
    payload.client_name = payload.customer_name || null;
    payload.notes = payload.calibration_notes || null;
    payload.due_date = payload.estimated_completion_date || null;
    payload.raw_row_text = CALIBRATION_TRACKER_COLUMNS.map(column => payload[column.key] ?? '').join(' | ');
    return payload;
}

function loadCalibrationTrackerEntryIntoForm(id) {
    const entry = calibrationTrackerEntries.find(item => String(item.id) === String(id));
    if (!entry) {
        if (typeof showToast === 'function') showToast('Calibration tracker row was not found.', 'error');
        return;
    }

    document.getElementById('calibration-tracker-entry-id').value = entry.id;
    CALIBRATION_TRACKER_COLUMNS.forEach(column => {
        const field = document.getElementById(`calibration-form-${column.key}`);
        if (!field) return;
        field.value = column.type === 'date'
            ? normalizeCalibrationDateForInput(entry[column.key])
            : String(entry[column.key] ?? '');
    });

    const saveBtn = document.getElementById('calibration-tracker-save-btn');
    if (saveBtn) saveBtn.textContent = 'Update Tracker Row';
    activeCalibrationTrackerId = entry.id;
    renderCalibrationTrackerWorkspace();
    document.getElementById('calibrationTrackerForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCalibrationTrackerForm() {
    document.getElementById('calibration-tracker-entry-id').value = '';
    CALIBRATION_TRACKER_COLUMNS.forEach(column => {
        const field = document.getElementById(`calibration-form-${column.key}`);
        if (field) field.value = '';
    });
    const saveBtn = document.getElementById('calibration-tracker-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save Tracker Row';
}

function selectCalibrationTrackerEntry(id) {
    activeCalibrationTrackerId = id;
    renderCalibrationTrackerWorkspace();
}

function startCalibrationTrackerInlineEdit(id) {
    calibrationTrackerInlineEditId = id;
    activeCalibrationTrackerId = id;
    renderCalibrationTrackerWorkspace();
}

function cancelCalibrationTrackerInlineEdit() {
    calibrationTrackerInlineEditId = '';
    renderCalibrationTrackerWorkspace();
}

async function saveInlineCalibrationTrackerEntry(id) {
    const entry = calibrationTrackerEntries.find(item => String(item.id) === String(id));
    if (!entry) {
        if (typeof showToast === 'function') showToast('Calibration tracker row was not found.', 'error');
        return;
    }

    const payload = {};
    CALIBRATION_TRACKER_COLUMNS.forEach(column => {
        const field = document.querySelector(`[data-calibration-inline-id="${escapeCalibrationSelectorValue(id)}"][data-calibration-key="${escapeCalibrationSelectorValue(column.key)}"]`);
        payload[column.key] = normalizeCalibrationFieldValue(field?.value, column.type);
    });
    const currentProfile = window.currentUserProfile || {};
    payload.updated_by = currentProfile?.username || currentProfile?.email || 'Calibration Tracker';
    payload.calibration_status = deriveLegacyCalibrationStatus(payload);
    payload.asset_name = payload.logger_description || payload.customer_name || 'Calibration Row';
    payload.client_name = payload.customer_name || null;
    payload.notes = payload.calibration_notes || null;
    payload.due_date = payload.estimated_completion_date || null;
    payload.raw_row_text = CALIBRATION_TRACKER_COLUMNS.map(column => payload[column.key] ?? '').join(' | ');

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving tracker row...');
        const { error } = await window.supabaseClient.from('calibration_tracker_entries').update(payload).eq('id', id);
        if (error) throw error;
        calibrationTrackerInlineEditId = '';
        await loadCalibrationTrackerView();
        if (typeof showToast === 'function') showToast('Calibration tracker row updated.', 'success');
    } catch (error) {
        console.error('Calibration inline save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save tracker row: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function deleteCalibrationTrackerEntry(id) {
    if (!window.confirm('Delete this calibration tracker row?')) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting calibration tracker row...');
        const { error } = await window.supabaseClient.from('calibration_tracker_entries').delete().eq('id', id);
        if (error) throw error;
        if (String(activeCalibrationTrackerId) === String(id)) activeCalibrationTrackerId = '';
        if (String(calibrationTrackerInlineEditId) === String(id)) calibrationTrackerInlineEditId = '';
        await loadCalibrationTrackerView();
        if (typeof showToast === 'function') showToast('Calibration tracker row deleted.', 'success');
    } catch (error) {
        console.error('Calibration tracker delete error:', error);
        if (typeof showToast === 'function') showToast('Failed to delete calibration tracker row: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function handleCalibrationTrackerImportFile(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Reading calibration tracker file...');
        const rows = await parseCalibrationTrackerWorkbook(file);
        pendingCalibrationImportRows = rows;
        renderCalibrationImportPreview(file.name, rows);
        if (typeof showToast === 'function') showToast(`Loaded ${rows.length} calibration tracker rows for preview.`, 'success');
    } catch (error) {
        console.error('Calibration tracker import parse error:', error);
        pendingCalibrationImportRows = [];
        renderCalibrationImportPreview('', []);
        if (typeof showToast === 'function') showToast('Failed to read tracker file: ' + error.message, 'error');
    } finally {
        event.target.value = '';
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function parseCalibrationTrackerWorkbook(file) {
    const extension = String(file.name || '').toLowerCase();
    if (!(extension.endsWith('.csv') || extension.endsWith('.xlsx') || extension.endsWith('.xls'))) {
        throw new Error('Use the CSV or Excel calibration tracker file so the workflow columns match exactly.');
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
    return extractCalibrationImportRowsFromMatrix(matrix, file.name);
}

function extractCalibrationImportRowsFromMatrix(matrix, fileName) {
    const headerIndex = matrix.findIndex(row => String(row?.[0] || '').trim() === 'Index' && String(row?.[1] || '').trim() === 'Customer Name');
    if (headerIndex < 0) {
        throw new Error('The tracker header row was not found. The file must contain the original Fairbridge calibration tracker columns.');
    }

    const rows = matrix
        .slice(headerIndex + 1)
        .filter(row => Array.isArray(row) && isCalibrationImportRowPopulated(row));
    return rows.map((row, index) => mapCalibrationImportRow(row, fileName, index + 1));
}

function isCalibrationImportRowPopulated(row) {
    if (!Array.isArray(row)) return false;

    const hasAnyContent = row.some(cell => String(cell ?? '').trim());
    if (!hasAnyContent) return false;

    const nonIndexCells = row.slice(1);
    return nonIndexCells.some(cell => String(cell ?? '').trim());
}

function mapCalibrationImportRow(row, fileName, sourceRow) {
    const payload = {};
    CALIBRATION_TRACKER_COLUMNS.forEach((column, index) => {
        payload[column.key] = normalizeCalibrationFieldValue(row[index], column.type);
    });
    payload.asset_name = payload.logger_description || payload.customer_name || 'Calibration Row';
    payload.client_name = payload.customer_name || null;
    payload.notes = payload.calibration_notes || null;
    payload.due_date = payload.estimated_completion_date || null;
    payload.calibration_status = deriveLegacyCalibrationStatus(payload);
    payload.source_file_name = fileName;
    payload.source_row = sourceRow;
    payload.imported_batch_label = `${fileName} | ${new Date().toISOString()}`;
    payload.raw_row_text = row.map(value => String(value ?? '')).join(' | ');
    payload.created_by = window.currentUserProfile?.username || window.currentUserProfile?.email || 'Calibration Import';
    payload.updated_by = window.currentUserProfile?.username || window.currentUserProfile?.email || 'Calibration Import';
    return payload;
}

function renderCalibrationImportPreview(fileName, rows) {
    setCalibrationTrackerText('calibration-import-file-name', fileName || '');
    setCalibrationTrackerText('calibration-import-row-count', rows.length ? String(rows.length) : '0');
    const container = document.getElementById('calibration-import-preview');
    if (!container) return;

    if (!rows.length) {
        container.innerHTML = '<div class="dashboard-empty-state">Choose the Fairbridge calibration tracker CSV or Excel file to preview rows here.</div>';
        return;
    }

    const previewRows = rows.slice(0, 12);
    container.innerHTML = `
        <div class="calibration-tracker-table-shell calibration-import-preview-shell">
            <div class="jobs-tech-table-wrap calibration-import-preview-wrap">
                <table class="jobs-tech-table calibration-tracker-grid calibration-import-preview-grid">
                    <thead>
                        <tr>
                            ${CALIBRATION_TRACKER_COLUMNS.map(column => `<th title="${escapeCalibrationTrackerHtml(column.label)}">${escapeCalibrationTrackerHtml(getCalibrationColumnHeaderLabel(column))}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${previewRows.map(entry => `
                            <tr>
                                ${CALIBRATION_TRACKER_COLUMNS.map(column => `<td class="calibration-tracker-cell calibration-tracker-cell-${escapeCalibrationTrackerHtml(column.key)}">${escapeCalibrationTrackerHtml(formatCalibrationTrackerCellValue(entry[column.key], column.type))}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ${rows.length > previewRows.length ? `<p class="asset-update-helper-text">Showing ${previewRows.length} of ${rows.length} rows in the import preview.</p>` : ''}
    `;
}

async function commitCalibrationTrackerImport() {
    if (!pendingCalibrationImportRows.length) {
        if (typeof showToast === 'function') showToast('Load a tracker CSV or Excel file before importing.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Importing calibration tracker rows...');
        const { error } = await window.supabaseClient.from('calibration_tracker_entries').insert(pendingCalibrationImportRows);
        if (error) throw error;
        clearCalibrationImportPreview();
        await loadCalibrationTrackerView();
        if (typeof showToast === 'function') showToast('Calibration tracker rows imported successfully.', 'success');
    } catch (error) {
        console.error('Calibration tracker import commit error:', error);
        if (typeof showToast === 'function') showToast('Failed to import tracker rows: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function clearCalibrationImportPreview() {
    pendingCalibrationImportRows = [];
    renderCalibrationImportPreview('', []);
}

function exportCalibrationTrackerExcel() {
    const workbook = XLSX.utils.book_new();
    const sourceRows = calibrationTrackerEntries.length ? calibrationTrackerEntries : pendingCalibrationImportRows;
    const sortedRows = [...sourceRows].sort((left, right) => Number(left.tracker_index || 0) - Number(right.tracker_index || 0));
    const sheetRows = [
        ...CALIBRATION_HEADER_ROWS,
        CALIBRATION_TRACKER_COLUMNS.map(column => column.label),
        ...sortedRows.map(entry => CALIBRATION_TRACKER_COLUMNS.map(column => formatCalibrationExportCellValue(entry[column.key], column.type)))
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Calibration Tracker');
    XLSX.writeFile(workbook, 'fairbridge-calibration-tracker-export.xlsx');
}

function formatCalibrationExportCellValue(value, type) {
    if (value === null || value === undefined) return '';
    if (type === 'date') {
        const parsed = parseCalibrationTrackerDate(value);
        if (!parsed) return String(value);
        return `${parsed.getFullYear()}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${String(parsed.getDate()).padStart(2, '0')}`;
    }
    return value;
}

function getCalibrationColumnHeaderLabel(column) {
    return calibrationTrackerDenseMode ? (column.shortLabel || column.label) : column.label;
}

function toggleCalibrationTrackerDenseMode() {
    calibrationTrackerDenseMode = !calibrationTrackerDenseMode;
    try {
        window.localStorage?.setItem('calibrationTrackerDenseMode', calibrationTrackerDenseMode ? '1' : '0');
    } catch (error) {
        console.warn('Unable to persist calibration tracker density mode.', error);
    }
    renderCalibrationTrackerWorkspace();
    renderCalibrationImportPreview(
        String(document.getElementById('calibration-import-file-name')?.value || ''),
        pendingCalibrationImportRows
    );
}

function loadCalibrationTrackerDenseMode() {
    try {
        return window.localStorage?.getItem('calibrationTrackerDenseMode') !== '0';
    } catch (error) {
        return true;
    }
}

function renderCalibrationTrackerDensityState() {
    const button = document.getElementById('calibration-tracker-density-toggle');
    const shell = document.querySelector('#view-certification .calibration-tracker-table-shell');
    if (button) {
        button.textContent = calibrationTrackerDenseMode ? 'Standard Width' : 'Fit More Columns';
    }
    if (shell) {
        shell.classList.toggle('calibration-tracker-table-shell-dense', calibrationTrackerDenseMode);
    }
    document.querySelectorAll('.calibration-import-preview-grid').forEach(grid => {
        grid.classList.toggle('calibration-tracker-grid-dense', calibrationTrackerDenseMode);
    });
}

function getCalibrationTrackerWorkflowStage(entry) {
    if (entry.date_dispatched_to_customer) return 'completed';
    if (entry.date_returned_to_sales_with_certificates) return 'ready_dispatch';
    if (entry.date_calibration_completed) return 'ready_sales';
    if (entry.date_booked_into_lab) return 'in_lab';
    if (entry.date_given_to_technical && !entry.date_technical_handed_back) return 'in_technical';
    if (entry.date_technical_handed_back) return 'returned_from_technical';
    if (entry.date_received) return 'received';
    return 'new';
}

function humanizeCalibrationWorkflowStage(stage) {
    const labels = {
        new: 'New',
        received: 'Received',
        in_technical: 'In Technical',
        returned_from_technical: 'Back From Technical',
        in_lab: 'In Lab',
        ready_sales: 'Calibration Complete',
        ready_dispatch: 'Ready For Dispatch',
        completed: 'Dispatched'
    };
    return labels[stage] || 'Open';
}

function isCalibrationTrackerOverdue(entry) {
    const overdueDays = Number(entry.days_overdue || 0);
    if (overdueDays > 0) return true;
    const estimatedDate = parseCalibrationTrackerDate(entry.estimated_completion_date);
    if (!estimatedDate || entry.date_dispatched_to_customer) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    estimatedDate.setHours(0, 0, 0, 0);
    return estimatedDate.getTime() < today.getTime();
}

function deriveLegacyCalibrationStatus(entry) {
    if (entry.date_dispatched_to_customer) return 'completed';
    if (isCalibrationTrackerOverdue(entry)) return 'overdue';
    return 'active';
}

function normalizeCalibrationFieldValue(value, type) {
    if (type === 'date') return normalizeCalibrationDateForStorage(value);
    if (type === 'number') {
        const parsed = Number.parseInt(String(value ?? '').trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    const trimmed = String(value ?? '').trim();
    return trimmed || null;
}

function normalizeCalibrationDateForStorage(value) {
    const parsed = parseCalibrationTrackerDate(value);
    if (!parsed) return null;
    return parsed.toISOString().slice(0, 10);
}

function normalizeCalibrationDateForInput(value) {
    const parsed = parseCalibrationTrackerDate(value);
    return parsed ? parsed.toISOString().slice(0, 10) : '';
}

function parseCalibrationTrackerDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
    const text = String(value).trim();
    if (!text) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const parsed = new Date(`${text}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (/^\d{4}\/\d{2}\/\d{2}$/.test(text)) {
        const parsed = new Date(text.replace(/\//g, '-') + 'T00:00:00');
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const namedMonthMatch = text.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
    if (namedMonthMatch) {
        const [, dayText, monthText, yearText] = namedMonthMatch;
        const months = {
            january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
            july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
        };
        const monthIndex = months[String(monthText).toLowerCase()];
        if (monthIndex >= 0) {
            return new Date(Number(yearText), monthIndex, Number(dayText));
        }
    }

    const numericMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (numericMatch) {
        const [, dayText, monthText, yearText] = numericMatch;
        return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCalibrationTrackerCellValue(value, type) {
    if (!value && value !== 0) return '';
    if (type === 'date') {
        const parsed = parseCalibrationTrackerDate(value);
        if (!parsed) return String(value);
        return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(value);
}

function formatCalibrationTrackerDateTime(value) {
    if (!value) return 'Not recorded';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getCalibrationColumn(key) {
    return CALIBRATION_TRACKER_COLUMNS.find(column => column.key === key) || null;
}

function setCalibrationTrackerText(id, value) {
    const node = document.getElementById(id);
    if (!node) return;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
        node.value = value;
        return;
    }
    node.textContent = value;
}

function escapeCalibrationTrackerHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeCalibrationSelectorValue(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

window.loadCalibrationTrackerView = loadCalibrationTrackerView;
window.loadCalibrationCertificatesView = loadCalibrationTrackerView;
window.saveCalibrationTrackerEntry = saveCalibrationTrackerEntry;
window.resetCalibrationTrackerForm = resetCalibrationTrackerForm;
window.loadCalibrationTrackerEntryIntoForm = loadCalibrationTrackerEntryIntoForm;
window.selectCalibrationTrackerEntry = selectCalibrationTrackerEntry;
window.startCalibrationTrackerInlineEdit = startCalibrationTrackerInlineEdit;
window.cancelCalibrationTrackerInlineEdit = cancelCalibrationTrackerInlineEdit;
window.saveInlineCalibrationTrackerEntry = saveInlineCalibrationTrackerEntry;
window.deleteCalibrationTrackerEntry = deleteCalibrationTrackerEntry;
window.handleCalibrationTrackerImportFile = handleCalibrationTrackerImportFile;
window.commitCalibrationTrackerImport = commitCalibrationTrackerImport;
window.clearCalibrationImportPreview = clearCalibrationImportPreview;
window.exportCalibrationTrackerExcel = exportCalibrationTrackerExcel;
window.toggleCalibrationTrackerDenseMode = toggleCalibrationTrackerDenseMode;
