let salesOpportunities = [];
let salesClients = [];
let salesActivities = [];
let salesClientDocuments = [];
let salesReportTemplates = [];
let salesFiltersBound = false;
let salesPortalLoadRequestId = 0;
let salesWorkspaceBound = false;
let salesOpportunityActionBound = false;
let activeSalesSection = 'pipeline';
let activeSalesClientId = '';
let salesSchemaCapabilities = {
    advancedOpportunityFields: true,
    salesReportTemplatesTable: true,
    salesContactsTable: true
};
let salesSchemaChecked = false;
const SALES_REPORT_TEMPLATE_STORAGE_KEY = 'fairbridge-sales-report-templates';

const SALES_STAGE_ORDER = ['Lead', 'Qualified', 'Quoted', 'Negotiation', 'Won', 'Lost'];

function parseSalesClientContacts(contactPerson, contactEmail, contactPhone) {
    const names = String(contactPerson || '').split(/\r?\n/).map(item => item.trim());
    const emails = String(contactEmail || '').split(/\r?\n/).map(item => item.trim());
    const phones = String(contactPhone || '').split(/\r?\n/).map(item => item.trim());
    const total = Math.max(names.length, emails.length, phones.length);
    const contacts = [];

    for (let index = 0; index < total; index += 1) {
        const contact = {
            name: names[index] || '',
            email: emails[index] || '',
            phone: phones[index] || ''
        };
        if (contact.name || contact.email || contact.phone) contacts.push(contact);
    }

    return contacts;
}

function getSalesPrimaryClientContact(client) {
    return parseSalesClientContacts(client?.contact_person, client?.contact_email, client?.contact_phone)[0] || null;
}

function getSalesClientContactSummary(client) {
    const contacts = parseSalesClientContacts(client?.contact_person, client?.contact_email, client?.contact_phone);
    if (!contacts.length) return client?.derivedFromOpportunity ? 'Prospect account' : 'No primary contact';
    const primary = contacts[0];
    const label = primary.name || primary.email || primary.phone || 'Primary contact';
    return contacts.length > 1 ? `${label} (+${contacts.length - 1} more)` : label;
}

function getSalesPortalPermission() {
    return typeof hasAppPermission === 'function' ? hasAppPermission('canUseSalesPortal') : true;
}

async function detectSalesSchemaCapabilities() {
    const [opportunityProbe, templatesProbe, contactsProbe] = await Promise.all([
        window.supabaseClient
            .from('sales_opportunities')
            .select('id, quote_expiry_date, invoice_status, deal_temperature, next_action_owner')
            .limit(1),
        window.supabaseClient
            .from('sales_report_templates')
            .select('id')
            .limit(1),
        window.supabaseClient
            .from('sales_contacts')
            .select('id')
            .limit(1)
    ]);

    salesSchemaCapabilities = {
        advancedOpportunityFields: !opportunityProbe.error,
        salesReportTemplatesTable: !templatesProbe.error,
        salesContactsTable: !contactsProbe.error
    };
    salesSchemaChecked = true;
}

function getSalesSchemaMissingItems() {
    const missing = [];
    if (!salesSchemaCapabilities.advancedOpportunityFields) missing.push('advanced sales opportunity fields');
    if (!salesSchemaCapabilities.salesReportTemplatesTable) missing.push('sales report templates table');
    if (!salesSchemaCapabilities.salesContactsTable) missing.push('sales contacts table');
    return missing;
}

function renderSalesMigrationStatus() {
    const banner = document.getElementById('sales-migration-banner');
    if (!banner) return;
    if (!salesSchemaChecked) {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return;
    }
    const missing = getSalesSchemaMissingItems();
    if (!missing.length) {
        banner.style.display = 'none';
        banner.innerHTML = '';
        return;
    }
    banner.style.display = 'block';
    banner.innerHTML = `Schema rollout pending: ${escapeSalesHtml(missing.join(', '))}. The portal is running in compatibility mode until migration is applied.`;
}

async function loadSalesPortalData() {
    if (!getSalesPortalPermission()) {
        if (typeof showToast === 'function') showToast('Your role does not have access to the Sales Portal.', 'error');
        return;
    }

    const requestId = ++salesPortalLoadRequestId;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading sales portal...');
        if (!salesSchemaChecked) {
            await detectSalesSchemaCapabilities();
        }

        const [
            { data: opportunities, error: salesError },
            { data: clients, error: clientError },
            { data: activities, error: activityError },
            clientReportsResult,
            reportTemplatesResult
        ] = await Promise.all([
            window.supabaseClient.from('sales_opportunities').select('*').order('created_at', { ascending: false }),
            window.supabaseClient.from('clients').select('id, client_name, company_name, industry, contact_person, contact_phone, contact_email, status').order('client_name', { ascending: true }),
            window.supabaseClient.from('sales_activities').select('*').order('created_at', { ascending: false }),
            fetchSalesClientReports(),
            fetchSalesReportTemplates()
        ]);

        if (salesError) throw salesError;
        if (clientError) throw clientError;
        if (activityError) throw activityError;
        if (requestId !== salesPortalLoadRequestId) return;

        salesOpportunities = opportunities || [];
        salesClients = clients || [];
        salesActivities = activities || [];
        salesClientDocuments = clientReportsResult?.data || [];
        salesReportTemplates = reportTemplatesResult?.data || [];

        bindSalesPortalFilters();
        bindSalesWorkspaceInteractions();
        populateSalesClientDropdown();
        populateSalesActivityOpportunityDropdown();
        populateSalesDocumentClientDropdown();
        populateSalesReportClientDropdown();
        if (!document.getElementById('sales-opportunity-id')?.value) {
            resetSalesOpportunityForm();
        }
        ensureActiveSalesClient();
        renderSalesPortal();
        renderSalesMigrationStatus();
    } catch (error) {
        console.error('Sales portal load error:', error);
        if (typeof showToast === 'function') showToast('Failed to load sales portal: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function fetchSalesClientReports() {
    const scopedResult = await window.supabaseClient
        .from('client_reports')
        .select('*')
        .eq('workspace_module', 'sales')
        .order('created_at', { ascending: false });

    if (!scopedResult.error) return { data: scopedResult.data || [] };
    if (!isSalesSchemaColumnError(scopedResult.error, ['workspace_module'])) {
        console.warn('Sales client reports load error:', scopedResult.error.message || scopedResult.error);
        return { data: [] };
    }

    const fallbackResult = await window.supabaseClient
        .from('client_reports')
        .select('*')
        .order('created_at', { ascending: false });

    if (fallbackResult.error) {
        console.warn('Legacy sales client reports load error:', fallbackResult.error.message || fallbackResult.error);
        return { data: [] };
    }

    return {
        data: (fallbackResult.data || []).filter(item => isSalesClientReportRecord(item))
    };
}

async function fetchSalesReportTemplates() {
    if (salesSchemaChecked && !salesSchemaCapabilities.salesReportTemplatesTable) {
        return { data: readLocalSalesReportTemplates() };
    }
    const dbResult = await window.supabaseClient
        .from('sales_report_templates')
        .select('*')
        .order('updated_at', { ascending: false });

    if (!dbResult.error) return { data: dbResult.data || [] };

    console.warn('Sales report templates table unavailable, using local fallback:', dbResult.error.message || dbResult.error);
    return { data: readLocalSalesReportTemplates() };
}

function isSalesClientReportRecord(item) {
    return String(item?.workspace_module || '').toLowerCase() === 'sales'
        || String(item?.imported_batch_label || '').toLowerCase() === 'sales_portal'
        || String(item?.document_category || '').toLowerCase().startsWith('sales')
        || ['invoice', 'proposal', 'quote_pack'].includes(String(item?.document_category || '').toLowerCase());
}

function isSalesSchemaColumnError(error, columnNames = []) {
    const message = String(error?.message || error?.details || '').toLowerCase();
    return columnNames.some(columnName => message.includes(String(columnName).toLowerCase()));
}

function readLocalSalesReportTemplates() {
    try {
        const raw = window.localStorage.getItem(SALES_REPORT_TEMPLATE_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Could not read local sales report templates:', error);
        return [];
    }
}

function writeLocalSalesReportTemplates(items) {
    try {
        window.localStorage.setItem(SALES_REPORT_TEMPLATE_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
        console.warn('Could not write local sales report templates:', error);
    }
}

function bindSalesPortalFilters() {
    if (salesFiltersBound) return;

    const searchInput = document.getElementById('sales-search-input');
    const stageFilter = document.getElementById('sales-stage-filter');
    const ownerFilter = document.getElementById('sales-owner-filter');
    const priorityFilter = document.getElementById('sales-priority-filter');
    const activityOpportunitySelect = document.getElementById('sales-activity-opportunity-id');

    [searchInput, stageFilter, ownerFilter, priorityFilter].forEach(input => {
        if (!input) return;
        input.addEventListener('input', renderSalesPortal);
        input.addEventListener('change', renderSalesPortal);
    });

    if (activityOpportunitySelect) {
        activityOpportunitySelect.addEventListener('change', renderSalesActivityLog);
    }

    salesFiltersBound = true;
}

function bindSalesWorkspaceInteractions() {
    if (salesWorkspaceBound) return;

    document.querySelectorAll('[data-sales-section]').forEach(button => {
        button.addEventListener('click', () => switchSalesSection(button.getAttribute('data-sales-section') || 'pipeline'));
    });
    ['sales-client-id', 'sales-doc-client-id', 'sales-report-client-id'].forEach(id => {
        const field = document.getElementById(id);
        if (field) field.addEventListener('change', toggleSalesProspectClientInputs);
    });
    bindSalesOpportunityTableActions();

    salesWorkspaceBound = true;
}

function bindSalesOpportunityTableActions() {
    if (salesOpportunityActionBound) return;
    const tbody = document.getElementById('sales-opportunity-table-body');
    if (!tbody) return;

    tbody.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('[data-sales-action]') : null;
        if (!target) return;
        const action = target.getAttribute('data-sales-action');
        const id = target.getAttribute('data-sales-id') || '';
        if (!id) return;

        if (action === 'edit') {
            editSalesOpportunity(id);
        } else if (action === 'delete') {
            deleteSalesOpportunity(id);
        } else if (action === 'handover') {
            handoverSalesOpportunity(id);
        }
    });

    salesOpportunityActionBound = true;
}

function populateSalesClientDropdown() {
    const select = document.getElementById('sales-client-id');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Prospect / not linked yet</option>';

    getCurrentSalesClients().forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.label;
        select.appendChild(option);
    });
    select.innerHTML += '<option value="__other__">Prospective / Unlisted Client</option>';

    if (currentValue) {
        select.value = currentValue;
    }
    toggleSalesProspectClientInputs();
}

