import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  Users,
  Server,
  KeyRound,
  Plus,
  Trash2,
  Edit2,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  Lock,
  Mail,
  Check,
  Eye,
  EyeOff,
  Info,
  Activity
} from 'lucide-react';
import {
  getAdminUsers,
  createAdminUser,
  deleteAdminUser,
  getAdminServers,
  createAdminServer,
  updateAdminServer,
  deleteAdminServer,
  getAdminPermissions,
  grantAdminPermission,
  revokeAdminPermission
} from '../services/api';
import { MODULE_REGISTRY, MODULE_STATUS, MODULE_KEYS, BOM_APP_LIST, ALL_BOM_APPS, normalizePermissions, formatPermissionsSummary, getPermissionsSummaryParts } from '@shared/modules.js';
import activityTracker from '../services/activityTracker';
import Modal from './Modal';
import Notification from './Notification';
import { useToast } from '../context/ToastContext';
import PasswordModal from './PasswordModal';
import PasswordInput from './PasswordInput';
import AdminActivityLogsView from './AdminActivityLogsView';
import { formatEnvironment } from '../utils/textFormatters';
import { useRouter } from '../context/RouterContext';
import { ROUTE_IDS } from '../config/routes';

/**
 * TriStateCheckbox: Accessible checkbox with HTML5 indeterminate state support
 */
function TriStateCheckbox({ checked, indeterminate, onChange, disabled, id, ariaLabel }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = Boolean(indeterminate);
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      id={id}
      aria-label={ariaLabel}
      type="checkbox"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: 16,
        height: 16,
        margin: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        accentColor: 'var(--sap-primary, #0a6ed1)',
        flexShrink: 0
      }}
    />
  );
}

