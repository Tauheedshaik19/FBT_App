async function loadDashboardData() {
    console.log("Loading Dashboard V2 Data...");

    // 1. Fetch User Info
    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user) {
            const nameEl = document.getElementById('dash-user-name');
            if (nameEl) nameEl.innerText = user.email.split('@')[0].charAt(0).toUpperCase() + user.email.split('@')[0].slice(1);
        }
    } catch (e) { console.warn("User fetch error:", e); }

    let inventory = [];
    let jobs = [];

    // 2. Fetch All Data
    try {
        const [invRes, jobsRes] = await Promise.all([
            window.supabaseClient.from('inventory').select('*'),
            window.supabaseClient.from('jobs').select('*').order('created_at', { ascending: false })
        ]);

        inventory = invRes.data || [];
        jobs = jobsRes.data || [];

        // 3. Calculate Stats
        const stats = {
            activeJobs: jobs.filter(j => ['Dispatched', 'In Progress'].includes(j.status)).length,
            reportsCount: jobs.filter(j => j.report_status === 'Report Completed' || j.status === 'Completed').length,
            pendingJobs: jobs.filter(j => j.status === 'Pending' || j.status === 'Dispatched').length,
            closedJobs: jobs.filter(j => j.status === 'Completed').length,
            stockCount: inventory.length
        };

        // 4. Update UI Elements
        setElText('dash-active-jobs', stats.activeJobs);
        setElText('dash-total-reports', stats.reportsCount);
        setElText('dash-metric-stock', stats.stockCount);
        setElText('dash-metric-pending', stats.pendingJobs);
        setElText('dash-metric-closed', stats.closedJobs);
        setElText('dash-metric-mapping', stats.reportsCount);

        // 5. Populate Active Jobs Table
        populateActiveJobsTable(jobs.filter(j => ['In Progress', 'Dispatched'].includes(j.status)).slice(0, 6));

        // 6. Render Charts
        renderAnalyticsChart(jobs);

    } catch (e) {
        console.error("Dashboard calculation error:", e);
    }
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function populateActiveJobsTable(activeJobs) {
    const tbody = document.getElementById('dash-active-jobs-tbody');
    if (!tbody) return;

    if (activeJobs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; color: #64748b;">No active jobs at the moment</td></tr>';
        return;
    }

    tbody.innerHTML = activeJobs.map(job => `
        <tr>
            <td><a href="#jobs" class="job-id-link">${job.protocol_number || 'N/A'}</a></td>
            <td>
                <div style="font-weight: 600;">${job.title || 'Untitled Job'}</div>
                <span class="job-type-mini">${job.job_type || 'Installation'}</span>
            </td>
            <td>${job.technician_name || 'Unassigned'}</td>
            <td><span class="badge ${getStatusBadgeClass(job.status)}">${job.status}</span></td>
            <td style="color: #64748b;">${new Date(job.created_at).toLocaleDateString()}</td>
        </tr>
    `).join('');
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'Mapping': return 'badge-orange';
        case 'In Progress': return 'badge-blue';
        case 'Dispatched': return 'badge-yellow';
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
