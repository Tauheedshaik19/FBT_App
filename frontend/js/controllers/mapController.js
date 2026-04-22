let mapInstance = null;
let currentRouteOverlay = null;
let loadedSites = [];
let plannedRouteJobs = [];
let loadedTripPlans = [];
let currentRoutePlan = null;
let lastRoutePlanSummary = '';
let editingTripPlanId = null;
let tripPlanTableAvailable = true;
let routePlannerInteractionsBound = false;

const BASE_LOCATION = {
    lat: -26.0791773,
    lng: 28.1153817,
    name: 'Home Base (Fairbridge Tech)',
    address: '7 Electron Rd, Sandton'
};

const WORKDAY_START_MINUTES = 8 * 60;
const WORKDAY_END_MINUTES = (16 * 60) + 30;
const WORKDAY_DURATION_MINUTES = WORKDAY_END_MINUTES - WORKDAY_START_MINUTES;

const ROUTE_DAY_COLORS = ['#2563eb', '#ef4444', '#0f766e', '#9333ea', '#d97706', '#0891b2', '#4f46e5'];

const DEMO_SITES = [
    { id: 'demo-1', name: 'Marsing & Co', latitude: -25.9382, longitude: 27.9256, company_name: 'Marsing-SA', status: 'ACTIVE' },
    { id: 'demo-2', name: 'Marico SA', latitude: -26.1072, longitude: 28.0567, company_name: 'Marico', status: 'GOOD' },
    { id: 'demo-3', name: 'Topmed Scheme', latitude: -25.7481, longitude: 28.2381, company_name: 'Topmed', status: 'ACTIVE' }
];

function showRouteToast(message, type = 'info') {
    if (typeof showToast === 'function') {
        showToast(message, type);
        return;
    }
    console[type === 'error' ? 'error' : 'log'](message);
}

function formatRouteDuration(totalHours) {
    if (typeof formatDurationDisplay === 'function') {
        return formatDurationDisplay(totalHours);
    }

    const normalized = Math.max(0, Number(totalHours) || 0);
    const days = Math.floor(normalized / 24);
    const hours = Number((normalized - (days * 24)).toFixed(1));
    return `${days}d ${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function addDaysToDate(dateStr, dayOffset = 0) {
    const date = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateStr;
    date.setDate(date.getDate() + dayOffset);
    return date.toISOString().split('T')[0];
}

function getIsoDateRange(startDate, daySpan) {
    const normalizedSpan = Math.max(1, Math.round(toNumber(daySpan, 1)));
    return Array.from({ length: normalizedSpan }, (_, idx) => addDaysToDate(startDate, idx));
}

function calculateInclusiveDaySpan(startDate, endDate) {
    if (!startDate || !endDate) return 1;
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
    const diffMs = end.getTime() - start.getTime();
    if (diffMs < 0) return 1;
    return Math.max(1, Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1);
}

function parseJobHours(job) {
    const hours = toNumber(job?.estimated_duration_hours, 0);
    if (hours > 0) return hours;

    const durationText = String(job?.duration || '').trim();
    const match = durationText.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 0;
}

function estimateTravelProfile(distanceKm) {
    if (distanceKm <= 0) {
        return {
            crowDistanceKm: 0,
            roadDistanceKm: 0,
            driveMinutes: 0,
            speedKph: 0,
            zoneLabel: 'On site'
        };
    }

    let roadFactor = 1.18;
    let speedKph = 38;
    let fixedDelayMinutes = 8;
    let zoneLabel = 'JHB urban';

    if (distanceKm > 35 && distanceKm <= 110) {
        roadFactor = 1.24;
        speedKph = 58;
        fixedDelayMinutes = 10;
        zoneLabel = 'Regional';
    } else if (distanceKm > 110 && distanceKm <= 320) {
        roadFactor = 1.16;
        speedKph = 84;
        fixedDelayMinutes = 12;
        zoneLabel = 'Long haul';
    } else if (distanceKm > 320) {
        roadFactor = 1.11;
        speedKph = 96;
        fixedDelayMinutes = 18;
        zoneLabel = 'Out of province';
    }

    const roadDistanceKm = distanceKm * roadFactor;
    const driveMinutes = Math.max(5, Math.round((roadDistanceKm / speedKph) * 60) + fixedDelayMinutes);

    return {
        crowDistanceKm: distanceKm,
        roadDistanceKm,
        driveMinutes,
        speedKph,
        zoneLabel
    };
}

function formatClock(totalMinutes) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours24 = Math.floor(safeMinutes / 60) % 24;
    const mins = safeMinutes % 60;
    return `${String(hours24).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatScheduleMoment(totalMinutes) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const dayOffset = Math.floor(safeMinutes / (24 * 60));
    const clock = formatClock(safeMinutes);
    return dayOffset ? `${clock} (+${dayOffset}d)` : clock;
}

function formatMinutesDuration(totalMinutes) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes));
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    if (!hours) return `${minutes}m`;
    if (!minutes) return `${hours}h`;
    return `${hours}h ${minutes}m`;
}

function formatDistance(distanceKm) {
    const safeDistance = Math.max(0, toNumber(distanceKm, 0));
    return safeDistance >= 10 ? `${safeDistance.toFixed(0)} km` : `${safeDistance.toFixed(1)} km`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getSiteStatusTone(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('complete')) return 'success';
    if (normalized.includes('progress') || normalized.includes('dispatch')) return 'info';
    if (normalized.includes('delay') || normalized.includes('hold')) return 'warning';
    return 'neutral';
}

function getTripClassification(totalRoadDistanceKm) {
    if (totalRoadDistanceKm <= 120) return 'JHB / near-city day run';
    if (totalRoadDistanceKm <= 350) return 'Regional same-day route';
    return 'Out-of-province style run';
}

function buildGoogleMapsRouteUrl(route = []) {
    const origin = `${BASE_LOCATION.lat},${BASE_LOCATION.lng}`;
    const destination = origin;
    const waypointList = route.map(site => `${site.latitude},${site.longitude}`).join('|');
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    if (waypointList) {
        url += `&waypoints=${encodeURIComponent(waypointList)}`;
    }
    return url;
}

