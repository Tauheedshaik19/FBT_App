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
                    ${canManagePartners ? `<button class="btn btn-small" onclick="deleteUser('${t.id}')"><i class="fas fa-trash"></i></button>` : '<span style="color: var(--text-secondary);">View Only</span>'}
                </td>
            </tr>
        `).join('');

        // 2. Load Clients
        const { data: clients, error: clientsError } = await window.supabaseClient
            .from('clients')
            .select('*')
            .order('client_name');
        
        if (clientsError) throw clientsError;

        clientList.innerHTML = (clients || []).map(c => `
            <tr>
                <td>
                    <div style="font-weight: 600;">${c.client_name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-secondary);">${c.industry || 'No Industry'}</div>
                </td>
                <td>
                    <div style="font-size: 0.85rem;">${c.industry || '-'}</div>
                </td>
                <td><span class="badge ${c.status === 'active' ? 'badge-green' : 'badge-orange'}">${c.status}</span></td>
            </tr>
        `).join('');

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
    document.getElementById('addClientForm').reset();
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
    if (primaryInput) primaryInput.required = mode === 'single';
    if (listInput) listInput.required = mode === 'multiple';
}

window.toggleClientSiteInputs = toggleClientSiteInputs;

async function submitNewClient(event) {
    event.preventDefault();
    if (typeof hasAppPermission === 'function' && !hasAppPermission('canManagePartners')) {
        if (typeof showToast === 'function') showToast('Your role can view Team & Partners, but cannot make changes.', 'error');
        return;
    }
    const btn = document.getElementById('saveClientBtn');
    
    const client_name = document.getElementById('newClientName').value;
    const industry = document.getElementById('newClientIndustry').value;
    const siteMode = document.getElementById('newClientSiteMode').value;
    const primarySite = document.getElementById('newClientPrimarySite').value.trim();
    const siteList = document.getElementById('newClientSiteList').value;
    const siteNames = siteMode === 'multiple'
        ? siteList.split(/\r?\n/).map(site => site.trim()).filter(Boolean)
        : [primarySite].filter(Boolean);

    if (!siteNames.length) {
        if (typeof showToast === 'function') showToast('Add at least one site for the client profile.', 'error');
        return;
    }
    
    btn.disabled = true;
    btn.innerText = 'Saving...';

    try {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving client...');
        const insertData = { 
            client_name, 
            company_name: client_name, 
            industry,
            status: 'active' 
        };

        const { data, error } = await window.supabaseClient
            .from('clients')
            .insert([insertData])
            .select();

        if (error) throw error;

        if (data && data[0]) {
            const sitesToInsert = siteNames.map(name => ({
                client_id: data[0].id,
                name,
                status: 'active'
            }));

            const { error: siteError } = await window.supabaseClient.from('sites').insert(sitesToInsert);
            if (siteError) throw siteError;
        }

        if (typeof showToast === 'function') showToast('Client added successfully!', 'success');
        if (typeof ensureJobReferenceData === 'function') await ensureJobReferenceData(true);
        closeAddClientModal();
        loadPartnersData();
    } catch (err) {
        console.error("Error adding client:", err);
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
    } finally {
        if (typeof setGlobalLoading === 'function') setGlobalLoading(false);
        btn.disabled = false;
        btn.innerText = 'Create Client Profile';
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
    const role = document.getElementById('newUserRole').value;
    const specialty = document.getElementById('newUserSpecialty').value;

    try {
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.innerText = 'Saving...';
        }
        if (typeof setGlobalLoading === 'function') setGlobalLoading(true, 'Saving team member...');
        const { error } = await window.supabaseClient
            .from('users')
            .insert([{ username, email, role, specialty, status: 'active' }]);

        if (error) {
            if (error.message.includes('foreign key constraint')) {
                if (typeof showToast === 'function') showToast("This user must be created in Supabase Authentication first!", 'error');
            } else {
                throw error;
            }
        } else {
            if (typeof showToast === 'function') showToast('Member added to team list!', 'success');
            if (typeof ensureJobReferenceData === 'function') await ensureJobReferenceData(true);
            closeAddUserModal();
            loadPartnersData();
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
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

async function approveUserAccess(userId) {
    if (typeof showToast === 'function') showToast('Signup approval is disabled. New users can sign in immediately after signup.', 'info');
}

async function rejectUserAccess(userId) {
    if (typeof showToast === 'function') showToast('Signup approval is disabled. Remove users from the team list if needed.', 'info');
}

window.approveUserAccess = approveUserAccess;
window.rejectUserAccess = rejectUserAccess;
