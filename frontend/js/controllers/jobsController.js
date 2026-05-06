let cachedClients = [];
let cachedSites = [];
let cachedTechs = [];
let jobsCache = [];
let currentEditingJobId = null;
let userRequestsCache = [];
let historicalJobImportState = {
    fileName: '',
    sheetNames: [],
    rows: [],
    previewRows: [],
    duplicatesSkipped: 0,
    headerRowsDetected: 0,
    unmatchedAssigneeCount: 0,
    statusCounts: {},
    filteredOutCount: 0
};
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
const JOB_REQUEST_NOTE_PREFIX = '[JOB_REQUEST]';
const JOB_REQUEST_ARCHIVE_LIMIT = 5;
const WORK_PACK_LINE_DELIMITER = '\n';
const HISTORICAL_JOB_IMPORT_NOTE_PREFIX = 'Historical Tracker Import';
const HISTORICAL_JOB_FINGERPRINT_PREFIX = 'Historical Tracker Fingerprint:';
const HISTORICAL_JOB_IMPORT_EXCLUDED_SHEETS = new Set(['recon mail list', 'holidays', 'maintenance', 'travel recon']);
const HISTORICAL_JOB_IMPORT_PREVIEW_LIMIT = 24;
const HISTORICAL_JOB_IMPORT_MASTER_TECHNICAL_SHEET = 'all technical tasks';
const HISTORICAL_JOB_IMPORT_FALLBACK_TECHNICAL_SHEET = 'technical tasks';
const HISTORICAL_JOB_IMPORT_MAPPING_SHEET = 'mapping reports';
const HISTORICAL_JOB_IMPORT_DUPLICATE_TECHNICAL_SHEETS = new Set(['technical tasks', 'live system reports critical']);
const HISTORICAL_JOB_IMPORT_MAX_DURATION_HOURS = 999.99;
const HISTORICAL_JOB_IMPORT_RECENT_COMPLETED_DAYS = 7;

const JOB_WORK_PACK_LIBRARY = [
    {
        key: 'offline_sensor',
        label: 'Offline Sensor',
        keywords: ['offline sensor'],
        tools: [
            'IOT Cable',
            'Spare Antenna',
            'Spare Batteries',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'Spare ITH Logger',
            'Cryopak Logger',
            'Cryopak Programming Cable',
            'IOT Test Node',
            'Spare IOT Cradle',
            'Alarm Setup Sheet'
        ],
        scope: [
            'Locate sensor',
            'Assess for damages',
            'Open up device',
            'Measure batteries',
            'Replace batteries if needed',
            'Re-program unit with WES and network key',
            'Program test node with the same unique WES and network key',
            'Scan network to see if sensor ID is detected',
            'Re-program back',
            'Take data to gateway',
            'Re-program to new node ID',
            'Swap out with spare sensor and bring back sensor to office',
            'If no spare then leave a cryopak in place'
        ]
    },
    {
        key: 'offline_gateway',
        label: 'Offline Gateway',
        keywords: ['offline gateway'],
        tools: [
            'Spare Gateway',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'IOT Cable',
            'Spare Ethernet Cable',
            'IOT Test Node'
        ],
        scope: [
            'Check if online or offline on front end',
            'Check if online or offline on remote IOT',
            'Check if power is present',
            'Measure battery',
            'Check if pin is on (Green light)',
            'Check if internet connectivity is present',
            'Test with different ethernet cable',
            'Test with different network port',
            'Check if URIS is running',
            'Check if supervisor is running',
            'Check if docker container logger is running',
            'Check if database is malformed',
            'Replace database',
            'Restart all services',
            'Toggle the gateway power switch',
            'Arrange a swap out'
        ]
    },
    {
        key: 'faulty_sensor',
        label: 'Faulty Sensor',
        keywords: ['faulty sensor'],
        tools: [
            'IOT Cable',
            'Spare Antenna',
            'Spare Batteries',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'Spare ITH Logger',
            'Cryopak Logger',
            'Cryopak Programming Cable',
            'IOT Test Node',
            'Spare IOT Cradle',
            'Alarm Setup Sheet'
        ],
        scope: [
            'Locate sensor',
            'Assess for damage',
            'Open up device',
            'Measure batteries',
            'Replace batteries if needed',
            'Check for damaged sensor wires',
            'Replace with spare sensor',
            'Replace with cryopak',
            'Return faulty sensor to the office for assessment',
            'Update alarm sheet',
            'Update reports',
            'Update alarm contacts'
        ]
    },
    {
        key: 'faulty_gw',
        label: 'Faulty GW',
        keywords: ['faulty gw', 'faulty gateway'],
        tools: [
            'Spare Gateway',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'IOT Cable'
        ],
        scope: [
            'Check if online or offline on front end',
            'Check if online or offline on remote IOT',
            'Check if power is present',
            'Measure battery',
            'Check if pin is on (Green light)',
            'Check if internet connectivity is present',
            'Test with different ethernet cable',
            'Test with different network port',
            'Check if URIS is running',
            'Check if supervisor is running',
            'Check if docker container logger is running',
            'Check if database is malformed',
            'Replace database',
            'Restart all services',
            'Toggle the gateway power switch',
            'Arrange a swap out'
        ]
    },
    {
        key: 'onsite_calibration',
        label: 'Onsite Calibration',
        keywords: ['onsite calibration', 'on site calibration', 'calibration onsite'],
        tools: [
            'Dry Block',
            'Printer',
            'Screw Drivers',
            'Side Cutters',
            'Cable Ties',
            'Double Sided Tape',
            'Ambient Logger',
            'Results Sheets',
            'Contract Review',
            'Extensions',
            'Ladder',
            'Laptop',
            'Laptop Charger'
        ],
        scope: [
            'Ensure contract review is completed',
            'Identify all probes',
            'Gain access to probe',
            'Gain access to system for results',
            'Insert probe into dry block',
            'Verify temperature on system or display',
            'Apply offset if needed',
            'Capture offset',
            'Verify results after offset',
            'Capture results',
            'Repeat for each probe'
        ]
    },
    {
        key: 'mapping_install',
        label: 'Mapping Install',
        keywords: ['mapping install', 'mapping installers', 'mapping logger install'],
        tools: [
            'Mapping Loggers',
            'Install / Uninstall Sheet',
            'Mapping Protocol',
            'Location List',
            'Cable Ties',
            'Double Sided Tape',
            'Cryopak Cable',
            'Ladder',
            'Side Cutter'
        ],
        scope: [
            'Arrange lifting equipment',
            'Install all loggers',
            'Complete location list',
            'Carry out site walk through with customer',
            'Sign protocol'
        ]
    },
    {
        key: 'mapping_uninstall',
        label: 'Mapping Uninstall',
        keywords: ['mapping uninstall', 'mapping removal'],
        tools: [
            'Install / Uninstall Sheet',
            'Location List',
            'Cable Ties',
            'Cryopak Cable',
            'Ladder',
            'Side Cutter',
            'Map'
        ],
        scope: [
            'Arrange lifting equipment',
            'Uninstall all loggers',
            'Tick off against the location list',
            'Complete mapping uninstall form',
            'Make customer sign for damaged or lost loggers'
        ]
    },
    {
        key: 'iot_site_maintenance',
        label: 'IOT Site Maintenance',
        keywords: ['iot site maintenance', 'site maintenance', 'maintenance iot'],
        tools: [
            'Maintenance Sheet',
            'IOT Cable',
            'Spare Antenna',
            'Spare Batteries',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'Spare ITH Logger',
            'Cryopak Logger',
            'Cryopak Programming Cable',
            'IOT Test Node',
            'Spare IOT Cradle',
            'Alarm Setup Sheet'
        ],
        scope: [
            'Assess each logger',
            'Follow the maintenance sheet tasks',
            'Test alarms',
            'Replace damaged antennas and cradles',
            'Verify with customer if alarms were received',
            'Set gateway battery',
            'Complete and sign the maintenance sheet'
        ]
    },
    {
        key: 'gateway_swap_out',
        label: 'Gateway Swop Out',
        keywords: ['gateway swop out', 'gateway swap out'],
        tools: [
            'Spare Gateway',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Laptop',
            'IOT Cable',
            'IOT Test Node'
        ],
        scope: [
            'Shut down or turn off failed gateway',
            'Connect replacement gateway',
            'Switch on replacement gateway',
            'Verify that all loggers are updating'
        ]
    },
    {
        key: 'iot_system_swap_out',
        label: 'IOT System Swop Out',
        keywords: ['iot system swop out', 'iot system swap out', 'loan gateway', 'loan logger'],
        tools: [
            'Swop Out Sheet',
            'IOT Cable',
            'Spare Antenna',
            'Star Screw Driver',
            'Flat Screw Driver',
            'Side Cutter',
            'Cable Ties',
            'Double Sided Tape',
            'Laptop',
            'Laptop Charger',
            'Spare ITH Logger',
            'Cryopak Logger',
            'Cryopak Programming Cable',
            'IOT Test Node',
            'Spare IOT Cradle',
            'Alarm Setup Sheet'
        ],
        scope: [
            'Evaluate if loan gateway needs to be placed',
            'Let loan ITH loggers come online',
            'Swap customers loggers with loan loggers one at a time',
            'Ensure loggers are swapped according to the swap out sheet',
            'Re-configure customer gateway WES and network key to match the loan system',
            'Pack customers loggers and loan gateway in a box to courier back to FBT',
            'Set up alarms and reports',
            'Ensure secondary check is completed',
            'Hand over loan system to customer',
            'Hand over loan calibration certificates'
        ]
    }
];

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

function getCurrentTechnicianProfile() {
    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    return profile?.role === 'technician' ? profile : null;
}