function buildSingleStopNavigationUrl(site) {
    if (!site?.latitude || !site?.longitude) return '#';
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${BASE_LOCATION.lat},${BASE_LOCATION.lng}`)}&destination=${encodeURIComponent(`${site.latitude},${site.longitude}`)}&travelmode=driving`;
}

function summarizeSiteJobs(siteJobs = []) {
    if (!siteJobs.length) {
        return {
            titleHtml: '<span class="route-job-pill">Manual stop</span>',
            statusLabel: 'Manual',
            statusTone: 'neutral',
            clientLabel: '-',
            technicianLabel: '-',
            workMinutes: 0
        };
    }

    const titles = siteJobs
        .map(job => `<span class="route-job-pill">${escapeHtml(job.title || 'Untitled Job')}</span>`)
        .join('');

    const firstJob = siteJobs[0];
    const workMinutes = siteJobs.reduce((sum, job) => sum + (parseJobHours(job) * 60), 0);

    return {
        titleHtml: titles,
        statusLabel: firstJob?.status || 'Assigned',
        statusTone: getSiteStatusTone(firstJob?.status),
        clientLabel: firstJob?.displayName || firstJob?.company_name || '-',
        technicianLabel: firstJob?.technicianDisplayName || firstJob?.assignedTechNames || '-',
        workMinutes
    };
}

function clearCurrentRouteOverlay() {
    if (currentRouteOverlay && mapInstance) {
        mapInstance.removeLayer(currentRouteOverlay);
    }
    currentRouteOverlay = null;
}

function buildScheduleForRoute(route = [], routeJobs = [], options = {}) {
    const scheduleEntries = [];
    const startDate = options.planDate || new Date().toISOString().split('T')[0];
    const selectedEndDate = options.planEndDate || startDate;
    const requestedDaySpan = Math.max(1, Math.round(toNumber(options.daySpan, 1)));

    let currentDayIndex = 0;
    let currentMinute = WORKDAY_START_MINUTES;
    let currentLocation = BASE_LOCATION;
    let totalTravelMinutes = 0;
    let totalRoadDistanceKm = 0;
    let totalWorkMinutes = 0;
    let overnightBreaks = 0;

    route.forEach((site, index) => {
        let travelProfile = estimateTravelProfile(getDistance(
            currentLocation.latitude || currentLocation.lat,
            currentLocation.longitude || currentLocation.lng,
            site.latitude,
            site.longitude
        ));

        const siteJobs = routeJobs.filter(job => String(job.site_id) === String(site.id));
        const siteSummary = summarizeSiteJobs(siteJobs);
        const workMinutes = Math.max(siteSummary.workMinutes, siteJobs.length ? 30 : 0);
        let projectedEnd = currentMinute + travelProfile.driveMinutes + workMinutes;

        if (scheduleEntries.length > 0 && projectedEnd > WORKDAY_END_MINUTES) {
            currentDayIndex += 1;
            currentMinute = WORKDAY_START_MINUTES;
            overnightBreaks += 1;
            travelProfile = estimateTravelProfile(getDistance(
                currentLocation.latitude || currentLocation.lat,
                currentLocation.longitude || currentLocation.lng,
                site.latitude,
                site.longitude
            ));
        }

        const arrivalMinute = currentMinute + travelProfile.driveMinutes;
        const workStartMinute = arrivalMinute;
        const workEndMinute = workStartMinute + workMinutes;

        scheduleEntries.push({
            stopNumber: index + 1,
            dayIndex: currentDayIndex,
            stopDate: addDaysToDate(startDate, currentDayIndex),
            site,
            siteJobs,
            siteSummary,
            travelProfile,
            arrivalMinute,
            workStartMinute,
            workEndMinute,
            workMinutes
        });

        totalTravelMinutes += travelProfile.driveMinutes;
        totalRoadDistanceKm += travelProfile.roadDistanceKm;
        totalWorkMinutes += workMinutes;
        currentMinute = workEndMinute;
        currentLocation = site;
    });

    let returnTravelProfile = estimateTravelProfile(getDistance(
        currentLocation.latitude || currentLocation.lat,
        currentLocation.longitude || currentLocation.lng,
        BASE_LOCATION.lat,
        BASE_LOCATION.lng
    ));

    let returnDayIndex = currentDayIndex;
    let returnStartMinute = currentMinute;
    if (scheduleEntries.length && (currentMinute + returnTravelProfile.driveMinutes > WORKDAY_END_MINUTES)) {
        returnDayIndex += 1;
        returnStartMinute = WORKDAY_START_MINUTES;
    }

    const returnToBaseMinute = returnStartMinute + returnTravelProfile.driveMinutes;
    const returnDate = addDaysToDate(startDate, returnDayIndex);

    totalTravelMinutes += returnTravelProfile.driveMinutes;
    totalRoadDistanceKm += returnTravelProfile.roadDistanceKm;

    const totalDayMinutes = totalTravelMinutes + totalWorkMinutes;
    const daysRequired = returnDayIndex + 1;
    const overtimeMinutes = Math.max(0, returnToBaseMinute - WORKDAY_END_MINUTES);
    const remainingMinutes = Math.max(0, WORKDAY_END_MINUTES - returnToBaseMinute);
    const furthestOneWayKm = Math.max(
        ...scheduleEntries.map(entry => entry.travelProfile.roadDistanceKm),
        returnTravelProfile.roadDistanceKm
    );
    const requiresOvernight = daysRequired > 1 || totalRoadDistanceKm > 520 || furthestOneWayKm > 250;
    const tripClassification = getTripClassification(totalRoadDistanceKm);

    const daySummaries = Array.from({ length: daysRequired }, (_, idx) => {
        const entries = scheduleEntries.filter(entry => entry.dayIndex === idx);
        const dayTravelMinutes = entries.reduce((sum, entry) => sum + entry.travelProfile.driveMinutes, 0);
        const dayWorkMinutes = entries.reduce((sum, entry) => sum + entry.workMinutes, 0);
        const firstArrival = entries[0]?.arrivalMinute ?? null;
        const lastFinish = entries.length ? entries[entries.length - 1].workEndMinute : null;
        const includesReturnToBase = idx === returnDayIndex;
        const dayReturnMinutes = includesReturnToBase ? returnTravelProfile.driveMinutes : 0;
        const dayEndMinute = includesReturnToBase
            ? returnToBaseMinute
            : (lastFinish ?? WORKDAY_START_MINUTES);

        return {
            dayIndex: idx,
            date: addDaysToDate(startDate, idx),
            entries,
            dayTravelMinutes: dayTravelMinutes + dayReturnMinutes,
            dayWorkMinutes,
            dayEndMinute,
            firstArrival,
            includesReturnToBase
        };
    });

    return {
        planName: options.planName || '',
        route,
        routeJobs,
        technicianId: options.technicianId || '',
        technicianName: options.technicianName || 'Manual route',
        planDate: startDate,
        selectedEndDate,
        requestedDaySpan,
        scheduleEntries,
        totalTravelMinutes,
        totalWorkMinutes,
        totalDayMinutes,
        totalRoadDistanceKm,
        returnTravelProfile,
        returnToBaseMinute,
        returnDate,
        overtimeMinutes,
        remainingMinutes,
        daysRequired,
        overnightBreaks,
        requiresOvernight,
        tripClassification,
        daySummaries
    };
}

