let dashboardLoadRequestId = 0;
let dashboardAnalyticsRange = 'day';

async function loadDashboardData() {
    const requestId = ++dashboardLoadRequestId;

    const profile = typeof getCurrentUserProfile === 'function' ? getCurrentUserProfile() : null;
    const nameEl = document.getElementById('dash-user-name');
    if (profile && nameEl) {
        nameEl.innerText = profile.username || (profile.email ? profile.email.split('@')[0] : 'User');
    }

    try {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if (user && !profile && nameEl) {
            const baseName = user.email ? user.email.split('@')[0] : 'User';
            nameEl.innerText = baseName.charAt(0).toUpperCase() + baseName.slice(1);
        }
    } catch (error) {
        console.warn('User fetch error:', error);
    }

    let inventory = [];
    let jobs = [];

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

        const stats = buildDashboardStats(jobs, inventory);
        if (requestId !== dashboardLoadRequestId) return;

        setElText('dash-active-jobs', stats.activeJobs);
        setElText('dash-total-reports', stats.reportsCount);
        setElText('dash-metric-stock', stats.stockCount);
        setElText('dash-metric-pending', stats.pendingJobs);
        setElText('dash-metric-closed', stats.closedJobs);
        setElText('dash-metric-mapping', stats.reportsCount);
        setElText('dash-completion-rate', `${stats.completionRate}%`);
        setElText('dash-focus-jobs', `${stats.todayScheduledJobs} Job${stats.todayScheduledJobs === 1 ? '' : 's'}`);
        setElText('dash-focus-date', stats.todayScheduledJobs ? `${formatDashboardHours(stats.todayHours)} scheduled today` : 'No work scheduled today');
        setElText('dash-risk-count', stats.riskJobs);

        populateJobsOverview(stats);
        renderPriorityQueue(stats.priorityJobs);
        renderTechLoad(stats.techLoad);
        renderRecentActivity(stats.recentActivity);
        renderInventoryAnalytics(stats.inventoryInsights);
        renderAnalyticsChart(jobs, dashboardAnalyticsRange);
        renderFocusSparkChart(jobs);
        renderInventoryDonutChart(stats.inventoryInsights);
    } catch (error) {
        console.error('Dashboard calculation error:', error);
    }
}

function buildDashboardStats(jobs, inventory) {
    const todayKey = new Date().toISOString().split('T')[0];
    const totalJobs = jobs.length;
    const closedJobs = jobs.filter(job => job.status === 'Completed').length;
    const activeJobs = jobs.filter(job => ['Dispatched', 'In Progress', 'On Hold', 'Delayed'].includes(job.status)).length;
    const reportsCount = jobs.filter(job => job.report_status === 'Report Completed' || job.status === 'Completed').length;
    const pendingJobs = jobs.filter(job => ['Pending', 'Dispatched', 'On Hold', 'Delayed', 'Unassigned'].includes(job.status || 'Unassigned')).length;
    const unassignedJobs = jobs.filter(job => (job.status || 'Unassigned') === 'Unassigned').length;
    const dispatchedJobs = jobs.filter(job => job.status === 'Dispatched').length;
    const inProgressJobs = jobs.filter(job => job.status === 'In Progress').length;
    const onHoldJobs = jobs.filter(job => job.status === 'On Hold').length;
    const delayedJobs = jobs.filter(job => job.status === 'Delayed').length;
    const scheduledJobs = jobs.filter(job => !!job.scheduled_date).length;
    const todayJobs = jobs.filter(job => job.scheduled_date === todayKey);
    const todayScheduledJobs = todayJobs.length;
    const todayHours = todayJobs.reduce((sum, job) => sum + (Number(job.estimated_duration_hours) || 0), 0);
    const completionRate = totalJobs ? Math.round((closedJobs / totalJobs) * 100) : 0;
    const riskJobs = delayedJobs + onHoldJobs + unassignedJobs;

    const priorityJobs = [...jobs]
        .filter(job => ['Delayed', 'On Hold', 'Unassigned'].includes(job.status || 'Unassigned'))
        .sort((left, right) => getDashboardPriorityRank(left) - getDashboardPriorityRank(right))
        .slice(0, 5);

    const recentActivity = [...jobs]
        .sort((left, right) => new Date(right.updated_at || right.completed_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.completed_at || left.created_at || 0).getTime())
        .slice(0, 5);

    const techLoad = Object.values(jobs.reduce((acc, job) => {
        const names = Array.isArray(job.assignedTechNames) && job.assignedTechNames.length
            ? job.assignedTechNames
            : (job.technicianDisplayName && job.technicianDisplayName !== 'Unassigned' ? [job.technicianDisplayName] : []);

        names.forEach(name => {
            if (!acc[name]) {
                acc[name] = { name, jobs: 0, hours: 0 };
            }
            acc[name].jobs += 1;
            acc[name].hours += Number(job.estimated_duration_hours) || 0;
        });
        return acc;
    }, {})).sort((left, right) => right.jobs - left.jobs).slice(0, 5);

    const inventoryInsights = buildInventoryInsights(inventory);

    return {
        totalJobs,
        activeJobs,
        reportsCount,
        pendingJobs,
        closedJobs,
        stockCount: inventory.length,
        unassignedJobs,
        dispatchedJobs,
        inProgressJobs,
        onHoldJobs,
        delayedJobs,
        scheduledJobs,
        todayScheduledJobs,
        todayHours,
        completionRate,
        riskJobs,
        priorityJobs,
        recentActivity,
        techLoad,
        inventoryInsights
    };
}

