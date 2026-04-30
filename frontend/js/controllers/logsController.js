let appLogsCache = [];

function escapeLogsHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatAppLogDate(value) {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function formatAppLogRelativeTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const diffMs = Date.now() - date.getTime();
    const future = diffMs < 0;
    const diffMinutes = Math.round(Math.abs(diffMs) / 60000);

    if (diffMinutes < 1) return future ? 'In less than a minute' : 'Just now';
    if (diffMinutes < 60) return future ? `In ${diffMinutes} min` : `${diffMinutes} min ago`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return future ? `In ${diffHours} hr` : `${diffHours} hr ago`;

    const diffDays = Math.round(diffHours / 24);
    return future ? `In ${diffDays} day${diffDays === 1 ? '' : 's'}` : `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function humanizeLogToken(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getLogEventBadgeClass(eventType) {
    if (eventType === 'sign_in') return 'success';
    if (eventType === 'sign_out') return 'neutral';
    if (eventType === 'session_timeout') return 'warning';
    return 'info';
}

function truncateLogText(value, maxLength = 96) {
    const text = String(value || '').trim();
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function normalizeLogValue(value) {
    if (value == null || value === '') return '-';
    if (Array.isArray(value)) {
        if (!value.length) return '-';
        return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(', ');
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function normalizeLogScopeValue(value) {
    if (Array.isArray(value)) {
        if (!value.length) return 'no values';
        const cleaned = value
            .map(item => String(item ?? '').trim())
            .filter(Boolean)
            .filter(item => item !== '[depth-limited]');
        if (!cleaned.length) return `${value.length} values`;
        const joined = cleaned.slice(0, 8).join(', ');
        return cleaned.length < value.length ? `${joined} ...` : joined;
    }

    const text = String(value ?? '').trim();
    if (!text) return '-';
    if (text === '[depth-limited]') return 'multiple values';
    return text;
}

function formatLogValueForHtml(value, maxLength = 220) {
    const normalized = normalizeLogValue(value);
    const shortened = normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
    return escapeLogsHtml(shortened);
}

function getLogPayloadRecords(log) {
    const payload = log?.metadata?.payload;
    if (!payload) return [];
    if (Array.isArray(payload)) {
        return payload.filter(item => item && typeof item === 'object');
    }
    if (typeof payload === 'object') {
        return [payload];
    }
    return [];
}

function getPrimaryLogPayload(log) {
    const records = getLogPayloadRecords(log);
    return records[0] || null;
}

function getLogBeforeRecords(log) {
    const records = Array.isArray(log?.metadata?.before_records) ? log.metadata.before_records : [];
    return records.filter(item => item && typeof item === 'object');
}

function getLogAfterRecords(log) {
    const records = Array.isArray(log?.metadata?.after_records) ? log.metadata.after_records : [];
    return records.filter(item => item && typeof item === 'object');
}

function getLogFieldChanges(log) {
    const changes = Array.isArray(log?.metadata?.field_changes) ? log.metadata.field_changes : [];
    return changes.filter(item => item && typeof item === 'object');
}

function populateAppLogsModuleFilter(logs) {
    const select = document.getElementById('logs-module-filter');
    if (!select) return;

    const currentValue = select.value || 'all';
    const modules = Array.from(new Set((logs || []).map(log => String(log.module_name || '').trim()).filter(Boolean))).sort();
    select.innerHTML = ['<option value="all">All modules</option>']
        .concat(modules.map(moduleName => `<option value="${escapeLogsHtml(moduleName)}">${escapeLogsHtml(humanizeLogToken(moduleName))}</option>`))
        .join('');

    if (modules.includes(currentValue)) {
        select.value = currentValue;
    }
}

function getFilteredAppLogs() {
    const search = String(document.getElementById('logs-search-input')?.value || '').trim().toLowerCase();
    const eventType = document.getElementById('logs-event-filter')?.value || 'all';
    const moduleName = document.getElementById('logs-module-filter')?.value || 'all';

    return appLogsCache.filter(log => {
        if (eventType !== 'all' && String(log.event_type || '') !== eventType) return false;
        if (moduleName !== 'all' && String(log.module_name || '') !== moduleName) return false;

        if (!search) return true;

        const haystack = [
            log.username,
            log.user_email,
            log.user_role,
            log.module_name,
            log.entity_type,
            log.entity_label,
            log.action_summary,
            log.action_details,
            Array.isArray(log.changed_fields) ? log.changed_fields.join(' ') : '',
            typeof log.metadata === 'object' && log.metadata ? JSON.stringify(log.metadata) : ''
        ].join(' ').toLowerCase();

        return haystack.includes(search);
    });
}

function renderAppLogsSummary(logs) {
    const today = new Date();
    const isToday = value => {
        if (!value) return false;
        const date = new Date(value);
        return date.getFullYear() === today.getFullYear()
            && date.getMonth() === today.getMonth()
            && date.getDate() === today.getDate();
    };

    const todayLogs = (logs || []).filter(log => isToday(log.occurred_at));
    const signIns = todayLogs.filter(log => log.event_type === 'sign_in').length;
    const signOuts = todayLogs.filter(log => log.event_type === 'sign_out').length;
    const timeouts = todayLogs.filter(log => log.event_type === 'session_timeout').length;
    const changes = todayLogs.filter(log => !['sign_in', 'sign_out', 'session_timeout'].includes(String(log.event_type || ''))).length;

    const setCount = (id, value) => {
        const target = document.getElementById(id);
        if (target) target.textContent = String(value);
    };

    setCount('logs-signins-today', signIns);
    setCount('logs-changes-today', changes);
    setCount('logs-signouts-today', signOuts);
    setCount('logs-timeouts-today', timeouts);
}

function buildLogRecordLabel(log) {
    const parts = [log.entity_label || '', log.entity_type ? `(${humanizeLogToken(log.entity_type)})` : '']
        .map(part => String(part || '').trim())
        .filter(Boolean);
    return parts.join(' ') || '-';
}

function buildFriendlyLogScope(filters) {
    if (!Array.isArray(filters) || !filters.length) return '';

    return filters.map(filter => {
        const operator = String(filter?.operator || '').toLowerCase();
        const args = Array.isArray(filter?.args) ? filter.args : [];
        const [field, value] = args;
        const fieldLabel = humanizeLogToken(field || 'record');
        const valueLabel = normalizeLogScopeValue(value);

        if (operator === 'eq') return `${fieldLabel} is ${valueLabel}`;
        if (operator === 'neq') return `${fieldLabel} is not ${valueLabel}`;
        if (operator === 'lt') return `${fieldLabel} is before ${valueLabel}`;
        if (operator === 'lte') return `${fieldLabel} is on or before ${valueLabel}`;
        if (operator === 'gt') return `${fieldLabel} is after ${valueLabel}`;
        if (operator === 'gte') return `${fieldLabel} is on or after ${valueLabel}`;
        if (operator === 'ilike' || operator === 'like') return `${fieldLabel} matches ${valueLabel}`;
        if (operator === 'in') return `${fieldLabel} is one of ${valueLabel}`;
        if (operator === 'or') return `One of these conditions: ${valueLabel}`;
        if (operator === 'match') return `Matched ${valueLabel}`;
        return `${fieldLabel} ${operator} ${valueLabel}`.trim();
    }).join(' | ');
}

function buildFriendlyLogMetaSummary(metadata) {
    if (!metadata || typeof metadata !== 'object') return '';

    const extras = [];
    if (metadata.auth_flow) extras.push(`Auth flow: ${humanizeLogToken(metadata.auth_flow)}`);
    if (metadata.session_timeout_minutes) extras.push(`Timeout rule: ${metadata.session_timeout_minutes} minutes`);
    if (metadata.last_activity_at) extras.push(`Last activity: ${formatAppLogDate(metadata.last_activity_at)}`);
    if (metadata.created_user_role) extras.push(`Created role: ${humanizeLogToken(metadata.created_user_role)}`);
    if (metadata.created_user_specialty) extras.push(`Specialty: ${metadata.created_user_specialty}`);
    if (metadata.mutation_type) extras.push(`Change type: ${humanizeLogToken(metadata.mutation_type)}`);
    if (metadata.table_name) extras.push(`Table: ${humanizeLogToken(metadata.table_name)}`);

    return extras.join(' | ');
}

function buildCompactLogDetailsHtml(log) {
    const changedFields = Array.isArray(log.changed_fields) ? log.changed_fields : [];
    const scopeText = log.metadata?.scope_summary || buildFriendlyLogScope(log.metadata?.filters || []);
    const quickValuePreview = getPrimaryLogPayload(log);
    const quickValueKeys = quickValuePreview ? Object.keys(quickValuePreview).slice(0, 3).map(humanizeLogToken) : [];
    const fieldChanges = getLogFieldChanges(log);
    const firstChange = fieldChanges[0]?.changes?.[0] || null;

    const rows = [];
    rows.push(`<div class="app-log-summary compact">${escapeLogsHtml(truncateLogText(log.action_summary || 'Activity recorded', 88))}</div>`);

    if (firstChange) {
        rows.push(`<div class="app-log-detail-line compact">${escapeLogsHtml(humanizeLogToken(firstChange.field))}: ${formatLogValueForHtml(firstChange.old_value, 36)} -> ${formatLogValueForHtml(firstChange.new_value, 36)}</div>`);
    } else if (changedFields.length) {
        rows.push(`<div class="app-log-detail-line compact"><strong>${changedFields.length}</strong> field${changedFields.length === 1 ? '' : 's'} changed</div>`);
    } else if (quickValueKeys.length) {
        rows.push(`<div class="app-log-detail-line compact">Touched: ${escapeLogsHtml(quickValueKeys.join(', '))}</div>`);
    } else if (scopeText) {
        rows.push(`<div class="app-log-detail-line compact">${escapeLogsHtml(truncateLogText(scopeText, 72))}</div>`);
    }

    rows.push(`
        <button type="button" class="btn btn-small app-log-open-btn" onclick="openAppLogDetails('${escapeLogsHtml(log.id || '')}')">
            <i class="fas fa-search-plus"></i> View Details
        </button>
    `);

    return `<div class="app-log-preview-stack">${rows.join('')}</div>`;
}

function buildLogKeyValueGrid(entries) {
    if (!entries.length) {
        return '<div class="app-log-modal-empty">No values were captured for this entry.</div>';
    }

    return `
        <div class="app-log-kv-grid">
            ${entries.map(([key, value]) => `
                <div class="app-log-kv-item">
                    <span>${escapeLogsHtml(humanizeLogToken(key))}</span>
                    <strong>${formatLogValueForHtml(value)}</strong>
                </div>
            `).join('')}
        </div>
    `;
}

function buildPayloadSections(log) {
    const payloadRecords = getLogPayloadRecords(log);
    if (!payloadRecords.length) return '';

    return payloadRecords.slice(0, 3).map((record, index) => {
        const entries = Object.entries(record || {});
        const label = payloadRecords.length > 1 ? `Changed Values ${index + 1}` : 'Changed Values';
        return `
            <section class="app-log-modal-section">
                <h4>${escapeLogsHtml(label)}</h4>
                ${buildLogKeyValueGrid(entries)}
            </section>
        `;
    }).join('');
}

function buildFieldChangeSections(log) {
    const groups = getLogFieldChanges(log);
    if (!groups.length) return '';

    return groups.slice(0, 3).map((group, index) => {
        const labelBase = group.record_label || group.record_id || `Record ${index + 1}`;
        const rows = Array.isArray(group.changes) ? group.changes : [];

        return `
            <section class="app-log-modal-section">
                <h4>${escapeLogsHtml(`Field Changes - ${labelBase}`)}</h4>
                <div class="app-log-change-list">
                    ${rows.map(change => `
                        <div class="app-log-change-item">
                            <span class="app-log-change-field">${escapeLogsHtml(humanizeLogToken(change.field || 'field'))}</span>
                            <div class="app-log-change-values">
                                <div><label>Old</label><strong>${formatLogValueForHtml(change.old_value)}</strong></div>
                                <div><label>New</label><strong>${formatLogValueForHtml(change.new_value)}</strong></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </section>
        `;
    }).join('');
}