function populateSalesActivityOpportunityDropdown() {
    const select = document.getElementById('sales-activity-opportunity-id');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Select opportunity</option>';

    salesOpportunities.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.company_name || 'Account'} - ${item.opportunity_title || 'Opportunity'}`;
        select.appendChild(option);
    });

    if (currentValue && salesOpportunities.some(item => item.id === currentValue)) {
        select.value = currentValue;
    }
}

function populateSalesDocumentClientDropdown() {
    const select = document.getElementById('sales-doc-client-id');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Select client workspace</option>';

    getCurrentSalesClients().forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.label;
        select.appendChild(option);
    });
    select.innerHTML += '<option value="__other__">Prospective / Unlisted Client</option>';

    if (currentValue && Array.from(select.options).some(option => option.value === currentValue)) {
        select.value = currentValue;
    } else if (activeSalesClientId && !String(activeSalesClientId).startsWith('prospect:')) {
        select.value = activeSalesClientId;
    }
    toggleSalesProspectClientInputs();
}

function populateSalesReportClientDropdown() {
    const select = document.getElementById('sales-report-client-id');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">All client workspaces</option>';

    getCurrentSalesClients().forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.label;
        select.appendChild(option);
    });
    select.innerHTML += '<option value="__other__">Prospective / Unlisted Client</option>';

    if (currentValue && Array.from(select.options).some(option => option.value === currentValue)) {
        select.value = currentValue;
    } else if (activeSalesClientId && !String(activeSalesClientId).startsWith('prospect:')) {
        select.value = activeSalesClientId;
    }
    toggleSalesProspectClientInputs();
}

function getCurrentSalesClients() {
    return salesClients
        .map(client => ({
            id: client.id,
            label: getSalesClientLabel(client)
        }))
        .sort((left, right) => String(left.label).localeCompare(String(right.label)));
}

function isOtherSalesClientValue(value) {
    return String(value || '') === '__other__';
}

function getSelectedSalesClientId(selectId) {
    const selectedValue = document.getElementById(selectId)?.value || '';
    if (!selectedValue || isOtherSalesClientValue(selectedValue) || String(selectedValue).startsWith('prospect:')) return null;
    return selectedValue;
}

function toggleSalesProspectClientInputs() {
    const dealWrap = document.getElementById('sales-prospect-client-wrap');
    const dealInput = document.getElementById('sales-prospect-client-name');
    const dealIsOther = isOtherSalesClientValue(document.getElementById('sales-client-id')?.value || '');
    if (dealWrap) dealWrap.style.display = dealIsOther ? 'block' : 'none';
    if (dealInput && !dealIsOther) dealInput.value = '';

    const docWrap = document.getElementById('sales-doc-prospect-client-wrap');
    const docInput = document.getElementById('sales-doc-prospect-client-name');
    const docIsOther = isOtherSalesClientValue(document.getElementById('sales-doc-client-id')?.value || '');
    if (docWrap) docWrap.style.display = docIsOther ? 'block' : 'none';
    if (docInput && !docIsOther) docInput.value = '';

    const reportWrap = document.getElementById('sales-report-prospect-client-wrap');
    const reportInput = document.getElementById('sales-report-prospect-client-name');
    const reportIsOther = isOtherSalesClientValue(document.getElementById('sales-report-client-id')?.value || '');
    if (reportWrap) reportWrap.style.display = reportIsOther ? 'block' : 'none';
    if (reportInput && !reportIsOther) reportInput.value = '';
}

function getFilteredSalesOpportunities() {
    const searchValue = String(document.getElementById('sales-search-input')?.value || '').trim().toLowerCase();
    const stageValue = String(document.getElementById('sales-stage-filter')?.value || '').trim();
    const ownerValue = String(document.getElementById('sales-owner-filter')?.value || '').trim().toLowerCase();
    const priorityValue = String(document.getElementById('sales-priority-filter')?.value || '').trim().toLowerCase();

    return salesOpportunities.filter(item => {
        const matchesSearch = !searchValue || [
            item.company_name,
            item.opportunity_title,
            item.contact_name,
            item.contact_email,
            item.owner_name,
            item.stage,
            item.priority,
            item.lost_reason,
            item.source,
            item.notes
        ].some(value => String(value || '').toLowerCase().includes(searchValue));

        const matchesStage = !stageValue || item.stage === stageValue;
        const matchesOwner = !ownerValue || String(item.owner_name || '').toLowerCase().includes(ownerValue);
        const matchesPriority = !priorityValue || String(item.priority || 'medium').toLowerCase() === priorityValue;
        return matchesSearch && matchesStage && matchesOwner && matchesPriority;
    });
}

function getSalesClientLabel(client) {
    return client?.client_name || client?.company_name || 'Unnamed Client';
}

function getSalesClientDirectory() {
    const clientMap = new Map();

    salesClients.forEach(client => {
        clientMap.set(String(client.id), {
            ...client,
            derivedFromOpportunity: false,
            label: getSalesClientLabel(client),
            opportunities: [],
            activities: []
        });
    });

    salesOpportunities.forEach(opportunity => {
        const linkedId = opportunity?.client_id ? String(opportunity.client_id) : '';
        if (linkedId) {
            const existing = clientMap.get(linkedId) || {
                id: linkedId,
                client_name: opportunity.company_name || 'Unnamed Client',
                company_name: opportunity.company_name || '',
                contact_person: opportunity.contact_name || '',
                contact_phone: opportunity.contact_phone || '',
                contact_email: opportunity.contact_email || '',
                status: 'active',
                derivedFromOpportunity: true,
                label: opportunity.company_name || 'Unnamed Client',
                opportunities: [],
                activities: []
            };
            existing.opportunities.push(opportunity);
            clientMap.set(linkedId, existing);
            return;
        }

        const fallbackKey = `prospect:${String(opportunity.company_name || opportunity.opportunity_title || opportunity.id || '').trim().toLowerCase()}`;
        const existing = clientMap.get(fallbackKey) || {
            id: fallbackKey,
            client_name: opportunity.company_name || 'Prospect',
            company_name: opportunity.company_name || '',
            contact_person: opportunity.contact_name || '',
            contact_phone: opportunity.contact_phone || '',
            contact_email: opportunity.contact_email || '',
            status: 'prospect',
            derivedFromOpportunity: true,
            label: opportunity.company_name || opportunity.opportunity_title || 'Prospect',
            opportunities: [],
            activities: []
        };
        existing.opportunities.push(opportunity);
        clientMap.set(fallbackKey, existing);
    });

    salesActivities.forEach(activity => {
        const opportunity = salesOpportunities.find(item => String(item.id) === String(activity.opportunity_id));
        if (!opportunity) return;

        const key = opportunity.client_id
            ? String(opportunity.client_id)
            : `prospect:${String(opportunity.company_name || opportunity.opportunity_title || opportunity.id || '').trim().toLowerCase()}`;
        const existing = clientMap.get(key);
        if (!existing) return;
        existing.activities.push(activity);
    });

    return Array.from(clientMap.values()).map(client => {
        const openDeals = client.opportunities.filter(item => !isSalesClosedStage(item.stage)).length;
        const wonDeals = client.opportunities.filter(item => item.stage === 'Won').length;
        const overdueFollowUps = client.opportunities.filter(item => {
            const nextDate = item.next_follow_up_date || '';
            return nextDate && nextDate < toSalesDateKey(new Date()) && !isSalesClosedStage(item.stage);
        }).length;
        const pipelineValue = client.opportunities
            .filter(item => !isSalesClosedStage(item.stage))
            .reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
        const lastActivityAt = [...client.activities]
            .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0]?.created_at || '';

        return {
            ...client,
            label: client.label || getSalesClientLabel(client),
            opportunities: [...client.opportunities].sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime()),
            activities: [...client.activities].sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime()),
            openDeals,
            wonDeals,
            overdueFollowUps,
            pipelineValue,
            lastActivityAt
        };
    }).sort((left, right) => right.pipelineValue - left.pipelineValue || left.label.localeCompare(right.label));
}

function getFilteredSalesClients(filteredOpportunities = getFilteredSalesOpportunities()) {
    const allowedOpportunityIds = new Set(filteredOpportunities.map(item => String(item.id)));
    return getSalesClientDirectory()
        .map(client => ({
            ...client,
            opportunities: client.opportunities.filter(item => allowedOpportunityIds.has(String(item.id))),
            activities: client.activities.filter(activity => {
                const related = salesOpportunities.find(item => String(item.id) === String(activity.opportunity_id));
                return related ? allowedOpportunityIds.has(String(related.id)) : false;
            })
        }))
        .filter(client => client.opportunities.length || client.activities.length);
}

function getSalesDocumentsForClient(clientId) {
    if (!clientId) return [];
    return salesClientDocuments.filter(item => String(item.client_id || '') === String(clientId))
        .sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime());
}

function getOpportunityHealthScore(item) {
    let score = 100;
    const todayKey = toSalesDateKey(new Date());
    const updatedKey = toSalesDateKey(item.updated_at || item.created_at);
    const followUp = String(item.next_follow_up_date || '');
    const quoteStatus = String(item.quote_status || '');

    if (!followUp && !isSalesClosedStage(item.stage)) score -= 20;
    if (followUp && followUp < todayKey && !isSalesClosedStage(item.stage)) score -= 25;
    if (updatedKey && addDaysToSalesDate(updatedKey, 14) < todayKey && !isSalesClosedStage(item.stage)) score -= 20;
    if (quoteStatus === 'Sent' && item.quote_expiry_date && item.quote_expiry_date < todayKey) score -= 20;
    if (item.stage === 'Won' && ['not_invoiced', 'draft', '', null, undefined].includes(item.invoice_status)) score -= 15;
    if (!item.owner_name) score -= 10;

    return Math.max(0, Math.min(100, Math.round(score)));
}

function inferOpportunityTemperature(item) {
    if (item.deal_temperature) return String(item.deal_temperature);
    const score = getOpportunityHealthScore(item);
    if (score >= 75) return 'hot';
    if (score >= 45) return 'warm';
    return 'cold';
}

function getSalesTemperatureBadge(temperature) {
    const normalized = String(temperature || 'warm').toLowerCase();
    const color = normalized === 'hot' ? '#b91c1c' : normalized === 'cold' ? '#0f172a' : '#b86b00';
    const bg = normalized === 'hot' ? 'rgba(239, 68, 68, 0.14)' : normalized === 'cold' ? 'rgba(148, 163, 184, 0.22)' : 'rgba(242, 170, 42, 0.14)';
    return `<span style="display:inline-flex; padding:4px 10px; border-radius:999px; background:${bg}; color:${color}; font-size:0.72rem; font-weight:700; text-transform:uppercase;">${escapeSalesHtml(normalized)}</span>`;
}

function ensureActiveSalesClient(clientList = getFilteredSalesClients()) {
    if (!clientList.length) {
        activeSalesClientId = '';
        return;
    }

    const hasExisting = clientList.some(client => String(client.id) === String(activeSalesClientId));
    if (!hasExisting) {
        activeSalesClientId = String(clientList[0].id);
    }
}

function switchSalesSection(sectionKey = 'pipeline') {
    activeSalesSection = sectionKey;
    document.querySelectorAll('[data-sales-section]').forEach(button => {
        button.classList.toggle('active', button.getAttribute('data-sales-section') === sectionKey);
    });
    document.querySelectorAll('.sales-section-panel').forEach(panel => {
        panel.classList.toggle('active', panel.getAttribute('data-sales-panel') === sectionKey);
    });
    renderSalesSectionWorkspace();
}

function renderSalesSectionWorkspace() {
    const filtered = getFilteredSalesOpportunities();
    const filteredClients = getFilteredSalesClients(filtered);
    ensureActiveSalesClient(filteredClients);

    if (activeSalesSection === 'pipeline') {
        renderSalesSummary(filtered);
        renderSalesConversionChart(filtered);
        renderSalesTable(filtered);
    } else if (activeSalesSection === 'clients') {
        renderSalesClientWorkspace(filteredClients);
        renderSalesDocumentWorkspace();
    } else if (activeSalesSection === 'activity') {
        renderSalesFollowUpBoard(filtered);
        renderSalesActivityLog();
    } else if (activeSalesSection === 'handover') {
        renderSalesHandoverWorkspace(filtered);
    } else if (activeSalesSection === 'reports') {
        renderSalesGeneratedReportWorkspace();
        renderSalesReportTemplateWorkspace();
    }
}

function renderSalesPortal() {
    const filtered = getFilteredSalesOpportunities();
    const filteredClients = getFilteredSalesClients(filtered);
    ensureActiveSalesClient(filteredClients);
    renderSalesSummary(filtered);
    renderSalesConversionChart(filtered);
    renderSalesFollowUpBoard(filtered);
    renderSalesTable(filtered);
    renderSalesActivityLog();
    renderSalesClientWorkspace(filteredClients);
    renderSalesHandoverWorkspace(filtered);
    renderSalesDocumentWorkspace();
    renderSalesGeneratedReportWorkspace();
    renderSalesReportTemplateWorkspace();
    switchSalesSection(activeSalesSection);
}

function renderSalesClientWorkspace(clients) {
    const listBody = document.getElementById('sales-client-table-body');
    const detailPanel = document.getElementById('sales-client-detail');
    const countEl = document.getElementById('sales-client-count');
    if (countEl) countEl.textContent = String(clients.length);
    if (!listBody || !detailPanel) return;

    if (!clients.length) {
        listBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No client accounts match the current sales filters.</td></tr>';
        detailPanel.innerHTML = '<div class="dashboard-empty-state">Select a client workspace once sales opportunities are available.</div>';
        return;
    }

    listBody.innerHTML = clients.map(client => `
        <tr class="${String(client.id) === String(activeSalesClientId) ? 'sales-client-row-active' : ''}" onclick="selectSalesClientWorkspace('${String(client.id).replace(/'/g, "\\'")}')">
            <td>
                <strong>${escapeSalesHtml(client.label)}</strong>
                <div style="color: var(--text-secondary); margin-top: 4px;">${escapeSalesHtml(getSalesClientContactSummary(client))}</div>
            </td>
            <td>${client.openDeals}</td>
            <td>${client.wonDeals}</td>
            <td>${formatSalesCurrency(client.pipelineValue || 0)}</td>
            <td>${client.overdueFollowUps}</td>
            <td>${escapeSalesHtml(client.lastActivityAt ? formatSalesActivityDate(client.lastActivityAt) : 'No activity')}</td>
        </tr>
    `).join('');

    const activeClient = clients.find(client => String(client.id) === String(activeSalesClientId)) || clients[0];
    if (!activeClient) return;
    const primaryContact = getSalesPrimaryClientContact(activeClient);
    const allContacts = parseSalesClientContacts(activeClient.contact_person, activeClient.contact_email, activeClient.contact_phone);

    const topOpportunities = activeClient.opportunities.slice(0, 5);
    const recentActivities = activeClient.activities.slice(0, 5);
    const clientDocuments = getSalesDocumentsForClient(activeClient.id).slice(0, 4);
    const latestNote = activeClient.opportunities.find(item => item.notes)?.notes || '';
    const timelineItems = getSalesClientTimeline(activeClient).slice(0, 8);

    detailPanel.innerHTML = `
        <div class="sales-client-detail-shell">
            <div class="sales-client-detail-header">
                <div>
                    <span class="jobs-board-kicker">${escapeSalesHtml(activeClient.derivedFromOpportunity ? 'Prospect Workspace' : 'Client Workspace')}</span>
                    <h3>${escapeSalesHtml(activeClient.label)}</h3>
                    <p>${escapeSalesHtml(activeClient.industry || 'No industry captured yet')} | ${escapeSalesHtml(activeClient.status || 'active')}</p>
                </div>
                <div class="sales-client-kpis">
                    <div class="sales-client-kpi"><span>Open</span><strong>${activeClient.openDeals}</strong></div>
                    <div class="sales-client-kpi"><span>Won</span><strong>${activeClient.wonDeals}</strong></div>
                    <div class="sales-client-kpi"><span>Value</span><strong>${formatSalesCurrency(activeClient.pipelineValue || 0)}</strong></div>
                </div>
            </div>
            <div class="sales-client-contact-grid">
                <div><strong>Contact</strong><span>${escapeSalesHtml(primaryContact?.name || 'Not set')}</span></div>
                <div><strong>Email</strong><span>${escapeSalesHtml(primaryContact?.email || 'Not set')}</span></div>
                <div><strong>Phone</strong><span>${escapeSalesHtml(primaryContact?.phone || 'Not set')}</span></div>
                <div><strong>Overdue Follow-Ups</strong><span>${activeClient.overdueFollowUps}</span></div>
            </div>
            ${allContacts.length > 1 ? `<div class="sales-client-note-banner"><strong>Additional Contacts</strong><p>${escapeSalesHtml(allContacts.slice(1).map(contact => contact.name || contact.email || contact.phone || 'Unnamed contact').join(' | '))}</p></div>` : ''}
            <div class="sales-client-note-banner">
                <strong>Latest Deal Notes</strong>
                <p>${escapeSalesHtml(latestNote || 'No deal notes have been captured for this client yet.')}</p>
            </div>
            <div class="sales-client-detail-grid">
                <div class="sales-client-detail-card">
                    <div class="sales-client-detail-card-top">
                        <h4>Linked Opportunities</h4>
                        <span>${activeClient.opportunities.length}</span>
                    </div>
                    <div class="sales-client-detail-list">
                        ${topOpportunities.length ? topOpportunities.map(item => `
                            <button type="button" class="sales-client-inline-action" onclick="focusSalesOpportunity('${item.id}')">
                                <strong>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</strong>
                                <span>${escapeSalesHtml(item.stage || 'Lead')} | ${formatSalesCurrency(item.estimated_value || 0)} | ${escapeSalesHtml(item.owner_name || 'Unassigned')}</span>
                                ${item.notes ? `<span>${escapeSalesHtml(item.notes)}</span>` : ''}
                            </button>
                        `).join('') : '<div class="dashboard-empty-state">No opportunities linked to this client yet.</div>'}
                    </div>
                </div>
                <div class="sales-client-detail-card">
                    <div class="sales-client-detail-card-top">
                        <h4>Recent Activity</h4>
                        <span>${activeClient.activities.length}</span>
                    </div>
                    <div class="sales-client-detail-list">
                        ${recentActivities.length ? recentActivities.map(activity => `
                            <div class="sales-client-activity-row">
                                <strong>${escapeSalesHtml(activity.activity_type || 'Activity')}</strong>
                                <span>${escapeSalesHtml(formatSalesActivityDate(activity.created_at))}</span>
                                <p>${escapeSalesHtml(activity.activity_note || '')}</p>
                            </div>
                        `).join('') : '<div class="dashboard-empty-state">No client activity captured yet.</div>'}
                    </div>
                </div>
                <div class="sales-client-detail-card">
                    <div class="sales-client-detail-card-top">
                        <h4>Saved Sales Files</h4>
                        <span>${clientDocuments.length}</span>
                    </div>
                    <div class="sales-client-detail-list">
                        ${clientDocuments.length ? clientDocuments.map(doc => `
                            <div class="sales-client-activity-row">
                                <strong>${escapeSalesHtml(doc.report_title || 'Untitled File')}</strong>
                                <span>${escapeSalesHtml(doc.report_type || 'General')} | ${escapeSalesHtml(doc.report_status || 'Draft')}</span>
                                <p>${escapeSalesHtml(doc.summary || doc.file_name || 'Saved in the sales client workspace.')}</p>
                            </div>
                        `).join('') : '<div class="dashboard-empty-state">No invoices or sales reports saved to this client yet.</div>'}
                    </div>
                </div>
                <div class="sales-client-detail-card">
                    <div class="sales-client-detail-card-top">
                        <h4>Client Timeline</h4>
                        <span>${timelineItems.length}</span>
                    </div>
                    <div class="sales-client-timeline">
                        ${timelineItems.length ? timelineItems.map(entry => `
                            <div class="sales-client-timeline-item">
                                <strong>${escapeSalesHtml(entry.title)}</strong>
                                <span>${escapeSalesHtml(entry.when)} | ${escapeSalesHtml(entry.kind)}</span>
                                <p>${escapeSalesHtml(entry.detail)}</p>
                            </div>
                        `).join('') : '<div class="dashboard-empty-state">Timeline events will appear here.</div>'}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function getSalesClientTimeline(client) {
    const events = [];
    (client.opportunities || []).forEach(opportunity => {
        events.push({
            at: opportunity.updated_at || opportunity.created_at,
            kind: 'Opportunity',
            title: `${opportunity.stage || 'Lead'} - ${opportunity.opportunity_title || 'Untitled Opportunity'}`,
            detail: `${formatSalesCurrency(opportunity.estimated_value || 0)} | Quote: ${opportunity.quote_status || 'Not Started'}`
        });
    });
    (client.activities || []).forEach(activity => {
        events.push({
            at: activity.created_at,
            kind: 'Activity',
            title: activity.activity_type || 'Activity',
            detail: activity.activity_note || 'Sales activity logged.'
        });
    });
    getSalesDocumentsForClient(client.id).forEach(doc => {
        events.push({
            at: doc.created_at || doc.updated_at,
            kind: 'Document',
            title: doc.report_title || 'Sales file',
            detail: `${doc.report_type || 'General'} | ${doc.report_status || 'Draft'}`
        });
    });
    return events
        .sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime())
        .map(entry => ({
            ...entry,
            when: formatSalesActivityDate(entry.at)
        }));
}

