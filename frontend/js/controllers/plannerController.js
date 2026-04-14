let currentPlannerDate = new Date();

function formatPlannerDuration(totalHours) {
    if (typeof formatDurationDisplay === 'function') {
        return formatDurationDisplay(totalHours);
    }

    const normalized = Math.max(0, Number(totalHours) || 0);
    const days = Math.floor(normalized / 24);
    const hours = Number((normalized - (days * 24)).toFixed(1));
    return `${days}d ${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatPlannerTimestamp(job) {
    const candidates = [job.started_at, job.scheduled_at, job.install_date, job.created_at];
    for (const value of candidates) {
        if (!value) continue;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) continue;

        // Date-only values represent all-day planned work.
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return 'All day';
        }

        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return 'All day';
}

async function loadPlannerData() {
    console.log("Loading Planner Data for week of:", currentPlannerDate);
    const container = document.getElementById('planner-container');
    const weekRangeEl = document.getElementById('planner-week-range');
    const scheduledCountEl = document.getElementById('planner-scheduled-count');
    const techCountEl = document.getElementById('planner-tech-count');

    try {
        // 1. Fetch Technicians
        const { data: techs, error: techsError } = await window.supabaseClient
            .from('users')
            .select('id, username')
            .eq('role', 'technician');
        
        if (techsError) throw techsError;

        const dateRange = getWeekDateRange(currentPlannerDate);

        weekRangeEl.innerText = dateRange.label;
        updatePlannerOverviewCopy();

        if (typeof fetchJobsDataset !== 'function') {
            throw new Error('Jobs dataset helper is not available.');
        }

        const jobs = await fetchJobsDataset();

        const safeJobs = (jobs || []).filter(job => {
            if (job.status === 'Completed') return false;
            if (!job.scheduled_date) return false;
            return job.scheduled_date >= dateRange.startKey
                && job.scheduled_date <= dateRange.endKey;
        }).map(job => ({
            ...job,
            job_assignments: Array.isArray(job.job_assignments) ? job.job_assignments : []
        }));

        if (scheduledCountEl) scheduledCountEl.innerText = safeJobs.length;
        if (techCountEl) techCountEl.innerText = (techs || []).filter(tech => safeJobs.some(job => job.job_assignments.some(a => a.tech_id === tech.id))).length;

        renderPlannerGrid(container, techs || [], safeJobs, dateRange.start);

    } catch (err) {
        console.error("Planner Error:", err);
        container.innerHTML = `<div style="padding: 24px; color: var(--accent-red);">Error loading planner: ${err.message}</div>`;
    }
}

function updatePlannerOverviewCopy() {
    const title = document.getElementById('planner-overview-title');
    const description = document.getElementById('planner-overview-description');

    if (title) {
        title.textContent = 'Technician Week Planner';
    }

    if (description) {
        description.textContent = 'Scheduled field work is grouped by technician and day with timestamps so the team can review the week at a glance.';
    }
}

function renderPlannerGrid(container, techs, jobs, startOfWeek) {
    container.innerHTML = '';
    container.classList.remove('planner-month-grid');
    
    // Create Header Row
    const headerRow = document.createElement('div');
    headerRow.className = 'planner-row planner-header-row';
    headerRow.innerHTML = `<div class="planner-cell planner-tech-cell">Technician</div>`;
    
    for (let i = 0; i < 7; i++) {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        headerRow.innerHTML += `<div class="planner-cell" style="text-align: center;">
            <div style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-secondary);">${day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
            <div style="font-size: 1.1rem; font-weight: 700;">${day.getDate()}</div>
        </div>`;
    }
    container.appendChild(headerRow);

    // Create Row for each Technician
    techs.forEach(tech => {
        const row = document.createElement('div');
        row.className = 'planner-row';
        row.innerHTML = `<div class="planner-cell planner-tech-cell">
            <div style="width: 32px; height: 32px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;">${tech.username.substring(0,2).toUpperCase()}</div>
            ${tech.username}
        </div>`;

        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(startOfWeek);
            currentDay.setDate(startOfWeek.getDate() + i);
            const dateStr = currentDay.toISOString().split('T')[0];

            const cell = document.createElement('div');
            cell.className = 'planner-cell';
            
            // Filter jobs for this tech on this day
            const dayJobs = jobs.filter(j => 
                Array.isArray(j.job_assignments) &&
                j.job_assignments.some(a => a.tech_id === tech.id) && 
                j.scheduled_date === dateStr
            );

            dayJobs.forEach(job => {
                const card = document.createElement('div');
                card.className = `planner-job-card ${job.job_type ? job.job_type.toLowerCase() : 'installation'}`;
                const clientDisplayName = job.clients?.company_name || job.clients?.client_name || 'Individual Client';
                card.innerHTML = `
                    <div class="planner-card-header">
                        <span class="job-id-mini">${job.id}</span>
                        <span class="status-dot ${job.status.replace(' ', '-').toLowerCase()}"></span>
                    </div>
                    <h5>${job.title}</h5>
                    <div class="planner-info">
                        <i class="fas fa-building"></i> ${clientDisplayName}
                    </div>
                    <div class="planner-info">
                        <i class="fas fa-map-marker-alt"></i> ${job.sites?.name || 'No Site Specified'}
                    </div>
                    <div class="planner-info">
                        <i class="fas fa-user"></i> ${job.job_assignments[0]?.users?.username || 'Unassigned'}
                    </div>
                    <div class="planner-info">
                        <i class="fas fa-calendar-alt"></i> ${formatPlannerTimestamp(job)}
                    </div>
                    <div class="planner-footer">
                        <span class="job-type-badge">${job.job_type || 'Installation'}</span>
                        <span class="duration-pill"><i class="fas fa-clock"></i> ${formatPlannerDuration(job.estimated_duration_hours)}</span>
                    </div>
                `;
                cell.appendChild(card);
            });

            if (dayJobs.length === 0) {
                cell.innerHTML = '<div class="planner-empty-slot">No scheduled work</div>';
            }

            row.appendChild(cell);
        }
        container.appendChild(row);
    });
}

function setPlannerView(view) {
    loadPlannerData();
}

function setPlannerWeekFilter(value) {
    loadPlannerData();
}

function prevPlannerPeriod() {
    currentPlannerDate.setDate(currentPlannerDate.getDate() - 7);
    loadPlannerData();
}

function nextPlannerPeriod() {
    currentPlannerDate.setDate(currentPlannerDate.getDate() + 7);
    loadPlannerData();
}

function prevWeek() {
    prevPlannerPeriod();
}

function nextWeek() {
    nextPlannerPeriod();
}

function getWeekDateRange(date) {
    const start = getStartOfWeek(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
        start,
        end,
        startKey: toDateKey(start),
        endKey: toDateKey(end),
        label: `${formatDateShort(start)} - ${formatDateShort(end)}`
    };
}

function getMonthDateRange(date) {
    return getWeekDateRange(date);
}

function toDateKey(date) {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
}

// Date helpers
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    d.setDate(diff);
    d.setHours(0,0,0,0);
    return d;
}

function formatDateShort(date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

window.setPlannerView = setPlannerView;
window.setPlannerWeekFilter = setPlannerWeekFilter;
window.prevPlannerPeriod = prevPlannerPeriod;
window.nextPlannerPeriod = nextPlannerPeriod;
