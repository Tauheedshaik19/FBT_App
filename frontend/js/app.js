const ROLE_PERMISSIONS = {
    superadmin: {
        label: 'Superadmin',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'sales', 'map', 'logs'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: true,
        canAssignJobs: true,
        canManagePartners: true,
        canApproveUsers: true,
        canViewAppLogs: true,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    },
    manager: {
        label: 'Manager',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'sales', 'map', 'logs'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: true,
        canAssignJobs: true,
        canManagePartners: true,
        canApproveUsers: false,
        canViewAppLogs: true,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    },
    support: {
        label: 'Support',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'sales', 'map', 'logs'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canViewAppLogs: true,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    },
    technician: {
        label: 'Technician',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'map', 'logs'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canViewAppLogs: true,
        canEditInventory: false,
        canUseSalesPortal: false,
        shouldSeedBaseData: false
    },
    admin: {
        label: 'Admin',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'sales', 'map', 'logs'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canViewAppLogs: true,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    },
    sales: {
        label: 'Sales',
        accessibleViews: ['dashboard', 'settings', 'inventory', 'jobs', 'planner', 'reports', 'certification', 'partners', 'sales', 'map', 'logs'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canViewAppLogs: true,
        canEditInventory: false,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    }
};

let currentUserProfile = null;
let authSubscription = null;
let headerClockInterval = null;
const OWNER_EMAIL = 'tauheedsf19@gmail.com';
const OWNER_PASSWORD = '12345678';
const OWNER_USERNAME = 'Tauheed';
const OWNER_BYPASS_STORAGE_KEY = 'fairbridge-owner-bypass';
const APP_SESSION_STORAGE_KEY = 'fairbridge-app-session-token';
const APP_PROFILE_STORAGE_KEY = 'fairbridge-app-session-profile';
const APP_LAST_ACTIVITY_STORAGE_KEY = 'fairbridge-app-last-activity';
const APP_SESSION_AUDIT_ID_STORAGE_KEY = 'fairbridge-app-session-audit-id';
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'fairbridge-sidebar-collapsed';
const APP_ACTIVITY_LOG_TABLE = 'app_activity_logs';
const APP_SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'focus'];
const AUDIT_MUTATION_METHODS = new Set(['insert', 'update', 'upsert', 'delete']);
const AUDIT_FILTER_METHODS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'contains', 'containedBy', 'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'overlaps', 'textSearch', 'match', 'or', 'not']);
const APP_AUDIT_IGNORED_TABLES = new Set(['inventory_logs', APP_ACTIVITY_LOG_TABLE]);

let sessionTimeoutInterval = null;
let sessionActivityListenersBound = false;
let sessionStorageListenerBound = false;
let isSignOutInProgress = false;
let auditClientWrapped = false;
let appActivityLoggingUnavailable = false;
let lastActivityWriteAt = 0;

function getRawSupabaseClient() {
    return window.supabaseRawClient || window.supabaseClient || null;
}

function readStoredJson(storageKey) {
    try {
        const raw = window.localStorage.getItem(storageKey);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        return null;
    }
}

function sanitizeAuditValue(value, depth = 0) {
    if (depth > 6) return '[depth-limited]';
    if (value == null) return value;

    if (Array.isArray(value)) {
        return value.slice(0, 25).map(item => sanitizeAuditValue(item, depth + 1));
    }

    if (typeof value === 'object') {
        return Object.entries(value).reduce((acc, [key, entryValue]) => {
            const normalizedKey = String(key || '').toLowerCase();
            if (normalizedKey.includes('password') || normalizedKey.includes('token') || normalizedKey.includes('hash')) {
                acc[key] = '[redacted]';
            } else {
                acc[key] = sanitizeAuditValue(entryValue, depth + 1);
            }
            return acc;
        }, {});
    }

    if (typeof value === 'string' && value.length > 400) {
        return `${value.slice(0, 397)}...`;
    }

    return value;
}

function normalizeAuditDetailText(value) {
    const text = String(value || '').trim();
    return text.length > 700 ? `${text.slice(0, 697)}...` : text;
}

function humanizeAuditToken(value) {
    return String(value || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
        .trim();
}

function inferAuditModuleFromTable(tableName) {
    const table = String(tableName || '').toLowerCase();
    if (['inventory', 'inventory_logs'].includes(table)) return 'inventory';
    if (['jobs', 'job_assignments', 'job_notes', 'job_assignment_requests'].includes(table)) return 'jobs';
    if (['clients', 'sites', 'users'].includes(table)) return 'partners';
    if (['sales_opportunities', 'sales_activities'].includes(table)) return 'sales';
    if (['trip_plans'].includes(table)) return 'map';
    return 'general';
}

function inferAuditEntityLabel(record, tableName) {
    if (!record || typeof record !== 'object') return '';
    return record.client_name
        || record.company_name
        || record.name
        || record.title
        || record.username
        || record.email
        || record.serial_number
        || record.protocol_number
        || record.trip_name
        || record.id
        || humanizeAuditToken(tableName);
}

function summarizeAuditArgs(args = []) {
    return args.map(arg => {
        if (typeof arg === 'string') {
            return normalizeAuditDetailText(arg);
        }
        return sanitizeAuditValue(arg);
    });
}

function normalizeAuditRecords(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') return [data];
    return [];
}

function valuesDifferForAudit(a, b) {
    return JSON.stringify(sanitizeAuditValue(a)) !== JSON.stringify(sanitizeAuditValue(b));
}

function getAuditIdentityEntries(record = {}) {
    return [
        record.id ? ['id', record.id] : null,
        record.title ? ['title', record.title] : null,
        record.name ? ['name', record.name] : null,
        record.client_name ? ['client_name', record.client_name] : null,
        record.company_name ? ['company_name', record.company_name] : null,
        record.username ? ['username', record.username] : null,
        record.email ? ['email', record.email] : null,
        record.serial_number ? ['serial_number', record.serial_number] : null,
        record.protocol_number ? ['protocol_number', record.protocol_number] : null,
        record.status ? ['status', record.status] : null
    ].filter(Boolean);
}

function buildAuditScopeSummary(filters = []) {
    if (!Array.isArray(filters) || !filters.length) return '';

    return filters.map(filter => {
        const operator = String(filter?.operator || '').toLowerCase();
        const args = Array.isArray(filter?.args) ? filter.args : [];
        const [field, value] = args;
        const fieldLabel = humanizeAuditToken(field || 'record');
        const valueLabel = Array.isArray(value)
            ? value.map(item => String(item ?? '')).filter(Boolean).join(', ')
            : String(value ?? '').trim();

        if (!valueLabel) return fieldLabel;
        if (operator === 'eq') return `${fieldLabel} is ${valueLabel}`;
        if (operator === 'neq') return `${fieldLabel} is not ${valueLabel}`;
        if (operator === 'lt') return `${fieldLabel} is before ${valueLabel}`;
        if (operator === 'lte') return `${fieldLabel} is on or before ${valueLabel}`;
        if (operator === 'gt') return `${fieldLabel} is after ${valueLabel}`;
        if (operator === 'gte') return `${fieldLabel} is on or after ${valueLabel}`;
        if (operator === 'in') return `${fieldLabel} is one of ${valueLabel}`;
        if (operator === 'like' || operator === 'ilike') return `${fieldLabel} matches ${valueLabel}`;
        if (operator === 'or') return `One of these conditions: ${valueLabel}`;
        return `${fieldLabel} ${operator} ${valueLabel}`.trim();
    }).join(' | ');
}

function deriveAfterAuditRecords(context, result, beforeRecords = []) {
    const resultRecords = normalizeAuditRecords(result?.data);
    if (resultRecords.length) return resultRecords;

    const payload = context?.mutationPayload;
    if (context?.mutationType === 'delete') return [];

    if (context?.mutationType === 'update' && beforeRecords.length && payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return beforeRecords.map(record => ({ ...record, ...payload }));
    }

    if (context?.mutationType === 'insert' || context?.mutationType === 'upsert') {
        if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object');
        if (payload && typeof payload === 'object') return [payload];
    }

    return [];
}

function buildAuditFieldChanges(mutationType, beforeRecords = [], afterRecords = [], changedFields = []) {
    const fieldsToCompare = Array.from(new Set(changedFields || []));

    if (mutationType === 'update') {
        return beforeRecords.slice(0, 3).map((beforeRecord, index) => {
            const afterRecord = afterRecords[index] || beforeRecord || {};
            const changes = fieldsToCompare
                .map(field => ({
                    field,
                    old_value: beforeRecord?.[field],
                    new_value: afterRecord?.[field]
                }))
                .filter(change => valuesDifferForAudit(change.old_value, change.new_value));

            return {
                record_id: beforeRecord?.id || afterRecord?.id || null,
                record_label: inferAuditEntityLabel(afterRecord || beforeRecord, ''),
                changes
            };
        }).filter(entry => entry.changes.length);
    }

    if (mutationType === 'insert' || mutationType === 'upsert') {
        return afterRecords.slice(0, 3).map(record => ({
            record_id: record?.id || null,
            record_label: inferAuditEntityLabel(record, ''),
            changes: fieldsToCompare
                .map(field => ({
                    field,
                    old_value: null,
                    new_value: record?.[field]
                }))
                .filter(change => change.new_value != null)
        })).filter(entry => entry.changes.length);
    }

    if (mutationType === 'delete') {
        return beforeRecords.slice(0, 3).map(record => ({
            record_id: record?.id || null,
            record_label: inferAuditEntityLabel(record, ''),
            changes: getAuditIdentityEntries(record).map(([field, value]) => ({
                field,
                old_value: value,
                new_value: null
            }))
        })).filter(entry => entry.changes.length);
    }

    return [];
}

async function captureAuditBeforeState(context) {
    if (!context?.mutationType) return [];
    if (!['update', 'delete'].includes(context.mutationType)) return [];
    if (!Array.isArray(context.filters) || !context.filters.length) return [];

    const rawClient = getRawSupabaseClient();
    if (!rawClient) return [];

    try {
        let query = rawClient.from(context.tableName).select('*').limit(25);
        context.filters.forEach(filter => {
            const operator = filter?.operator;
            const args = Array.isArray(filter?.rawArgs) ? filter.rawArgs : [];
            if (!operator || typeof query[operator] !== 'function') return;
            query = query[operator](...args);
        });

        const { data, error } = await query;
        if (error) {
            console.warn('Failed to capture pre-change audit state:', error.message);
            return [];
        }

        return normalizeAuditRecords(data);
    } catch (error) {
        console.warn('Failed to capture audit before-state:', error.message);
        return [];
    }
}

function getMutationChangedFields(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) {
        return Array.from(new Set(payload.flatMap(item => Object.keys(item || {}))));
    }
    if (typeof payload === 'object') {
        return Object.keys(payload);
    }
    return [];
}