function buildRouteSummaryText(plan) {
    const lines = [
        `${plan.planName || plan.technicianName}${plan.planDate ? ` | ${plan.planDate}` : ''}`,
        `Technician: ${plan.technicianName}`,
        `Trip type: ${plan.tripClassification}`,
        `Travel: ${formatMinutesDuration(plan.totalTravelMinutes)} | Work: ${formatMinutesDuration(plan.totalWorkMinutes)} | Total route: ${formatMinutesDuration(plan.totalDayMinutes)}`,
        `Days required: ${plan.daysRequired} | Overnight breaks: ${plan.overnightBreaks}`,
        `Return to base: ${plan.returnDate} ${formatScheduleMoment(plan.returnToBaseMinute)}`,
        `Total road distance: ${formatDistance(plan.totalRoadDistanceKm)}`
    ];

    plan.daySummaries.forEach(day => {
        lines.push(`Day ${day.dayIndex + 1} | ${day.date} | Travel ${formatMinutesDuration(day.dayTravelMinutes)} | Work ${formatMinutesDuration(day.dayWorkMinutes)}`);
        day.entries.forEach(entry => {
            lines.push(`  ${entry.stopNumber}. ${entry.site.name} | Arrive ${formatScheduleMoment(entry.arrivalMinute)} | Work ${formatScheduleMoment(entry.workStartMinute)}-${formatScheduleMoment(entry.workEndMinute)} | Drive ${formatMinutesDuration(entry.travelProfile.driveMinutes)}`);
        });
    });

    lines.push(`Return to base | Drive ${formatMinutesDuration(plan.returnTravelProfile.driveMinutes)} | ETA ${plan.returnDate} ${formatScheduleMoment(plan.returnToBaseMinute)}`);
    return lines.join('\n');
}

function getTripPlanStatusTone(status) {
    switch (String(status || '').toLowerCase()) {
    case 'in_progress':
        return 'info';
    case 'completed':
        return 'success';
    case 'paused':
        return 'warning';
    case 'planned':
        return 'neutral';
    default:
        return 'neutral';
    }
}

function renderRouteSiteChecklist(preselectedIds = []) {
    const routeList = document.getElementById('route-site-list');
    if (!routeList) return;

    routeList.innerHTML = '';

    const plannedSiteIds = new Set(plannedRouteJobs.map(job => String(job.site_id)).filter(Boolean));
    const jobsBySiteId = plannedRouteJobs.reduce((acc, job) => {
        const key = String(job.site_id || '');
        if (!key) return acc;
        acc[key] = acc[key] || [];
        acc[key].push(job);
        return acc;
    }, {});

    loadedSites.forEach(site => {
        if (!site.latitude || !site.longitude) return;

        const isChecked = preselectedIds.includes(String(site.id));
        const isPlanned = plannedSiteIds.has(String(site.id));
        const siteJobs = jobsBySiteId[String(site.id)] || [];
        const distanceFromBase = estimateTravelProfile(getDistance(BASE_LOCATION.lat, BASE_LOCATION.lng, site.latitude, site.longitude));
        const jobHours = siteJobs.reduce((sum, job) => sum + parseJobHours(job), 0);

        const row = document.createElement('label');
        row.className = `route-site-row ${isPlanned ? 'route-site-row-planned' : ''}`;
        row.innerHTML = `
            <input type="checkbox" name="route-site" value="${escapeHtml(site.id)}" ${isChecked ? 'checked' : ''}>
            <div class="route-site-content">
                <div class="route-site-head">
                    <span class="route-site-name">${escapeHtml(site.name)}</span>
                    ${isPlanned ? '<span class="badge badge-blue">Assigned</span>' : '<span class="badge">Selectable</span>'}
                </div>
                <div class="route-site-meta">
                    <span>${escapeHtml(site.company_name || 'Client site')}</span>
                    <span>${formatDistance(distanceFromBase.roadDistanceKm)} from base</span>
                    <span>${formatMinutesDuration(distanceFromBase.driveMinutes)} drive</span>
                    <span>${siteJobs.length} job${siteJobs.length === 1 ? '' : 's'}</span>
                    <span>${jobHours ? formatRouteDuration(jobHours) : 'No job time yet'}</span>
                </div>
            </div>
        `;
        routeList.appendChild(row);
    });
}

