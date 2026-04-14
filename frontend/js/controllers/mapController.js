let mapInstance = null;
let currentRoutePolyline = null;
let loadedSites = [];
let plannedRouteJobs = [];
const BASE_LOCATION = { lat: -26.0791773, lng: 28.1153817, name: 'Home Base (Fairbridge Tech)' };

function formatRouteDuration(totalHours) {
    if (typeof formatDurationDisplay === 'function') {
        return formatDurationDisplay(totalHours);
    }

    const normalized = Math.max(0, Number(totalHours) || 0);
    const days = Math.floor(normalized / 24);
    const hours = Number((normalized - (days * 24)).toFixed(1));
    return `${days}d ${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

const DEMO_SITES = [
    { id: 'demo-1', name: 'Marsing & Co', latitude: -25.9382, longitude: 27.9256, company_name: 'Marsing-SA', status: 'ACTIVE' },
    { id: 'demo-2', name: 'Marico SA', latitude: -26.1072, longitude: 28.0567, company_name: 'Marico', status: 'GOOD' },
    { id: 'demo-3', name: 'Topmed Scheme', latitude: -25.7481, longitude: 28.2381, company_name: 'Topmed', status: 'ACTIVE' }
];

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

function estimateTravelTime(distanceKm) {
    if (distanceKm === 0) return 0;
    const roadDistance = distanceKm * 1.3;
    const timeHrs = roadDistance / 45;
    return Math.round(timeHrs * 60);
}

function renderRouteSiteChecklist(preselectedIds = []) {
    const routeList = document.getElementById('route-site-list');
    if (!routeList) return;

    routeList.innerHTML = '';
    const plannedSiteIds = new Set(plannedRouteJobs.map(job => String(job.site_id)).filter(Boolean));

    loadedSites.forEach(site => {
        if (!site.latitude || !site.longitude) return;

        const row = document.createElement('label');
        row.className = 'route-site-row';
        const isChecked = preselectedIds.includes(String(site.id));
        const isPlanned = plannedSiteIds.has(String(site.id));
        row.innerHTML = `
            <input type="checkbox" name="route-site" value="${site.id}" ${isChecked ? 'checked' : ''}>
            <span class="route-site-name">${site.name}</span>
            ${isPlanned ? '<span class="badge badge-blue">Planned</span>' : ''}
        `;
        routeList.appendChild(row);
    });
}

async function loadRoutePlanningOptions() {
    const techSelect = document.getElementById('route-tech-select');
    const dateInput = document.getElementById('route-plan-date');
    if (!techSelect) return;

    const currentTechValue = techSelect.value;

    const { data: techs, error } = await window.supabaseClient
        .from('users')
        .select('id, username')
        .eq('role', 'technician')
        .order('username');

    if (error) throw error;

    techSelect.innerHTML = '<option value="">Select technician</option>' +
        (techs || []).map(tech => `<option value="${tech.id}">${tech.username}</option>`).join('');

    if (currentTechValue) {
        techSelect.value = currentTechValue;
    }

    if (dateInput && !dateInput.value) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
}

function renderPlannedRouteTable(route = [], routeMeta = []) {
    const tbody = document.getElementById('route-plan-table-body');
    if (!tbody) return;

    if (!route.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-secondary);">Choose a technician and date to generate a planned route.</td></tr>';
        return;
    }

    tbody.innerHTML = route.map((site, index) => {
        const siteJobs = routeMeta.filter(item => String(item.site_id) === String(site.id));
        const firstJob = siteJobs[0];
        const previousPoint = index === 0 ? BASE_LOCATION : route[index - 1];
        const driveMinutes = estimateTravelTime(getDistance(
            previousPoint.lat || previousPoint.latitude,
            previousPoint.lng || previousPoint.longitude,
            site.latitude,
            site.longitude
        ));

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${siteJobs.map(job => job.title).join('<br>') || 'Manual Stop'}</td>
                <td>${firstJob?.displayName || site.company_name || '-'}</td>
                <td>${site.name}</td>
                <td>${firstJob?.technicianDisplayName || '-'}</td>
                <td>${formatRouteDuration(siteJobs.reduce((sum, job) => sum + Number(job.estimated_duration_hours || 0), 0))}</td>
                <td>${firstJob?.status || '-'}</td>
                <td>${driveMinutes} mins</td>
            </tr>
        `;
    }).join('');
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

        const clientsById = new Map((clientsResult.data || []).map(client => [client.id, client]));
        loadedSites = [
            ...DEMO_SITES,
            ...(sitesResult.data || []).map(site => ({
                ...site,
                company_name: clientsById.get(site.client_id)?.company_name || clientsById.get(site.client_id)?.client_name || ''
            }))
        ];

        mapInstance.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                mapInstance.removeLayer(layer);
            }
        });

        const homeMarker = L.marker([BASE_LOCATION.lat, BASE_LOCATION.lng], {
            icon: L.divIcon({
                className: 'home-marker',
                html: '<div style="background: #3b82f6; width: 14px; height: 14px; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>',
                iconSize: [20, 20]
            })
        }).addTo(mapInstance);
        homeMarker.bindPopup(`<b>${BASE_LOCATION.name}</b><br>7 Electron Rd, Sandton`);

        loadedSites.forEach(site => {
            if (site.latitude && site.longitude) {
                const dist = getDistance(BASE_LOCATION.lat, BASE_LOCATION.lng, site.latitude, site.longitude);
                const travelTime = estimateTravelTime(dist);

                const marker = L.marker([site.latitude, site.longitude]).addTo(mapInstance);
                marker.bindPopup(`
                    <div class="map-popup">
                        <strong>${site.name}</strong><br>
                        <span class="popup-sub">${site.company_name || ''}</span>
                        <div class="popup-meta">
                            <span>${dist.toFixed(1)} km from base</span><br>
                            <span class="text-blue">~${travelTime} mins travel</span>
                        </div>
                    </div>
                `);
            }
        });

        renderRouteSiteChecklist();
        renderPlannedRouteTable();
        await loadRoutePlanningOptions();

        const allPoints = [
            L.latLng(BASE_LOCATION.lat, BASE_LOCATION.lng),
            ...loadedSites.filter(site => site.latitude && site.longitude).map(site => L.latLng(site.latitude, site.longitude))
        ];
        if (allPoints.length > 1) {
            mapInstance.fitBounds(L.latLngBounds(allPoints).pad(0.2));
        }
    } catch (err) {
        console.error('Error loading map points:', err);
    }
}

