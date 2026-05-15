function escapePartnersHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function splitPartnerContactField(value) {
    return String(value || '')
        .split(/\r?\n/)
        .map(item => item.trim());
}

function parsePartnerContacts(contactPerson, contactEmail, contactPhone) {
    const names = splitPartnerContactField(contactPerson);
    const emails = splitPartnerContactField(contactEmail);
    const phones = splitPartnerContactField(contactPhone);
    const total = Math.max(names.length, emails.length, phones.length);
    const contacts = [];

    for (let index = 0; index < total; index += 1) {
        const contact = {
            name: names[index] || '',
            email: emails[index] || '',
            phone: phones[index] || ''
        };
        if (contact.name || contact.email || contact.phone) contacts.push(contact);
    }

    return contacts;
}

function serializePartnerContacts(contacts = []) {
    const normalized = contacts
        .map(contact => ({
            name: String(contact?.name || '').trim(),
            email: String(contact?.email || '').trim(),
            phone: String(contact?.phone || '').trim()
        }))
        .filter(contact => contact.name || contact.email || contact.phone);

    return {
        contact_person: normalized.length ? normalized.map(contact => contact.name).join('\n') : null,
        contact_email: normalized.length ? normalized.map(contact => contact.email).join('\n') : null,
        contact_phone: normalized.length ? normalized.map(contact => contact.phone).join('\n') : null,
        contacts: normalized
    };
}

function getPartnerPrimaryContactLine(contact) {
    if (!contact) return '';
    return [contact.name, contact.email, contact.phone].filter(Boolean).join(' | ');
}

function getPartnerContactSummaryMarkup(client) {
    const contacts = parsePartnerContacts(client?.contact_person, client?.contact_email, client?.contact_phone);
    if (!contacts.length) return '';
    const primaryLine = getPartnerPrimaryContactLine(contacts[0]) || 'Primary contact';
    const extraCount = Math.max(0, contacts.length - 1);
    return `
        <div><i class="fas fa-user" style="margin-right: 4px;"></i> ${escapePartnersHtml(primaryLine)}</div>
        ${extraCount ? `<div><i class="fas fa-address-book" style="margin-right: 4px;"></i> +${extraCount} more contact${extraCount === 1 ? '' : 's'}</div>` : ''}
    `;
}

function collectPartnerContactRows(prefix) {
    const container = document.getElementById(`${prefix}ClientContactsList`);
    if (!container) return [];
    return [...container.querySelectorAll('.partners-contact-row')].map(row => ({
        name: row.querySelector('[data-contact-field="name"]')?.value?.trim() || '',
        email: row.querySelector('[data-contact-field="email"]')?.value?.trim() || '',
        phone: row.querySelector('[data-contact-field="phone"]')?.value?.trim() || ''
    }));
}

function renderPartnerContactRows(prefix, contacts = []) {
    const container = document.getElementById(`${prefix}ClientContactsList`);
    if (!container) return;

    const normalized = (contacts.length ? contacts : [{ name: '', email: '', phone: '' }]).map(contact => ({
        name: String(contact?.name || ''),
        email: String(contact?.email || ''),
        phone: String(contact?.phone || '')
    }));

    container.innerHTML = normalized.map((contact, index) => `
        <div class="partners-contact-row">
            <div class="partners-contact-row-top">
                <strong>Contact ${index + 1}</strong>
                <button type="button" class="btn btn-small" onclick="removePartnerContactRow('${prefix}', ${index})">Remove</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" class="form-control" data-contact-field="name" value="${escapePartnersHtml(contact.name)}" placeholder="Full name">
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" class="form-control" data-contact-field="email" value="${escapePartnersHtml(contact.email)}" placeholder="email@company.com">
                </div>
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="text" class="form-control" data-contact-field="phone" value="${escapePartnersHtml(contact.phone)}" placeholder="+27 ...">
            </div>
        </div>
    `).join('');
}

function addPartnerContactRow(prefix) {
    const contacts = collectPartnerContactRows(prefix);
    contacts.push({ name: '', email: '', phone: '' });
    renderPartnerContactRows(prefix, contacts);
}

function removePartnerContactRow(prefix, index) {
    const contacts = collectPartnerContactRows(prefix);
    contacts.splice(index, 1);
    renderPartnerContactRows(prefix, contacts);
}