function buildResultPreviewSection(log) {
    const preview = Array.isArray(log.metadata?.returned_record_preview) ? log.metadata.returned_record_preview : [];
    if (!preview.length) return '';

    const firstRecord = preview[0] && typeof preview[0] === 'object' ? preview[0] : null;
    if (!firstRecord) return '';

    const entries = Object.entries(firstRecord).slice(0, 12);
    return `
        <section class="app-log-modal-section">
            <h4>Saved Record Snapshot</h4>
            ${buildLogKeyValueGrid(entries)}
        </section>
    `;
}

function buildStateSnapshotSections(log) {
    const beforeRecords = getLogBeforeRecords(log);
    const afterRecords = getLogAfterRecords(log);
    const sections = [];

    if (beforeRecords.length) {
        const entries = Object.entries(beforeRecords[0]).slice(0, 16);
        sections.push(`
            <section class="app-log-modal-section">
                <h4>Before Change</h4>
                ${buildLogKeyValueGrid(entries)}
            </section>
        `);
    }

    if (afterRecords.length) {
        const entries = Object.entries(afterRecords[0]).slice(0, 16);
        sections.push(`
            <section class="app-log-modal-section">
                <h4>After Change</h4>
                ${buildLogKeyValueGrid(entries)}
            </section>
        `);
    }

    return sections.join('');
}