function renderSalesDocumentWorkspace() {
    const list = document.getElementById('sales-doc-list');
    const countEl = document.getElementById('sales-doc-count');
    if (!list) return;

    const docs = getSalesDocumentsForClient(activeSalesClientId);
    if (countEl) countEl.textContent = String(docs.length);

    if (!docs.length) {
        list.innerHTML = '<div class="dashboard-empty-state">Saved client sales files will appear here.</div>';
        return;
    }

    list.innerHTML = docs.map(doc => `
        <div class="sales-doc-row">
            <div>
                <strong>${escapeSalesHtml(doc.report_title || 'Untitled File')}</strong>
                <span>${escapeSalesHtml(doc.report_type || 'General')} | ${escapeSalesHtml(doc.report_status || 'Draft')} | ${escapeSalesHtml(doc.report_date || 'No date')}</span>
                <p>${escapeSalesHtml(doc.summary || doc.file_name || 'Saved sales record')}</p>
            </div>
            <div class="sales-doc-actions">
                ${doc.file_content_base64 ? `<button type="button" class="btn btn-small" onclick="downloadSalesClientDocument('${doc.id}')">Download</button>` : ''}
            </div>
        </div>
    `).join('');
}

function renderSalesReportTemplateWorkspace() {
    const list = document.getElementById('sales-report-template-list');
    const countEl = document.getElementById('sales-report-template-count');
    if (!list) return;
    if (countEl) countEl.textContent = String(salesReportTemplates.length);

    if (!salesReportTemplates.length) {
        list.innerHTML = '<div class="dashboard-empty-state">Saved sales report templates will appear here.</div>';
        return;
    }

    list.innerHTML = salesReportTemplates.map(template => `
        <div class="sales-doc-row">
            <div>
                <strong>${escapeSalesHtml(template.template_name || 'Untitled Template')}</strong>
                <span>${escapeSalesHtml(template.report_type || 'Custom Narrative')} | ${escapeSalesHtml(template.updated_at ? formatSalesActivityDate(template.updated_at) : 'No date')}</span>
                <p>${escapeSalesHtml(template.template_body || 'Saved report template')}</p>
            </div>
            <div class="sales-doc-actions">
                <button type="button" class="btn btn-small" onclick="applySalesReportTemplate('${template.id}')">Use</button>
            </div>
        </div>
    `).join('');
}