async function loadPartnersData() {
    console.log("Loading Partners & Team Data...");
    const techList = document.getElementById('partners-tech-list');
    const clientList = document.getElementById('partners-client-list');
    const approvalList = document.getElementById('partners-approval-list');
    const canManagePartners = typeof hasAppPermission === 'function' ? hasAppPermission('canManagePartners') : true;

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading partners...');
        // 1. Load Technicians/Team
        const { data: techs, error: techsError } = await window.supabaseClient
            .from('users')
            .select('*')
            .order('username');
        
        if (techsError) throw techsError;

        techList.innerHTML = (techs || []).map(t => `
            <tr>
                <td>
                    <div class="partners-member-cell">
                        <div class="partners-avatar">${t.username ? t.username.substring(0,2).toUpperCase() : '??'}</div>
                        <div class="partners-member-meta">
                            <div class="partners-member-name">${t.username || 'Unnamed'}</div>
                            <div class="partners-member-email">${t.email}</div>
                        </div>
                    </div>
                </td>
                <td><span class="job-type-mini">${t.specialty || 'General'}</span></td>
                <td><span class="partners-role-chip">${t.role}</span></td>
                <td><span class="badge ${t.approval_status === 'approved' ? 'badge-green' : t.approval_status === 'pending' ? 'badge-yellow' : 'badge-red'}">${t.approval_status || t.status || 'active'}</span></td>
                <td>
                    ${canManagePartners ? `
                        <div class="partners-action-row">
                            <button class="btn btn-small partners-edit-btn" onclick="openEditUserModal('${t.id}', '${(t.username || '').replace(/'/g, "\\'")}', '${t.role}', '${t.specialty}')"><i class="fas fa-edit" style="margin-right:4px;"></i> Edit</button>
                            <button class="btn btn-small partners-delete-btn" onclick="deleteUser('${t.id}')"><i class="fas fa-trash" style="margin-right:4px;"></i> Delete</button>
                        </div>
                    ` : '<span class="partners-view-only">View Only</span>'}
                </td>
            </tr>
        `).join('');

        // 2. Load Clients
        const { data: clients, error: clientsError } = await window.supabaseClient
            .from('clients')
            .select('*')
            .order('client_name');
        
        if (clientsError) throw clientsError;

        const { data: sites, error: sitesError } = await window.supabaseClient
            .from('sites')
            .select('*');
        if (sitesError) throw sitesError;

        const clientGrid = document.getElementById('partners-client-grid');
        if (clientGrid) {
            clientGrid.innerHTML = (clients || []).map(c => {
                const clientSites = (sites || []).filter(s => s.client_id === c.id);
                const sitesJson = encodeURIComponent(JSON.stringify(clientSites));
                return `
                <div class="partners-client-card">
                    <div class="partners-client-card-top">
                        <div>
                            <div class="partners-client-name">${c.client_name}</div>
                            <div class="partners-client-industry"><i class="fas fa-industry" style="margin-right: 6px;"></i>${c.industry || 'No Industry Specified'}</div>
                        </div>
                        <span class="badge ${c.status === 'active' ? 'badge-green' : 'badge-orange'}">${c.status || 'active'}</span>
                    </div>
                    
                    <div class="partners-client-meta">
                        <div><i class="fas fa-map-marker-alt" style="margin-right: 4px; color: var(--primary-color);"></i> ${clientSites.length} Registered Sites</div>
                        ${getPartnerContactSummaryMarkup(c)}
                    </div>

                    <div class="partners-client-actions">
                        <button class="btn btn-small btn-white" onclick="viewClientSites('${sitesJson}', '${(c.client_name || '').replace(/'/g, "\\'")}', '${c.id}')">View Sites</button>
                        ${canManagePartners ? `
                            <button class="btn btn-small partners-edit-btn" onclick="openEditClientModal('${c.id}')"><i class="fas fa-edit" style="margin-right:4px;"></i> Edit</button>
                            <button class="btn btn-small partners-delete-btn" onclick="deleteClient('${c.id}')"><i class="fas fa-trash" style="margin-right:4px;"></i> Delete</button>
                        ` : ''}
                    </div>
                </div>
                `;
            }).join('');
        }

        if (approvalList) {
            approvalList.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">Signup approval is disabled. New users can sign up and sign in normally.</td></tr>';
        }

    } catch (err) {
        console.error("Partners Error:", err);
        if (typeof showToast === 'function') showToast('Failed to load partners: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

// --- CLIENT MODAL ---
function openAddClientModal() {
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('Your role can view Team & Partners, but cannot make changes.', 'error');
        return;
    }
    document.getElementById('addClientModal').style.display = 'flex';
    renderPartnerContactRows('new', [{ name: '', email: '', phone: '' }]);
    toggleClientSiteInputs();
}

function closeAddClientModal() {
    document.getElementById('addClientModal').style.display = 'none';
    document.querySelectorAll('#addClientFormWrapper input, #addClientFormWrapper textarea').forEach(el => el.value = '');
    renderPartnerContactRows('new', [{ name: '', email: '', phone: '' }]);
    toggleClientSiteInputs();
}

function toggleClientSiteInputs() {
    const mode = document.getElementById('newClientSiteMode')?.value || 'single';
    const primaryWrap = document.getElementById('newClientPrimarySiteWrap');
    const listWrap = document.getElementById('newClientSiteListWrap');
    const primaryInput = document.getElementById('newClientPrimarySite');
    const listInput = document.getElementById('newClientSiteList');

    if (primaryWrap) primaryWrap.style.display = mode === 'single' ? 'block' : 'none';
    if (listWrap) listWrap.style.display = mode === 'multiple' ? 'block' : 'none';
    
    // Set required attributes and clear unused inputs to avoid validation errors
    if (primaryInput) {
        primaryInput.required = mode === 'single';
        if (mode === 'multiple') primaryInput.value = '';
    }
    if (listInput) {
        listInput.required = mode === 'multiple';
        if (mode === 'single') listInput.value = '';
    }
}

window.toggleClientSiteInputs = toggleClientSiteInputs;

async function saveClientProfileFromScratch() {
    console.log("saveClientProfileFromScratch executing...");
    
    // Explicit value gathering
    const client_name_el = document.getElementById('newClientName');
    const industry_el = document.getElementById('newClientIndustry');
    if (!client_name_el) {
        if (typeof showToast === 'function') showToast('Critical Error: UI elements missing.', 'error');
        return;
    }
    
    let client_name = client_name_el.value.trim();
    let industry = industry_el ? industry_el.value.trim() : '';
    const contactPayload = serializePartnerContacts(collectPartnerContactRows('new'));

    if (!client_name) {
        if (typeof showToast === 'function') showToast('Client Name is absolutely required.', 'error');
        client_name_el.focus();
        return;
    }

    const siteMode = document.getElementById('newClientSiteMode')?.value || 'single';
    const primarySite = document.getElementById('newClientPrimarySite')?.value || '';
    const siteList = document.getElementById('newClientSiteList')?.value || '';

    const siteNames = siteMode === 'multiple'
        ? siteList.split(/\r?\n/).map(site => site.trim()).filter(Boolean)
        : [primarySite].filter(Boolean);

    if (!siteNames.length) {
        if (typeof showToast === 'function') showToast('Add at least one site for the client profile.', 'error');
        return;
    }

    const btn = document.getElementById('saveClientBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Saving...';
    }

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Injecting client directly...');
        
        const insertData = { 
            client_name, 
            company_name: client_name, 
            industry,
            contact_person: contactPayload.contact_person,
            contact_email: contactPayload.contact_email,
            contact_phone: contactPayload.contact_phone,
            status: 'active' 
        };

        const { data, error } = await window.supabaseClient
            .from('clients')
            .insert(insertData)
            .select();

        if (error) {
            throw new Error(error.message || "Database API refused insertion.");
        }

        if (data && data.length > 0) {
            const clientId = data[0].id;
            const sitesToInsert = siteNames.map(name => ({
                client_id: clientId,
                name,
                status: 'active'
            }));

            if (sitesToInsert.length > 0) {
                const { error: siteError } = await window.supabaseClient.from('sites').insert(sitesToInsert);
                if (siteError) {
                    throw new Error("Client saved perfectly, but Sites failed: " + (siteError.message || "Database error"));
                }
            }
        }

        if (typeof showToast === 'function') showToast('Client Profile Constructed!', 'success');
        if (typeof ensureJobReferenceData === 'function') {
            try { await ensureJobReferenceData(true); } catch(e) {}
        }
        closeAddClientModal();
        loadPartnersData();
    } catch (err) {
        console.error("Critical Direct Insert Error:", err);
        if (typeof showToast === 'function') showToast('Save Blocked: ' + err.message, 'error');
        alert("Failed to Save: " + err.message);
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Create Client Profile';
        }
    }
}

