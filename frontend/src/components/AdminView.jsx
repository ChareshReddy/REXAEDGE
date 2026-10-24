import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
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
  Zap,
  Info,
  XCircle
} from 'lucide-react';
import {
  getAdminUsers,
  createAdminUser,
  deleteAdminUser,
  getAdminServers,
  createAdminServer,
  updateAdminServer,
  deleteAdminServer,
  testServerConnection,
  testServerById,
  getAdminPermissions,
  grantAdminPermission,
  revokeAdminPermission
} from '../services/api';
import { MODULE_REGISTRY, MODULE_STATUS, MODULE_KEYS } from '@shared/modules.js';
import activityTracker from '../services/activityTracker';
import Modal from './Modal';
import PasswordModal from './PasswordModal';

export default function AdminView({ currentUser, onBack, onNavigateHome }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'servers' | 'permissions'
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const activeUserEmail = currentUser?.email || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sb_user_email') || JSON.parse(localStorage.getItem('sb_user') || '{}')?.email) : null);
  const activeUserId = currentUser?.id || (typeof localStorage !== 'undefined' ? (localStorage.getItem('sb_user_id') || JSON.parse(localStorage.getItem('sb_user') || '{}')?.id) : null);

  // Data states
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [permissions, setPermissions] = useState([]);

  // Filter queries
  const [userSearch, setUserSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [permSearch, setPermSearch] = useState('');

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
  const [testingConnection, setTestingConnection] = useState(false);
  const [testConnResult, setTestConnResult] = useState(null);
  const [testingRowServerId, setTestingRowServerId] = useState(null);
  const [selectedTestDetails, setSelectedTestDetails] = useState(null);

  // Grant Permission Modal

  const [isGrantModalOpen, setIsGrantModalOpen] = useState(false);
  const [grantFormData, setGrantFormData] = useState({
    user_id: '',
    server_id: ''
  });
  const [grantSubmitting, setGrantSubmitting] = useState(false);
  const [grantModalError, setGrantModalError] = useState('');

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
    const isBusy = userSubmitting || serverSubmitting || testingConnection || grantSubmitting || confirmModal.isLoading;
    activityTracker.setOperation('admin_ops', isBusy);
    return () => {
      activityTracker.setOperation('admin_ops', false);
    };
  }, [userSubmitting, serverSubmitting, testingConnection, grantSubmitting, confirmModal.isLoading]);

  // Load all admin data
  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const [usersData, serversData, permsData] = await Promise.all([
        getAdminUsers(),
        getAdminServers(),
        getAdminPermissions()
      ]);
      setUsers(usersData || []);
      setServers(serversData || []);
      setPermissions(permsData || []);

      // Pre-select first user and server for grant form if available
      if (usersData?.length && !grantFormData.user_id) {
        setGrantFormData((prev) => ({ ...prev, user_id: usersData[0].id }));
      }
      if (serversData?.length && !grantFormData.server_id) {
        setGrantFormData((prev) => ({ ...prev, server_id: serversData[0].id }));
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setErrorMessage(err.response?.data?.error || err.message || 'Failed to load administration data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const triggerNotice = (msg, isErr = false) => {
    if (isErr) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(''), 5000);
    } else {
      setSuccessMessage(msg);
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
    setTestConnResult(null);
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
    setTestConnResult(null);
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

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestConnResult(null);
    try {
      const res = await testServerConnection({
        serverId: editingServerId,
        name: serverFormData.name,
        ashost: serverFormData.ashost,
        sysnr: serverFormData.sysnr,
        client: serverFormData.client,
        lang: serverFormData.lang,
        router: serverFormData.router,
        gwserv: serverFormData.gwserv,
        sap_username: serverFormData.sap_username,
        sap_password: serverFormData.sap_password
      });
      if (res.success) {
        setTestConnResult({
          success: true,
          message: res.message || 'RFC Connection test successful.',
          data: res.connection_test
        });
      } else {
        setTestConnResult({
          success: false,
          message: res.error || res.message || 'RFC Connection test failed.',
          data: res.connection_test
        });
      }
    } catch (err) {
      setTestConnResult({
        success: false,
        message: err.response?.data?.error || err.message || 'RFC Connection test failed.'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleRowTestConnection = async (server) => {
    setTestingRowServerId(server.id);
    try {
      const res = await testServerById(server.id);
      if (res?.connection_test) {
        setServers((prev) =>
          prev.map((s) => (s.id === server.id ? { ...s, connection_test: res.connection_test } : s))
        );
        setSelectedTestDetails({
          serverId: server.id,
          serverName: server.name,
          data: res.connection_test
        });
      }
    } catch (err) {
      alert(`Connection test failed for ${server.name}: ${err.response?.data?.error || err.message}`);
    } finally {
      setTestingRowServerId(null);
    }
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
      await grantAdminPermission(grantFormData);
      triggerNotice('Access permission granted successfully.');
      setGrantFormData({ user_id: '', server_id: '' });
      setIsGrantModalOpen(false);
      setGrantModalError('');
      await loadData();
    } catch (err) {
      setGrantModalError(err.response?.data?.error || err.message || 'Failed to grant permission.');
    } finally {
      setGrantSubmitting(false);
    }
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
    (p.server_name && p.server_name.toLowerCase().includes(permSearch.toLowerCase()))
  );

  return (
    <div className="fiori-app-view-root" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Fiori Horizon Standard Header */}
      <div className="fiori-ph">
        <div className="fiori-bc">
          <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
            Home
          </button>
          <span className="fiori-bc-sep">›</span>
          <span className="fiori-bc-current">Enterprise Administration</span>
          <span className="sap-view-system-pill" style={{ marginLeft: 8, background: 'var(--sap-admin-pill-bg)', color: 'var(--sap-admin-pill-text)' }}>
            ADMIN
          </span>
        </div>

        <div className="fiori-ph-title-row">
          <button
            type="button"
            className="fiori-ph-back"
            onClick={onBack}
            title="Back to Launchpad"
            aria-label="Back to Launchpad"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="fiori-ph-title">System &amp; User Management</h1>
          <button
            type="button"
            className="sap-btn sap-btn-ghost"
            onClick={loadData}
            title="Refresh Administration Data"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={14} className={isLoading ? 'sap-spinner-icon' : ''} />
            <span>Refresh</span>
          </button>
        </div>
        <p className="fiori-ph-subtitle">
          Manage Supabase user accounts, configure SAP server connections, and enforce granular per-server access permissions.
        </p>

        {/* Admin Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`sap-btn ${activeTab === 'users' ? 'sap-btn-primary' : 'sap-btn-secondary'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12.5 }}
          >
            <Users size={14} />
            <span>Users</span>
            <span style={{
              background: activeTab === 'users' ? 'rgba(255,255,255,0.25)' : 'var(--sap-surface-empty)',
              color: activeTab === 'users' ? 'var(--sap-shell-text)' : 'var(--sap-text-body)',
              borderRadius: 'var(--radius-full)',
              padding: '1px 6px',
              fontSize: 11
            }}>
              {users.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('servers')}
            className={`sap-btn ${activeTab === 'servers' ? 'sap-btn-primary' : 'sap-btn-secondary'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12.5 }}
          >
            <Server size={14} />
            <span>SAP Servers</span>
            <span style={{
              background: activeTab === 'servers' ? 'rgba(255,255,255,0.25)' : 'var(--sap-surface-empty)',
              color: activeTab === 'servers' ? 'var(--sap-shell-text)' : 'var(--sap-text-body)',
              borderRadius: 'var(--radius-full)',
              padding: '1px 6px',
              fontSize: 11
            }}>
              {servers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={`sap-btn ${activeTab === 'permissions' ? 'sap-btn-primary' : 'sap-btn-secondary'}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12.5 }}
          >
            <KeyRound size={14} />
            <span>Access Permissions</span>
            <span style={{
              background: activeTab === 'permissions' ? 'rgba(255,255,255,0.25)' : 'var(--sap-surface-empty)',
              color: activeTab === 'permissions' ? 'var(--sap-shell-text)' : 'var(--sap-text-body)',
              borderRadius: 'var(--radius-full)',
              padding: '1px 6px',
              fontSize: 11
            }}>
              {permissions.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="fiori-view-body" style={{ maxWidth: 1080, margin: '0 auto', padding: '14px 24px 32px' }}>
        {/* Alerts */}
        {errorMessage && (
          <div className="sap-alert sap-alert-error" style={{ marginBottom: 14 }}>
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>{errorMessage}</div>
          </div>
        )}
        {successMessage && (
          <div className="sap-alert sap-alert-success" style={{ marginBottom: 14 }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <div>{successMessage}</div>
          </div>
        )}

        {/* =========================================================================
            TAB 1: USERS MANAGEMENT
           ========================================================================= */}
        {activeTab === 'users' && (
          <div>
            {/* Header row with search and Add User button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sap-text-subtle)' }}>
                  <Search size={13} />
                </span>
                <input
                  type="text"
                  className="sap-input"
                  style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="sap-btn sap-btn-primary"
                onClick={() => setIsUserModalOpen(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
              >
                <Plus size={14} />
                <span>Add User</span>
              </button>
            </div>

            {/* Users Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll" tabIndex={0} role="region" aria-label="Users Table">
              <table className="sap-admin-compact-table">
                <thead>
                  <tr>
                    <th>Email Address</th>
                    <th>Role</th>
                    <th>Created Date</th>
                    <th>Password</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
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
                              <span style={{ fontWeight: 500, color: 'var(--sap-text-dark)' }}>{u.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`sap-role-badge ${u.role === 'admin' ? 'sap-role-badge-admin' : 'sap-role-badge-user'}`}>
                              {u.role === 'admin' && <ShieldCheck size={11} />}
                              {u.role.toUpperCase()}
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
                          <td style={{ textAlign: 'right' }}>
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
                                style={{ color: 'var(--sap-error)', padding: '2px 6px' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
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
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sap-text-subtle)' }}>
                  <Search size={13} />
                </span>
                <input
                  type="text"
                  className="sap-input"
                  style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
                  placeholder="Search servers..."
                  value={serverSearch}
                  onChange={(e) => setServerSearch(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="sap-btn sap-btn-primary"
                onClick={handleOpenAddServer}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
              >
                <Plus size={14} />
                <span>Add Server</span>
              </button>
            </div>

            {/* Servers Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll" tabIndex={0} role="region" aria-label="SAP Servers Table">
              <table className="sap-admin-compact-table">
                <thead>
                  <tr>
                    <th>Server Name</th>
                    <th>Environment</th>
                    <th>Host / Gateway</th>
                    <th>Sys / Client</th>
                    <th>SAP Credentials</th>
                    <th>Connection Test</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
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
                            {s.environment}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sap-text-body)' }}>
                          {s.ashost || 'N/A'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sap-text-body)' }}>
                          Sys: {s.sysnr || '00'} | Clt: {s.client || '100'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--sap-text-dark)' }}>
                              {s.sap_username || <span style={{ color: 'var(--sap-text-subtle)', fontStyle: 'italic' }}>No User</span>}
                            </span>
                            {s.has_password || s.credentials_status === 'saved' ? (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'var(--sap-success)',
                                background: 'var(--sap-success-light, #ecfdf5)',
                                border: '1px solid var(--sap-success-border, #a7f3d0)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-xs)',
                                width: 'fit-content'
                              }}>
                                <Check size={10} /> Password saved
                              </span>
                            ) : (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'var(--sap-warning-text, #b45309)',
                                background: 'var(--sap-warning-bg, #fffbeb)',
                                border: '1px solid var(--sap-warning-border, #fde68a)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-xs)',
                                width: 'fit-content'
                              }}>
                                <AlertTriangle size={10} /> Credentials not set
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {s.connection_test ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  color: s.connection_test.overallStatus === 'PASS'
                                    ? 'var(--sap-success, #059669)'
                                    : s.connection_test.overallStatus === 'WARN'
                                    ? 'var(--sap-warning-text, #b45309)'
                                    : 'var(--sap-error, #dc2626)',
                                  background: s.connection_test.overallStatus === 'PASS'
                                    ? 'var(--sap-success-light, #ecfdf5)'
                                    : s.connection_test.overallStatus === 'WARN'
                                    ? 'var(--sap-warning-bg, #fffbeb)'
                                    : 'var(--sap-error-bg, #fef2f2)',
                                  border: `1px solid ${
                                    s.connection_test.overallStatus === 'PASS'
                                      ? 'var(--sap-success-border, #a7f3d0)'
                                      : s.connection_test.overallStatus === 'WARN'
                                      ? 'var(--sap-warning-border, #fde68a)'
                                      : 'var(--sap-error-border, #fecaca)'
                                  }`,
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-xs)'
                                }}>
                                  {s.connection_test.overallStatus === 'PASS' ? (
                                    <Check size={11} />
                                  ) : (
                                    <AlertTriangle size={11} />
                                  )}
                                  {s.connection_test.overallStatus === 'PASS' ? 'Ready' : s.connection_test.overallStatus === 'WARN' ? 'Warnings' : 'Failed'}
                                </span>
                                <button
                                  type="button"
                                  className="sap-btn-link"
                                  style={{ fontSize: 10.5, textDecoration: 'underline', cursor: 'pointer', background: 'none', border: 'none', color: 'var(--sap-primary)' }}
                                  onClick={() => setSelectedTestDetails(selectedTestDetails?.serverId === s.id ? null : { serverId: s.id, serverName: s.name, data: s.connection_test })}
                                >
                                  {selectedTestDetails?.serverId === s.id ? 'Hide' : 'Details'}
                                </button>
                              </div>
                              <span style={{ fontSize: 10, color: 'var(--sap-text-muted)' }}>
                                {s.connection_test.tested_at ? new Date(s.connection_test.tested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--sap-text-subtle)', fontStyle: 'italic' }}>
                              Not tested
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`sap-status-pill ${s.is_active ? 'is-active' : 'is-inactive'}`}>
                            <span className={`sap-status-dot ${s.is_active ? 'is-active' : 'is-inactive'}`} />
                            {s.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleRowTestConnection(s)}
                              disabled={testingRowServerId === s.id}
                              title="Run Test Connection"
                              style={{ color: 'var(--sap-primary)', padding: '2px 5px' }}
                            >
                              {testingRowServerId === s.id ? (
                                <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                              ) : (
                                <Zap size={13} />
                              )}
                            </button>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleOpenEditServer(s)}
                              title="Edit Server"
                              style={{ color: 'var(--sap-primary)', padding: '2px 5px' }}
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleDeleteServer(s)}
                              title="Delete Server"
                              style={{ color: 'var(--sap-error)', padding: '2px 5px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {selectedTestDetails?.serverId === s.id && selectedTestDetails.data && (
                        <tr key={`${s.id}-details`} style={{ background: 'var(--sap-surface-subtle, #f8fafc)' }}>
                          <td colSpan={8} style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                                <strong style={{ color: 'var(--sap-text-dark)' }}>Latest Connection Test Results for {s.name}:</strong>
                                <span style={{ fontSize: 11, color: 'var(--sap-text-muted)' }}>
                                  {selectedTestDetails.data.tested_at ? new Date(selectedTestDetails.data.tested_at).toLocaleString() : ''}
                                </span>
                              </div>
                              {(selectedTestDetails.data.checks || []).map((check) => (
                                <div key={check.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                                  {check.status === 'PASS' ? (
                                    <CheckCircle2 size={14} color="var(--sap-success, #059669)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  ) : check.status === 'WARN' ? (
                                    <AlertTriangle size={14} color="var(--sap-warning-text, #d97706)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  ) : check.status === 'INFO' ? (
                                    <Info size={14} color="var(--sap-primary, #2563eb)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  ) : (
                                    <XCircle size={14} color="var(--sap-error, #dc2626)" style={{ flexShrink: 0, marginTop: 1 }} />
                                  )}
                                  <div>
                                    <span style={{ fontWeight: 600, marginRight: 5 }}>{check.name}:</span>
                                    <span style={{
                                      color: check.status === 'FAIL'
                                        ? 'var(--sap-error, #dc2626)'
                                        : check.status === 'WARN'
                                        ? 'var(--sap-warning-text, #b45309)'
                                        : check.status === 'INFO'
                                        ? 'var(--sap-primary, #2563eb)'
                                        : 'inherit'
                                    }}>
                                      {check.message}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
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
          <div>
            {/* Header row with search and Grant Permission button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <div className="sap-input-group" style={{ maxWidth: 300, width: '100%' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--sap-text-subtle)' }}>
                  <Search size={13} />
                </span>
                <input
                  type="text"
                  className="sap-input"
                  style={{ paddingLeft: 28, height: 32, fontSize: 12 }}
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
                  className="sap-btn sap-btn-primary"
                  onClick={() => setIsGrantModalOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, fontSize: 12, padding: '0 12px' }}
                >
                  <Plus size={14} />
                  <span>Grant Permission</span>
                </button>
              </div>
            </div>

            {/* Permissions Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll" tabIndex={0} role="region" aria-label="Access Permissions Table">
              <table className="sap-admin-compact-table">
                <thead>
                  <tr>
                    <th>User Email</th>
                    <th>Target SAP Server</th>
                    <th>Environment</th>
                    <th>Granted At</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPermissions.length > 0 ? (
                    filteredPermissions.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 500, color: 'var(--sap-text-dark)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Users size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                            <span>{p.user_email}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--sap-text-dark)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Server size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                            <span>{p.server_name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`sap-env-badge ${
                            p.server_environment === 'PROD'
                              ? 'sap-env-badge-prod'
                              : p.server_environment === 'QA'
                              ? 'sap-env-badge-qa'
                              : p.server_environment === 'SANDBOX'
                              ? 'sap-env-badge-sandbox'
                              : 'sap-env-badge-dev'
                          }`}>
                            {p.server_environment || 'DEV'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5 }}>
                          {p.granted_at ? new Date(p.granted_at).toLocaleDateString() : 'N/A'}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            <button
                              type="button"
                              className="sap-btn sap-btn-ghost"
                              onClick={() => handleRevokePermission(p)}
                              title="Revoke Permission"
                              style={{ color: 'var(--sap-error)', padding: '2px 5px' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No permission grants found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
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
          {userModalError && (
            <div className="sap-alert sap-alert-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div style={{ wordBreak: 'break-word', fontSize: 13 }}>{userModalError}</div>
            </div>
          )}
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
            <input
              type="password"
              className="sap-input"
              placeholder="Minimum 6 characters"
              value={userFormData.password}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              required
              minLength={6}
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

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={() => setIsUserModalOpen(false)}
              disabled={userSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              disabled={userSubmitting}
              style={{ minWidth: 90 }}
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
          {serverModalError && (
            <div className="sap-alert sap-alert-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div style={{ wordBreak: 'break-word', fontSize: 13 }}>{serverModalError}</div>
            </div>
          )}
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
                    <option value="SANDBOX">SANDBOX (Sandbox)</option>
                    <option value="DEV">DEV (Development)</option>
                    <option value="QA">QA (Quality/Staging)</option>
                    <option value="PROD">PROD (Production)</option>
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
                    <input
                      type="password"
                      className="sap-input"
                      placeholder={editingServerId ? '••••••••  (Unchanged)' : 'Enter RFC password'}
                      value={serverFormData.sap_password}
                      onChange={(e) => setServerFormData({ ...serverFormData, sap_password: e.target.value })}
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="sap-btn sap-btn-secondary"
                      onClick={handleTestConnection}
                      disabled={testingConnection || (!serverFormData.sap_username && !serverFormData.ashost)}
                      style={{ height: 30, fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    >
                      {testingConnection ? (
                        <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                      ) : (
                        <Zap size={13} color="var(--sap-primary)" />
                      )}
                      <span>{testingConnection ? 'Testing Connection...' : 'Test Connection'}</span>
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--sap-text-subtle)' }}>
                      Opens a read-only RFC_PING to verify host and credentials.
                    </span>
                  </div>

                  {testConnResult && (
                    <div style={{
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                      background: testConnResult.success ? 'var(--sap-success-bg, #ecfdf5)' : 'var(--sap-error-bg, #fef2f2)',
                      border: `1px solid ${testConnResult.success ? 'var(--sap-success-border, #a7f3d0)' : 'var(--sap-error-border, #fecaca)'}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: testConnResult.success ? 'var(--sap-success, #059669)' : 'var(--sap-error, #dc2626)' }}>
                        {testConnResult.success ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                        <span>{testConnResult.message}</span>
                      </div>
                      {testConnResult.data?.checks && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4, paddingTop: 6, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                          {testConnResult.data.checks.map((check) => (
                            <div key={check.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11.5 }}>
                              {check.status === 'PASS' ? (
                                <CheckCircle2 size={13} color="var(--sap-success, #059669)" style={{ flexShrink: 0, marginTop: 2 }} />
                              ) : check.status === 'WARN' ? (
                                <AlertTriangle size={13} color="var(--sap-warning-text, #d97706)" style={{ flexShrink: 0, marginTop: 2 }} />
                              ) : check.status === 'INFO' ? (
                                <Info size={13} color="var(--sap-primary, #2563eb)" style={{ flexShrink: 0, marginTop: 2 }} />
                              ) : (
                                <XCircle size={13} color="var(--sap-error, #dc2626)" style={{ flexShrink: 0, marginTop: 2 }} />
                              )}
                              <div>
                                <span style={{ fontWeight: 600, marginRight: 5 }}>{check.name}:</span>
                                <span style={{
                                  color: check.status === 'FAIL'
                                    ? 'var(--sap-error, #dc2626)'
                                    : check.status === 'WARN'
                                    ? 'var(--sap-warning-text, #b45309)'
                                    : check.status === 'INFO'
                                    ? 'var(--sap-primary, #2563eb)'
                                    : 'inherit'
                                }}>
                                  {check.message}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Module Access Card */}
              <div style={{
                marginTop: 12,
                marginBottom: 16,
                padding: '12px 14px',
                background: 'var(--sap-surface-subtle)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--sap-border-subtle)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label className="sap-form-label" style={{ fontWeight: 700, margin: 0, fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Module Access
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--sap-text-muted)' }}>
                    {(serverFormData.modules || []).length} enabled
                  </span>
                </div>

                {(!serverFormData.modules || serverFormData.modules.length === 0) && (
                  <div style={{
                    padding: '6px 10px',
                    marginBottom: 10,
                    background: 'var(--sap-warning-bg)',
                    border: '1px solid var(--sap-warning-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--sap-warning-text)',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}>
                    <AlertTriangle size={14} />
                    <span>No modules enabled. Users will see an empty launchpad.</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {MODULE_REGISTRY.map((mod) => {
                    const isSoon = mod.status === MODULE_STATUS.COMING_SOON;
                    const isChecked = !isSoon && (serverFormData.modules || []).includes(mod.key);

                    return (
                      <div
                        key={mod.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-md)',
                          border: isChecked ? '1px solid var(--sap-primary-border)' : '1px solid var(--sap-border-subtle)',
                          background: isSoon ? 'var(--sap-surface-empty)' : isChecked ? 'var(--sap-primary-light)' : 'var(--sap-card-bg)',
                          opacity: isSoon ? 0.65 : 1,
                          cursor: isSoon ? 'not-allowed' : 'pointer',
                          userSelect: 'none'
                        }}
                        onClick={() => {
                          if (isSoon) return;
                          const current = serverFormData.modules || [];
                          const next = current.includes(mod.key)
                            ? current.filter((k) => k !== mod.key)
                            : [...current, mod.key];
                          setServerFormData({ ...serverFormData, modules: next });
                        }}
                      >
                        <input
                          type="checkbox"
                          id={`mod-check-${mod.key}`}
                          checked={isChecked}
                          disabled={isSoon}
                          onChange={() => {}}
                          style={{ cursor: isSoon ? 'not-allowed' : 'pointer' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: isSoon ? 'var(--sap-text-muted)' : 'var(--sap-text-dark)' }}>
                              {mod.label}
                            </span>
                            {isSoon && (
                              <span style={{
                                fontSize: 9,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                padding: '1px 4px',
                                borderRadius: 'var(--radius-xs)',
                                background: 'var(--sap-surface-empty)',
                                color: 'var(--sap-text-muted)'
                              }}>
                                Soon
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--sap-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {mod.group}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 16 }}>
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

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
                <button
                  type="button"
                  className="sap-btn sap-btn-secondary"
                  onClick={() => setIsServerModalOpen(false)}
                  disabled={serverSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sap-btn sap-btn-primary"
                  disabled={serverSubmitting}
                  style={{ minWidth: 100 }}
                >
                  {serverSubmitting ? 'Saving...' : editingServerId ? 'Update Server' : 'Add Server'}
                </button>
              </div>
            </form>
      </Modal>

      {/* =========================================================================
          MODAL: GRANT PERMISSION
         ========================================================================= */}
      <Modal
        isOpen={isGrantModalOpen}
        onClose={() => setIsGrantModalOpen(false)}
        title="Grant Server Access Permission"
        subtitle="Assign user access to a specific SAP server environment"
        icon={KeyRound}
        isLoading={grantSubmitting}
        maxWidth={460}
      >
        <form onSubmit={handleGrantPermission}>
          {grantModalError && (
            <div className="sap-alert sap-alert-error" style={{ marginBottom: 14 }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div style={{ wordBreak: 'break-word', fontSize: 13 }}>{grantModalError}</div>
            </div>
          )}
          <div className="sap-form-group">
            <label className="sap-form-label">Select User</label>
            <select
              className="sap-input"
              value={grantFormData.user_id}
              onChange={(e) => setGrantFormData({ ...grantFormData, user_id: e.target.value })}
              required
              autoFocus
            >
              <option value="" disabled>-- Select a User --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
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
            >
              <option value="" disabled>-- Select a Server --</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={() => setIsGrantModalOpen(false)}
              disabled={grantSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              disabled={grantSubmitting}
              style={{ minWidth: 100 }}
            >
              {grantSubmitting ? 'Granting...' : 'Grant Access'}
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
        iconColor={confirmModal.isDanger ? 'var(--sap-error, #b00)' : 'var(--sap-primary)'}
        isLoading={confirmModal.isLoading}
        maxWidth={440}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sap-text-body)', lineHeight: 1.5 }}>
          {confirmModal.message}
        </p>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            disabled={confirmModal.isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className={confirmModal.isDanger ? 'sap-btn sap-btn-danger' : 'sap-btn sap-btn-primary'}
            onClick={() => confirmModal.onConfirm?.()}
            disabled={confirmModal.isLoading}
            style={confirmModal.isDanger ? {
              background: 'var(--sap-error, #b00)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              minWidth: 90
            } : { minWidth: 90 }}
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
