let cachedClients = [];
let cachedSites = [];
let cachedTechs = [];
let jobsCache = [];
let currentEditingJobId = null;
let userRequestsCache = [];
let jobsLedgerFilterState = {
    search: '',
    status: '',
    jobType: '',
    client: '',
    site: '',
    technician: ''
};

const JOBS_LEDGER_HISTORY_YEARS = 2;
const JOBS_LEDGER_DEFAULT_LIMIT = 50;
const MAX_JOB_CARD_NUMBERS = 12;

const ACTIVE_JOB_STATUSES = ['Unassigned', 'Dispatched', 'In Progress', 'On Hold', 'Delayed'];
const JOB_STATUS_ORDER = ['Unassigned', 'Dispatched', 'In Progress', 'On Hold', 'Delayed', 'Completed'];

function getJobsPermissions() {
    return {
        canCreateJobs: typeof hasAppPermission === 'function' ? hasAppPermission('canCreateJobs') : true,
        canEditJobs: typeof hasAppPermission === 'function' ? hasAppPermission('canEditJobs') : true,
        canDeleteJobs: typeof hasAppPermission === 'function' ? hasAppPermission('canDeleteJobs') : true,
        canAssignJobs: typeof hasAppPermission === 'function' ? hasAppPermission('canAssignJobs') : true
    };
}

function canViewCreatedByColumn() {
    return getJobsPermissions().canAssignJobs;
}

function updateJobsCreatedByColumnVisibility() {
    const show = canViewCreatedByColumn();
    document.querySelectorAll('.jobs-created-by-col').forEach(el => {
        el.style.display = show ? '' : 'none';
    });
}

function showJobsPermissionError(message) {
    if (typeof showToast === 'function') showToast(message, 'error');
}

function setFormControlsDisabled(form, isDisabled) {
    if (!form) return;

    form.querySelectorAll('input, select, textarea, button').forEach(control => {
        if (control.type === 'button' || control.type === 'submit') return;
        control.disabled = isDisabled;
        if (control.matches('input:not([type="date"]):not([type="number"]), textarea')) {
            control.readOnly = isDisabled;
        }
    });
}

function applyJobModalPermissions() {
    const permissions = getJobsPermissions();
    const editForm = document.getElementById('editJobForm');
    const editTechSelect = document.getElementById('editJobTech');
    const saveButton = document.getElementById('saveJobEditBtn');
    const noteButton = document.getElementById('addJobNoteOnlyBtn');
    const deleteButton = document.getElementById('deleteCurrentJobBtn');
    const stepNoteInput = document.getElementById('editJobStepNote');

    setFormControlsDisabled(editForm, !permissions.canEditJobs);

    if (editTechSelect) {
        editTechSelect.disabled = !permissions.canEditJobs || !permissions.canAssignJobs;
    }

    if (stepNoteInput) {
        stepNoteInput.disabled = !permissions.canEditJobs;
        stepNoteInput.readOnly = !permissions.canEditJobs;
    }

    if (saveButton) saveButton.style.display = permissions.canEditJobs ? '' : 'none';
    if (noteButton) noteButton.style.display = permissions.canEditJobs ? '' : 'none';
    if (deleteButton) deleteButton.style.display = permissions.canDeleteJobs ? '' : 'none';
}

function applyNewJobPermissions() {
    const permissions = getJobsPermissions();
    const newJobTechSelect = document.getElementById('newJobTech');
    const submitButton = document.getElementById('dispatchJobBtn');

    if (newJobTechSelect) newJobTechSelect.disabled = !permissions.canAssignJobs;
    if (submitButton) submitButton.disabled = !permissions.canCreateJobs;
}

function parseJobDueTime(job) {
    if (!job?.scheduled_date) return Number.POSITIVE_INFINITY;
    const dueTime = new Date(`${job.scheduled_date}T00:00:00`).getTime();
    return Number.isNaN(dueTime) ? Number.POSITIVE_INFINITY : dueTime;
}

function sortJobsByDueDate(jobs) {
    return [...jobs].sort((left, right) => {
        const dueDiff = parseJobDueTime(left) - parseJobDueTime(right);
        if (dueDiff !== 0) return dueDiff;

        const leftCreated = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightCreated = right.created_at ? new Date(right.created_at).getTime() : 0;
        if (leftCreated !== rightCreated) return leftCreated - rightCreated;

        return (left.displayJobNumber || 0) - (right.displayJobNumber || 0);
    });
}

function hoursToDurationParts(totalHours) {
    const normalized = Math.max(0, Number(totalHours) || 0);
    const days = Math.floor(normalized / 24);
    const hours = Number((normalized - (days * 24)).toFixed(1));
    return { days, hours };
}

function durationPartsToHours(daysValue, hoursValue) {
    const days = Math.max(0, parseInt(daysValue || '0', 10) || 0);
    const hours = Math.max(0, Number(hoursValue || '0') || 0);
    return Number(((days * 24) + hours).toFixed(1));
}

function formatDurationDisplay(totalHours) {
    const { days, hours } = hoursToDurationParts(totalHours);
    const formattedHours = hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1);
    return `${days}d ${formattedHours}h`;
}

function parseJobCardNumbers(input) {
    if (Array.isArray(input)) {
        return input.map(value => String(value || '').trim()).filter(Boolean).slice(0, MAX_JOB_CARD_NUMBERS);
    }

    if (!input) return [];

    return String(input)
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean)
        .slice(0, MAX_JOB_CARD_NUMBERS);
}

function readJobCardNumbersFromInput(inputId) {
    const rawValue = document.getElementById(inputId)?.value || '';
    const parsedValues = rawValue
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean);

    if (parsedValues.length > MAX_JOB_CARD_NUMBERS) {
        throw new Error(`Only ${MAX_JOB_CARD_NUMBERS} job card numbers are allowed per job.`);
    }

    return parsedValues;
}

function formatJobCardsForInput(jobCardNumbers) {
    return parseJobCardNumbers(jobCardNumbers).join('\n');
}

function formatJobCardNumbersDisplay(jobCardNumbers) {
    const values = parseJobCardNumbers(jobCardNumbers);
    return values.length ? values.join(', ') : '-';
}

function getJobCardSummary(jobCardNumbers) {
    const values = parseJobCardNumbers(jobCardNumbers);
    if (!values.length) return 'No job cards';
    if (values.length <= 2) return values.join(' | ');
    return `${values.slice(0, 2).join(' | ')} +${values.length - 2}`;
}

async function ensureJobCardsBeforeCompletion(job) {
    const existingCards = parseJobCardNumbers(job?.job_card_numbers || job?.jobCardNumbers);
    if (existingCards.length) return existingCards;

    const promptValue = window.prompt(
        `Enter at least one job card number to complete "${job?.title || 'this job'}". You can add up to ${MAX_JOB_CARD_NUMBERS}. Separate multiple numbers with commas or new lines.`,
        ''
    );

    if (promptValue === null) return null;

    const enteredValues = String(promptValue)
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean);

    if (enteredValues.length > MAX_JOB_CARD_NUMBERS) {
        throw new Error(`Only ${MAX_JOB_CARD_NUMBERS} job card numbers are allowed per job.`);
    }

    const values = parseJobCardNumbers(enteredValues);
    if (!values.length) return null;

    return values;
}

async function updateJobCardNumbers(jobId, jobCardNumbers) {
    const { error } = await window.supabaseClient
        .from('jobs')
        .update({ job_card_numbers: parseJobCardNumbers(jobCardNumbers) })
        .eq('id', jobId);

    if (error) throw error;
}

