const ROLE_PERMISSIONS = {
    superadmin: {
        label: 'Superadmin',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'sales', 'map'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: true,
        canAssignJobs: true,
        canManagePartners: true,
        canApproveUsers: true,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: true
    },
    manager: {
        label: 'Manager',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'sales', 'map'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: true,
        canAssignJobs: true,
        canManagePartners: true,
        canApproveUsers: false,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: true
    },
    support: {
        label: 'Support',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'sales', 'map'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: true
    },
    technician: {
        label: 'Technician',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'map'],
        canCreateJobs: true,
        canEditJobs: true,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canEditInventory: false,
        canUseSalesPortal: false,
        shouldSeedBaseData: false
    },
    admin: {
        label: 'Admin',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'sales', 'map'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canEditInventory: true,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    },
    sales: {
        label: 'Sales',
        accessibleViews: ['dashboard', 'inventory', 'jobs', 'planner', 'partners', 'sales', 'map'],
        canCreateJobs: false,
        canEditJobs: false,
        canDeleteJobs: false,
        canAssignJobs: false,
        canManagePartners: false,
        canApproveUsers: false,
        canEditInventory: false,
        canUseSalesPortal: true,
        shouldSeedBaseData: false
    }
};

let currentUserProfile = null;
let authSubscription = null;
const OWNER_EMAIL = 'tauheedsf19@gmail.com';
const OWNER_PASSWORD = '12345678';
const OWNER_USERNAME = 'Tauheed';
const OWNER_BYPASS_STORAGE_KEY = 'fairbridge-owner-bypass';
const APP_SESSION_STORAGE_KEY = 'fairbridge-app-session-token';
const APP_PROFILE_STORAGE_KEY = 'fairbridge-app-session-profile';

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isOwnerEmail(email) {
    return normalizeEmail(email) === OWNER_EMAIL;
}

function isOwnerPassword(password) {
    return String(password || '') === OWNER_PASSWORD;
}

// Global Permission & State Helpers
function getRolePermissions(role) {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.technician;
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

function getCurrentRolePermissions() {
    return currentUserProfile ? getRolePermissions(currentUserProfile.role) : null;
}

function hasAppPermission(permName) {
    const perms = getCurrentRolePermissions();
    return perms ? !!perms[permName] : false;
}

// Expose to window for other controllers
window.getCurrentUserProfile = getCurrentUserProfile;
window.hasAppPermission = hasAppPermission;
window.getRolePermissions = getRolePermissions;
window.getCurrentRolePermissions = getCurrentRolePermissions;

function hasOwnerBypassCredentials(email, password) {
    return isOwnerEmail(email) && isOwnerPassword(password);
}

function isInvalidCredentialsError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('invalid login credentials') || message.includes('invalid credentials');
}

function isRateLimitError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('rate limit') || message.includes('email rate limit exceeded') || message.includes('too many requests');
}

function isValidEmailAddress(email) {
    const normalized = normalizeEmail(email);
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalized);
}

function validateStrongPassword(password) {
    const value = String(password || '');
    return {
        hasMinLength: value.length >= 12,
        hasUppercase: /[A-Z]/.test(value),
        hasLowercase: /[a-z]/.test(value),
        hasNumber: /\d/.test(value),
        hasSpecial: /[^A-Za-z0-9]/.test(value)
    };
}

function isStrongPassword(password) {
    const checks = validateStrongPassword(password);
    return Object.values(checks).every(Boolean);
}

function updateSignupSecurityHint() {
    const hint = document.getElementById('signup-security-hint');
    const email = document.getElementById('signup-email')?.value || '';
    const password = document.getElementById('signup-password')?.value || '';
    if (!hint) return;

    if (!email && !password) {
        hint.classList.remove('is-valid', 'is-invalid');
        hint.textContent = 'Use a valid email address and a password with at least 12 characters, uppercase, lowercase, a number, and a special character.';
        return;
    }

    const emailValid = isValidEmailAddress(email);
    const passwordValid = isStrongPassword(password) || hasOwnerBypassCredentials(email, password);

    hint.classList.toggle('is-valid', emailValid && passwordValid);
    hint.classList.toggle('is-invalid', !(emailValid && passwordValid));
    hint.textContent = emailValid && passwordValid
        ? 'Email format and password strength look valid.'
        : 'Use a valid email address and a password with at least 12 characters, uppercase, lowercase, a number, and a special character.';
}

