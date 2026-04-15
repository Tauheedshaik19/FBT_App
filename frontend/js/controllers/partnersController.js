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
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 32px; height: 32px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;">${t.username ? t.username.substring(0,2).toUpperCase() : '??'}</div>
                        <div>
                            <div style="font-weight: 600;">${t.username || 'Unnamed'}</div>
                            <div style="font-size: 0.75rem; color: var(--text-secondary);">${t.email}</div>
                        </div>
                    </div>
                </td>
                <td><span class="job-type-mini">${t.specialty || 'General'}</span></td>
                <td><span style="font-size: 0.8rem; background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${t.role}</span></td>
                <td><span class="badge ${t.approval_status === 'approved' ? 'badge-green' : t.approval_status === 'pending' ? 'badge-yellow' : 'badge-red'}">${t.approval_status || t.status || 'active'}</span></td>
                <td>
                    ${canManagePartners ? `
                        <div style="display: flex; gap: 8px; justify-content: flex-start; align-items: center;">
                            <button class="btn btn-small" onclick="openEditUserModal('${t.id}', '${(t.username || '').replace(/'/g, "\\'")}', '${t.role}', '${t.specialty}')" style="background: #3b82f6; color: white; margin-right: 0;"><i class="fas fa-edit" style="margin-right:4px;"></i> Edit</button>
                            <button class="btn btn-small" onclick="deleteUser('${t.id}')" style="background: #ef4444; color: white;"><i class="fas fa-trash" style="margin-right:4px;"></i> Delete</button>
                        </div>
                    ` : '<span style="color: var(--text-secondary);">View Only</span>'}
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
                <div style="background: white; border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <div style="font-weight: 700; font-size: 1.1rem; color: var(--text-primary); margin-bottom: 4px;">${c.client_name}</div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);"><i class="fas fa-industry" style="margin-right: 6px;"></i>${c.industry || 'No Industry Specified'}</div>
                        </div>
                        <span class="badge ${c.status === 'active' ? 'badge-green' : 'badge-orange'}">${c.status || 'active'}</span>
                    </div>
                    
                    <div style="display: flex; gap: 12px; align-items: center; font-size: 0.85rem; color: var(--text-secondary);">
                        <div><i class="fas fa-map-marker-alt" style="margin-right: 4px; color: var(--primary-color);"></i> ${clientSites.length} Registered Sites</div>
                        ${c.contact_person ? `<div><i class="fas fa-user" style="margin-right: 4px;"></i> ${c.contact_person}</div>` : ''}
                    </div>

                    <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: auto;">
                        <button class="btn btn-small btn-white" onclick="viewClientSites('${sitesJson}', '${(c.client_name || '').replace(/'/g, "\\'")}', '${c.id}')">View Sites</button>
                        ${canManagePartners ? `
                            <button class="btn btn-small" onclick="openEditClientModal('${c.id}', '${(c.client_name || '').replace(/'/g, "\\'")}', '${(c.industry || '').replace(/'/g, "\\'")}', '${c.status}', '${(c.contact_person || '').replace(/'/g, "\\'")}', '${(c.contact_email || '').replace(/'/g, "\\'")}', '${(c.contact_phone || '').replace(/'/g, "\\'")}')" style="background: #3b82f6; color: white;"><i class="fas fa-edit" style="margin-right:4px;"></i> Edit</button>
                            <button class="btn btn-small" onclick="deleteClient('${c.id}')" style="background: #ef4444; color: white;"><i class="fas fa-trash" style="margin-right:4px;"></i> Delete</button>
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
    toggleClientSiteInputs();
}

function closeAddClientModal() {
    document.getElementById('addClientModal').style.display = 'none';
    document.querySelectorAll('#addClientFormWrapper input, #addClientFormWrapper textarea').forEach(el => el.value = '');
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
    const contact_person_el = document.getElementById('newClientContact');
    const contact_email_el = document.getElementById('newClientEmail');
    const contact_phone_el = document.getElementById('newClientPhone');
    
    if (!client_name_el) {
        if (typeof showToast === 'function') showToast('Critical Error: UI elements missing.', 'error');
        return;
    }
    
    let client_name = client_name_el.value.trim();
    let industry = industry_el ? industry_el.value.trim() : '';
    let contact_person = contact_person_el ? contact_person_el.value.trim() : null;
    let contact_email = contact_email_el ? contact_email_el.value.trim() : null;
    let contact_phone = contact_phone_el ? contact_phone_el.value.trim() : null;

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
            contact_person,
            contact_email,
            contact_phone,
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
    if (!confirm("Are you sure you want to delete this client? This will also remove all associated sites.")) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Deleting client...');
        
        // Delete all sites for this client first
        const { error: deleteError } = await window.supabaseClient.from('sites').delete().eq('client_id', id);
        if (deleteError) throw deleteError;
        
        // Then delete the client
        const { error: clientError } = await window.supabaseClient.from('clients').delete().eq('id', id);
        if (clientError) throw clientError;
        
        if (typeof showToast === 'function') showToast('Client and all associated sites deleted.', 'success');
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

function openEditClientModal(id, name, industry, status, contact_person, contact_email, contact_phone) {
    editingClientId = id;
    document.getElementById('editClientName').value = name || '';
    document.getElementById('editClientIndustry').value = industry || '';
    document.getElementById('editClientStatus').value = status || 'active';
    document.getElementById('editClientContact').value = contact_person || '';
    document.getElementById('editClientEmail').value = contact_email || '';
    document.getElementById('editClientPhone').value = contact_phone || '';
    document.getElementById('editClientModal').style.display = 'flex';
}

function closeEditClientModal() {
    document.getElementById('editClientModal').style.display = 'none';
    editingClientId = null;
}

async function saveEditClient(event) {
    event.preventDefault();
    if (!editingClientId) return;
    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Updating client...');
        const client_name = document.getElementById('editClientName').value;
        const industry = document.getElementById('editClientIndustry').value;
        const status = document.getElementById('editClientStatus').value;
        const contact_person = document.getElementById('editClientContact').value || null;
        const contact_email = document.getElementById('editClientEmail').value || null;
        const contact_phone = document.getElementById('editClientPhone').value || null;

        const updateData = { client_name, industry, status, contact_person, contact_email, contact_phone };
        const { error } = await window.supabaseClient.from('clients').update(updateData).eq('id', editingClientId);
        if (error) throw error;

        if (typeof showToast === 'function') showToast('Client updated', 'success');
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
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveEditUser = saveEditUser;
window.saveClientProfileFromScratch = saveClientProfileFromScratch;
window.submitNewUser = submitNewUser;