function getCurrentTechnicianAssignment() {
    const profile = getCurrentTechnicianProfile();
    if (!profile?.id) return null;

    return cachedTechs.find(tech => String(tech.id) === String(profile.id)) || {
        id: profile.id,
        username: profile.username || 'Current Technician'
    };
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
    const editTechPicker = document.getElementById('editJobTechPicker');
    const editTechAddBtn = document.getElementById('editJobTechAddBtn');
    const editTechHint = document.getElementById('editJobTechHint');
    const saveButton = document.getElementById('saveJobEditBtn');
    const noteButton = document.getElementById('addJobNoteOnlyBtn');
    const deleteButton = document.getElementById('deleteCurrentJobBtn');
    const stepNoteInput = document.getElementById('editJobStepNote');

    setFormControlsDisabled(editForm, !permissions.canEditJobs);

    if (editTechSelect) {
        editTechSelect.disabled = !permissions.canEditJobs || !permissions.canAssignJobs;
        editTechSelect.classList.toggle('role-readonly-select', editTechSelect.disabled);
    }
    if (editTechPicker) editTechPicker.disabled = !permissions.canEditJobs || !permissions.canAssignJobs;
    if (editTechAddBtn) editTechAddBtn.disabled = !permissions.canEditJobs || !permissions.canAssignJobs;
    if (editTechHint) {
        editTechHint.textContent = permissions.canAssignJobs
            ? 'Managers and super admins can assign one or more technicians to this job at any time.'
            : 'Your role can view the current assigned technicians, but cannot reassign this job.';
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
    const newJobTechPicker = document.getElementById('newJobTechPicker');
    const newJobTechAddBtn = document.getElementById('newJobTechAddBtn');
    const newJobTechHint = document.getElementById('newJobTechHint');
    const submitButton = document.getElementById('dispatchJobBtn');
    const currentTechnician = getCurrentTechnicianAssignment();

    if (newJobTechSelect) {
        if (currentTechnician) {
            const hasOption = Array.from(newJobTechSelect.options).some(option => String(option.value) === String(currentTechnician.id));
            if (!hasOption) {
                const option = document.createElement('option');
                option.value = currentTechnician.id;
                option.textContent = currentTechnician.username;
                newJobTechSelect.appendChild(option);
            }
            Array.from(newJobTechSelect.options).forEach(option => {
                option.selected = String(option.value) === String(currentTechnician.id);
            });
            newJobTechSelect.disabled = true;
        } else {
            newJobTechSelect.disabled = !permissions.canAssignJobs;
        }
        newJobTechSelect.classList.toggle('role-readonly-select', newJobTechSelect.disabled);
    }
    if (newJobTechPicker) {
        newJobTechPicker.disabled = Boolean(currentTechnician) || !permissions.canAssignJobs;
    }
    if (newJobTechAddBtn) {
        newJobTechAddBtn.disabled = Boolean(currentTechnician) || !permissions.canAssignJobs;
    }

    if (newJobTechHint) {
        newJobTechHint.textContent = currentTechnician
            ? `This job will be assigned to ${currentTechnician.username} automatically and start in Dispatched.`
            : 'Select one or more approved active technicians, or leave blank for "Unassigned".';
    }

    syncTechnicianPickerUi('newJobTech');

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

function escapeJobHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeJobWorkPackText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeJobWorkPackList(items = []) {
    const seen = new Set();
    return (Array.isArray(items) ? items : [])
        .map(item => String(item || '').trim())
        .filter(Boolean)
        .filter(item => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function parseWorkPackText(value) {
    if (Array.isArray(value)) return normalizeJobWorkPackList(value);
    return normalizeJobWorkPackList(String(value || '').split(/\r?\n|[,;]+/));
}

function serializeWorkPackList(items = []) {
    const normalized = normalizeJobWorkPackList(items);
    return normalized.length ? normalized.join(WORK_PACK_LINE_DELIMITER) : null;
}

function inferGenericWorkPack(title, jobType, description) {
    const normalized = normalizeJobWorkPackText(`${jobType} ${title} ${description}`);
    const inferredTools = [];
    const inferredScope = [];

    if (normalized.includes('sensor')) inferredTools.push('Sensor device', 'Spare batteries', 'Screw driver set');
    if (normalized.includes('gateway')) inferredTools.push('Gateway device', 'Laptop', 'IOT cable');
    if (normalized.includes('calibration')) inferredTools.push('Calibration kit', 'Printer', 'Results sheets');
    if (normalized.includes('mapping')) inferredTools.push('Mapping loggers', 'Location list', 'Install / uninstall sheet');
    if (normalized.includes('maintenance')) inferredTools.push('Maintenance sheet', 'Spare antennas', 'Spare batteries');
    if (normalized.includes('swap')) inferredTools.push('Replacement unit', 'Swap out sheet', 'Laptop');
    if (normalized.includes('ladder')) inferredTools.push('Ladder');
    if (normalized.includes('cable')) inferredTools.push('Cable ties', 'IOT cable');

    const descriptionLines = String(description || '')
        .split(/\r?\n+/)
        .map(line => line.trim().replace(/^[-*]\s*/, ''))
        .filter(Boolean);

    if (descriptionLines.length) {
        inferredScope.push(...descriptionLines);
    } else {
        inferredScope.push(
            'Review the site scope with the assigned technician',
            'Confirm access, tools, and customer expectations before starting',
            'Capture completion notes and handover details before closing the job'
        );
    }

    if (!inferredTools.length) {
        inferredTools.push('Laptop', 'Basic hand tools', 'Job documentation');
    }

    return {
        key: 'generic',
        label: jobType || 'General Work',
        tools: normalizeJobWorkPackList(inferredTools),
        scope: normalizeJobWorkPackList(inferredScope)
    };
}

function buildJobWorkPackSnapshot(title, jobType, description, existingJob = null) {
    const normalizedText = normalizeJobWorkPackText(`${jobType} ${title} ${description}`);
    const template = JOB_WORK_PACK_LIBRARY.find(entry =>
        (entry.keywords || []).some(keyword => normalizedText.includes(normalizeJobWorkPackText(keyword)))
    );

    const resolved = template || inferGenericWorkPack(title, jobType, description);
    const tools = normalizeJobWorkPackList(resolved.tools);
    const scope = normalizeJobWorkPackList(resolved.scope);

    const existingToolsText = serializeWorkPackList(parseWorkPackText(existingJob?.work_pack_tools));
    const existingScopeText = serializeWorkPackList(parseWorkPackText(existingJob?.work_pack_scope));
    const nextToolsText = serializeWorkPackList(tools);
    const nextScopeText = serializeWorkPackList(scope);
    const templateChanged = String(existingJob?.work_pack_template_key || '') !== String(resolved.key || '');
    const contentChanged = existingToolsText !== nextToolsText || existingScopeText !== nextScopeText || templateChanged;

    return {
        templateKey: resolved.key || 'generic',
        templateLabel: resolved.label || (jobType || 'General Work'),
        tools,
        scope,
        toolsText: nextToolsText,
        scopeText: nextScopeText,
        contentChanged
    };
}

function getWorkPackApprovalBadgeClass(job) {
    return job?.workPackApproved ? 'badge-green' : 'badge-orange';
}

function getWorkPackApprovalLabel(job) {
    return job?.workPackApproved ? 'Tech Approved' : 'Pending Approval';
}

function getJobWorkPackTypeLabels(currentValue = '') {
    const labels = JOB_WORK_PACK_LIBRARY.map(entry => String(entry.label || '').trim()).filter(Boolean);
    const uniqueLabels = [...new Set(labels)];
    const normalizedCurrent = String(currentValue || '').trim();

    if (normalizedCurrent && !uniqueLabels.includes(normalizedCurrent) && normalizedCurrent !== 'Custom') {
        uniqueLabels.push(normalizedCurrent);
    }

    return uniqueLabels;
}

function populateJobTypeSelect(selectId, selectedValue = '', includeCustom = true) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const labels = getJobWorkPackTypeLabels(selectedValue);
    const optionsMarkup = labels
        .map(label => `<option value="${escapeJobHtml(label)}">${escapeJobHtml(label)}</option>`)
        .join('');

    select.innerHTML = optionsMarkup + (includeCustom ? '<option value="Custom">Custom</option>' : '');

    if (includeCustom && selectedValue === 'Custom') {
        select.value = 'Custom';
        return;
    }

    if (labels.includes(selectedValue)) {
        select.value = selectedValue;
        return;
    }

    select.value = labels[0] || '';
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
    let existingCards = parseJobCardNumbers(job?.job_card_numbers || job?.jobCardNumbers);

    if (!existingCards.length && job?.id) {
        const { data: latestJob, error: latestJobError } = await window.supabaseClient
            .from('jobs')
            .select('job_card_numbers')
            .eq('id', job.id)
            .maybeSingle();

        if (latestJobError) throw latestJobError;

        existingCards = parseJobCardNumbers(latestJob?.job_card_numbers);
        if (job && existingCards.length) {
            job.job_card_numbers = [...existingCards];
            job.jobCardNumbers = [...existingCards];
            job.jobCardNumbersDisplay = formatJobCardNumbersDisplay(existingCards);
            job.jobCardSummary = getJobCardSummary(existingCards);
        }
    }

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
    const parsedCards = parseJobCardNumbers(jobCardNumbers);
    const { error } = await window.supabaseClient
        .from('jobs')
        .update({ job_card_numbers: parsedCards })
        .eq('id', jobId);

    if (error) throw error;

    const cachedJob = jobsCache.find(job => job.id === jobId);
    if (cachedJob) {
        cachedJob.job_card_numbers = [...parsedCards];
        cachedJob.jobCardNumbers = [...parsedCards];
        cachedJob.jobCardNumbersDisplay = formatJobCardNumbersDisplay(parsedCards);
        cachedJob.jobCardSummary = getJobCardSummary(parsedCards);
    }
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

function getOwnPendingJobRequest(job, profile = null) {
    const resolvedProfile = profile || (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
    if (!resolvedProfile?.id || !Array.isArray(job?.requestHistory)) return null;

    return job.requestHistory.find(request =>
        request.status === 'pending' &&
        String(request.tech_id) === String(resolvedProfile.id)
    ) || null;
}

function getJobRequestHistoryBadgeClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'badge-green';
    if (normalized === 'rejected') return 'badge-red';
    if (normalized === 'retracted') return 'badge-gray';
    return 'badge-orange';
}

function getJobRequestHistoryLabel(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'Approved';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'retracted') return 'Retracted';
    if (normalized === 'superseded') return 'Closed';
    return 'Pending';
}

function encodeJobRequestField(value) {
    return encodeURIComponent(String(value ?? ''));
}

function decodeJobRequestField(value) {
    try {
        return decodeURIComponent(String(value ?? ''));
    } catch (err) {
        return String(value ?? '');
    }
}

function buildFallbackJobRequestLine(request) {
    return [
        JOB_REQUEST_NOTE_PREFIX,
        encodeJobRequestField(request.id),
        encodeJobRequestField(request.status || 'pending'),
        encodeJobRequestField(request.tech_id || ''),
        encodeJobRequestField(request.tech_username || ''),
        encodeJobRequestField(request.created_at || new Date().toISOString()),
        encodeJobRequestField(request.updated_at || request.created_at || new Date().toISOString()),
        encodeJobRequestField(request.manager_id || ''),
        encodeJobRequestField(request.manager_username || '')
    ].join('|');
}

function parseFallbackJobRequestLine(line, jobId) {
    if (!String(line || '').startsWith(`${JOB_REQUEST_NOTE_PREFIX}|`)) return null;

    const parts = String(line).split('|');
    if (parts.length < 9) return null;

    return {
        id: decodeJobRequestField(parts[1]),
        status: decodeJobRequestField(parts[2]) || 'pending',
        tech_id: decodeJobRequestField(parts[3]) || null,
        tech_username: decodeJobRequestField(parts[4]) || 'Unknown technician',
        created_at: decodeJobRequestField(parts[5]) || new Date().toISOString(),
        updated_at: decodeJobRequestField(parts[6]) || decodeJobRequestField(parts[5]) || new Date().toISOString(),
        manager_id: decodeJobRequestField(parts[7]) || null,
        manager_username: decodeJobRequestField(parts[8]) || '',
        job_id: jobId,
        storage_source: 'fallback'
    };
}

function parseFallbackJobRequests(job) {
    return String(job?.notes || '')
        .split(/\r?\n/)
        .map(line => parseFallbackJobRequestLine(line, job?.id))
        .filter(Boolean);
}

function stripFallbackJobRequestLines(notesText) {
    return String(notesText || '')
        .split(/\r?\n/)
        .filter(line => !String(line || '').startsWith(`${JOB_REQUEST_NOTE_PREFIX}|`))
        .join('\n')
        .trim();
}

async function updateFallbackJobRequestRecords(jobId, updater) {
    const { data: job, error } = await window.supabaseClient
        .from('jobs')
        .select('id, notes')
        .eq('id', jobId)
        .maybeSingle();

    if (error) throw error;
    if (!job?.id) throw new Error('Job could not be found while updating the request history.');

    const baseNotes = stripFallbackJobRequestLines(job.notes);
    const existingRequests = parseFallbackJobRequests(job);
    const nextRequests = updater(Array.isArray(existingRequests) ? existingRequests : []);
    const requestLines = (nextRequests || []).map(buildFallbackJobRequestLine);
    const rebuiltNotes = [baseNotes, ...requestLines].filter(Boolean).join('\n').trim() || null;

    const { error: updateError } = await window.supabaseClient
        .from('jobs')
        .update({ notes: rebuiltNotes })
        .eq('id', jobId);

    if (updateError) throw updateError;
    return nextRequests;
}

async function createJobRequestRecord(jobId, profile) {
    const createdAt = new Date().toISOString();

    const { data: insertedRequest, error } = await window.supabaseClient
        .from('job_assignment_requests')
        .insert([{
            job_id: jobId,
            tech_id: profile.id,
            status: 'pending',
            updated_at: createdAt
        }])
        .select('*')
        .maybeSingle();

    if (!error && insertedRequest?.id) {
        return {
            ...insertedRequest,
            tech_username: profile.username || 'Technician',
            storage_source: 'table'
        };
    }

    console.warn('job_assignment_requests insert unavailable, falling back to jobs.notes:', error?.message || 'Unknown error');
    const requestRecord = {
        id: `fallback-${jobId}-${Date.now()}`,
        status: 'pending',
        tech_id: profile.id,
        tech_username: profile.username || 'Technician',
        created_at: createdAt,
        updated_at: createdAt,
        manager_id: null,
        manager_username: '',
        job_id: jobId,
        storage_source: 'fallback'
    };

    await updateFallbackJobRequestRecords(jobId, existing => {
        const alreadyPending = existing.some(record => record.tech_id === profile.id && record.status === 'pending');
        return alreadyPending ? existing : [...existing, requestRecord];
    });

    return requestRecord;
}

async function updateJobRequestRecordStatus(requestRecord, nextStatus, profile, options = {}) {
    if (!requestRecord?.job_id) throw new Error('Request record is missing its job reference.');
    const updatedAt = new Date().toISOString();
    const shouldRecordManager = options.recordManager !== false;
    const managerId = shouldRecordManager ? (profile?.id || null) : null;
    const managerUsername = shouldRecordManager ? (profile?.username || '') : '';

    if (requestRecord.storage_source !== 'fallback') {
        const { error: requestUpdateError } = await window.supabaseClient
            .from('job_assignment_requests')
            .update({
                status: nextStatus,
                manager_id: managerId,
                updated_at: updatedAt
            })
            .eq('id', requestRecord.id);
        if (requestUpdateError) throw requestUpdateError;

        if (nextStatus === 'approved') {
            const { error: closeOthersError } = await window.supabaseClient
                .from('job_assignment_requests')
                .update({
                    status: 'superseded',
                    manager_id: managerId,
                    updated_at: updatedAt
                })
                .eq('job_id', requestRecord.job_id)
                .eq('status', 'pending')
                .neq('id', requestRecord.id);
            if (closeOthersError) throw closeOthersError;
        }

        return;
    }

    await updateFallbackJobRequestRecords(requestRecord.job_id, existing => existing.map(record => {
        if (record.id === requestRecord.id) {
            return {
                ...record,
                status: nextStatus,
                updated_at: updatedAt,
                manager_id: managerId,
                manager_username: managerUsername
            };
        }

        if (nextStatus === 'approved' && record.status === 'pending') {
            return {
                ...record,
                status: 'superseded',
                updated_at: updatedAt,
                manager_id: managerId,
                manager_username: managerUsername
            };
        }

        return record;
    }));
}

async function refreshJobRequestRelatedViews(jobId) {
    await loadJobsData();
    if (typeof loadDashboardData === 'function') await loadDashboardData();
    if (typeof loadPlannerData === 'function') await loadPlannerData();
    if (typeof loadMapData === 'function') await loadMapData();
    if (typeof refreshJobRequestInbox === 'function') await refreshJobRequestInbox();

    const editModal = document.getElementById('editJobModal');
    if (editModal?.style.display === 'flex' && String(currentEditingJobId) === String(jobId)) {
        await openJobEditModal(jobId);
    }
}

function hydrateRequestRecordsForJob(job, tableRequests, usersById) {
    const fallbackRequests = parseFallbackJobRequests(job);
    const preferredRecords = tableRequests?.length ? tableRequests : fallbackRequests;

    return preferredRecords.map(record => {
        const techUser = usersById.get(record.tech_id) || null;
        const managerUser = usersById.get(record.manager_id) || null;

        return {
            ...record,
            tech: techUser || { username: record.tech_username || 'Unknown technician', email: '' },
            manager: managerUser || { username: record.manager_username || '', email: '' },
            storage_source: record.storage_source || (tableRequests?.length ? 'table' : 'fallback')
        };
    }).sort((left, right) => {
        const leftTime = left.updated_at ? new Date(left.updated_at).getTime() : 0;
        const rightTime = right.updated_at ? new Date(right.updated_at).getTime() : 0;
        return rightTime - leftTime;
    });
}

async function fetchJobRequestEntries(options = {}) {
    const historyLimit = typeof options.historyLimit === 'number' ? options.historyLimit : JOB_REQUEST_ARCHIVE_LIMIT;

    const [jobsResult, clientsResult, sitesResult, usersResult, requestTableResult] = await Promise.all([
        window.supabaseClient.from('jobs').select('id, title, job_type, scheduled_date, protocol_number, job_card_numbers, technician_name, client_id, site_id, notes').order('created_at', { ascending: false }),
        window.supabaseClient.from('clients').select('id, company_name, client_name'),
        window.supabaseClient.from('sites').select('id, name'),
        window.supabaseClient.from('users').select('id, username, email'),
        window.supabaseClient.from('job_assignment_requests').select('*').order('created_at', { ascending: false })
    ]);

    if (jobsResult.error) throw jobsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (sitesResult.error) throw sitesResult.error;
    if (usersResult.error) throw usersResult.error;

    const clientsById = new Map((clientsResult.data || []).map(client => [String(client.id), client]));
    const sitesById = new Map((sitesResult.data || []).map(site => [String(site.id), site]));
    const usersById = new Map((usersResult.data || []).map(user => [String(user.id), user]));
    const requestsByJobId = new Map();

    if (!requestTableResult.error) {
        (requestTableResult.data || []).forEach(record => {
            const existing = requestsByJobId.get(String(record.job_id)) || [];
            existing.push({ ...record, storage_source: 'table' });
            requestsByJobId.set(String(record.job_id), existing);
        });
    } else {
        console.warn('job_assignment_requests table unavailable, using jobs.notes request history instead:', requestTableResult.error.message);
    }

    const allRequests = [];
    (jobsResult.data || []).forEach(job => {
        const site = sitesById.get(String(job.site_id)) || null;
        const client = clientsById.get(String(job.client_id)) || null;
        const requestHistory = hydrateRequestRecordsForJob(job, requestsByJobId.get(String(job.id)) || [], usersById).map(record => ({
            ...record,
            jobs: {
                ...job,
                site_name: site?.name || getSiteDisplayName(job),
                client_name: client?.company_name || client?.client_name || getClientDisplayName(job)
            }
        }));
        allRequests.push(...requestHistory);
    });

    const pending = allRequests
        .filter(request => request.status === 'pending')
        .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

    const history = allRequests
        .filter(request => request.status !== 'pending')
        .sort((left, right) => new Date(right.updated_at || right.created_at).getTime() - new Date(left.updated_at || left.created_at).getTime())
        .slice(0, historyLimit);

    return { pending, history };
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
    if (job.clients?.company_name || job.clients?.client_name) {
        return job.clients.company_name || job.clients.client_name;
    }

    const notes = String(job.notes || '');
    const importedMatch = notes.match(/^Original Customer:\s*(.+)$/im);
    if (importedMatch?.[1]) return importedMatch[1].trim();

    const detachedMatch = notes.match(/^Detached Client Name:\s*(.+)$/im);
    if (detachedMatch?.[1]) return detachedMatch[1].trim();

    return 'Client Pending';
}

function getSiteDisplayName(job) {
    if (job.sites?.name) return job.sites.name;

    const notes = String(job.notes || '');
    const importedMatch = notes.match(/^Original Site:\s*(.+)$/im);
    if (importedMatch?.[1]) return importedMatch[1].trim();

    const detachedMatch = notes.match(/^Detached Site Name:\s*(.+)$/im);
    if (detachedMatch?.[1]) return detachedMatch[1].trim();

    return 'Site Pending';
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
        ...(Array.isArray(job.workPackTools) ? job.workPackTools : []),
        ...(Array.isArray(job.workPackScope) ? job.workPackScope : []),
        job.workPackApprovalLabel,
        job.workPackApprovedByDisplay,
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
    const requestHistory = Array.isArray(job.requestHistory) ? [...job.requestHistory].sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
    }) : [];
    const latestRequest = requestHistory[0] || null;
    const pendingRequests = requestHistory.filter(request => request.status === 'pending');
    const workPack = buildJobWorkPackSnapshot(job.title || '', job.job_type || '', job.description || '', job);
    const workPackApproved = Boolean(job.work_pack_approved_at);

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
        latestStepNote: noteHistory[0]?.note || '',
        requestHistory,
        pendingRequests,
        pendingRequestCount: pendingRequests.length,
        latestRequest,
        workPackTemplateKey: workPack.templateKey,
        workPackTemplateLabel: workPack.templateLabel,
        workPackTools: workPack.tools,
        workPackScope: workPack.scope,
        workPackApproved,
        workPackApprovalBadgeClass: getWorkPackApprovalBadgeClass({ workPackApproved }),
        workPackApprovalLabel: getWorkPackApprovalLabel({ workPackApproved }),
        workPackApprovedAtDisplay: formatJobDateTime(job.work_pack_approved_at),
        workPackApprovedByDisplay: job.work_pack_approved_by || '-'
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
    const hasAssignableUserCacheShape = cachedTechs.length > 0 && cachedTechs.every(user =>
        Object.prototype.hasOwnProperty.call(user, 'role')
        && Object.prototype.hasOwnProperty.call(user, 'status')
        && Object.prototype.hasOwnProperty.call(user, 'approval_status')
    );

    if (!force && cachedClients.length && cachedSites.length && cachedTechs.length && hasAssignableUserCacheShape) return;

    const [clientsResult, sitesResult, techsResult] = await Promise.all([
        window.supabaseClient.from('clients').select('id, client_name, company_name').order('company_name'),
        window.supabaseClient.from('sites').select('id, client_id, name').order('name'),
        window.supabaseClient
            .from('users')
            .select('id, username, email, role, status, approval_status')
            .eq('approval_status', 'approved')
            .eq('status', 'active')
            .order('username')
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (sitesResult.error) throw sitesResult.error;
    if (techsResult.error) throw techsResult.error;

    cachedClients = clientsResult.data || [];
    cachedSites = sitesResult.data || [];
    cachedTechs = techsResult.data || [];
}

function getAssignableUserLabel(user) {
    if (!user) return 'Unknown user';

    const baseLabel = user.username || user.email || 'Unnamed user';
    const roleLabel = String(user.role || '').trim();
    if (!roleLabel) return baseLabel;

    const normalizedRole = roleLabel
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());

    return `${baseLabel} (${normalizedRole})`;
}

function resetHistoricalJobImportState() {
    historicalJobImportState = {
        fileName: '',
        sheetNames: [],
        rows: [],
        previewRows: [],
        duplicatesSkipped: 0,
        headerRowsDetected: 0,
        unmatchedAssigneeCount: 0,
        statusCounts: {},
        filteredOutCount: 0
    };
}

function normalizeHistoricalImportText(value) {
    const normalized = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();

    if (normalized === 'System.Xml.XmlElement') return '';
    return normalized;
}

function normalizeHistoricalImportKey(value) {
    return normalizeHistoricalImportText(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ');
}

function normalizeHistoricalCompactKey(value) {
    return normalizeHistoricalImportKey(value).replace(/\s+/g, '');
}

function stripHistoricalClientLabel(value, client) {
    let normalized = normalizeHistoricalImportKey(value);
    if (!normalized || !client) return normalized;

    [client.company_name, client.client_name]
        .map(label => normalizeHistoricalImportKey(label || ''))
        .filter(Boolean)
        .forEach(label => {
            normalized = normalized.replace(new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'g'), ' ');
        });

    return normalized.replace(/\s+/g, ' ').trim();
}

function scoreHistoricalNameMatch(leftValue, rightValue) {
    const leftKey = normalizeHistoricalImportKey(leftValue);
    const rightKey = normalizeHistoricalImportKey(rightValue);
    if (!leftKey || !rightKey) return 0;
    if (leftKey === rightKey) return 100;

    const leftCompact = normalizeHistoricalCompactKey(leftKey);
    const rightCompact = normalizeHistoricalCompactKey(rightKey);
    if (leftCompact && rightCompact && leftCompact === rightCompact) return 95;
    if (leftKey.includes(rightKey) || rightKey.includes(leftKey)) return 80;
    if (leftCompact && rightCompact && (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact))) return 72;

    const leftTokens = leftKey.split(' ').filter(Boolean);
    const rightTokens = rightKey.split(' ').filter(Boolean);
    if (!leftTokens.length || !rightTokens.length) return 0;

    const sharedTokens = leftTokens.filter(token => rightTokens.includes(token));
    if (!sharedTokens.length) return 0;

    const coverage = sharedTokens.length / Math.max(leftTokens.length, rightTokens.length);
    if (coverage >= 0.75) return 60;
    if (coverage >= 0.5) return 45;
    return 0;
}

function findBestHistoricalClientMatch(rawCustomerName) {
    const normalizedCustomer = normalizeHistoricalImportText(rawCustomerName);
    if (!normalizedCustomer) return null;

    let bestMatch = null;
    let bestScore = 0;

    cachedClients.forEach(client => {
        const score = Math.max(
            scoreHistoricalNameMatch(normalizedCustomer, client?.company_name || ''),
            scoreHistoricalNameMatch(normalizedCustomer, client?.client_name || '')
        );

        if (score > bestScore) {
            bestScore = score;
            bestMatch = client;
        }
    });

    return bestScore >= 80 ? bestMatch : null;
}

function findBestHistoricalSiteMatch(rawSiteName, client = null) {
    const normalizedSite = normalizeHistoricalImportText(rawSiteName);
    if (!normalizedSite) return null;

    const candidateSites = client
        ? cachedSites.filter(site => String(site?.client_id || '') === String(client.id))
        : cachedSites;

    if (!candidateSites.length) return null;

    let bestMatch = null;
    let bestScore = 0;
    let tiedBestMatch = false;

    candidateSites.forEach(site => {
        const directScore = scoreHistoricalNameMatch(normalizedSite, site?.name || '');
        const clientStrippedScore = client
            ? scoreHistoricalNameMatch(stripHistoricalClientLabel(normalizedSite, client), stripHistoricalClientLabel(site?.name || '', client))
            : 0;
        const score = Math.max(directScore, clientStrippedScore);

        if (score > bestScore) {
            bestScore = score;
            bestMatch = site;
            tiedBestMatch = false;
            return;
        }

        if (score && score === bestScore) {
            tiedBestMatch = true;
        }
    });

    if (bestScore < 80 || tiedBestMatch) return null;
    return bestMatch;
}

function openHistoricalJobsImportPicker() {
    if (!getJobsPermissions().canCreateJobs) {
        showJobsPermissionError('Your role cannot import historical jobs.');
        return;
    }

    const input = document.getElementById('jobs-historical-import-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

function closeHistoricalJobsImportModal(reset = false) {
    const modal = document.getElementById('historicalJobsImportModal');
    if (modal) modal.style.display = 'none';

    if (!reset) return;

    resetHistoricalJobImportState();

    const input = document.getElementById('jobs-historical-import-input');
    const previewBody = document.getElementById('historical-jobs-import-preview-body');
    const fileNameEl = document.getElementById('historical-jobs-import-file-name');
    const sheetCountEl = document.getElementById('historical-jobs-import-sheet-count');
    const rowCountEl = document.getElementById('historical-jobs-import-row-count');
    const duplicateCountEl = document.getElementById('historical-jobs-import-duplicate-count');
    const headerCountEl = document.getElementById('historical-jobs-import-header-count');
    const unmatchedCountEl = document.getElementById('historical-jobs-import-unmatched-count');
    const noteEl = document.getElementById('historical-jobs-import-summary-note');
    const confirmBtn = document.getElementById('historical-jobs-import-confirm-btn');

    if (input) input.value = '';
    if (fileNameEl) fileNameEl.textContent = 'No file loaded';
    if (sheetCountEl) sheetCountEl.textContent = '0';
    if (rowCountEl) rowCountEl.textContent = '0';
    if (duplicateCountEl) duplicateCountEl.textContent = '0';
    if (headerCountEl) headerCountEl.textContent = '0';
    if (unmatchedCountEl) unmatchedCountEl.textContent = '0';
    if (noteEl) noteEl.textContent = 'Choose a workbook to preview the historical jobs import.';
    if (confirmBtn) confirmBtn.disabled = true;
    if (previewBody) {
        previewBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; color: var(--text-secondary);">No workbook preview loaded yet.</td>
            </tr>
        `;
    }
}

function normalizeHistoricalImportDate(value) {
    if (!value) return '';

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    }

    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(value);
        if (parsed?.y && parsed?.m && parsed?.d) {
            return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
    }

    const text = normalizeHistoricalImportText(value);
    if (!text) return '';

    if (/^\d+(?:\.\d+)?$/.test(text) && window.XLSX?.SSF?.parse_date_code) {
        const parsed = window.XLSX.SSF.parse_date_code(Number(text));
        if (parsed?.y && parsed?.m && parsed?.d) {
            return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
    }

    const normalized = text.replace(/[\u2013\u2014]/g, '-').replace(/\./g, '/');
    const isoMatch = normalized.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const dayFirstMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dayFirstMatch) {
        let [, day, month, year] = dayFirstMatch;
        if (year.length === 2) year = `20${year}`;
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const parsedDate = new Date(normalized);
    if (!Number.isNaN(parsedDate.getTime())) {
        return `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, '0')}-${String(parsedDate.getDate()).padStart(2, '0')}`;
    }

    return '';
}

function combineHistoricalImportDateTime(dateValue, hour = 8, minute = 0) {
    if (!dateValue) return null;
    const localDate = new Date(`${dateValue}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
    return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
}

function getHistoricalImportToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function getHistoricalImportRecentCompletedCutoff() {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - HISTORICAL_JOB_IMPORT_RECENT_COMPLETED_DAYS);
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
}

function getHistoricalImportCurrentMonthEnd() {
    const monthEnd = new Date();
    monthEnd.setHours(0, 0, 0, 0);
    monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
    return `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
}

function parseHistoricalDurationHours(durationText, fromDate = '', toDate = '') {
    const normalized = normalizeHistoricalImportText(durationText).toLowerCase().replace(',', '.');
    let totalHours = 0;
    let matched = false;

    const dayMatch = normalized.match(/(\d+(?:\.\d+)?)\s*days?/);
    if (dayMatch) {
        totalHours += Number(dayMatch[1]) * 24;
        matched = true;
    }

    const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/);
    if (hourMatch) {
        totalHours += Number(hourMatch[1]);
        matched = true;
    }

    if (matched) return Number(Math.min(totalHours, HISTORICAL_JOB_IMPORT_MAX_DURATION_HOURS).toFixed(2));

    if (fromDate && toDate) {
        const start = new Date(`${fromDate}T00:00:00`);
        const end = new Date(`${toDate}T00:00:00`);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end >= start) {
            const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
            return Number(Math.min(days * 24, HISTORICAL_JOB_IMPORT_MAX_DURATION_HOURS).toFixed(2));
        }
    }

    return 0;
}

function inferHistoricalJobType(description, title = '') {
    const source = `${description || ''} ${title || ''}`.toLowerCase();
    if (source.includes('mapping uninstall')) return 'Mapping Uninstall';
    if (source.includes('mapping install')) return 'Mapping Install';
    if (source.includes('onsite calibration') || source.includes('on site calibration') || source.includes('calibration')) return 'Onsite Calibration';
    if (source.includes('offline gateway')) return 'Offline Gateway';
    if (source.includes('offline sensor')) return 'Offline Sensor';
    if (source.includes('faulty sensor')) return 'Faulty Sensor';
    if (source.includes('faulty gw') || source.includes('faulty gateway')) return 'Faulty GW';
    if (source.includes('gateway swop out')) return 'Gateway Swop Out';
    if (source.includes('iot system swop out')) return 'IOT System Swop Out';
    if (source.includes('site maintenance')) return 'IOT Site Maintenance';
    return 'Historical Task';
}

function detectHistoricalImportHeaderMap(rowCells) {
    const keys = rowCells.map(normalizeHistoricalImportKey);
    const aliases = {
        day: ['day'],
        from_date: ['from date', 'from'],
        to_date: ['to', 'to date', 'end date'],
        duration: ['job duration', 'duration'],
        customer: ['customer', 'client', 'company'],
        site: ['site', 'location', 'customer site', 'client site', 'site name'],
        job_description: ['job desciption', 'job description', 'description', 'task description', 'job'],
        assigned_to: ['technician', 'assigned to', 'assigned user', 'assigned', 'user'],
        status: ['status', 'job status', 'state'],
        notes: ['notes', 'comments', 'remark', 'remarks']
    };

    const map = {};
    Object.entries(aliases).forEach(([field, candidates]) => {
        const index = keys.findIndex(key => candidates.includes(key));
        if (index >= 0) map[field] = index;
    });

    const score = ['from_date', 'customer', 'job_description', 'assigned_to'].filter(field => Number.isInteger(map[field])).length;
    if (score < 3) return null;

    return {
        map,
        headers: rowCells.map(cell => normalizeHistoricalImportText(cell))
    };
}

function buildHistoricalImportFingerprint(record) {
    return [
        record.fromDate || '',
        record.toDate || '',
        record.customer || '',
        record.jobDescription || '',
        record.assignedTo || '',
        record.durationText || ''
    ].map(normalizeHistoricalImportText).join('|').toLowerCase();
}

function buildHistoricalJobImportRecord(rowCells, headerMap, headers, sourceSheet, rowNumber) {
    const readField = field => {
        const index = headerMap[field];
        return Number.isInteger(index) ? normalizeHistoricalImportText(rowCells[index]) : '';
    };

    const dayLabel = readField('day');
    const fromDateRaw = readField('from_date');
    const toDateRaw = readField('to_date');
    const durationText = readField('duration');
    const customer = readField('customer');
    const siteName = readField('site');
    const jobDescription = readField('job_description');
    const assignedTo = readField('assigned_to');
    const statusText = readField('status');
    const directNotes = readField('notes');

    if (!customer && !jobDescription && !assignedTo && !fromDateRaw && !toDateRaw && !durationText) {
        return null;
    }

    const combinedText = `${dayLabel} ${customer} ${jobDescription} ${assignedTo}`.toLowerCase();
    if (combinedText.includes('public holiday') || normalizeHistoricalImportKey(dayLabel) === 'weekend') {
        return null;
    }

    const fromDate = normalizeHistoricalImportDate(fromDateRaw);
    const toDate = normalizeHistoricalImportDate(toDateRaw);
    const title = jobDescription || customer || `Historical Task (${sourceSheet})`;
    const hasWorkIdentity = Boolean(customer || jobDescription);
    const hasTimingSignal = Boolean(fromDate || toDate || normalizeHistoricalImportKey(statusText));

    if (!hasWorkIdentity || !hasTimingSignal) {
        return null;
    }

    const mappedIndexes = new Set(Object.values(headerMap));
    const extraFields = headers
        .map((header, index) => ({ header: header || `Column ${index + 1}`, value: normalizeHistoricalImportText(rowCells[index]), index }))
        .filter(item => item.value && !mappedIndexes.has(item.index))
        .filter(item => !['day', 'from date', 'from', 'to', 'to date', 'job duration', 'duration', 'customer', 'client', 'company', 'site', 'location', 'customer site', 'client site', 'site name', 'job description', 'job desciption', 'description', 'technician', 'assigned to', 'assigned user', 'status', 'notes', 'comments'].includes(normalizeHistoricalImportKey(item.header)));

    const record = {
        sourceSheet,
        rowNumber,
        dayLabel,
        fromDateRaw,
        toDateRaw,
        fromDate,
        toDate,
        durationText,
        customer,
        siteName,
        jobDescription,
        assignedTo,
        statusText,
        directNotes,
        extraFields,
        title,
        jobType: inferHistoricalJobType(jobDescription, title)
    };

    record.fingerprint = buildHistoricalImportFingerprint(record);
    return record;
}

function extractHistoricalJobsFromSheetRows(rows, sourceSheet) {
    let headerMap = null;
    let headers = [];
    let headerRowsDetected = 0;
    const records = [];

    rows.forEach((rawRow, index) => {
        const rowCells = Array.isArray(rawRow) ? rawRow.map(cell => normalizeHistoricalImportText(cell)) : [];
        if (!rowCells.some(Boolean)) return;

        const detectedHeader = detectHistoricalImportHeaderMap(rowCells);
        if (detectedHeader) {
            headerMap = detectedHeader.map;
            headers = detectedHeader.headers;
            headerRowsDetected += 1;
            return;
        }

        if (!headerMap) return;

        const record = buildHistoricalJobImportRecord(rowCells, headerMap, headers, sourceSheet, index + 1);
        if (record) records.push(record);
    });

    return { records, headerRowsDetected };
}

function extractHistoricalMappingReportRows(rows, sourceSheet) {
    if (!Array.isArray(rows) || !rows.length) {
        return { records: [], headerRowsDetected: 0 };
    }

    const headerCells = Array.isArray(rows[0]) ? rows[0].map(cell => normalizeHistoricalImportText(cell)) : [];
    const headerKeys = headerCells.map(normalizeHistoricalImportKey);
    const columnIndexes = {
        customer: headerKeys.findIndex(key => ['customer', 'client', 'company'].includes(key)),
        installDate: headerKeys.findIndex(key => ['install date', 'from date', 'install'].includes(key)),
        uninstallDate: headerKeys.findIndex(key => ['uninstalled date', 'to date', 'uninstall date'].includes(key)),
        dueDate: headerKeys.findIndex(key => ['due date', 'mapping due date'].includes(key)),
        assignedTo: headerKeys.findIndex(key => ['assigned', 'assigned to', 'technician', 'user'].includes(key)),
        status: headerKeys.findIndex(key => ['status', 'job status', 'state'].includes(key)),
        protocolNumber: headerKeys.findIndex(key => ['protocol number', 'protocol'].includes(key)),
        loggerQuantity: headerKeys.findIndex(key => ['logger quantity', 'logger qty', 'quantity', 'qty'].includes(key)),
        duration: headerKeys.findIndex(key => ['duration', 'job duration'].includes(key)),
        temperatureRange: headerKeys.findIndex(key => ['temperature range'].includes(key)),
        humidityRange: headerKeys.findIndex(key => ['humidity range'].includes(key))
    };

    if (!Number.isInteger(columnIndexes.customer) || !Number.isInteger(columnIndexes.installDate)) {
        return { records: [], headerRowsDetected: 0 };
    }

    const readField = (rowCells, index) => Number.isInteger(index) ? normalizeHistoricalImportText(rowCells[index]) : '';
    const records = [];

    rows.slice(1).forEach((rawRow, offset) => {
        const rowCells = Array.isArray(rawRow) ? rawRow : [];
        const customer = readField(rowCells, columnIndexes.customer);
        const installDateRaw = readField(rowCells, columnIndexes.installDate);
        const uninstallDateRaw = readField(rowCells, columnIndexes.uninstallDate);
        const dueDateRaw = readField(rowCells, columnIndexes.dueDate);
        const assignedTo = readField(rowCells, columnIndexes.assignedTo);
        const statusText = readField(rowCells, columnIndexes.status);
        const protocolNumber = readField(rowCells, columnIndexes.protocolNumber);
        const loggerQuantity = readField(rowCells, columnIndexes.loggerQuantity);
        const durationText = readField(rowCells, columnIndexes.duration);
        const temperatureRange = readField(rowCells, columnIndexes.temperatureRange);
        const humidityRange = readField(rowCells, columnIndexes.humidityRange);

        if (!customer && !installDateRaw && !uninstallDateRaw && !assignedTo && !statusText) {
            return;
        }

        const fromDate = normalizeHistoricalImportDate(installDateRaw);
        const toDate = normalizeHistoricalImportDate(uninstallDateRaw || dueDateRaw);
        if (!customer || (!fromDate && !toDate && !normalizeHistoricalImportKey(statusText))) {
            return;
        }
        const extraFields = [
            { header: 'Logger Quantity', value: loggerQuantity },
            { header: 'Protocol Number', value: protocolNumber },
            { header: 'Temperature Range', value: temperatureRange },
            { header: 'Humidity Range', value: humidityRange },
            { header: 'Due Date', value: dueDateRaw }
        ].filter(field => field.value);

        const record = {
            sourceSheet,
            rowNumber: offset + 2,
            dayLabel: '',
            fromDateRaw: installDateRaw,
            toDateRaw: uninstallDateRaw || dueDateRaw,
            fromDate,
            toDate,
            durationText,
            customer,
            jobDescription: 'Mapping report historical record',
            assignedTo,
            statusText,
            directNotes: '',
            extraFields,
            title: `${customer || 'Mapping'} Mapping Report`,
            jobType: 'Mapping Report'
        };

        record.fingerprint = buildHistoricalImportFingerprint(record);
        records.push(record);
    });

    return { records, headerRowsDetected: 1 };
}

function splitHistoricalAssigneeNames(value) {
    const normalized = normalizeHistoricalImportText(value);
    if (!normalized) return [];

    return [...new Set(
        normalized
            .split(/\s*(?:\+|,|\/|&|\band\b)\s*/i)
            .map(part => normalizeHistoricalImportText(part))
            .filter(Boolean)
    )];
}

function resolveHistoricalAssignees(value, users = []) {
    const parts = splitHistoricalAssigneeNames(value);
    const matchedUsers = [];
    const unmatchedNames = [];
    const usedIds = new Set();

    const normalizedUsers = users.map(user => ({
        ...user,
        normalizedUsername: normalizeHistoricalImportKey(user.username || ''),
        normalizedEmailPrefix: normalizeHistoricalImportKey(String(user.email || '').split('@')[0] || '')
    }));

    parts.forEach(part => {
        const normalizedPart = normalizeHistoricalImportKey(part);
        const match = normalizedUsers.find(user =>
            user.normalizedUsername === normalizedPart
            || user.normalizedEmailPrefix === normalizedPart
        );

        if (match) {
            if (!usedIds.has(String(match.id))) {
                usedIds.add(String(match.id));
                matchedUsers.push(match);
            }
            return;
        }

        unmatchedNames.push(part);
    });

    return { matchedUsers, unmatchedNames };
}

function resolveHistoricalImportedStatus(record, matchedUsers = []) {
    const normalizedStatus = normalizeHistoricalImportKey(record?.statusText || '');
    const hasAssignedUsers = Array.isArray(matchedUsers) && matchedUsers.length > 0;
    const hasAssignedText = Boolean(normalizeHistoricalImportText(record?.assignedTo || ''));
    const hasAssignee = hasAssignedUsers || hasAssignedText;
    const scheduledDate = record?.fromDate || record?.toDate || '';
    const endDate = record?.toDate || record?.fromDate || '';
    const today = getHistoricalImportToday();

    if (normalizedStatus.includes('not complete')) {
        return hasAssignee ? 'Dispatched' : 'Unassigned';
    }

    if (normalizedStatus.includes('postponed') || normalizedStatus.includes('delayed')) {
        return 'Delayed';
    }

    if (normalizedStatus.includes('in progress') || normalizedStatus === 'checking') {
        return 'In Progress';
    }

    if (normalizedStatus.includes('hold') || normalizedStatus.includes('handover')) {
        return 'On Hold';
    }

    if (normalizedStatus.includes('complete')) {
        return 'Completed';
    }

    if (endDate && endDate < today) {
        return 'Completed';
    }

    if (scheduledDate && scheduledDate > today) {
        return hasAssignee ? 'Dispatched' : 'Unassigned';
    }

    return hasAssignee ? 'Dispatched' : 'Unassigned';
}

function shouldIncludeHistoricalImportRecord(record, importStatus) {
    const today = getHistoricalImportToday();
    const recentCompletedCutoff = getHistoricalImportRecentCompletedCutoff();
    const currentMonthEnd = getHistoricalImportCurrentMonthEnd();
    const scheduledDate = record?.fromDate || record?.toDate || '';
    const endDate = record?.toDate || record?.fromDate || '';
    const normalizedStatus = normalizeHistoricalImportKey(record?.statusText || '');
    const hasRealDate = Boolean(scheduledDate || endDate);
    const anchorDate = endDate || scheduledDate || '';

    if (!record?.customer && !record?.jobDescription) {
        return false;
    }

    if (importStatus === 'Completed') {
        if (!endDate) return false;
        return endDate >= recentCompletedCutoff && endDate <= today;
    }

    if (['In Progress', 'On Hold', 'Delayed'].includes(importStatus)) {
        if (!hasRealDate && !normalizedStatus) return false;
        if (anchorDate && anchorDate > currentMonthEnd) return false;
        return true;
    }

    if (['Unassigned', 'Dispatched'].includes(importStatus)) {
        if (!hasRealDate) return false;
        return anchorDate >= today && anchorDate <= currentMonthEnd;
    }

    return false;
}

function buildHistoricalImportNotes(record, unmatchedNames = []) {
    const lines = [
        HISTORICAL_JOB_IMPORT_NOTE_PREFIX,
        `${HISTORICAL_JOB_FINGERPRINT_PREFIX} ${record.fingerprint}`,
        `Source Sheet: ${record.sourceSheet}`,
        `Source Row: ${record.rowNumber}`,
        record.dayLabel ? `Original Day: ${record.dayLabel}` : '',
        record.fromDateRaw ? `Original From Date: ${record.fromDateRaw}` : '',
        record.toDateRaw ? `Original To Date: ${record.toDateRaw}` : '',
        record.durationText ? `Original Duration: ${record.durationText}` : '',
        record.customer ? `Original Customer: ${record.customer}` : '',
        record.siteName ? `Original Site: ${record.siteName}` : '',
        record.assignedTo ? `Original Assigned People: ${record.assignedTo}` : '',
        record.statusText ? `Original Status: ${record.statusText}` : '',
        record.directNotes ? `Original Notes: ${record.directNotes}` : '',
        unmatchedNames.length ? `Unmatched Assigned Names: ${unmatchedNames.join(', ')}` : '',
        ...(record.extraFields || []).map(field => `${field.header}: ${field.value}`)
    ].filter(Boolean);

    return lines.join('\n');
}

function renderHistoricalJobsImportPreview() {
    const modal = document.getElementById('historicalJobsImportModal');
    const previewBody = document.getElementById('historical-jobs-import-preview-body');
    const fileNameEl = document.getElementById('historical-jobs-import-file-name');
    const sheetCountEl = document.getElementById('historical-jobs-import-sheet-count');
    const rowCountEl = document.getElementById('historical-jobs-import-row-count');
    const duplicateCountEl = document.getElementById('historical-jobs-import-duplicate-count');
    const headerCountEl = document.getElementById('historical-jobs-import-header-count');
    const unmatchedCountEl = document.getElementById('historical-jobs-import-unmatched-count');
    const noteEl = document.getElementById('historical-jobs-import-summary-note');
    const confirmBtn = document.getElementById('historical-jobs-import-confirm-btn');

    if (!previewBody || !fileNameEl || !sheetCountEl || !rowCountEl || !duplicateCountEl || !headerCountEl || !unmatchedCountEl || !noteEl || !confirmBtn) return;

    fileNameEl.textContent = historicalJobImportState.fileName || 'No file loaded';
    sheetCountEl.textContent = String(historicalJobImportState.sheetNames.length);
    rowCountEl.textContent = String(historicalJobImportState.rows.length);
    duplicateCountEl.textContent = String(historicalJobImportState.duplicatesSkipped);
    headerCountEl.textContent = String(historicalJobImportState.headerRowsDetected);
    unmatchedCountEl.textContent = String(historicalJobImportState.unmatchedAssigneeCount);
    confirmBtn.disabled = !historicalJobImportState.rows.length;
    const completedCount = Number(historicalJobImportState.statusCounts.Completed || 0);
    const activeCount = Math.max(0, historicalJobImportState.rows.length - completedCount);
    const filteredOutCount = Number(historicalJobImportState.filteredOutCount || 0);

    noteEl.textContent = historicalJobImportState.rows.length
        ? `${historicalJobImportState.rows.length} historical row${historicalJobImportState.rows.length === 1 ? '' : 's'} are ready to import from ${historicalJobImportState.sheetNames.join(', ')}. ${completedCount} will archive as completed and ${activeCount} will stay on the live board. ${filteredOutCount} row${filteredOutCount === 1 ? '' : 's'} were skipped because they are older than the last ${HISTORICAL_JOB_IMPORT_RECENT_COMPLETED_DAYS} days, not active, or not upcoming in the current month. Duplicate rows inside the workbook were removed automatically.`
        : 'No importable historical jobs were detected in the selected workbook. Check that the file still contains the old tracker layout.';

    if (!historicalJobImportState.previewRows.length) {
        previewBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; color: var(--text-secondary);">No import preview rows are available.</td>
            </tr>
        `;
    } else {
        previewBody.innerHTML = historicalJobImportState.previewRows.map(row => `
            <tr>
                <td>${escapeJobHtml(row.sourceSheet)}</td>
                <td>${escapeJobHtml(row.fromDate || row.fromDateRaw || '-')}</td>
                <td>${escapeJobHtml(row.toDate || row.toDateRaw || '-')}</td>
                <td>${escapeJobHtml(row.customer || '-')}</td>
                <td>${escapeJobHtml(row.title || '-')}</td>
                <td>${escapeJobHtml(row.assignedTo || 'Unassigned')}</td>
                <td>${escapeJobHtml(row.durationText || '-')}</td>
                <td><span class="badge ${getJobStatusBadgeClass(row.importStatusPreview || 'Unassigned')}">${escapeJobHtml(row.importStatusPreview || 'Unassigned')}</span></td>
            </tr>
        `).join('');
    }

    if (modal) modal.style.display = 'flex';
}