function buildInventoryInsights(inventory) {
    const availableStatuses = new Set(['Booked In', 'Good', 'In Stock']);
    const deployedStatuses = new Set(['Booked Out', 'Warning']);
    const riskStatuses = new Set(['Faulty', 'Damaged', 'Missing', 'Needs Maintenance', 'Maintenance Required', 'Critical']);
    const now = new Date();
    const inThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const summary = {
        available: 0,
        deployed: 0,
        warning: 0,
        risk: 0,
        certified: 0,
        dueSoon: 0,
        overdue: 0,
        topCategories: []
    };

    const categoryMap = new Map();

    inventory.forEach(item => {
        const status = String(item.status || '').trim();
        if (availableStatuses.has(status)) summary.available += 1;
        if (deployedStatuses.has(status)) summary.deployed += 1;
        if (status === 'Warning') summary.warning += 1;
        if (riskStatuses.has(status)) summary.risk += 1;
        if (item.calibration_cert || item.calibration_cert_number) summary.certified += 1;

        const dueDate = parseDashboardDate(item.re_calibration_date) || deriveAnnualCalibrationDate(item.calibration_date);
        if (dueDate) {
            if (dueDate < now) summary.overdue += 1;
            else if (dueDate <= inThirtyDays) summary.dueSoon += 1;
        }

        const category = String(item.category || 'Uncategorized').trim() || 'Uncategorized';
        const entry = categoryMap.get(category) || { name: category, total: 0, risk: 0, deployed: 0 };
        entry.total += 1;
        if (riskStatuses.has(status)) entry.risk += 1;
        if (deployedStatuses.has(status)) entry.deployed += 1;
        categoryMap.set(category, entry);
    });

    summary.topCategories = Array.from(categoryMap.values())
        .sort((left, right) => right.total - left.total || right.risk - left.risk)
        .slice(0, 5);

    return summary;
}

function getDashboardPriorityRank(job) {
    const status = job.status || 'Unassigned';
    if (status === 'Delayed') return 0;
    if (status === 'On Hold') return 1;
    if (status === 'Unassigned') return 2;
    return 3;
}

function setElText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function populateJobsOverview(stats) {
    setElText('dash-overview-total', stats.totalJobs);
    setElText('dash-overview-done', `${stats.closedJobs} Completed`);
    setElText('dash-overview-unassigned', stats.unassignedJobs);
    setElText('dash-overview-dispatched', stats.dispatchedJobs);
    setElText('dash-overview-inprogress', stats.inProgressJobs);
    setElText('dash-overview-onhold', stats.onHoldJobs);
    setElText('dash-overview-delayed', `${stats.delayedJobs} Delayed`);
    setElText('dash-overview-scheduled', `${stats.scheduledJobs} Scheduled`);
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'In Progress': return 'badge-blue';
        case 'Dispatched': return 'badge-yellow';
        case 'On Hold': return 'badge-gray';
        case 'Delayed': return 'badge-orange';
        case 'Completed': return 'badge-green';
        default: return 'badge-gray';
    }
}