function readLastActivityTimestamp() {
    try {
        const raw = window.localStorage.getItem(APP_LAST_ACTIVITY_STORAGE_KEY);
        return raw ? Number(raw) : 0;
    } catch (err) {
        return 0;
    }
}

function persistLastActivityTimestamp(timestamp = Date.now()) {
    try {
        lastActivityWriteAt = timestamp;
        window.localStorage.setItem(APP_LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
    } catch (err) {
        console.warn('Failed to persist last activity timestamp:', err.message);
    }
}

function clearLastActivityTimestamp() {
    try {
        window.localStorage.removeItem(APP_LAST_ACTIVITY_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear last activity timestamp:', err.message);
    }
}

function readSessionAuditId() {
    try {
        return window.localStorage.getItem(APP_SESSION_AUDIT_ID_STORAGE_KEY) || null;
    } catch (err) {
        return null;
    }
}

function persistSessionAuditId(sessionId) {
    try {
        if (!sessionId) return;
        window.localStorage.setItem(APP_SESSION_AUDIT_ID_STORAGE_KEY, sessionId);
    } catch (err) {
        console.warn('Failed to persist session audit id:', err.message);
    }
}

function ensureSessionAuditId(forceNew = false) {
    let sessionId = readSessionAuditId();
    if (!sessionId || forceNew) {
        sessionId = typeof crypto?.randomUUID === 'function'
            ? crypto.randomUUID()
            : `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
        persistSessionAuditId(sessionId);
    }
    return sessionId;
}

function clearSessionAuditId() {
    try {
        window.localStorage.removeItem(APP_SESSION_AUDIT_ID_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear session audit id:', err.message);
    }
}

function markSessionActivity(force = false) {
    if (!currentUserProfile) return;
    const now = Date.now();
    if (force || !lastActivityWriteAt || now - lastActivityWriteAt >= 15000) {
        persistLastActivityTimestamp(now);
    }
}

function isSessionTimedOut(referenceTime = Date.now()) {
    const lastActivityAt = readLastActivityTimestamp();
    if (!lastActivityAt) return false;
    return referenceTime - lastActivityAt >= APP_SESSION_TIMEOUT_MS;
}

function getSessionTimeoutLabel() {
    return `${Math.round(APP_SESSION_TIMEOUT_MS / 60000)} minutes`;
}

function buildAuditSummary(tableName, mutationType, result, payload, filters, context = {}) {
    const tableLabel = humanizeAuditToken(tableName);
    const actionLabelMap = {
        insert: 'Created',
        update: 'Updated',
        upsert: 'Saved',
        delete: 'Deleted'
    };
    const actionLabel = actionLabelMap[mutationType] || 'Changed';
    const recordCount = Array.isArray(result?.data) ? result.data.length : (result?.data ? 1 : 0);
    const changedFields = getMutationChangedFields(payload);
    const fallbackCount = mutationType === 'delete'
        ? (context.beforeRecords?.length || 0)
        : (context.afterRecords?.length || 0);
    const effectiveCount = recordCount || fallbackCount;
    const changeText = changedFields.length ? ` (${changedFields.slice(0, 6).join(', ')})` : '';
    const entityLabel = context.entityLabel ? ` "${context.entityLabel}"` : '';
    const countText = effectiveCount > 1 ? ` ${effectiveCount} ${tableLabel} records` : ` ${tableLabel} record${entityLabel}`;
    return `${actionLabel}${countText}${changeText}.`;
}

async function logAppActivity(entry = {}, options = {}) {
    if (appActivityLoggingUnavailable) return;

    const client = getRawSupabaseClient();
    if (!client) return;

    const profile = options.profile || currentUserProfile || readStoredJson(APP_PROFILE_STORAGE_KEY) || null;
    const payload = {
        session_id: options.sessionId || readSessionAuditId() || null,
        user_id: entry.user_id || profile?.id || null,
        username: entry.username || profile?.username || null,
        user_email: entry.user_email || profile?.email || null,
        user_role: entry.user_role || profile?.role || null,
        event_type: entry.eventType || 'activity',
        module_name: entry.moduleName || 'general',
        entity_type: entry.entityType || null,
        entity_id: entry.entityId || null,
        entity_label: entry.entityLabel || null,
        action_summary: normalizeAuditDetailText(entry.actionSummary || 'Application activity recorded.'),
        action_details: normalizeAuditDetailText(entry.actionDetails || ''),
        changed_fields: Array.isArray(entry.changedFields) ? entry.changedFields.slice(0, 30) : [],
        metadata: sanitizeAuditValue(entry.metadata || {}),
        occurred_at: entry.occurredAt || new Date().toISOString()
    };

    const { error } = await client.from(APP_ACTIVITY_LOG_TABLE).insert([payload]);
    if (error) {
        const normalizedMessage = String(error.message || '').toLowerCase();
        if (normalizedMessage.includes(APP_ACTIVITY_LOG_TABLE) || normalizedMessage.includes('column') || normalizedMessage.includes('relation')) {
            appActivityLoggingUnavailable = true;
        }
        throw error;
    }
}

async function auditMutationResult(context, result) {
    if (!context?.mutationType || context.logged || result?.error) return;
    if (APP_AUDIT_IGNORED_TABLES.has(context.tableName)) return;
    if (!currentUserProfile || appActivityLoggingUnavailable) return;

    context.logged = true;

    const records = normalizeAuditRecords(result?.data);
    const beforeRecords = Array.isArray(context.beforeRecords) ? context.beforeRecords : [];
    const afterRecords = deriveAfterAuditRecords(context, result, beforeRecords);
    const firstRecord = records[0] || afterRecords[0] || beforeRecords[0] || null;
    const changedFields = getMutationChangedFields(context.mutationPayload);
    const fieldChanges = buildAuditFieldChanges(context.mutationType, beforeRecords, afterRecords, changedFields);
    const scopeSummary = buildAuditScopeSummary((context.filters || []).map(filter => ({ operator: filter.operator, args: filter.args })));
    const actionVerb = humanizeAuditToken(context.mutationType);
    const entityLabel = inferAuditEntityLabel(firstRecord, context.tableName);
    const actionDetails = context.mutationType === 'delete'
        ? `${actionVerb} ${humanizeAuditToken(context.tableName)} record${entityLabel ? ` "${entityLabel}"` : ''}.`
        : `${actionVerb} ${humanizeAuditToken(context.tableName)} record${entityLabel ? ` "${entityLabel}"` : ''}${changedFields.length ? ` by changing ${changedFields.map(humanizeAuditToken).join(', ')}` : ''}.`;

    try {
        await logAppActivity({
            eventType: 'change',
            moduleName: inferAuditModuleFromTable(context.tableName),
            entityType: context.tableName,
            entityId: firstRecord?.id || null,
            entityLabel,
            actionSummary: buildAuditSummary(context.tableName, context.mutationType, result, context.mutationPayload, context.filters, {
                beforeRecords,
                afterRecords,
                entityLabel
            }),
            actionDetails,
            changedFields,
            metadata: {
                mutation_type: context.mutationType,
                table_name: context.tableName,
                changed_fields: changedFields,
                filters: (context.filters || []).map(filter => ({
                    operator: filter.operator,
                    args: filter.args
                })),
                scope_summary: scopeSummary,
                payload: sanitizeAuditValue(context.mutationPayload),
                returned_record_count: records.length || afterRecords.length || beforeRecords.length,
                returned_record_preview: sanitizeAuditValue((records.length ? records : afterRecords).slice(0, 3)),
                before_records: sanitizeAuditValue(beforeRecords.slice(0, 3)),
                after_records: sanitizeAuditValue(afterRecords.slice(0, 3)),
                field_changes: sanitizeAuditValue(fieldChanges)
            }
        });
    } catch (auditError) {
        console.warn('Automatic audit logging failed:', auditError.message);
    }
}

function createAuditedQueryBuilder(target, context) {
    return new Proxy(target, {
        get(builderTarget, prop, receiver) {
            if (prop === 'then') {
                return (resolve, reject) => Promise.resolve(captureAuditBeforeState(context)).then(beforeRecords => {
                    context.beforeRecords = beforeRecords;
                    return builderTarget.then(
                        async result => {
                            await auditMutationResult(context, result);
                            return typeof resolve === 'function' ? resolve(result) : result;
                        },
                        error => (typeof reject === 'function' ? reject(error) : Promise.reject(error))
                    );
                });
            }

            const value = Reflect.get(builderTarget, prop, receiver);
            if (typeof value !== 'function') return value;

            return (...args) => {
                if (AUDIT_MUTATION_METHODS.has(prop)) {
                    context.mutationType = prop;
                    context.mutationPayload = args[0] ?? null;
                } else if (AUDIT_FILTER_METHODS.has(prop)) {
                    context.filters.push({ operator: prop, args: summarizeAuditArgs(args), rawArgs: args });
                }

                const result = value.apply(builderTarget, args);
                if (result && typeof result === 'object' && typeof result.then === 'function') {
                    return createAuditedQueryBuilder(result, context);
                }
                return result;
            };
        }
    });
}

function wrapSupabaseClientWithAudit() {
    if (auditClientWrapped || !window.supabaseClient) return;

    const rawClient = getRawSupabaseClient();
    if (!rawClient) return;

    window.supabaseClient = new Proxy(rawClient, {
        get(target, prop, receiver) {
            if (prop === 'from') {
                return tableName => {
                    const builder = target.from(tableName);
                    return createAuditedQueryBuilder(builder, {
                        tableName: String(tableName || ''),
                        filters: [],
                        mutationType: null,
                        mutationPayload: null,
                        logged: false
                    });
                };
            }

            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });

    auditClientWrapped = true;
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isOwnerEmail(email) {
    return normalizeEmail(email) === OWNER_EMAIL;
}

function isOwnerPassword(password) {
    return String(password || '') === OWNER_PASSWORD;
}

// Global Permission & State Helpers
function getRolePermissions(role) {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.technician;
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

function getCurrentRolePermissions() {
    return currentUserProfile ? getRolePermissions(currentUserProfile.role) : null;
}

function hasAppPermission(permName) {
    const perms = getCurrentRolePermissions();
    return perms ? !!perms[permName] : false;
}

function updateHeaderAmbientDetails(targetId = 'dashboard') {
    const modulePill = document.getElementById('header-module-pill');
    const dateLabel = document.getElementById('header-date-label');
    const labels = {
        dashboard: 'Mission Control',
        inventory: 'Asset Flow',
        jobs: 'Field Ops',
        planner: 'Planner View',
        reports: 'Reporting',
        certification: 'Calibration',
        partners: 'Network',
        sales: 'Revenue',
        map: 'Site Atlas',
        logs: 'Audit Trail',
        settings: 'Settings'
    };

    if (modulePill) modulePill.textContent = labels[targetId] || 'Workspace';
    if (dateLabel) {
        dateLabel.textContent = new Date().toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }
}

function updateHeaderClock() {
    const timeLabel = document.getElementById('header-live-time');
    const liveDateLabel = document.getElementById('header-live-date');
    if (!timeLabel && !liveDateLabel) return;

    const now = new Date();

    if (timeLabel) {
        timeLabel.textContent = now.toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    if (liveDateLabel) {
        liveDateLabel.textContent = now.toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    const settingsTimeLabel = document.getElementById('settings-live-time');
    if (settingsTimeLabel) {
        settingsTimeLabel.textContent = `${now.toLocaleDateString('en-ZA', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })} ${now.toLocaleTimeString('en-ZA', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })}`;
    }
}

function setupHeaderClock() {
    updateHeaderClock();
    if (headerClockInterval) window.clearInterval(headerClockInterval);
    headerClockInterval = window.setInterval(updateHeaderClock, 1000);
}

function runHeaderShortcut(viewId, action, successLabel) {
    if (!currentUserProfile) return;

    const permissions = getCurrentRolePermissions();
    if (!permissions?.accessibleViews?.includes(viewId)) {
        if (typeof showToast === 'function') showToast('Your role does not have access to this shortcut.', 'error');
        return;
    }

    navigateToView(viewId);
    if (typeof action === 'function') {
        window.setTimeout(action, 80);
    }
    if (typeof showToast === 'function' && successLabel) {
        showToast(`Opened ${successLabel}.`, 'success');
    }
}

function setupDashboardShortcuts() {
    const shortcuts = [
        {
            id: 'header-shortcut-jobs',
            handler: () => runHeaderShortcut('jobs', () => openJobsPanelByKey('overview'), 'Jobs & Techs')
        },
        {
            id: 'header-shortcut-sales',
            handler: () => runHeaderShortcut('sales', null, 'Sales Portal')
        },
        {
            id: 'header-shortcut-reports',
            handler: () => runHeaderShortcut('reports', null, 'Reports')
        },
        {
            id: 'header-shortcut-planner',
            handler: () => runHeaderShortcut('planner', null, 'Work Planner')
        },
        {
            id: 'header-shortcut-profile',
            handler: () => {
                if (!currentUserProfile) return;
                openProfileSettingsModal();
            }
        },
        {
            id: 'header-shortcut-settings',
            handler: () => runHeaderShortcut('settings', null, 'Settings')
        },
        {
            id: 'dashboard-quick-refresh',
            handler: () => {
                if (typeof loadDashboardData === 'function') loadDashboardData();
                if (typeof showToast === 'function') showToast('Dashboard refreshed.', 'success');
            }
        },
        {
            id: 'dashboard-quick-planner',
            handler: () => runHeaderShortcut('planner', null, 'Work Planner')
        },
        {
            id: 'dashboard-stat-inventory',
            handler: () => runHeaderShortcut('inventory', () => openInventorySubViewByKey('dashboard'), 'Inventory Dashboard')
        },
        {
            id: 'dashboard-stat-pending',
            handler: () => runHeaderShortcut('jobs', () => openJobsPanelByKey('overview'), 'Jobs & Techs')
        },
        {
            id: 'dashboard-stat-operations',
            handler: () => runHeaderShortcut('planner', null, 'Work Planner')
        },
        {
            id: 'dashboard-stat-reports',
            handler: () => runHeaderShortcut('reports', null, 'Reports')
        },
        {
            id: 'settings-open-profile-btn',
            handler: () => {
                if (!currentUserProfile) return;
                openProfileSettingsModal();
            }
        },
        {
            id: 'settings-signout-btn',
            handler: () => handleSignOut()
        },
        {
            id: 'settings-go-dashboard',
            handler: () => runHeaderShortcut('dashboard', null, 'Dashboard')
        },
        {
            id: 'settings-go-jobs',
            handler: () => runHeaderShortcut('jobs', () => openJobsPanelByKey('overview'), 'Jobs & Techs')
        },
        {
            id: 'settings-go-planner',
            handler: () => runHeaderShortcut('planner', null, 'Work Planner')
        },
        {
            id: 'settings-go-map',
            handler: () => runHeaderShortcut('map', null, 'Client Sites')
        }
    ];

    shortcuts.forEach(shortcut => {
        const element = document.getElementById(shortcut.id);
        if (!element || element.dataset.bound === 'true') return;
        element.dataset.bound = 'true';
        element.addEventListener('click', shortcut.handler);
    });
}

function applySidebarCollapseState(isCollapsed) {
    document.body.classList.toggle('sidebar-collapsed', Boolean(isCollapsed));
    const toggleButtons = document.querySelectorAll('.sidebar-toggle-btn i');
    toggleButtons.forEach(icon => {
        icon.className = 'fas fa-bars';
    });
}

function setupSidebarChrome() {
    const persisted = localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY) === 'true';
    applySidebarCollapseState(persisted);
    updateHeaderAmbientDetails();
}

function toggleSidebarCollapse() {
    const isCollapsed = !document.body.classList.contains('sidebar-collapsed');
    applySidebarCollapseState(isCollapsed);
    localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(isCollapsed));
}

// Expose to window for other controllers
window.getCurrentUserProfile = getCurrentUserProfile;
window.hasAppPermission = hasAppPermission;
window.getRolePermissions = getRolePermissions;
window.getCurrentRolePermissions = getCurrentRolePermissions;

function hasOwnerBypassCredentials(email, password) {
    return isOwnerEmail(email) && isOwnerPassword(password);
}

function isInvalidCredentialsError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('invalid login credentials') || message.includes('invalid credentials');
}

function isRateLimitError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('rate limit') || message.includes('email rate limit exceeded') || message.includes('too many requests');
}

function isValidEmailAddress(email) {
    const normalized = normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalized);
}

function validateStrongPassword(password) {
    const value = String(password || '');
    return {
        hasMinLength: value.length >= 12,
        hasUppercase: /[A-Z]/.test(value),
        hasLowercase: /[a-z]/.test(value),
        hasNumber: /\d/.test(value),
        hasSpecial: /[^A-Za-z0-9]/.test(value)
    };
}

function isStrongPassword(password) {
    const checks = validateStrongPassword(password);
    return Object.values(checks).every(Boolean);
}

function updateSignupSecurityHint() {
    const hint = document.getElementById('signup-security-hint');
    const email = document.getElementById('signup-email')?.value || '';
    const password = document.getElementById('signup-password')?.value || '';
    if (!hint) return;

    if (!email && !password) {
        hint.classList.remove('is-valid', 'is-invalid');
        hint.textContent = 'Use a valid email address and a password with at least 12 characters, uppercase, lowercase, a number, and a special character.';
        return;
    }

    const emailValid = isValidEmailAddress(email);
    const passwordValid = isStrongPassword(password) || hasOwnerBypassCredentials(email, password);

    hint.classList.toggle('is-valid', emailValid && passwordValid);
    hint.classList.toggle('is-invalid', !(emailValid && passwordValid));
    hint.textContent = emailValid && passwordValid
        ? 'Email format and password strength look valid.'
        : 'Use a valid email address and a password with at least 12 characters, uppercase, lowercase, a number, and a special character.';
}

function buildOwnerFallbackProfile(overrides = {}) {
    return {
        id: overrides.id || 'owner-local-session',
        auth_user_id: overrides.auth_user_id || null,
        username: overrides.username || OWNER_USERNAME,
        email: OWNER_EMAIL,
        role: 'superadmin',
        requested_role: 'superadmin',
        specialty: overrides.specialty || 'General',
        phone_number: overrides.phone_number || null,
        status: 'active',
        approval_status: 'approved',
        approved_at: overrides.approved_at || new Date().toISOString(),
        approved_by: overrides.approved_by || overrides.id || null,
        is_superadmin: true,
        created_at: overrides.created_at || new Date().toISOString()
    };
}

function persistOwnerBypassSession(profile) {
    try {
        window.localStorage.setItem(OWNER_BYPASS_STORAGE_KEY, JSON.stringify(buildOwnerFallbackProfile(profile)));
    } catch (err) {
        console.warn('Failed to persist owner bypass session:', err.message);
    }
}

function clearOwnerBypassSession() {
    try {
        window.localStorage.removeItem(OWNER_BYPASS_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear owner bypass session:', err.message);
    }
}

function readOwnerBypassSession() {
    try {
        const raw = window.localStorage.getItem(OWNER_BYPASS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isOwnerEmail(parsed?.email) ? buildOwnerFallbackProfile(parsed) : null;
    } catch (err) {
        console.warn('Failed to read owner bypass session:', err.message);
        return null;
    }
}

function persistAppSessionToken(sessionToken) {
    try {
        if (!sessionToken) return;
        window.localStorage.setItem(APP_SESSION_STORAGE_KEY, sessionToken);
    } catch (err) {
        console.warn('Failed to persist app session token:', err.message);
    }
}

function readAppSessionToken() {
    try {
        return window.localStorage.getItem(APP_SESSION_STORAGE_KEY) || null;
    } catch (err) {
        console.warn('Failed to read app session token:', err.message);
        return null;
    }
}

function clearAppSessionToken() {
    try {
        window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear app session token:', err.message);
    }
}

function persistAppProfile(profile) {
    try {
        if (!profile) return;
        window.localStorage.setItem(APP_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
        console.warn('Failed to persist app profile:', err.message);
    }
}

function readAppProfile() {
    try {
        const raw = window.localStorage.getItem(APP_PROFILE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('Failed to read app profile:', err.message);
        return null;
    }
}

function clearAppProfile() {
    try {
        window.localStorage.removeItem(APP_PROFILE_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear app profile:', err.message);
    }
}

function normalizeAuthRpcPayload(data) {
    if (!data) return null;
    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload || typeof payload !== 'object') return null;
    return {
        sessionToken: payload.session_token || null,
        profile: payload.profile || null
    };
}

async function callAuthRpc(functionName, params) {
    const { data, error } = await window.supabaseClient.rpc(functionName, params);
    if (error) throw error;

    const payload = normalizeAuthRpcPayload(data);
    if (!payload?.profile) {
        throw new Error('Authentication flow returned no user profile.');
    }

    return payload;
}

async function resolveOwnerAccessProfile() {
    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .eq('email', OWNER_EMAIL)
            .maybeSingle();

        if (error) throw error;
        return buildOwnerFallbackProfile(data || {});
    } catch (err) {
        console.warn('Falling back to local owner profile:', err.message);
        return buildOwnerFallbackProfile();
    }
}

async function enterOwnerBypassMode() {
    const profile = await resolveOwnerAccessProfile();
    currentUserProfile = profile;
    persistOwnerBypassSession(profile);
    ensureSessionAuditId(true);
    markSessionActivity(true);
    hideAuthShell();
    await bootAuthenticatedApp(profile);
    await logAppActivity({
        eventType: 'sign_in',
        moduleName: 'auth',
        entityType: 'session',
        entityLabel: profile.username || profile.email || 'Owner fallback session',
        actionSummary: `${profile.username || profile.email || 'Owner'} opened fallback owner access.`,
        actionDetails: `Fallback session opened with a ${getSessionTimeoutLabel()} inactivity timeout.`,
        metadata: {
            auth_flow: 'owner_bypass',
            session_timeout_minutes: APP_SESSION_TIMEOUT_MS / 60000
        }
    }).catch(error => console.warn('Owner bypass audit logging failed:', error.message));
    if (typeof showToast === 'function') showToast('Owner access opened in local fallback mode.', 'success');
}

async function bootstrapOwnerAuthAccess(password) {
    return callAuthRpc('app_sign_up', {
        p_email: OWNER_EMAIL,
        p_password: password,
        p_username: OWNER_USERNAME,
        p_requested_role: 'superadmin',
        p_phone_number: null
    });
}

function setApprovalNotificationCount(count = 0) {
    const alertButton = document.getElementById('approval-alert-btn');
    const alertCount = document.getElementById('approval-alert-count');
    const canApproveUsers = hasAppPermission('canApproveUsers');
    const normalizedCount = Math.max(0, Number(count) || 0);

    if (!alertButton || !alertCount) return;

    if (!canApproveUsers || normalizedCount === 0) {
        alertButton.style.display = 'none';
        alertCount.textContent = '0';
        return;
    }

    alertCount.textContent = String(normalizedCount);
    alertButton.style.display = 'inline-flex';
}

async function refreshApprovalNotificationBadge() {
    setApprovalNotificationCount(0);
}

function getRolePermissions(role) {
    return ROLE_PERMISSIONS[String(role || '').toLowerCase()] || ROLE_PERMISSIONS.technician;
}

function getCurrentRolePermissions() {
    return getRolePermissions(currentUserProfile?.role);
}

function hasAppPermission(permission) {
    return Boolean(getCurrentRolePermissions()[permission]);
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

async function ensureCurrentUserDatabaseProfile() {
    if (!currentUserProfile || !window.supabaseClient) return currentUserProfile;
    if (currentUserProfile.id && currentUserProfile.id !== 'owner-local-session') return currentUserProfile;

    const normalizedEmail = normalizeEmail(currentUserProfile.email);
    let matchedProfile = null;

    if (currentUserProfile.auth_user_id) {
        const byAuthUserResult = await window.supabaseClient
            .from('users')
            .select('*')
            .eq('auth_user_id', currentUserProfile.auth_user_id)
            .maybeSingle();

        if (byAuthUserResult.error) throw byAuthUserResult.error;
        matchedProfile = byAuthUserResult.data || null;
    }

    if (!matchedProfile && normalizedEmail) {
        const byEmailResult = await window.supabaseClient
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (byEmailResult.error) throw byEmailResult.error;
        matchedProfile = byEmailResult.data || null;
    }

    if (!matchedProfile && normalizedEmail) {
        const payload = {
            auth_user_id: currentUserProfile.auth_user_id || null,
            username: currentUserProfile.username || normalizedEmail.split('@')[0] || 'user',
            email: normalizedEmail,
            role: String(currentUserProfile.role || 'technician').toLowerCase(),
            requested_role: String(currentUserProfile.requested_role || currentUserProfile.role || 'technician').toLowerCase(),
            phone_number: currentUserProfile.phone_number || null,
            status: currentUserProfile.status || 'active',
            approval_status: currentUserProfile.approval_status || 'approved',
            is_superadmin: Boolean(currentUserProfile.is_superadmin),
            approved_at: currentUserProfile.approved_at || (currentUserProfile.is_superadmin ? new Date().toISOString() : null)
        };

        const upsertResult = await window.supabaseClient
            .from('users')
            .upsert([payload], { onConflict: 'email' })
            .select('*')
            .maybeSingle();

        if (upsertResult.error) throw upsertResult.error;
        matchedProfile = upsertResult.data || null;
    }

    if (matchedProfile) {
        currentUserProfile = { ...currentUserProfile, ...matchedProfile };
        persistAppProfile(currentUserProfile);
    }

    return currentUserProfile;
}

function formatRoleLabel(role) {
    return getRolePermissions(role).label;
}

function getAuthStatusBanner() {
    return document.getElementById('auth-status-banner');
}

function showAuthStatus(message, type = 'error') {
    const banner = getAuthStatusBanner();
    if (!banner) return;
    banner.style.display = 'block';
    banner.className = `auth-status-banner${type === 'success' ? ' success' : ''}`;
    banner.textContent = message;
    if (typeof showToast === 'function') {
        showToast(message, type === 'success' ? 'success' : 'error');
    }
}

function clearAuthStatus() {
    const banner = getAuthStatusBanner();
    if (!banner) return;
    banner.style.display = 'none';
    banner.textContent = '';
    banner.className = 'auth-status-banner';
}

function syncOwnerSetupVisibility() {
    const ownerSetupButton = document.getElementById('owner-setup-btn');
    const signUpForm = document.getElementById('signup-form');
    const email = normalizeEmail(document.getElementById('signup-email')?.value);
    const isSignUpVisible = signUpForm?.style.display !== 'none';

    if (!ownerSetupButton) return;
    ownerSetupButton.style.display = isSignUpVisible && isOwnerEmail(email) ? '' : 'none';

    const footerSignUp = document.getElementById('auth-footer-signup');
    const footerSignIn = document.getElementById('auth-footer-signin');
    if (footerSignUp) footerSignUp.style.display = isSignUpVisible ? 'none' : '';
    if (footerSignIn) footerSignIn.style.display = isSignUpVisible ? '' : 'none';
}

function setAuthLoading(buttonId, isLoading, loadingText, defaultText) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}

function switchAuthMode(mode, button) {
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    if (button?.classList?.contains('auth-tab')) button.classList.add('active');

    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');
    if (signInForm) signInForm.style.display = mode === 'signin' ? 'block' : 'none';
    if (signUpForm) signUpForm.style.display = mode === 'signup' ? 'block' : 'none';
    clearAuthStatus();
    syncOwnerSetupVisibility();
}

function resetAuthFormsToDefaultState() {
    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');

    if (signInForm) signInForm.reset();
    if (signUpForm) signUpForm.reset();

    setAuthLoading('signin-submit-btn', false, 'Signing In...', 'Sign In');
    setAuthLoading('signup-submit-btn', false, 'Creating Account...', 'Create Account');
    clearAuthStatus();
    switchAuthMode('signin', document.querySelector('.auth-tab[data-auth-mode="signin"]'));
}

function hasPersistedSession() {
    return Boolean(currentUserProfile || readAppSessionToken() || readAppProfile() || readOwnerBypassSession());
}

function teardownAuthenticatedSessionState() {
    clearAppSessionToken();
    clearAppProfile();
    clearOwnerBypassSession();
    clearSessionAuditId();
    clearLastActivityTimestamp();
    currentUserProfile = null;
    isSignOutInProgress = false;
}

function stopSessionTimeoutWatcher() {
    if (sessionTimeoutInterval) {
        window.clearInterval(sessionTimeoutInterval);
        sessionTimeoutInterval = null;
    }
}

function handleSessionActivitySignal() {
    markSessionActivity();
}

function handleSessionStorageSync(event) {
    if (event.key === APP_LAST_ACTIVITY_STORAGE_KEY && currentUserProfile) {
        lastActivityWriteAt = Number(event.newValue || 0);
    }

    if (event.key === APP_SESSION_STORAGE_KEY && !event.newValue && currentUserProfile && !isSignOutInProgress) {
        stopSessionTimeoutWatcher();
        teardownAuthenticatedSessionState();
        applyRoleAccess(null);
        showAuthShell();
    }
}

function startSessionTimeoutWatcher() {
    if (!currentUserProfile) return;

    ensureSessionAuditId();
    markSessionActivity(true);
    stopSessionTimeoutWatcher();

    sessionTimeoutInterval = window.setInterval(() => {
        if (!currentUserProfile || isSignOutInProgress) return;
        if (!isSessionTimedOut()) return;

        handleSignOut({
            reason: 'session_timeout',
            message: `Session timed out after ${getSessionTimeoutLabel()} of inactivity.`,
            toastType: 'info'
        });
    }, 15000);

    if (!sessionActivityListenersBound) {
        SESSION_ACTIVITY_EVENTS.forEach(eventName => {
            window.addEventListener(eventName, handleSessionActivitySignal, { passive: true });
        });
        document.addEventListener('visibilitychange', () => {
            if (!currentUserProfile) return;
            if (!document.hidden) {
                if (isSessionTimedOut()) {
                    handleSignOut({
                        reason: 'session_timeout',
                        message: `Session timed out after ${getSessionTimeoutLabel()} of inactivity.`,
                        toastType: 'info'
                    });
                    return;
                }
                markSessionActivity(true);
            }
        });
        sessionActivityListenersBound = true;
    }

    if (!sessionStorageListenerBound) {
        window.addEventListener('storage', handleSessionStorageSync);
        sessionStorageListenerBound = true;
    }
}

async function ensureOwnerProfileState(profile, authUser, phoneNumber = null, requestedRole = 'superadmin') {
    if (!authUser?.email || !isOwnerEmail(authUser.email)) return profile;

    const payload = {
        auth_user_id: authUser.id,
        username: profile?.username || authUser.email.split('@')[0],
        email: authUser.email,
        role: 'superadmin',
        requested_role: 'superadmin',
        phone_number: phoneNumber ?? profile?.phone_number ?? null,
        status: 'active',
        approval_status: 'approved',
        is_superadmin: true,
        approved_at: profile?.approved_at || new Date().toISOString(),
        approved_by: profile?.approved_by || profile?.id || null
    };

    const targetId = profile?.id || null;
    let query = window.supabaseClient
        .from('users')
        .upsert([payload], { onConflict: 'email' })
        .select('*')
        .maybeSingle();

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

function buildUserProfilePayload(authUser, selectedRole, phoneNumber) {
    const normalizedRole = String(selectedRole || authUser?.user_metadata?.requested_role || 'technician').toLowerCase();
    const normalizedEmail = normalizeEmail(authUser?.email);
    const isOwner = isOwnerEmail(normalizedEmail);
    const usernameSource = authUser?.user_metadata?.username || normalizedEmail.split('@')[0] || 'user';

    return {
        auth_user_id: authUser.id,
        username: usernameSource,
        email: normalizedEmail,
        role: isOwner ? 'superadmin' : normalizedRole,
        requested_role: isOwner ? 'superadmin' : normalizedRole,
        phone_number: phoneNumber ?? authUser?.user_metadata?.phone_number ?? null,
        status: 'active',
        approval_status: 'approved',
        is_superadmin: isOwner,
        approved_at: isOwner ? new Date().toISOString() : null
    };
}

async function resolveUserProfile(authUser) {
    if (!authUser?.email) return null;

    let { data: profile, error } = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

    if (error) throw error;
    if (profile) {
        return ensureOwnerProfileState(profile, authUser);
    }

    const byEmailResult = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle();

    if (byEmailResult.error) throw byEmailResult.error;
    profile = byEmailResult.data;

    if (profile && !profile.auth_user_id) {
        const { data: updatedProfile, error: updateError } = await window.supabaseClient
            .from('users')
            .update({ auth_user_id: authUser.id })
            .eq('id', profile.id)
            .select('*')
            .maybeSingle();

        if (updateError) throw updateError;
        return ensureOwnerProfileState(updatedProfile || profile, authUser);
    }

    if (!profile && isOwnerEmail(authUser.email)) {
        return ensureOwnerProfileState(null, authUser);
    }

    if (!profile) {
        try {
            return await upsertSignedUpUser(
                authUser,
                authUser?.user_metadata?.requested_role || 'technician',
                authUser?.user_metadata?.phone_number || null
            );
        } catch (repairError) {
            console.warn('Unable to repair missing profile during sign-in:', repairError.message);
        }
    }

    return profile;
}

async function upsertSignedUpUser(authUser, selectedRole, phoneNumber) {
    const payload = buildUserProfilePayload(authUser, selectedRole, phoneNumber);
    const isOwner = isOwnerEmail(authUser.email);

    const { data, error } = await window.supabaseClient
        .from('users')
        .upsert([payload], { onConflict: 'email' })
        .select('*')
        .maybeSingle();

    if (error) {
        const normalizedMessage = String(error.message || '').toLowerCase();
        const isPermissionLimitedInsert = normalizedMessage.includes('permission')
            || normalizedMessage.includes('row-level security')
            || normalizedMessage.includes('jwt');
        const isMissingRelationState = normalizedMessage.includes('duplicate key')
            || normalizedMessage.includes('already exists');

        if (!isOwner && (isPermissionLimitedInsert || isMissingRelationState)) {
            return {
                ...payload,
                id: null
            };
        }
        throw error;
    }

    const resolvedProfile = data || { ...payload, id: null };
    return isOwner ? ensureOwnerProfileState(resolvedProfile, authUser, phoneNumber, payload.requested_role) : resolvedProfile;
}

async function handleSignUp(event) {
    event.preventDefault();
    clearAuthStatus();
    const username = document.getElementById('signup-username')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const phone = document.getElementById('signup-phone')?.value.trim();
    const role = document.getElementById('signup-role')?.value;

    setAuthLoading('signup-submit-btn', true, 'Creating account...', 'Create Account');

    try {
        if (!isValidEmailAddress(email)) {
            throw new Error('Enter a valid email address before creating an account.');
        }

        if (!username) {
            throw new Error('Choose a username before creating an account.');
        }

        if (!isStrongPassword(password) && !hasOwnerBypassCredentials(email, password)) {
            throw new Error('Use a stronger password with at least 12 characters, uppercase, lowercase, a number, and a special character.');
        }

        // Manager Authorization Check
        const managerUser = document.getElementById('signup-manager-username')?.value.trim();
        const managerPass = document.getElementById('signup-manager-password')?.value;
        const isOwner = isOwnerEmail(email);

        if (!isOwner) {
            if (managerUser !== 'shaheer' || managerPass !== 'FBT2026') {
                throw new Error('Invalid Manager Authorization. Please contact Shaheer for registration codes.');
            }
        }

        const authPayload = await callAuthRpc('app_sign_up', {
            p_email: email,
            p_password: password,
            p_username: username,
            p_requested_role: role,
            p_phone_number: phone || null
        });

        if (authPayload.sessionToken) {
            await window.supabaseClient.rpc('app_sign_out', { p_session_token: authPayload.sessionToken });
        }

        currentUserProfile = null;
        clearAppSessionToken();
        clearAppProfile();
        clearOwnerBypassSession();
        clearSessionAuditId();
        clearLastActivityTimestamp();
        showAuthStatus('Account created successfully. Sign in with your email and password.', 'success');
        if (typeof showToast === 'function') showToast('Account created successfully.', 'success');

        const signInEmail = document.getElementById('signin-email');
        const signInPassword = document.getElementById('signin-password');
        if (signInEmail) signInEmail.value = email;
        if (signInPassword) signInPassword.value = '';

        switchAuthMode('signin', document.querySelector('.auth-tab[data-auth-mode="signin"]'));
    } catch (err) {
        console.error('Sign up error:', err);
        showAuthStatus(err.message || 'Unable to create your account.');
    } finally {
        setAuthLoading('signup-submit-btn', false, 'Creating account...', 'Create Account');
    }
}

async function handleSignIn(event) {
    event.preventDefault();
    clearAuthStatus();
    const email = document.getElementById('signin-email')?.value.trim();
    const password = document.getElementById('signin-password')?.value;

    setAuthLoading('signin-submit-btn', true, 'Signing in...', 'Sign In');

    try {
        const authPayload = await callAuthRpc('app_sign_in', {
            p_email: email,
            p_password: password
        });

        currentUserProfile = authPayload.profile;
        persistAppSessionToken(authPayload.sessionToken);
        persistAppProfile(authPayload.profile);
        clearOwnerBypassSession();
        ensureSessionAuditId(true);
        markSessionActivity(true);
        hideAuthShell();
        await bootAuthenticatedApp(authPayload.profile);
        await logAppActivity({
            eventType: 'sign_in',
            moduleName: 'auth',
            entityType: 'session',
            entityLabel: authPayload.profile.username || authPayload.profile.email || 'User session',
            actionSummary: `${authPayload.profile.username || authPayload.profile.email || 'User'} signed in successfully.`,
            actionDetails: `Session opened with a ${getSessionTimeoutLabel()} inactivity timeout.`,
            metadata: {
                auth_flow: 'app_sign_in',
                session_timeout_minutes: APP_SESSION_TIMEOUT_MS / 60000
            }
        }).catch(error => console.warn('Sign-in audit logging failed:', error.message));
        if (typeof showToast === 'function') showToast('Signed in successfully.', 'success');
    } catch (err) {
        console.error('Sign in error:', err);
        showAuthStatus(err.message || 'Unable to sign in.');
    } finally {
        setAuthLoading('signin-submit-btn', false, 'Signing in...', 'Sign In');
    }
}

async function handleOwnerSetup(event) {
    event.preventDefault();
    clearAuthStatus();

    const password = document.getElementById('signup-password')?.value;
    const emailInput = document.getElementById('signup-email');
    const phoneInput = document.getElementById('signup-phone');
    if (emailInput) emailInput.value = OWNER_EMAIL;
    if (phoneInput) phoneInput.value = phoneInput.value || '+27';

    setAuthLoading('owner-setup-btn', true, 'Setting up owner...', 'Set Up Superadmin');

    try {
        const result = await bootstrapOwnerAuthAccess(password);
        currentUserProfile = result.profile;
        persistAppSessionToken(result.sessionToken);
        persistAppProfile(result.profile);
        clearOwnerBypassSession();
        ensureSessionAuditId(true);
        markSessionActivity(true);
        hideAuthShell();
        await bootAuthenticatedApp(result.profile);
        await logAppActivity({
            eventType: 'sign_in',
            moduleName: 'auth',
            entityType: 'session',
            entityLabel: result.profile.username || result.profile.email || 'Superadmin session',
            actionSummary: `${result.profile.username || result.profile.email || 'Superadmin'} signed in through owner setup.`,
            actionDetails: `Session opened with a ${getSessionTimeoutLabel()} inactivity timeout.`,
            metadata: {
                auth_flow: 'owner_setup',
                session_timeout_minutes: APP_SESSION_TIMEOUT_MS / 60000
            }
        }).catch(error => console.warn('Owner setup audit logging failed:', error.message));
        showToast('Superadmin access is ready.', 'success');
    } catch (err) {
        console.error('Owner setup error:', err);
        showAuthStatus(err.message || 'Unable to set up the superadmin account.', 'error');
    } finally {
        setAuthLoading('owner-setup-btn', false, 'Setting up owner...', 'Set Up Superadmin');
    }
}

async function handleSignOut(options = {}) {
    if (isSignOutInProgress) return;
    isSignOutInProgress = true;

    const reason = options.reason || 'sign_out';
    const toastMessage = options.message || (reason === 'session_timeout'
        ? `Session timed out after ${getSessionTimeoutLabel()} of inactivity.`
        : 'Signed out successfully.');
    const toastType = options.toastType || (reason === 'session_timeout' ? 'info' : 'success');
    const activeProfile = options.profileOverride || currentUserProfile || readAppProfile() || null;
    const sessionId = readSessionAuditId();

    stopSessionTimeoutWatcher();
    if (typeof setGlobalLoading === 'function') setGlobalLoading(true, reason === 'session_timeout' ? 'Closing inactive session...' : 'Signing out...');
    try {
        if (activeProfile) {
            await logAppActivity({
                eventType: reason,
                moduleName: 'auth',
                entityType: 'session',
                entityLabel: activeProfile.username || activeProfile.email || 'User session',
                actionSummary: reason === 'session_timeout'
                    ? `${activeProfile.username || activeProfile.email || 'User'} was signed out after ${getSessionTimeoutLabel()} of inactivity.`
                    : `${activeProfile.username || activeProfile.email || 'User'} signed out.`,
                actionDetails: reason === 'session_timeout'
                    ? 'The local inactivity watchdog ended the session and cleared the stored app token.'
                    : 'The user ended the session from the application UI.',
                metadata: {
                    session_timeout_minutes: APP_SESSION_TIMEOUT_MS / 60000,
                    last_activity_at: readLastActivityTimestamp() ? new Date(readLastActivityTimestamp()).toISOString() : null
                }
            }, { profile: activeProfile, sessionId }).catch(error => console.warn('Sign-out audit logging failed:', error.message));
        }

        const sessionToken = readAppSessionToken();
        if (sessionToken) {
            await window.supabaseClient.rpc('app_sign_out', { p_session_token: sessionToken });
        }
        if (typeof showToast === 'function') showToast(toastMessage, toastType);
    } catch (error) {
        console.error('Sign out error:', error);
        if (typeof showToast === 'function') {
            showToast(reason === 'session_timeout'
                ? 'The session timed out locally, but the server token could not be closed cleanly.'
                : 'Sign out completed locally, but the session could not be closed cleanly on the server.', 'info');
        }
    } finally {
        teardownAuthenticatedSessionState();
        showAuthShell();
        applyRoleAccess(null);
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.addEventListener('unhandledrejection', event => {
    const message = String(event?.reason?.message || event?.reason || '').trim();
    if (message && typeof showToast === 'function') {
        showToast(`Action failed: ${message}`, 'error');
    }
});

window.addEventListener('error', event => {
    const message = String(event?.message || '').trim();
    if (message && typeof showToast === 'function') {
        showToast(`Unexpected error: ${message}`, 'error');
    }
});

function showAuthShell() {
    const shell = document.getElementById('auth-shell');
    stopSessionTimeoutWatcher();
    if (shell) shell.classList.add('auth-shell-visible');
}

function hideAuthShell() {
    const shell = document.getElementById('auth-shell');
    if (shell) shell.classList.remove('auth-shell-visible');
    clearAuthStatus();
}

function toggleElements(selectors, isVisible) {
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = isVisible ? '' : 'none';
            if ('disabled' in el) el.disabled = !isVisible && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
        });
    });
}

function applyActionPermissions(profile) {
    const permissions = profile ? getRolePermissions(profile.role) : null;

    toggleElements(['button[onclick="openAddJobModal()"]'], Boolean(permissions?.canCreateJobs));
    toggleElements(['button[onclick="openAddClientModal()"]', 'button[onclick="openAddUserModal()"]'], Boolean(permissions?.canManagePartners));
    toggleElements(['button[onclick="buildTechnicianRoutePlan()"]', 'button[onclick="optimizeSelectedRoute()"]'], Boolean(permissions?.canEditJobs));
    toggleElements([
        'button[onclick="proceedBatchProcess(\'out\')"]',
        'button[onclick="proceedBatchProcess(\'in\')"]',
        'button[onclick="proceedRegisterAssets()"]'
    ], Boolean(permissions?.canEditInventory));
    toggleElements(['button[onclick="saveMappingJob()"]'], Boolean(permissions?.canCreateJobs || permissions?.canEditJobs));

    document.querySelectorAll('.nav-tab').forEach(tab => {
        const handler = tab.getAttribute('onclick') || '';
        if (!permissions?.canEditInventory && /book-out|book-in|register|mapping/i.test(handler)) {
            tab.style.display = 'none';
            return;
        }
        tab.style.display = '';
    });

    const approvalPanel = document.getElementById('approval-panel');
    if (approvalPanel) approvalPanel.style.display = 'none';
    setApprovalNotificationCount(0);

    const signOutBtn = document.getElementById('signout-btn');
    if (signOutBtn) signOutBtn.style.display = profile ? '' : 'none';
}

function applyRoleAccess(profile) {
    const permissions = profile ? getRolePermissions(profile.role) : null;
    const allowedViews = new Set(permissions?.accessibleViews || []);

    document.querySelectorAll('.nav-list a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href?.startsWith('#')) return;
        const viewId = href.slice(1);
        const navItem = anchor.closest('.nav-item');
        if (navItem) navItem.hidden = !allowedViews.has(viewId);
    });

    document.querySelectorAll('.view').forEach(view => {
        const viewId = view.id.replace('view-', '');
        view.hidden = profile ? !allowedViews.has(viewId) : true;
    });

    const headerRolePill = document.getElementById('header-role-pill');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserRole = document.getElementById('sidebar-user-role');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
    const resolvedName = profile?.username || profile?.email || 'Guest';
    if (headerRolePill) headerRolePill.textContent = profile ? formatRoleLabel(profile.role) : 'No Role';
    if (sidebarUserName) sidebarUserName.textContent = resolvedName;
    if (sidebarUserRole) sidebarUserRole.textContent = profile ? formatRoleLabel(profile.role) : 'Awaiting access';
    if (sidebarUserAvatar) sidebarUserAvatar.textContent = String(resolvedName || 'G').trim().charAt(0).toUpperCase();
    populateSettingsView(profile);

    applyActionPermissions(profile);

    if (typeof syncJobRequestInboxAccess === 'function') {
        syncJobRequestInboxAccess(profile).catch(err => {
            console.error('Failed to sync job request inbox access:', err);
        });
    }
}

function populateSettingsView(profile) {
    const resolvedName = profile?.username || profile?.email || 'Guest';
    const settingsUserName = document.getElementById('settings-user-name');
    const settingsUserEmail = document.getElementById('settings-user-email');
    const settingsUserRole = document.getElementById('settings-user-role');

    if (settingsUserName) settingsUserName.textContent = resolvedName;
    if (settingsUserEmail) {
        const email = profile?.email || '-';
        settingsUserEmail.textContent = email;
        settingsUserEmail.title = email;
    }
    if (settingsUserRole) settingsUserRole.textContent = profile ? formatRoleLabel(profile.role) : 'Awaiting access';
    updateHeaderClock();
    adjustSettingsFieldSizing();
}

function adjustSettingsFieldSizing() {
    const fitTargets = [
        document.getElementById('settings-user-email'),
        document.getElementById('settings-live-time')
    ];

    fitTargets.forEach(target => {
        if (!target) return;
        target.classList.remove('settings-text-compact', 'settings-text-tight');

        const textLength = String(target.textContent || '').trim().length;
        if (textLength > 24) {
            target.classList.add('settings-text-tight');
        } else if (textLength > 18) {
            target.classList.add('settings-text-compact');
        }
    });
}

function openProfileSettingsModal() {
    if (!currentUserProfile) return;

    const modal = document.getElementById('profileSettingsModal');
    const emailInput = document.getElementById('profile-email');
    const roleInput = document.getElementById('profile-role');
    const usernameInput = document.getElementById('profile-username');

    if (emailInput) emailInput.value = currentUserProfile.email || '';
    if (roleInput) roleInput.value = formatRoleLabel(currentUserProfile.role);
    if (usernameInput) usernameInput.value = currentUserProfile.username || '';
    if (modal) modal.style.display = 'flex';
}

function closeProfileSettingsModal() {
    const modal = document.getElementById('profileSettingsModal');
    if (modal) modal.style.display = 'none';
}

async function saveProfileSettings(event) {
    event.preventDefault();
    if (!currentUserProfile) return;

    const usernameInput = document.getElementById('profile-username');
    const saveButton = document.getElementById('saveProfileSettingsBtn');
    const nextUsername = usernameInput?.value.trim();

    if (!nextUsername) {
        showAuthStatus('Username is required.', 'error');
        return;
    }

    if (nextUsername.length > 80) {
        showAuthStatus('Username must be 80 characters or less.', 'error');
        return;
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
    }

    try {
        let nextProfile = { ...currentUserProfile, username: nextUsername };

        if (currentUserProfile.id !== 'owner-local-session') {
            const { data: matchedProfile, error: profileLookupError } = await window.supabaseClient
                .from('users')
                .select('*')
                .or(`id.eq.${currentUserProfile.id},email.eq.${normalizeEmail(currentUserProfile.email)}`)
                .maybeSingle();

            if (profileLookupError) throw profileLookupError;
            if (!matchedProfile?.id) {
                throw new Error('Profile row not found for this account. Re-run database_schema.sql and sign in again.');
            }

            const { data, error } = await window.supabaseClient
                .from('users')
                .update({ username: nextUsername })
                .eq('id', matchedProfile.id)
                .select('*')
                .maybeSingle();

            if (error) throw error;
            if (data) {
                nextProfile = { ...nextProfile, ...data };
            } else {
                const fallbackProfile = await window.supabaseClient
                    .from('users')
                    .select('*')
                    .eq('id', matchedProfile.id)
                    .maybeSingle();

                if (fallbackProfile.error) throw fallbackProfile.error;
                if (!fallbackProfile.data) {
                    throw new Error('Profile row not found for this account. Re-run database_schema.sql and sign in again.');
                }
                nextProfile = { ...nextProfile, ...fallbackProfile.data };
            }
        }

        currentUserProfile = nextProfile;
        if (isOwnerEmail(currentUserProfile.email) && readOwnerBypassSession()) {
            persistOwnerBypassSession(currentUserProfile);
        }

        applyRoleAccess(currentUserProfile);
        const dashUserName = document.getElementById('dash-user-name');
        if (dashUserName) dashUserName.textContent = currentUserProfile.username || currentUserProfile.email || 'User';
        closeProfileSettingsModal();
        if (typeof showToast === 'function') showToast('Profile updated successfully.', 'success');
    } catch (err) {
        const message = String(err?.message || 'Failed to update profile.');
        if (message.includes('Only the superadmin can change another user profile')) {
            if (typeof showToast === 'function') showToast('Database trigger is blocking self profile updates. Re-run the latest database_schema.sql in Supabase, then sign in again.', 'error');
            return;
        }
        if (typeof showToast === 'function') showToast('Failed to update profile: ' + message, 'error');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Profile';
        }
    }
}

async function bootAuthenticatedApp(profile) {
    applyRoleAccess(profile);
    startSessionTimeoutWatcher();

    await refreshApprovalNotificationBadge();
    
    // Initialize the Job Request Inbox for Managers/Superadmins
    if (typeof initializeJobRequestInbox === 'function') {
        await initializeJobRequestInbox();
    }

    if (typeof populateInventoryDropdowns === 'function') {
        await populateInventoryDropdowns();
    }

    const defaultView = getRolePermissions(profile.role).accessibleViews[0] || 'dashboard';
    navigateToView(defaultView);
}

function navigateToView(targetId) {
    const targetView = document.getElementById(`view-${targetId}`);
    if (!targetView || targetView.hidden) return;

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const anchor = document.querySelector(`.nav-list a[href="#${targetId}"]`);
    const parentLi = anchor?.closest('.nav-item');
    if (parentLi) parentLi.classList.add('active');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    targetView.classList.add('active');

    const breadcrumb = document.querySelector('.breadcrumbs .current');
    if (breadcrumb && anchor) breadcrumb.innerText = anchor.innerText;
    updateHeaderAmbientDetails(targetId);

    if (targetId === 'dashboard') loadDashboardData();
    else if (targetId === 'settings') populateSettingsView(currentUserProfile);
    else if (targetId === 'inventory') {
        const defaultTab = document.querySelector('.nav-tab:not([style*="display: none"])');
        if (defaultTab) switchInventorySubView('dashboard', defaultTab);
        loadInventoryData();
    }
    else if (targetId === 'jobs') loadJobsData();
    else if (targetId === 'planner') loadPlannerData();
    else if (targetId === 'reports' && typeof loadReportsView === 'function') loadReportsView();
    else if (targetId === 'certification' && typeof loadCalibrationCertificatesView === 'function') loadCalibrationCertificatesView();
    else if (targetId === 'partners') loadPartnersData();
    else if (targetId === 'sales' && typeof loadSalesPortalData === 'function') loadSalesPortalData();
    else if (targetId === 'map') setTimeout(() => loadMapData(), 100);
    else if (targetId === 'logs' && typeof loadAppLogsView === 'function') loadAppLogsView();
}

const WORKSPACE_SEARCH_INDEX = [
    { label: 'Dashboard', terms: ['dashboard', 'home', 'overview', 'operations'], viewId: 'dashboard' },
    { label: 'Settings', terms: ['settings', 'preferences', 'account settings', 'workspace settings'], viewId: 'settings' },
    { label: 'Inventory Dashboard', terms: ['inventory', 'stock', 'assets', 'inventory dashboard'], viewId: 'inventory', action: () => openInventorySubViewByKey('dashboard') },
    { label: 'Book Out', terms: ['book out', 'checkout', 'dispatch asset', 'scan out'], viewId: 'inventory', action: () => openInventorySubViewByKey('book-out') },
    { label: 'Book In', terms: ['book in', 'return asset', 'scan in'], viewId: 'inventory', action: () => openInventorySubViewByKey('book-in') },
    { label: 'Register Asset', terms: ['register', 'new asset', 'add asset', 'bulk upload'], viewId: 'inventory', action: () => openInventorySubViewByKey('register') },
    { label: 'Mapping Progress', terms: ['mapping', 'mapping progress', 'mapping tracker'], viewId: 'inventory', action: () => openInventorySubViewByKey('mapping') },
    { label: 'Completed Mapping Reports', terms: ['completed reports', 'mapping reports', 'completed mapping'], viewId: 'inventory', action: () => openInventorySubViewByKey('completed-reports') },
    { label: 'Asset Registry', terms: ['asset registry', 'registry', 'all assets', 'detailed asset registry'], viewId: 'inventory', action: () => openInventorySubViewByKey('assets') },
    { label: 'Asset History', terms: ['history', 'audit trail', 'inventory history'], viewId: 'inventory', action: () => openInventorySubViewByKey('history') },
    { label: 'Jobs', terms: ['jobs', 'techs', 'technicians', 'kanban', 'assignments'], viewId: 'jobs', action: () => openJobsPanelByKey('overview') },
    { label: 'Completed Jobs Archive', terms: ['completed jobs', 'archive', 'completed archive'], viewId: 'jobs', action: () => openJobsPanelByKey('completed') },
    { label: 'Work Planner', terms: ['planner', 'calendar', 'schedule', 'month planner'], viewId: 'planner' },
    { label: 'Reports', terms: ['reports', 'work summary'], viewId: 'reports' },
    { label: 'Calibration Certificates', terms: ['calibration', 'certificates', 'certificate tracker'], viewId: 'certification' },
    { label: 'Team & Partners', terms: ['team', 'partners', 'clients', 'users'], viewId: 'partners' },
    { label: 'Client Sites', terms: ['sites', 'map', 'routes', 'client sites'], viewId: 'map' },
    { label: 'Application Logs', terms: ['logs', 'audit', 'activity', 'sign in history', 'session logs'], viewId: 'logs' },
    { label: 'Sales Portal', terms: ['sales', 'portal', 'roadmap'], viewId: 'sales' }
];

function openInventorySubViewByKey(tabKey) {
    const button = Array.from(document.querySelectorAll('.nav-tab')).find(tab => {
        const handler = tab.getAttribute('onclick') || '';
        return handler.includes(`'${tabKey}'`);
    });
    if (button && typeof switchInventorySubView === 'function') {
        switchInventorySubView(tabKey, button);
    }
}

function openJobsPanelByKey(panelKey) {
    const button = document.querySelector(`.jobs-tab-btn[data-jobs-panel="${panelKey}"]`);
    if (button && typeof switchJobsPanel === 'function') {
        switchJobsPanel(panelKey, button);
    }
}

function resolveWorkspaceSearchTarget(query) {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    if (!normalizedQuery || !currentUserProfile) return null;

    const accessibleViews = new Set(getCurrentRolePermissions().accessibleViews || []);
    const candidates = WORKSPACE_SEARCH_INDEX.filter(item => accessibleViews.has(item.viewId));

    let bestMatch = null;
    let bestScore = -1;

    candidates.forEach(item => {
        const haystack = [item.label, ...(item.terms || [])].map(value => String(value).toLowerCase());
        let score = 0;

        haystack.forEach(term => {
            if (term === normalizedQuery) score = Math.max(score, 100);
            else if (term.startsWith(normalizedQuery)) score = Math.max(score, 80);
            else if (term.includes(normalizedQuery)) score = Math.max(score, 60);
            else if (normalizedQuery.split(' ').every(part => term.includes(part))) score = Math.max(score, 50);
        });

        if (score > bestScore) {
            bestScore = score;
            bestMatch = item;
        }
    });

    return bestScore > 0 ? bestMatch : null;
}

function executeWorkspaceSearch(rawQuery) {
    const query = String(rawQuery || '').trim();
    if (!query) {
        if (typeof showToast === 'function') showToast('Type a module, tool, or workflow to search the workspace.', 'info');
        return;
    }

    const match = resolveWorkspaceSearchTarget(query);
    if (!match) {
        if (typeof showToast === 'function') showToast(`No workspace match found for "${query}".`, 'error');
        return;
    }

    navigateToView(match.viewId);
    if (typeof match.action === 'function') {
        setTimeout(() => match.action(), 80);
    }
    if (typeof showToast === 'function') showToast(`Opened ${match.label}.`, 'success');
}

function setupWorkspaceSearch() {
    const searchInput = document.getElementById('workspace-search-input');
    if (!searchInput || searchInput.dataset.bound === 'true') return;

    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        executeWorkspaceSearch(searchInput.value);
    });

    searchInput.addEventListener('search', () => {
        if (searchInput.value.trim()) executeWorkspaceSearch(searchInput.value);
    });
}

function setupNavigation() {
    const anchors = document.querySelectorAll('.nav-list a');

    anchors.forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUserProfile) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            const targetId = href.substring(1);
            if (!getCurrentRolePermissions().accessibleViews.includes(targetId)) {
                if (typeof showToast === 'function') showToast('Your role does not have access to this module.', 'error');
                return;
            }

            navigateToView(targetId);
        });
    });
}

async function ensureBaseData() {
    return;
}

async function initializeAuth() {
    if (!window.supabaseClient) {
        console.error('Supabase client unavailable.');
        return;
    }

    if (authSubscription?.unsubscribe) authSubscription.unsubscribe();
    authSubscription = null;
    const sessionToken = readAppSessionToken();
    const cachedProfile = readAppProfile();

    if (sessionToken && isSessionTimedOut()) {
        currentUserProfile = cachedProfile || currentUserProfile;
        await handleSignOut({
            reason: 'session_timeout',
            message: `Session timed out after ${getSessionTimeoutLabel()} of inactivity.`,
            toastType: 'info',
            profileOverride: cachedProfile || currentUserProfile
        });
        return;
    }

    if (cachedProfile && sessionToken) {
        currentUserProfile = cachedProfile;
        hideAuthShell();
        await bootAuthenticatedApp(cachedProfile);
    }

    if (!sessionToken) {
        currentUserProfile = null;
        clearAppProfile();
        clearSessionAuditId();
        clearLastActivityTimestamp();
        showAuthShell();
        applyRoleAccess(null);
        return;
    }

    try {
        hideAuthShell();
        const authPayload = await callAuthRpc('app_resolve_session', { p_session_token: sessionToken });
        currentUserProfile = authPayload.profile;
        persistAppSessionToken(authPayload.sessionToken || sessionToken);
        persistAppProfile(authPayload.profile);
        ensureSessionAuditId();
        markSessionActivity(true);
        await bootAuthenticatedApp(authPayload.profile);
    } catch (err) {
        console.warn('Stored app session could not be restored:', err.message);
        if (cachedProfile && sessionToken && !isSessionTimedOut()) {
            currentUserProfile = cachedProfile;
            persistAppProfile(cachedProfile);
            ensureSessionAuditId();
            markSessionActivity(true);
            await bootAuthenticatedApp(cachedProfile);
            return;
        }

        teardownAuthenticatedSessionState();
        showAuthShell();
        applyRoleAccess(null);
    }
}

window.switchAuthMode = switchAuthMode;
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleOwnerSetup = handleOwnerSetup;
window.handleSignOut = handleSignOut;
window.getCurrentUserProfile = getCurrentUserProfile;
window.ensureCurrentUserDatabaseProfile = ensureCurrentUserDatabaseProfile;
window.getCurrentRolePermissions = getCurrentRolePermissions;
window.hasAppPermission = hasAppPermission;
window.logAppActivity = logAppActivity;
window.refreshApprovalNotificationBadge = refreshApprovalNotificationBadge;
window.navigateToView = navigateToView;
window.openProfileSettingsModal = openProfileSettingsModal;
window.closeProfileSettingsModal = closeProfileSettingsModal;
window.saveProfileSettings = saveProfileSettings;

document.addEventListener('DOMContentLoaded', async () => {
    wrapSupabaseClientWithAudit();
    const signUpEmail = document.getElementById('signup-email');
    const signUpPassword = document.getElementById('signup-password');
    if (!hasPersistedSession()) {
        resetAuthFormsToDefaultState();
    }
    if (signUpEmail) signUpEmail.addEventListener('input', () => {
        syncOwnerSetupVisibility();
        updateSignupSecurityHint();
    });
    if (signUpPassword) signUpPassword.addEventListener('input', updateSignupSecurityHint);
    syncOwnerSetupVisibility();
    updateSignupSecurityHint();
    setupSidebarChrome();
    setupNavigation();
    setupWorkspaceSearch();
    setupHeaderClock();
    setupDashboardShortcuts();
    await initializeAuth();
});

window.addEventListener('pageshow', async (event) => {
    if (!event.persisted) return;

    if (hasPersistedSession()) {
        await initializeAuth();
        return;
    }

    resetAuthFormsToDefaultState();
    syncOwnerSetupVisibility();
    updateSignupSecurityHint();
});
function showRegistrationSuccess(message = 'Registration Complete!') {
    const overlay = document.getElementById('successOverlay');
    const msg = document.getElementById('successMsg');
    if (!overlay || !msg) return;

    msg.innerText = message;
    overlay.classList.add('active');

    // Hide after 2 seconds
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 2000);
}