function buildOwnerFallbackProfile(overrides = {}) {
    return {
        id: overrides.id || 'owner-local-session',
        auth_user_id: overrides.auth_user_id || null,
        username: overrides.username || OWNER_USERNAME,
        email: OWNER_EMAIL,
        role: 'superadmin',
        requested_role: 'superadmin',
        specialty: overrides.specialty || 'General',
        phone_number: overrides.phone_number || null,
        status: 'active',
        approval_status: 'approved',
        approved_at: overrides.approved_at || new Date().toISOString(),
        approved_by: overrides.approved_by || overrides.id || null,
        is_superadmin: true,
        created_at: overrides.created_at || new Date().toISOString()
    };
}

function persistOwnerBypassSession(profile) {
    try {
        window.localStorage.setItem(OWNER_BYPASS_STORAGE_KEY, JSON.stringify(buildOwnerFallbackProfile(profile)));
    } catch (err) {
        console.warn('Failed to persist owner bypass session:', err.message);
    }
}

function clearOwnerBypassSession() {
    try {
        window.localStorage.removeItem(OWNER_BYPASS_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear owner bypass session:', err.message);
    }
}

function readOwnerBypassSession() {
    try {
        const raw = window.localStorage.getItem(OWNER_BYPASS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return isOwnerEmail(parsed?.email) ? buildOwnerFallbackProfile(parsed) : null;
    } catch (err) {
        console.warn('Failed to read owner bypass session:', err.message);
        return null;
    }
}

function persistAppSessionToken(sessionToken) {
    try {
        if (!sessionToken) return;
        window.localStorage.setItem(APP_SESSION_STORAGE_KEY, sessionToken);
    } catch (err) {
        console.warn('Failed to persist app session token:', err.message);
    }
}

function readAppSessionToken() {
    try {
        return window.localStorage.getItem(APP_SESSION_STORAGE_KEY) || null;
    } catch (err) {
        console.warn('Failed to read app session token:', err.message);
        return null;
    }
}

function clearAppSessionToken() {
    try {
        window.localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear app session token:', err.message);
    }
}

function persistAppProfile(profile) {
    try {
        if (!profile) return;
        window.localStorage.setItem(APP_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch (err) {
        console.warn('Failed to persist app profile:', err.message);
    }
}

function readAppProfile() {
    try {
        const raw = window.localStorage.getItem(APP_PROFILE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('Failed to read app profile:', err.message);
        return null;
    }
}

function clearAppProfile() {
    try {
        window.localStorage.removeItem(APP_PROFILE_STORAGE_KEY);
    } catch (err) {
        console.warn('Failed to clear app profile:', err.message);
    }
}

function normalizeAuthRpcPayload(data) {
    if (!data) return null;
    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload || typeof payload !== 'object') return null;
    return {
        sessionToken: payload.session_token || null,
        profile: payload.profile || null
    };
}

async function callAuthRpc(functionName, params) {
    const { data, error } = await window.supabaseClient.rpc(functionName, params);
    if (error) throw error;

    const payload = normalizeAuthRpcPayload(data);
    if (!payload?.profile) {
        throw new Error('Authentication flow returned no user profile.');
    }

    return payload;
}

async function resolveOwnerAccessProfile() {
    try {
        const { data, error } = await window.supabaseClient
            .from('users')
            .select('*')
            .eq('email', OWNER_EMAIL)
            .maybeSingle();

        if (error) throw error;
        return buildOwnerFallbackProfile(data || {});
    } catch (err) {
        console.warn('Falling back to local owner profile:', err.message);
        return buildOwnerFallbackProfile();
    }
}

async function enterOwnerBypassMode() {
    const profile = await resolveOwnerAccessProfile();
    currentUserProfile = profile;
    persistOwnerBypassSession(profile);
    hideAuthShell();
    await bootAuthenticatedApp(profile);
    if (typeof showToast === 'function') showToast('Owner access opened in local fallback mode.', 'success');
}

async function bootstrapOwnerAuthAccess(password) {
    return callAuthRpc('app_sign_up', {
        p_email: OWNER_EMAIL,
        p_password: password,
        p_username: OWNER_USERNAME,
        p_requested_role: 'superadmin',
        p_phone_number: null
    });
}

function setApprovalNotificationCount(count = 0) {
    const alertButton = document.getElementById('approval-alert-btn');
    const alertCount = document.getElementById('approval-alert-count');
    const canApproveUsers = hasAppPermission('canApproveUsers');
    const normalizedCount = Math.max(0, Number(count) || 0);

    if (!alertButton || !alertCount) return;

    if (!canApproveUsers || normalizedCount === 0) {
        alertButton.style.display = 'none';
        alertCount.textContent = '0';
        return;
    }

    alertCount.textContent = String(normalizedCount);
    alertButton.style.display = 'inline-flex';
}

async function refreshApprovalNotificationBadge() {
    setApprovalNotificationCount(0);
}

function getRolePermissions(role) {
    return ROLE_PERMISSIONS[String(role || '').toLowerCase()] || ROLE_PERMISSIONS.technician;
}

function getCurrentRolePermissions() {
    return getRolePermissions(currentUserProfile?.role);
}

function hasAppPermission(permission) {
    return Boolean(getCurrentRolePermissions()[permission]);
}

function getCurrentUserProfile() {
    return currentUserProfile;
}

function formatRoleLabel(role) {
    return getRolePermissions(role).label;
}

function getAuthStatusBanner() {
    return document.getElementById('auth-status-banner');
}

function showAuthStatus(message, type = 'error') {
    const banner = getAuthStatusBanner();
    if (!banner) return;
    banner.style.display = 'block';
    banner.className = `auth-status-banner${type === 'success' ? ' success' : ''}`;
    banner.textContent = message;
}

function clearAuthStatus() {
    const banner = getAuthStatusBanner();
    if (!banner) return;
    banner.style.display = 'none';
    banner.textContent = '';
    banner.className = 'auth-status-banner';
}

function syncOwnerSetupVisibility() {
    const ownerSetupButton = document.getElementById('owner-setup-btn');
    const signUpForm = document.getElementById('signup-form');
    const email = normalizeEmail(document.getElementById('signup-email')?.value);
    const isSignUpVisible = signUpForm?.style.display !== 'none';

    if (!ownerSetupButton) return;
    ownerSetupButton.style.display = isSignUpVisible && isOwnerEmail(email) ? '' : 'none';

    const footerSignUp = document.getElementById('auth-footer-signup');
    const footerSignIn = document.getElementById('auth-footer-signin');
    if (footerSignUp) footerSignUp.style.display = isSignUpVisible ? 'none' : '';
    if (footerSignIn) footerSignIn.style.display = isSignUpVisible ? '' : 'none';
}

function setAuthLoading(buttonId, isLoading, loadingText, defaultText) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
}

function switchAuthMode(mode, button) {
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    if (button?.classList?.contains('auth-tab')) button.classList.add('active');

    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');
    if (signInForm) signInForm.style.display = mode === 'signin' ? 'block' : 'none';
    if (signUpForm) signUpForm.style.display = mode === 'signup' ? 'block' : 'none';
    clearAuthStatus();
    syncOwnerSetupVisibility();
}

function resetAuthFormsToDefaultState() {
    const signInForm = document.getElementById('signin-form');
    const signUpForm = document.getElementById('signup-form');

    if (signInForm) signInForm.reset();
    if (signUpForm) signUpForm.reset();

    setAuthLoading('signin-submit-btn', false, 'Signing In...', 'Sign In');
    setAuthLoading('signup-submit-btn', false, 'Creating Account...', 'Create Account');
    clearAuthStatus();
    switchAuthMode('signin', document.querySelector('.auth-tab[data-auth-mode="signin"]'));
}

function hasPersistedSession() {
    return Boolean(currentUserProfile || readAppSessionToken() || readAppProfile() || readOwnerBypassSession());
}

async function ensureOwnerProfileState(profile, authUser, phoneNumber = null, requestedRole = 'superadmin') {
    if (!authUser?.email || !isOwnerEmail(authUser.email)) return profile;

    const payload = {
        auth_user_id: authUser.id,
        username: profile?.username || authUser.email.split('@')[0],
        email: authUser.email,
        role: 'superadmin',
        requested_role: 'superadmin',
        phone_number: phoneNumber ?? profile?.phone_number ?? null,
        status: 'active',
        approval_status: 'approved',
        is_superadmin: true,
        approved_at: profile?.approved_at || new Date().toISOString(),
        approved_by: profile?.approved_by || profile?.id || null
    };

    const targetId = profile?.id || null;
    let query = window.supabaseClient
        .from('users')
        .upsert([payload], { onConflict: 'email' })
        .select('*')
        .maybeSingle();

    const { data, error } = await query;
    if (error) throw error;
    return data;
}

function buildUserProfilePayload(authUser, selectedRole, phoneNumber) {
    const normalizedRole = String(selectedRole || authUser?.user_metadata?.requested_role || 'technician').toLowerCase();
    const normalizedEmail = normalizeEmail(authUser?.email);
    const isOwner = isOwnerEmail(normalizedEmail);
    const usernameSource = authUser?.user_metadata?.username || normalizedEmail.split('@')[0] || 'user';

    return {
        auth_user_id: authUser.id,
        username: usernameSource,
        email: normalizedEmail,
        role: isOwner ? 'superadmin' : normalizedRole,
        requested_role: isOwner ? 'superadmin' : normalizedRole,
        phone_number: phoneNumber ?? authUser?.user_metadata?.phone_number ?? null,
        status: 'active',
        approval_status: 'approved',
        is_superadmin: isOwner,
        approved_at: isOwner ? new Date().toISOString() : null
    };
}

async function resolveUserProfile(authUser) {
    if (!authUser?.email) return null;

    let { data: profile, error } = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

    if (error) throw error;
    if (profile) {
        return ensureOwnerProfileState(profile, authUser);
    }

    const byEmailResult = await window.supabaseClient
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .maybeSingle();

    if (byEmailResult.error) throw byEmailResult.error;
    profile = byEmailResult.data;

    if (profile && !profile.auth_user_id) {
        const { data: updatedProfile, error: updateError } = await window.supabaseClient
            .from('users')
            .update({ auth_user_id: authUser.id })
            .eq('id', profile.id)
            .select('*')
            .maybeSingle();

        if (updateError) throw updateError;
        return ensureOwnerProfileState(updatedProfile || profile, authUser);
    }

    if (!profile && isOwnerEmail(authUser.email)) {
        return ensureOwnerProfileState(null, authUser);
    }

    if (!profile) {
        try {
            return await upsertSignedUpUser(
                authUser,
                authUser?.user_metadata?.requested_role || 'technician',
                authUser?.user_metadata?.phone_number || null
            );
        } catch (repairError) {
            console.warn('Unable to repair missing profile during sign-in:', repairError.message);
        }
    }

    return profile;
}

async function upsertSignedUpUser(authUser, selectedRole, phoneNumber) {
    const payload = buildUserProfilePayload(authUser, selectedRole, phoneNumber);
    const isOwner = isOwnerEmail(authUser.email);

    const { data, error } = await window.supabaseClient
        .from('users')
        .upsert([payload], { onConflict: 'email' })
        .select('*')
        .maybeSingle();

    if (error) {
        const normalizedMessage = String(error.message || '').toLowerCase();
        const isPermissionLimitedInsert = normalizedMessage.includes('permission')
            || normalizedMessage.includes('row-level security')
            || normalizedMessage.includes('jwt');
        const isMissingRelationState = normalizedMessage.includes('duplicate key')
            || normalizedMessage.includes('already exists');

        if (!isOwner && (isPermissionLimitedInsert || isMissingRelationState)) {
            return {
                ...payload,
                id: null
            };
        }
        throw error;
    }

    const resolvedProfile = data || { ...payload, id: null };
    return isOwner ? ensureOwnerProfileState(resolvedProfile, authUser, phoneNumber, payload.requested_role) : resolvedProfile;
}

async function handleSignUp(event) {
    event.preventDefault();
    clearAuthStatus();
    const username = document.getElementById('signup-username')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;
    const phone = document.getElementById('signup-phone')?.value.trim();
    const role = document.getElementById('signup-role')?.value;

    setAuthLoading('signup-submit-btn', true, 'Creating account...', 'Create Account');

    try {
        if (!isValidEmailAddress(email)) {
            throw new Error('Enter a valid email address before creating an account.');
        }

        if (!username) {
            throw new Error('Choose a username before creating an account.');
        }

        if (!isStrongPassword(password) && !hasOwnerBypassCredentials(email, password)) {
            throw new Error('Use a stronger password with at least 12 characters, uppercase, lowercase, a number, and a special character.');
        }

        // Manager Authorization Check
        const managerUser = document.getElementById('signup-manager-username')?.value.trim();
        const managerPass = document.getElementById('signup-manager-password')?.value;
        const isOwner = isOwnerEmail(email);

        if (!isOwner) {
            if (managerUser !== 'shaheer' || managerPass !== 'FBT2026') {
                throw new Error('Invalid Manager Authorization. Please contact Shaheer for registration codes.');
            }
        }

        const authPayload = await callAuthRpc('app_sign_up', {
            p_email: email,
            p_password: password,
            p_username: username,
            p_requested_role: role,
            p_phone_number: phone || null
        });

        if (authPayload.sessionToken) {
            await window.supabaseClient.rpc('app_sign_out', { p_session_token: authPayload.sessionToken });
        }

        currentUserProfile = null;
        clearAppSessionToken();
        clearOwnerBypassSession();
        showAuthStatus('Account created successfully. Sign in with your email and password.', 'success');
        if (typeof showToast === 'function') showToast('Account created successfully.', 'success');

        const signInEmail = document.getElementById('signin-email');
        const signInPassword = document.getElementById('signin-password');
        if (signInEmail) signInEmail.value = email;
        if (signInPassword) signInPassword.value = '';

        switchAuthMode('signin', document.querySelector('.auth-tab[data-auth-mode="signin"]'));
    } catch (err) {
        console.error('Sign up error:', err);
        showAuthStatus(err.message || 'Unable to create your account.');
    } finally {
        setAuthLoading('signup-submit-btn', false, 'Creating account...', 'Create Account');
    }
}

async function handleSignIn(event) {
    event.preventDefault();
    clearAuthStatus();
    const email = document.getElementById('signin-email')?.value.trim();
    const password = document.getElementById('signin-password')?.value;

    setAuthLoading('signin-submit-btn', true, 'Signing in...', 'Sign In');

    try {
        const authPayload = await callAuthRpc('app_sign_in', {
            p_email: email,
            p_password: password
        });

        currentUserProfile = authPayload.profile;
        persistAppSessionToken(authPayload.sessionToken);
        persistAppProfile(authPayload.profile);
        clearOwnerBypassSession();
        hideAuthShell();
        await bootAuthenticatedApp(authPayload.profile);
        if (typeof showToast === 'function') showToast('Signed in successfully.', 'success');
    } catch (err) {
        console.error('Sign in error:', err);
        showAuthStatus(err.message || 'Unable to sign in.');
    } finally {
        setAuthLoading('signin-submit-btn', false, 'Signing in...', 'Sign In');
    }
}

async function handleOwnerSetup(event) {
    event.preventDefault();
    clearAuthStatus();

    const password = document.getElementById('signup-password')?.value;
    const emailInput = document.getElementById('signup-email');
    const phoneInput = document.getElementById('signup-phone');
    if (emailInput) emailInput.value = OWNER_EMAIL;
    if (phoneInput) phoneInput.value = phoneInput.value || '+27';

    setAuthLoading('owner-setup-btn', true, 'Setting up owner...', 'Set Up Superadmin');

    try {
        const result = await bootstrapOwnerAuthAccess(password);
        currentUserProfile = result.profile;
        persistAppSessionToken(result.sessionToken);
        persistAppProfile(result.profile);
        clearOwnerBypassSession();
        hideAuthShell();
        await bootAuthenticatedApp(result.profile);
        showToast('Superadmin access is ready.', 'success');
    } catch (err) {
        console.error('Owner setup error:', err);
        showAuthStatus(err.message || 'Unable to set up the superadmin account.', 'error');
    } finally {
        setAuthLoading('owner-setup-btn', false, 'Setting up owner...', 'Set Up Superadmin');
    }
}

async function handleSignOut() {
    try {
        const sessionToken = readAppSessionToken();
        if (sessionToken) {
            await window.supabaseClient.rpc('app_sign_out', { p_session_token: sessionToken });
        }
    } finally {
        clearAppSessionToken();
        clearAppProfile();
        clearOwnerBypassSession();
        currentUserProfile = null;
        showAuthShell();
        applyRoleAccess(null);
    }
}

function showAuthShell() {
    const shell = document.getElementById('auth-shell');
    if (shell) shell.classList.add('auth-shell-visible');
}

function hideAuthShell() {
    const shell = document.getElementById('auth-shell');
    if (shell) shell.classList.remove('auth-shell-visible');
    clearAuthStatus();
}

function toggleElements(selectors, isVisible) {
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = isVisible ? '' : 'none';
            if ('disabled' in el) el.disabled = !isVisible && (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
        });
    });
}