function renderPriorityQueue(priorityJobs) {
    const container = document.getElementById('dash-priority-list');
    if (!container) return;

    if (!priorityJobs.length) {
        container.innerHTML = '<div class="dashboard-empty-state">No urgent jobs are currently surfaced.</div>';
        return;
    }

    container.innerHTML = priorityJobs.map(job => `
        <div class="dashboard-stack-item">
            <div class="dashboard-stack-item-top">
                <div class="dashboard-stack-item-title">${escapeDashboardHtml(job.title || 'Untitled Job')}</div>
                <span class="badge ${getStatusBadgeClass(job.status || 'Unassigned')}">${escapeDashboardHtml(job.status || 'Unassigned')}</span>
            </div>
            <div class="dashboard-stack-item-meta">
                <div>${escapeDashboardHtml(job.job_type || 'General Work')} &bull; ${escapeDashboardHtml(job.protocol_number || 'No protocol')}</div>
                <div>${escapeDashboardHtml(job.displayName || 'Unknown Client')} &bull; ${escapeDashboardHtml(job.siteDisplayName || 'No site')}</div>
                <div>${escapeDashboardHtml(job.scheduled_date || 'Unscheduled')} &bull; ${escapeDashboardHtml(formatDashboardHours(job.estimated_duration_hours || 0))}</div>
            </div>
        </div>
    `).join('');
}