function bindDurationInputs(daysId, hoursId, previewId) {
    const daysInput = document.getElementById(daysId);
    const hoursInput = document.getElementById(hoursId);
    const previewInput = document.getElementById(previewId);
    if (!daysInput || !hoursInput || !previewInput || daysInput.dataset.durationBound === 'true') return;

    const updatePreview = () => {
        previewInput.value = formatDurationDisplay(durationPartsToHours(daysInput.value, hoursInput.value));
    };

    daysInput.addEventListener('input', updatePreview);
    hoursInput.addEventListener('input', updatePreview);
    daysInput.dataset.durationBound = 'true';
    hoursInput.dataset.durationBound = 'true';
    updatePreview();
}

function bindCustomJobTypeInput() {
    const jobTypeSelect = document.getElementById('newJobType');
    const customTypeInput = document.getElementById('newJobCustomType');
    if (!jobTypeSelect || !customTypeInput || jobTypeSelect.dataset.customBound === 'true') return;

    const syncCustomTypeVisibility = () => {
        const isCustom = jobTypeSelect.value === 'Custom';
        customTypeInput.style.display = isCustom ? 'block' : 'none';
        customTypeInput.required = isCustom;
        if (!isCustom) customTypeInput.value = '';
    };

    jobTypeSelect.addEventListener('change', syncCustomTypeVisibility);
    jobTypeSelect.dataset.customBound = 'true';
    syncCustomTypeVisibility();
}

function switchJobsPanel(panel, btn) {
    document.querySelectorAll('.jobs-tab-btn').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.jobs-panel').forEach(section => section.classList.remove('active'));

    if (btn) btn.classList.add('active');
    const target = document.getElementById(`jobs-panel-${panel}`);
    if (target) target.classList.add('active');
}

function getPrimaryAssignment(job) {
    if (!Array.isArray(job.job_assignments) || job.job_assignments.length === 0) return null;
    return job.job_assignments[0];
}

function getAssignedTechnicianNames(job) {
    const assignmentNames = Array.isArray(job.job_assignments)
        ? job.job_assignments
            .map(assignment => assignment?.users?.username || '')
            .filter(Boolean)
        : [];

    if (assignmentNames.length) {
        return [...new Set(assignmentNames)];
    }

    return job?.technician_name
        ? String(job.technician_name).split(',').map(name => name.trim()).filter(Boolean)
        : [];
}

function getAssignedTechnicianIds(job) {
    return Array.isArray(job.job_assignments)
        ? [...new Set(job.job_assignments.map(assignment => assignment?.tech_id).filter(Boolean))]
        : [];
}

function getTechnicianName(job) {
    const assignedNames = getAssignedTechnicianNames(job);
    return assignedNames.length ? assignedNames.join(', ') : 'Unassigned';
}

function getSelectedTechnicianIds(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return [];
    return Array.from(select.selectedOptions || []).map(option => option.value).filter(Boolean);
}

function shouldCurrentUserSeeJob(job) {
    if (typeof getCurrentUserProfile !== 'function') return true;

    const profile = getCurrentUserProfile();
    if (!profile) return false;
    
    // Superadmins and Managers see everything
    if (profile.role !== 'technician') return true;

    // Technicians see:
    // 1. Unassigned jobs (so they can request them)
    // 2. Jobs assigned to them
    const isUnassigned = (job.status || 'Unassigned') === 'Unassigned';
    const isAssignedToMe = getAssignedTechnicianIds(job).includes(profile.id);

    return isUnassigned || isAssignedToMe;
}

function getClientDisplayName(job) {
    return job.clients?.company_name || job.clients?.client_name || 'Unknown Client';
}

function getSiteDisplayName(job) {
    return job.sites?.name || 'No Site';
}

function formatJobDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
}

function formatJobDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
}

function getJobStatusBadgeClass(status) {
    switch (status) {
        case 'Completed': return 'badge-green';
        case 'Dispatched': return 'badge-blue';
        case 'In Progress': return 'badge-orange';
        case 'Delayed': return 'badge-yellow';
        case 'On Hold': return 'badge-gray';
        default: return 'badge-red';
    }
}

function getRemainingTimeText(job) {
    if (job.status !== 'In Progress' || !job.started_at || !job.estimated_duration_hours) return '';

    const start = new Date(job.started_at);
    const now = new Date();
    const diffHours = (now - start) / (1000 * 60 * 60);
    const remainingHours = Math.max(0, Number(job.estimated_duration_hours) - diffHours);

    if (remainingHours === 0) return 'Overdue';
    return `${formatDurationDisplay(remainingHours)} left`;
}

function getRemainingTimeClass(job) {
    return job.remainingTimeText === 'Overdue' ? 'timer-active is-overdue' : 'timer-active';
}

function getJobsLedgerSearchText(job) {
    return [
        job.displayJobNumber,
        job.id,
        job.title,
        job.job_type,
        job.protocol_number,
        ...(Array.isArray(job.jobCardNumbers) ? job.jobCardNumbers : []),
        job.displayName,
        job.siteDisplayName,
        job.technicianDisplayName,
        job.status,
        job.notes,
        job.latestStepNote,
        job.dueDateDisplay,
        job.createdAtDisplay,
        job.completedAtDisplay
    ].filter(Boolean).join(' ').toLowerCase();
}

function getJobsLedgerHistoryTime(job) {
    const sourceValue = job.completed_at || job.scheduled_date || job.created_at;
    if (!sourceValue) return 0;

    const parsed = new Date(sourceValue).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getJobsLedgerHistoryWindow(jobs) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - JOBS_LEDGER_HISTORY_YEARS);
    const cutoffTime = cutoff.getTime();

    return jobs.filter(job => getJobsLedgerHistoryTime(job) >= cutoffTime);
}

function hasActiveJobsLedgerFilters() {
    return Boolean(
        jobsLedgerFilterState.search.trim()
        || jobsLedgerFilterState.status
        || jobsLedgerFilterState.jobType
        || jobsLedgerFilterState.client
        || jobsLedgerFilterState.site
        || jobsLedgerFilterState.technician
    );
}

function getDefaultLedgerJobs(jobs) {
    // Default ledger shows recent active jobs, excluding Completed jobs (shown in separate tab)
    return [...jobs]
        .filter(job => (job.status || 'Unassigned') !== 'Completed')
        .sort((left, right) => getJobsLedgerHistoryTime(right) - getJobsLedgerHistoryTime(left))
        .slice(0, JOBS_LEDGER_DEFAULT_LIMIT);
}

function filterJobsLedger(jobs) {
    const search = jobsLedgerFilterState.search.trim().toLowerCase();
    const status = jobsLedgerFilterState.status;
    const jobType = jobsLedgerFilterState.jobType;
    const client = jobsLedgerFilterState.client;
    const site = jobsLedgerFilterState.site;
    const technician = jobsLedgerFilterState.technician;

    return jobs.filter(job => {
        if (status && (job.status || 'Unassigned') !== status) return false;
        if (jobType && (job.job_type || 'Unspecified') !== jobType) return false;
        if (client && (job.displayName || 'Unknown Client') !== client) return false;
        if (site && (job.siteDisplayName || 'No Site') !== site) return false;
        if (technician && !(job.assignedTechNames || [job.technicianDisplayName || 'Unassigned']).includes(technician)) return false;
        if (!search) return true;
        return getJobsLedgerSearchText(job).includes(search);
    });
}