async function buildTechnicianRoutePlan() {
    const techId = document.getElementById('route-tech-select')?.value;
    const dateValue = document.getElementById('route-plan-date')?.value;

    if (!techId || !dateValue) {
        alert('Select a technician and date first.');
        return;
    }

    try {
        if (typeof fetchJobsDataset !== 'function') {
            throw new Error('Jobs dataset helper is not available.');
        }

        const jobs = await fetchJobsDataset();
        plannedRouteJobs = jobs.filter(job =>
            job.status !== 'Completed' &&
            job.scheduled_date === dateValue &&
            Array.isArray(job.job_assignments) &&
            job.job_assignments.some(assignment => assignment.tech_id === techId) &&
            job.site_id
        );

        const selectedSiteIds = [...new Set(plannedRouteJobs.map(job => String(job.site_id)).filter(Boolean))];
        renderRouteSiteChecklist(selectedSiteIds);

        if (!plannedRouteJobs.length) {
            renderPlannedRouteTable();
            const resultsArea = document.getElementById('route-results');
            const placeholder = document.getElementById('route-results-placeholder');
            if (resultsArea) resultsArea.style.display = 'none';
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = '<i class="fas fa-route" style="font-size: 2.5rem; margin-bottom: 16px; display: block; opacity: 0.2;"></i><p>No assigned site jobs found for this technician on the selected date.</p>';
            }
            return;
        }

        const mappableSites = loadedSites.filter(site => selectedSiteIds.includes(String(site.id)) && site.latitude && site.longitude);
        if (!mappableSites.length) {
            renderPlannedRouteTable();
            const resultsArea = document.getElementById('route-results');
            const placeholder = document.getElementById('route-results-placeholder');
            if (resultsArea) resultsArea.style.display = 'none';
            if (placeholder) {
                placeholder.style.display = 'block';
                placeholder.innerHTML = '<i class="fas fa-route" style="font-size: 2.5rem; margin-bottom: 16px; display: block; opacity: 0.2;"></i><p>Assigned jobs were found, but those sites do not yet have map coordinates.</p>';
            }
            return;
        }

        await optimizeSelectedRoute({
            selectedIds: mappableSites.map(site => String(site.id)),
            routeJobs: plannedRouteJobs,
            technicianName: plannedRouteJobs[0]?.technicianDisplayName || 'Technician',
            planDate: dateValue
        });
    } catch (err) {
        console.error('Build technician route plan error:', err);
        alert('Could not build the technician route plan: ' + err.message);
    }
}

