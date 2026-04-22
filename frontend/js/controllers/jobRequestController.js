/**
 * jobRequestController.js
 * Handles technician job requests, manager approvals, and request history.
 */

let pendingRequestsCache = [];
let historicalRequestsCache = [];
let jobRequestInboxPollHandle = null;
let jobRequestRealtimeChannel = null;
let jobRequestRealtimeRefreshHandle = null;
let activeJobRequestTab = 'active';
let jobRequestSystemError = '';

function canViewJobRequestInbox(profile) {
    if (!profile) return false;

    const normalizedRole = String(profile.role || '').toLowerCase();
    return Boolean(
        profile.is_superadmin ||
        normalizedRole === 'manager' ||
        normalizedRole === 'admin' ||
        normalizedRole === 'superadmin'
    );
}

function formatRequestDate(value, withTime = false) {
    if (!value) return withTime ? 'Not recorded' : 'Unscheduled';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return withTime ? 'Not recorded' : 'Unscheduled';

    return date.toLocaleString([], withTime
        ? { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
        : { year: 'numeric', month: 'short', day: 'numeric' });
}

function getRequestStatusLabel(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'Approved';
    if (normalized === 'rejected') return 'Rejected';
    if (normalized === 'retracted') return 'Retracted';
    if (normalized === 'superseded') return 'Closed';
    return 'Pending';
}

function getRequestStatusClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return 'badge-green';
    if (normalized === 'rejected') return 'badge-red';
    if (normalized === 'retracted') return 'badge-gray';
    if (normalized === 'superseded') return 'badge-orange';
    return 'badge-blue';
}

function scheduleJobRequestInboxRefresh(delayMs = 250) {
    if (jobRequestRealtimeRefreshHandle) {
        window.clearTimeout(jobRequestRealtimeRefreshHandle);
    }

    jobRequestRealtimeRefreshHandle = window.setTimeout(() => {
        jobRequestRealtimeRefreshHandle = null;
        refreshJobRequestInbox();
    }, delayMs);
}

function stopJobRequestRealtimeSync() {
    if (jobRequestRealtimeRefreshHandle) {
        window.clearTimeout(jobRequestRealtimeRefreshHandle);
        jobRequestRealtimeRefreshHandle = null;
    }

    if (jobRequestRealtimeChannel && window.supabaseClient?.removeChannel) {
        window.supabaseClient.removeChannel(jobRequestRealtimeChannel);
    }
    jobRequestRealtimeChannel = null;
}

function startJobRequestRealtimeSync() {
    if (!window.supabaseClient?.channel) return;

    stopJobRequestRealtimeSync();

    jobRequestRealtimeChannel = window.supabaseClient
        .channel('job-request-mailbox')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'job_assignment_requests' },
            () => scheduleJobRequestInboxRefresh()
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'jobs' },
            payload => {
                const oldNotes = String(payload.old?.notes || '');
                const newNotes = String(payload.new?.notes || '');
                const oldTech = String(payload.old?.technician_name || '');
                const newTech = String(payload.new?.technician_name || '');
                const oldStatus = String(payload.old?.status || '');
                const newStatus = String(payload.new?.status || '');

                if (
                    oldNotes !== newNotes ||
                    oldTech !== newTech ||
                    oldStatus !== newStatus
                ) {
                    scheduleJobRequestInboxRefresh();
                }
            }
        )
        .subscribe((status, err) => {
            if (err) console.warn('Job request realtime subscription error:', err.message || err);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.warn('Job request realtime sync is unavailable, mailbox will continue polling.');
            }
        });
}

function enrichRequestRecord(req) {
    const job = req.jobs || {};
    const tech = req.tech || req.users || {};
    const manager = req.manager || {};
    const siteName = job.site_name || 'Unknown site';
    const protocol = job.protocol_number || 'No protocol';
    const jobCard = Array.isArray(job.job_card_numbers)
        ? (job.job_card_numbers.length ? job.job_card_numbers.join(', ') : 'No job card')
        : (job.job_card_number || job.job_card_numbers || 'No job card');
    const requestedAtDisplay = formatRequestDate(req.created_at, true);
    const scheduledDateDisplay = formatRequestDate(job.scheduled_date, false);

    return {
        ...req,
        jobs: job,
        users: tech,
        tech,
        manager,
        siteName,
        protocol,
        jobCard,
        requestedAtDisplay,
        scheduledDateDisplay
    };
}