function applyActionPermissions(profile) {
    const permissions = profile ? getRolePermissions(profile.role) : null;

    toggleElements(['button[onclick="openAddJobModal()"]'], Boolean(permissions?.canCreateJobs));
    toggleElements(['button[onclick="openAddClientModal()"]', 'button[onclick="openAddUserModal()"]'], Boolean(permissions?.canManagePartners));
    toggleElements(['button[onclick="buildTechnicianRoutePlan()"]', 'button[onclick="optimizeSelectedRoute()"]'], Boolean(permissions?.canEditJobs));
    toggleElements([
        'button[onclick="proceedBatchProcess(\'out\')"]',
        'button[onclick="proceedBatchProcess(\'in\')"]',
        'button[onclick="proceedRegisterAssets()"]'
    ], Boolean(permissions?.canEditInventory));
    toggleElements(['button[onclick="createMappingJob()"]'], Boolean(permissions?.canCreateJobs));

    document.querySelectorAll('.nav-tab').forEach(tab => {
        const handler = tab.getAttribute('onclick') || '';
        if (!permissions?.canEditInventory && /book-out|book-in|register|mapping/i.test(handler)) {
            tab.style.display = 'none';
            return;
        }
        tab.style.display = '';
    });

    const approvalPanel = document.getElementById('approval-panel');
    if (approvalPanel) approvalPanel.style.display = 'none';
    setApprovalNotificationCount(0);

    const signOutBtn = document.getElementById('signout-btn');
    if (signOutBtn) signOutBtn.style.display = profile ? '' : 'none';
}

