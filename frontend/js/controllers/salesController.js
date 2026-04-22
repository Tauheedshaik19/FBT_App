let salesOpportunities = [];
let salesClients = [];
let salesActivities = [];
let salesFiltersBound = false;

const SALES_STAGE_ORDER = ['Lead', 'Qualified', 'Quoted', 'Negotiation', 'Won', 'Lost'];

function getSalesPortalPermission() {
    return typeof hasAppPermission === 'function' ? hasAppPermission('canUseSalesPortal') : true;
}

async function loadSalesPortalData() {
    if (!getSalesPortalPermission()) {
        if (typeof showToast === 'function') showToast('Your role does not have access to the Sales Portal.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading sales portal...');

        const [{ data: opportunities, error: salesError }, { data: clients, error: clientError }, { data: activities, error: activityError }] = await Promise.all([
            window.supabaseClient.from('sales_opportunities').select('*').order('created_at', { ascending: false }),
            window.supabaseClient.from('clients').select('id, client_name').order('client_name', { ascending: true }),
            window.supabaseClient.from('sales_activities').select('*').order('created_at', { ascending: false })
        ]);

        if (salesError) throw salesError;
        if (clientError) throw clientError;
        if (activityError) throw activityError;

        salesOpportunities = opportunities || [];
        salesClients = clients || [];
        salesActivities = activities || [];

        bindSalesPortalFilters();
        populateSalesClientDropdown();
        populateSalesActivityOpportunityDropdown();
        if (!document.getElementById('sales-opportunity-id')?.value) {
            resetSalesOpportunityForm();
        }
        renderSalesPortal();
    } catch (error) {
        console.error('Sales portal load error:', error);
        if (typeof showToast === 'function') showToast('Failed to load sales portal: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function bindSalesPortalFilters() {
    if (salesFiltersBound) return;

    const searchInput = document.getElementById('sales-search-input');
    const stageFilter = document.getElementById('sales-stage-filter');
    const ownerFilter = document.getElementById('sales-owner-filter');
    const activityOpportunitySelect = document.getElementById('sales-activity-opportunity-id');

    [searchInput, stageFilter, ownerFilter].forEach(input => {
        if (!input) return;
        input.addEventListener('input', renderSalesPortal);
        input.addEventListener('change', renderSalesPortal);
    });

    if (activityOpportunitySelect) {
        activityOpportunitySelect.addEventListener('change', renderSalesActivityLog);
    }

    salesFiltersBound = true;
}

function populateSalesClientDropdown() {
    const select = document.getElementById('sales-client-id');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Prospect / not linked yet</option>';

    salesClients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.client_name;
        select.appendChild(option);
    });

    if (currentValue) {
        select.value = currentValue;
    }
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

function getFilteredSalesOpportunities() {
    const searchValue = String(document.getElementById('sales-search-input')?.value || '').trim().toLowerCase();
    const stageValue = String(document.getElementById('sales-stage-filter')?.value || '').trim();
    const ownerValue = String(document.getElementById('sales-owner-filter')?.value || '').trim().toLowerCase();

    return salesOpportunities.filter(item => {
        const matchesSearch = !searchValue || [
            item.company_name,
            item.opportunity_title,
            item.contact_name,
            item.contact_email,
            item.owner_name,
            item.stage,
            item.source,
            item.notes
        ].some(value => String(value || '').toLowerCase().includes(searchValue));

        const matchesStage = !stageValue || item.stage === stageValue;
        const matchesOwner = !ownerValue || String(item.owner_name || '').toLowerCase().includes(ownerValue);
        return matchesSearch && matchesStage && matchesOwner;
    });
}

function renderSalesPortal() {
    const filtered = getFilteredSalesOpportunities();
    renderSalesSummary(filtered);
    renderSalesConversionChart(filtered);
    renderSalesTable(filtered);
    renderSalesActivityLog();
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

    setSalesText('sales-summary-open-count', openDeals);
    setSalesText('sales-summary-pipeline-value', formatSalesCurrency(pipelineValue));
    setSalesText('sales-summary-won-count', wonThisMonth);
    setSalesText('sales-summary-handover-count', pendingHandovers);
    setSalesText('sales-summary-quotes-sent', quotesSent);
    setSalesText('sales-summary-quotes-accepted', acceptedQuotes);
    setSalesText('sales-summary-followups-due', followUpsDue);
    setSalesText('sales-summary-won-value', formatSalesCurrency(wonValue));
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
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; color: var(--text-secondary);">No opportunities match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = items.map(item => {
        const handoverLabel = item.handover_status === 'created'
            ? `Job Ready${item.handover_job_id ? ` (${escapeSalesHtml(item.handover_job_id.slice(0, 8))})` : ''}`
            : item.stage === 'Won'
                ? 'Ready For Ops'
                : 'Not Ready';

        const canHandover = item.stage === 'Won' && item.handover_status !== 'created';
        return `
            <tr>
                <td>
                    <strong>${escapeSalesHtml(item.company_name || 'Untitled Account')}</strong>
                    <div style="color: var(--text-secondary); margin-top: 4px;">${escapeSalesHtml(item.contact_name || item.contact_email || 'No contact')}</div>
                </td>
                <td>
                    <strong>${escapeSalesHtml(item.opportunity_title || 'Untitled Opportunity')}</strong>
                    <div style="color: var(--text-secondary); margin-top: 4px;">${escapeSalesHtml(item.source || 'No source')}</div>
                </td>
                <td><span class="badge ${salesStageBadge(item.stage)}">${escapeSalesHtml(item.stage || 'Lead')}</span></td>
                <td>${escapeSalesHtml(item.owner_name || 'Unassigned')}</td>
                <td>${formatSalesCurrency(item.estimated_value || 0)}</td>
                <td>${escapeSalesHtml(item.quote_status || 'Not Started')}${item.quote_reference ? `<div style="color: var(--text-secondary); margin-top:4px;">${escapeSalesHtml(item.quote_reference)}</div>` : ''}</td>
                <td>${Math.max(0, Math.min(100, Number(item.probability) || 0))}%</td>
                <td>${escapeSalesHtml(item.next_follow_up_date || 'Not set')}</td>
                <td>${escapeSalesHtml(item.expected_close_date || 'Not set')}</td>
                <td>${escapeSalesHtml(handoverLabel)}</td>
                <td style="text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                        <button class="btn btn-small" onclick="editSalesOpportunity('${item.id}')">Edit</button>
                        <button class="btn btn-small" onclick="deleteSalesOpportunity('${item.id}')">Delete</button>
                        <button class="btn btn-small btn-primary" ${canHandover ? '' : 'disabled'} onclick="handoverSalesOpportunity('${item.id}')">Handover</button>
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

        const operation = recordId
            ? window.supabaseClient.from('sales_opportunities').update(payload).eq('id', recordId)
            : window.supabaseClient.from('sales_opportunities').insert([payload]);

        const { error } = await operation;
        if (error) throw error;

        if (typeof showToast === 'function') showToast(recordId ? 'Opportunity updated successfully.' : 'Opportunity added to the sales pipeline.', 'success');
        resetSalesOpportunityForm();
        await loadSalesPortalData();
    } catch (error) {
        console.error('Sales save error:', error);
        if (typeof showToast === 'function') showToast('Failed to save opportunity: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function readSalesOpportunityForm() {
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    return {
        client_id: document.getElementById('sales-client-id')?.value || null,
        company_name: document.getElementById('sales-company-name')?.value.trim() || null,
        contact_name: document.getElementById('sales-contact-name')?.value.trim() || null,
        contact_email: document.getElementById('sales-contact-email')?.value.trim() || null,
        contact_phone: document.getElementById('sales-contact-phone')?.value.trim() || null,
        opportunity_title: document.getElementById('sales-opportunity-title')?.value.trim() || null,
        stage: document.getElementById('sales-stage')?.value || 'Lead',
        source: document.getElementById('sales-source')?.value.trim() || null,
        estimated_value: normalizeSalesNumber(document.getElementById('sales-estimated-value')?.value),
        expected_close_date: document.getElementById('sales-expected-close-date')?.value || null,
        probability: normalizeSalesProbability(document.getElementById('sales-probability')?.value),
        quote_status: document.getElementById('sales-quote-status')?.value || 'Not Started',
        quote_reference: document.getElementById('sales-quote-reference')?.value.trim() || null,
        quote_sent_date: document.getElementById('sales-quote-sent-date')?.value || null,
        next_follow_up_date: document.getElementById('sales-next-follow-up-date')?.value || null,
        owner_name: document.getElementById('sales-owner-name')?.value.trim() || currentProfile?.username || currentProfile?.email || null,
        notes: document.getElementById('sales-notes')?.value.trim() || null,
        created_by: currentProfile?.username || currentProfile?.email || 'Unknown User'
    };
}

function editSalesOpportunity(id) {
    const item = salesOpportunities.find(entry => entry.id === id);
    if (!item) return;

    setSalesFormValue('sales-opportunity-id', item.id);
    setSalesFormValue('sales-company-name', item.company_name);
    setSalesFormValue('sales-contact-name', item.contact_name);
    setSalesFormValue('sales-contact-email', item.contact_email);
    setSalesFormValue('sales-contact-phone', item.contact_phone);
    setSalesFormValue('sales-opportunity-title', item.opportunity_title);
    setSalesFormValue('sales-client-id', item.client_id);
    setSalesFormValue('sales-stage', item.stage || 'Lead');
    setSalesFormValue('sales-source', item.source);
    setSalesFormValue('sales-estimated-value', item.estimated_value);
    setSalesFormValue('sales-expected-close-date', item.expected_close_date);
    setSalesFormValue('sales-probability', item.probability);
    setSalesFormValue('sales-quote-status', item.quote_status || 'Not Started');
    setSalesFormValue('sales-quote-reference', item.quote_reference);
    setSalesFormValue('sales-quote-sent-date', item.quote_sent_date);
    setSalesFormValue('sales-next-follow-up-date', item.next_follow_up_date);
    setSalesFormValue('sales-owner-name', item.owner_name);
    setSalesFormValue('sales-notes', item.notes);
    setSalesFormValue('sales-activity-opportunity-id', item.id);

    const saveBtn = document.getElementById('sales-save-btn');
    if (saveBtn) saveBtn.textContent = 'Save Changes';
    renderSalesActivityLog();
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
    setSalesFormValue('sales-quote-status', 'Not Started');
}

async function deleteSalesOpportunity(id) {
    const item = salesOpportunities.find(entry => entry.id === id);
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
    const item = salesOpportunities.find(entry => entry.id === id);
    if (!item) return;
    if (item.stage !== 'Won') {
        if (typeof showToast === 'function') showToast('Only won deals can be handed over to operations.', 'error');
        return;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Creating operations handover...');

        const resolvedClientId = await resolveSalesClientForHandover(item);
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
            notes: `Sales handover created from opportunity ${item.opportunity_title || item.company_name}. Contact: ${item.contact_name || 'N/A'} | Email: ${item.contact_email || 'N/A'} | Phone: ${item.contact_phone || 'N/A'}`
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
        if (typeof loadJobsData === 'function') loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
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

    const { data, error } = await window.supabaseClient
        .from('clients')
        .insert([{
            client_name: item.company_name,
            company_name: item.company_name,
            contact_person: item.contact_name || null,
            contact_phone: item.contact_phone || null,
            contact_email: item.contact_email || null,
            status: 'active'
        }])
        .select('id, client_name')
        .maybeSingle();
    if (error) throw error;

    if (data) {
        salesClients.push(data);
        populateSalesClientDropdown();
        return data.id;
    }

    throw new Error('Client could not be resolved for handover.');
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
        owner_name: String(valueFor('owner', 'sales owner', 'rep', 'sales rep') || currentProfile?.username || currentProfile?.email || '').trim() || null,
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
    renderSalesPortal();
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