async function pruneOldJobRequestHistory() {
    try {
        await window.supabaseClient
            .from('job_assignment_requests')
            .delete()
            .in('status', ['approved', 'rejected', 'retracted', 'superseded'])
            .lt('updated_at', new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString());
    } catch (err) {
        console.warn('Could not prune old job request history:', err.message);
    }
}

async function initializeJobRequestInbox() {
    const requestSection = document.getElementById('jobRequestsSection');
    const requestBell = document.getElementById('requestBellContainer');
    if (!requestSection) return;

    try {
        const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);

        if (!canViewJobRequestInbox(profile)) {
            requestSection.style.display = 'none';
            if (requestBell) requestBell.style.display = 'none';
            stopJobRequestRealtimeSync();
            if (jobRequestInboxPollHandle) {
                clearInterval(jobRequestInboxPollHandle);
                jobRequestInboxPollHandle = null;
            }
            pendingRequestsCache = [];
            historicalRequestsCache = [];
            updateInboxBadge(0);
            return;
        }

        requestSection.style.display = 'block';
        if (requestBell) requestBell.style.display = 'block';
        startJobRequestRealtimeSync();
        await refreshJobRequestInbox();

        if (jobRequestInboxPollHandle) clearInterval(jobRequestInboxPollHandle);
        jobRequestInboxPollHandle = setInterval(refreshJobRequestInbox, 60000);
    } catch (err) {
        jobRequestSystemError = String(err?.message || 'Could not initialize the request section.');
        requestSection.style.display = 'block';
        if (requestBell) requestBell.style.display = 'block';
        updateInboxBadge(0);
        console.error('Initialize inbox error:', err);
    }
}

async function syncJobRequestInboxAccess(profile = null) {
    const requestSection = document.getElementById('jobRequestsSection');
    const requestBell = document.getElementById('requestBellContainer');
    if (!requestSection) return;

    const resolvedProfile = profile
        || (typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null));

    if (canViewJobRequestInbox(resolvedProfile)) {
        await initializeJobRequestInbox();
        return;
    }

    stopJobRequestRealtimeSync();
    if (jobRequestInboxPollHandle) {
        clearInterval(jobRequestInboxPollHandle);
        jobRequestInboxPollHandle = null;
    }
    pendingRequestsCache = [];
    historicalRequestsCache = [];
    requestSection.style.display = 'none';
    if (requestBell) requestBell.style.display = 'none';
    updateInboxBadge(0);
}

async function refreshJobRequestInbox() {
    const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
        ? await ensureCurrentUserDatabaseProfile()
        : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
    if (!canViewJobRequestInbox(profile)) return;

    try {
        jobRequestSystemError = '';
        if (typeof fetchJobRequestEntries !== 'function') {
            throw new Error('Job request helpers are unavailable. Refresh the page to load the latest scripts.');
        }

        await pruneOldJobRequestHistory();
        const { pending, history } = await fetchJobRequestEntries({ historyLimit: 5 });
        pendingRequestsCache = (pending || []).map(enrichRequestRecord);
        historicalRequestsCache = (history || []).map(enrichRequestRecord);

        updateInboxBadge(pendingRequestsCache.length);

        renderJobRequestsList();
    } catch (err) {
        jobRequestSystemError = String(err?.message || 'Could not load job requests.');
        pendingRequestsCache = [];
        historicalRequestsCache = [];
        updateInboxBadge(0);
        renderJobRequestsList();
        console.error('Refresh inbox error:', err);
    }
}

function updateInboxBadge(count) {
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;

    const normalizedCount = Math.max(0, Number(count) || 0);
    badge.innerText = normalizedCount > 99 ? '99+' : String(normalizedCount);
    badge.style.display = normalizedCount > 0 ? 'flex' : 'none';
}

function setJobRequestTab(tabName) {
    activeJobRequestTab = tabName === 'history' ? 'history' : 'active';

    document.querySelectorAll('[data-job-request-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.jobRequestTab === activeJobRequestTab);
    });

    renderJobRequestsList();
}