async function optimizeSelectedRoute(options = {}) {
    const selectedIds = options.selectedIds || Array.from(document.querySelectorAll('input[name="route-site"]:checked')).map(cb => cb.value);
    if (selectedIds.length === 0) {
        alert('Please select at least one site to plan a route.');
        return;
    }

    const routeJobs = options.routeJobs || plannedRouteJobs;
    const selectedSites = loadedSites.filter(site => selectedIds.includes(String(site.id)) && site.latitude && site.longitude);

    if (!selectedSites.length) {
        alert('The selected jobs do not have valid site coordinates for route building.');
        return;
    }

    let currentPos = { lat: BASE_LOCATION.lat, lng: BASE_LOCATION.lng };
    let unvisited = [...selectedSites];
    let route = [];
    let totalDist = 0;
    let totalTravelTime = 0;

    while (unvisited.length > 0) {
        let closest = null;
        let closestDist = Infinity;
        let closestIdx = -1;

        unvisited.forEach((site, idx) => {
            const distance = getDistance(currentPos.lat, currentPos.lng, site.latitude, site.longitude);
            if (distance < closestDist) {
                closestDist = distance;
                closest = site;
                closestIdx = idx;
            }
        });

        route.push(closest);
        totalDist += closestDist;
        totalTravelTime += estimateTravelTime(closestDist);
        currentPos = { lat: closest.latitude, lng: closest.longitude };
        unvisited.splice(closestIdx, 1);
    }

    const returnDist = getDistance(currentPos.lat, currentPos.lng, BASE_LOCATION.lat, BASE_LOCATION.lng);
    totalDist += returnDist;
    totalTravelTime += estimateTravelTime(returnDist);

    const totalJobDurationHrs = route.reduce((sum, site) => {
        const siteJobs = routeJobs.filter(job => String(job.site_id) === String(site.id));
        const hours = siteJobs.reduce((innerSum, job) => innerSum + Number(job.estimated_duration_hours || 0), 0);
        return sum + hours;
    }, 0);
    const totalDayTimeMins = totalTravelTime + (totalJobDurationHrs * 60);

    if (currentRoutePolyline) mapInstance.removeLayer(currentRoutePolyline);
    const path = [
        [BASE_LOCATION.lat, BASE_LOCATION.lng],
        ...route.map(site => [site.latitude, site.longitude]),
        [BASE_LOCATION.lat, BASE_LOCATION.lng]
    ];
    currentRoutePolyline = L.polyline(path, { color: '#3b82f6', weight: 4, dashArray: '10, 10' }).addTo(mapInstance);
    mapInstance.fitBounds(currentRoutePolyline.getBounds().pad(0.3));

    renderPlannedRouteTable(route, routeJobs);

    const placeholder = document.getElementById('route-results-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const resultsArea = document.getElementById('route-results');
    if (resultsArea) {
        resultsArea.style.display = 'block';
        resultsArea.innerHTML = `
            <div style="display: flex; gap: 30px; margin-bottom: 24px; flex-wrap: wrap;">
                <div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Technician</span>
                    <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${options.technicianName || 'Manual Route'}</p>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Travel Time</span>
                    <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${totalTravelTime} mins</p>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Work Duration</span>
                    <p style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary);">${formatRouteDuration(totalJobDurationHrs)}</p>
                </div>
                <div>
                    <span style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Total Day</span>
                    <p style="font-weight: 700; font-size: 1.1rem; color: var(--accent-blue);">${formatRouteDuration(totalDayTimeMins / 60)}</p>
                </div>
            </div>

            <h4 style="margin-bottom: 12px; font-size: 0.9rem; font-weight: 600;">Visit Sequence${options.planDate ? ` for ${options.planDate}` : ''}:</h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="font-size: 0.8rem; padding: 10px; background: white; border-radius: 8px; border-left: 4px solid #3b82f6; display: flex; justify-content: space-between;">
                    <span><strong>1. Base:</strong> ${BASE_LOCATION.name}</span>
                    <span style="color: var(--text-secondary);">0m</span>
                </div>
                ${route.map((site, index) => {
                    const prev = index === 0 ? BASE_LOCATION : route[index - 1];
                    const drive = estimateTravelTime(getDistance(prev.latitude || prev.lat, prev.longitude || prev.lng, site.latitude, site.longitude));
                    const siteHours = routeJobs.filter(job => String(job.site_id) === String(site.id)).reduce((sum, job) => sum + Number(job.estimated_duration_hours || 0), 0);
                    return `
                        <div style="font-size: 0.8rem; padding: 10px; background: white; border-radius: 8px; border-left: 4px solid var(--accent-green); display: flex; justify-content: space-between; gap: 16px;">
                            <span><strong>${index + 2}. Client:</strong> ${site.name}</span>
                            <span style="color: var(--accent-blue);">+${drive}m drive • ${formatRouteDuration(siteHours)} work</span>
                        </div>
                    `;
                }).join('')}
                <div style="font-size: 0.8rem; padding: 10px; background: white; border-radius: 8px; border-left: 4px solid #3b82f6; display: flex; justify-content: space-between;">
                    <span><strong>${route.length + 2}. Return:</strong> Home Base</span>
                    <span style="color: var(--text-secondary);">+${estimateTravelTime(returnDist)}m drive</span>
                </div>
            </div>
        `;
    }
}