function buildScopeSection(log) {
    const scopeText = log.metadata?.scope_summary || buildFriendlyLogScope(log.metadata?.filters || []);
    if (!scopeText) return '';

    return `
        <section class="app-log-modal-section">
            <h4>Target Scope</h4>
            <div class="app-log-modal-note">${escapeLogsHtml(scopeText)}</div>
        </section>
    `;
}

function buildContextSection(log) {
    const changedFields = Array.isArray(log.changed_fields) ? log.changed_fields : [];
    const metaRows = [
        ['When', `${formatAppLogDate(log.occurred_at)} (${formatAppLogRelativeTime(log.occurred_at)})`],
        ['User', log.username || log.user_email || 'Unknown user'],
        ['Role', humanizeLogToken(log.user_role || 'unknown')],
        ['Event', humanizeLogToken(log.event_type || 'activity')],
        ['Module', humanizeLogToken(log.module_name || 'general')],
        ['Record', buildLogRecordLabel(log)],
        ['Session', log.session_id || '-'],
        ['Fields Changed', changedFields.length ? changedFields.map(humanizeLogToken).join(', ') : '-'],
        ['Rows Affected', String(log.metadata?.returned_record_count || '-')]
    ];

    return `
        <section class="app-log-modal-section">
            <h4>Activity Context</h4>
            ${buildLogKeyValueGrid(metaRows)}
        </section>
    `;
}

