let currentPlannerDate = new Date();
let plannerJobsCache = [];
let plannerTechsCache = [];
let plannerBindingsReady = false;
let plannerMonthFilters = {
    techId: '',
    status: 'all',
    search: '',
    selectedDateKey: ''
};

function escapePlannerHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPlannerDateValue(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatPlannerMonthLabel(date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatPlannerShortDay(date) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatPlannerDayLabel(date) {
    return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatPlannerDuration(totalHours) {
    if (typeof formatDurationDisplay === 'function') {
        return formatDurationDisplay(totalHours);
    }

    const normalized = Math.max(0, Number(totalHours) || 0);
    const days = Math.floor(normalized / 24);
    const hours = Number((normalized - (days * 24)).toFixed(1));
    return `${days}d ${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatPlannerHourCompact(totalHours) {
    const normalized = Math.max(0, Number(totalHours) || 0);
    if (normalized === 0) return '0h';
    return normalized % 1 === 0 ? `${normalized.toFixed(0)}h` : `${normalized.toFixed(1)}h`;
}

function formatPlannerTimestamp(job) {
    const candidates = [job.started_at, job.scheduled_at, job.install_date, job.created_at];
    for (const value of candidates) {
        if (!value) continue;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) continue;

        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return 'All day';
        }

        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return 'All day';
}

function setSummaryPairStats(primaryLabel, primaryValue, secondaryLabel, secondaryValue, ids = {}) {
    const primaryCountId = ids.primaryCountId || 'planner-scheduled-count';
    const secondaryCountId = ids.secondaryCountId || 'planner-tech-count';
    const primaryLabelEl = document.querySelector(`#${primaryCountId}`)?.previousElementSibling;
    const secondaryLabelEl = document.querySelector(`#${secondaryCountId}`)?.previousElementSibling;
    const primaryValueEl = document.getElementById(primaryCountId);
    const secondaryValueEl = document.getElementById(secondaryCountId);

    if (primaryLabelEl) primaryLabelEl.textContent = primaryLabel;
    if (secondaryLabelEl) secondaryLabelEl.textContent = secondaryLabel;
    if (primaryValueEl) primaryValueEl.textContent = primaryValue;
    if (secondaryValueEl) secondaryValueEl.textContent = secondaryValue;
}

function setPlannerMonthOverview(summary = {}) {
    const titleEl = document.getElementById('planner-overview-title');
    const descriptionEl = document.getElementById('planner-overview-description');
    const scheduledEl = document.getElementById('planner-scheduled-count');
    const hoursEl = document.getElementById('planner-tech-count');
    const activeDaysEl = document.getElementById('planner-active-days-count');
    const busiestDayEl = document.getElementById('planner-busiest-day');

    if (titleEl) titleEl.textContent = summary.title || 'Operations Month Planner';
    if (descriptionEl) descriptionEl.textContent = summary.description || 'A tailored month calendar for each technician with workload, site detail, and quick drill-down into every scheduled day.';
    if (scheduledEl) scheduledEl.textContent = summary.jobCount ?? 0;
    if (hoursEl) hoursEl.textContent = summary.hoursLabel || '0h';
    if (activeDaysEl) activeDaysEl.textContent = summary.activeDays ?? 0;
    if (busiestDayEl) busiestDayEl.textContent = summary.busiestDayLabel || '-';
}

function getPlannerCurrentProfile() {
    return typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
}

function refreshPlannerWorkspace() {
    if (!plannerJobsCache.length && !plannerTechsCache.length) {
        loadPlannerData();
        return;
    }
    renderPlannerMonthWorkspace();
}

function bindPlannerControls() {
    if (plannerBindingsReady) return;

    const ownerFilter = document.getElementById('planner-user-filter');
    const statusFilter = document.getElementById('planner-status-filter');
    const searchInput = document.getElementById('planner-search-input');
    const container = document.getElementById('planner-container');
    const dayAgenda = document.getElementById('planner-day-agenda');
    const unscheduledList = document.getElementById('planner-unscheduled-list');

    if (ownerFilter) {
        ownerFilter.addEventListener('change', (event) => {
            plannerMonthFilters.techId = event.target.value || 'all';
            plannerMonthFilters.selectedDateKey = '';
            refreshPlannerWorkspace();
        });
    }

    if (statusFilter) {
        statusFilter.addEventListener('change', (event) => {
            plannerMonthFilters.status = event.target.value || 'all';
            plannerMonthFilters.selectedDateKey = '';
            refreshPlannerWorkspace();
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            plannerMonthFilters.search = event.target.value || '';
            refreshPlannerWorkspace();
        });
    }

    const delegatedClick = (event) => {
        const openJobBtn = event.target.closest('[data-planner-job-id]');
        if (openJobBtn) {
            event.stopPropagation();
            openPlannerJob(openJobBtn.getAttribute('data-planner-job-id'));
            return;
        }

        const dayCell = event.target.closest('[data-planner-date]');
        if (dayCell) {
            plannerMonthFilters.selectedDateKey = dayCell.getAttribute('data-planner-date') || '';
            renderPlannerMonthWorkspace();
        }
    };

    if (container) container.addEventListener('click', delegatedClick);
    if (dayAgenda) dayAgenda.addEventListener('click', delegatedClick);
    if (unscheduledList) unscheduledList.addEventListener('click', delegatedClick);

    plannerBindingsReady = true;
}

function getPlannerAssignedTechIds(job) {
    if (Array.isArray(job?.assignedTechIds) && job.assignedTechIds.length) {
        return job.assignedTechIds.map(id => String(id));
    }

    if (Array.isArray(job?.job_assignments) && job.job_assignments.length) {
        return job.job_assignments.map(assignment => String(assignment?.tech_id || '')).filter(Boolean);
    }

    return [];
}

function getPlannerAssignedNames(job) {
    if (Array.isArray(job?.assignedTechNames) && job.assignedTechNames.length) {
        return job.assignedTechNames;
    }

    if (job?.technicianDisplayName) {
        return [job.technicianDisplayName];
    }

    if (job?.technician_name) {
        return String(job.technician_name).split(',').map(name => name.trim()).filter(Boolean);
    }

    return [];
}

function getPlannerMonthRange(date) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const startOffset = (monthStart.getDay() + 6) % 7;
    const endOffset = 6 - ((monthEnd.getDay() + 6) % 7);

    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - startOffset);
    gridStart.setHours(0, 0, 0, 0);

    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(monthEnd.getDate() + endOffset);
    gridEnd.setHours(0, 0, 0, 0);

    return {
        monthStart,
        monthEnd,
        gridStart,
        gridEnd,
        label: formatPlannerMonthLabel(monthStart),
        monthStartKey: toDateKey(monthStart),
        monthEndKey: toDateKey(monthEnd)
    };
}

function getPlannerVisibleDays(range) {
    const days = [];
    const cursor = new Date(range.gridStart);
    while (cursor <= range.gridEnd) {
        days.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
    }
    return days;
}

function getPlannerSelectedTechProfile() {
    if (!plannerMonthFilters.techId || plannerMonthFilters.techId === 'all') return null;
    return plannerTechsCache.find(tech => String(tech.id) === String(plannerMonthFilters.techId)) || null;
}

function populatePlannerOwnerFilter(techs) {
    const select = document.getElementById('planner-user-filter');
    if (!select) return;

    const profile = getPlannerCurrentProfile();
    const isTechnician = profile?.role === 'technician';
    const matchingTech = isTechnician
        ? techs.find(tech => String(tech.id) === String(profile.id))
        : null;
    const options = isTechnician
        ? (matchingTech ? [matchingTech] : [{ id: profile?.id, username: profile?.username || 'Current Technician' }])
        : techs;

    select.innerHTML = `${isTechnician ? '' : '<option value="all">All planners</option>'}` + options.map(tech => `
        <option value="${tech.id}">${escapePlannerHtml(tech.username)}</option>
    `).join('');

    if (isTechnician) {
        plannerMonthFilters.techId = String(profile.id);
        select.value = String(profile.id);
        select.disabled = true;
        select.classList.add('role-readonly-select');
    } else {
        if (!plannerMonthFilters.techId) plannerMonthFilters.techId = 'all';
        select.value = plannerMonthFilters.techId;
        select.disabled = false;
        select.classList.remove('role-readonly-select');
    }
}

function syncPlannerFilterInputs() {
    const statusFilter = document.getElementById('planner-status-filter');
    const searchInput = document.getElementById('planner-search-input');

    if (statusFilter) statusFilter.value = plannerMonthFilters.status || 'all';
    if (searchInput) searchInput.value = plannerMonthFilters.search || '';
}

function getPlannerSearchTarget(job) {
    return [
        job.title,
        job.job_type,
        job.protocol_number,
        job.displayName,
        job.siteDisplayName,
        job.technicianDisplayName,
        ...(job.assignedTechNames || []),
        job.description,
        job.notes
    ].filter(Boolean).join(' ').toLowerCase();
}

function filterPlannerJobsForCurrentMonth(range) {
    return plannerJobsCache.filter(job => {
        if (!job?.scheduled_date) return false;
        if (job.scheduled_date < range.monthStartKey || job.scheduled_date > range.monthEndKey) return false;
        if (plannerMonthFilters.status !== 'all' && String(job.status || 'Unassigned') !== plannerMonthFilters.status) return false;
        if (plannerMonthFilters.techId && plannerMonthFilters.techId !== 'all' && !getPlannerAssignedTechIds(job).includes(String(plannerMonthFilters.techId))) return false;
        if (plannerMonthFilters.search && !getPlannerSearchTarget(job).includes(plannerMonthFilters.search.toLowerCase())) return false;
        return true;
    });
}

function filterPlannerUnscheduledJobs() {
    return plannerJobsCache.filter(job => {
        if (job?.scheduled_date) return false;
        if (plannerMonthFilters.status !== 'all' && String(job.status || 'Unassigned') !== plannerMonthFilters.status) return false;
        if (plannerMonthFilters.techId && plannerMonthFilters.techId !== 'all' && !getPlannerAssignedTechIds(job).includes(String(plannerMonthFilters.techId))) return false;
        if (plannerMonthFilters.search && !getPlannerSearchTarget(job).includes(plannerMonthFilters.search.toLowerCase())) return false;
        return true;
    });
}

function getPlannerDayJobs(dateKey, jobs) {
    return jobs
        .filter(job => job.scheduled_date === dateKey)
        .sort((left, right) => getPlannerJobSortTime(left) - getPlannerJobSortTime(right));
}

function getPlannerJobSortTime(job) {
    const candidates = [job.started_at, job.scheduled_at, job.install_date, job.created_at];
    for (const value of candidates) {
        if (!value) continue;
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed.getTime();
    }
    return Number.POSITIVE_INFINITY;
}

function getPlannerStatusClass(status) {
    return String(status || 'Unassigned').trim().toLowerCase().replace(/\s+/g, '-');
}

function openPlannerJob(jobId) {
    if (!jobId) return;
    if (typeof openJobEditModal === 'function') {
        openJobEditModal(jobId);
    }
}

function getPlannerSummary(range, monthJobs) {
    const profile = getPlannerCurrentProfile();
    const selectedTech = getPlannerSelectedTechProfile();
    const isCurrentTech = profile?.role === 'technician' && selectedTech && String(selectedTech.id) === String(profile.id);
    const uniqueDayKeys = [...new Set(monthJobs.map(job => job.scheduled_date).filter(Boolean))];
    const totalHours = monthJobs.reduce((sum, job) => sum + (Number(job.estimated_duration_hours) || 0), 0);
    const dayCounts = uniqueDayKeys.map(dateKey => ({
        dateKey,
        count: monthJobs.filter(job => job.scheduled_date === dateKey).length
    })).sort((left, right) => right.count - left.count);
    const busiestDay = dayCounts[0] || null;

    return {
        title: selectedTech
            ? (isCurrentTech ? 'Your Month Planner' : `${selectedTech.username}'s Month Planner`)
            : 'Operations Month Planner',
        description: selectedTech
            ? 'A focused month calendar with workload, route context, and quick drill-down into every scheduled day for the selected planner owner.'
            : 'A full operations month view across the team with workload, site detail, and quick drill-down into scheduled days.',
        jobCount: monthJobs.length,
        hoursLabel: formatPlannerHourCompact(totalHours),
        activeDays: uniqueDayKeys.length,
        busiestDayLabel: busiestDay ? `${formatPlannerDateValue(busiestDay.dateKey).replace(/\s\d{4}$/, '')} • ${busiestDay.count}` : '-',
        monthLabel: range.label
    };
}

function ensurePlannerSelectedDate(range, monthJobs) {
    const todayKey = toDateKey(new Date());
    const inMonthSelected = plannerMonthFilters.selectedDateKey
        && plannerMonthFilters.selectedDateKey >= range.monthStartKey
        && plannerMonthFilters.selectedDateKey <= range.monthEndKey;

    if (inMonthSelected) return;

    if (todayKey >= range.monthStartKey && todayKey <= range.monthEndKey) {
        plannerMonthFilters.selectedDateKey = todayKey;
        return;
    }

    plannerMonthFilters.selectedDateKey = monthJobs[0]?.scheduled_date || range.monthStartKey;
}

function renderPlannerMonthGrid(range, monthJobs) {
    const container = document.getElementById('planner-container');
    if (!container) return;

    const todayKey = toDateKey(new Date());
    const visibleDays = getPlannerVisibleDays(range);

    container.innerHTML = visibleDays.map(date => {
        const dateKey = toDateKey(date);
        const dayJobs = getPlannerDayJobs(dateKey, monthJobs);
        const hours = dayJobs.reduce((sum, job) => sum + (Number(job.estimated_duration_hours) || 0), 0);
        const previewJobs = dayJobs.slice(0, 3);
        const moreCount = Math.max(0, dayJobs.length - previewJobs.length);
        const cellClasses = [
            'planner-month-cell',
            date.getMonth() !== range.monthStart.getMonth() ? 'is-outside' : '',
            dateKey === todayKey ? 'is-today' : '',
            dateKey === plannerMonthFilters.selectedDateKey ? 'is-selected' : '',
            dayJobs.length ? 'is-busy' : ''
        ].filter(Boolean).join(' ');

        return `
            <div class="${cellClasses}" data-planner-date="${dateKey}">
                <div class="planner-month-cell-head">
                    <div>
                        <div class="planner-month-day-number">${date.getDate()}</div>
                        <div class="planner-month-day-label">${escapePlannerHtml(formatPlannerShortDay(date))}</div>
                    </div>
                    <div class="planner-month-load">${dayJobs.length ? `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'} • ${formatPlannerHourCompact(hours)}` : 'Open'}</div>
                </div>
                <div class="planner-month-jobs">
                    ${previewJobs.map(job => `
                        <button type="button" class="planner-month-job" data-planner-job-id="${job.id}">
                            <div class="planner-month-job-top">
                                <span class="planner-month-job-time">${escapePlannerHtml(formatPlannerTimestamp(job))}</span>
                                <span class="planner-month-job-status ${getPlannerStatusClass(job.status)}">${escapePlannerHtml(job.status || 'Unassigned')}</span>
                            </div>
                            <div class="planner-month-job-title">${escapePlannerHtml(job.title || 'Untitled Job')}</div>
                            <div class="planner-month-job-meta">${escapePlannerHtml(job.siteDisplayName || job.sites?.name || 'No site')} • ${escapePlannerHtml(formatPlannerDuration(job.estimated_duration_hours || 0))}</div>
                        </button>
                    `).join('')}
                    ${moreCount ? `<div class="planner-month-more">+${moreCount} more scheduled</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderPlannerDayAgenda(monthJobs) {
    const titleEl = document.getElementById('planner-day-panel-title');
    const chipEl = document.getElementById('planner-day-panel-chip');
    const summaryEl = document.getElementById('planner-day-summary');
    const agendaEl = document.getElementById('planner-day-agenda');
    if (!agendaEl) return;

    if (!plannerMonthFilters.selectedDateKey) {
        agendaEl.innerHTML = '<div class="planner-agenda-empty">Pick a day to see the full schedule.</div>';
        return;
    }

    const selectedDate = new Date(`${plannerMonthFilters.selectedDateKey}T00:00:00`);
    const dayJobs = getPlannerDayJobs(plannerMonthFilters.selectedDateKey, monthJobs);
    const dayHours = dayJobs.reduce((sum, job) => sum + (Number(job.estimated_duration_hours) || 0), 0);

    if (titleEl) titleEl.textContent = formatPlannerDayLabel(selectedDate);
    if (chipEl) chipEl.textContent = `${dayJobs.length} job${dayJobs.length === 1 ? '' : 's'}`;
    if (summaryEl) {
        summaryEl.textContent = dayJobs.length
            ? `${dayJobs.length} scheduled job${dayJobs.length === 1 ? '' : 's'} totalling ${formatPlannerHourCompact(dayHours)} for this day.`
            : 'Nothing is scheduled for this day yet. It is open for planning.';
    }

    if (!dayJobs.length) {
        agendaEl.innerHTML = '<div class="planner-agenda-empty">No scheduled work for this day.</div>';
        return;
    }

    agendaEl.innerHTML = dayJobs.map(job => {
        const assignedNames = getPlannerAssignedNames(job);
        const clientName = job.clients?.company_name || job.clients?.client_name || job.displayName || 'Unknown Client';
        const siteName = job.sites?.name || job.siteDisplayName || 'No Site';
        const statusClass = typeof getJobStatusBadgeClass === 'function' ? getJobStatusBadgeClass(job.status || 'Unassigned') : 'badge-blue';
        return `
            <div class="planner-agenda-item">
                <div class="planner-agenda-item-top">
                    <div class="planner-agenda-item-title">${escapePlannerHtml(job.title || 'Untitled Job')}</div>
                    <span class="badge ${statusClass}">${escapePlannerHtml(job.status || 'Unassigned')}</span>
                </div>
                <div class="planner-agenda-item-meta">
                    <div><strong>Time:</strong> ${escapePlannerHtml(formatPlannerTimestamp(job))} • ${escapePlannerHtml(formatPlannerDuration(job.estimated_duration_hours || 0))}</div>
                    <div><strong>Client:</strong> ${escapePlannerHtml(clientName)}</div>
                    <div><strong>Site:</strong> ${escapePlannerHtml(siteName)}</div>
                    <div><strong>Technician:</strong> ${escapePlannerHtml(assignedNames.length ? assignedNames.join(', ') : 'Unassigned')}</div>
                    <div><strong>Protocol:</strong> ${escapePlannerHtml(job.protocol_number || '-')}</div>
                </div>
                <div class="planner-agenda-item-actions">
                    <button type="button" class="btn btn-small" data-planner-job-id="${job.id}">Open Job</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderPlannerUnscheduledJobs(unscheduledJobs) {
    const countEl = document.getElementById('planner-unscheduled-count');
    const listEl = document.getElementById('planner-unscheduled-list');
    if (!listEl) return;

    if (countEl) countEl.textContent = `${unscheduledJobs.length} job${unscheduledJobs.length === 1 ? '' : 's'}`;

    if (!unscheduledJobs.length) {
        listEl.innerHTML = '<div class="planner-agenda-empty">No unscheduled jobs for this planner view.</div>';
        return;
    }

    listEl.innerHTML = unscheduledJobs.slice(0, 8).map(job => {
        const assignedNames = getPlannerAssignedNames(job);
        const clientName = job.clients?.company_name || job.clients?.client_name || job.displayName || 'Unknown Client';
        return `
            <div class="planner-unscheduled-item">
                <div class="planner-unscheduled-item-top">
                    <div class="planner-unscheduled-item-title">${escapePlannerHtml(job.title || 'Untitled Job')}</div>
                    <button type="button" class="btn btn-small" data-planner-job-id="${job.id}">Open</button>
                </div>
                <div class="planner-unscheduled-item-meta">
                    <div>${escapePlannerHtml(job.job_type || 'General Work')} • ${escapePlannerHtml(job.protocol_number || 'No protocol')}</div>
                    <div>${escapePlannerHtml(clientName)} • ${escapePlannerHtml(job.siteDisplayName || 'No site')}</div>
                    <div>${escapePlannerHtml(assignedNames.length ? assignedNames.join(', ') : 'Unassigned')}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPlannerMonthWorkspace() {
    const range = getPlannerMonthRange(currentPlannerDate);
    const monthJobs = filterPlannerJobsForCurrentMonth(range);
    const unscheduledJobs = filterPlannerUnscheduledJobs();
    const summary = getPlannerSummary(range, monthJobs);

    ensurePlannerSelectedDate(range, monthJobs);
    setPlannerMonthOverview(summary);
    const weekRangeEl = document.getElementById('planner-week-range');
    if (weekRangeEl) weekRangeEl.textContent = summary.monthLabel;

    renderPlannerMonthGrid(range, monthJobs);
    renderPlannerDayAgenda(monthJobs);
    renderPlannerUnscheduledJobs(unscheduledJobs);
}

async function loadPlannerData() {
    console.log('Loading Planner Data for month of:', currentPlannerDate);
    bindPlannerControls();
    const container = document.getElementById('planner-container');

    try {
        const { data: techs, error: techsError } = await window.supabaseClient
            .from('users')
            .select('id, username')
            .eq('role', 'technician')
            .order('username');

        if (techsError) throw techsError;

        if (typeof fetchJobsDataset !== 'function') {
            throw new Error('Jobs dataset helper is not available.');
        }

        const jobs = await fetchJobsDataset();
        plannerTechsCache = techs || [];
        plannerJobsCache = (jobs || []).map(job => ({
            ...job,
            job_assignments: Array.isArray(job.job_assignments) ? job.job_assignments : []
        }));

        populatePlannerOwnerFilter(plannerTechsCache);
        syncPlannerFilterInputs();
        renderPlannerMonthWorkspace();
    } catch (err) {
        console.error('Planner Error:', err);
        if (container) {
            container.innerHTML = `<div style="padding: 24px; color: var(--accent-red); grid-column: 1 / -1;">Error loading planner: ${escapePlannerHtml(err.message)}</div>`;
        }
    }
}

async function renderReportsTable(targetBodyId = 'reports-table-body', statsIds = {}) {
    const tbody = document.getElementById(targetBodyId);
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">Loading reports...</td></tr>';

    if (typeof fetchJobsDataset !== 'function') {
        throw new Error('Jobs dataset helper is not available.');
    }

    const jobs = await fetchJobsDataset();
    const sortedJobs = [...(jobs || [])].sort((left, right) => {
        const leftTime = left.scheduled_date ? new Date(left.scheduled_date).getTime() : Number.POSITIVE_INFINITY;
        const rightTime = right.scheduled_date ? new Date(right.scheduled_date).getTime() : Number.POSITIVE_INFINITY;
        if (leftTime !== rightTime) return leftTime - rightTime;
        return new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime();
    });

    const completedCount = sortedJobs.filter(job => job.status === 'Completed').length;
    setSummaryPairStats('Report Rows', sortedJobs.length, 'Completed Jobs', completedCount, statsIds);

    if (!sortedJobs.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-secondary);">No jobs found for reports yet.</td></tr>';
        return;
    }

    tbody.innerHTML = sortedJobs.map(job => {
        const clientName = job.clients?.company_name || job.clients?.client_name || 'Unknown Client';
        const siteName = job.sites?.name || 'No Site';
        const assignedTo = job.assignedTechNames?.length ? job.assignedTechNames.join(', ') : (job.technicianDisplayName || 'Unassigned');
        const statusClass = typeof getJobStatusBadgeClass === 'function' ? getJobStatusBadgeClass(job.status || 'Unassigned') : 'badge-blue';

        return `
            <tr>
                <td>${escapePlannerHtml(formatPlannerDateValue(job.scheduled_date))}</td>
                <td>${escapePlannerHtml(job.title || '-')}</td>
                <td>${escapePlannerHtml(job.job_type || 'General Work')}</td>
                <td>${escapePlannerHtml(clientName)}</td>
                <td>${escapePlannerHtml(siteName)}</td>
                <td>${escapePlannerHtml(assignedTo)}</td>
                <td><span class="badge ${statusClass}">${escapePlannerHtml(job.status || 'Unassigned')}</span></td>
                <td>${escapePlannerHtml(job.protocol_number || '-')}</td>
                <td>${escapePlannerHtml(formatPlannerDuration(job.estimated_duration_hours || 0))}</td>
            </tr>
        `;
    }).join('');
}

function getPlannerReminderBadgeClass(reminder) {
    if (!reminder || reminder.label === '-') return 'badge-blue';
    if (reminder.expired) return 'badge-red';
    if (reminder.dueSoon) return 'badge-orange';
    return 'badge-green';
}

async function renderCalibrationCertificatesTable(targetBodyId = 'certification-table-body', statsIds = {}) {
    const tbody = document.getElementById(targetBodyId);
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">Loading calibration certificates...</td></tr>';

    const { data: assets, error } = await window.supabaseClient
        .from('inventory')
        .select('id, name, serial_number, category, calibration_cert, calibration_cert_number, calibration_date, re_calibration_date, status, condition_status')
        .order('created_at', { ascending: false });

    if (error) throw error;

    const certificateRows = (assets || [])
        .filter(asset => asset.calibration_cert || asset.calibration_cert_number || asset.calibration_date || asset.re_calibration_date)
        .map(asset => ({
            ...asset,
            reminder: typeof getCalibrationReminder === 'function'
                ? getCalibrationReminder(asset)
                : { label: '-', dueSoon: false, expired: false, sortDays: null }
        }))
        .sort((left, right) => {
            const leftRank = left.reminder?.expired ? 0 : left.reminder?.dueSoon ? 1 : 2;
            const rightRank = right.reminder?.expired ? 0 : right.reminder?.dueSoon ? 1 : 2;
            if (leftRank !== rightRank) return leftRank - rightRank;
            const leftDays = Number.isFinite(left.reminder?.sortDays) ? left.reminder.sortDays : Number.POSITIVE_INFINITY;
            const rightDays = Number.isFinite(right.reminder?.sortDays) ? right.reminder.sortDays : Number.POSITIVE_INFINITY;
            return leftDays - rightDays;
        });

    const dueSoonCount = certificateRows.filter(asset => asset.reminder?.dueSoon && !asset.reminder?.expired).length;
    const expiredCount = certificateRows.filter(asset => asset.reminder?.expired).length;
    setSummaryPairStats('Certificates', certificateRows.length, 'Due Soon / Expired', `${dueSoonCount} / ${expiredCount}`, statsIds);

    if (!certificateRows.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No calibration certificates found yet.</td></tr>';
        return;
    }

    tbody.innerHTML = certificateRows.map(asset => {
        const category = typeof inferInventoryCategory === 'function'
            ? (inferInventoryCategory(asset) || asset.category || 'Other')
            : (asset.category || 'Other');
        const certificate = asset.calibration_cert || asset.calibration_cert_number || '-';
        const reminderClass = getPlannerReminderBadgeClass(asset.reminder);

        return `
            <tr>
                <td>${escapePlannerHtml(asset.name || '-')}</td>
                <td>${escapePlannerHtml(asset.serial_number || '-')}</td>
                <td>${escapePlannerHtml(category)}</td>
                <td>${escapePlannerHtml(certificate)}</td>
                <td>${escapePlannerHtml(formatPlannerDateValue(asset.calibration_date))}</td>
                <td>${escapePlannerHtml(formatPlannerDateValue(asset.re_calibration_date))}</td>
                <td><span class="badge ${reminderClass}">${escapePlannerHtml(asset.reminder?.label || '-')}</span></td>
            </tr>
        `;
    }).join('');
}

function setPlannerView(view) {
    loadPlannerData();
}

function setPlannerWeekFilter(value) {
    loadPlannerData();
}

function prevPlannerPeriod() {
    currentPlannerDate = new Date(currentPlannerDate.getFullYear(), currentPlannerDate.getMonth() - 1, 1);
    plannerMonthFilters.selectedDateKey = '';
    loadPlannerData();
}

function nextPlannerPeriod() {
    currentPlannerDate = new Date(currentPlannerDate.getFullYear(), currentPlannerDate.getMonth() + 1, 1);
    plannerMonthFilters.selectedDateKey = '';
    loadPlannerData();
}

function jumpPlannerToToday() {
    currentPlannerDate = new Date();
    plannerMonthFilters.selectedDateKey = toDateKey(new Date());
    loadPlannerData();
}

function prevWeek() {
    prevPlannerPeriod();
}

function nextWeek() {
    nextPlannerPeriod();
}

function getWeekDateRange(date) {
    return getPlannerMonthRange(date);
}

function getMonthDateRange(date) {
    return getPlannerMonthRange(date);
}

function toDateKey(date) {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatDateShort(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function loadReportsView() {
    await renderReportsTable('reports-table-body', {
        primaryCountId: 'reports-count',
        secondaryCountId: 'reports-completed-count'
    });
}

async function loadCalibrationCertificatesView() {
    await renderCalibrationCertificatesTable('certification-table-body', {
        primaryCountId: 'certification-count',
        secondaryCountId: 'certification-alert-count'
    });
}

window.setPlannerView = setPlannerView;
window.setPlannerWeekFilter = setPlannerWeekFilter;
window.prevPlannerPeriod = prevPlannerPeriod;
window.nextPlannerPeriod = nextPlannerPeriod;
window.jumpPlannerToToday = jumpPlannerToToday;
window.loadReportsView = loadReportsView;
window.loadCalibrationCertificatesView = loadCalibrationCertificatesView;