function applyRoleAccess(profile) {
    const permissions = profile ? getRolePermissions(profile.role) : null;
    const allowedViews = new Set(permissions?.accessibleViews || []);

    document.querySelectorAll('.nav-list a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (!href?.startsWith('#')) return;
        const viewId = href.slice(1);
        const navItem = anchor.closest('.nav-item');
        if (navItem) navItem.hidden = !allowedViews.has(viewId);
    });

    document.querySelectorAll('.view').forEach(view => {
        const viewId = view.id.replace('view-', '');
        view.hidden = profile ? !allowedViews.has(viewId) : true;
    });

    const headerUserName = document.getElementById('header-user-name');
    const headerUserRole = document.getElementById('header-user-role');
    const headerRolePill = document.getElementById('header-role-pill');
    if (headerUserName) headerUserName.textContent = profile?.username || profile?.email || 'Guest';
    if (headerUserRole) headerUserRole.textContent = profile ? `Using ${formatRoleLabel(profile.role)} access` : 'Awaiting access';
    if (headerRolePill) headerRolePill.textContent = profile ? formatRoleLabel(profile.role) : 'No Role';

    applyActionPermissions(profile);
}

function openProfileSettingsModal() {
    if (!currentUserProfile) return;

    const modal = document.getElementById('profileSettingsModal');
    const emailInput = document.getElementById('profile-email');
    const roleInput = document.getElementById('profile-role');
    const usernameInput = document.getElementById('profile-username');

    if (emailInput) emailInput.value = currentUserProfile.email || '';
    if (roleInput) roleInput.value = formatRoleLabel(currentUserProfile.role);
    if (usernameInput) usernameInput.value = currentUserProfile.username || '';
    if (modal) modal.style.display = 'flex';
}