// --- USER MODAL ---
function openAddUserModal() {
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('Your role can view Team & Partners, but cannot make changes.', 'error');
        return;
    }
    document.getElementById('addUserModal').style.display = 'flex';
}

function closeAddUserModal() {
    document.getElementById('addUserModal').style.display = 'none';
    document.getElementById('addUserForm').reset();
}

async function submitNewUser(event) {
    event.preventDefault();
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('Your role can view Team & Partners, but cannot make changes.', 'error');
        return;
    }
    const submitButton = event.target.querySelector('button[type="submit"]');
    const username = document.getElementById('newUserName').value;
    const email = document.getElementById('newUserEmail').value;
    const password = document.getElementById('newUserPassword').value;
    const role = document.getElementById('newUserRole').value;
    const specialty = document.getElementById('newUserSpecialty').value;

    if (password.length < 6) {
        if (typeof showToast === 'function') showToast('Password must be at least 6 characters.', 'error');
        return;
    }

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerText = 'Creating user...';
        }
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Creating team member...');
        
        // Sign up user via RPC bypass
        const { data: authData, error: authError } = await window.supabaseClient.rpc('app_admin_create_user', {
            p_email: email,
            p_password: password,
            p_username: username,
            p_requested_role: role,
            p_phone_number: null
        });

        if (authError) {
            throw authError;
        }

        const newProfile = authData ? (authData.profile || authData[0]?.profile) : null;
        if (newProfile && newProfile.id) {
            const { error: updateError } = await window.supabaseClient
                .from('users')
                .update({ specialty })
                .eq('id', newProfile.id);
            if (updateError) console.error("Error updating specialty:", updateError);
        }

        if (typeof window.logAppActivity === 'function') {
            await window.logAppActivity({
                eventType: 'change',
                moduleName: 'partners',
                entityType: 'users',
                entityId: newProfile?.id || null,
                entityLabel: username || email,
                actionSummary: `Created a new team member account for ${username || email}.`,
                actionDetails: `Role: ${role || 'unknown'}. Specialty: ${specialty || 'General'}.`,
                changedFields: ['username', 'email', 'role', 'specialty'],
                metadata: {
                    source: 'app_admin_create_user',
                    created_user_email: email,
                    created_user_role: role,
                    created_user_specialty: specialty || 'General'
                }
            }).catch(error => console.warn('Team member audit logging failed:', error.message));
        }

        if (typeof showToast === 'function') showToast('Team member created successfully! They can now sign in.', 'success');
        if (typeof ensureJobReferenceData === 'function') await ensureJobReferenceData(true);
        closeAddUserModal();
        loadPartnersData();
    } catch (err) {
        let errorMsg = err.message;
        if (err.message?.includes('already registered')) {
            errorMsg = 'This email is already registered. Use a different email or sign in instead.';
        } else if (err.message?.includes('password')) {
            errorMsg = 'Password must be at least 6 characters.';
        }
        if (typeof showToast === 'function') showToast('Error: ' + errorMsg, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerText = 'Add Member';
        }
    }
}