function populateJobsLedgerFilterSelect(selectId, options, selectedValue, defaultLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const optionMarkup = [...new Set(options.filter(Boolean))]
        .sort((left, right) => left.localeCompare(right))
        .map(option => `<option value="${option}">${option}</option>`)
        .join('');

    select.innerHTML = `<option value="">${defaultLabel}</option>${optionMarkup}`;
    select.value = selectedValue || '';
}

function populateJobsLedgerFilterOptions(jobs) {
    const historyJobs = getJobsLedgerHistoryWindow(jobs);

    populateJobsLedgerFilterSelect(
        'jobs-ledger-job-type-filter',
        historyJobs.map(job => job.job_type || 'Unspecified'),
        jobsLedgerFilterState.jobType,
        'All job types'
    );
    populateJobsLedgerFilterSelect(
        'jobs-ledger-client-filter',
        historyJobs.map(job => job.displayName),
        jobsLedgerFilterState.client,
        'All clients'
    );
    populateJobsLedgerFilterSelect(
        'jobs-ledger-site-filter',
        historyJobs.map(job => job.siteDisplayName),
        jobsLedgerFilterState.site,
        'All sites'
    );
    populateJobsLedgerFilterSelect(
        'jobs-ledger-technician-filter',
        historyJobs.flatMap(job => job.assignedTechNames?.length ? job.assignedTechNames : [job.technicianDisplayName]),
        jobsLedgerFilterState.technician,
        'All technicians'
    );
}