function renderSalesGeneratedReportWorkspace() {
    const list = document.getElementById('sales-generated-report-list');
    const countEl = document.getElementById('sales-generated-report-count');
    if (!list) return;

    const reports = salesClientDocuments
        .filter(item => String(item.document_category || '').toLowerCase() === 'sales_report' || String(item.report_type || '').toLowerCase().includes('report'))
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime());

    if (countEl) countEl.textContent = String(reports.length);
    if (!reports.length) {
        list.innerHTML = '<div class="dashboard-empty-state">Generated sales reports will appear here.</div>';
        return;
    }

    list.innerHTML = reports.map(report => `
        <div class="sales-doc-row">
            <div>
                <strong>${escapeSalesHtml(report.report_title || 'Untitled Sales Report')}</strong>
                <span>${escapeSalesHtml(report.report_type || 'Custom Narrative')} | ${escapeSalesHtml(report.report_status || 'Draft')} | ${escapeSalesHtml(report.report_date || 'No date')}</span>
                <p>${escapeSalesHtml(report.summary || 'Sales report generated from Sales Portal.')}</p>
            </div>
            <div class="sales-doc-actions">
                <button type="button" class="btn btn-small" onclick="loadGeneratedSalesReport('${report.id}')">Load</button>
                ${report.file_content_base64 ? `<button type="button" class="btn btn-small" onclick="downloadSalesClientDocument('${report.id}')">Download</button>` : ''}
                <button type="button" class="btn btn-small" onclick="deleteGeneratedSalesReport('${report.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

function renderSalesHandoverWorkspace(items) {
    const container = document.getElementById('sales-handover-board');
    if (!container) return;

    const wonReady = items.filter(item => item.stage === 'Won' && item.handover_status !== 'created');
    const handedOver = items.filter(item => item.handover_status === 'created');
    const stalled = items.filter(item => ['Quoted', 'Negotiation'].includes(item.stage) && item.quote_status !== 'Accepted');

    const renderCards = (records, emptyText, renderer) => records.length
        ? records.map(renderer).join('')
        : `<div class="dashboard-empty-state">${escapeSalesHtml(emptyText)}</div>`;

    container.innerHTML = `
        <div class="sales-handover-column">
            <h4>Won Awaiting Ops (${wonReady.length})</h4>
            <div class="sales-handover-list">
                ${renderCards(wonReady, 'No won deals are waiting for handover.', item => `
                    <div class="sales-handover-card">
                        <strong>${escapeSalesHtml(item.company_name || 'Untitled Account')}</strong>
                        <span>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</span>
                        <small>${formatSalesCurrency(item.estimated_value || 0)} | ${escapeSalesHtml(item.owner_name || 'Unassigned')}</small>
                        <button type="button" class="btn btn-small btn-primary" onclick="handoverSalesOpportunity('${item.id}')">Create Handover</button>
                    </div>
                `)}
            </div>
        </div>
        <div class="sales-handover-column">
            <h4>Operations Created (${handedOver.length})</h4>
            <div class="sales-handover-list">
                ${renderCards(handedOver, 'No operations handovers have been created yet.', item => `
                    <div class="sales-handover-card">
                        <strong>${escapeSalesHtml(item.company_name || 'Untitled Account')}</strong>
                        <span>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</span>
                        <small>${escapeSalesHtml(item.handover_job_id ? `Job ${item.handover_job_id.slice(0, 8)}` : 'Job created')} | ${escapeSalesHtml(item.quote_status || 'No quote status')}</small>
                        <button type="button" class="btn btn-small" onclick="focusSalesOpportunity('${item.id}')">Review</button>
                    </div>
                `)}
            </div>
        </div>
        <div class="sales-handover-column">
            <h4>Commercially Stalled (${stalled.length})</h4>
            <div class="sales-handover-list">
                ${renderCards(stalled, 'No quoted or negotiation deals are currently stalled.', item => `
                    <div class="sales-handover-card">
                        <strong>${escapeSalesHtml(item.company_name || 'Untitled Account')}</strong>
                        <span>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</span>
                        <small>${escapeSalesHtml(item.stage || 'Lead')} | ${escapeSalesHtml(item.quote_status || 'Not Started')} | Follow-up ${escapeSalesHtml(item.next_follow_up_date || 'not set')}</small>
                        <button type="button" class="btn btn-small btn-white" onclick="prepareSalesActivityForOpportunity('${item.id}', 'Quote Update')">Log Update</button>
                    </div>
                `)}
            </div>
        </div>
    `;
}

function renderSalesSummary(items) {
    const openStages = new Set(['Lead', 'Qualified', 'Quoted', 'Negotiation']);
    const currentMonth = new Date().toISOString().slice(0, 7);

    const openDeals = items.filter(item => openStages.has(item.stage)).length;
    const pipelineValue = items
        .filter(item => openStages.has(item.stage))
        .reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
    const wonThisMonth = items.filter(item => item.stage === 'Won' && String(item.updated_at || item.created_at || '').startsWith(currentMonth)).length;
    const pendingHandovers = items.filter(item => item.stage === 'Won' && item.handover_status !== 'created').length;
    const quotesSent = items.filter(item => ['Sent', 'Revised', 'Accepted'].includes(item.quote_status)).length;
    const acceptedQuotes = items.filter(item => item.quote_status === 'Accepted').length;
    const followUpsDue = items.filter(item => {
        if (!item.next_follow_up_date) return false;
        return item.next_follow_up_date <= new Date().toISOString().split('T')[0] && item.stage !== 'Won' && item.stage !== 'Lost';
    }).length;
    const wonValue = items
        .filter(item => item.stage === 'Won')
        .reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
    const weightedForecast = items
        .filter(item => !isSalesClosedStage(item.stage))
        .reduce((sum, item) => sum + ((Number(item.estimated_value) || 0) * ((Number(item.probability) || 0) / 100)), 0);
    const activeDeals = items.filter(item => !isSalesClosedStage(item.stage));
    const averageHealth = activeDeals.length
        ? Math.round(activeDeals.reduce((sum, item) => sum + getOpportunityHealthScore(item), 0) / activeDeals.length)
        : 0;
    const todayKey = toSalesDateKey(new Date());
    const staleDeals = activeDeals.filter(item => {
        const updatedKey = toSalesDateKey(item.updated_at || item.created_at);
        return updatedKey && addDaysToSalesDate(updatedKey, 14) < todayKey;
    }).length;
    const wonNotInvoiced = items.filter(item => item.stage === 'Won' && ['not_invoiced', 'draft', '', null, undefined].includes(item.invoice_status)).length;

    setSalesText('sales-summary-open-count', openDeals);
    setSalesText('sales-summary-pipeline-value', formatSalesCurrency(pipelineValue));
    setSalesText('sales-summary-won-count', wonThisMonth);
    setSalesText('sales-summary-handover-count', pendingHandovers);
    setSalesText('sales-summary-quotes-sent', quotesSent);
    setSalesText('sales-summary-quotes-accepted', acceptedQuotes);
    setSalesText('sales-summary-followups-due', followUpsDue);
    setSalesText('sales-summary-won-value', formatSalesCurrency(wonValue));
    setSalesText('sales-summary-weighted-forecast', formatSalesCurrency(weightedForecast));
    setSalesText('sales-summary-health-average', `${averageHealth}/100`);
    setSalesText('sales-summary-stale-deals', staleDeals);
    setSalesText('sales-summary-won-not-invoiced', wonNotInvoiced);
}

function getSalesPriorityLabel(priority) {
    const normalized = String(priority || 'medium').trim().toLowerCase();
    if (normalized === 'low') return 'Low';
    if (normalized === 'high') return 'High';
    if (normalized === 'urgent') return 'Urgent';
    return 'Medium';
}

function getSalesPriorityBadge(priority) {
    const normalized = String(priority || 'medium').trim().toLowerCase();
    return `<span class="sales-priority-badge ${escapeSalesHtml(normalized)}">${escapeSalesHtml(getSalesPriorityLabel(normalized))}</span>`;
}

function isSalesClosedStage(stage) {
    return stage === 'Won' || stage === 'Lost';
}

function toSalesDateKey(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
}

function addDaysToSalesDate(value, days) {
    const date = new Date(value);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function renderSalesFollowUpBoard(items) {
    const board = document.getElementById('sales-followup-board');
    if (!board) return;

    const todayKey = new Date().toISOString().split('T')[0];
    const weekEndKey = addDaysToSalesDate(todayKey, 7);
    const actionable = items
        .filter(item => item.next_follow_up_date && !isSalesClosedStage(item.stage))
        .sort((left, right) => String(left.next_follow_up_date).localeCompare(String(right.next_follow_up_date)));

    const overdue = actionable.filter(item => item.next_follow_up_date < todayKey);
    const today = actionable.filter(item => item.next_follow_up_date === todayKey);
    const thisWeek = actionable.filter(item => item.next_follow_up_date > todayKey && item.next_follow_up_date <= weekEndKey);
    const quoteExpiring = items.filter(item => !isSalesClosedStage(item.stage) && item.quote_expiry_date && item.quote_expiry_date >= todayKey && item.quote_expiry_date <= weekEndKey);
    const wonNotInvoiced = items.filter(item => item.stage === 'Won' && ['not_invoiced', 'draft', '', null, undefined].includes(item.invoice_status));

    setSalesText('sales-followup-overdue-count', overdue.length);
    setSalesText('sales-followup-today-count', today.length);
    setSalesText('sales-followup-week-count', thisWeek.length);
    setSalesText('sales-followup-quote-expiring-count', quoteExpiring.length);
    setSalesText('sales-followup-won-not-invoiced-count', wonNotInvoiced.length);

    const renderColumn = (title, queue, toneClass) => `
        <div class="sales-followup-column">
            <h4>${escapeSalesHtml(title)} (${queue.length})</h4>
            <div class="sales-followup-list">
                ${queue.length ? queue.map(item => `
                    <div class="sales-followup-card ${toneClass}">
                        <div class="sales-followup-top">
                            <div>
                                <div class="sales-followup-title">${escapeSalesHtml(item.company_name || 'Untitled Account')}</div>
                                <div class="sales-followup-meta">${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</div>
                            </div>
                            ${getSalesPriorityBadge(item.priority)}
                        </div>
                        <div class="sales-followup-meta">
                            Follow-up: ${escapeSalesHtml(item.next_follow_up_date || 'Not set')}<br>
                            Owner: ${escapeSalesHtml(item.owner_name || 'Unassigned')}<br>
                            Stage: ${escapeSalesHtml(item.stage || 'Lead')}
                        </div>
                        <div class="sales-followup-actions">
                            <button type="button" class="btn btn-small" onclick="focusSalesOpportunity('${item.id}')">Open</button>
                            <button type="button" class="btn btn-small btn-white" onclick="prepareSalesActivityForOpportunity('${item.id}', 'Call')">Log Call</button>
                        </div>
                    </div>
                `).join('') : '<div class="dashboard-empty-state">Nothing in this queue right now.</div>'}
            </div>
        </div>
    `;

    board.innerHTML = [
        renderColumn('Overdue', overdue, 'overdue'),
        renderColumn('Today', today, 'today'),
        renderColumn('This Week', thisWeek, 'this-week')
    ].join('');
}

function renderSalesConversionChart(items) {
    const canvas = document.getElementById('salesConversionChart');
    if (!canvas) return;

    if (window._salesConversionChart) window._salesConversionChart.destroy();

    const stageCounts = SALES_STAGE_ORDER.map(stage => items.filter(item => item.stage === stage).length);

    window._salesConversionChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: SALES_STAGE_ORDER,
            datasets: [{
                data: stageCounts,
                backgroundColor: ['#94a3b8', '#f2aa2a', '#1f9bd7', '#fb7185', '#10b981', '#ef4444'],
                borderColor: '#eef2f6',
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '58%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#334155',
                        boxWidth: 12,
                        padding: 16
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(31, 41, 55, 0.96)',
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb'
                }
            }
        }
    });
}

function renderSalesTable(items) {
    const tbody = document.getElementById('sales-opportunity-table-body');
    if (!tbody) return;

    if (!items.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color: var(--text-secondary);">No opportunities match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const handoverLabel = item.handover_status === 'created'
            ? `Job Ready${item.handover_job_id ? ` (${escapeSalesHtml(item.handover_job_id.slice(0, 8))})` : ''}`
            : item.stage === 'Won'
                ? 'Ready For Ops'
                : 'Not Ready';

        const canHandover = item.stage === 'Won' && item.handover_status !== 'created';
        const lostReason = item.stage === 'Lost' && item.lost_reason
            ? `<div class="sales-table-meta sales-table-meta-danger">Lost: ${escapeSalesHtml(item.lost_reason)}</div>`
            : '';
        const followUpText = item.next_follow_up_date || 'Not set';
        const closeText = item.expected_close_date || 'Not set';
        const quoteRefText = item.quote_reference ? `Ref ${escapeSalesHtml(item.quote_reference)}` : 'No reference';
        const quoteExpiryText = item.quote_expiry_date ? `Expiry ${escapeSalesHtml(item.quote_expiry_date)}` : 'No expiry';
        const invoiceStatus = String(item.invoice_status || 'not_invoiced').replace(/_/g, ' ');
        return `
            <tr>
                <td>
                    <strong>${escapeSalesHtml(item.company_name || 'Untitled Account')}</strong>
                    <div class="sales-table-meta">${escapeSalesHtml(item.contact_name || item.contact_email || 'No contact')}</div>
                    <div class="sales-table-meta">${escapeSalesHtml(item.owner_name || 'Unassigned')} | ${escapeSalesHtml(item.source || 'No source')}</div>
                </td>
                <td>
                    <strong>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</strong>
                    <div class="sales-table-meta">${item.notes ? escapeSalesHtml(item.notes) : 'No notes captured'}</div>
                    ${lostReason}
                </td>
                <td><span class="badge ${salesStageBadge(item.stage)}">${escapeSalesHtml(item.stage || 'Lead')}</span></td>
                <td>${getSalesPriorityBadge(item.priority)}</td>
                <td>${formatSalesCurrency(item.estimated_value || 0)}</td>
                <td>
                    <strong>${escapeSalesHtml(item.quote_status || 'Not Started')}</strong>
                    <div class="sales-table-meta">${quoteRefText}</div>
                    <div class="sales-table-meta">${quoteExpiryText}</div>
                </td>
                <td>${Math.max(0, Math.min(100, Number(item.probability) || 0))}%</td>
                <td>
                    <div class="sales-table-meta"><strong>Follow-Up:</strong> ${escapeSalesHtml(followUpText)}</div>
                    <div class="sales-table-meta"><strong>Close:</strong> ${escapeSalesHtml(closeText)}</div>
                </td>
                <td>
                    <div class="sales-table-meta">${escapeSalesHtml(handoverLabel)}</div>
                    <div class="sales-table-meta">Invoice: ${escapeSalesHtml(invoiceStatus)}</div>
                    <div style="margin-top:6px;">${getSalesTemperatureBadge(inferOpportunityTemperature(item))}</div>
                    <div class="sales-table-meta">Health ${getOpportunityHealthScore(item)}/100</div>
                </td>
                <td style="text-align:right;">
                    <div class="sales-table-actions">
                        <button class="btn btn-small" data-sales-action="edit" data-sales-id="${escapeSalesHtml(item.id)}" onclick="openSalesOpportunityEdit('${escapeSalesHtml(item.id)}')">Edit</button>
                        <button class="btn btn-small" data-sales-action="delete" data-sales-id="${escapeSalesHtml(item.id)}" onclick="deleteSalesOpportunity('${escapeSalesHtml(item.id)}')">Delete</button>
                        <button class="btn btn-small btn-primary" data-sales-action="handover" data-sales-id="${escapeSalesHtml(item.id)}" onclick="createSalesOpportunityHandover('${escapeSalesHtml(item.id)}')" ${canHandover ? '' : 'disabled'}>Handover</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function salesStageBadge(stage) {
    switch (stage) {
        case 'Won': return 'badge-green';
        case 'Lost': return 'badge-red';
        case 'Negotiation': return 'badge-orange';
        case 'Quoted': return 'badge-blue';
        case 'Qualified': return 'badge-yellow';
        default: return 'badge-gray';
    }
}

async function saveSalesOpportunity(event) {
    event.preventDefault();
    if (!getSalesPortalPermission()) return;

    const payload = readSalesOpportunityForm();
    if (!payload.company_name) {
        if (typeof showToast === 'function') showToast('Company / account is required.', 'error');
        return;
    }
    if (!payload.opportunity_title) {
        if (typeof showToast === 'function') showToast('Opportunity title is required.', 'error');
        return;
    }

    const recordId = document.getElementById('sales-opportunity-id')?.value || '';

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, recordId ? 'Saving opportunity...' : 'Creating opportunity...');

        const updatePayload = { ...payload };
        delete updatePayload.created_by;
        const { data: savedRecord, error } = await saveSalesOpportunityWithCompatibility(recordId, payload, updatePayload);
        if (error) throw error;
        if (payload.notes && savedRecord && String(savedRecord.notes || '') !== String(payload.notes || '')) {
            console.warn('Sales note mismatch after save. Expected note text was not returned in the saved record.');
        }

        if (!recordId && payload.notes) {
            await createSalesOpportunityNoteActivity(savedRecord?.id, payload.notes, payload.owner_name);
        }

        if (typeof showToast === 'function') showToast(recordId ? 'Opportunity updated successfully.' : 'Opportunity added to the sales pipeline.', 'success');
        resetSalesOpportunityForm();
        switchSalesSection('pipeline');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save opportunity: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function saveSalesOpportunityWithCompatibility(recordId, insertPayload, updatePayload) {
    const primary = recordId
        ? await window.supabaseClient.from('sales_opportunities').update(updatePayload).eq('id', recordId).select('*').maybeSingle()
        : await window.supabaseClient.from('sales_opportunities').insert([insertPayload]).select('*').maybeSingle();

    if (!primary.error) return primary;

    const advancedFields = [
        'quote_expiry_date',
        'next_action_owner',
        'last_contact_at',
        'invoice_status',
        'invoice_number',
        'invoice_date',
        'deal_temperature',
        'closed_reason_category'
    ];
    if (!isSalesSchemaColumnError(primary.error, advancedFields)) {
        return primary;
    }

    salesSchemaCapabilities.advancedOpportunityFields = false;
    salesSchemaChecked = true;
    const legacyInsert = { ...insertPayload };
    const legacyUpdate = { ...updatePayload };
    advancedFields.forEach(field => {
        delete legacyInsert[field];
        delete legacyUpdate[field];
    });

    const fallback = recordId
        ? await window.supabaseClient.from('sales_opportunities').update(legacyUpdate).eq('id', recordId).select('*').maybeSingle()
        : await window.supabaseClient.from('sales_opportunities').insert([legacyInsert]).select('*').maybeSingle();

    renderSalesMigrationStatus();
    return fallback;
}

async function createSalesOpportunityNoteActivity(opportunityId, noteText, ownerName) {
    if (!opportunityId || !noteText) return;
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const { error } = await window.supabaseClient.from('sales_activities').insert([{
        opportunity_id: opportunityId,
        activity_type: 'Note',
        activity_note: noteText,
        created_by: ownerName || currentProfile?.username || currentProfile?.email || 'Sales Portal'
    }]);
    if (error) {
        console.warn('Could not mirror opportunity notes into sales activity:', error.message || error);
    }
}

function readSalesOpportunityForm() {
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const stageValue = document.getElementById('sales-stage')?.value || 'Lead';
    const lostReasonValue = document.getElementById('sales-lost-reason')?.value.trim() || null;
    const selectedClientId = document.getElementById('sales-client-id')?.value || '';
    const prospectClientName = document.getElementById('sales-prospect-client-name')?.value.trim() || null;
    const companyInput = document.getElementById('sales-company-name')?.value.trim() || null;
    const normalizedCompanyName = companyInput || (isOtherSalesClientValue(selectedClientId) ? prospectClientName : null);
    return {
        client_id: getSelectedSalesClientId('sales-client-id'),
        company_name: normalizedCompanyName,
        contact_name: document.getElementById('sales-contact-name')?.value.trim() || null,
        contact_email: document.getElementById('sales-contact-email')?.value.trim() || null,
        contact_phone: document.getElementById('sales-contact-phone')?.value.trim() || null,
        opportunity_title: document.getElementById('sales-opportunity-title')?.value.trim() || null,
        stage: stageValue,
        source: document.getElementById('sales-source')?.value.trim() || null,
        estimated_value: normalizeSalesNumber(document.getElementById('sales-estimated-value')?.value),
        expected_close_date: document.getElementById('sales-expected-close-date')?.value || null,
        probability: normalizeSalesProbability(document.getElementById('sales-probability')?.value),
        priority: normalizeSalesPriority(document.getElementById('sales-priority')?.value),
        quote_status: document.getElementById('sales-quote-status')?.value || 'Not Started',
        quote_reference: document.getElementById('sales-quote-reference')?.value.trim() || null,
        quote_sent_date: document.getElementById('sales-quote-sent-date')?.value || null,
        quote_expiry_date: document.getElementById('sales-quote-expiry-date')?.value || null,
        next_follow_up_date: document.getElementById('sales-next-follow-up-date')?.value || null,
        owner_name: document.getElementById('sales-owner-name')?.value.trim() || currentProfile?.username || currentProfile?.email || null,
        next_action_owner: document.getElementById('sales-next-action-owner')?.value.trim() || null,
        lost_reason: stageValue === 'Lost' ? lostReasonValue : null,
        invoice_status: normalizeSalesInvoiceStatus(document.getElementById('sales-invoice-status')?.value),
        invoice_number: document.getElementById('sales-invoice-number')?.value.trim() || null,
        invoice_date: document.getElementById('sales-invoice-date')?.value || null,
        deal_temperature: normalizeSalesTemperature(document.getElementById('sales-deal-temperature')?.value),
        last_contact_at: new Date().toISOString(),
        closed_reason_category: stageValue === 'Lost' ? categorizeClosedReason(lostReasonValue) : null,
        notes: document.getElementById('sales-notes')?.value.trim() || null,
        created_by: currentProfile?.username || currentProfile?.email || 'Unknown User'
    };
}

function editSalesOpportunity(id) {
    const item = salesOpportunities.find(entry => String(entry.id) === String(id));
    if (!item) {
        if (typeof showToast === 'function') showToast('Could not find that opportunity. Refreshing sales data now.', 'error');
        loadSalesPortalData();
        return;
    }

    setSalesFormValue('sales-opportunity-id', item.id);
    setSalesFormValue('sales-company-name', item.company_name);
    setSalesFormValue('sales-contact-name', item.contact_name);
    setSalesFormValue('sales-contact-email', item.contact_email);
    setSalesFormValue('sales-contact-phone', item.contact_phone);
    setSalesFormValue('sales-opportunity-title', item.opportunity_title);
    setSalesFormValue('sales-client-id', item.client_id || '');
    setSalesFormValue('sales-stage', item.stage || 'Lead');
    setSalesFormValue('sales-source', item.source);
    setSalesFormValue('sales-estimated-value', item.estimated_value);
    setSalesFormValue('sales-expected-close-date', item.expected_close_date);
    setSalesFormValue('sales-probability', item.probability);
    setSalesFormValue('sales-priority', item.priority || 'medium');
    setSalesFormValue('sales-quote-status', item.quote_status || 'Not Started');
    setSalesFormValue('sales-quote-reference', item.quote_reference);
    setSalesFormValue('sales-quote-sent-date', item.quote_sent_date);
    setSalesFormValue('sales-quote-expiry-date', item.quote_expiry_date);
    setSalesFormValue('sales-next-follow-up-date', item.next_follow_up_date);
    setSalesFormValue('sales-owner-name', item.owner_name);
    setSalesFormValue('sales-next-action-owner', item.next_action_owner);
    setSalesFormValue('sales-invoice-status', item.invoice_status || 'not_invoiced');
    setSalesFormValue('sales-invoice-number', item.invoice_number);
    setSalesFormValue('sales-invoice-date', item.invoice_date);
    setSalesFormValue('sales-deal-temperature', item.deal_temperature || inferOpportunityTemperature(item));
    setSalesFormValue('sales-lost-reason', item.lost_reason);
    setSalesFormValue('sales-notes', item.notes);
    setSalesFormValue('sales-prospect-client-name', '');
    setSalesFormValue('sales-activity-opportunity-id', item.id);
    toggleSalesProspectClientInputs();

    const saveBtn = document.getElementById('sales-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save Changes';
    renderSalesActivityLog();
    switchSalesSection('pipeline');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSalesOpportunityForm() {
    const form = document.getElementById('salesOpportunityForm');
    if (form) form.reset();
    setSalesFormValue('sales-opportunity-id', '');
    const saveBtn = document.getElementById('sales-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save Opportunity';

    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const ownerInput = document.getElementById('sales-owner-name');
    if (ownerInput && !ownerInput.value.trim()) {
        ownerInput.value = currentProfile?.username || currentProfile?.email || '';
    }
    setSalesFormValue('sales-priority', 'medium');
    setSalesFormValue('sales-lost-reason', '');
    setSalesFormValue('sales-quote-status', 'Not Started');
    setSalesFormValue('sales-quote-expiry-date', '');
    setSalesFormValue('sales-next-action-owner', '');
    setSalesFormValue('sales-invoice-status', 'not_invoiced');
    setSalesFormValue('sales-invoice-number', '');
    setSalesFormValue('sales-invoice-date', '');
    setSalesFormValue('sales-deal-temperature', 'warm');
    setSalesFormValue('sales-prospect-client-name', '');
    toggleSalesProspectClientInputs();
}

async function deleteSalesOpportunity(id) {
    const item = salesOpportunities.find(entry => String(entry.id) === String(id));
    if (!item) return;

    const confirmed = window.confirm(`Delete sales opportunity "${item.opportunity_title || item.company_name}"?`);
    if (!confirmed) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting opportunity...');
        const { error } = await window.supabaseClient.from('sales_opportunities').delete().eq('id', id);
        if (error) throw error;
        await window.supabaseClient.from('sales_activities').delete().eq('opportunity_id', id);
        if (typeof showToast === 'function') showToast('Opportunity deleted.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales delete error:', error);
        if (typeof showToast === 'function') showToast('Failed to delete opportunity: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function handoverSalesOpportunity(id) {
    const item = salesOpportunities.find(entry => String(entry.id) === String(id));
    if (!item) {
        if (typeof showToast === 'function') showToast('Could not find that opportunity. Refreshing sales data now.', 'error');
        await loadSalesPortalData();
        return;
    }
    if (item.stage !== 'Won') {
        if (typeof showToast === 'function') showToast('Only won deals can be handed over to operations.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Creating operations handover...');

        const resolvedClientId = await ensureSalesClientForHandover(item);
        const resolvedSiteId = await resolvePrimarySiteId(resolvedClientId);
        const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;

        const jobPayload = {
            client_id: resolvedClientId,
            site_id: resolvedSiteId,
            title: item.opportunity_title || `Sales Handover - ${item.company_name}`,
            description: item.notes || `Sales handover for ${item.company_name}`,
            job_type: 'General Work',
            status: 'Unassigned',
            priority: 'medium',
            estimated_duration_hours: 2,
            created_by: currentProfile?.username || currentProfile?.email || 'Sales Portal',
            workflow_module: 'sales_handover',
            notes: `Original Customer: ${item.company_name || 'Unknown'}\nSales handover created from opportunity ${item.opportunity_title || item.company_name}. Contact: ${item.contact_name || 'N/A'} | Email: ${item.contact_email || 'N/A'} | Phone: ${item.contact_phone || 'N/A'}`
        };

        const { data: newJob, error: jobError } = await window.supabaseClient
            .from('jobs')
            .insert([jobPayload])
            .select('id')
            .maybeSingle();
        if (jobError) throw jobError;

        const { error: updateError } = await window.supabaseClient
            .from('sales_opportunities')
            .update({
                client_id: resolvedClientId,
                handover_status: 'created',
                handover_job_id: newJob?.id || null
            })
            .eq('id', id);
        if (updateError) throw updateError;

        if (typeof showToast === 'function') showToast('Sales handover created in Jobs.', 'success');
        await loadSalesPortalData();
        if (typeof loadJobsData === 'function') await loadJobsData({ forceRefresh: true });
        if (typeof loadDashboardData === 'function') await loadDashboardData();
    } catch (error) {
        console.error('Sales handover error:', error);
        if (typeof showToast === 'function') showToast('Failed to create operations handover: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function resolveSalesClientForHandover(item) {
    if (item.client_id) return item.client_id;

    const existingClient = salesClients.find(client => String(client.client_name || '').trim().toLowerCase() === String(item.company_name || '').trim().toLowerCase());
    if (existingClient) return existingClient.id;

    return null;
}

async function ensureSalesClientForHandover(item) {
    const existingClientId = await resolveSalesClientForHandover(item);
    if (existingClientId) return existingClientId;

    const payload = {
        client_name: item.company_name || item.opportunity_title || 'Sales Prospect',
        company_name: item.company_name || item.opportunity_title || 'Sales Prospect',
        contact_person: item.contact_name || null,
        contact_phone: item.contact_phone || null,
        contact_email: item.contact_email || null,
        status: 'active'
    };

    const { data, error } = await window.supabaseClient
        .from('clients')
        .insert([payload])
        .select('id, client_name, company_name, industry, contact_person, contact_phone, contact_email, status')
        .maybeSingle();

    if (error) throw error;
    if (data) {
        salesClients = [data, ...salesClients];
    }

    return data?.id || null;
}

async function resolvePrimarySiteId(clientId) {
    if (!clientId) return null;
    const { data, error } = await window.supabaseClient
        .from('sites')
        .select('id')
        .eq('client_id', clientId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data?.id || null;
}

async function handleSalesImport(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, `Importing ${file.name}...`);
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

        if (!rows.length) {
            if (typeof showToast === 'function') showToast('The selected sales file is empty.', 'error');
            return;
        }

        const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
        const payload = rows
            .map(row => mapImportedSalesRow(row, currentProfile))
            .filter(item => item.company_name || item.opportunity_title);

        if (!payload.length) {
            if (typeof showToast === 'function') showToast('No usable opportunities were found in the spreadsheet.', 'error');
            return;
        }

        const { error } = await window.supabaseClient.from('sales_opportunities').insert(payload);
        if (error) throw error;

        if (typeof showToast === 'function') showToast(`${payload.length} sales opportunit${payload.length === 1 ? 'y' : 'ies'} imported successfully.`, 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales import error:', error);
        if (typeof showToast === 'function') showToast('Sales import failed: ' + error.message, 'error');
    } finally {
        event.target.value = '';
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function mapImportedSalesRow(row, currentProfile) {
    const valueFor = (...keys) => {
        for (const key of Object.keys(row)) {
            const normalizedKey = String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
            if (keys.some(candidate => normalizedKey === candidate || normalizedKey.includes(candidate))) {
                return row[key];
            }
        }
        return '';
    };

    const companyName = String(valueFor('company', 'account', 'client', 'customer') || '').trim();
    const linkedClient = salesClients.find(client => String(client.client_name || '').trim().toLowerCase() === companyName.toLowerCase());

    return {
        client_id: linkedClient?.id || null,
        company_name: companyName || null,
        contact_name: String(valueFor('contact person', 'contact', 'contact name', 'name') || '').trim() || null,
        contact_email: String(valueFor('email', 'contact email') || '').trim() || null,
        contact_phone: String(valueFor('phone', 'contact phone', 'mobile') || '').trim() || null,
        opportunity_title: String(valueFor('opportunity', 'deal', 'title', 'project') || companyName || '').trim() || null,
        stage: normalizeSalesStage(String(valueFor('stage', 'status', 'pipeline stage') || 'Lead')),
        source: String(valueFor('source', 'lead source') || '').trim() || null,
        estimated_value: normalizeSalesNumber(valueFor('value', 'estimated value', 'amount', 'deal value')),
        expected_close_date: normalizeSalesDate(valueFor('expected close date', 'close date', 'expected close', 'date')),
        probability: normalizeSalesProbability(valueFor('probability', 'chance', 'probability percent')),
        priority: normalizeSalesPriority(String(valueFor('priority', 'deal priority') || 'medium')),
        owner_name: String(valueFor('owner', 'sales owner', 'rep', 'sales rep') || currentProfile?.username || currentProfile?.email || '').trim() || null,
        lost_reason: String(valueFor('lost reason', 'reason lost', 'loss reason') || '').trim() || null,
        notes: String(valueFor('notes', 'comments', 'description') || '').trim() || null,
        quote_status: normalizeQuoteStatus(String(valueFor('quote status', 'quote', 'quote stage') || 'Not Started')),
        quote_reference: String(valueFor('quote reference', 'quote ref', 'quote number') || '').trim() || null,
        quote_sent_date: normalizeSalesDate(valueFor('quote sent date', 'quote date', 'sent date')),
        next_follow_up_date: normalizeSalesDate(valueFor('follow up date', 'next follow up', 'next action date')),
        created_by: currentProfile?.username || currentProfile?.email || 'Sales Import',
        imported_at: new Date().toISOString()
    };
}

async function addSalesActivity() {
    const opportunityId = document.getElementById('sales-activity-opportunity-id')?.value || '';
    const activityType = document.getElementById('sales-activity-type')?.value || 'Note';
    const activityNote = document.getElementById('sales-activity-note')?.value.trim() || '';
    const nextActionDate = document.getElementById('sales-activity-next-action-date')?.value || null;
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;

    if (!opportunityId) {
        if (typeof showToast === 'function') showToast('Select an opportunity before logging activity.', 'error');
        return;
    }
    if (!activityNote) {
        if (typeof showToast === 'function') showToast('Add an activity note first.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving sales activity...');
        const { error } = await window.supabaseClient.from('sales_activities').insert([{
            opportunity_id: opportunityId,
            activity_type: activityType,
            activity_note: activityNote,
            next_action_date: nextActionDate,
            created_by: currentProfile?.username || currentProfile?.email || 'Sales Portal'
        }]);
        if (error) throw error;

        if (nextActionDate) {
            await window.supabaseClient
                .from('sales_opportunities')
                .update({ next_follow_up_date: nextActionDate })
                .eq('id', opportunityId);
        }

        setSalesFormValue('sales-activity-note', '');
        setSalesFormValue('sales-activity-next-action-date', '');
        if (typeof showToast === 'function') showToast('Sales activity logged.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales activity error:', error);
        if (typeof showToast === 'function') showToast('Failed to log activity: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function renderSalesActivityLog() {
    const container = document.getElementById('sales-activity-log');
    const opportunityId = document.getElementById('sales-activity-opportunity-id')?.value || '';
    if (!container) return;

    if (!opportunityId) {
        container.innerHTML = '<div class="dashboard-empty-state">Select an opportunity to view activity.</div>';
        return;
    }

    const relevant = salesActivities.filter(item => item.opportunity_id === opportunityId);
    if (!relevant.length) {
        container.innerHTML = '<div class="dashboard-empty-state">No sales activity logged for this opportunity yet.</div>';
        return;
    }

    container.innerHTML = relevant.map(item => `
        <div class="dashboard-stack-item">
            <div class="dashboard-stack-item-top">
                <div class="dashboard-stack-item-title">${escapeSalesHtml(item.activity_type || 'Activity')}</div>
                <strong>${escapeSalesHtml(formatSalesActivityDate(item.created_at))}</strong>
            </div>
            <div class="dashboard-stack-item-meta">
                <div>${escapeSalesHtml(item.activity_note || '')}</div>
                <div>${escapeSalesHtml(item.created_by || 'Unknown')} &bull; Next action: ${escapeSalesHtml(item.next_action_date || 'Not set')}</div>
            </div>
        </div>
    `).join('');
}

function downloadSalesImportTemplate() {
    const rows = [
        {
            Company: 'Example Client',
            Opportunity: 'Temperature logger rollout',
            'Contact Person': 'Jane Doe',
            Email: 'jane@example.com',
            Phone: '+27 12 345 6789',
            Stage: 'Quoted',
            Source: 'Referral',
            'Estimated Value': 125000,
            'Expected Close Date': new Date().toISOString().split('T')[0],
            Probability: 70,
            'Quote Status': 'Sent',
            'Quote Reference': 'Q-2026-001',
            'Quote Sent Date': new Date().toISOString().split('T')[0],
            'Next Follow Up Date': new Date().toISOString().split('T')[0],
            Owner: 'Sales Team',
            Notes: 'Scope agreed, awaiting sign-off.'
            ,
            Priority: 'high',
            'Lost Reason': ''
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Import');
    XLSX.writeFile(workbook, 'sales_portal_import_template.xlsx');
    if (typeof showToast === 'function') showToast('Sales import template downloaded.', 'success');
}

function quickFilterSalesStage(stage) {
    const stageFilter = document.getElementById('sales-stage-filter');
    if (!stageFilter) return;
    stageFilter.value = stage;
    renderSalesPortal();
}

function resetSalesFilters() {
    setSalesFormValue('sales-search-input', '');
    setSalesFormValue('sales-stage-filter', '');
    setSalesFormValue('sales-owner-filter', '');
    setSalesFormValue('sales-priority-filter', '');
    renderSalesPortal();
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
        reader.readAsDataURL(file);
    });
}

async function saveSalesClientDocument() {
    const selectedClient = document.getElementById('sales-doc-client-id')?.value || '';
    const clientId = selectedClient || (String(activeSalesClientId || '').startsWith('prospect:') ? '' : activeSalesClientId || '');
    const prospectClientName = document.getElementById('sales-doc-prospect-client-name')?.value.trim() || null;
    const title = document.getElementById('sales-doc-title')?.value.trim() || '';
    const reportType = document.getElementById('sales-doc-type')?.value || 'General';
    const reportStatus = document.getElementById('sales-doc-status')?.value || 'Draft';
    const reportDate = document.getElementById('sales-doc-date')?.value || null;
    const summary = document.getElementById('sales-doc-summary')?.value.trim() || null;
    const file = document.getElementById('sales-doc-file')?.files?.[0] || null;
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;

    if (!clientId) {
        if (typeof showToast === 'function') showToast('Select a client before saving a sales file.', 'error');
        return;
    }
    if (isOtherSalesClientValue(clientId) && !prospectClientName) {
        if (typeof showToast === 'function') showToast('Enter a prospect or unlisted client name for this file.', 'error');
        return;
    }
    if (!title) {
        if (typeof showToast === 'function') showToast('Enter a title for the sales file.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving sales file...');
        const payload = {
            client_id: getSelectedSalesClientId('sales-doc-client-id'),
            report_title: title,
            report_type: reportType,
            report_status: reportStatus,
            report_date: reportDate,
            summary: prospectClientName ? `${summary || ''}${summary ? ' | ' : ''}Client: ${prospectClientName}` : summary,
            source_type: file ? 'file_upload' : 'manual',
            file_name: file?.name || null,
            file_mime_type: file?.type || null,
            file_content_base64: file ? await fileToBase64(file) : null,
            created_by: currentProfile?.username || currentProfile?.email || 'Sales Portal',
            imported_batch_label: 'sales_portal',
            workspace_module: 'sales',
            document_category: normalizeSalesDocumentCategory(reportType)
        };

        const { error } = await insertSalesClientReportRecord(payload);
        if (error) throw error;

        clearSalesDocumentForm();
        if (typeof showToast === 'function') showToast('Sales file saved to the client workspace.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales document save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save sales file: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function clearSalesDocumentForm() {
    setSalesFormValue('sales-doc-title', '');
    setSalesFormValue('sales-doc-status', 'Draft');
    setSalesFormValue('sales-doc-date', '');
    setSalesFormValue('sales-doc-summary', '');
    setSalesFormValue('sales-doc-prospect-client-name', '');
    const fileInput = document.getElementById('sales-doc-file');
    if (fileInput) fileInput.value = '';
    toggleSalesProspectClientInputs();
}

function normalizeSalesDocumentCategory(reportType) {
    const normalized = String(reportType || 'General').trim().toLowerCase();
    if (normalized.includes('invoice')) return 'invoice';
    if (normalized.includes('report')) return 'sales_report';
    if (normalized.includes('proposal')) return 'proposal';
    if (normalized.includes('quote')) return 'quote_pack';
    return 'general';
}

async function saveSalesCustomReportTemplate() {
    const templateName = document.getElementById('sales-report-title')?.value.trim() || '';
    const clientId = document.getElementById('sales-report-client-id')?.value || null;
    const reportType = document.getElementById('sales-report-type')?.value || 'Custom Narrative';
    const templateBody = document.getElementById('sales-report-body')?.value.trim() || '';
    const prospectClientName = document.getElementById('sales-report-prospect-client-name')?.value.trim() || null;
    const dateFrom = document.getElementById('sales-report-date-from')?.value || null;
    const dateTo = document.getElementById('sales-report-date-to')?.value || null;
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;

    if (!templateName) {
        if (typeof showToast === 'function') showToast('Enter a report title before saving a template.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving report template...');
        const payload = {
            template_name: templateName,
            client_id: getSelectedSalesClientId('sales-report-client-id'),
            report_type: reportType,
            template_body: prospectClientName ? `${templateBody}\n\nProspect / Unlisted Client: ${prospectClientName}`.trim() : templateBody,
            filter_date_from: dateFrom,
            filter_date_to: dateTo,
            created_by: currentProfile?.username || currentProfile?.email || 'Sales Portal'
        };

        const { error } = await window.supabaseClient.from('sales_report_templates').insert([payload]);
        if (error) {
            const fallbackTemplates = [
                {
                    id: `local:${Date.now()}`,
                    ...payload,
                    updated_at: new Date().toISOString()
                },
                ...readLocalSalesReportTemplates()
            ];
            writeLocalSalesReportTemplates(fallbackTemplates);
        }

        if (typeof showToast === 'function') showToast('Sales report template saved.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales report template save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save sales report template: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function generateSalesCustomReport() {
    const reportTitle = document.getElementById('sales-report-title')?.value.trim() || '';
    const clientId = document.getElementById('sales-report-client-id')?.value || null;
    const reportType = document.getElementById('sales-report-type')?.value || 'Custom Narrative';
    const reportStatus = document.getElementById('sales-report-status')?.value || 'Draft';
    const dateFrom = document.getElementById('sales-report-date-from')?.value || null;
    const dateTo = document.getElementById('sales-report-date-to')?.value || null;
    const reportBody = document.getElementById('sales-report-body')?.value.trim() || '';
    const prospectClientName = document.getElementById('sales-report-prospect-client-name')?.value.trim() || null;
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;

    if (!reportTitle) {
        if (typeof showToast === 'function') showToast('Enter a title before saving the sales report.', 'error');
        return;
    }

    const reportSummary = buildSalesCustomReportSummary({ reportType, clientId, dateFrom, dateTo, reportBody });
    const fullReportBody = buildFairbridgeSalesReportDocument({
        reportTitle,
        clientId: getSelectedSalesClientId('sales-report-client-id'),
        reportType,
        reportStatus,
        dateFrom,
        dateTo,
        reportBody,
        prospectClientName,
        preparedBy: currentProfile?.username || currentProfile?.email || 'Sales Portal'
    });

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving sales report...');
        const payload = {
            client_id: getSelectedSalesClientId('sales-report-client-id'),
            report_title: reportTitle,
            report_type: reportType,
            report_status: reportStatus,
            report_date: toSalesDateKey(new Date()),
            summary: prospectClientName ? `${reportSummary} | Prospect: ${prospectClientName}` : reportSummary,
            source_type: 'manual',
            file_name: null,
            file_mime_type: 'text/plain',
            file_content_base64: btoa(unescape(encodeURIComponent(fullReportBody))),
            created_by: currentProfile?.username || currentProfile?.email || 'Sales Portal',
            imported_batch_label: 'sales_portal',
            workspace_module: 'sales',
            document_category: 'sales_report',
            report_body: fullReportBody
        };

        const { error } = await insertSalesClientReportRecord(payload);
        if (error) throw error;

        if (typeof showToast === 'function') showToast('Sales report generated and saved in Sales Reports.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales report generation error:', error);
        if (typeof showToast === 'function') showToast('Failed to save sales report: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function insertSalesClientReportRecord(payload) {
    const primaryAttempt = await window.supabaseClient.from('client_reports').insert([payload]);
    if (!primaryAttempt.error) return primaryAttempt;

    if (!isSalesSchemaColumnError(primaryAttempt.error, ['workspace_module', 'document_category', 'report_body'])) {
        return primaryAttempt;
    }

    const fallbackPayload = { ...payload };
    delete fallbackPayload.workspace_module;
    delete fallbackPayload.document_category;
    delete fallbackPayload.report_body;
    return window.supabaseClient.from('client_reports').insert([fallbackPayload]);
}

function buildSalesCustomReportSummary({ reportType, clientId, dateFrom, dateTo, reportBody }) {
    const relevantOpportunities = salesOpportunities.filter(item => {
        if (clientId && !String(clientId).startsWith('prospect:') && String(item.client_id || '') !== String(clientId)) return false;
        if (dateFrom) {
            const compareDate = String(item.created_at || item.updated_at || '').slice(0, 10);
            if (compareDate && compareDate < dateFrom) return false;
        }
        if (dateTo) {
            const compareDate = String(item.created_at || item.updated_at || '').slice(0, 10);
            if (compareDate && compareDate > dateTo) return false;
        }
        return true;
    });

    const totalValue = relevantOpportunities.reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0);
    const wonCount = relevantOpportunities.filter(item => item.stage === 'Won').length;
    const openCount = relevantOpportunities.filter(item => !isSalesClosedStage(item.stage)).length;
    const clientLabel = clientId ? (getCurrentSalesClients().find(client => String(client.id) === String(clientId))?.label || 'Selected client') : 'All client workspaces';
    const reportLead = reportBody ? reportBody.slice(0, 220) : 'Custom sales report summary';

    return `${reportType} | ${clientLabel} | Open deals: ${openCount} | Won deals: ${wonCount} | Pipeline value: ${formatSalesCurrency(totalValue)} | Window: ${dateFrom || 'start'} to ${dateTo || 'today'} | ${reportLead}`;
}

function applySalesReportTemplate(templateId) {
    const template = salesReportTemplates.find(item => String(item.id) === String(templateId));
    if (!template) return;

    setSalesFormValue('sales-report-title', template.template_name || '');
    setSalesFormValue('sales-report-client-id', template.client_id || '');
    setSalesFormValue('sales-report-type', template.report_type || 'Custom Narrative');
    setSalesFormValue('sales-report-date-from', template.filter_date_from || '');
    setSalesFormValue('sales-report-date-to', template.filter_date_to || '');
    setSalesFormValue('sales-report-body', template.template_body || '');
}

function loadGeneratedSalesReport(reportId) {
    const report = salesClientDocuments.find(item => String(item.id) === String(reportId));
    if (!report) {
        if (typeof showToast === 'function') showToast('Could not find that saved report.', 'error');
        return;
    }

    setSalesFormValue('sales-report-title', report.report_title || '');
    setSalesFormValue('sales-report-client-id', report.client_id || '');
    setSalesFormValue('sales-report-type', report.report_type || 'Custom Narrative');
    setSalesFormValue('sales-report-status', report.report_status || 'Draft');
    setSalesFormValue('sales-report-date-from', '');
    setSalesFormValue('sales-report-date-to', '');
    setSalesFormValue('sales-report-body', readSalesReportBody(report));
    setSalesFormValue('sales-report-prospect-client-name', extractProspectClientFromText(readSalesReportBody(report)) || '');
    toggleSalesProspectClientInputs();
    switchSalesSection('reports');
    if (typeof showToast === 'function') showToast('Saved report loaded into the builder.', 'success');
}

async function deleteGeneratedSalesReport(reportId) {
    const report = salesClientDocuments.find(item => String(item.id) === String(reportId));
    if (!report) {
        if (typeof showToast === 'function') showToast('Could not find that saved report.', 'error');
        return;
    }

    const confirmed = window.confirm(`Delete saved report "${report.report_title || 'Untitled Sales Report'}"?`);
    if (!confirmed) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting sales report...');
        const { error } = await window.supabaseClient.from('client_reports').delete().eq('id', reportId);
        if (error) throw error;
        if (typeof showToast === 'function') showToast('Saved sales report deleted.', 'success');
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales report delete error:', error);
        if (typeof showToast === 'function') showToast('Failed to delete sales report: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function readSalesReportBody(report) {
    if (report.report_body) return String(report.report_body);
    if (report.file_content_base64) {
        try {
            return decodeURIComponent(escape(atob(report.file_content_base64)));
        } catch (error) {
            return report.summary || '';
        }
    }
    return report.summary || '';
}

function extractProspectClientFromText(text) {
    const match = String(text || '').match(/Prospect \/ Unlisted Client:\s*(.+)/i);
    return match ? String(match[1]).trim() : '';
}

function buildFairbridgeSalesReportDocument({ reportTitle, clientId, reportType, reportStatus, dateFrom, dateTo, reportBody, prospectClientName, preparedBy }) {
    const relevantOpportunities = salesOpportunities.filter(item => {
        if (clientId && String(item.client_id || '') !== String(clientId)) return false;
        const compareDate = String(item.updated_at || item.created_at || '').slice(0, 10);
        if (dateFrom && compareDate && compareDate < dateFrom) return false;
        if (dateTo && compareDate && compareDate > dateTo) return false;
        return true;
    });

    const clientLabel = prospectClientName
        || (clientId ? (getCurrentSalesClients().find(client => String(client.id) === String(clientId))?.label || 'Selected Client') : 'All Client Workspaces');
    const openDeals = relevantOpportunities.filter(item => !isSalesClosedStage(item.stage));
    const wonDeals = relevantOpportunities.filter(item => item.stage === 'Won');
    const weightedForecast = openDeals.reduce((sum, item) => sum + ((Number(item.estimated_value) || 0) * ((Number(item.probability) || 0) / 100)), 0);
    const overdueDeals = openDeals.filter(item => item.next_follow_up_date && item.next_follow_up_date < toSalesDateKey(new Date()));
    const quoteRisks = openDeals.filter(item => item.quote_expiry_date && item.quote_expiry_date <= addDaysToSalesDate(new Date(), 7));
    const topDeals = [...relevantOpportunities]
        .sort((left, right) => (Number(right.estimated_value) || 0) - (Number(left.estimated_value) || 0))
        .slice(0, 5);

    const executiveSummary = reportBody || 'Sales update prepared from the current Fairbridge opportunity workspace.';
    const topDealLines = topDeals.length
        ? topDeals.map((item, index) => `${index + 1}. ${item.company_name || 'Account'} | ${item.opportunity_title || 'Opportunity'} | ${item.stage || 'Lead'} | ${formatSalesCurrency(item.estimated_value || 0)} | Probability ${Math.max(0, Math.min(100, Number(item.probability) || 0))}%`).join('\n')
        : 'No matching opportunities were found for this report window.';

    return [
        'FAIRBRIDGE TECHNOLOGIES',
        reportTitle || 'Sales Report',
        '',
        `Report Type: ${reportType}`,
        `Status: ${reportStatus}`,
        `Client Scope: ${clientLabel}`,
        `Reporting Window: ${dateFrom || 'Start'} to ${dateTo || 'Today'}`,
        `Prepared By: ${preparedBy || 'Sales Portal'}`,
        `Prepared On: ${formatSalesActivityDate(new Date().toISOString())}`,
        '',
        '1. Executive Summary',
        executiveSummary,
        '',
        '2. Commercial Snapshot',
        `Open Opportunities: ${openDeals.length}`,
        `Won Opportunities: ${wonDeals.length}`,
        `Pipeline Value: ${formatSalesCurrency(openDeals.reduce((sum, item) => sum + (Number(item.estimated_value) || 0), 0))}`,
        `Weighted Forecast: ${formatSalesCurrency(weightedForecast)}`,
        '',
        '3. Risk And Attention Items',
        `Overdue Follow-Ups: ${overdueDeals.length}`,
        `Quotes Expiring Within 7 Days: ${quoteRisks.length}`,
        `Won Deals Not Yet Invoiced: ${wonDeals.filter(item => ['not_invoiced', 'draft', '', null, undefined].includes(item.invoice_status)).length}`,
        '',
        '4. Priority Opportunity List',
        topDealLines,
        '',
        '5. Recommended Next Actions',
        '- Confirm ownership on overdue or stale deals.',
        '- Review quote expiry risk and client response timelines.',
        '- Ensure won work is invoiced and handed over promptly.',
        '',
        '6. Additional Notes',
        reportBody || 'No additional notes supplied.'
    ].join('\n');
}

function applySalesReportPreset(presetKey) {
    const today = toSalesDateKey(new Date());
    const monthStart = `${today.slice(0, 8)}01`;
    if (presetKey === 'pipeline') {
        setSalesFormValue('sales-report-title', 'Pipeline Health Review');
        setSalesFormValue('sales-report-type', 'Pipeline Summary');
        setSalesFormValue('sales-report-status', 'Draft');
        setSalesFormValue('sales-report-date-from', monthStart);
        setSalesFormValue('sales-report-date-to', today);
        setSalesFormValue('sales-report-body', 'Focus areas: weighted forecast, stale deals, and stage bottlenecks.');
    } else if (presetKey === 'follow_up') {
        setSalesFormValue('sales-report-title', 'Follow-Up Execution Review');
        setSalesFormValue('sales-report-type', 'Follow-Up Review');
        setSalesFormValue('sales-report-status', 'Draft');
        setSalesFormValue('sales-report-date-from', addDaysToSalesDate(today, -14));
        setSalesFormValue('sales-report-date-to', today);
        setSalesFormValue('sales-report-body', 'Review overdue follow-ups, ownership, and next action commitments.');
    } else if (presetKey === 'won_not_invoiced') {
        setSalesFormValue('sales-report-title', 'Won Deals Awaiting Invoice');
        setSalesFormValue('sales-report-type', 'Invoice Register');
        setSalesFormValue('sales-report-status', 'Draft');
        setSalesFormValue('sales-report-date-from', addDaysToSalesDate(today, -30));
        setSalesFormValue('sales-report-date-to', today);
        setSalesFormValue('sales-report-body', 'List won opportunities without invoices and confirm handover + billing owners.');
    } else if (presetKey === 'quote_expiry') {
        setSalesFormValue('sales-report-title', 'Quote Expiry Risk Review');
        setSalesFormValue('sales-report-type', 'Follow-Up Review');
        setSalesFormValue('sales-report-status', 'Draft');
        setSalesFormValue('sales-report-date-from', today);
        setSalesFormValue('sales-report-date-to', addDaysToSalesDate(today, 14));
        setSalesFormValue('sales-report-body', 'Track quotes expiring soon and required client follow-ups.');
    } else if (presetKey === 'fairbridge_full') {
        setSalesFormValue('sales-report-title', 'Fairbridge Commercial Performance Report');
        setSalesFormValue('sales-report-type', 'Custom Narrative');
        setSalesFormValue('sales-report-status', 'Draft');
        setSalesFormValue('sales-report-date-from', monthStart);
        setSalesFormValue('sales-report-date-to', today);
        setSalesFormValue('sales-report-body', 'Summarise the current commercial position, key risks, client commitments, delivery dependencies, and recommended actions for leadership review.');
    }
}

function downloadSalesClientDocument(documentId) {
    const doc = salesClientDocuments.find(item => String(item.id) === String(documentId));
    if (!doc?.file_content_base64) return;

    const byteCharacters = atob(doc.file_content_base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let index = 0; index < byteCharacters.length; index += 1) {
        byteNumbers[index] = byteCharacters.charCodeAt(index);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: doc.file_mime_type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = doc.file_name || `${doc.report_title || 'sales-file'}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
}

function selectSalesClientWorkspace(clientId) {
    activeSalesClientId = clientId;
    const filteredClients = getFilteredSalesClients();
    renderSalesClientWorkspace(filteredClients);
    if (activeSalesSection !== 'clients') {
        switchSalesSection('clients');
    }
}

function setSalesText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setSalesFormValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value ?? '';
}

function normalizeSalesNumber(value) {
    const normalized = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeSalesProbability(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return 0;
    return Math.max(0, Math.min(100, Math.round(normalized)));
}

function normalizeSalesPriority(value) {
    const normalized = String(value || 'medium').trim().toLowerCase();
    if (['low', 'medium', 'high', 'urgent'].includes(normalized)) return normalized;
    return 'medium';
}

function normalizeSalesInvoiceStatus(value) {
    const normalized = String(value || 'not_invoiced').trim().toLowerCase();
    const allowed = ['not_invoiced', 'draft', 'issued', 'part_paid', 'paid', 'overdue', 'cancelled'];
    return allowed.includes(normalized) ? normalized : 'not_invoiced';
}

function normalizeSalesTemperature(value) {
    const normalized = String(value || 'warm').trim().toLowerCase();
    const allowed = ['hot', 'warm', 'cold'];
    return allowed.includes(normalized) ? normalized : 'warm';
}

function categorizeClosedReason(reasonText) {
    const text = String(reasonText || '').toLowerCase();
    if (!text) return null;
    if (text.includes('price') || text.includes('cost') || text.includes('budget')) return 'pricing';
    if (text.includes('tim') || text.includes('delay')) return 'timeline';
    if (text.includes('compet')) return 'competition';
    if (text.includes('scope') || text.includes('fit')) return 'scope_fit';
    return 'other';
}

function normalizeSalesDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().split('T')[0];
    }
    if (typeof value === 'number' && XLSX?.SSF) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
            const month = String(parsed.m).padStart(2, '0');
            const day = String(parsed.d).padStart(2, '0');
            return `${parsed.y}-${month}-${day}`;
        }
    }
    const asString = String(value).trim();
    if (!asString) return null;
    const parsed = new Date(asString);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
}

function normalizeSalesStage(stage) {
    const normalized = String(stage || '').trim().toLowerCase();
    const matched = SALES_STAGE_ORDER.find(option => option.toLowerCase() === normalized);
    return matched || 'Lead';
}

function normalizeQuoteStatus(status) {
    const allowed = ['Not Started', 'Draft', 'Sent', 'Revised', 'Accepted', 'Declined'];
    const normalized = String(status || '').trim().toLowerCase();
    const match = allowed.find(option => option.toLowerCase() === normalized);
    return match || 'Not Started';
}

function formatSalesCurrency(value) {
    const normalized = Number(value) || 0;
    return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        maximumFractionDigits: 0
    }).format(normalized);
}

function formatSalesActivityDate(value) {
    if (!value) return 'No date';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeSalesHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function focusSalesOpportunity(id) {
    editSalesOpportunity(id);
}

function openSalesOpportunityEdit(id) {
    editSalesOpportunity(id);
}

function createSalesOpportunityHandover(id) {
    handoverSalesOpportunity(id);
}

function prepareSalesActivityForOpportunity(id, activityType = 'Follow-Up') {
    const item = salesOpportunities.find(entry => entry.id === id);
    if (!item) return;
    setSalesFormValue('sales-activity-opportunity-id', item.id);
    setSalesFormValue('sales-activity-type', activityType);
    setSalesFormValue('sales-activity-next-action-date', item.next_follow_up_date || toSalesDateKey(new Date()));
    renderSalesActivityLog();
    switchSalesSection('activity');
    const noteInput = document.getElementById('sales-activity-note');
    if (noteInput) noteInput.focus();
}

window.loadSalesPortalData = loadSalesPortalData;
window.saveSalesOpportunity = saveSalesOpportunity;
window.resetSalesOpportunityForm = resetSalesOpportunityForm;
window.editSalesOpportunity = editSalesOpportunity;
window.deleteSalesOpportunity = deleteSalesOpportunity;
window.handoverSalesOpportunity = handoverSalesOpportunity;
window.handleSalesImport = handleSalesImport;
window.downloadSalesImportTemplate = downloadSalesImportTemplate;
window.quickFilterSalesStage = quickFilterSalesStage;
window.resetSalesFilters = resetSalesFilters;
window.addSalesActivity = addSalesActivity;
window.focusSalesOpportunity = focusSalesOpportunity;
window.openSalesOpportunityEdit = openSalesOpportunityEdit;
window.createSalesOpportunityHandover = createSalesOpportunityHandover;
window.prepareSalesActivityForOpportunity = prepareSalesActivityForOpportunity;
window.selectSalesClientWorkspace = selectSalesClientWorkspace;
window.switchSalesSection = switchSalesSection;
window.saveSalesClientDocument = saveSalesClientDocument;
window.saveSalesCustomReportTemplate = saveSalesCustomReportTemplate;
window.generateSalesCustomReport = generateSalesCustomReport;
window.applySalesReportTemplate = applySalesReportTemplate;
window.loadGeneratedSalesReport = loadGeneratedSalesReport;
window.deleteGeneratedSalesReport = deleteGeneratedSalesReport;
window.applySalesReportPreset = applySalesReportPreset;
window.downloadSalesClientDocument = downloadSalesClientDocument;