function openJobRequestsModal() {
    const section = document.getElementById('jobRequestsSection');
    setJobRequestTab('active');
    renderJobRequestsList();
    refreshJobRequestInbox();
    if (typeof navigateToView === 'function') navigateToView('jobs');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeJobRequestsModal() {
    // Mailbox modal removed in favor of the in-page request section.
}

function handleJobRequestModalBackdropClick(event) {
    void event;
}

function renderEmptyRequestState(message, icon, accentColor) {
    return `
        <div class="job-request-empty-state">
            <i class="fas ${icon}" style="color: ${accentColor};"></i>
            <h3>${message.title}</h3>
            <p>${message.body}</p>
        </div>
    `;
}

function buildRequestCard(req, options = {}) {
    const {
        showActions = false,
        showHistoryMeta = false
    } = options;

    const job = req.jobs || {};
    const tech = req.tech || req.users || {};
    const manager = req.manager || {};
    const clientName = job.client_name || job.client?.client_name || 'Unknown client';
    const locationName = job.site_name || req.siteName || 'Unknown site';
    const assignedTech = job.technician_name || 'Unassigned';
    const historyMeta = manager.username
        ? `${getRequestStatusLabel(req.status)} by ${manager.username} on ${formatRequestDate(req.updated_at, true)}`
        : `${getRequestStatusLabel(req.status)} on ${formatRequestDate(req.updated_at, true)}`;

    const escapedTechUsername = String(tech.username || 'Technician').replace(/'/g, "\\'");

    return `
        <article class="job-request-card">
            <div class="job-request-card-top">
                <div>
                    <div class="job-request-card-title-row">
                        <h3>${job.title || 'Untitled Job'}</h3>
                        <span class="badge ${getRequestStatusClass(req.status)}">${getRequestStatusLabel(req.status)}</span>
                    </div>
                    <p class="job-request-card-subtitle">${job.job_type || 'General job'} | ${clientName}</p>
                </div>
                <div class="job-request-card-time">${req.requestedAtDisplay}</div>
            </div>

            <div class="job-request-grid">
                <div><strong>Technician</strong><span>${tech.username || 'Unknown technician'}</span></div>
                <div><strong>Site</strong><span>${locationName}</span></div>
                <div><strong>Scheduled Date</strong><span>${req.scheduledDateDisplay}</span></div>
                <div><strong>Protocol</strong><span>${req.protocol}</span></div>
                <div><strong>Job Card</strong><span>${req.jobCard}</span></div>
                <div><strong>Client</strong><span>${job.client_name || clientName}</span></div>
                <div><strong>Current Assignment</strong><span>${assignedTech}</span></div>
            </div>

            ${showHistoryMeta ? `<div class="job-request-history-meta">${historyMeta}</div>` : ''}

            ${showActions ? `
                <div class="job-request-actions">
                    <button class="btn btn-small btn-red btn-outline" onclick="rejectJobRequest('${req.id}')">
                        <i class="fas fa-times"></i> Reject
                    </button>
                    <button class="btn btn-small btn-blue" onclick="approveJobRequest('${req.id}', '${req.job_id}', '${req.tech_id}', '${escapedTechUsername}')">
                        <i class="fas fa-check"></i> Approve & Assign
                    </button>
                </div>
            ` : ''}
        </article>
    `;
}

function renderJobRequestsList() {
    const activeContainer = document.getElementById('job-requests-active-list');
    const historyContainer = document.getElementById('job-requests-history-list');
    const activeCount = document.getElementById('job-requests-active-count');
    const historyCount = document.getElementById('job-requests-history-count');

    if (!activeContainer || !historyContainer) return;

    if (activeCount) activeCount.textContent = String(pendingRequestsCache.length);
    if (historyCount) historyCount.textContent = String(historicalRequestsCache.length);

    activeContainer.style.display = activeJobRequestTab === 'active' ? 'block' : 'none';
    historyContainer.style.display = activeJobRequestTab === 'history' ? 'block' : 'none';

    if (jobRequestSystemError) {
        const errorMarkup = renderEmptyRequestState(
            {
                title: 'Request section unavailable',
                body: jobRequestSystemError
            },
            'fa-triangle-exclamation',
            '#dc2626'
        );
        activeContainer.innerHTML = errorMarkup;
        historyContainer.innerHTML = errorMarkup;
        return;
    }

    activeContainer.innerHTML = pendingRequestsCache.length
        ? pendingRequestsCache.map(req => buildRequestCard(req, { showActions: true })).join('')
        : renderEmptyRequestState(
            {
                title: 'No active requests',
                body: 'New technician job requests will appear here for approval.'
            },
            'fa-envelope-open-text',
            '#2563eb'
        );

    historyContainer.innerHTML = historicalRequestsCache.length
        ? historicalRequestsCache.map(req => buildRequestCard(req, { showHistoryMeta: true })).join('')
        : renderEmptyRequestState(
            {
                title: 'No recent history',
                body: 'Approved, rejected, retracted, and closed requests from the last 6 months will be kept here.'
            },
            'fa-folder-open',
            '#0f766e'
        );
}

async function approveJobRequest(requestId, jobId, techId, techUsername) {
    try {
        const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
        const requestRecord = [...pendingRequestsCache, ...historicalRequestsCache].find(request => String(request.id) === String(requestId));
        if (!requestRecord) throw new Error('The selected request could not be found.');
        if (String(requestRecord.status || '').toLowerCase() !== 'pending') {
            throw new Error('Only pending requests can be approved.');
        }

        const resolvedTechUsername = requestRecord.tech?.username || requestRecord.users?.username || requestRecord.tech_username || techUsername || 'Technician';
        const confirmApprove = window.confirm(`Approve request and assign this job to ${resolvedTechUsername}?`);
        if (!confirmApprove) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Approving request...');

        await window.supabaseClient.from('job_assignments').delete().eq('job_id', jobId);

        const { error: assignError } = await window.supabaseClient.from('job_assignments').insert([{
            job_id: jobId,
            tech_id: techId
        }]);
        if (assignError) throw assignError;

        const { error: jobError } = await window.supabaseClient
            .from('jobs')
            .update({
                status: 'Dispatched',
                technician_name: resolvedTechUsername
            })
            .eq('id', jobId);
        if (jobError) throw jobError;

        if (typeof updateJobRequestRecordStatus !== 'function') throw new Error('Request update helpers are unavailable.');
        await updateJobRequestRecordStatus(requestRecord, 'approved', profile);

        if (typeof showToast === 'function') showToast(`Job successfully assigned to ${resolvedTechUsername}.`, 'success');

        await refreshJobRequestInbox();
        if (typeof refreshJobRequestRelatedViews === 'function') {
            await refreshJobRequestRelatedViews(jobId);
        } else {
            if (typeof loadJobsData === 'function') await loadJobsData();
            if (typeof loadDashboardData === 'function') await loadDashboardData();
        }
    } catch (err) {
        console.error('Approve job request error:', err);
        if (typeof showToast === 'function') showToast('Failed to approve request: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function rejectJobRequest(requestId) {
    try {
        const profile = typeof ensureCurrentUserDatabaseProfile === 'function'
            ? await ensureCurrentUserDatabaseProfile()
            : (typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null);
        const requestRecord = [...pendingRequestsCache, ...historicalRequestsCache].find(request => String(request.id) === String(requestId));
        if (!requestRecord) throw new Error('The selected request could not be found.');
        if (String(requestRecord.status || '').toLowerCase() !== 'pending') {
            throw new Error('Only pending requests can be rejected.');
        }
        const confirmReject = window.confirm('Are you sure you want to reject this job request?');
        if (!confirmReject) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Rejecting request...');

        if (typeof updateJobRequestRecordStatus !== 'function') throw new Error('Request update helpers are unavailable.');
        await updateJobRequestRecordStatus(requestRecord, 'rejected', profile);

        if (typeof showToast === 'function') showToast('Job request rejected.', 'info');

        await refreshJobRequestInbox();
        if (typeof refreshJobRequestRelatedViews === 'function') {
            await refreshJobRequestRelatedViews(requestRecord.job_id);
        }
    } catch (err) {
        console.error('Reject job request error:', err);
        if (typeof showToast === 'function') showToast('Failed to reject: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.initializeJobRequestInbox = initializeJobRequestInbox;
window.syncJobRequestInboxAccess = syncJobRequestInboxAccess;
window.startJobRequestRealtimeSync = startJobRequestRealtimeSync;
window.stopJobRequestRealtimeSync = stopJobRequestRealtimeSync;
window.refreshJobRequestInbox = refreshJobRequestInbox;
window.openJobRequestsModal = openJobRequestsModal;
window.closeJobRequestsModal = closeJobRequestsModal;
window.setJobRequestTab = setJobRequestTab;
window.approveJobRequest = approveJobRequest;
window.rejectJobRequest = rejectJobRequest;
window.handleJobRequestModalBackdropClick = handleJobRequestModalBackdropClick;