function buildExtraSection(log) {
    const extraText = buildFriendlyLogMetaSummary(log.metadata || {});
    const note = log.action_details || '';
    if (!extraText && !note) return '';

    return `
        <section class="app-log-modal-section">
            <h4>Notes</h4>
            ${note ? `<div class="app-log-modal-note"><strong>Summary:</strong> ${escapeLogsHtml(note)}</div>` : ''}
            ${extraText ? `<div class="app-log-modal-note"><strong>Extra context:</strong> ${escapeLogsHtml(extraText)}</div>` : ''}
        </section>
    `;
}

function renderAppLogModal(log) {
    const title = document.getElementById('app-log-details-title');
    const subtitle = document.getElementById('app-log-details-subtitle');
    const body = document.getElementById('app-log-details-body');
    const modal = document.getElementById('appLogDetailsModal');
    if (!title || !subtitle || !body || !modal || !log) return;

    title.textContent = log.action_summary || 'Activity Details';
    subtitle.textContent = `${formatAppLogDate(log.occurred_at)} | ${humanizeLogToken(log.module_name || 'general')} | ${humanizeLogToken(log.event_type || 'activity')}`;
    body.innerHTML = [
        buildContextSection(log),
        buildFieldChangeSections(log),
        buildStateSnapshotSections(log),
        buildPayloadSections(log),
        buildScopeSection(log),
        buildResultPreviewSection(log),
        buildExtraSection(log)
    ].filter(Boolean).join('');

    modal.style.display = 'flex';
}