async function deleteUser(id) {
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('You do not have permission to remove team members.', 'error');
        return;
    }
    if (!confirm("Are you sure you want to remove this member from the visible team list?")) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Removing team member...');
        const { error } = await window.supabaseClient.from('users').delete().eq('id', id);
        if (error) throw error;
        if (typeof showToast === 'function') showToast('Team member removed.', 'success');
        if (typeof ensureJobReferenceData === 'function') await ensureJobReferenceData(true);
        loadPartnersData();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

async function deleteClient(id) {
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('You do not have permission to delete clients.', 'error');
        return;
    }
    if (!confirm("Are you sure you want to delete this client? Saved jobs will be kept and detached from this client.")) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting client...');

        const { data: client, error: clientFetchError } = await window.supabaseClient
            .from('clients')
            .select('client_name, company_name')
            .eq('id', id)
            .maybeSingle();
        if (clientFetchError) throw clientFetchError;

        const clientName = client?.company_name || client?.client_name || 'Deleted client';
        const { data: sites, error: sitesFetchError } = await window.supabaseClient
            .from('sites')
            .select('id, name')
            .eq('client_id', id);
        if (sitesFetchError) throw sitesFetchError;

        const siteIds = (sites || []).map(site => site.id).filter(Boolean);
        const { data: clientJobs, error: clientJobsError } = await window.supabaseClient
            .from('jobs')
            .select('id, notes, site_id')
            .eq('client_id', id);
        if (clientJobsError) throw clientJobsError;

        let siteJobs = [];
        if (siteIds.length) {
            const { data, error } = await window.supabaseClient
                .from('jobs')
                .select('id, notes, site_id')
                .in('site_id', siteIds);
            if (error) throw error;
            siteJobs = data || [];
        }

        const affectedJobs = [...(clientJobs || []), ...siteJobs]
            .filter((job, index, jobs) => jobs.findIndex(item => item.id === job.id) === index);
        const sitesById = new Map((sites || []).map(site => [String(site.id), site.name || 'Deleted site']));

        for (const job of affectedJobs) {
            const notes = String(job.notes || '').trim();
            const detachedLine = `Detached Client Name: ${clientName}`;
            const siteName = job.site_id ? sitesById.get(String(job.site_id)) : '';
            const detachedSiteLine = siteName ? `Detached Site Name: ${siteName}` : '';
            const noteLines = [notes];
            if (!/^Detached Client Name:/im.test(notes)) noteLines.push(detachedLine);
            if (detachedSiteLine && !/^Detached Site Name:/im.test(notes)) noteLines.push(detachedSiteLine);
            const nextNotes = noteLines.filter(Boolean).join('\n');

            const { error: detachError } = await window.supabaseClient
                .from('jobs')
                .update({
                    client_id: null,
                    site_id: null,
                    notes: nextNotes
                })
                .eq('id', job.id);
            if (detachError) throw detachError;
        }

        const { error: deleteError } = await window.supabaseClient.from('sites').delete().eq('client_id', id);
        if (deleteError) throw deleteError;

        const { error: clientError } = await window.supabaseClient.from('clients').delete().eq('id', id);
        if (clientError) throw clientError;

        if (typeof showToast === 'function') showToast(`Client deleted. ${affectedJobs.length} saved job${affectedJobs.length === 1 ? '' : 's'} kept.`, 'success');
        if (typeof ensureJobReferenceData === 'function') await ensureJobReferenceData(true);
        loadPartnersData();
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.deleteClient = deleteClient;