function bindJobsLedgerFilters() {
    const searchInput = document.getElementById('jobs-ledger-search');
    const statusSelect = document.getElementById('jobs-ledger-status-filter');
    const jobTypeSelect = document.getElementById('jobs-ledger-job-type-filter');
    const clientSelect = document.getElementById('jobs-ledger-client-filter');
    const siteSelect = document.getElementById('jobs-ledger-site-filter');
    const technicianSelect = document.getElementById('jobs-ledger-technician-filter');
    if (!searchInput || !statusSelect || !jobTypeSelect || !clientSelect || !siteSelect || !technicianSelect || searchInput.dataset.bound === 'true') return;

    searchInput.addEventListener('input', event => {
        jobsLedgerFilterState.search = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    statusSelect.addEventListener('change', event => {
        jobsLedgerFilterState.status = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    jobTypeSelect.addEventListener('change', event => {
        jobsLedgerFilterState.jobType = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    clientSelect.addEventListener('change', event => {
        jobsLedgerFilterState.client = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    siteSelect.addEventListener('change', event => {
        jobsLedgerFilterState.site = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    technicianSelect.addEventListener('change', event => {
        jobsLedgerFilterState.technician = event.target.value || '';
        renderTechnicianJobsTable(jobsCache);
    });

    searchInput.dataset.bound = 'true';
    statusSelect.dataset.bound = 'true';
    jobTypeSelect.dataset.bound = 'true';
    clientSelect.dataset.bound = 'true';
    siteSelect.dataset.bound = 'true';
    technicianSelect.dataset.bound = 'true';
}

function clearJobsLedgerFilters() {
    jobsLedgerFilterState = { search: '', status: '', jobType: '', client: '', site: '', technician: '' };
    const searchInput = document.getElementById('jobs-ledger-search');
    const statusSelect = document.getElementById('jobs-ledger-status-filter');
    const jobTypeSelect = document.getElementById('jobs-ledger-job-type-filter');
    const clientSelect = document.getElementById('jobs-ledger-client-filter');
    const siteSelect = document.getElementById('jobs-ledger-site-filter');
    const technicianSelect = document.getElementById('jobs-ledger-technician-filter');
    if (searchInput) searchInput.value = '';
    if (statusSelect) statusSelect.value = '';
    if (jobTypeSelect) jobTypeSelect.value = '';
    if (clientSelect) clientSelect.value = '';
    if (siteSelect) siteSelect.value = '';
    if (technicianSelect) technicianSelect.value = '';
    renderTechnicianJobsTable(jobsCache);
}

window.clearJobsLedgerFilters = clearJobsLedgerFilters;

function assignJobDisplayNumbers(jobs) {
    const sortedForSequence = [...jobs].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;

        if (leftTime !== rightTime) return leftTime - rightTime;
        return String(left.id || '').localeCompare(String(right.id || ''));
    });

    const jobNumberById = new Map(sortedForSequence.map((job, index) => [job.id, index + 1]));
    return jobs.map(job => ({
        ...job,
        displayJobNumber: jobNumberById.get(job.id) || 0
    }));
}

function enrichJob(job) {
    const noteHistory = Array.isArray(job.noteHistory) ? [...job.noteHistory].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
    }).slice(0, 10) : [];

    return {
        ...job,
        displayName: getClientDisplayName(job),
        siteDisplayName: getSiteDisplayName(job),
        createdByDisplay: job.created_by || 'Manager',
        assignedTechNames: getAssignedTechnicianNames(job),
        assignedTechIds: getAssignedTechnicianIds(job),
        technicianDisplayName: getTechnicianName(job),
        assignedAtDisplay: formatJobDate(getPrimaryAssignment(job)?.assigned_at),
        createdAtDisplay: formatJobDate(job.created_at),
        completedAtDisplay: formatJobDate(job.completed_at),
        dueDateDisplay: formatJobDate(job.scheduled_date),
        durationDisplay: formatDurationDisplay(job.estimated_duration_hours),
        jobCardNumbers: parseJobCardNumbers(job.job_card_numbers),
        jobCardNumbersDisplay: formatJobCardNumbersDisplay(job.job_card_numbers),
        jobCardSummary: getJobCardSummary(job.job_card_numbers),
        remainingTimeText: getRemainingTimeText(job),
        noteHistory,
        latestStepNote: noteHistory[0]?.note || ''
    };
}

async function getCurrentActorLabel() {
    try {
        if (typeof getCurrentUserProfile === 'function') {
            const profile = getCurrentUserProfile();
            if (profile?.username) return profile.username;
        }

        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user?.user_metadata?.username) return String(user.user_metadata.username);
        if (!user?.email) return 'System';
        return user.email.split('@')[0];
    } catch (err) {
        console.warn('Could not resolve current actor:', err);
        return 'System';
    }
}

async function ensureJobReferenceData(force = false) {
    if (!force && cachedClients.length && cachedSites.length && cachedTechs.length) return;

    const [clientsResult, sitesResult, techsResult] = await Promise.all([
        window.supabaseClient.from('clients').select('id, client_name, company_name').order('company_name'),
        window.supabaseClient.from('sites').select('id, client_id, name').order('name'),
        window.supabaseClient.from('users').select('id, username').eq('role', 'technician').order('username')
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (sitesResult.error) throw sitesResult.error;
    if (techsResult.error) throw techsResult.error;

    cachedClients = clientsResult.data || [];
    cachedSites = sitesResult.data || [];
    cachedTechs = techsResult.data || [];
}

function populateClientSelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Client --</option>' +
        cachedClients.map(client => `<option value="${client.id}">${client.company_name || client.client_name}</option>`).join('');
    select.value = selectedValue || '';
}

function populateTechnicianSelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const selectedValues = Array.isArray(selectedValue)
        ? selectedValue.map(value => String(value))
        : selectedValue
            ? [String(selectedValue)]
            : [];

    const supportsMultiple = select.multiple;

    select.innerHTML = `${supportsMultiple ? '' : '<option value="">Unassigned</option>'}` +
        cachedTechs.map(tech => `<option value="${tech.id}">${tech.username}</option>`).join('');

    Array.from(select.options).forEach(option => {
        option.selected = selectedValues.includes(option.value);
    });

    if (!supportsMultiple) {
        select.value = selectedValues[0] || '';
    }
}

function getClientSites(clientId) {
    if (!clientId) return [];
    return cachedSites.filter(site => String(site.client_id) === String(clientId));
}

function populateSiteSelect(selectId, clientId, selectedSiteId = '', hintId = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const hint = hintId ? document.getElementById(hintId) : null;
    const filteredSites = getClientSites(clientId);

    if (!clientId) {
        select.innerHTML = '<option value="">Select client first...</option>';
        select.value = '';
        select.disabled = true;
        if (hint) hint.innerText = 'Select a client first to load that client\'s site list.';
        return;
    }

    select.disabled = false;

    if (!filteredSites.length) {
        select.innerHTML = '<option value="">No sites registered for this client</option>';
        select.value = '';
        select.disabled = true;
        if (hint) hint.innerText = 'This client has no saved sites yet. Add one in Team & Partners before creating the job.';
        return;
    }

    if (filteredSites.length === 1) {
        select.innerHTML = `<option value="${filteredSites[0].id}">${filteredSites[0].name}</option>`;
        select.value = filteredSites[0].id;
        if (hint) hint.innerText = `This client has one site. "${filteredSites[0].name}" was selected automatically.`;
        return;
    }

    select.innerHTML = '<option value="">-- Select Site --</option>' +
        filteredSites.map(site => `<option value="${site.id}">${site.name}</option>`).join('');
    select.value = selectedSiteId || '';
    if (hint) hint.innerText = `This client has ${filteredSites.length} saved sites. Choose the correct location for the job.`;
}

async function fetchJobsDataset() {
    const [jobsResult, clientsResult, sitesResult, assignmentsResult, usersResult, notesResult] = await Promise.all([
        window.supabaseClient.from('jobs').select('*').order('created_at', { ascending: false }),
        window.supabaseClient.from('clients').select('id, company_name, client_name'),
        window.supabaseClient.from('sites').select('id, name'),
        window.supabaseClient.from('job_assignments').select('job_id, tech_id, assigned_at'),
        window.supabaseClient.from('users').select('id, username'),
        window.supabaseClient.from('job_notes').select('*').order('created_at', { ascending: false })
    ]);

    if (jobsResult.error) throw jobsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (sitesResult.error) throw sitesResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;
    if (usersResult.error) throw usersResult.error;

    const clientsById = new Map((clientsResult.data || []).map(client => [client.id, client]));
    const sitesById = new Map((sitesResult.data || []).map(site => [site.id, site]));
    const usersById = new Map((usersResult.data || []).map(user => [user.id, user]));
    const assignmentsByJobId = new Map();
    const notesByJobId = new Map();

    (assignmentsResult.data || []).forEach(assignment => {
        const existing = assignmentsByJobId.get(assignment.job_id) || [];
        existing.push({
            ...assignment,
            users: usersById.get(assignment.tech_id) || null
        });
        assignmentsByJobId.set(assignment.job_id, existing);
    });

    if (notesResult.error) {
        console.warn('job_notes table unavailable, continuing without step-note history:', notesResult.error.message);
    } else {
        (notesResult.data || []).forEach(note => {
            const existing = notesByJobId.get(note.job_id) || [];
            existing.push(note);
            notesByJobId.set(note.job_id, existing);
        });
    }

    const enrichedJobs = (jobsResult.data || []).map(job => enrichJob({
        ...job,
        clients: clientsById.get(job.client_id) || null,
        sites: sitesById.get(job.site_id) || null,
        job_assignments: assignmentsByJobId.get(job.id) || [],
        noteHistory: notesByJobId.get(job.id) || []
    })).filter(shouldCurrentUserSeeJob);

    return assignJobDisplayNumbers(enrichedJobs);
}

function renderKanbanBoard(jobs) {
    const orderedJobs = sortJobsByDueDate(jobs);
    const cols = {
        'Unassigned': document.getElementById('kb-Unassigned'),
        'Dispatched': document.getElementById('kb-Dispatched'),
        'In Progress': document.getElementById('kb-InProgress'),
        'On Hold': document.getElementById('kb-OnHold'),
        'Delayed': document.getElementById('kb-Delayed'),
        'Completed': document.getElementById('kb-Completed')
    };

    Object.values(cols).forEach(col => {
        if (col) col.innerHTML = '';
    });

    if (cols.Completed) {
        cols.Completed.innerHTML = '<div class="kanban-drop-hint">Drop here to complete and archive a job.</div>';
    }

    const counts = { Unassigned: 0, Dispatched: 0, 'In Progress': 0, 'On Hold': 0, Delayed: 0, Completed: 0 };

    orderedJobs.forEach(job => {
        const status = JOB_STATUS_ORDER.includes(job.status) ? job.status : 'Unassigned';
        counts[status] = (counts[status] || 0) + 1;

        if (!ACTIVE_JOB_STATUSES.includes(status)) return;

        const targetColumn = cols[status];
        if (!targetColumn) return;

        const el = document.createElement('div');
        el.className = `job-card ${status.replace(/\s+/g, '-').toLowerCase()}`;
        el.dataset.jobId = job.id;
        el.tabIndex = 0;

        el.innerHTML = `
            <div class="job-card-header">
                <div>
                    <span class="job-id-mini">#${job.displayJobNumber}</span>
                    <h4 style="margin-bottom: 4px;">${job.title}</h4>
                    <span class="job-type-mini">${job.job_type || 'Installation'}</span>
                </div>
                <span class="badge ${getJobStatusBadgeClass(status)}">${status}</span>
            </div>
            <p class="job-client">${job.displayName}</p>
            <div class="job-tech-info">
                <span class="tech-name">Tech: ${job.technicianDisplayName}</span>
                <span class="planner-info"><i class="fas fa-map-marker-alt"></i> ${job.siteDisplayName}</span>
                <span class="planner-info"><i class="fas fa-calendar"></i> ${job.dueDateDisplay === '-' ? 'Unscheduled' : job.dueDateDisplay}</span>
                <span class="planner-info"><i class="fas fa-hourglass-half"></i> ${job.durationDisplay}</span>
                ${job.remainingTimeText ? `<span class="${getRemainingTimeClass(job)}">${job.remainingTimeText}</span>` : ''}
                ${job.latestStepNote ? `<div class="job-note-preview"><strong>Latest note:</strong> ${job.latestStepNote}</div>` : ''}
                <div class="job-card-actions" style="margin-top: 10px;">
                    ${(job.status || 'Unassigned') === 'Unassigned' && (typeof getCurrentUserProfile === 'function' && getCurrentUserProfile()?.role === 'technician') ? 
                        userRequestsCache.includes(job.id) ? `
                            <button type="button" class="btn btn-small btn-secondary w-full" disabled style="background: var(--bg-color); color: var(--text-secondary);">
                                <i class="fas fa-history"></i> Request Sent - Awaiting Approval
                            </button>
                        ` : `
                            <button type="button" class="btn btn-small btn-blue w-full" onclick="event.stopPropagation(); requestJobAssignment('${job.id}', '${job.title}')">
                                <i class="fas fa-hand-paper"></i> Request Job
                            </button>
                        `
                    : ''}
                </div>
            </div>
            <div class="job-lifecycle-dates">
                <div><strong>Created:</strong> ${job.createdAtDisplay}</div>
                <div><strong>Assigned:</strong> ${job.assignedAtDisplay}</div>
                <div><strong>Due:</strong> ${job.dueDateDisplay}</div>
                <div><strong>Duration:</strong> ${job.durationDisplay}</div>
            </div>
            <div class="job-meta">
                <span class="duration-est">${job.protocol_number || job.id}</span>
            </div>
        `;

        el.addEventListener('click', () => openJobEditModal(job.id));
        el.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openJobEditModal(job.id);
            }
        });

        targetColumn.appendChild(el);
    });

    document.getElementById('kb-unassigned-count').innerText = counts.Unassigned;
    document.getElementById('kb-dispatched-count').innerText = counts.Dispatched;
    document.getElementById('kb-inprogress-count').innerText = counts['In Progress'];
    document.getElementById('kb-onhold-count').innerText = counts['On Hold'];
    document.getElementById('kb-delayed-count').innerText = counts.Delayed;
    document.getElementById('kb-completed-count').innerText = counts.Completed;

    const completedTabCount = document.getElementById('jobs-completed-tab-count');
    if (completedTabCount) completedTabCount.innerText = counts.Completed;

    Object.values(cols).forEach(col => {
        if (!col) return;
        if (col._sortable) col._sortable.destroy();

        col._sortable = new Sortable(col, {
            group: 'kanban',
            animation: 150,
            onEnd: async function(evt) {
                if (!getJobsPermissions().canEditJobs) {
                    showJobsPermissionError('Your role cannot update job statuses.');
                    await loadJobsData();
                    return;
                }

                const itemEl = evt.item;
                const toList = evt.to;
                const fromList = evt.from;

                if (toList === fromList) return;

                const newStatus = toList.getAttribute('data-status');
                const jobId = itemEl.dataset.jobId;
                let transitionNote = '';

                if (['On Hold', 'Delayed'].includes(newStatus)) {
                    transitionNote = window.prompt(`Add a note for moving this job to ${newStatus}:`, '') || '';
                    if (!transitionNote.trim()) {
                        if (typeof showToast === 'function') showToast(`${newStatus} requires a note.`, 'error');
                        await loadJobsData();
                        return;
                    }
                } else if (newStatus === 'Completed') {
                    const job = jobsCache.find(item => item.id === jobId);
                    try {
                        const ensuredCards = await ensureJobCardsBeforeCompletion(job);
                        if (!ensuredCards?.length) {
                            if (typeof showToast === 'function') showToast('A job card number is required before completing a job.', 'error');
                            await loadJobsData();
                            return;
                        }
                        await updateJobCardNumbers(jobId, ensuredCards);
                    } catch (cardError) {
                        if (typeof showToast === 'function') showToast(cardError.message, 'error');
                        await loadJobsData();
                        return;
                    }
                    transitionNote = window.prompt('Add an optional completion note:', '') || '';
                }

                try {
                    await updateJobStatus(jobId, newStatus, transitionNote.trim());
                    await loadJobsData();
                } catch (e) {
                    console.error('Critical error saving job status:', e);
                    if (typeof showToast === 'function') showToast('Database error: could not update job status.', 'error');
                    await loadJobsData();
                }
            }
        });
    });
}

function renderTechnicianJobsTable(jobs) {
    const tbody = document.getElementById('jobs-tech-table-body');
    if (!tbody) return;

    const historyJobs = getJobsLedgerHistoryWindow(jobs);
    const filteredJobs = filterJobsLedger(historyJobs);
    // Always exclude Completed jobs from technician ledger (they go to the Completed tab)
    const activeJobsOnly = filteredJobs.filter(job => (job.status || 'Unassigned') !== 'Completed');
    const visibleJobs = hasActiveJobsLedgerFilters() ? activeJobsOnly : getDefaultLedgerJobs(activeJobsOnly);
    const orderedJobs = sortJobsByDueDate(visibleJobs);
    const showCreatedBy = canViewCreatedByColumn();
    const canDeleteJobs = getJobsPermissions().canDeleteJobs;

    if (!orderedJobs.length) {
        tbody.innerHTML = `<tr><td colspan="${showCreatedBy ? 15 : 14}" style="text-align:center; color: var(--text-secondary);">No jobs match the current filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = orderedJobs.map(job => {
        const isUnassigned = (job.status || 'Unassigned') === 'Unassigned';
        const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
        const perms = getJobsPermissions();
        const canAssign = perms.canAssignJobs;
        const isTech = profile?.role === 'technician';
        const showRequestBtn = isUnassigned && isTech;

        // Render Dropdown if manager, else plain name
        let techCell = `<span>${job.technicianDisplayName}</span>`;
        if (canAssign) {
            if (cachedTechs.length === 0) {
                techCell = `<span class="text-muted">Loading techs...</span>`;
            } else {
                techCell = `
                    <select class="form-control select-small" onchange="assignJobToTechnician('${job.id}', this.value)">
                        <option value="">Unassigned</option>
                        ${cachedTechs.map(tech => `
                            <option value="${tech.id}" ${job.technician_name?.includes(tech.username) ? 'selected' : ''}>
                                ${tech.username}
                            </option>
                        `).join('')}
                    </select>
                `;
            }
        }

        return `
        <tr>
            <td class="jobs-tech-job-id-cell"><strong>${job.displayJobNumber}</strong></td>
            <td>
                <div class="jobs-tech-job-cell">
                    <strong>${job.title}</strong>
                    <span>${job.latestStepNote || 'No step note yet'}</span>
                </div>
            </td>
            <td>${job.job_type || '-'}</td>
            <td>${job.protocol_number || '-'}</td>
            <td>${job.jobCardNumbersDisplay}</td>
            <td>${job.displayName}</td>
            <td>${job.siteDisplayName}</td>
            <td class="jobs-created-by-col">${job.createdByDisplay}</td>
            <td>${techCell}</td>
            <td>${job.durationDisplay}</td>
            <td>${job.dueDateDisplay}</td>
            <td><span class="badge ${getJobStatusBadgeClass(job.status)}">${job.status || 'Unassigned'}</span></td>
            <td>${formatJobDateTime(job.started_at)}</td>
            <td>${formatJobDateTime(job.completed_at)}</td>
            <td>
                <div style="display: flex; gap: 4px;">
                    ${showRequestBtn ? 
                        userRequestsCache.includes(job.id) ? `
                            <span class="badge" style="background: var(--bg-color); color: var(--text-secondary);">
                                <i class="fas fa-history"></i> Awaiting Approval
                            </span>
                        ` : `
                            <button class="btn btn-small btn-blue" onclick="requestJobAssignment('${job.id}', '${job.title}')" title="Request this job">
                                <i class="fas fa-hand-paper"></i> Request
                            </button>
                        `
                    : ''}
                    ${perms.canDeleteJobs ? `<button class="btn btn-small" onclick="deleteJobFromTable('${job.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `;}).join('');
}

async function assignJobToTechnician(jobId, techId) {
    try {
        const perms = getJobsPermissions();
        if (!perms.canAssignJobs) {
            if (typeof showToast === 'function') showToast('Your role cannot assign jobs.', 'error');
            return;
        }

        const selectedTech = cachedTechs.find(t => t.id === techId);
        const techName = selectedTech ? selectedTech.username : null; 
        const nextStatus = techId ? 'Dispatched' : 'Unassigned';

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Updating assignment...');

        // 1. Update Job Assignments table
        await window.supabaseClient.from('job_assignments').delete().eq('job_id', jobId);
        if (techId) {
            await window.supabaseClient.from('job_assignments').insert([{
                job_id: jobId,
                tech_id: techId
            }]);
        }

        // 2. Update Jobs table
        const { error } = await window.supabaseClient.from('jobs').update({
            technician_name: techName,
            status: nextStatus
        }).eq('id', jobId);

        if (error) throw error;

        if (typeof showToast === 'function') showToast(`Job ${techId ? 'assigned to ' + techName : 'unassigned'}.`, 'success');
        
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
    } catch (err) {
        console.error('Manual assign error:', err);
        if (typeof showToast === 'function') showToast('Failed to assign job: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.assignJobToTechnician = assignJobToTechnician;

async function requestJobAssignment(jobId, jobTitle) {
    try {
        const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
        if (!profile || profile.role !== 'technician') {
            if (typeof showToast === 'function') showToast('Only technicians can request jobs.', 'error');
            return;
        }

        const confirmReq = window.confirm(`Request to be assigned to job "${jobTitle}"? This will notify managers for approval.`);
        if (!confirmReq) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Sending request...');

        // Check if already requested
        const { data: existing } = await window.supabaseClient
            .from('job_assignment_requests')
            .select('id')
            .eq('job_id', jobId)
            .eq('tech_id', profile.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (existing) {
            if (typeof showToast === 'function') showToast('You have already requested this job. Please wait for manager approval.', 'info');
            return;
        }

        const { error } = await window.supabaseClient
            .from('job_assignment_requests')
            .insert([{
                job_id: jobId,
                tech_id: profile.id,
                status: 'pending'
            }]);

        if (error) throw error;

        if (typeof showToast === 'function') showToast('Job request sent to managers.', 'success');
        await loadJobsData();
    } catch (err) {
        console.error('Request job error:', err);
        if (typeof showToast === 'function') showToast('Failed to send request: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.requestJobAssignment = requestJobAssignment;

function renderCompletedJobsTable(jobs) {
    const tbody = document.getElementById('jobs-completed-table-body');
    if (!tbody) return;

    const completedJobs = sortJobsByDueDate(jobs.filter(job => job.status === 'Completed'));
    const showCreatedBy = canViewCreatedByColumn();
    const canDeleteJobs = getJobsPermissions().canDeleteJobs;
    if (!completedJobs.length) {
        tbody.innerHTML = `<tr><td colspan="${showCreatedBy ? 14 : 13}" style="text-align:center; color: var(--text-secondary);">No completed jobs archived yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = completedJobs.map(job => `
        <tr>
            <td class="jobs-tech-job-id-cell"><strong>${job.displayJobNumber}</strong></td>
            <td>
                <div class="jobs-tech-job-cell">
                    <strong>${job.title}</strong>
                    <span>${job.latestStepNote || 'No step note yet'}</span>
                </div>
            </td>
            <td>${job.job_type || '-'}</td>
            <td>${job.protocol_number || '-'}</td>
            <td>${job.jobCardNumbersDisplay}</td>
            <td>${job.displayName}</td>
            <td>${job.siteDisplayName}</td>
            <td class="jobs-created-by-col">${job.createdByDisplay}</td>
            <td>${job.technicianDisplayName}</td>
            <td>${job.durationDisplay}</td>
            <td>${job.dueDateDisplay}</td>
            <td>${formatJobDateTime(job.started_at)}</td>
            <td>${formatJobDateTime(job.completed_at)}</td>
            <td>${canDeleteJobs ? `<button class="btn btn-small" onclick="deleteJobFromTable('${job.id}')"><i class="fas fa-trash"></i></button>` : '-'}</td>
        </tr>
    `).join('');
}

function renderJobNotesHistory(job) {
    const container = document.getElementById('jobNotesHistory');
    if (!container) return;

    if (!job?.noteHistory?.length) {
        container.innerHTML = '<div class="job-note-empty">No step notes logged yet.</div>';
        return;
    }

    container.innerHTML = job.noteHistory.map(note => `
        <div class="job-note-entry">
            <div class="job-note-entry-header">
                <span class="badge ${getJobStatusBadgeClass(note.status_step || job.status)}">${note.status_step || job.status || 'Update'}</span>
                <span>${note.created_by || 'System'} • ${formatJobDateTime(note.created_at)}</span>
            </div>
            <p>${note.note}</p>
        </div>
    `).join('');
}

async function insertJobStepNote(jobId, statusStep, noteText, createdBy) {
    if (!noteText.trim()) return;

    const payload = {
        job_id: jobId,
        status_step: statusStep || 'Update',
        note: noteText.trim(),
        created_by: createdBy || await getCurrentActorLabel()
    };

    const { error } = await window.supabaseClient.from('job_notes').insert([payload]);
    if (!error) {
        const { data: extraNotes, error: pruneError } = await window.supabaseClient
            .from('job_notes')
            .select('id')
            .eq('job_id', jobId)
            .order('created_at', { ascending: false })
            .range(10, 200);

        if (!pruneError && extraNotes?.length) {
            const { error: deleteError } = await window.supabaseClient
                .from('job_notes')
                .delete()
                .in('id', extraNotes.map(note => note.id));

            if (deleteError) console.warn('Failed to prune older job notes:', deleteError.message);
        }
        return;
    }

    console.warn('job_notes insert failed, falling back to jobs.notes:', error.message);
    const job = jobsCache.find(item => item.id === jobId);
    const fallbackText = [
        job?.notes || '',
        `[${new Date().toLocaleString()}] ${payload.status_step} - ${payload.created_by}: ${payload.note}`
    ].filter(Boolean).join('\n');

    const { error: fallbackError } = await window.supabaseClient.from('jobs').update({ notes: fallbackText }).eq('id', jobId);
    if (fallbackError) throw fallbackError;
}

async function updateJobStatus(jobId, newStatus, transitionNote = '') {
    if (!getJobsPermissions().canEditJobs) {
        throw new Error('You do not have permission to update job statuses.');
    }

    const job = jobsCache.find(item => item.id === jobId);
    if (newStatus === 'Completed' && !parseJobCardNumbers(job?.job_card_numbers || job?.jobCardNumbers).length) {
        throw new Error('A job card number is required before completing a job.');
    }

    const updateData = { status: newStatus };

    if (newStatus === 'In Progress' && !job?.started_at) {
        updateData.started_at = new Date().toISOString();
        updateData.completed_at = null;
    } else if (newStatus === 'Completed') {
        updateData.completed_at = new Date().toISOString();
        if (!job?.started_at) updateData.started_at = new Date().toISOString();
    } else if (newStatus !== 'Completed') {
        updateData.completed_at = null;
    }

    const { error } = await window.supabaseClient.from('jobs').update(updateData).eq('id', jobId);
    if (error) throw error;

    if (transitionNote) {
        await insertJobStepNote(jobId, newStatus, transitionNote, await getCurrentActorLabel());
    }

    if (typeof loadPlannerData === 'function') loadPlannerData();
    if (typeof loadDashboardData === 'function') loadDashboardData();
    if (typeof loadMapData === 'function') loadMapData();
}

async function loadJobsData() {
    const kanbanBoard = document.querySelector('.jobs-kanban-board');
    if (!kanbanBoard) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading jobs...');
        updateJobsCreatedByColumnVisibility();
        bindJobsLedgerFilters();
        
        // Fetch jobs and user requests in parallel
        const [jobsData, requestsData] = await Promise.all([
            fetchJobsDataset(),
            typeof getCurrentUserProfile === 'function' && getCurrentUserProfile()?.role === 'technician'
                ? window.supabaseClient.from('job_assignment_requests').select('job_id').eq('tech_id', getCurrentUserProfile().id).eq('status', 'pending')
                : Promise.resolve({ data: [] })
        ]);

        jobsCache = jobsData;
        userRequestsCache = (requestsData.data || []).map(r => r.job_id);

        populateJobsLedgerFilterOptions(jobsCache);
        renderKanbanBoard(jobsCache);
        renderTechnicianJobsTable(jobsCache);
        renderCompletedJobsTable(jobsCache);
    } catch (err) {
        console.error('Jobs error:', err);
        if (typeof showToast === 'function') showToast('Failed to load jobs: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function openAddJobModal() {
    if (!getJobsPermissions().canCreateJobs) {
        showJobsPermissionError('Your role cannot create jobs.');
        return;
    }

    const modal = document.getElementById('addJobModal');
    if (!modal) return;

    modal.style.display = 'flex';
    try {
        await ensureJobReferenceData();
        populateClientSelect('newJobClient');
        populateTechnicianSelect('newJobTech', []);
        populateSiteSelect('newJobSite', '', '', 'newJobSiteHint');
        bindDurationInputs('newJobDurationDays', 'newJobDurationHours', 'newJobDurationPreview');
        bindCustomJobTypeInput();
        applyNewJobPermissions();

        const clientSelect = document.getElementById('newJobClient');
        clientSelect.onchange = (event) => populateSiteSelect('newJobSite', event.target.value, '', 'newJobSiteHint');

        const jobTypeSelect = document.getElementById('newJobType');
        const customTypeInput = document.getElementById('newJobCustomType');
        if (jobTypeSelect) jobTypeSelect.value = 'Installation';
        if (customTypeInput) {
            customTypeInput.value = '';
            customTypeInput.style.display = 'none';
            customTypeInput.required = false;
        }
    } catch (err) {
        console.error('Modal load error:', err);
        if (typeof showToast === 'function') showToast('Could not load job form data.', 'error');
    }
}

function closeAddJobModal() {
    const modal = document.getElementById('addJobModal');
    if (modal) modal.style.display = 'none';
}

async function openJobEditModal(jobId) {
    currentEditingJobId = jobId;
    const job = jobsCache.find(item => item.id === jobId);
    const modal = document.getElementById('editJobModal');
    if (!job || !modal) return;

    try {
        await ensureJobReferenceData();

        document.getElementById('editJobNumberLabel').innerText = `#${job.displayJobNumber}`;
        document.getElementById('editJobTitle').value = job.title || '';
        document.getElementById('editJobProtocol').value = job.protocol_number || '';
        document.getElementById('editJobDesc').value = job.description || '';
        document.getElementById('editJobCards').value = formatJobCardsForInput(job.jobCardNumbers);
        document.getElementById('editJobType').value = job.job_type || 'Installation';
        document.getElementById('editJobStatus').value = job.status || 'Unassigned';
        document.getElementById('editJobDate').value = job.scheduled_date || '';
        const durationParts = hoursToDurationParts(job.estimated_duration_hours || 0);
        document.getElementById('editJobDurationDays').value = durationParts.days;
        document.getElementById('editJobDurationHours').value = durationParts.hours;
        document.getElementById('editJobGeneralNotes').value = job.notes || '';
        document.getElementById('editJobStepNote').value = '';
        bindDurationInputs('editJobDurationDays', 'editJobDurationHours', 'editJobDurationPreview');
        document.getElementById('editJobDurationPreview').value = formatDurationDisplay(job.estimated_duration_hours || 0);

        populateClientSelect('editJobClient', job.client_id || '');
        populateTechnicianSelect('editJobTech', job.assignedTechIds || []);
        populateSiteSelect('editJobSite', job.client_id || '', job.site_id || '');

        document.getElementById('editJobClient').onchange = (event) => {
            populateSiteSelect('editJobSite', event.target.value);
        };

        renderJobNotesHistory(job);
        applyJobModalPermissions();
        modal.style.display = 'flex';
    } catch (err) {
        console.error('Open edit modal error:', err);
        if (typeof showToast === 'function') showToast('Could not open job details.', 'error');
    }
}

function closeEditJobModal() {
    currentEditingJobId = null;
    const modal = document.getElementById('editJobModal');
    if (modal) modal.style.display = 'none';
}

async function saveEditedJob(event) {
    event.preventDefault();
    const permissions = getJobsPermissions();
    if (!permissions.canEditJobs) {
        showJobsPermissionError('Your role cannot edit jobs.');
        return;
    }

    const job = jobsCache.find(item => item.id === currentEditingJobId);
    if (!job) return;

    const selectedTechIds = permissions.canAssignJobs ? getSelectedTechnicianIds('editJobTech') : (job.assignedTechIds || []);
    const selectedTechs = cachedTechs.filter(tech => selectedTechIds.includes(tech.id));
    const nextStatus = document.getElementById('editJobStatus').value;
    const stepNote = document.getElementById('editJobStepNote').value.trim();

    if (job.status !== nextStatus && ['On Hold', 'Delayed'].includes(nextStatus) && !stepNote) {
        if (typeof showToast === 'function') showToast(`${nextStatus} requires a note.`, 'error');
        return;
    }

    let jobCardNumbers;
    try {
        jobCardNumbers = readJobCardNumbersFromInput('editJobCards');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
        return;
    }

    if (nextStatus === 'Completed' && !jobCardNumbers.length) {
        if (typeof showToast === 'function') showToast('Add at least one job card number before completing this job.', 'error');
        const jobCardsInput = document.getElementById('editJobCards');
        if (jobCardsInput) jobCardsInput.focus();
        return;
    }

    const updateData = {
        title: document.getElementById('editJobTitle').value.trim(),
        protocol_number: document.getElementById('editJobProtocol').value.trim() || null,
        job_card_numbers: jobCardNumbers,
        description: document.getElementById('editJobDesc').value.trim() || null,
        client_id: document.getElementById('editJobClient').value || null,
        site_id: document.getElementById('editJobSite').value || null,
        job_type: document.getElementById('editJobType').value,
        status: nextStatus,
        scheduled_date: document.getElementById('editJobDate').value || null,
        estimated_duration_hours: durationPartsToHours(
            document.getElementById('editJobDurationDays').value,
            document.getElementById('editJobDurationHours').value
        ),
        notes: document.getElementById('editJobGeneralNotes').value.trim() || null,
        technician_name: permissions.canAssignJobs
            ? (selectedTechs.length ? selectedTechs.map(tech => tech.username).join(', ') : null)
            : (job.technician_name || job.technicianDisplayName || null)
    };

    if (nextStatus === 'In Progress' && !job.started_at) {
        updateData.started_at = new Date().toISOString();
        updateData.completed_at = null;
    } else if (nextStatus === 'Completed') {
        updateData.completed_at = new Date().toISOString();
        if (!job.started_at) updateData.started_at = new Date().toISOString();
    } else if (job.status === 'Completed' && nextStatus !== 'Completed') {
        updateData.completed_at = null;
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving job changes...');
        const { error } = await window.supabaseClient.from('jobs').update(updateData).eq('id', job.id);
        if (error) throw error;

        if (permissions.canAssignJobs) {
            const { error: deleteError } = await window.supabaseClient.from('job_assignments').delete().eq('job_id', job.id);
            if (deleteError) throw deleteError;

            if (selectedTechIds.length) {
                const { error: insertError } = await window.supabaseClient.from('job_assignments').insert(
                    selectedTechIds.map(techId => ({
                        job_id: job.id,
                        tech_id: techId
                    }))
                );
                if (insertError) throw insertError;
            }
        }

        if (stepNote) {
            await insertJobStepNote(job.id, nextStatus, stepNote, await getCurrentActorLabel());
        }

        if (typeof showToast === 'function') showToast('Job updated successfully.', 'success');
        closeEditJobModal();
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPlannerData === 'function') loadPlannerData();
        if (typeof loadMapData === 'function') loadMapData();
    } catch (err) {
        console.error('Save edited job error:', err);
        if (typeof showToast === 'function') showToast('Failed to save job changes: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function addJobStepNote() {
    if (!getJobsPermissions().canEditJobs) {
        showJobsPermissionError('Your role cannot add job notes.');
        return;
    }

    const job = jobsCache.find(item => item.id === currentEditingJobId);
    const note = document.getElementById('editJobStepNote')?.value.trim();
    if (!job || !note) {
        if (typeof showToast === 'function') showToast('Enter a note first.', 'error');
        return;
    }

    try {
        await insertJobStepNote(job.id, document.getElementById('editJobStatus')?.value || job.status, note, await getCurrentActorLabel());
        document.getElementById('editJobStepNote').value = '';
        jobsCache = await fetchJobsDataset();
        const refreshedJob = jobsCache.find(item => item.id === job.id);
        if (refreshedJob) renderJobNotesHistory(refreshedJob);
        renderKanbanBoard(jobsCache);
        renderTechnicianJobsTable(jobsCache);
        renderCompletedJobsTable(jobsCache);
        if (typeof showToast === 'function') showToast('Step note added.', 'success');
    } catch (err) {
        console.error('Add job note error:', err);
        if (typeof showToast === 'function') showToast('Failed to add note: ' + err.message, 'error');
    }
}

async function submitNewJob(event) {
    event.preventDefault();
    const permissions = getJobsPermissions();
    if (!permissions.canCreateJobs) {
        showJobsPermissionError('Your role cannot create jobs.');
        return;
    }

    const btn = document.getElementById('dispatchJobBtn');

    const title = document.getElementById('newJobTitle').value;
    const selectedType = document.getElementById('newJobType').value;
    const customType = document.getElementById('newJobCustomType')?.value.trim() || '';
    const type = selectedType === 'Custom' ? customType : selectedType;
    const description = document.getElementById('newJobDesc').value;
    const protocolNumber = document.getElementById('newJobProtocol').value.trim();
    let jobCardNumbers;
    try {
        jobCardNumbers = readJobCardNumbersFromInput('newJobCards');
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
        return;
    }
    const client_id = document.getElementById('newJobClient').value;
    const site_id = document.getElementById('newJobSite').value;
    
    // Updated for single select dropdown
    const selectedTechId = permissions.canAssignJobs ? document.getElementById('newJobTech').value : '';
    const selectedTechIds = selectedTechId ? [selectedTechId] : [];
    
    const date = document.getElementById('newJobDate').value;
    const duration = durationPartsToHours(
        document.getElementById('newJobDurationDays').value,
        document.getElementById('newJobDurationHours').value
    );
    const initialStatus = selectedTechId ? 'Dispatched' : 'Unassigned';
    const selectedTechs = cachedTechs.filter(tech => selectedTechIds.includes(tech.id));
    const createdBy = await getCurrentActorLabel();

    if (!type) {
        if (typeof showToast === 'function') showToast('Enter a custom job type for this new work item.', 'error');
        return;
    }

    if (!site_id) {
        if (typeof showToast === 'function') showToast('Select a valid site for this client before creating the job.', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Creating...';

    const jobId = crypto.randomUUID();

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Creating job...');
        const { data: newJob, error: jobError } = await window.supabaseClient.from('jobs').insert([{
            id: jobId,
            title,
            job_type: type,
            protocol_number: protocolNumber || null,
            job_card_numbers: jobCardNumbers,
            description,
            client_id,
            site_id,
            created_by: createdBy,
            status: initialStatus,
            technician_name: selectedTechs.length ? selectedTechs.map(tech => tech.username).join(', ') : null,
            estimated_duration_hours: duration,
            scheduled_date: date || null
        }]).select().maybeSingle();

        if (jobError) throw jobError;

        if (selectedTechIds.length && newJob) {
            const { error: assignmentError } = await window.supabaseClient.from('job_assignments').insert(
                selectedTechIds.map(techId => ({
                    job_id: newJob.id,
                    tech_id: techId
                }))
            );
            if (assignmentError) throw assignmentError;
        }

        if (typeof showToast === 'function') showToast('Job created successfully.', 'success');
        closeAddJobModal();
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPlannerData === 'function') loadPlannerData();
        if (typeof loadMapData === 'function') loadMapData();
    } catch (err) {
        console.error('Create Job error:', err);
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        btn.disabled = false;
        btn.innerText = 'Create Job';
    }
}

async function deleteCurrentJob() {
    if (!getJobsPermissions().canDeleteJobs) {
        showJobsPermissionError('Your role cannot delete jobs.');
        return;
    }

    const job = jobsCache.find(item => item.id === currentEditingJobId);
    if (!job) return;

    const confirmed = window.confirm(`Delete job "${job.title}"? This will remove its assignments and saved step notes.`);
    if (!confirmed) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting job...');

        await window.supabaseClient.from('job_assignments').delete().eq('job_id', job.id);
        await window.supabaseClient.from('job_notes').delete().eq('job_id', job.id);

        const { error } = await window.supabaseClient.from('jobs').delete().eq('id', job.id);
        if (error) throw error;

        if (typeof showToast === 'function') showToast('Job deleted successfully.', 'success');
        closeEditJobModal();
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPlannerData === 'function') loadPlannerData();
        if (typeof loadMapData === 'function') loadMapData();
    } catch (err) {
        console.error('Delete job error:', err);
        if (typeof showToast === 'function') showToast('Failed to delete job: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function deleteJobFromTable(jobId) {
    if (!getJobsPermissions().canDeleteJobs) {
        showJobsPermissionError('Your role cannot delete jobs.');
        return;
    }

    const job = jobsCache.find(item => item.id === jobId);
    if (!job) return;

    const confirmed = window.confirm(`Delete job "${job.title}"? This will remove its assignments and saved step notes.`);
    if (!confirmed) return;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting job...');

        await window.supabaseClient.from('job_assignments').delete().eq('job_id', job.id);
        await window.supabaseClient.from('job_notes').delete().eq('job_id', job.id);

        const { error } = await window.supabaseClient.from('jobs').delete().eq('id', job.id);
        if (error) throw error;

        if (typeof showToast === 'function') showToast('Job deleted successfully.', 'success');
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPlannerData === 'function') loadPlannerData();
        if (typeof loadMapData === 'function') loadMapData();
    } catch (err) {
        console.error('Delete job error:', err);
        if (typeof showToast === 'function') showToast('Failed to delete job: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.deleteCurrentJob = deleteCurrentJob;
window.deleteJobFromTable = deleteJobFromTable;