async function handleHistoricalJobsImport(event) {
    const file = event.target?.files?.[0];
    if (!file) return;

    try {
        await ensureJobReferenceData(true);
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, `Reading ${file.name}...`);

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const normalizedSheetNames = workbook.SheetNames.map(name => normalizeHistoricalImportKey(name));
        const hasMasterTechnicalSheet = normalizedSheetNames.includes(HISTORICAL_JOB_IMPORT_MASTER_TECHNICAL_SHEET);
        const candidateSheets = workbook.SheetNames.filter(name => {
            const normalizedName = normalizeHistoricalImportKey(name);
            if (HISTORICAL_JOB_IMPORT_EXCLUDED_SHEETS.has(normalizedName)) return false;
            if (hasMasterTechnicalSheet && HISTORICAL_JOB_IMPORT_DUPLICATE_TECHNICAL_SHEETS.has(normalizedName)) return false;
            return true;
        });
        const parsedSheetNames = [];

        const parsedRows = [];
        const fingerprints = new Set();
        const statusCounts = {};
        let duplicatesSkipped = 0;
        let headerRowsDetected = 0;
        let unmatchedAssigneeCount = 0;
        let filteredOutCount = 0;

        candidateSheets.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) return;

            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: true, blankrows: false });
            const normalizedSheetName = normalizeHistoricalImportKey(sheetName);
            let extracted = { records: [], headerRowsDetected: 0 };

            if (normalizedSheetName === HISTORICAL_JOB_IMPORT_MAPPING_SHEET) {
                extracted = extractHistoricalMappingReportRows(rows, sheetName);
                if (!extracted.records.length && !extracted.headerRowsDetected) {
                    extracted = extractHistoricalJobsFromSheetRows(rows, sheetName);
                }
            } else {
                extracted = extractHistoricalJobsFromSheetRows(rows, sheetName);
                if (!extracted.records.length && !extracted.headerRowsDetected) {
                    extracted = extractHistoricalMappingReportRows(rows, sheetName);
                }
            }
            headerRowsDetected += extracted.headerRowsDetected;
            if (extracted.records.length || extracted.headerRowsDetected) {
                parsedSheetNames.push(sheetName);
            }

            extracted.records.forEach(record => {
                if (fingerprints.has(record.fingerprint)) {
                    duplicatesSkipped += 1;
                    return;
                }

                fingerprints.add(record.fingerprint);
                const { matchedUsers, unmatchedNames } = resolveHistoricalAssignees(record.assignedTo, cachedTechs);
                const importStatusPreview = resolveHistoricalImportedStatus(record, matchedUsers);
                if (!shouldIncludeHistoricalImportRecord(record, importStatusPreview)) {
                    filteredOutCount += 1;
                    return;
                }
                if (unmatchedNames.length) unmatchedAssigneeCount += 1;
                record.importStatusPreview = importStatusPreview;
                statusCounts[importStatusPreview] = Number(statusCounts[importStatusPreview] || 0) + 1;
                parsedRows.push(record);
            });
        });

        historicalJobImportState = {
            fileName: file.name,
            sheetNames: parsedSheetNames,
            rows: parsedRows,
            previewRows: parsedRows.slice(0, HISTORICAL_JOB_IMPORT_PREVIEW_LIMIT),
            duplicatesSkipped,
            headerRowsDetected,
            unmatchedAssigneeCount,
            statusCounts,
            filteredOutCount
        };

        renderHistoricalJobsImportPreview();
    } catch (error) {
        console.error('Historical jobs import preview error:', error);
        if (typeof showToast === 'function') showToast('Historical job import preview failed: ' + error.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function fetchExistingHistoricalImportFingerprints() {
    const { data, error } = await window.supabaseClient
        .from('jobs')
        .select('notes')
        .eq('created_by', HISTORICAL_JOB_IMPORT_NOTE_PREFIX);

    if (error) throw error;

    return new Set((data || [])
        .map(job => {
            const match = String(job.notes || '').match(/Historical Tracker Fingerprint:\s*(.+)/i);
            return match ? match[1].trim().toLowerCase() : '';
        })
        .filter(Boolean));
}

function buildHistoricalClientLookup() {
    const lookup = new Map();

    cachedClients.forEach(client => {
        const labels = [
            client?.company_name,
            client?.client_name
        ];

        labels.forEach(label => {
            const key = normalizeHistoricalImportKey(label || '');
            if (!key || lookup.has(key)) return;
            lookup.set(key, client);
        });
    });

    return lookup;
}

function buildHistoricalSiteLookupByClient() {
    const clientSiteLookup = new Map();

    cachedSites.forEach(site => {
        const clientId = String(site?.client_id || '').trim();
        const siteKey = normalizeHistoricalImportKey(site?.name || '');
        if (!clientId || !siteKey) return;

        let siteMap = clientSiteLookup.get(clientId);
        if (!siteMap) {
            siteMap = new Map();
            clientSiteLookup.set(clientId, siteMap);
        }

        if (!siteMap.has(siteKey)) {
            siteMap.set(siteKey, site);
        }
    });

    return clientSiteLookup;
}

function buildHistoricalUniqueSiteLookup() {
    const siteMap = new Map();
    const duplicates = new Set();

    cachedSites.forEach(site => {
        const keys = new Set([
            normalizeHistoricalImportKey(site?.name || ''),
            normalizeHistoricalCompactKey(site?.name || '')
        ]);

        keys.forEach(key => {
            if (!key) return;
            if (siteMap.has(key)) {
                duplicates.add(key);
                return;
            }
            siteMap.set(key, site);
        });
    });

    duplicates.forEach(key => siteMap.delete(key));
    return siteMap;
}

async function importHistoricalJobsToArchive() {
    if (!getJobsPermissions().canCreateJobs) {
        showJobsPermissionError('Your role cannot import historical jobs.');
        return;
    }

    const rows = Array.isArray(historicalJobImportState.rows) ? historicalJobImportState.rows : [];
    if (!rows.length) {
        if (typeof showToast === 'function') showToast('Load a tracker workbook before importing historical jobs.', 'error');
        return;
    }

    const confirmBtn = document.getElementById('historical-jobs-import-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Importing...';
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Importing historical jobs...');
        await ensureJobReferenceData(true);

        const existingFingerprints = await fetchExistingHistoricalImportFingerprints();
        const clientLookup = buildHistoricalClientLookup();
        const sitesByClientLookup = buildHistoricalSiteLookupByClient();
        const uniqueSiteLookup = buildHistoricalUniqueSiteLookup();
        const rowsToImport = rows.filter(row => !existingFingerprints.has(String(row.fingerprint || '').toLowerCase()));

        if (!rowsToImport.length) {
            if (typeof showToast === 'function') showToast('These historical tracker rows were already imported earlier.', 'info');
            closeHistoricalJobsImportModal(true);
            return;
        }

        const jobPayloads = [];
        const assignmentPayloads = [];
        const importedStatusCounts = {};
        let unmatchedRows = 0;
        let matchedClientCount = 0;
        let matchedSiteCount = 0;

        rowsToImport.forEach(row => {
            const jobId = crypto.randomUUID();
            const { matchedUsers, unmatchedNames } = resolveHistoricalAssignees(row.assignedTo, cachedTechs);
            const scheduledDate = row.fromDate || row.toDate || '';
            const completedDate = row.toDate || row.fromDate || '';
            const customerKey = normalizeHistoricalImportKey(row.customer || '');
            let matchedClient = clientLookup.get(customerKey) || findBestHistoricalClientMatch(row.customer || '') || null;
            let clientId = matchedClient?.id || null;
            let matchedSite = null;

            if (clientId) {
                const exactSiteKey = normalizeHistoricalImportKey(row.siteName || '');
                matchedSite = sitesByClientLookup.get(String(clientId))?.get(exactSiteKey)
                    || findBestHistoricalSiteMatch(row.siteName || '', matchedClient);
            } else {
                const uniqueGlobalSiteMatch = uniqueSiteLookup.get(normalizeHistoricalImportKey(row.siteName || ''))
                    || uniqueSiteLookup.get(normalizeHistoricalCompactKey(row.siteName || ''))
                    || null;

                if (uniqueGlobalSiteMatch) {
                    matchedSite = uniqueGlobalSiteMatch;
                    matchedClient = cachedClients.find(client => String(client.id) === String(uniqueGlobalSiteMatch.client_id)) || null;
                    clientId = matchedClient?.id || null;
                } else {
                    matchedSite = findBestHistoricalSiteMatch(row.siteName || '');
                    if (matchedSite?.client_id) {
                        matchedClient = cachedClients.find(client => String(client.id) === String(matchedSite.client_id)) || null;
                        clientId = matchedClient?.id || null;
                    }
                }
            }

            const siteId = matchedSite?.id || null;
            const durationHours = parseHistoricalDurationHours(row.durationText, row.fromDate, row.toDate);
            const importedStatus = resolveHistoricalImportedStatus(row, matchedUsers);
            const startedAt = importedStatus === 'Completed' || importedStatus === 'In Progress' || importedStatus === 'On Hold' || importedStatus === 'Delayed'
                ? combineHistoricalImportDateTime(scheduledDate, 8, 0)
                : null;
            const completedAt = importedStatus === 'Completed'
                ? combineHistoricalImportDateTime(completedDate, 17, 0)
                : null;
            const importNotes = buildHistoricalImportNotes(row, unmatchedNames) + (
                durationHours >= HISTORICAL_JOB_IMPORT_MAX_DURATION_HOURS
                    ? `\nImported Duration Hours: capped at ${HISTORICAL_JOB_IMPORT_MAX_DURATION_HOURS} to fit the jobs table limit.`
                    : ''
            );

            if (unmatchedNames.length) unmatchedRows += 1;
            if (clientId) matchedClientCount += 1;
            if (siteId) matchedSiteCount += 1;
            importedStatusCounts[importedStatus] = Number(importedStatusCounts[importedStatus] || 0) + 1;

            jobPayloads.push({
                id: jobId,
                title: row.title,
                job_type: row.jobType || 'Historical Task',
                protocol_number: null,
                job_card_numbers: [],
                description: row.jobDescription || null,
                client_id: clientId,
                site_id: siteId,
                created_by: HISTORICAL_JOB_IMPORT_NOTE_PREFIX,
                status: importedStatus,
                technician_name: row.assignedTo || null,
                estimated_duration_hours: durationHours,
                scheduled_date: scheduledDate || null,
                started_at: startedAt,
                completed_at: completedAt,
                notes: importNotes,
                created_at: combineHistoricalImportDateTime(completedDate || scheduledDate, 17, 0) || new Date().toISOString()
            });

            matchedUsers.forEach(user => {
                assignmentPayloads.push({
                    job_id: jobId,
                    tech_id: user.id
                });
            });
        });

        for (let index = 0; index < jobPayloads.length; index += 200) {
            const chunk = jobPayloads.slice(index, index + 200);
            const { error } = await window.supabaseClient.from('jobs').insert(chunk);
            if (error) throw error;
        }

        if (assignmentPayloads.length) {
            for (let index = 0; index < assignmentPayloads.length; index += 200) {
                const chunk = assignmentPayloads.slice(index, index + 200);
                const { error } = await window.supabaseClient.from('job_assignments').insert(chunk);
                if (error) throw error;
            }
        }

        if (typeof window.logAppActivity === 'function') {
            await window.logAppActivity({
                eventType: 'change',
                moduleName: 'jobs',
                entityType: 'jobs',
                entityId: null,
                entityLabel: historicalJobImportState.fileName || 'Historical tracker import',
                actionSummary: `Imported ${jobPayloads.length} historical job record${jobPayloads.length === 1 ? '' : 's'} from the tracker into the jobs system.`,
                actionDetails: `Workbook: ${historicalJobImportState.fileName || 'unknown'}. Sheets parsed: ${historicalJobImportState.sheetNames.join(', ')}. Imported status split: ${Object.entries(importedStatusCounts).map(([status, count]) => `${status} ${count}`).join(', ')}. Matched clients: ${matchedClientCount}. Matched sites: ${matchedSiteCount}. Unmatched assignee rows: ${unmatchedRows}.`,
                changedFields: ['jobs', 'job_assignments'],
                metadata: {
                    imported_job_count: jobPayloads.length,
                    imported_assignment_count: assignmentPayloads.length,
                    source_file: historicalJobImportState.fileName || '',
                    parsed_sheets: historicalJobImportState.sheetNames,
                    matched_client_count: matchedClientCount,
                    matched_site_count: matchedSiteCount,
                    unmatched_assignee_rows: unmatchedRows,
                    imported_status_counts: importedStatusCounts
                }
            }).catch(error => console.warn('Historical job import audit logging failed:', error.message));
        }

        closeHistoricalJobsImportModal(true);
        const completedImportedCount = Number(importedStatusCounts.Completed || 0);
        const liveImportedCount = Math.max(0, jobPayloads.length - completedImportedCount);
        if (typeof showToast === 'function') showToast(`${jobPayloads.length} historical job${jobPayloads.length === 1 ? '' : 's'} imported. ${completedImportedCount} archived and ${liveImportedCount} added to the live board.`, 'success');
        await loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
        if (typeof loadPlannerData === 'function') loadPlannerData();
        if (typeof loadMapData === 'function') loadMapData();

        const overviewTabButton = document.querySelector('.jobs-tab-btn[data-jobs-panel="overview"]');
        const completedTabButton = document.querySelector('.jobs-tab-btn[data-jobs-panel="completed"]');
        if (liveImportedCount > 0 && overviewTabButton) {
            switchJobsPanel('overview', overviewTabButton);
        } else if (completedTabButton) {
            switchJobsPanel('completed', completedTabButton);
        }
    } catch (error) {
        console.error('Historical jobs import error:', error);
        if (typeof showToast === 'function') showToast('Historical job import failed: ' + error.message, 'error');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = !historicalJobImportState.rows.length;
            confirmBtn.textContent = 'Import Tracker Jobs';
        }
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
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
        cachedTechs.map(tech => `<option value="${tech.id}">${getAssignableUserLabel(tech)}</option>`).join('');

    Array.from(select.options).forEach(option => {
        option.selected = selectedValues.includes(option.value);
    });

    if (!supportsMultiple) {
        select.value = selectedValues[0] || '';
    }

    syncTechnicianPickerUi(selectId);
}

function getSingleSelectedTechnicianId(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return '';
    return String(select.value || '').trim();
}

function getTechnicianPickerConfig(modeOrSelectId) {
    if (modeOrSelectId === 'new' || modeOrSelectId === 'newJobTech') {
        return {
            selectId: 'newJobTech',
            pickerId: 'newJobTechPicker',
            listId: 'newJobTechSelectedList',
            addButtonId: 'newJobTechAddBtn'
        };
    }

    if (modeOrSelectId === 'edit' || modeOrSelectId === 'editJobTech') {
        return {
            selectId: 'editJobTech',
            pickerId: 'editJobTechPicker',
            listId: 'editJobTechSelectedList',
            addButtonId: 'editJobTechAddBtn'
        };
    }

    return null;
}

function syncTechnicianPickerUi(modeOrSelectId) {
    const config = getTechnicianPickerConfig(modeOrSelectId);
    if (!config) return;

    const hiddenSelect = document.getElementById(config.selectId);
    const picker = document.getElementById(config.pickerId);
    const list = document.getElementById(config.listId);
    const addButton = document.getElementById(config.addButtonId);
    if (!hiddenSelect || !picker || !list) return;

    const selectedIds = getSelectedTechnicianIds(config.selectId).map(String);
    const selectedTechs = cachedTechs.filter(tech => selectedIds.includes(String(tech.id)));
    const selectedIdSet = new Set(selectedIds);
    const canEditSelections = !hiddenSelect.disabled && !(addButton?.disabled);

    picker.innerHTML = '<option value="">Select technician...</option>' +
        cachedTechs
            .filter(tech => !selectedIdSet.has(String(tech.id)))
            .map(tech => `<option value="${tech.id}">${getAssignableUserLabel(tech)}</option>`)
            .join('');

    picker.value = '';

    if (!selectedTechs.length) {
        list.innerHTML = '<span style="color: var(--text-secondary);">No technicians selected yet.</span>';
        return;
    }

    list.innerHTML = selectedTechs.map(tech => `
        <span style="display:inline-flex; align-items:center; gap:8px; margin:0 8px 8px 0; padding:8px 12px; border-radius:999px; background: var(--surface-elevated); border:1px solid var(--border-color);">
            <span>${getAssignableUserLabel(tech)}</span>
            ${canEditSelections ? `
                <button
                    type="button"
                    class="btn btn-small"
                    style="padding:2px 8px; min-height:auto;"
                    onclick="removeTechnicianSelection('${config.selectId}', '${String(tech.id).replace(/'/g, "\\'")}')"
                >
                    Remove
                </button>
            ` : ''}
        </span>
    `).join('');
}

function addTechnicianSelection(mode) {
    const config = getTechnicianPickerConfig(mode);
    if (!config) return;

    const hiddenSelect = document.getElementById(config.selectId);
    const picker = document.getElementById(config.pickerId);
    if (!hiddenSelect || !picker) return;

    const selectedId = String(picker.value || '').trim();
    if (!selectedId) return;

    Array.from(hiddenSelect.options).forEach(option => {
        if (String(option.value) === selectedId) {
            option.selected = true;
        }
    });

    syncTechnicianPickerUi(config.selectId);
}

function removeTechnicianSelection(selectId, techId) {
    const hiddenSelect = document.getElementById(selectId);
    if (!hiddenSelect) return;

    Array.from(hiddenSelect.options).forEach(option => {
        if (String(option.value) === String(techId)) {
            option.selected = false;
        }
    });

    syncTechnicianPickerUi(selectId);
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
    const [jobsResult, clientsResult, sitesResult, assignmentsResult, usersResult, notesResult, requestTableResult] = await Promise.all([
        window.supabaseClient.from('jobs').select('*').order('created_at', { ascending: false }),
        window.supabaseClient.from('clients').select('id, company_name, client_name'),
        window.supabaseClient.from('sites').select('id, name'),
        window.supabaseClient.from('job_assignments').select('job_id, tech_id, assigned_at'),
        window.supabaseClient.from('users').select('id, username'),
        window.supabaseClient.from('job_notes').select('*').order('created_at', { ascending: false }),
        window.supabaseClient.from('job_assignment_requests').select('*').order('created_at', { ascending: false })
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
    const requestsByJobId = new Map();

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

    if (!requestTableResult.error) {
        (requestTableResult.data || []).forEach(request => {
            const existing = requestsByJobId.get(request.job_id) || [];
            existing.push({ ...request, storage_source: 'table' });
            requestsByJobId.set(request.job_id, existing);
        });
    } else {
        console.warn('job_assignment_requests table unavailable, continuing with jobs.notes request history:', requestTableResult.error.message);
    }

    const enrichedJobs = (jobsResult.data || []).map(job => enrichJob({
        ...job,
        clients: clientsById.get(job.client_id) || null,
        sites: sitesById.get(job.site_id) || null,
        job_assignments: assignmentsByJobId.get(job.id) || [],
        noteHistory: notesByJobId.get(job.id) || [],
        requestHistory: hydrateRequestRecordsForJob(job, requestsByJobId.get(job.id) || [], usersById)
    })).filter(shouldCurrentUserSeeJob);

    return assignJobDisplayNumbers(enrichedJobs);
}

function renderKanbanBoard(jobs) {
    const orderedJobs = sortJobsByDueDate(jobs);
    const currentProfile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
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
        const ownPendingRequest = getOwnPendingJobRequest(job, currentProfile);

        const el = document.createElement('div');
        el.className = `job-card ${status.replace(/\s+/g, '-').toLowerCase()}`;
        el.dataset.jobId = job.id;
        el.tabIndex = 0;

        el.innerHTML = `
            <div class="job-card-header">
                <div>
                    <div class="job-card-topline">
                        <span class="job-id-mini">#${job.displayJobNumber}</span>
                        <span class="job-type-mini">${job.job_type || 'General Work'}</span>
                    </div>
                    <h4>${job.title}</h4>
                    <p class="job-route-line"><i class="fas fa-building"></i> ${job.displayName} <span>/</span> ${job.siteDisplayName}</p>
                </div>
                <div class="job-card-status-stack">
                    <span class="badge ${getJobStatusBadgeClass(status)}">${status}</span>
                    ${job.remainingTimeText ? `<span class="${getRemainingTimeClass(job)}">${job.remainingTimeText}</span>` : ''}
                </div>
            </div>
            <div class="job-tech-info">
                <div class="job-signal-grid">
                    <span class="job-signal-pill"><i class="fas fa-user"></i> ${job.technicianDisplayName}</span>
                    <span class="job-signal-pill"><i class="fas fa-calendar"></i> ${job.dueDateDisplay === '-' ? 'Unscheduled' : job.dueDateDisplay}</span>
                    <span class="job-signal-pill"><i class="fas fa-hourglass-half"></i> ${job.durationDisplay}</span>
                    <span class="job-signal-pill"><i class="fas fa-toolbox"></i> ${job.workPackTools.length} tools &bull; ${job.workPackScope.length} scope</span>
                </div>
                ${job.latestStepNote ? `<div class="job-note-preview"><strong>Latest note:</strong> ${job.latestStepNote}</div>` : ''}
                ${job.pendingRequestCount ? `<div class="job-request-badge-inline"><i class="fas fa-envelope-open-text"></i> ${job.pendingRequestCount} request${job.pendingRequestCount === 1 ? '' : 's'} waiting</div>` : ''}
                <div class="job-card-actions" style="margin-top: 10px;">
                    ${(job.status || 'Unassigned') === 'Unassigned' && (typeof getCurrentUserProfile === 'function' && getCurrentUserProfile()?.role === 'technician') ? 
                        ownPendingRequest ? `
                            <button type="button" class="btn btn-small btn-secondary w-full" onclick="event.stopPropagation(); retractJobRequest('${job.id}', '${ownPendingRequest.id}')">
                                <i class="fas fa-rotate-left"></i> Retract Request
                            </button>
                        ` : `
                            <button type="button" class="btn btn-small btn-blue w-full" onclick="event.stopPropagation(); requestJobAssignment('${job.id}', '${String(job.title || 'Job').replace(/'/g, "\\'")}')">
                                <i class="fas fa-hand-paper"></i> Request Job
                            </button>
                        `
                    : ''}
                </div>
            </div>
            <div class="job-lifecycle-dates">
                <div class="job-lifecycle-item"><span>Created</span><strong>${job.createdAtDisplay}</strong></div>
                <div class="job-lifecycle-item"><span>Assigned</span><strong>${job.assignedAtDisplay}</strong></div>
                <div class="job-lifecycle-item"><span>Due</span><strong>${job.dueDateDisplay}</strong></div>
                <div class="job-lifecycle-item"><span>Duration</span><strong>${job.durationDisplay}</strong></div>
            </div>
            <div class="job-meta">
                <span class="job-meta-chip"><i class="fas fa-fingerprint"></i> ${job.protocol_number || job.id}</span>
                ${job.createdByDisplay ? `<span class="job-meta-chip"><i class="fas fa-user"></i> ${job.createdByDisplay}</span>` : ''}
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
    const laneCountTargets = {
        'Unassigned': document.getElementById('kb-colcount-Unassigned'),
        'Dispatched': document.getElementById('kb-colcount-Dispatched'),
        'In Progress': document.getElementById('kb-colcount-InProgress'),
        'On Hold': document.getElementById('kb-colcount-OnHold'),
        'Delayed': document.getElementById('kb-colcount-Delayed'),
        'Completed': document.getElementById('kb-colcount-Completed')
    };
    Object.entries(laneCountTargets).forEach(([statusKey, target]) => {
        if (target) target.innerText = counts[statusKey] || 0;
    });

    const completedTabCount = document.getElementById('jobs-completed-tab-count');
    if (completedTabCount) completedTabCount.innerText = counts.Completed;

    Object.entries(cols).forEach(([statusKey, col]) => {
        if (!col) return;
        const cardCount = Array.from(col.children).filter(child => child.classList && child.classList.contains('job-card')).length;
        if (!cardCount && statusKey !== 'Completed') {
            col.innerHTML = '<div class="kanban-empty-state"><i class="fas fa-star"></i><span>No jobs in this lane right now.</span></div>';
        } else if (!cardCount && statusKey === 'Completed' && !col.querySelector('.kanban-drop-hint')) {
            col.innerHTML = '<div class="kanban-drop-hint">Drop here to complete and archive a job.</div>';
        }
    });

    Object.values(cols).forEach(col => {
        if (!col) return;
        if (col._sortable) col._sortable.destroy();

        col._sortable = new Sortable(col, {
            group: 'kanban',
            animation: 150,
            draggable: '.job-card',
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
                    if (typeof showToast === 'function') showToast(e?.message || 'Database error: could not update job status.', 'error');
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
        const ownPendingRequest = getOwnPendingJobRequest(job, profile);

        let techCell = `<span class="role-readonly">Loading techs...</span>`;
        if (cachedTechs.length > 0) {
            const selectedTechId = (job.assignedTechIds || [])[0] || '';
            techCell = `
                <select class="form-control select-small ${canAssign ? '' : 'role-readonly-select'}" ${canAssign ? '' : 'disabled'} onchange="assignJobToTechnician('${job.id}', this.value)">
                    <option value="">Unassigned</option>
                    ${cachedTechs.map(tech => `
                        <option value="${tech.id}" ${String(selectedTechId) === String(tech.id) ? 'selected' : ''}>
                            ${getAssignableUserLabel(tech)}
                        </option>
                    `).join('')}
                </select>
            `;
        }

        return `
        <tr>
            <td class="jobs-tech-job-id-cell"><strong>${job.displayJobNumber}</strong></td>
            <td>
                <div class="jobs-tech-job-cell">
                    <strong>${job.title}</strong>
                    <span>${job.latestStepNote || 'No step note yet'}</span>
                    <span class="jobs-tech-meta-inline">${job.workPackTools.length} tools • ${job.workPackScope.length} scope steps</span>
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
                        ownPendingRequest ? `
                            <button class="btn btn-small btn-secondary" onclick="retractJobRequest('${job.id}', '${ownPendingRequest.id}')" title="Retract your pending request">
                                <i class="fas fa-rotate-left"></i> Retract
                            </button>
                        ` : `
                            <button class="btn btn-small btn-blue" onclick="requestJobAssignment('${job.id}', '${String(job.title || 'Job').replace(/'/g, "\\'")}')" title="Request this job">
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

        const currentJob = jobsCache.find(job => String(job.id) === String(jobId));
        const selectedTech = cachedTechs.find(t => t.id === techId);
        const techName = selectedTech ? selectedTech.username : null; 
        const nextStatus = techId ? 'Dispatched' : 'Unassigned';
        const assignedTechChanged = String((currentJob?.assignedTechIds || [])[0] || '') !== String(techId || '');

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
            status: nextStatus,
            work_pack_approved_at: assignedTechChanged ? null : (currentJob?.work_pack_approved_at || null),
            work_pack_approved_by: assignedTechChanged ? null : (currentJob?.work_pack_approved_by || null)
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
        const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
        if (!profile || profile.role !== 'technician') {
            if (typeof showToast === 'function') showToast('Only technicians can request jobs.', 'error');
            return;
        }

        if (!profile.id) {
            throw new Error('Your user profile is not linked to the database yet. Please sign out and sign in again after running the latest database schema.');
        }

        const confirmReq = window.confirm(`Request to be assigned to job "${jobTitle}"? This will notify managers for approval.`);
        if (!confirmReq) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Sending request...');

        const cachedJob = jobsCache.find(job => String(job.id) === String(jobId));
        if (getOwnPendingJobRequest(cachedJob, profile)) {
            if (typeof showToast === 'function') showToast('You already have a pending request for this job.', 'info');
            return;
        }

        const { data: existing, error: existingError } = await window.supabaseClient
            .from('job_assignment_requests')
            .select('id')
            .eq('job_id', jobId)
            .eq('tech_id', profile.id)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingError) {
            console.warn('Could not verify existing request in job_assignment_requests:', existingError.message);
        }

        if (existing) {
            if (typeof showToast === 'function') showToast('You have already requested this job. Please wait for manager approval.', 'info');
            return;
        }

        await createJobRequestRecord(jobId, profile);

        if (typeof showToast === 'function') showToast('Job request sent to managers.', 'success');
        await refreshJobRequestRelatedViews(jobId);
    } catch (err) {
        console.error('Request job error:', err);
        if (typeof showToast === 'function') showToast('Failed to send request: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function retractJobRequest(jobId, requestId = '') {
    try {
        const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
        if (!profile || profile.role !== 'technician') {
            if (typeof showToast === 'function') showToast('Only technicians can retract their own requests.', 'error');
            return;
        }

        const cachedJob = jobsCache.find(job => String(job.id) === String(jobId));
        const requestRecord = (Array.isArray(cachedJob?.requestHistory) ? cachedJob.requestHistory : []).find(request => {
            if (requestId) return String(request.id) === String(requestId);
            return request.status === 'pending' && String(request.tech_id) === String(profile.id);
        });

        if (!requestRecord) throw new Error('The pending request could not be found. Refresh the jobs board and try again.');
        if (requestRecord.status !== 'pending') throw new Error('Only pending requests can be retracted.');
        if (String(requestRecord.tech_id) !== String(profile.id)) throw new Error('You can only retract your own requests.');

        const confirmRetract = window.confirm(`Retract your request for "${cachedJob?.title || 'this job'}"?`);
        if (!confirmRetract) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Retracting request...');

        await updateJobRequestRecordStatus(requestRecord, 'retracted', profile, { recordManager: false });

        if (typeof showToast === 'function') showToast('Request retracted.', 'success');
        await refreshJobRequestRelatedViews(jobId);
    } catch (err) {
        console.error('Retract job request error:', err);
        if (typeof showToast === 'function') showToast('Failed to retract request: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.requestJobAssignment = requestJobAssignment;
window.retractJobRequest = retractJobRequest;
window.fetchJobRequestEntries = fetchJobRequestEntries;
window.updateJobRequestRecordStatus = updateJobRequestRecordStatus;

function renderCompletedJobsTable(jobs) {
    const tbody = document.getElementById('jobs-completed-table-body');
    if (!tbody) return;

    const completedJobs = sortJobsByDueDate(jobs.filter(job => job.status === 'Completed'));
    const showCreatedBy = canViewCreatedByColumn();
    const canDeleteJobs = getJobsPermissions().canDeleteJobs;
    const canEditJobs = getJobsPermissions().canEditJobs;
    if (!completedJobs.length) {
        tbody.innerHTML = `<tr><td colspan="${showCreatedBy ? 15 : 14}" style="text-align:center; color: var(--text-secondary);">No completed jobs archived yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = completedJobs.map(job => `
        <tr>
            <td class="jobs-tech-job-id-cell"><strong>${job.displayJobNumber}</strong></td>
            <td>
                <div class="jobs-tech-job-cell">
                    <strong>${job.title}</strong>
                    <span>${job.latestStepNote || 'No step note yet'}</span>
                    <span class="jobs-tech-meta-inline">${job.workPackTools.length} tools • ${job.workPackScope.length} scope steps</span>
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
            <td>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${canEditJobs ? `<button class="btn btn-small" onclick="openJobEditModal('${job.id}')"><i class="fas fa-pen"></i> Edit</button>` : ''}
                    ${canDeleteJobs ? `<button class="btn btn-small" onclick="deleteJobFromTable('${job.id}')"><i class="fas fa-trash"></i></button>` : ''}
                    ${!canEditJobs && !canDeleteJobs ? '-' : ''}
                </div>
            </td>
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

function canCurrentTechnicianApproveWorkPack(job) {
    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    if (!profile || profile.role !== 'technician') return false;
    return Array.isArray(job?.assignedTechIds) && job.assignedTechIds.includes(profile.id);
}

function getCurrentEditJobTypeValue(job) {
    const jobTypeSelect = document.getElementById('editJobType');
    if (!jobTypeSelect) return job?.job_type || '';
    return jobTypeSelect.value || job?.job_type || '';
}

function getCurrentEditWorkPackSnapshot(job) {
    if (!job || currentEditingJobId !== job.id) {
        return buildJobWorkPackSnapshot(job?.title || '', job?.job_type || '', job?.description || '', job);
    }

    const nextTitle = document.getElementById('editJobTitle')?.value?.trim() || job.title || '';
    const nextJobType = getCurrentEditJobTypeValue(job);
    const nextDescription = document.getElementById('editJobDesc')?.value?.trim() || '';
    return buildJobWorkPackSnapshot(nextTitle, nextJobType, nextDescription, job);
}

function bindEditJobWorkPackPanel(job) {
    const titleInput = document.getElementById('editJobTitle');
    const descriptionInput = document.getElementById('editJobDesc');
    const jobTypeInput = document.getElementById('editJobType');
    if (!titleInput || !descriptionInput || !jobTypeInput || !job) return;

    const rerenderPanel = () => renderJobWorkPackPanel(job);
    titleInput.oninput = rerenderPanel;
    descriptionInput.oninput = rerenderPanel;
    jobTypeInput.onchange = rerenderPanel;
}

function renderJobWorkPackPanel(job) {
    const container = document.getElementById('jobWorkPackPanel');
    const actionArea = document.getElementById('jobWorkPackActionArea');
    if (!container || !actionArea || !job) return;

    const snapshot = getCurrentEditWorkPackSnapshot(job);
    const canApprove = canCurrentTechnicianApproveWorkPack(job);
    const approvalLabel = job.workPackApproved && !snapshot.contentChanged ? 'Tech Approved' : 'Pending Approval';
    const approvalBadgeClass = job.workPackApproved && !snapshot.contentChanged ? 'badge-green' : 'badge-orange';
    const approvalCopy = job.workPackApproved && !snapshot.contentChanged
        ? `Approved by ${job.workPackApprovedByDisplay} on ${job.workPackApprovedAtDisplay}`
        : job.workPackApproved && snapshot.contentChanged
            ? 'Pending approval. Save these job changes first because the previous technician approval will reset when the job type, scope of work, or tools change.'
            : 'Pending approval. The assigned technician can approve and time stamp this work pack here.';

    container.innerHTML = `
        <div class="work-pack-inline-layout">
            <div class="work-pack-inline-card">
                <strong>Tools Required</strong>
                <ol>
                    ${snapshot.tools.map(item => `<li>${escapeJobHtml(item)}</li>`).join('')}
                </ol>
            </div>
            <div class="work-pack-inline-card">
                <strong>Scope Of Work</strong>
                <ol>
                    ${snapshot.scope.map(item => `<li>${escapeJobHtml(item)}</li>`).join('')}
                </ol>
            </div>
        </div>
        <div class="work-pack-timestamp-card">
            <strong>Approval Status</strong>
            <div class="work-pack-timestamp-row">
                <span class="badge ${approvalBadgeClass}">${approvalLabel}</span>
                <span>${escapeJobHtml(approvalCopy)}</span>
            </div>
        </div>
        <div class="work-pack-inline-footer">
            <span>The assigned technician can approve this work pack from this job card before starting field work.</span>
        </div>
    `;

    actionArea.innerHTML = canApprove && !job.workPackApproved && !snapshot.contentChanged
        ? `<button type="button" class="btn btn-small btn-blue" onclick="approveJobWorkPack('${job.id}')"><i class="fas fa-check-circle"></i> Approve & Timestamp</button>`
        : '';
}

function renderJobRequestHistoryPanel(job) {
    const container = document.getElementById('jobRequestHistory');
    const actionContainer = document.getElementById('jobRequestActionArea');
    if (!container || !actionContainer) return;

    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const isTechnician = profile?.role === 'technician';
    const canApprove = Boolean(profile && (
        profile.role === 'manager' ||
        profile.role === 'admin' ||
        profile.role === 'superadmin' ||
        profile.is_superadmin
    ));
    const pendingRequests = Array.isArray(job?.requestHistory) ? job.requestHistory.filter(request => request.status === 'pending') : [];
    const archivedRequests = Array.isArray(job?.requestHistory) ? job.requestHistory.filter(request => request.status !== 'pending').slice(0, JOB_REQUEST_ARCHIVE_LIMIT) : [];
    const ownPendingRequest = pendingRequests.find(request => String(request.tech_id) === String(profile?.id)) || null;

    if (!job?.requestHistory?.length) {
        container.innerHTML = '<div class="job-note-empty">No technician requests logged for this job yet.</div>';
    } else {
        container.innerHTML = `
            ${pendingRequests.length ? `
                <div class="job-request-inline-group">
                    <div class="job-request-inline-heading">Pending Requests</div>
                    ${pendingRequests.map(request => `
                        <div class="job-request-inline-card">
                            <div class="job-request-inline-meta">
                                <span class="badge badge-blue">Pending</span>
                                <span>${request.tech?.username || request.tech_username || 'Unknown technician'} • ${formatJobDateTime(request.created_at)}</span>
                            </div>
                            <div class="job-request-inline-grid">
                                <span><strong>Site:</strong> ${job.siteDisplayName}</span>
                                <span><strong>Date:</strong> ${job.dueDateDisplay}</span>
                                <span><strong>Protocol:</strong> ${job.protocol_number || '-'}</span>
                                <span><strong>Job Card:</strong> ${job.jobCardNumbersDisplay}</span>
                            </div>
                            ${canApprove ? `
                                <div class="job-request-inline-actions">
                                    <button type="button" class="btn btn-small btn-red btn-outline" onclick="rejectJobRequest('${request.id}')">Reject</button>
                                    <button type="button" class="btn btn-small btn-blue" onclick="approveJobRequest('${request.id}', '${request.job_id}', '${request.tech_id}', '${String(request.tech?.username || request.tech_username || 'Technician').replace(/'/g, "\\'")}')">Approve</button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            ${archivedRequests.length ? `
                <div class="job-request-inline-group">
                    <div class="job-request-inline-heading">Last ${Math.min(JOB_REQUEST_ARCHIVE_LIMIT, archivedRequests.length)} Archived Requests</div>
                    ${archivedRequests.map(request => `
                        <div class="job-request-inline-card archived">
                            <div class="job-request-inline-meta">
                                <span class="badge ${getJobRequestHistoryBadgeClass(request.status)}">${getJobRequestHistoryLabel(request.status)}</span>
                                <span>${request.tech?.username || request.tech_username || 'Unknown technician'} • ${formatJobDateTime(request.updated_at || request.created_at)}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    }

    if (isTechnician && (job.status || 'Unassigned') === 'Unassigned') {
        actionContainer.innerHTML = ownPendingRequest
            ? `
                <div class="job-request-inline-actions">
                    <span class="badge badge-blue">Your request is pending manager approval.</span>
                    <button type="button" class="btn btn-small btn-secondary" onclick="retractJobRequest('${job.id}', '${ownPendingRequest.id}')">
                        <i class="fas fa-rotate-left"></i> Retract Request
                    </button>
                </div>
            `
            : `<button type="button" class="btn btn-small btn-blue" onclick="requestJobAssignment('${job.id}', '${String(job.title || 'Job').replace(/'/g, "\\'")}')"><i class="fas fa-hand-paper"></i> Request This Job</button>`;
    } else {
        actionContainer.innerHTML = '';
    }
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

    const job = jobsCache.find(item => item.id === jobId) || null;
    if (newStatus === 'Completed') {
        const currentCards = await ensureJobCardsBeforeCompletion(job || { id: jobId });

        if (!currentCards.length) {
            throw new Error('A job card number is required before completing a job.');
        }

        if (!parseJobCardNumbers(job?.job_card_numbers || job?.jobCardNumbers).length) {
            await updateJobCardNumbers(jobId, currentCards);
        }
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

    if (job) {
        job.status = newStatus;
        if (updateData.started_at) job.started_at = updateData.started_at;
        if (Object.prototype.hasOwnProperty.call(updateData, 'completed_at')) {
            job.completed_at = updateData.completed_at;
        }
    }

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
        
        jobsCache = await fetchJobsDataset();
        const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
        userRequestsCache = profile?.role === 'technician'
            ? jobsCache
                .filter(job => Array.isArray(job.requestHistory) && job.requestHistory.some(request => request.status === 'pending' && String(request.tech_id) === String(profile.id)))
                .map(job => job.id)
            : [];

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
        populateJobTypeSelect('newJobType', 'Offline Sensor', true);
        bindDurationInputs('newJobDurationDays', 'newJobDurationHours', 'newJobDurationPreview');
        bindCustomJobTypeInput();
        applyNewJobPermissions();

        const clientSelect = document.getElementById('newJobClient');
        clientSelect.onchange = (event) => populateSiteSelect('newJobSite', event.target.value, '', 'newJobSiteHint');

        const jobTypeSelect = document.getElementById('newJobType');
        const customTypeInput = document.getElementById('newJobCustomType');
        if (jobTypeSelect) jobTypeSelect.value = 'Offline Sensor';
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
        populateJobTypeSelect('editJobType', job.job_type || 'Offline Sensor', false);
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
        renderJobRequestHistoryPanel(job);
        bindEditJobWorkPackPanel(job);
        renderJobWorkPackPanel(job);
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

    const selectedTechIds = permissions.canAssignJobs
        ? getSelectedTechnicianIds('editJobTech')
        : (job.assignedTechIds || []);
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
        try {
            const ensuredCards = await ensureJobCardsBeforeCompletion({
                ...job,
                job_card_numbers: jobCardNumbers,
                jobCardNumbers: jobCardNumbers
            });

            if (ensuredCards?.length) {
                jobCardNumbers = ensuredCards;
                const jobCardsInput = document.getElementById('editJobCards');
                if (jobCardsInput) {
                    jobCardsInput.value = formatJobCardsForInput(jobCardNumbers);
                }
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            return;
        }
    }

    if (nextStatus === 'Completed' && !jobCardNumbers.length) {
        if (typeof showToast === 'function') showToast('Add at least one job card number before completing this job.', 'error');
        const jobCardsInput = document.getElementById('editJobCards');
        if (jobCardsInput) jobCardsInput.focus();
        return;
    }

    const nextTitle = document.getElementById('editJobTitle').value.trim();
    const nextProtocol = document.getElementById('editJobProtocol').value.trim() || null;
    const nextDescription = document.getElementById('editJobDesc').value.trim() || null;
    const nextClientId = document.getElementById('editJobClient').value || null;
    const nextSiteId = document.getElementById('editJobSite').value || null;
    const nextJobType = document.getElementById('editJobType').value;
    const nextScheduledDate = document.getElementById('editJobDate').value || null;
    const nextDurationHours = durationPartsToHours(
        document.getElementById('editJobDurationDays').value,
        document.getElementById('editJobDurationHours').value
    );
    const nextNotes = document.getElementById('editJobGeneralNotes').value.trim() || null;
    const nextTechnicianName = permissions.canAssignJobs
        ? (selectedTechs.length ? selectedTechs.map(tech => tech.username).join(', ') : null)
        : (job.technician_name || job.technicianDisplayName || null);
    const workPackSnapshot = buildJobWorkPackSnapshot(nextTitle, nextJobType, nextDescription || '', job);
    const previousAssignedTechIds = (job.assignedTechIds || []).map(id => String(id)).sort();
    const nextAssignedTechIds = [...selectedTechIds].map(id => String(id)).sort();
    const assignedTechListChanged = JSON.stringify(previousAssignedTechIds) !== JSON.stringify(nextAssignedTechIds);
    const shouldResetWorkPackApproval = workPackSnapshot.contentChanged || assignedTechListChanged;

    const updateData = {
        title: nextTitle,
        protocol_number: nextProtocol,
        job_card_numbers: jobCardNumbers,
        description: nextDescription,
        client_id: nextClientId,
        site_id: nextSiteId,
        job_type: nextJobType,
        status: nextStatus,
        scheduled_date: nextScheduledDate,
        estimated_duration_hours: nextDurationHours,
        notes: nextNotes,
        technician_name: nextTechnicianName,
        work_pack_template_key: workPackSnapshot.templateKey,
        work_pack_tools: workPackSnapshot.toolsText,
        work_pack_scope: workPackSnapshot.scopeText,
        work_pack_generated_at: new Date().toISOString(),
        work_pack_approved_at: shouldResetWorkPackApproval ? null : (job.work_pack_approved_at || null),
        work_pack_approved_by: shouldResetWorkPackApproval ? null : (job.work_pack_approved_by || null)
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

        if (shouldResetWorkPackApproval && job.work_pack_approved_at) {
            await insertJobStepNote(job.id, nextStatus, 'Work pack approval was cleared because the job scope, generated tools, or assigned technicians changed.', await getCurrentActorLabel());
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

async function approveJobWorkPack(jobId) {
    const job = jobsCache.find(item => item.id === jobId);
    if (!job) return;

    if (!canCurrentTechnicianApproveWorkPack(job)) {
        if (typeof showToast === 'function') showToast('Only the assigned technician can approve this work pack.', 'error');
        return;
    }

    try {
        const approver = await getCurrentActorLabel();
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Approving work pack...');
        const { error } = await window.supabaseClient
            .from('jobs')
            .update({
                work_pack_approved_at: new Date().toISOString(),
                work_pack_approved_by: approver
            })
            .eq('id', jobId);

        if (error) throw error;

        await insertJobStepNote(jobId, job.status || 'Dispatched', 'Technician approved the work pack, tools list, and scope of work.', approver);
        await loadJobsData();
        if (currentEditingJobId === jobId) {
            await openJobEditModal(jobId);
        }
        if (typeof showToast === 'function') showToast('Work pack approved and time stamped.', 'success');
    } catch (err) {
        console.error('Approve work pack error:', err);
        if (typeof showToast === 'function') showToast('Failed to approve work pack: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
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
    
    const currentTechnician = getCurrentTechnicianAssignment();
    const selectedTechIds = currentTechnician
        ? [String(currentTechnician.id)]
        : (permissions.canAssignJobs ? getSelectedTechnicianIds('newJobTech') : []);
    
    const date = document.getElementById('newJobDate').value;
    const duration = durationPartsToHours(
        document.getElementById('newJobDurationDays').value,
        document.getElementById('newJobDurationHours').value
    );
    const initialStatus = selectedTechIds.length ? 'Dispatched' : 'Unassigned';
    const selectedTechs = selectedTechIds.map(techId =>
        cachedTechs.find(tech => String(tech.id) === String(techId))
        || (currentTechnician && String(currentTechnician.id) === String(techId) ? currentTechnician : null)
    ).filter(Boolean);
    const createdBy = await getCurrentActorLabel();
    const workPackSnapshot = buildJobWorkPackSnapshot(title, type, description || '');

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
            scheduled_date: date || null,
            work_pack_template_key: workPackSnapshot.templateKey,
            work_pack_tools: workPackSnapshot.toolsText,
            work_pack_scope: workPackSnapshot.scopeText,
            work_pack_generated_at: new Date().toISOString(),
            work_pack_approved_at: null,
            work_pack_approved_by: null
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
window.approveJobWorkPack = approveJobWorkPack;
window.openHistoricalJobsImportPicker = openHistoricalJobsImportPicker;
window.handleHistoricalJobsImport = handleHistoricalJobsImport;
window.closeHistoricalJobsImportModal = closeHistoricalJobsImportModal;
window.importHistoricalJobsToArchive = importHistoricalJobsToArchive;