async function approveUserAccess(userId) {
    if (typeof showToast === 'function') showToast('Signup approval is disabled. New users can sign in immediately after signup.', 'info');
}

async function rejectUserAccess(userId) {
    if (typeof showToast === 'function') showToast('Signup approval is disabled. Remove users from the team list if needed.', 'info');
}

let editingClientId = null;
let editingUserId = null;
let editingClientSites = [];

function normalizePartnerSiteName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function parsePartnerSiteNames(value) {
    return [...new Set(
        String(value || '')
            .split(/\r?\n/)
            .map(site => normalizePartnerSiteName(site))
            .filter(Boolean)
    )];
}

function renderEditClientSites() {
    const list = document.getElementById('editClientSitesList');
    if (!list) return;

    if (!editingClientSites.length) {
        list.innerHTML = '<div style="color: var(--text-secondary); font-size: 0.92rem;">No sites registered for this client yet.</div>';
        return;
    }

    list.innerHTML = editingClientSites.map((site, index) => `
        <div style="display:grid; grid-template-columns: 1fr auto; gap:12px; align-items:center; margin-bottom:10px;">
            <input
                type="text"
                class="form-control"
                value="${String(site.name || '').replace(/"/g, '&quot;')}"
                placeholder="Site name"
                onchange="updateEditingClientSiteName(${index}, this.value)"
            >
            <button type="button" class="btn btn-small btn-danger-soft" onclick="removeEditingClientSite(${index})">Remove</button>
        </div>
    `).join('');
    list.insertAdjacentHTML('beforeend', '<div class="form-helper-text">Removing a site will detach it from existing jobs and preserve the site name in job notes.</div>');
}