function renderPlannedRouteTable(plan = null) {
    const tbody = document.getElementById('route-plan-table-body');
    if (!tbody) return;

    if (!plan?.scheduleEntries?.length) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--text-secondary);">Choose a technician and date to generate a planned route.</td></tr>';
        return;
    }

    tbody.innerHTML = plan.scheduleEntries.map(entry => {
        const navigateUrl = buildSingleStopNavigationUrl(entry.site);
        return `
            <tr>
                <td>${entry.stopNumber}</td>
                <td><span class="route-day-chip">Day ${entry.dayIndex + 1}<small>${escapeHtml(entry.stopDate)}</small></span></td>
                <td><div class="route-job-stack">${entry.siteSummary.titleHtml}</div></td>
                <td>${escapeHtml(entry.siteSummary.clientLabel)}</td>
                <td>
                    <div class="route-site-cell">
                        <strong>${escapeHtml(entry.site.name)}</strong>
                        <span>${formatDistance(entry.travelProfile.roadDistanceKm)} leg</span>
                    </div>
                </td>
                <td>${formatScheduleMoment(entry.arrivalMinute)}</td>
                <td>${formatScheduleMoment(entry.workStartMinute)} - ${formatScheduleMoment(entry.workEndMinute)}</td>
                <td>${escapeHtml(entry.siteSummary.technicianLabel)}</td>
                <td>${formatMinutesDuration(entry.travelProfile.driveMinutes)}</td>
                <td><span class="route-status-pill route-status-${entry.siteSummary.statusTone}">${escapeHtml(entry.siteSummary.statusLabel)}</span></td>
                <td><a class="route-inline-link" href="${navigateUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-location-arrow"></i> Open</a></td>
            </tr>
        `;
    }).join('');
}

function renderRouteOverlay(plan) {
    clearCurrentRouteOverlay();
    if (!mapInstance || !plan?.daySummaries?.length) return;

    const layers = [];
    plan.daySummaries.forEach(day => {
        const points = [];
        const previousDay = plan.daySummaries[day.dayIndex - 1];
        const overnightStartSite = previousDay?.entries?.length
            ? previousDay.entries[previousDay.entries.length - 1].site
            : null;
        const startPoint = overnightStartSite
            ? [overnightStartSite.latitude, overnightStartSite.longitude]
            : [BASE_LOCATION.lat, BASE_LOCATION.lng];

        if (day.entries.length) {
            points.push(startPoint);
            day.entries.forEach(entry => points.push([entry.site.latitude, entry.site.longitude]));
            if (day.includesReturnToBase) {
                points.push([BASE_LOCATION.lat, BASE_LOCATION.lng]);
            }
        } else if (day.includesReturnToBase && overnightStartSite) {
            points.push(startPoint);
            points.push([BASE_LOCATION.lat, BASE_LOCATION.lng]);
        }

        if (points.length >= 2) {
            layers.push(L.polyline(points, {
                color: ROUTE_DAY_COLORS[day.dayIndex % ROUTE_DAY_COLORS.length],
                weight: 5,
                opacity: 0.92,
                dashArray: day.entries.length > 1 ? null : '10,8'
            }));
        }
    });

    currentRouteOverlay = L.featureGroup(layers).addTo(mapInstance);
    if (layers.length) {
        mapInstance.fitBounds(currentRouteOverlay.getBounds().pad(0.28));
    }
}

function renderRouteResults(plan) {
    const placeholder = document.getElementById('route-results-placeholder');
    const resultsArea = document.getElementById('route-results');
    if (!resultsArea) return;

    if (placeholder) placeholder.style.display = 'none';
    resultsArea.style.display = 'block';

    const mapsUrl = buildGoogleMapsRouteUrl(plan.route);
    const bufferLabel = plan.overtimeMinutes
        ? `${formatMinutesDuration(plan.overtimeMinutes)} overtime`
        : `${formatMinutesDuration(plan.remainingMinutes)} buffer`;
    const bufferTone = plan.overtimeMinutes ? 'route-status-warning' : 'route-status-success';
    const plannerRecommendation = plan.requiresOvernight
        ? 'This route should be treated as a multi-day field trip with overnight stop planning.'
        : plan.overtimeMinutes
            ? 'The route fits the work but pushes past the 16:30 finish. Consider splitting one stop.'
            : 'This route fits inside the 08:00 - 16:30 technician day.';

    lastRoutePlanSummary = buildRouteSummaryText(plan);

    resultsArea.innerHTML = `
        <div class="route-summary-shell">
            <div class="route-summary-top">
                <div>
                    <span class="jobs-board-kicker">Trip Planner</span>
                    <h3>${escapeHtml(plan.planName || plan.technicianName)}${plan.planDate ? ` <span class="route-plan-date-badge">${escapeHtml(plan.planDate)}${plan.selectedEndDate && plan.selectedEndDate !== plan.planDate ? ` to ${escapeHtml(plan.selectedEndDate)}` : ''}</span>` : ''}</h3>
                    <p>${plannerRecommendation}</p>
                </div>
                <div class="route-summary-actions">
                    <a class="btn btn-small" href="${mapsUrl}" target="_blank" rel="noopener noreferrer"><i class="fas fa-route"></i> Open In Google Maps</a>
                    <button class="btn btn-primary btn-small" onclick="copyCurrentRouteSummary()"><i class="fas fa-copy"></i> Copy Day Plan</button>
                </div>
            </div>

            <div class="route-stat-grid">
                <div class="route-stat-card">
                    <span>Total Travel</span>
                    <strong>${formatMinutesDuration(plan.totalTravelMinutes)}</strong>
                    <small>${formatDistance(plan.totalRoadDistanceKm)} estimated road distance</small>
                </div>
                <div class="route-stat-card">
                    <span>Total Work</span>
                    <strong>${formatMinutesDuration(plan.totalWorkMinutes)}</strong>
                    <small>${plan.scheduleEntries.length} site stop${plan.scheduleEntries.length === 1 ? '' : 's'}</small>
                </div>
                <div class="route-stat-card">
                    <span>Return To Base</span>
                    <strong>${escapeHtml(plan.returnDate)} ${formatScheduleMoment(plan.returnToBaseMinute)}</strong>
                    <small class="${bufferTone}">${bufferLabel}</small>
                </div>
                <div class="route-stat-card">
                    <span>Trip Type</span>
                    <strong>${escapeHtml(plan.tripClassification)}</strong>
                    <small>${plan.daysRequired} day${plan.daysRequired === 1 ? '' : 's'} planned • ${plan.overnightBreaks} overnight break${plan.overnightBreaks === 1 ? '' : 's'}</small>
                </div>
            </div>

            <div class="route-day-summary-grid">
                ${plan.daySummaries.map(day => `
                    <div class="route-day-card">
                        <div class="route-day-card-top">
                            <strong>Day ${day.dayIndex + 1}</strong>
                            <span>${escapeHtml(day.date)}</span>
                        </div>
                        <div class="route-day-card-metrics">
                            <span>${formatMinutesDuration(day.dayTravelMinutes)} travel</span>
                            <span>${formatMinutesDuration(day.dayWorkMinutes)} work</span>
                            <span>${day.entries.length} stop${day.entries.length === 1 ? '' : 's'}</span>
                        </div>
                        <div class="route-day-card-eta">${day.entries.length ? `First arrival ${formatScheduleMoment(day.firstArrival)}` : 'Travel day / return day'}</div>
                    </div>
                `).join('')}
            </div>

            <div class="route-timeline">
                <div class="route-timeline-item route-timeline-base">
                    <div class="route-timeline-dot"></div>
                    <div class="route-timeline-copy">
                        <strong>Depart base</strong>
                        <span>${BASE_LOCATION.name}</span>
                    </div>
                    <div class="route-timeline-time">${escapeHtml(plan.planDate)} ${formatScheduleMoment(WORKDAY_START_MINUTES)}</div>
                </div>
                ${plan.daySummaries.map(day => `
                    <div class="route-day-divider">
                        <span>Day ${day.dayIndex + 1}</span>
                        <small>${escapeHtml(day.date)}</small>
                    </div>
                    ${day.entries.map(entry => `
                        <div class="route-timeline-item">
                            <div class="route-timeline-dot"></div>
                            <div class="route-timeline-copy">
                                <strong>${escapeHtml(entry.site.name)}</strong>
                                <span>${escapeHtml(entry.siteSummary.clientLabel)} &bull; ${formatMinutesDuration(entry.travelProfile.driveMinutes)} drive &bull; ${formatMinutesDuration(entry.workMinutes)} work</span>
                            </div>
                            <div class="route-timeline-time">
                                <span>${formatScheduleMoment(entry.arrivalMinute)}</span>
                                <small>${formatScheduleMoment(entry.workStartMinute)} - ${formatScheduleMoment(entry.workEndMinute)}</small>
                            </div>
                        </div>
                    `).join('')}
                `).join('')}
                <div class="route-timeline-item route-timeline-base">
                    <div class="route-timeline-dot"></div>
                    <div class="route-timeline-copy">
                        <strong>Return to base</strong>
                        <span>${formatMinutesDuration(plan.returnTravelProfile.driveMinutes)} drive back to ${BASE_LOCATION.address}</span>
                    </div>
                    <div class="route-timeline-time">${escapeHtml(plan.returnDate)} ${formatScheduleMoment(plan.returnToBaseMinute)}</div>
                </div>
            </div>
        </div>
    `;
}

