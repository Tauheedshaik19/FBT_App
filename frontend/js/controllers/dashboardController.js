async function loadDashboardData() {
    console.log("Loading Dashboard V2 Data...");

    // 1. Fetch User Info
    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const nameEl = document.getElementById('dash-user-name');
    if (profile && nameEl) {
        nameEl.innerText = profile.username || profile.email.split('@')[0];
    }

    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user && !profile) {
            if (nameEl) nameEl.innerText = user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1);
        }
    } catch (e) { console.warn("User fetch error:", e); }

    let inventory = [];
    let jobs = [];

    // 2. Fetch All Data
    try {
        const [invRes, filteredJobs] = await Promise.all([
            window.supabaseClient.from('inventory').select('*'),
            typeof fetchJobsDataset === 'function'
                ? fetchJobsDataset()
                : window.supabaseClient.from('jobs').select('*').order('created_at', { ascending: false }).then(result => {
                    if (result.error) throw result.error;
                    return result.data || [];
                })
        ]);

        inventory = invRes.data || [];
        jobs = filteredJobs || [];

        // 3. Calculate Stats
        const stats = {
            totalJobs: jobs.length,
            activeJobs: jobs.filter(j => ['Dispatched', 'In Progress', 'On Hold', 'Delayed'].includes(j.status)).length,
            reportsCount: jobs.filter(j => j.report_status === 'Report Completed' || j.status === 'Completed').length,
            pendingJobs: jobs.filter(j => ['Pending', 'Dispatched', 'On Hold', 'Delayed'].includes(j.status)).length,
            closedJobs: jobs.filter(j => j.status === 'Completed').length,
            stockCount: inventory.length,
            unassignedJobs: jobs.filter(j => (j.status || 'Unassigned') === 'Unassigned').length,
            dispatchedJobs: jobs.filter(j => j.status === 'Dispatched').length,
            inProgressJobs: jobs.filter(j => j.status === 'In Progress').length,
            onHoldJobs: jobs.filter(j => j.status === 'On Hold').length,
            delayedJobs: jobs.filter(j => j.status === 'Delayed').length,
            scheduledJobs: jobs.filter(j => !!j.scheduled_date).length
        };

        // 4. Update UI Elements
        setElText('dash-active-jobs', stats.activeJobs);
        setElText('dash-total-reports', stats.reportsCount);
        setElText('dash-metric-stock', stats.stockCount);
        setElText('dash-metric-pending', stats.pendingJobs);
        setElText('dash-metric-closed', stats.closedJobs);
        setElText('dash-metric-mapping', stats.reportsCount);
        populateJobsOverview(stats);

        // 5. Render Charts
        renderAnalyticsChart(jobs);

    } catch (e) {
        console.error("Dashboard calculation error:", e);
    }
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function populateJobsOverview(stats) {
    setElText('dash-overview-total', stats.totalJobs);
    setElText('dash-overview-done', stats.closedJobs);
    setElText('dash-overview-unassigned', stats.unassignedJobs);
    setElText('dash-overview-dispatched', stats.dispatchedJobs);
    setElText('dash-overview-inprogress', stats.inProgressJobs);
    setElText('dash-overview-onhold', stats.onHoldJobs);
    setElText('dash-overview-delayed', stats.delayedJobs);
    setElText('dash-overview-scheduled', stats.scheduledJobs);
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'Mapping': return 'badge-orange';
        case 'In Progress': return 'badge-blue';
        case 'Dispatched': return 'badge-yellow';
        case 'On Hold': return 'badge-gray';
        case 'Delayed': return 'badge-orange';
        case 'Completed': return 'badge-green';
        default: return 'badge-gray';
    }
}

function renderAnalyticsChart(jobs) {
    const ctx = document.getElementById('dashAnalyticsChart');
    if (!ctx) return;

    // Group jobs by date or status for the bar chart
    const statusCounts = jobs.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
    }, {});

    if (window._dashAnalyticsChart) window._dashAnalyticsChart.destroy();

    window._dashAnalyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(statusCounts),
            datasets: [{
                label: 'Jobs by Status',
                data: Object.values(statusCounts),
                backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'],
                borderRadius: 6,
                barThickness: 20
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { display: false }, ticks: { stepSize: 1 } },
                x: { grid: { display: false } }
            }
        }
    });
}
