/**
 * jobRequestController.js
 * Handles the logic for technicians requesting jobs and managers approving them.
 */

let pendingRequestsCache = [];

async function initializeJobRequestInbox() {
    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    if (!profile) return;

    // Show inbox container only for managers and superadmins
    const inboxContainer = document.getElementById('inbox-container');
    if (!inboxContainer) return;

    if (profile.role === 'manager' || profile.role === 'superadmin' || profile.is_superadmin) {
        inboxContainer.style.display = 'block';
        await refreshJobRequestInbox();
        // Start polling every 60 seconds
        setInterval(refreshJobRequestInbox, 60000);
    } else {
        inboxContainer.style.display = 'none';
    }
}

async function refreshJobRequestInbox() {
    try {
        const { data: requests, error } = await window.supabaseClient
            .from('job_assignment_requests')
            .select(`
                *,
                jobs:job_id(id, title, scheduled_date, site:sites(name)),
                tech:tech_id(id, username)
            `)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        pendingRequestsCache = (requests || []).map(req => ({
            ...req,
            jobs: req.jobs || {}, // Ensure jobs object exists
            users: req.tech || {}  // Map tech to old 'users' key for compatibility
        }));

        updateInboxBadge(pendingRequestsCache.length);
    } catch (err) {
        console.error('Refresh inbox error:', err);
    }
}

function updateInboxBadge(count) {
    const badge = document.getElementById('inbox-badge');
    if (!badge) return;

    // Show 0 or the current count in the red badge
    badge.innerText = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
}

function openJobRequestsModal() {
    const modal = document.getElementById('jobRequestsModal');
    if (!modal) return;

    renderJobRequestsList();
    modal.style.display = 'flex';
}

function closeJobRequestsModal() {
    const modal = document.getElementById('jobRequestsModal');
    if (modal) modal.style.display = 'none';
}

function renderJobRequestsList() {
    const container = document.getElementById('job-requests-list');
    if (!container) return;

    if (pendingRequestsCache.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);"><i class="fas fa-check-circle" style="font-size: 2rem; display:block; margin-bottom: 15px; color: #10b981;"></i>No pending job requests. Your inbox is clear!</div>';
        return;
    }

    container.innerHTML = pendingRequestsCache.map(req => {
        const job = req.jobs || {};
        const tech = req.users || {};
        const siteName = job.site?.name || 'Unknown Site';
        const scheduledDate = job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : 'Unscheduled';

        return `
            <div class="job-request-item" style="padding: 20px; border-bottom: 1px solid var(--border-color); background: #fff; transition: background 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${job.title || 'Untitled Job'}</span>
                            <span class="badge" style="background: var(--bg-color); color: var(--text-secondary); font-size: 0.75rem;">Site: ${siteName}</span>
                        </div>
                        <div style="font-size: 0.9rem; color: var(--text-secondary); display: flex; align-items: center; gap: 12px;">
                            <span><i class="fas fa-user-clock" style="color: #3b82f6; margin-right: 4px;"></i><strong>${tech.username || 'System'}</strong> requested assignment</span>
                            <span><i class="fas fa-calendar-alt" style="margin-right: 4px;"></i>Date: ${scheduledDate}</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px dashed var(--border-color); padding-top: 12px; margin-top: 8px;">
                    <button class="btn btn-small btn-red btn-outline" onclick="rejectJobRequest('${req.id}')" style="min-width: 80px;">
                        <i class="fas fa-times"></i> Reject
                    </button>
                    <button class="btn btn-small btn-green" onclick="approveJobRequest('${req.id}', '${req.job_id}', '${req.tech_id}', '${req.users?.username}')" style="min-width: 100px;">
                        <i class="fas fa-check"></i> Assign Now
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function approveJobRequest(requestId, jobId, techId, techUsername) {
    try {
        const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
        const confirmApprove = window.confirm(`Approve request and assign this job to ${techUsername}?`);
        if (!confirmApprove) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Approving request...');

        // 1. Update Job Assignment
        // First delete existing (if any)
        await window.supabaseClient.from('job_assignments').delete().eq('job_id', jobId);
        
        // Insert new assignment
        const { error: assignError } = await window.supabaseClient.from('job_assignments').insert([{
            job_id: jobId,
            tech_id: techId
        }]);
        if (assignError) throw assignError;

        // 2. Update Job Status and Technician Name
        const { error: jobError } = await window.supabaseClient
            .from('jobs')
            .update({
                status: 'Dispatched',
                technician_name: techUsername
            })
            .eq('id', jobId);
        if (jobError) throw jobError;

        // 3. Mark request as approved
        const { error: reqError } = await window.supabaseClient
            .from('job_assignment_requests')
            .update({
                status: 'approved',
                manager_id: profile?.id || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);
        if (reqError) throw reqError;

        if (typeof showToast === 'function') showToast(`Job successfully assigned to ${techUsername}.`, 'success');
        
        await refreshJobRequestInbox();
        renderJobRequestsList();

        if (typeof loadJobsData === 'function') loadJobsData();
        if (typeof loadDashboardData === 'function') loadDashboardData();
    } catch (err) {
        console.error('Approve job request error:', err);
        if (typeof showToast === 'function') showToast('Failed to approve request: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function rejectJobRequest(requestId) {
    try {
        const confirmReject = window.confirm('Are you sure you want to reject this job request?');
        if (!confirmReject) return;

        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Rejecting request...');

        const { error } = await window.supabaseClient
            .from('job_assignment_requests')
            .update({
                status: 'rejected',
                updated_at: new Date().toISOString()
            })
            .eq('id', requestId);

        if (error) throw error;

        if (typeof showToast === 'function') showToast('Job request rejected.', 'info');
        
        await refreshJobRequestInbox();
        renderJobRequestsList();
    } catch (err) {
        console.error('Reject job request error:', err);
        if (typeof showToast === 'function') showToast('Failed to reject: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

// Global exposure
window.initializeJobRequestInbox = initializeJobRequestInbox;
window.refreshJobRequestInbox = refreshJobRequestInbox;
window.openJobRequestsModal = openJobRequestsModal;
window.closeJobRequestsModal = closeJobRequestsModal;
window.approveJobRequest = approveJobRequest;
window.rejectJobRequest = rejectJobRequest;