function openAppLogDetails(logId) {
    const log = appLogsCache.find(entry => String(entry.id || '') === String(logId || ''));
    if (!log) return;
    renderAppLogModal(log);
}

function closeAppLogDetails() {
    const modal = document.getElementById('appLogDetailsModal');
    if (modal) modal.style.display = 'none';
}

function ensureAppLogModalBindings() {
    const modal = document.getElementById('appLogDetailsModal');
    if (!modal || modal.dataset.bound === 'true') return;

    modal.dataset.bound = 'true';
    modal.addEventListener('click', event => {
        if (event.target === modal) closeAppLogDetails();
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (modal.style.display === 'flex') closeAppLogDetails();
    });
}

function renderAppLogsTable() {
    const tbody = document.getElementById('app-logs-table-body');
    const visibleCount = document.getElementById('logs-visible-count');
    if (!tbody) return;

    const logs = getFilteredAppLogs();
    if (visibleCount) visibleCount.textContent = String(logs.length);

    if (!logs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">No log entries match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>
                <div class="app-log-primary">${escapeLogsHtml(formatAppLogDate(log.occurred_at))}</div>
                <div class="app-log-secondary">${escapeLogsHtml(formatAppLogRelativeTime(log.occurred_at))}</div>
            </td>
            <td>
                <div class="app-log-primary">${escapeLogsHtml(log.username || log.user_email || 'Unknown user')}</div>
                <div class="app-log-secondary">${escapeLogsHtml(log.user_email || '-')}</div>
                <div class="app-log-secondary">${escapeLogsHtml(humanizeLogToken(log.user_role || 'unknown'))}</div>
            </td>
            <td>
                <span class="app-log-session-chip">${escapeLogsHtml(String(log.session_id || '-').slice(0, 12) || '-')}</span>
            </td>
            <td>
                <span class="app-log-event-badge ${escapeLogsHtml(getLogEventBadgeClass(log.event_type))}">${escapeLogsHtml(humanizeLogToken(log.event_type || 'activity'))}</span>
            </td>
            <td>${escapeLogsHtml(humanizeLogToken(log.module_name || 'general'))}</td>
            <td>${escapeLogsHtml(buildLogRecordLabel(log))}</td>
            <td>${buildCompactLogDetailsHtml(log)}</td>
        </tr>
    `).join('');
}

function refreshAppLogsFilters() {
    renderAppLogsTable();
}

async function loadAppLogsView(forceRefresh = false) {
    const tbody = document.getElementById('app-logs-table-body');
    if (!tbody) return;

    ensureAppLogModalBindings();

    if (!forceRefresh && appLogsCache.length) {
        populateAppLogsModuleFilter(appLogsCache);
        renderAppLogsSummary(appLogsCache);
        renderAppLogsTable();
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-secondary);">Loading application activity...</td></tr>';

    try {
        const { data, error } = await window.supabaseClient
            .from('app_activity_logs')
            .select('*')
            .order('occurred_at', { ascending: false });

        if (error) throw error;

        appLogsCache = data || [];
        populateAppLogsModuleFilter(appLogsCache);
        renderAppLogsSummary(appLogsCache);
        renderAppLogsTable();
    } catch (error) {
        console.error('Failed to load application logs:', error);
        const hint = String(error?.message || '').toLowerCase().includes('app_activity_logs')
            ? 'Run the latest database_schema.sql in Supabase to create the audit table, then refresh the app.'
            : (error?.message || 'Unable to load logs.');
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--danger-color, #b91c1c);">${escapeLogsHtml(hint)}</td></tr>`;
    }
}

window.loadAppLogsView = loadAppLogsView;
window.refreshAppLogsFilters = refreshAppLogsFilters;
window.openAppLogDetails = openAppLogDetails;
window.closeAppLogDetails = closeAppLogDetails;