function closeProfileSettingsModal() {
    const modal = document.getElementById('profileSettingsModal');
    if (modal) modal.style.display = 'none';
}

async function saveProfileSettings(event) {
    event.preventDefault();
    if (!currentUserProfile) return;

    const usernameInput = document.getElementById('profile-username');
    const saveButton = document.getElementById('saveProfileSettingsBtn');
    const nextUsername = usernameInput?.value.trim();

    if (!nextUsername) {
        showAuthStatus('Username is required.', 'error');
        return;
    }

    if (nextUsername.length > 80) {
        showAuthStatus('Username must be 80 characters or less.', 'error');
        return;
    }

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
    }

    try {
        let nextProfile = { ...currentUserProfile, username: nextUsername };

        if (currentUserProfile.id !== 'owner-local-session') {
            const { data: matchedProfile, error: profileLookupError } = await window.supabaseClient
                .from('users')
                .select('*')
                .or(`id.eq.${currentUserProfile.id},email.eq.${normalizeEmail(currentUserProfile.email)}`)
                .maybeSingle();

            if (profileLookupError) throw profileLookupError;
            if (!matchedProfile?.id) {
                throw new Error('Profile row not found for this account. Re-run database_schema.sql and sign in again.');
            }

            const { data, error } = await window.supabaseClient
                .from('users')
                .update({ username: nextUsername })
                .eq('id', matchedProfile.id)
                .select('*')
                .maybeSingle();

            if (error) throw error;
            if (data) {
                nextProfile = { ...nextProfile, ...data };
            } else {
                const fallbackProfile = await window.supabaseClient
                    .from('users')
                    .select('*')
                    .eq('id', matchedProfile.id)
                    .maybeSingle();

                if (fallbackProfile.error) throw fallbackProfile.error;
                if (!fallbackProfile.data) {
                    throw new Error('Profile row not found for this account. Re-run database_schema.sql and sign in again.');
                }
                nextProfile = { ...nextProfile, ...fallbackProfile.data };
            }
        }

        currentUserProfile = nextProfile;
        if (isOwnerEmail(currentUserProfile.email) && readOwnerBypassSession()) {
            persistOwnerBypassSession(currentUserProfile);
        }

        applyRoleAccess(currentUserProfile);
        const dashUserName = document.getElementById('dash-user-name');
        if (dashUserName) dashUserName.textContent = currentUserProfile.username || currentUserProfile.email || 'User';
        closeProfileSettingsModal();
        if (typeof showToast === 'function') showToast('Profile updated successfully.', 'success');
    } catch (err) {
        const message = String(err?.message || 'Failed to update profile.');
        if (message.includes('Only the superadmin can change another user profile')) {
            if (typeof showToast === 'function') showToast('Database trigger is blocking self profile updates. Re-run the latest database_schema.sql in Supabase, then sign in again.', 'error');
            return;
        }
        if (typeof showToast === 'function') showToast('Failed to update profile: ' + message, 'error');
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = 'Save Profile';
        }
    }
}