async function detachJobsFromDeletedSite(siteId, siteName) {
    if (!siteId) return;

    const { data: jobs, error: jobsError } = await window.supabaseClient
        .from('jobs')
        .select('id, notes')
        .eq('site_id', siteId);

    if (jobsError) throw jobsError;

    for (const job of jobs || []) {
        const notes = String(job.notes || '').trim();
        const detachedSiteLine = siteName ? `Detached Site Name: ${siteName}` : '';
        const noteLines = [notes];
        if (detachedSiteLine && !/^Detached Site Name:/im.test(notes)) noteLines.push(detachedSiteLine);
        const nextNotes = noteLines.filter(Boolean).join('\n');

        const { error: detachError } = await window.supabaseClient
            .from('jobs')
            .update({
                site_id: null,
                notes: nextNotes
            })
            .eq('id', job.id);

        if (detachError) throw detachError;
    }
}

async function loadClientSitesForEditing(clientId) {
    const { data: sites, error } = await window.supabaseClient
        .from('sites')
        .select('id, name, address')
        .eq('client_id', clientId)
        .order('name');

    if (error) throw error;

    editingClientSites = (sites || []).map(site => ({
        id: site.id,
        name: site.name || '',
        address: site.address || null
    }));
}

function viewClientSites(encodedSites, clientName, clientId) {
    const sites = JSON.parse(decodeURIComponent(encodedSites));
    const header = document.getElementById('viewSitesHeader');
    if (header) header.innerText = `Sites for ${clientName}`;
    
    const list = document.getElementById('clientSitesList');
    if (list) {
        if (sites.length === 0) {
            list.innerHTML = '<li>No sites registered for this client.</li>';
        } else {
            list.innerHTML = sites.map(s => `<li><strong>${s.name}</strong> ${s.address ? '(' + s.address + ')' : ''}</li>`).join('');
        }
    }
    document.getElementById('viewSitesModal').style.display = 'flex';
}

function closeViewSitesModal() {
    document.getElementById('viewSitesModal').style.display = 'none';
}