function renderTechLoad(techLoad) {
    const container = document.getElementById('dash-tech-load-list');
    if (!container) return;

    if (!techLoad.length) {
        container.innerHTML = '<div class="dashboard-empty-state">No technician assignments available yet.</div>';
        return;
    }

    const peakJobs = Math.max(...techLoad.map(item => item.jobs), 1);
    container.innerHTML = techLoad.map(item => {
        const initials = item.name.slice(0, 2).toUpperCase();
        const width = Math.max(12, Math.round((item.jobs / peakJobs) * 100));
        return `
            <div class="dashboard-stack-item">
                <div class="dashboard-tech-meter">
                    <div class="dashboard-tech-avatar">${escapeDashboardHtml(initials)}</div>
                    <div style="flex:1;">
                        <div class="dashboard-stack-item-top" style="margin-bottom:6px;">
                            <div class="dashboard-stack-item-title">${escapeDashboardHtml(item.name)}</div>
                            <div class="dashboard-stack-item-meta">${escapeDashboardHtml(formatDashboardHours(item.hours))}</div>
                        </div>
                        <div class="dashboard-tech-meter-bar">
                            <div class="dashboard-tech-meter-fill" style="width:${width}%;"></div>
                        </div>
                        <div class="dashboard-stack-item-meta" style="margin-top:8px;">${item.jobs} assigned job${item.jobs === 1 ? '' : 's'}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderRecentActivity(recentJobs) {
    const container = document.getElementById('dash-recent-activity-list');
    if (!container) return;

    if (!recentJobs.length) {
        container.innerHTML = '<div class="dashboard-empty-state">No recent activity to show.</div>';
        return;
    }

    container.innerHTML = recentJobs.map(job => `
        <div class="dashboard-stack-item">
            <div class="dashboard-stack-item-top">
                <div class="dashboard-stack-item-title">${escapeDashboardHtml(job.title || 'Untitled Job')}</div>
                <span class="badge ${getStatusBadgeClass(job.status || 'Unassigned')}">${escapeDashboardHtml(job.status || 'Unassigned')}</span>
            </div>
            <div class="dashboard-stack-item-meta">
                <div>${escapeDashboardHtml(job.displayName || 'Unknown Client')} &bull; ${escapeDashboardHtml(job.siteDisplayName || 'No site')}</div>
                <div>${escapeDashboardHtml(formatDashboardDate(job.updated_at || job.completed_at || job.created_at))}</div>
            </div>
        </div>
    `).join('');
}

function renderInventoryAnalytics(inventoryInsights) {
    if (!inventoryInsights) return;
    setElText('dash-inventory-available', inventoryInsights.available);
    setElText('dash-inventory-deployed', inventoryInsights.deployed);
    setElText('dash-inventory-warning', inventoryInsights.warning);
    setElText('dash-inventory-risk', inventoryInsights.risk);
    setElText('dash-calibration-due-soon', inventoryInsights.dueSoon);
    setElText('dash-calibration-overdue', inventoryInsights.overdue);
    setElText('dash-calibration-certified', inventoryInsights.certified);

    const categoryContainer = document.getElementById('dash-inventory-category-list');
    if (!categoryContainer) return;
    if (!inventoryInsights.topCategories.length) {
        categoryContainer.innerHTML = '<div class="dashboard-empty-state">No inventory category data available yet.</div>';
        return;
    }

    categoryContainer.innerHTML = inventoryInsights.topCategories.map(item => `
        <div class="dashboard-stack-item">
            <div class="dashboard-stack-item-top">
                <div class="dashboard-stack-item-title">${escapeDashboardHtml(item.name)}</div>
                <strong>${escapeDashboardHtml(String(item.total))}</strong>
            </div>
            <div class="dashboard-stack-item-meta">
                <div>${escapeDashboardHtml(String(item.deployed))} deployed &bull; ${escapeDashboardHtml(String(item.risk))} at risk</div>
            </div>
        </div>
    `).join('');
}

function renderFocusSparkChart(jobs) {
    const canvas = document.getElementById('dashFocusSparkChart');
    if (!canvas) return;

    const grouped = new Map();
    jobs.forEach(job => {
        const key = String(job.scheduled_date || '').trim();
        if (!key) return;
        grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    const labels = Array.from(grouped.keys()).sort().slice(-8);
    const values = labels.map(label => grouped.get(label) || 0);
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height || 200);
    gradient.addColorStop(0, 'rgba(31, 155, 215, 0.24)');
    gradient.addColorStop(1, 'rgba(31, 155, 215, 0.04)');

    if (window._dashFocusSparkChart) window._dashFocusSparkChart.destroy();

    window._dashFocusSparkChart = new Chart(context, {
        type: 'line',
        data: {
            labels: labels.map(value => formatDashboardShortDate(value)),
            datasets: [{
                data: values.length ? values : [0, 0, 0, 0, 0, 0],
                borderColor: '#39526b',
                backgroundColor: gradient,
                fill: true,
                tension: 0.45,
                borderWidth: 3,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                y: { display: false },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: 'rgba(71, 85, 105, 0.72)', maxRotation: 0, autoSkip: true }
                }
            },
            elements: {
                line: { capBezierPoints: true }
            }
        }
    });
}

function renderInventoryDonutChart(inventoryInsights) {
    const canvas = document.getElementById('dashInventoryDonutChart');
    if (!canvas || !inventoryInsights) return;

    if (window._dashInventoryDonutChart) window._dashInventoryDonutChart.destroy();

    window._dashInventoryDonutChart = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Available', 'Deployed', 'Warning', 'Risk'],
            datasets: [{
                data: [
                    inventoryInsights.available,
                    inventoryInsights.deployed,
                    inventoryInsights.warning,
                    inventoryInsights.risk
                ],
                backgroundColor: ['#1f9bd7', '#5d6f82', '#9aa6b2', '#cf2534'],
                borderColor: '#eef2f6',
                borderWidth: 3,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(31, 41, 55, 0.96)',
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb'
                }
            }
        }
    });
}

function formatDashboardHours(totalHours) {
    const normalized = Math.max(0, Number(totalHours) || 0);
    return normalized % 1 === 0 ? `${normalized.toFixed(0)}h` : `${normalized.toFixed(1)}h`;
}

function parseDashboardDate(value) {
    if (!value) return null;
    const normalized = String(value).trim();
    if (!normalized) return null;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) return parsed;

    const slashMatch = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (!slashMatch) return null;
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]) - 1;
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const fallback = new Date(year, month, day);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function deriveAnnualCalibrationDate(value) {
    const calibrationDate = parseDashboardDate(value);
    if (!calibrationDate) return null;
    const due = new Date(calibrationDate);
    due.setFullYear(due.getFullYear() + 1);
    return due;
}

function formatDashboardDate(value) {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDashboardShortDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function escapeDashboardHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setDashboardAnalyticsRange(range = 'day', button = null) {
    const normalizedRange = ['day', 'week', 'month'].includes(range) ? range : 'day';
    dashboardAnalyticsRange = normalizedRange;

    document.querySelectorAll('.dashboard-chip-tab').forEach(tab => {
        const isActive = tab.dataset.dashboardRange === normalizedRange;
        tab.classList.toggle('active', isActive);
    });

    if (button) {
        button.blur();
    }

    if (typeof loadDashboardData === 'function') {
        loadDashboardData();
    }
}

function buildDashboardAnalyticsSeries(jobs, range = 'day') {
    const today = new Date();
    const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (range === 'month') {
        const labels = [];
        const counts = [];
        for (let index = 5; index >= 0; index -= 1) {
            const monthDate = new Date(normalizedToday.getFullYear(), normalizedToday.getMonth() - index, 1);
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            labels.push(monthDate.toLocaleDateString('en-GB', { month: 'short' }));
            counts.push(jobs.filter(job => {
                const jobDate = parseDashboardDate(job.scheduled_date || job.created_at || job.updated_at);
                return jobDate && jobDate.getFullYear() === year && jobDate.getMonth() === month;
            }).length);
        }
        return { labels, values: counts, label: 'Jobs this month' };
    }

    if (range === 'week') {
        const labels = [];
        const counts = [];
        for (let index = 6; index >= 0; index -= 1) {
            const targetDate = new Date(normalizedToday);
            targetDate.setDate(normalizedToday.getDate() - index);
            const key = targetDate.toISOString().split('T')[0];
            labels.push(targetDate.toLocaleDateString('en-GB', { weekday: 'short' }));
            counts.push(jobs.filter(job => {
                const jobDate = parseDashboardDate(job.scheduled_date || job.created_at || job.updated_at);
                return jobDate && jobDate.toISOString().split('T')[0] === key;
            }).length);
        }
        return { labels, values: counts, label: 'Jobs this week' };
    }

    const labels = [];
    const counts = [];
    for (let hour = 0; hour < 24; hour += 4) {
        const startHour = hour;
        const endHour = Math.min(hour + 4, 24);
        labels.push(`${String(startHour).padStart(2, '0')}:00`);
        counts.push(jobs.filter(job => {
            const jobDate = parseDashboardDate(job.scheduled_date || job.created_at || job.updated_at);
            if (!jobDate) return false;
            const sameDay =
                jobDate.getFullYear() === normalizedToday.getFullYear() &&
                jobDate.getMonth() === normalizedToday.getMonth() &&
                jobDate.getDate() === normalizedToday.getDate();
            return sameDay && jobDate.getHours() >= startHour && jobDate.getHours() < endHour;
        }).length);
    }

    const hasDayData = counts.some(Boolean);
    if (!hasDayData) {
        const fallbackLabels = ['Unassigned', 'Dispatched', 'In Progress', 'On Hold', 'Delayed', 'Completed'];
        const fallbackValues = fallbackLabels.map(label => jobs.filter(job => (job.status || 'Unassigned') === label).length);
        return { labels: fallbackLabels, values: fallbackValues, label: 'Jobs by status today' };
    }

    return { labels, values: counts, label: 'Jobs today' };
}

function renderAnalyticsChart(jobs, range = 'day') {
    const canvas = document.getElementById('dashAnalyticsChart');
    if (!canvas) return;

    const series = buildDashboardAnalyticsSeries(jobs, range);
    const labels = series.labels;
    const values = series.values;
    const context = canvas.getContext('2d');
    const fillGradient = context.createLinearGradient(0, 0, 0, canvas.height || 320);
    fillGradient.addColorStop(0, 'rgba(31, 155, 215, 0.26)');
    fillGradient.addColorStop(0.55, 'rgba(31, 155, 215, 0.12)');
    fillGradient.addColorStop(1, 'rgba(31, 155, 215, 0.02)');

    if (window._dashAnalyticsChart) window._dashAnalyticsChart.destroy();

    window._dashAnalyticsChart = new Chart(context, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: series.label,
                data: values,
                fill: true,
                backgroundColor: fillGradient,
                borderColor: '#1f9bd7',
                borderWidth: 3,
                tension: 0.42,
                pointRadius: 5,
                pointHoverRadius: 6,
                pointBorderWidth: 2,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#1f9bd7'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: 18, right: 18, bottom: 10, left: 8 }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(31, 41, 55, 0.96)',
                    padding: 12,
                    cornerRadius: 12,
                    titleColor: '#ffffff',
                    bodyColor: '#e5e7eb',
                    borderColor: 'rgba(31, 155, 215, 0.24)',
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(148, 163, 184, 0.22)', drawBorder: false },
                    ticks: { stepSize: 1, color: '#64748b' }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#64748b', maxRotation: 0, autoSkip: true }
                }
            }
        }
    });
}

window.setDashboardAnalyticsRange = setDashboardAnalyticsRange;