async function bootAuthenticatedApp(profile) {
    applyRoleAccess(profile);

    await refreshApprovalNotificationBadge();
    
    // Initialize the Job Request Inbox for Managers/Superadmins
    if (typeof initializeJobRequestInbox === 'function') {
        await initializeJobRequestInbox();
    }

    if (getRolePermissions(profile.role).shouldSeedBaseData) {
        await ensureBaseData();
    }

    if (typeof populateInventoryDropdowns === 'function') {
        await populateInventoryDropdowns();
    }

    const defaultView = getRolePermissions(profile.role).accessibleViews[0] || 'dashboard';
    navigateToView(defaultView);
}

function navigateToView(targetId) {
    const targetView = document.getElementById(`view-${targetId}`);
    if (!targetView || targetView.hidden) return;

    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    const anchor = document.querySelector(`.nav-list a[href="#${targetId}"]`);
    const parentLi = anchor?.closest('.nav-item');
    if (parentLi) parentLi.classList.add('active');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    targetView.classList.add('active');

    const breadcrumb = document.querySelector('.breadcrumbs .current');
    if (breadcrumb && anchor) breadcrumb.innerText = anchor.innerText;

    if (targetId === 'dashboard') loadDashboardData();
    else if (targetId === 'inventory') {
        const defaultTab = document.querySelector('.nav-tab:not([style*="display: none"])');
        if (defaultTab) switchInventorySubView('dashboard', defaultTab);
        loadInventoryData();
    }
    else if (targetId === 'jobs') loadJobsData();
    else if (targetId === 'planner') loadPlannerData();
    else if (targetId === 'partners') loadPartnersData();
    else if (targetId === 'map') setTimeout(() => loadMapData(), 100);
}