export default function AdminView({
  currentUser,
  onBack,
  onNavigateHome,
  onNavigateProducts,
  initialTab = 'users',
  initialUsers = [],
  initialServers = [],
  initialPermissions = []
}) {
  const toast = useToast();
  let routerContext = null;
  try {
    routerContext = useRouter();
  } catch (_) {}

  const [localActiveTab, setLocalActiveTab] = useState(initialTab);
  const activeTab = routerContext?.route?.adminTab || localActiveTab;

  const handleAdminTabChange = (tabKey, routeId) => {
    setLocalActiveTab(tabKey);
    if (routerContext?.navigate && routeId) {
      routerContext.navigate(routeId);
    }
  };
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const activeUserEmail = currentUser?.email || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sb_user_email') || JSON.parse(localStorage.getItem('sb_user') || '{}')?.email) : null);
  const activeUserId = currentUser?.id || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sb_user_id') || JSON.parse(localStorage.getItem('sb_user') || '{}')?.id) : null);

  // Data states
  const [users, setUsers] = useState(initialUsers);
  const [usersError, setUsersError] = useState('');
  const [servers, setServers] = useState(initialServers);
  const [serversError, setServersError] = useState('');
  const [permissions, setPermissions] = useState(initialPermissions);
  const [permissionsError, setPermissionsError] = useState('');
  const [migrationPending, setMigrationPending] = useState(false);

  // Filter queries
  const [userSearch, setUserSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [permSearch, setPermSearch] = useState('');
  const [logsRefreshTrigger, setLogsRefreshTrigger] = useState(0);

  // Modal / Form states
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [userFormData, setUserFormData] = useState({ email: '', password: '', role: 'user' });
  const [userSubmitting, setUserSubmitting] = useState(false);
  const [userModalError, setUserModalError] = useState('');

  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [editingServerId, setEditingServerId] = useState(null);
  const [serverModalError, setServerModalError] = useState('');
  const [serverFormData, setServerFormData] = useState({
    name: '',
    ashost: '',
    sysnr: '00',
    client: '100',
    lang: 'EN',
    environment: 'SANDBOX',
    router: '/H/103.206.249.51/H/',
    gwserv: '3300',
    is_active: true,
    modules: [MODULE_KEYS.BOM],
    sap_username: '',
    sap_password: ''
  });
  const [serverSubmitting, setServerSubmitting] = useState(false);

  // Grant Permission Modal
  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [isEditingPermission, setIsEditingPermission] = useState(false);
  const [grantFormData, setGrantFormData] = useState({
    user_id: '',
    server_id: '',
    permissions: [...ALL_BOM_APPS]
  });
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantModalError, setGrantModalError] = useState('');
  const [expandedModules, setExpandedModules] = useState({ bom: true });

  // Reusable confirmation modal state (for delete confirmations & warnings)
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Delete',
    isDanger: true,
    isLoading: false,
    onConfirm: null
  });

  useEffect(() => {
    const isBusy = userSubmitting || serverSubmitting || grantSubmitting || confirmModal.isLoading;
    activityTracker.setOperation('admin_ops', isBusy);
    return () => {
      activityTracker.setOperation('admin_ops', false);
    };
  }, [userSubmitting, serverSubmitting, grantSubmitting, confirmModal.isLoading]);

  // Load all admin data independently with Promise.allSettled
  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setUsersError('');
    setServersError('');
    setPermissionsError('');
    try {
      const [usersResult, serversResult, permsResult] = await Promise.allSettled([
        getAdminUsers(),
        getAdminServers(),
        getAdminPermissions()
      ]);

      const globalErrors = [];

      // 1. Users Tab
      if (usersResult.status === 'fulfilled') {
        const usersList = usersResult.value || [];
        setUsers(usersList);
        setUsersError('');
        if (usersList.length && !grantFormData.user_id) {
          setGrantFormData((prev) => ({ ...prev, user_id: usersList[0].id }));
        }
      } else {
        const userErr = usersResult.reason?.response?.data?.error || usersResult.reason?.message || 'Failed to retrieve users.';
        console.error('[Admin] Error loading users:', usersResult.reason);
        setUsersError(userErr);
      }

      // 2. SAP Servers Tab
      if (serversResult.status === 'fulfilled') {
        const serversList = serversResult.value || [];
        setServers(serversList);
        setServersError('');
        if (serversList.length && !grantFormData.server_id) {
          setGrantFormData((prev) => ({ ...prev, server_id: serversList[0].id }));
        }
      } else {
        const serverErr = serversResult.reason?.response?.data?.error || serversResult.reason?.message || 'Failed to retrieve SAP servers.';
        console.error('[Admin] Error loading servers:', serversResult.reason);
        setServersError(serverErr);
      }

      // 3. Access Permissions Tab
      if (permsResult.status === 'fulfilled') {
        const permsList = permsResult.value || [];
        setPermissions(permsList);
        setPermissionsError('');
        if (permsList.migrationPending || permsList.some((p) => p.legacyFallback)) {
          setMigrationPending(true);
        } else {
          setMigrationPending(false);
        }
      } else {
        const permErr = permsResult.reason?.response?.data?.error || permsResult.reason?.message || 'Failed to retrieve permissions.';
        console.error('[Admin] Error loading access permissions:', permsResult.reason);
        setPermissionsError(permErr);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to load administration data.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadData();
    if (activeTab === 'activity-logs') {
      setLogsRefreshTrigger((prev) => prev + 1);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerNotice = (msg, isErr = false) => {
    if (isErr) {
      setErrorMessage(msg);
      toast.error(msg);
      setTimeout(() => setErrorMessage(''), 5000);
    } else {
      setSuccessMessage(msg);
      toast.success(msg);
      setTimeout(() => setSuccessMessage(''), 4000);
    }
  };

  // --- User Handlers ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!userFormData.email || !userFormData.password) {
      setUserModalError('Email and initial password are required.');
      return;
    }
    setUserSubmitting(true);
    setUserModalError('');
    try {
      await createAdminUser(userFormData);
      triggerNotice(`User ${userFormData.email} created successfully.`);
      setUserFormData({ email: '', password: '', role: 'user' });
      setIsUserModalOpen(false);
      setUserModalError('');
      await loadData();
    } catch (err) {
      setUserModalError(err.response?.data?.error || err.message || 'Failed to create user.');
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleDeleteUser = (user) => {
    if (
      user.id === activeUserId ||
      user.email === activeUserEmail ||
      (activeUserEmail && user.email?.toLowerCase() === activeUserEmail.toLowerCase())
    ) {
      triggerNotice('You cannot delete your own admin account.', true);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Deactivate / Remove User',
      message: `Are you sure you want to deactivate and remove user "${user.email}"? This will revoke all their SAP permissions immediately.`,
      confirmText: 'Remove User',
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await deleteAdminUser(user.id);
          triggerNotice(`User ${user.email} removed.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          await loadData();
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || 'Failed to delete user.', true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  // --- Server Handlers ---
  const handleOpenAddServer = () => {
    setEditingServerId(null);
    setServerModalError('');
    setServerFormData({
      name: '',
      ashost: '',
      sysnr: '00',
      client: '100',
      lang: 'EN',
      environment: 'SANDBOX',
      router: '/H/103.206.249.51/H/',
      gwserv: '3300',
      is_active: true,
      modules: [MODULE_KEYS.BOM],
      sap_username: '',
      sap_password: ''
    });
    setIsServerModalOpen(true);
  };

  const handleOpenEditServer = (server) => {
    setEditingServerId(server.id);
    setServerModalError('');
    setServerFormData({
      name: server.name,
      ashost: server.ashost || '',
      sysnr: server.sysnr || '00',
      client: server.client || '100',
      lang: server.lang || 'EN',
      environment: server.environment || 'SANDBOX',
      router: server.router || '',
      gwserv: server.gwserv || '3300',
      is_active: server.is_active !== undefined ? server.is_active : true,
      modules: server.modules !== undefined ? server.modules : [MODULE_KEYS.BOM],
      sap_username: server.sap_username || '',
      sap_password: ''
    });
    setIsServerModalOpen(true);
  };

  const executeSaveServer = async () => {
    setServerSubmitting(true);
    setServerModalError('');
    try {
      if (editingServerId) {
        await updateAdminServer(editingServerId, serverFormData);
        triggerNotice(`Server "${serverFormData.name}" updated successfully.`);
      } else {
        await createAdminServer(serverFormData);
        triggerNotice(`Server "${serverFormData.name}" added successfully.`);
      }
      setIsServerModalOpen(false);
      setServerModalError('');
      await loadData();
    } catch (err) {
      setServerModalError(err.response?.data?.error || err.message || 'Failed to save server.');
    } finally {
      setServerSubmitting(false);
    }
  };

  const handleSaveServer = async (e) => {
    e.preventDefault();
    if (!serverFormData.name || !serverFormData.ashost) {
      triggerNotice('Server Name and Application Host (ashost) are required.', true);
      return;
    }

    // Warning check for 0 enabled modules (Addition 4)
    if (!serverFormData.modules || serverFormData.modules.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: 'No Modules Enabled',
        message: 'Warning: No modules are enabled for this server. Users assigned to this server will see an empty launchpad. Do you want to proceed and save anyway?',
        confirmText: 'Save Anyway',
        isDanger: false,
        isLoading: false,
        onConfirm: async () => {
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          await executeSaveServer();
        }
      });
      return;
    }

    await executeSaveServer();
  };

  const handleDeleteServer = (server) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete SAP Server',
      message: `Are you sure you want to delete SAP server "${server.name}"? Active user permissions for this server will also be removed.`,
      confirmText: 'Delete Server',
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await deleteAdminServer(server.id);
          triggerNotice(`Server "${server.name}" removed.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          await loadData();
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || 'Failed to delete server.', true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  // --- Permissions Handlers ---
  const handleGrantPermission = async (e) => {
    e.preventDefault();
    if (!grantFormData.user_id || !grantFormData.server_id) {
      setGrantModalError('Please select both a User and an SAP Server.');
      return;
    }
    setGrantSubmitting(true);
    setGrantModalError('');
    try {
      await grantAdminPermission({
        user_id: grantFormData.user_id,
        server_id: grantFormData.server_id,
        permissions: normalizePermissions(grantFormData.permissions || [])
      });
      triggerNotice(isEditingPermission ? 'Feature permissions updated successfully.' : 'Access permission granted successfully.');
      setGrantFormData({ user_id: '', server_id: '', permissions: [...ALL_BOM_APPS] });
      setIsGrantModalOpen(false);
      setIsEditingPermission(false);
      setGrantModalError('');
      await loadData();
    } catch (err) {
      setGrantModalError(err.response?.data?.error || err.message || 'Failed to grant permission.');
    } finally {
      setGrantSubmitting(false);
    }
  };

  const handleOpenGrantModal = () => {
    setIsEditingPermission(false);
    setGrantFormData({
      user_id: '',
      server_id: '',
      permissions: [...ALL_BOM_APPS]
    });
    setGrantModalError('');
    setExpandedModules({ bom: true });
    setIsGrantModalOpen(true);
  };

  const handleEditPermission = (perm) => {
    setIsEditingPermission(true);
    setGrantFormData({
      user_id: perm.user_id,
      server_id: perm.server_id,
      permissions: normalizePermissions(perm.permissions || [])
    });
    setGrantModalError('');
    setExpandedModules({ bom: true });
    setIsGrantModalOpen(true);
  };

  const toggleModuleExpanded = (modKey) => {
    setExpandedModules((prev) => ({
      ...prev,
      [modKey]: !prev[modKey]
    }));
  };

  const handleToggleModule = (mod) => {
    const modApps = mod.apps || [];
    if (modApps.length === 0) return;
    const modAppKeys = modApps.map((a) => a.key);
    const currentPerms = grantFormData.permissions || [];
    const selectedModApps = currentPerms.filter((k) => modAppKeys.includes(k));
    const allChecked = selectedModApps.length === modAppKeys.length;

    let updatedPerms;
    if (allChecked) {
      // Clear all apps of this module
      updatedPerms = currentPerms.filter((k) => !modAppKeys.includes(k));
    } else {
      // Select all apps of this module
      updatedPerms = Array.from(new Set([...currentPerms, ...modAppKeys]));
    }
    setGrantFormData({
      ...grantFormData,
      permissions: normalizePermissions(updatedPerms)
    });
  };

  const hasWriteApp = (grantFormData.permissions || []).some((p) =>
    p === 'bom.create' || p === 'bom.copy' || p === 'bom.delete'
  );

  const toggleAppPermission = (appKey) => {
    const current = new Set(grantFormData.permissions || []);
    if (appKey === 'bom.display' && hasWriteApp) {
      return;
    }
    if (current.has(appKey)) {
      current.delete(appKey);
    } else {
      current.add(appKey);
    }
    const nextList = normalizePermissions(Array.from(current));
    setGrantFormData({ ...grantFormData, permissions: nextList });
  };

  const handleSelectAllApps = () => {
    const allAvailableKeys = MODULE_REGISTRY
      .filter((m) => m.status === MODULE_STATUS.AVAILABLE && Array.isArray(m.apps))
      .flatMap((m) => m.apps.map((a) => a.key));
    setGrantFormData({
      ...grantFormData,
      permissions: normalizePermissions(allAvailableKeys)
    });
  };

  const handleClearAllApps = () => {
    setGrantFormData({
      ...grantFormData,
      permissions: []
    });
  };

  const handleRevokePermission = (perm) => {
    setConfirmModal({
      isOpen: true,
      title: 'Revoke Server Access',
      message: `Revoke access for "${perm.user_email}" on server "${perm.server_name}"?`,
      confirmText: 'Revoke Access',
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await revokeAdminPermission(perm.id);
          triggerNotice('Permission revoked successfully.');
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          await loadData();
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || 'Failed to revoke permission.', true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  // Filtered lists
  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.role.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredServers = servers.filter((s) =>
    s.name.toLowerCase().includes(serverSearch.toLowerCase()) ||
    s.environment.toLowerCase().includes(serverSearch.toLowerCase()) ||
    (s.ashost && s.ashost.toLowerCase().includes(serverSearch.toLowerCase()))
  );

  const filteredPermissions = permissions.filter((p) =>
    (p.user_email && p.user_email.toLowerCase().includes(permSearch.toLowerCase())) ||
    (p.server_name && p.server_name.toLowerCase().includes(permSearch.toLowerCase())) ||
    (p.permissions && formatPermissionsSummary(p.permissions).toLowerCase().includes(permSearch.toLowerCase()))
  );

  return (
    <div className="fiori-app-view-root" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Fiori Standard Redesigned Header (Breadcrumbs > Title > Subtitle > Tabs) */}
      <div className="fiori-ph" style={{ padding: '0' }}>
        <div className="sap-layout-header-inner">
          <nav className="fiori-bc" aria-label="Breadcrumb">
            <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
              Home
            </button>
            <span className="fiori-bc-sep">›</span>
            <span className="fiori-bc-current">Enterprise Administration</span>
          </nav>

          <div className="fiori-ph-title-row">
            <h1 className="fiori-ph-title">System &amp; User Management</h1>
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={handleRefresh}
              title="Refresh Administration Data"
              style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, height: 32 }}
            >
              <RefreshCw size={14} className={isLoading ? 'sap-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          <p className="fiori-ph-subtitle">Manage users, SAP servers, access permissions and activity logs.</p>

          {/* Admin Navigation Tabs */}
          <div className="sap-toolbar" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => handleAdminTabChange('users', ROUTE_IDS.ADMIN_USERS)}
              className={`sap-admin-nav-tab ${activeTab === 'users' ? 'active' : ''}`}
            >
              <Users size={14} />
              <span>Users</span>
              <span className="sap-admin-tab-badge">{users.length}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAdminTabChange('servers', ROUTE_IDS.ADMIN_SERVERS)}
              className={`sap-admin-nav-tab ${activeTab === 'servers' ? 'active' : ''}`}
            >
              <Server size={14} />
              <span>SAP Servers</span>
              <span className="sap-admin-tab-badge">{servers.length}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAdminTabChange('permissions', ROUTE_IDS.ADMIN_PERMISSIONS)}
              className={`sap-admin-nav-tab ${activeTab === 'permissions' ? 'active' : ''}`}
            >
              <KeyRound size={14} />
              <span>Access Permissions</span>
              <span className="sap-admin-tab-badge">{permissionsError ? '!' : permissions.length}</span>
            </button>

            <button
              type="button"
              onClick={() => handleAdminTabChange('activity-logs', ROUTE_IDS.ADMIN_LOGS_AUDIT)}
              className={`sap-admin-nav-tab ${activeTab === 'activity-logs' ? 'active' : ''}`}
            >
              <Activity size={14} />
              <span>Activity Logs</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="sap-page-container" style={{ marginTop: 20 }}>
        {/* Alerts handled via Toast */}

        {/* =========================================================================
            TAB 1: USERS MANAGEMENT
           ========================================================================= */}
        {activeTab === 'users' && (
          <div style={{ width: '100%' }}>
            {usersError && (
              <Notification
                placement="inline"
                type="error"
                title="Users unavailable"
                message={usersError}
                onClose={() => setUsersError('')}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* Header row with search and Add User button */}
            <div className="sap-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#005A9E', pointerEvents: 'none', zIndex: 2, display: 'flex', alignItems: 'center' }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="sap-input sap-input-with-icon"
                  style={{ paddingLeft: 32, height: 32, fontSize: 12, width: '100%' }}
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="sap-button sap-btn sap-btn-primary"
                onClick={() => setIsUserModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
              >
                <Plus size={14} />
                <span>Add User</span>
              </button>
            </div>

            {/* Users Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll sap-table-container" tabIndex={0} role="region" aria-label="Users Table">
              <table className="sap-table sap-admin-compact-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 250 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Email address</th>
                    <th>Role</th>
                    <th>Created date</th>
                    <th>Password</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => {
                      const isSelf = Boolean(
                        (activeUserId && u.id === activeUserId) ||
                        (activeUserEmail && u.email?.toLowerCase() === activeUserEmail.toLowerCase())
                      );
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                              <div style={{
                                width: 24,
                                height: 24,
                                borderRadius: 'var(--radius-full)',
                                background: u.role === 'admin' ? 'var(--sap-primary-light)' : 'var(--sap-surface-empty)',
                                color: u.role === 'admin' ? 'var(--sap-primary)' : 'var(--sap-text-body)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 11,
                                flexShrink: 0
                              }}>
                                {u.email.charAt(0).toUpperCase()}
                              </div>
                              <span style={{ fontWeight: 500, color: 'var(--sap-text-dark)', whiteSpace: 'nowrap' }} title={u.email}>{u.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`sap-role-badge ${u.role === 'admin' ? 'sap-role-badge-admin' : 'sap-role-badge-user'}`}>
                              {u.role === 'admin' && <ShieldCheck size={11} />}
                              {u.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5 }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="sap-btn sap-btn-secondary"
                              onClick={() => {
                                setPasswordTargetUser(u);
                                setIsPasswordModalOpen(true);
                              }}
                              title={`Set new password for ${u.email}`}
                              style={{ height: 26, fontSize: 11, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                            >
                              <KeyRound size={12} />
                              <span>Set password</span>
                            </button>
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isSelf ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: 'var(--sap-text-subtle)',
                                    background: 'var(--sap-surface-elevated)',
                                    border: '1px solid var(--sap-border-subtle)',
                                    padding: '2px 8px',
                                    borderRadius: 'var(--sap-radius-pill)',
                                    display: 'inline-block'
                                  }}
                                  title="You cannot delete your own logged-in account"
                                >
                                  Current User
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="sap-btn sap-btn-ghost"
                                  onClick={() => handleDeleteUser(u)}
                                  title="Deactivate / Remove User"
                                  style={{ color: 'var(--sap-error)', padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No users found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: SAP SERVERS MANAGEMENT
           ========================================================================= */}
        {activeTab === 'servers' && (
          <div style={{ width: '100%' }}>
            {serversError && (
              <Notification
                placement="inline"
                type="error"
                title="SAP Servers unavailable"
                message={serversError}
                onClose={() => setServersError('')}
                style={{ marginBottom: 12 }}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#005A9E', pointerEvents: 'none', zIndex: 2, display: 'flex', alignItems: 'center' }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="sap-input sap-input-with-icon"
                  style={{ paddingLeft: 32, height: 32, fontSize: 12, width: '100%' }}
                  placeholder="Search servers..."
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="sap-button sap-btn sap-btn-primary"
                onClick={handleOpenAddServer}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
              >
                <Plus size={14} />
                <span>Add Server</span>
              </button>
            </div>

            {/* Servers Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll sap-table-container" tabIndex={0} role="region" aria-label="SAP Servers Table">
              <table className="sap-table sap-admin-compact-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 150 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Server name</th>
                    <th>Environment</th>
                    <th>Host / gateway</th>
                    <th>Sys / client</th>
                    <th>Username</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.length > 0 ? (
                    filteredServers.map((s) => (
                      <React.Fragment key={s.id}>
                        <tr>
                        <td style={{ fontWeight: 600, color: 'var(--sap-text-dark)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Server size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`sap-env-badge ${
                            s.environment === 'PROD'
                              ? 'sap-env-badge-prod'
                              : s.environment === 'QA'
                              ? 'sap-env-badge-qa'
                              : s.environment === 'SANDBOX'
                              ? 'sap-env-badge-sandbox'
                              : 'sap-env-badge-dev'
                          }`}>
                            {formatEnvironment(s.environment)}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sap-text-body)' }}>
                          {s.ashost || 'N/A'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sap-text-body)' }}>
                          Sys {s.sysnr || s.sys_number || '00'} | Client {s.client || '100'}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--sap-text-dark)' }}>
                              {s.sap_username || <span style={{ color: 'var(--sap-text-subtle)', fontStyle: 'italic' }}>No User</span>}
                            </span>
                            {!(s.has_password || s.credentials_status === 'saved') && (
                              <span
                                title="No password saved"
                                aria-label="No password saved"
                                style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--sap-warning-text, #b45309)', cursor: 'help' }}
                              >
                                <AlertTriangle size={13} strokeWidth={2} />
                              </span>
                            )}
                          </div>
                        </td>
                        
                        <td>
                          <span className={`sap-status-pill ${s.is_active ? 'is-active' : 'is-inactive'}`}>
                            <span className={`sap-status-dot ${s.is_active ? 'is-active' : 'is-inactive'}`} />
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleOpenEditServer(s)}
                              title="Edit Server"
                              style={{ color: 'var(--sap-primary)', padding: '4px' }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleDeleteServer(s)}
                              title="Delete Server"
                              style={{ color: 'var(--sap-error)', padding: '4px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No SAP servers found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: PERMISSIONS MATRIX & MANAGEMENT
           ========================================================================= */}
        {activeTab === 'permissions' && (
          <div style={{ width: '100%' }}>
            {/* Database Migration Pending Notice */}
            {migrationPending && (
              <div
                style={{
                  background: 'var(--sap-info-bg, #e8f4fd)',
                  border: '1px solid var(--sap-info-border, #b8daff)',
                  color: 'var(--sap-info-text, #004085)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10
                }}
              >
                <Info size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--sap-primary)' }} />
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  <strong>Database Migration Pending:</strong> The granular <code>permissions</code> column has not yet been applied to <code>public.user_server_permissions</code>. The system is operating in backward-compatible mode: existing server grants are displayed with full BOM feature access so users remain unblocked. To enable granular per-feature permissions, run <code>supabase/migrations/20261027_per_user_per_server_app_permissions.sql</code> in your Supabase SQL Editor.
                </div>
              </div>
            )}

            {/* Permissions Tab Specific Error */}
            {permissionsError && (
              <Notification
                placement="inline"
                type="error"
                title="Access Permissions unavailable"
                message={permissionsError}
                onClose={() => setPermissionsError('')}
                style={{ marginBottom: 12 }}
              />
            )}

            {/* Header row with search and Grant Permission button */}
            <div className="sap-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%', position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#005A9E', pointerEvents: 'none', zIndex: 2, display: 'flex', alignItems: 'center' }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="sap-input sap-input-with-icon"
                  style={{ paddingLeft: 32, height: 32, fontSize: 12, width: '100%' }}
                  placeholder="Search permissions..."
                  value={permSearch}
                  onChange={(e) => setPermSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11.5, color: 'var(--sap-text-muted)' }}>
                  Total Active Grants: <strong>{permissions.length}</strong>
                </span>
                <button
                  type="button"
                  className="sap-button sap-btn sap-btn-primary"
                  onClick={handleOpenGrantModal}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
                >
                  <Plus size={14} />
                  <span>Grant Permission</span>
                </button>
              </div>
            </div>

            {/* Permissions Table - Fixed Layout with Explicit Content-Based Widths */}
            <div className="sap-admin-table-scroll sap-table-container" tabIndex={0} role="region" aria-label="Access Permissions Table" style={{ width: '100%' }}>
              <table className="sap-table sap-admin-compact-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 210 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>User email</th>
                    <th>Target SAP server</th>
                    <th>Environment</th>
                    <th>Permitted features</th>
                    <th>Granted at</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPermissions.length > 0 ? (
                    filteredPermissions.map((p) => {
                      const summaryParts = getPermissionsSummaryParts(p.permissions);
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500, color: 'var(--sap-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.user_email}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                              <Users size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.user_email}>
                                {p.user_email}
                              </span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: 'var(--sap-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.server_name}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                              <Server size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.server_name}>
                                {p.server_name}
                              </span>
                            </div>
                          </td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span className={`sap-env-badge ${
                              p.server_environment === 'PROD'
                                ? 'sap-env-badge-prod'
                                : p.server_environment === 'QA'
                                ? 'sap-env-badge-qa'
                                : p.server_environment === 'SANDBOX'
                                ? 'sap-env-badge-sandbox'
                                : 'sap-env-badge-dev'
                            }`}>
                              {formatEnvironment(p.server_environment || 'DEV')}</span>
                          </td>
                          <td style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%', verticalAlign: 'middle' }}>
                              <span
                                tabIndex={0}
                                title={summaryParts.tooltip}
                                aria-label={`Permitted features: ${summaryParts.tooltip}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-sm, 4px)',
                                  fontSize: 11.5,
                                  fontWeight: 600,
                                  background: summaryParts.isNone
                                    ? 'var(--sap-warning-bg, #fff3cd)'
                                    : 'var(--sap-primary-light, #e8f0fe)',
                                  color: summaryParts.isNone
                                    ? 'var(--sap-warning-text, #856404)'
                                    : 'var(--sap-primary, #0a6ed1)',
                                  border: `1px solid ${summaryParts.isNone ? 'var(--sap-warning-border, #ffeeba)' : 'var(--sap-primary-border, #b3d7ff)'}`,
                                  maxWidth: '100%',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  cursor: 'default'
                                }}
                              >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {summaryParts.text}
                                </span>
                                {summaryParts.pillCount > 0 && (
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      padding: '0 5px',
                                      height: 16,
                                      borderRadius: 8,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: 'var(--sap-primary, #0a6ed1)',
                                      color: '#ffffff',
                                      flexShrink: 0
                                    }}
                                  >
                                    +{summaryParts.pillCount}
                                  </span>
                                )}
                              </span>
                              {(p.legacyFallback || migrationPending) && (
                                <span
                                  title="Legacy server grant - full feature access fallback"
                                  tabIndex={0}
                                  style={{
                                    marginLeft: 6,
                                    fontSize: 10,
                                    padding: '1px 5px',
                                    borderRadius: 3,
                                    background: 'var(--sap-surface-empty, #f1f5f9)',
                                    color: 'var(--sap-text-muted, #64748b)',
                                    border: '1px solid var(--sap-border-subtle, #cbd5e1)',
                                    fontWeight: 500,
                                    flexShrink: 0
                                  }}
                                >
                                  Legacy
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.granted_at ? new Date(p.granted_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button
                                type="button"
                                className="sap-btn sap-btn-ghost"
                                onClick={() => handleEditPermission(p)}
                                title="Edit Permitted Features"
                                style={{ color: 'var(--sap-primary)', padding: '4px' }}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                type="button"
                                className="sap-btn sap-btn-ghost"
                                onClick={() => handleRevokePermission(p)}
                                title="Revoke Permission"
                                style={{ color: 'var(--sap-error)', padding: '4px' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No permission grants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: ACTIVITY LOGS (AUDIT & ERRORS)
           ========================================================================= */}
        {activeTab === 'activity-logs' && (
          <AdminActivityLogsView availableServers={servers} refreshTrigger={logsRefreshTrigger} />
        )}
      </div>

      {/* =========================================================================
          MODAL: ADD USER
         ========================================================================= */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title="Add New User"
        icon={Users}
        isLoading={userSubmitting}
        maxWidth={440}
      >
        <form onSubmit={handleCreateUser}>
          
          <div className="sap-form-group">
            <label className="sap-form-label">Email Address</label>
            <input
              type="email"
              className="sap-input"
              placeholder="e.g. engineer@nextitpoint.com"
              value={userFormData.email}
              onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
              required
              autoFocus
            />
          </div>

          <div className="sap-form-group">
            <label className="sap-form-label">Initial / Temporary Password</label>
            <PasswordInput
              placeholder="Minimum 6 characters"
              value={userFormData.password}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="sap-form-group">
            <label className="sap-form-label">System Role</label>
            <select
              className="sap-input"
              value={userFormData.role}
              onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
            >
              <option value="user">Standard User (Permitted servers only)</option>
              <option value="admin">Administrator (Full platform &amp; user control)</option>
            </select>
          </div>

          <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-button"
              onClick={() => setIsUserModalOpen(false)}
              disabled={userSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-button primary"
              disabled={userSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 90 }}
            >
              {userSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL: ADD / EDIT SAP SERVER
         ========================================================================= */}
      <Modal
        isOpen={isServerModalOpen}
        onClose={() => setIsServerModalOpen(false)}
        title={editingServerId ? 'Edit SAP Server' : 'Add SAP Server'}
        icon={Server}
        isLoading={serverSubmitting}
        maxWidth={520}
      >
        <form onSubmit={handleSaveServer}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                <div className="sap-form-group">
                  <label className="sap-form-label">Server Display Name</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="e.g. Relaxo S4A Sandbox"
                    value={serverFormData.name}
                    onChange={(e) => setServerFormData({ ...serverFormData, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>

                <div className="sap-form-group">
                  <label className="sap-form-label">Environment</label>
                  <select
                    className="sap-input"
                    value={serverFormData.environment}
                    onChange={(e) => setServerFormData({ ...serverFormData, environment: e.target.value })}
                  >
                    <option value="SANDBOX">Sandbox</option>
                    <option value="DEV">Dev (Development)</option>
                    <option value="QA">Qa (Quality/Staging)</option>
                    <option value="PROD">Prod (Production)</option>
                  </select>
                </div>
              </div>

              <div className="sap-form-group">
                <label className="sap-form-label">Application Host (ashost / IP / DNS)</label>
                <input
                  type="text"
                  className="sap-input"
                  placeholder="e.g. 192.168.12.241 or sapdev.corp.net"
                  value={serverFormData.ashost}
                  onChange={(e) => setServerFormData({ ...serverFormData, ashost: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="sap-form-group">
                  <label className="sap-form-label">Sysnr (Instance)</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="09"
                    value={serverFormData.sysnr}
                    onChange={(e) => setServerFormData({ ...serverFormData, sysnr: e.target.value })}
                    required
                  />
                </div>

                <div className="sap-form-group">
                  <label className="sap-form-label">Client</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="500"
                    value={serverFormData.client}
                    onChange={(e) => setServerFormData({ ...serverFormData, client: e.target.value })}
                    required
                  />
                </div>

                <div className="sap-form-group">
                  <label className="sap-form-label">Language</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="EN"
                    value={serverFormData.lang}
                    onChange={(e) => setServerFormData({ ...serverFormData, lang: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                <div className="sap-form-group">
                  <label className="sap-form-label">SAP Router (Optional)</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="/H/103.206.249.51/H/"
                    value={serverFormData.router}
                    onChange={(e) => setServerFormData({ ...serverFormData, router: e.target.value })}
                  />
                </div>

                <div className="sap-form-group">
                  <label className="sap-form-label">Gateway Serv</label>
                  <input
                    type="text"
                    className="sap-input"
                    placeholder="3309"
                    value={serverFormData.gwserv}
                    onChange={(e) => setServerFormData({ ...serverFormData, gwserv: e.target.value })}
                  />
                </div>
              </div>

              {/* SAP RFC Credentials Card */}
              <div style={{
                marginTop: 12,
                marginBottom: 16,
                padding: '12px 14px',
                background: 'var(--sap-surface-subtle)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--sap-border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="sap-form-label" style={{ fontWeight: 700, margin: 0, fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    SAP RFC Credentials
                  </label>
                  {editingServerId && (
                    <span style={{ fontSize: 11, color: 'var(--sap-text-subtle)' }}>
                      Leave password empty to keep existing password
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="sap-form-group" style={{ marginBottom: 0 }}>
                    <label className="sap-form-label">SAP Username</label>
                    <input
                      type="text"
                      className="sap-input"
                      placeholder="e.g. RFC_USER"
                      value={serverFormData.sap_username}
                      onChange={(e) => setServerFormData({ ...serverFormData, sap_username: e.target.value })}
                      autoComplete="off"
                    />
                  </div>

                  <div className="sap-form-group" style={{ marginBottom: 0 }}>
                    <label className="sap-form-label">
                      SAP Password {editingServerId ? '(Leave blank to keep current)' : ''}
                    </label>
                    <PasswordInput
                      placeholder={editingServerId ? '••••••••  (Unchanged)' : 'Enter RFC password'}
                      value={serverFormData.sap_password}
                      onChange={(e) => setServerFormData({ ...serverFormData, sap_password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  id="server-active-check"
                  checked={serverFormData.is_active}
                  onChange={(e) => setServerFormData({ ...serverFormData, is_active: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                <label htmlFor="server-active-check" style={{ fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  Server is active and available for connections
                </label>
              </div>

              <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  className="sap-button"
                  onClick={() => setIsServerModalOpen(false)}
                  disabled={serverSubmitting}
                  style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sap-button primary"
                  disabled={serverSubmitting}
                  style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 100 }}
                >
                  {serverSubmitting ? 'Saving...' : editingServerId ? 'Update Server' : 'Add Server'}
                </button>
              </div>
            </form>
      </Modal>

      {/* =========================================================================
          MODAL: GRANT / EDIT PERMISSION
         ========================================================================= */}
      <Modal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        title={isEditingPermission ? "Edit Permitted Features" : "Grant Server & Feature Permissions"}
        subtitle="Configure which features this user can run on the SAP server"
        icon={KeyRound}
        isLoading={grantSubmitting}
        maxWidth={540}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <form onSubmit={handleGrantPermission}>
          
          <div className="sap-form-group">
            <label className="sap-form-label">Select User</label>
            <select
              className="sap-input"
              value={grantFormData.user_id}
              onChange={(e) => setGrantFormData({ ...grantFormData, user_id: e.target.value })}
              required
              disabled={isEditingPermission}
              autoFocus={!isEditingPermission}
            >
              <option value="" disabled>-- Select a User --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email} ({u.role ? u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase() : 'User'})</option>
              ))}
            </select>
          </div>

          <div className="sap-form-group">
            <label className="sap-form-label">Select SAP Server</label>
            <select
              className="sap-input"
              value={grantFormData.server_id}
              onChange={(e) => setGrantFormData({ ...grantFormData, server_id: e.target.value })}
              required
              disabled={isEditingPermission}
            >
              <option value="" disabled>-- Select a Server --</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({formatEnvironment(s.environment)})</option>
              ))}
            </select>
          </div>

          {/* Permitted Applications Accordion */}
          <div style={{
            marginTop: 14,
            marginBottom: 16,
            padding: '14px',
            background: 'var(--sap-surface-subtle, #f8fafc)',
            borderRadius: 'var(--radius-lg, 8px)',
            border: '1px solid var(--sap-border-subtle, #e2e8f0)'
          }}>
            {migrationPending && (
              <div style={{
                background: 'var(--sap-info-bg, #e8f4fd)',
                border: '1px solid var(--sap-info-border, #b8daff)',
                color: 'var(--sap-info-text, #004085)',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm, 4px)',
                fontSize: 11.5,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}>
                <Info size={14} style={{ flexShrink: 0 }} />
                <span><strong>Migration pending:</strong> Grants are currently saved with full BOM feature access until the database column is added.</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <label className="sap-form-label" style={{ fontWeight: 700, margin: 0, fontSize: 13, color: 'var(--sap-text-dark)' }}>
                Permitted Features
              </label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="sap-btn sap-btn-ghost"
                  onClick={handleSelectAllApps}
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', fontWeight: 600, color: 'var(--sap-primary)' }}
                >
                  Select all
                </button>
                <span style={{ color: 'var(--sap-border-subtle)' }}>|</span>
                <button
                  type="button"
                  className="sap-btn sap-btn-ghost"
                  onClick={handleClearAllApps}
                  style={{ fontSize: 11, padding: '2px 8px', height: 'auto', fontWeight: 600, color: 'var(--sap-text-muted)' }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Module Accordion List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODULE_REGISTRY.filter((mod) => mod.status === MODULE_STATUS.AVAILABLE).map((mod) => {
                const modApps = mod.apps || [];
                const totalApps = modApps.length;
                const currentPerms = grantFormData.permissions || [];
                const selectedModApps = currentPerms.filter((k) => modApps.some((a) => a.key === k));
                const allChecked = totalApps > 0 && selectedModApps.length === totalApps;
                const isIndeterminate = selectedModApps.length > 0 && selectedModApps.length < totalApps;
                const isExpanded = Boolean(expandedModules[mod.key]);

                // Available module: Tri-state checkbox, count, expand chevron, and sub-apps
                return (
                  <div
                    key={mod.key}
                    style={{
                      borderRadius: 'var(--radius-md, 6px)',
                      border: isExpanded
                        ? '1px solid var(--sap-primary-border, #b3d7ff)'
                        : '1px solid var(--sap-border-subtle, #cbd5e1)',
                      background: '#fff',
                      overflow: 'hidden',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    {/* Module Accordion Header */}
                    <div
                      onClick={() => toggleModuleExpanded(mod.key)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        userSelect: 'none',
                        background: isExpanded ? 'var(--sap-primary-light, #f0f7ff)' : '#fff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <TriStateCheckbox
                          checked={allChecked}
                          indeterminate={isIndeterminate}
                          onChange={() => handleToggleModule(mod)}
                          ariaLabel={`Select all ${mod.label} features`}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                              {mod.label} – {selectedModApps.length} of {totalApps} features
                            </span>
                          </div>
                          <span style={{ fontSize: 11.5, color: 'var(--sap-text-muted)', marginTop: 1 }}>
                            {mod.desc}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8 }}>
                        <ChevronDown
                          size={16}
                          style={{
                            color: 'var(--sap-text-muted)',
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.2s ease',
                            flexShrink: 0
                          }}
                        />
                      </div>
                    </div>

                    {/* Sub-Apps List (when expanded) */}
                    {isExpanded && (
                      <div style={{
                        padding: '10px 12px',
                        background: 'var(--sap-surface-subtle, #f8fafc)',
                        borderTop: '1px solid var(--sap-border-subtle, #e2e8f0)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8
                      }}>
                        {modApps.map((app) => {
                          const isChecked = currentPerms.includes(app.key);
                          const isLocked = (app.key === 'bom.display' && hasWriteApp) ||
                            (isChecked && modApps.some((other) => other.key !== app.key && currentPerms.includes(other.key) && other.implies?.includes(app.key)));

                          return (
                            <label
                              key={app.key}
                              style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 10,
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-md, 6px)',
                                border: isChecked
                                  ? '1px solid var(--sap-primary-border, #b3d7ff)'
                                  : '1px solid var(--sap-border-subtle, #e2e8f0)',
                                background: isChecked
                                  ? '#ffffff'
                                  : 'var(--sap-card-bg, #ffffff)',
                                cursor: isLocked ? 'default' : 'pointer',
                                userSelect: 'none',
                                boxShadow: isChecked ? '0 1px 2px rgba(10,110,209,0.06)' : 'none'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isLocked}
                                onChange={() => toggleAppPermission(app.key)}
                                style={{ marginTop: 2, cursor: isLocked ? 'default' : 'pointer', accentColor: 'var(--sap-primary, #0a6ed1)' }}
                              />
                              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sap-text-dark)' }}>
                                    {app.label}
                                  </span>
                                  {isLocked && (
                                    <span style={{ fontSize: 10.5, color: 'var(--sap-text-muted)', fontStyle: 'italic' }}>
                                      (Required by Create / Copy / Delete)
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: 11.5, color: 'var(--sap-text-muted)', marginTop: 2 }}>
                                  {app.description}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-button"
              onClick={() => setIsGrantModalOpen(false)}
              disabled={grantSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-button primary"
              disabled={grantSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 100 }}
            >
              {grantSubmitting ? 'Saving...' : isEditingPermission ? 'Save Permissions' : 'Grant Access'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL: CONFIRMATION / DELETE DIALOG
         ========================================================================= */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => !confirmModal.isLoading && setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
        icon={confirmModal.isDanger ? AlertTriangle : ShieldCheck}
        iconColor={confirmModal.isDanger ? 'var(--sap-destructive-accent)' : 'var(--sap-primary)'}
        isLoading={confirmModal.isLoading}
        maxWidth={440}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sap-text-primary)', lineHeight: 1.5 }}>
          {confirmModal.message}
        </p>

        <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="sap-button"
            onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            disabled={confirmModal.isLoading}
            style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmModal.isDanger ? 'sap-button destructive' : 'sap-button primary'}
            onClick={() => confirmModal.onConfirm?.()}
            disabled={confirmModal.isLoading}
            style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 90 }}
          >
            {confirmModal.isLoading ? (
              <>
                <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                <span>Processing...</span>
              </>
            ) : (
              confirmModal.confirmText || 'Confirm'
            )}
          </button>
        </div>
      </Modal>

      {/* Set User Password Modal */}
      <PasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => {
          setIsPasswordModalOpen(false);
          setPasswordTargetUser(null);
        }}
        mode="admin"
        targetUser={passwordTargetUser}
        onSuccess={(msg) => triggerNotice(msg)}
      />
    </div>
  );
}