async function openEditClientModal(id) {
    editingClientId = id;
    document.getElementById('editClientNewSites').value = '';

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Loading client details...');
        const { data: client, error: clientError } = await window.supabaseClient
            .from('clients')
            .select('id, client_name, company_name, industry, status, contact_person, contact_email, contact_phone')
            .eq('id', id)
            .maybeSingle();
        if (clientError) throw clientError;
        if (!client) throw new Error('Client record could not be found.');

        document.getElementById('editClientName').value = client.client_name || client.company_name || '';
        document.getElementById('editClientIndustry').value = client.industry || '';
        document.getElementById('editClientStatus').value = client.status || 'active';
        renderPartnerContactRows('edit', parsePartnerContacts(client.contact_person, client.contact_email, client.contact_phone));

        await loadClientSitesForEditing(id);
        renderEditClientSites();
        document.getElementById('editClientModal').style.display = 'flex';
    } catch (err) {
        if (typeof showToast === 'function') showToast('Failed to load client sites: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function closeEditClientModal() {
    document.getElementById('editClientModal').style.display = 'none';
    editingClientId = null;
    editingClientSites = [];
    const newSitesInput = document.getElementById('editClientNewSites');
    if (newSitesInput) newSitesInput.value = '';
    renderPartnerContactRows('edit', [{ name: '', email: '', phone: '' }]);
}

function updateEditingClientSiteName(index, value) {
    if (!editingClientSites[index]) return;
    editingClientSites[index].name = normalizePartnerSiteName(value);
}

function removeEditingClientSite(index) {
    if (!editingClientSites[index]) return;
    editingClientSites.splice(index, 1);
    renderEditClientSites();
}

async function saveEditClient(event) {
    event.preventDefault();
    if (!editingClientId) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Updating client...');
        const client_name = document.getElementById('editClientName').value;
        const industry = document.getElementById('editClientIndustry').value;
        const status = document.getElementById('editClientStatus').value;
        const contactPayload = serializePartnerContacts(collectPartnerContactRows('edit'));
        const newSiteNames = parsePartnerSiteNames(document.getElementById('editClientNewSites').value || '');
        const normalizedExistingSites = editingClientSites
            .map(site => ({
                ...site,
                name: normalizePartnerSiteName(site.name)
            }))
            .filter(site => site.name);

        const { data: originalSites, error: originalSitesError } = await window.supabaseClient
            .from('sites')
            .select('id, name')
            .eq('client_id', editingClientId);
        if (originalSitesError) throw originalSitesError;

        const updateData = {
            client_name,
            company_name: client_name,
            industry,
            status,
            contact_person: contactPayload.contact_person,
            contact_email: contactPayload.contact_email,
            contact_phone: contactPayload.contact_phone
        };
        const { error } = await window.supabaseClient.from('clients').update(updateData).eq('id', editingClientId);
        if (error) throw error;

        const originalSiteMap = new Map((originalSites || []).map(site => [String(site.id), site]));
        const keptSiteIds = new Set(normalizedExistingSites.map(site => String(site.id)));
        const sitesToDelete = (originalSites || []).filter(site => !keptSiteIds.has(String(site.id)));

        for (const site of normalizedExistingSites) {
            const original = originalSiteMap.get(String(site.id));
            if (!original) continue;
            if (normalizePartnerSiteName(original.name) === site.name) continue;

            const { error: siteUpdateError } = await window.supabaseClient
                .from('sites')
                .update({ name: site.name })
                .eq('id', site.id);

            if (siteUpdateError) throw siteUpdateError;
        }

        for (const site of sitesToDelete) {
            await detachJobsFromDeletedSite(site.id, site.name || 'Deleted site');
            const { error: siteDeleteError } = await window.supabaseClient
                .from('sites')
                .delete()
                .eq('id', site.id);

            if (siteDeleteError) throw siteDeleteError;
        }

        const existingNames = new Set(normalizedExistingSites.map(site => normalizePartnerSiteName(site.name).toLowerCase()));
        const uniqueNewSites = newSiteNames.filter(name => !existingNames.has(name.toLowerCase()));
        if (uniqueNewSites.length) {
            const { error: insertSitesError } = await window.supabaseClient
                .from('sites')
                .insert(uniqueNewSites.map(name => ({
                    client_id: editingClientId,
                    name,
                    status: 'active'
                })));

            if (insertSitesError) throw insertSitesError;
        }

        if (typeof showToast === 'function') showToast('Client and sites updated.', 'success');
        if (typeof ensureJobReferenceData === 'function') {
            try { await ensureJobReferenceData(true); } catch (e) {}
        }
        closeEditClientModal();
        loadPartnersData();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

function openEditUserModal(id, username, role, specialty) {
    editingUserId = id;
    document.getElementById('editUserName').value = username;
    document.getElementById('editUserRole').value = role;
    document.getElementById('editUserSpecialty').value = specialty;
    document.getElementById('editUserModal').style.display = 'flex';
}

function closeEditUserModal() {
    document.getElementById('editUserModal').style.display = 'none';
    editingUserId = null;
}

async function saveEditUser(event) {
    event.preventDefault();
    if (!editingUserId) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Updating user...');
        const username = document.getElementById('editUserName').value;
        const role = document.getElementById('editUserRole').value;
        const specialty = document.getElementById('editUserSpecialty').value;

        const { error } = await window.supabaseClient.from('users').update({ username, role, specialty }).eq('id', editingUserId);
        if (error) throw error;

        if (typeof showToast === 'function') showToast('User updated', 'success');
        closeEditUserModal();
        loadPartnersData();
    } catch (err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
    }
}

window.approveUserAccess = approveUserAccess;
window.rejectUserAccess = rejectUserAccess;
window.viewClientSites = viewClientSites;
window.closeViewSitesModal = closeViewSitesModal;
window.openEditClientModal = openEditClientModal;
window.closeEditClientModal = closeEditClientModal;
window.saveEditClient = saveEditClient;
window.updateEditingClientSiteName = updateEditingClientSiteName;
window.removeEditingClientSite = removeEditingClientSite;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveEditUser = saveEditUser;
window.saveClientProfileFromScratch = saveClientProfileFromScratch;
window.submitNewUser = submitNewUser;