function setupNavigation() {
    const anchors = document.querySelectorAll('.nav-list a');

    anchors.forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUserProfile) return;

            const href = anchor.getAttribute('href');
            if (!href) return;

            const targetId = href.substring(1);
            if (!getCurrentRolePermissions().accessibleViews.includes(targetId)) {
                if (typeof showToast === 'function') showToast('Your role does not have access to this module.', 'error');
                return;
            }

            navigateToView(targetId);
        });
    });
}

async function ensureBaseData() {
    try {
        const clientsToSeed = [
            { name: 'Marsing-SA', site: 'Marsing HQ', lat: -25.9382, lng: 27.9256 },
            { name: 'Marico', site: 'Marico Rivonia', lat: -26.1072, lng: 28.0567 },
            { name: 'Topmed', site: 'Topmed Pretoria', lat: -25.7481, lng: 28.2381 }
        ];

        for (const entry of clientsToSeed) {
            let { data: client } = await window.supabaseClient.from('clients').select('id').eq('client_name', entry.name).maybeSingle();

            if (!client) {
                const { data: newClient, error } = await window.supabaseClient
                    .from('clients')
                    .insert([{ client_name: entry.name, company_name: entry.name }])
                    .select()
                    .maybeSingle();
                if (error) continue;
                client = newClient;
            }

            if (client) {
                const { data: site } = await window.supabaseClient.from('sites').select('id').eq('name', entry.site).maybeSingle();
                if (!site) {
                    await window.supabaseClient.from('sites').insert([{
                        name: entry.site,
                        client_id: client.id,
                        latitude: entry.lat,
                        longitude: entry.lng,
                        status: 'active'
                    }]);
                }
            }
        }
    } catch (err) {
        console.warn('Base data sync skipped:', err.message);
    }
}