function renderEmptyRouteState(message) {
    currentRoutePlan = null;
    lastRoutePlanSummary = '';
    renderPlannedRouteTable(null);
    clearCurrentRouteOverlay();

    const resultsArea = document.getElementById('route-results');
    const placeholder = document.getElementById('route-results-placeholder');
    if (resultsArea) resultsArea.style.display = 'none';
    if (placeholder) {
        placeholder.style.display = 'block';
        placeholder.innerHTML = `
            <i class="fas fa-route" style="font-size: 2.5rem; margin-bottom: 16px; display: block; opacity: 0.2;"></i>
            <p>${escapeHtml(message)}</p>
        `;
    }
}

async function loadRoutePlanningOptions() {
    const techSelect = document.getElementById('route-tech-select');
    const dateInput = document.getElementById('route-plan-date');
    const endDateInput = document.getElementById('route-plan-end-date');
    if (!techSelect) return;

    const currentTechValue = techSelect.value;
    const { data: techs, error } = await window.supabaseClient
        .from('users')
        .select('id, username')
        .eq('role', 'technician')
        .order('username');

    if (error) throw error;

    techSelect.innerHTML = '<option value="">Select technician</option>' +
        (techs || []).map(tech => `<option value="${tech.id}">${escapeHtml(tech.username)}</option>`).join('');

    if (currentTechValue) techSelect.value = currentTechValue;
    if (dateInput && !dateInput.value) dateInput.value = new Date().toISOString().split('T')[0];
    if (endDateInput && !endDateInput.value) endDateInput.value = dateInput?.value || new Date().toISOString().split('T')[0];
}

async function loadSavedTripPlans() {
    const list = document.getElementById('saved-trip-plans-list');
    if (!list) return;

    if (!tripPlanTableAvailable) {
        list.innerHTML = `
            <div class="route-saved-trip-empty">
                <i class="fas fa-database"></i>
                <p>Saved trips need the latest database schema. Run the updated <code>database_schema.sql</code> in Supabase first.</p>
            </div>
        `;
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('trip_plans')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) {
            if (/trip_plans/i.test(error.message || '')) {
                tripPlanTableAvailable = false;
                return loadSavedTripPlans();
            }
            throw error;
        }

        loadedTripPlans = data || [];
        renderSavedTripPlans();
    } catch (err) {
        console.error('Load trip plans error:', err);
        list.innerHTML = `
            <div class="route-saved-trip-empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Could not load saved trips right now.</p>
            </div>
        `;
    }
}

function renderSavedTripPlans() {
    const list = document.getElementById('saved-trip-plans-list');
    if (!list) return;

    if (!loadedTripPlans.length) {
        list.innerHTML = `
            <div class="route-saved-trip-empty">
                <i class="fas fa-map-signs"></i>
                <p>Build and save a route to create your first trip plan.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = loadedTripPlans.map(plan => {
        const statusTone = getTripPlanStatusTone(plan.status);
        const routePayload = plan.route_payload || {};
        const daysRequired = routePayload.daysRequired || plan.planned_days || 1;
        const stopsCount = Array.isArray(routePayload.scheduleEntries) ? routePayload.scheduleEntries.length : 0;
        return `
            <article class="route-saved-trip-card ${editingTripPlanId === plan.id ? 'route-saved-trip-card-active' : ''}">
                <div class="route-saved-trip-top">
                    <div>
                        <span class="route-saved-trip-name">${escapeHtml(plan.plan_name || `${plan.technician_name || 'Trip'} route`)}</span>
                        <p>${escapeHtml(plan.technician_name || 'Technician')} • ${escapeHtml(plan.start_date || '')}${plan.end_date ? ` to ${escapeHtml(plan.end_date)}` : ''}</p>
                    </div>
                    <span class="route-status-pill route-status-${statusTone}">${escapeHtml(String(plan.status || 'planned').replace('_', ' '))}</span>
                </div>
                <div class="route-saved-trip-metrics">
                    <span>${daysRequired} day${daysRequired === 1 ? '' : 's'}</span>
                    <span>${stopsCount} stop${stopsCount === 1 ? '' : 's'}</span>
                    <span>${formatDistance(plan.total_distance_km || routePayload.totalRoadDistanceKm || 0)}</span>
                </div>
                <div class="route-saved-trip-actions">
                    <button class="btn btn-small" onclick="loadTripPlanForEdit('${plan.id}')"><i class="fas fa-pen"></i> Edit</button>
                    <button class="btn btn-small" onclick="previewSavedTripPlan('${plan.id}')"><i class="fas fa-eye"></i> Preview</button>
                    <button class="btn btn-small" onclick="updateTripPlanStatus('${plan.id}', 'in_progress')"><i class="fas fa-play"></i> Start</button>
                    <button class="btn btn-small" onclick="updateTripPlanStatus('${plan.id}', 'paused')"><i class="fas fa-pause"></i> Pause</button>
                    <button class="btn btn-small" onclick="updateTripPlanStatus('${plan.id}', 'completed')"><i class="fas fa-check"></i> Complete</button>
                    <button class="btn btn-small btn-danger" onclick="deleteTripPlan('${plan.id}')"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </article>
        `;
    }).join('');
}

function initializeRoutePlannerInteractions() {
    if (routePlannerInteractionsBound) return;

    const startDateInput = document.getElementById('route-plan-date');
    const endDateInput = document.getElementById('route-plan-end-date');

    if (startDateInput && endDateInput) {
        startDateInput.addEventListener('change', () => {
            if (!endDateInput.value || endDateInput.value < startDateInput.value) {
                endDateInput.value = startDateInput.value;
            }
        });
    }

    routePlannerInteractionsBound = true;
}

function setEditTripState(isEditing) {
    const cancelBtn = document.getElementById('route-edit-cancel-btn');
    if (cancelBtn) cancelBtn.style.display = isEditing ? 'inline-flex' : 'none';
}

function getCurrentUserDisplayName() {
    if (window.currentUserProfile?.username) return window.currentUserProfile.username;
    if (window.currentUser?.email) return window.currentUser.email;
    return 'System';
}

function collectPlanInputs() {
    const planName = document.getElementById('route-plan-name')?.value?.trim() || '';
    const technicianId = document.getElementById('route-tech-select')?.value || '';
    const technicianName = document.getElementById('route-tech-select')?.selectedOptions?.[0]?.textContent?.trim() || '';
    const planDate = document.getElementById('route-plan-date')?.value || '';
    const planEndDate = document.getElementById('route-plan-end-date')?.value || planDate;
    const daySpan = calculateInclusiveDaySpan(planDate, planEndDate);

    return {
        planName,
        technicianId,
        technicianName,
        planDate,
        planEndDate,
        daySpan
    };
}

function resolveSelectedRouteSiteIds(fallbackIds = []) {
    const checkedIds = Array.from(document.querySelectorAll('input[name="route-site"]:checked')).map(cb => cb.value);
    return checkedIds.length ? checkedIds : fallbackIds;
}

async function saveCurrentTripPlan() {
    if (!tripPlanTableAvailable) {
        showRouteToast('Run the latest database schema first so saved trip plans are available.', 'error');
        return;
    }

    if (!currentRoutePlan?.scheduleEntries?.length) {
        showRouteToast('Build a trip plan before saving it.', 'info');
        return;
    }

    const inputs = collectPlanInputs();
    const effectiveName = inputs.planName || currentRoutePlan.planName || `${currentRoutePlan.technicianName} ${currentRoutePlan.planDate} trip`;
    const payload = {
        plan_name: effectiveName,
        technician_user_id: inputs.technicianId || currentRoutePlan.technicianId || '',
        technician_name: inputs.technicianName || currentRoutePlan.technicianName,
        start_date: currentRoutePlan.planDate,
        end_date: currentRoutePlan.returnDate,
        planned_days: currentRoutePlan.daysRequired,
        status: editingTripPlanId ? undefined : 'planned',
        total_travel_minutes: currentRoutePlan.totalTravelMinutes,
        total_work_minutes: currentRoutePlan.totalWorkMinutes,
        total_distance_km: Number(currentRoutePlan.totalRoadDistanceKm.toFixed(2)),
        selected_site_ids: resolveSelectedRouteSiteIds(currentRoutePlan.route.map(site => String(site.id))),
        route_payload: currentRoutePlan,
        map_link: buildGoogleMapsRouteUrl(currentRoutePlan.route),
        created_by: getCurrentUserDisplayName()
    };

    if (payload.status === undefined) delete payload.status;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, editingTripPlanId ? 'Updating trip plan...' : 'Saving trip plan...');

        const query = editingTripPlanId
            ? window.supabaseClient.from('trip_plans').update(payload).eq('id', editingTripPlanId).select().single()
            : window.supabaseClient.from('trip_plans').insert(payload).select().single();

        const { data, error } = await query;
        if (error) {
            if (/trip_plans/i.test(error.message || '')) {
                tripPlanTableAvailable = false;
            }
            throw error;
        }

        editingTripPlanId = data?.id || editingTripPlanId;
        if (data?.plan_name) {
            document.getElementById('route-plan-name').value = data.plan_name;
        }
        setEditTripState(Boolean(editingTripPlanId));
        await loadSavedTripPlans();
        showRouteToast(editingTripPlanId ? 'Trip plan updated successfully.' : 'Trip plan saved successfully.', 'success');
    } catch (err) {
        console.error('Save trip plan error:', err);
        showRouteToast(`Could not save the trip plan: ${err.message}`, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function updateTripPlanStatus(planId, status) {
    if (!tripPlanTableAvailable) {
        showRouteToast('Saved trip plans need the latest database schema.', 'error');
        return;
    }

    const patch = { status };
    if (status === 'in_progress') patch.started_at = new Date().toISOString();
    if (status === 'paused') patch.paused_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();

    try {
        const { error } = await window.supabaseClient.from('trip_plans').update(patch).eq('id', planId);
        if (error) throw error;
        await loadSavedTripPlans();
        showRouteToast(`Trip marked ${String(status).replace('_', ' ')}.`, 'success');
    } catch (err) {
        console.error('Update trip status error:', err);
        showRouteToast(`Could not update the trip status: ${err.message}`, 'error');
    }
}

async function deleteTripPlan(planId) {
    if (!tripPlanTableAvailable) {
        showRouteToast('Saved trip plans need the latest database schema.', 'error');
        return;
    }

    const confirmed = window.confirm('Delete this saved trip plan? This will remove the stored route but not the jobs.');
    if (!confirmed) return;

    try {
        const { error } = await window.supabaseClient.from('trip_plans').delete().eq('id', planId);
        if (error) throw error;
        if (editingTripPlanId === planId) cancelTripPlanEdit();
        await loadSavedTripPlans();
        showRouteToast('Trip plan deleted.', 'success');
    } catch (err) {
        console.error('Delete trip plan error:', err);
        showRouteToast(`Could not delete the trip plan: ${err.message}`, 'error');
    }
}

function previewSavedTripPlan(planId) {
    const savedPlan = loadedTripPlans.find(item => String(item.id) === String(planId));
    if (!savedPlan?.route_payload?.scheduleEntries?.length) {
        showRouteToast('That saved trip does not have a route payload to preview.', 'info');
        return;
    }

    currentRoutePlan = savedPlan.route_payload;
    renderPlannedRouteTable(currentRoutePlan);
    renderRouteResults(currentRoutePlan);
    renderRouteOverlay(currentRoutePlan);
    showRouteToast('Saved trip preview loaded on the map.', 'success');
}

async function loadTripPlanForEdit(planId) {
    const savedPlan = loadedTripPlans.find(item => String(item.id) === String(planId));
    if (!savedPlan) {
        showRouteToast('That trip plan could not be found.', 'error');
        return;
    }

    editingTripPlanId = planId;
    setEditTripState(true);

    document.getElementById('route-plan-name').value = savedPlan.plan_name || '';
    document.getElementById('route-plan-date').value = savedPlan.start_date || '';
    document.getElementById('route-plan-end-date').value = savedPlan.end_date || savedPlan.route_payload?.returnDate || savedPlan.start_date || '';
    document.getElementById('route-tech-select').value = savedPlan.technician_user_id || '';

    const preselectedIds = Array.isArray(savedPlan.selected_site_ids)
        ? savedPlan.selected_site_ids.map(String)
        : Array.isArray(savedPlan.route_payload?.route)
            ? savedPlan.route_payload.route.map(site => String(site.id))
            : [];

    renderRouteSiteChecklist(preselectedIds);

    const previewPayload = savedPlan.route_payload;
    if (previewPayload?.scheduleEntries?.length) {
        currentRoutePlan = previewPayload;
        renderPlannedRouteTable(previewPayload);
        renderRouteResults(previewPayload);
        renderRouteOverlay(previewPayload);
    }

    showRouteToast('Trip plan loaded for editing. Rebuild or save after making changes.', 'success');
}

function cancelTripPlanEdit() {
    editingTripPlanId = null;
    setEditTripState(false);
    const nameInput = document.getElementById('route-plan-name');
    if (nameInput) nameInput.value = '';
    showRouteToast('Trip edit mode cleared.', 'info');
}

async function loadMapData() {
    if (!window.L) return;

    if (!mapInstance) {
        const container = document.getElementById('map-container');
        if (!container) return;
        mapInstance = L.map('map-container').setView([BASE_LOCATION.lat, BASE_LOCATION.lng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(mapInstance);
    }

    try {
        const [sitesResult, clientsResult] = await Promise.all([
            window.supabaseClient.from('sites').select('*'),
            window.supabaseClient.from('clients').select('id, company_name, client_name')
        ]);

        if (sitesResult.error) throw sitesResult.error;
        if (clientsResult.error) throw clientsResult.error;

        const clientsById = new Map((clientsResult.data || []).map(client => [String(client.id), client]));
        loadedSites = [
            ...DEMO_SITES,
            ...(sitesResult.data || []).map(site => ({
                ...site,
                company_name: clientsById.get(String(site.client_id))?.company_name || clientsById.get(String(site.client_id))?.client_name || ''
            }))
        ];

        mapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline || layer instanceof L.LayerGroup) {
                mapInstance.removeLayer(layer);
            }
        });

        const homeMarker = L.marker([BASE_LOCATION.lat, BASE_LOCATION.lng], {
            icon: L.divIcon({
                className: 'home-marker',
                html: '<div style="background: #2563eb; width: 14px; height: 14px; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.24);"></div>',
                iconSize: [20, 20]
            })
        }).addTo(mapInstance);
        homeMarker.bindPopup(`<b>${BASE_LOCATION.name}</b><br>${BASE_LOCATION.address}`);

        loadedSites.forEach(site => {
            if (!site.latitude || !site.longitude) return;
            const travelProfile = estimateTravelProfile(getDistance(BASE_LOCATION.lat, BASE_LOCATION.lng, site.latitude, site.longitude));
            const marker = L.marker([site.latitude, site.longitude]).addTo(mapInstance);
            marker.bindPopup(`
                <div class="map-popup">
                    <strong>${escapeHtml(site.name)}</strong><br>
                    <span class="popup-sub">${escapeHtml(site.company_name || '')}</span>
                    <div class="popup-meta">
                        <span>${formatDistance(travelProfile.roadDistanceKm)} from base</span><br>
                        <span class="text-blue">~${formatMinutesDuration(travelProfile.driveMinutes)} travel</span><br>
                        <span>${escapeHtml(travelProfile.zoneLabel)}</span>
                    </div>
                </div>
            `);
        });

        renderRouteSiteChecklist();
        renderPlannedRouteTable(null);
        await loadRoutePlanningOptions();
        initializeRoutePlannerInteractions();
        await loadSavedTripPlans();

        const allPoints = [
            L.latLng(BASE_LOCATION.lat, BASE_LOCATION.lng),
            ...loadedSites.filter(site => site.latitude && site.longitude).map(site => L.latLng(site.latitude, site.longitude))
        ];
        if (allPoints.length > 1) {
            mapInstance.fitBounds(L.latLngBounds(allPoints).pad(0.2));
        }
    } catch (err) {
        console.error('Error loading map points:', err);
        showRouteToast(`Could not load client sites: ${err.message}`, 'error');
    }
}

async function buildTechnicianRoutePlan() {
    const inputs = collectPlanInputs();
    if (!inputs.technicianId || !inputs.planDate || !inputs.planEndDate) {
        showRouteToast('Select a technician, start date, and end date first.', 'info');
        return;
    }

    if (inputs.planEndDate < inputs.planDate) {
        showRouteToast('The end date must be on or after the start date.', 'error');
        return;
    }

    try {
        if (typeof fetchJobsDataset !== 'function') {
            throw new Error('Jobs dataset helper is not available.');
        }

        if (typeof setGlobalLoading === 'function') {
            setGlobalLoading(true, 'Building technician route...');
        }

        const jobs = await fetchJobsDataset();
        const selectedDates = new Set(getIsoDateRange(inputs.planDate, inputs.daySpan));

        plannedRouteJobs = jobs.filter(job => {
            const matchesTech = Array.isArray(job.job_assignments) &&
                job.job_assignments.some(assignment => String(assignment.tech_id) === String(inputs.technicianId));

            return Boolean(
                job.status !== 'Completed' &&
                selectedDates.has(job.scheduled_date) &&
                matchesTech &&
                job.site_id
            );
        });

        const defaultSiteIds = [...new Set(plannedRouteJobs.map(job => String(job.site_id)).filter(Boolean))];
        const preserveIds = editingTripPlanId
            ? resolveSelectedRouteSiteIds(defaultSiteIds)
            : defaultSiteIds;

        renderRouteSiteChecklist(preserveIds);

        if (!plannedRouteJobs.length) {
            renderEmptyRouteState('No assigned site jobs were found for this technician in the selected date range.');
            showRouteToast('No assigned jobs found for that technician in the selected date range.', 'info');
            return;
        }

        const mappableSites = loadedSites.filter(site => preserveIds.includes(String(site.id)) && site.latitude && site.longitude);
        if (!mappableSites.length) {
            renderEmptyRouteState('Assigned jobs were found, but the linked sites do not yet have map coordinates.');
            showRouteToast('Those jobs need site coordinates before route guidance can be built.', 'error');
            return;
        }

        await optimizeSelectedRoute({
            selectedIds: preserveIds,
            routeJobs: plannedRouteJobs,
            technicianId: inputs.technicianId,
            technicianName: inputs.technicianName || plannedRouteJobs[0]?.technicianDisplayName || 'Technician',
            planDate: inputs.planDate,
            planEndDate: inputs.planEndDate,
            daySpan: inputs.daySpan,
            planName: inputs.planName
        });

        showRouteToast('Technician route plan is ready.', 'success');
    } catch (err) {
        console.error('Build technician route plan error:', err);
        showRouteToast(`Could not build the technician route plan: ${err.message}`, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') {
            setGlobalLoading(false);
        }
    }
}

async function optimizeSelectedRoute(options = {}) {
    const selectedIds = options.selectedIds || Array.from(document.querySelectorAll('input[name="route-site"]:checked')).map(cb => cb.value);
    if (!selectedIds.length) {
        showRouteToast('Select at least one site to calculate a route.', 'info');
        return;
    }

    const routeJobs = options.routeJobs || plannedRouteJobs;
    const selectedSites = loadedSites.filter(site => selectedIds.includes(String(site.id)) && site.latitude && site.longitude);
    if (!selectedSites.length) {
        showRouteToast('The selected sites do not have valid coordinates for route planning.', 'error');
        return;
    }

    let currentPos = { lat: BASE_LOCATION.lat, lng: BASE_LOCATION.lng };
    const unvisited = [...selectedSites];
    const route = [];

    while (unvisited.length > 0) {
        let closest = null;
        let closestIdx = -1;
        let closestDrive = Infinity;

        unvisited.forEach((site, idx) => {
            const driveMinutes = estimateTravelProfile(getDistance(currentPos.lat, currentPos.lng, site.latitude, site.longitude)).driveMinutes;
            if (driveMinutes < closestDrive) {
                closest = site;
                closestIdx = idx;
                closestDrive = driveMinutes;
            }
        });

        route.push(closest);
        currentPos = { lat: closest.latitude, lng: closest.longitude };
        unvisited.splice(closestIdx, 1);
    }

    currentRoutePlan = buildScheduleForRoute(route, routeJobs, {
        technicianId: options.technicianId,
        technicianName: options.technicianName,
        planDate: options.planDate,
        daySpan: options.daySpan,
        planName: options.planName
    });

    renderPlannedRouteTable(currentRoutePlan);
    renderRouteResults(currentRoutePlan);
    renderRouteOverlay(currentRoutePlan);
}

async function copyCurrentRouteSummary() {
    if (!lastRoutePlanSummary) {
        showRouteToast('Build a route first so there is something to copy.', 'info');
        return;
    }

    try {
        await navigator.clipboard.writeText(lastRoutePlanSummary);
        showRouteToast('Route summary copied to clipboard.', 'success');
    } catch (err) {
        console.error('Copy route summary error:', err);
        showRouteToast('Could not copy the route summary from this browser.', 'error');
    }
}

window.loadMapData = loadMapData;
window.buildTechnicianRoutePlan = buildTechnicianRoutePlan;
window.optimizeSelectedRoute = optimizeSelectedRoute;
window.copyCurrentRouteSummary = copyCurrentRouteSummary;
window.saveCurrentTripPlan = saveCurrentTripPlan;
window.cancelTripPlanEdit = cancelTripPlanEdit;
window.loadTripPlanForEdit = loadTripPlanForEdit;
window.previewSavedTripPlan = previewSavedTripPlan;
window.updateTripPlanStatus = updateTripPlanStatus;
window.deleteTripPlan = deleteTripPlan;