async function initializeAuth() {
    if (!window.supabaseClient) {
        console.error('Supabase client unavailable.');
        return;
    }

    if (authSubscription?.unsubscribe) authSubscription.unsubscribe();
    authSubscription = null;
    const sessionToken = readAppSessionToken();
    const cachedProfile = readAppProfile();

    if (cachedProfile && sessionToken) {
        currentUserProfile = cachedProfile;
        hideAuthShell();
        await bootAuthenticatedApp(cachedProfile);
    }

    if (!sessionToken) {
        currentUserProfile = null;
        clearAppProfile();
        showAuthShell();
        applyRoleAccess(null);
        return;
    }

    try {
        hideAuthShell();
        const authPayload = await callAuthRpc('app_resolve_session', { p_session_token: sessionToken });
        currentUserProfile = authPayload.profile;
        persistAppSessionToken(authPayload.sessionToken || sessionToken);
        persistAppProfile(authPayload.profile);
        await bootAuthenticatedApp(authPayload.profile);
    } catch (err) {
        console.warn('Stored app session could not be restored:', err.message);
        if (!cachedProfile) {
            clearAppSessionToken();
            clearAppProfile();
            currentUserProfile = null;
            showAuthShell();
            applyRoleAccess(null);
        }
    }
}

window.switchAuthMode = switchAuthMode;
window.handleSignUp = handleSignUp;
window.handleSignIn = handleSignIn;
window.handleOwnerSetup = handleOwnerSetup;
window.handleSignOut = handleSignOut;
window.getCurrentUserProfile = getCurrentUserProfile;
window.getCurrentRolePermissions = getCurrentRolePermissions;
window.hasAppPermission = hasAppPermission;
window.refreshApprovalNotificationBadge = refreshApprovalNotificationBadge;
window.navigateToView = navigateToView;
window.openProfileSettingsModal = openProfileSettingsModal;
window.closeProfileSettingsModal = closeProfileSettingsModal;
window.saveProfileSettings = saveProfileSettings;

document.addEventListener('DOMContentLoaded', async () => {
    const signUpEmail = document.getElementById('signup-email');
    const signUpPassword = document.getElementById('signup-password');
    if (!hasPersistedSession()) {
        resetAuthFormsToDefaultState();
    }
    if (signUpEmail) signUpEmail.addEventListener('input', () => {
        syncOwnerSetupVisibility();
        updateSignupSecurityHint();
    });
    if (signUpPassword) signUpPassword.addEventListener('input', updateSignupSecurityHint);
    syncOwnerSetupVisibility();
    updateSignupSecurityHint();
    setupNavigation();
    await initializeAuth();
});

window.addEventListener('pageshow', async () => {
    if (hasPersistedSession()) {
        await initializeAuth();
        return;
    }

    resetAuthFormsToDefaultState();
    syncOwnerSetupVisibility();
    updateSignupSecurityHint();
});