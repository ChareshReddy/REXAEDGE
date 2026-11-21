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
  Activity,
  Database,
  Copy,
  UserX,
  UserCheck,
  UserPlus,
  Shield,
  Settings,
  PowerOff
} from 'lucide-react';
import {
  getAdminUsers,
  createAdminUser,
  deleteAdminUser,
  adminResetUserPassword,
  adminUpdateUserStatus,
  adminUpdateServerStatus,
  adminAssignServerOwner,
  adminGetAllowlist,
  adminAddAllowlist,
  adminDeleteAllowlist,
  getAdminServers,
  deleteAdminServer,
  clearAdminF4Cache
} from '../services/api';
import { MODULE_REGISTRY, MODULE_STATUS, MODULE_KEYS, BOM_APP_LIST, ALL_BOM_APPS, normalizePermissions, formatPermissionsSummary, getPermissionsSummaryParts } from '@shared/modules.js';
import activityTracker from '../services/activityTracker';
import Modal from './Modal';
import Notification from './Notification';
import { useToast } from '../context/ToastContext';
import PasswordModal from './PasswordModal';
import PasswordInput from './PasswordInput';
import AdminActivityLogsView from './AdminActivityLogsView';
import FioriPageHeader from './FioriPageHeader';
import { SearchInput } from './ui/search-input';
import { FormSection } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
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
        accentColor: 'var(--sap-primary)',
        flexShrink: 0
      }}
    />
  );
}

function AdminTabErrorState({ title, message, onRetry, isLoading }) {
  return (
    <div
      className="rx-admin-tab-error"
      role="alert"
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        maxWidth: 520,
        margin: '32px auto',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'var(--color-danger-bg)',
          color: 'var(--color-danger)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14
        }}
        aria-hidden="true"
      >
        <AlertTriangle size={22} />
      </div>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)', margin: '0 0 6px 0' }}>
        {title}
      </h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
        {message}
      </p>
      <button
        type="button"
        className="sap-button sap-btn sap-btn-primary"
        onClick={onRetry}
        disabled={isLoading}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', fontSize: 13 }}
      >
        <RefreshCw size={14} className={isLoading ? 'sap-spin' : ''} />
        <span>{isLoading ? 'Retrying...' : 'Retry'}</span>
      </button>
    </div>
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
  const [allowlist, setAllowlist] = useState([]);
  const [allowlistError, setAllowlistError] = useState('');
  const [allowlistSearch, setAllowlistSearch] = useState('');
  const [isAllowlistModalOpen, setIsAllowlistModalOpen] = useState(false);
  const [allowlistFormData, setAllowlistFormData] = useState({ pattern: '', type: 'Sandbox', comment: '' });
  const [allowlistSubmitting, setAllowlistSubmitting] = useState(false);
  const [allowlistModalError, setAllowlistModalError] = useState('');
  const [resetResultModal, setResetResultModal] = useState({
    isOpen: false,
    user: null,
    initialPassword: '',
    copied: false
  });
  const [assignOwnerModal, setAssignOwnerModal] = useState({
    isOpen: false,
    server: null,
    selectedUserId: '',
    isSubmitting: false,
    error: ''
  });

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
    router: '',
    gwserv: '3300',
    is_active: true,
    modules: [MODULE_KEYS.BOM],
    sap_username: '',
    sap_password: '',
    max_connections: 3,
    per_user_limit: 2,
    queue_timeout_seconds: 20,
    rfc_call_timeout_seconds: 45
  });
  const [serverSubmitting, setServerSubmitting] = useState(false);
  const [serverFormErrors, setServerFormErrors] = useState({});
  const [serverFormTouched, setServerFormTouched] = useState({});
  const [serverSubmitted, setServerSubmitted] = useState(false);
  const [grantServerFilter, setGrantServerFilter] = useState('');

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
    const isBusy = userSubmitting || serverSubmitting || grantSubmitting || allowlistSubmitting || confirmModal.isLoading;
    activityTracker.setOperation('admin_ops', isBusy);
    return () => {
      activityTracker.setOperation('admin_ops', false);
    };
  }, [userSubmitting, serverSubmitting, grantSubmitting, allowlistSubmitting, confirmModal.isLoading]);

  // Load all admin data independently with Promise.allSettled
  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage('');
    setUsersError('');
    setServersError('');
    setAllowlistError('');
    try {
      const [usersResult, serversResult, allowlistResult] = await Promise.allSettled([
        getAdminUsers(),
        getAdminServers(),
        adminGetAllowlist()
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

      // 3. Server Allowlist Tab
      if (allowlistResult.status === 'fulfilled') {
        const val = allowlistResult.value;
        const list = Array.isArray(val) ? val : (val?.allowlist || []);
        setAllowlist(list);
        setAllowlistError('');
      } else {
        const alErr = allowlistResult.reason?.response?.data?.error || allowlistResult.reason?.message || 'Failed to retrieve allowlist.';
        console.error('[Admin] Error loading allowlist:', allowlistResult.reason);
        setAllowlistError(alErr);
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

  // 30s Visibility-aware polling for SAP server live status (zero extra SAP calls, reads from backend cache)
  useEffect(() => {
    let intervalId = null;

    const pollServers = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && activeTab === 'servers') {
        try {
          const freshServers = await getAdminServers();
          if (Array.isArray(freshServers)) {
            setServers(freshServers);
          }
        } catch (_) {}
      }
    };

    intervalId = setInterval(pollServers, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeTab === 'servers') {
        pollServers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab]);

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
    if (!userFormData.email) {
      setUserModalError('Email is required.');
      return;
    }
    setUserSubmitting(true);
    setUserModalError('');
    try {
      const res = await createAdminUser(userFormData);
      const initialPassword = res?.initialPassword || userFormData.password;
      triggerNotice(`User ${userFormData.email} created successfully.`);
      setUserFormData({ email: '', password: '', role: 'user' });
      setIsUserModalOpen(false);
      setUserModalError('');
      setResetResultModal({
        isOpen: true,
        user: res?.user || { email: userFormData.email },
        initialPassword,
        copied: false
      });
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

  const handleAdminResetPassword = async (user) => {
    try {
      const res = await adminResetUserPassword(user.id);
      setResetResultModal({
        isOpen: true,
        user,
        initialPassword: res?.initialPassword || '',
        copied: false
      });
      triggerNotice(`Password reset for ${user.email}. Temporary password generated.`);
      await loadData();
    } catch (err) {
      triggerNotice(err.response?.data?.error || err.message || 'Failed to reset user password.', true);
    }
  };

  const handleToggleUserStatus = (user) => {
    const nextDisabled = !user.is_disabled;
    const actionLabel = nextDisabled ? 'disable' : 'enable';
    setConfirmModal({
      isOpen: true,
      title: `${nextDisabled ? 'Disable' : 'Enable'} User Account`,
      message: nextDisabled
        ? `Are you sure you want to disable ${user.email}? Any running jobs will be cancelled and active connections closed.`
        : `Are you sure you want to enable ${user.email}?`,
      confirmText: nextDisabled ? 'Disable User' : 'Enable User',
      isDanger: nextDisabled,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await adminUpdateUserStatus(user.id, nextDisabled);
          setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_disabled: nextDisabled } : u)));
          triggerNotice(`User ${user.email} ${actionLabel}d successfully.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          await loadData();
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || `Failed to ${actionLabel} user.`, true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  // --- Allowlist Handlers ---
  const handleOpenAddAllowlistModal = () => {
    setAllowlistFormData({ pattern: '', type: 'Sandbox', comment: '' });
    setAllowlistModalError('');
    setIsAllowlistModalOpen(true);
  };

  const handleCreateAllowlistRule = async (e) => {
    e.preventDefault();
    if (!allowlistFormData.pattern?.trim()) {
      setAllowlistModalError('Pattern is required (e.g. 192.168.1.0/24, 103.206.249.51, or 10.*).');
      return;
    }
    setAllowlistSubmitting(true);
    setAllowlistModalError('');
    try {
      const res = await adminAddAllowlist(allowlistFormData);
      const created = res?.entry || res;
      setAllowlist((prev) => [created, ...(Array.isArray(prev) ? prev : [])]);
      setIsAllowlistModalOpen(false);
      triggerNotice(`Pattern "${created.pattern}" added to allowlist successfully.`);
    } catch (err) {
      setAllowlistModalError(err.response?.data?.error || err.message || 'Failed to add pattern to allowlist.');
    } finally {
      setAllowlistSubmitting(false);
    }
  };

  const handleDeleteAllowlistRule = (rule) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Allowlist Pattern',
      message: `Are you sure you want to delete pattern "${rule.pattern}"? Servers matching only this pattern will no longer be permitted to connect.`,
      confirmText: 'Delete Pattern',
      isDanger: true,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await adminDeleteAllowlist(rule.id);
          setAllowlist((prev) => (Array.isArray(prev) ? prev.filter((r) => r.id !== rule.id) : []));
          triggerNotice(`Allowlist pattern "${rule.pattern}" removed successfully.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || 'Failed to delete pattern.', true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  // --- Server Handlers ---
  const validateServerForm = (data) => {
    const errors = {};
    if (!data.name || !String(data.name).trim()) {
      errors.name = 'Server Name is required.';
    }
    if (!data.ashost || !String(data.ashost).trim()) {
      errors.ashost = 'Application Host is required.';
    }

    const maxConn = Number(data.max_connections);
    if (isNaN(maxConn) || !Number.isInteger(maxConn) || maxConn < 1 || maxConn > 20) {
      errors.max_connections = 'Max connections must be an integer between 1 and 20.';
    }

    const userLimit = Number(data.per_user_limit);
    if (isNaN(userLimit) || !Number.isInteger(userLimit) || userLimit < 1) {
      errors.per_user_limit = 'Per-user limit must be an integer of at least 1.';
    } else if (!errors.max_connections && userLimit > maxConn) {
      errors.per_user_limit = 'Per-user limit cannot exceed max connections.';
    }

    const queueSec = Number(data.queue_timeout_seconds);
    if (isNaN(queueSec) || !Number.isInteger(queueSec) || queueSec < 5 || queueSec > 120) {
      errors.queue_timeout_seconds = 'Queue wait timeout must be between 5 and 120 seconds.';
    }

    const callSec = Number(data.rfc_call_timeout_seconds);
    if (isNaN(callSec) || !Number.isInteger(callSec) || callSec < 10 || callSec > 300) {
      errors.rfc_call_timeout_seconds = 'SAP call timeout must be between 10 and 300 seconds.';
    }

    return errors;
  };

  const handleServerFieldChange = (field, val) => {
    const updated = { ...serverFormData, [field]: val };
    setServerFormData(updated);
    if (serverSubmitted || serverFormTouched[field]) {
      setServerFormErrors(validateServerForm(updated));
    }
  };

  const handleServerFieldBlur = (field) => {
    setServerFormTouched((prev) => ({ ...prev, [field]: true }));
    setServerFormErrors(validateServerForm(serverFormData));
  };

  const handleClearServerF4Cache = async (server) => {
    try {
      await clearAdminF4Cache(server.id);
      triggerNotice(`Cleared cached lookups for ${server.name || 'server'}.`);
    } catch (err) {
      triggerNotice(err.response?.data?.error || err.message || 'Failed to clear cache.', true);
    }
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

  const handleToggleServerStatus = (server) => {
    const nextDisabled = !server.is_disabled;
    const actionLabel = nextDisabled ? 'disable' : 'enable';
    setConfirmModal({
      isOpen: true,
      title: `${nextDisabled ? 'Disable' : 'Enable'} SAP Server`,
      message: nextDisabled
        ? `Are you sure you want to disable server "${server.name}"? Active connection pools will be closed and any running bulk jobs on this server will be cancelled.`
        : `Are you sure you want to enable server "${server.name}"?`,
      confirmText: nextDisabled ? 'Disable Server' : 'Enable Server',
      isDanger: nextDisabled,
      isLoading: false,
      onConfirm: async () => {
        setConfirmModal((prev) => ({ ...prev, isLoading: true }));
        try {
          await adminUpdateServerStatus(server.id, nextDisabled);
          setServers((prev) => prev.map((s) => (s.id === server.id ? { ...s, is_disabled: nextDisabled } : s)));
          triggerNotice(`Server "${server.name}" ${actionLabel}d successfully.`);
          setConfirmModal((prev) => ({ ...prev, isOpen: false, isLoading: false }));
          await loadData();
        } catch (err) {
          triggerNotice(err.response?.data?.error || err.message || `Failed to ${actionLabel} server.`, true);
          setConfirmModal((prev) => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleOpenAssignOwner = (server) => {
    setAssignOwnerModal({
      isOpen: true,
      server,
      selectedUserId: server.owner_id || (users[0]?.id || ''),
      isSubmitting: false,
      error: ''
    });
  };

  const handleAssignOwnerSubmit = async (e) => {
    e.preventDefault();
    if (!assignOwnerModal.selectedUserId) {
      setAssignOwnerModal((prev) => ({ ...prev, error: 'Please select a user to own this server.' }));
      return;
    }
    setAssignOwnerModal((prev) => ({ ...prev, isSubmitting: true, error: '' }));
    try {
      await adminAssignServerOwner(assignOwnerModal.server.id, assignOwnerModal.selectedUserId);
      triggerNotice(`Owner assigned for server "${assignOwnerModal.server.name}".`);
      setAssignOwnerModal({ isOpen: false, server: null, selectedUserId: '', isSubmitting: false, error: '' });
      await loadData();
    } catch (err) {
      setAssignOwnerModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.response?.data?.error || err.message || 'Failed to assign owner.'
      }));
    }
  };

  // Filtered lists
  const filteredUsers = (Array.isArray(users) ? users : []).filter((u) =>
    (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
    (u.role && u.role.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const filteredServers = (Array.isArray(servers) ? servers : []).filter((s) =>
    (s.name && s.name.toLowerCase().includes(serverSearch.toLowerCase())) ||
    (s.environment && s.environment.toLowerCase().includes(serverSearch.toLowerCase())) ||
    (s.ashost && s.ashost.toLowerCase().includes(serverSearch.toLowerCase()))
  );

  const filteredPermissions = (Array.isArray(permissions) ? permissions : []).filter((p) =>
    (p.user_email && p.user_email.toLowerCase().includes(permSearch.toLowerCase())) ||
    (p.server_name && p.server_name.toLowerCase().includes(permSearch.toLowerCase())) ||
    (p.permissions && formatPermissionsSummary(p.permissions).toLowerCase().includes(permSearch.toLowerCase()))
  );

  const filteredAllowlist = (Array.isArray(allowlist) ? allowlist : []).filter((a) =>
    (a.pattern && a.pattern.toLowerCase().includes(allowlistSearch.toLowerCase())) ||
    (a.type && a.type.toLowerCase().includes(allowlistSearch.toLowerCase())) ||
    (a.comment && a.comment.toLowerCase().includes(allowlistSearch.toLowerCase()))
  );

  const formatRelativeTime = (iso) => {
    if (!iso) return 'Never';
    const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (isNaN(diffSec) || diffSec < 0) return 'Just now';
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${Math.floor(diffHour / 24)}d ago`;
  };

  const renderHealthBadge = (s) => {
    const status = (s.health_status || 'unknown').toLowerCase();
    let bg = 'var(--sap-surface-subtle)';
    let color = 'var(--sap-text-subtle)';
    let border = 'var(--sap-border-subtle)';
    let label = 'Unknown';

    if (status === 'healthy') {
      bg = 'var(--color-success-bg)';
      color = 'var(--color-success-strong)';
      border = 'var(--color-success-border)';
      label = 'Healthy';
    } else if (status === 'degraded') {
      bg = 'var(--color-warning-bg)';
      color = 'var(--color-warning-text)';
      border = 'var(--color-warning-border)';
      label = 'Degraded';
    } else if (status === 'down') {
      bg = 'var(--color-danger-bg)';
      color = 'var(--color-danger)';
      border = 'var(--color-danger-border)';
      label = 'Down';
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 'var(--radius-full)',
          fontSize: 11,
          fontWeight: 600,
          background: bg,
          color: color,
          border: `1px solid ${border}`,
          whiteSpace: 'nowrap'
        }}
        title={s.last_error || ''}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color }} />
        {label}
      </span>
    );
  };

  const adminTabTitles = {
    users: 'Users',
    servers: 'Servers',
    permissions: 'Permissions',
    allowlist: 'Server Allowlist',
    'activity-logs': 'Logs'
  };
  const currentAdminTitle = adminTabTitles[activeTab] || 'System & User Management';

  return (
    <div className="fiori-app-view-root" style={{ height: '100%', overflowY: 'auto' }}>
      {/* Shared Fiori Page Header */}
      <FioriPageHeader
        title={currentAdminTitle}
        subtitle="Manage users, SAP servers, access permissions and activity logs."
        breadcrumbs={[
          { label: 'Home', onClick: onNavigateHome || onBack },
          { label: 'Enterprise Administration', onClick: () => handleAdminTabChange('users', ROUTE_IDS.ADMIN_USERS) },
          { label: currentAdminTitle }
        ]}
        extraTitleContent={
          <button
            type="button"
            className="sap-btn sap-btn-secondary fiori-ph-btn"
            onClick={handleRefresh}
            title="Refresh Administration Data"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, height: 32 }}
          >
            <RefreshCw size={14} className={isLoading ? 'sap-spin' : ''} />
            <span>Refresh</span>
          </button>
        }
      >
        {/* Admin Navigation Tabs */}
        <div className="sap-toolbar sap-admin-tabs-row" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
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
            <span>All servers</span>
            <span className="sap-admin-tab-badge">{servers.length}</span>
          </button>

          <button
            type="button"
            onClick={() => handleAdminTabChange('allowlist', ROUTE_IDS.ADMIN_ALLOWLIST)}
            className={`sap-admin-nav-tab ${activeTab === 'allowlist' ? 'active' : ''}`}
          >
            <Settings size={14} />
            <span>Settings</span>
            <span className="sap-admin-tab-badge">{allowlistError ? '!' : (Array.isArray(allowlist) ? allowlist.length : 0)}</span>
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
      </FioriPageHeader>

      {/* Main Content Area */}
      <div className="sap-page-container" style={{ marginTop: 20 }}>
        {/* Alerts handled via Toast */}

        {/* =========================================================================
            TAB 1: USERS MANAGEMENT
           ========================================================================= */}
        {activeTab === 'users' && (
          <div style={{ width: '100%' }}>
            {usersError ? (
              <AdminTabErrorState
                title="Failed to Load Users"
                message={usersError}
                onRetry={loadData}
                isLoading={isLoading}
              />
            ) : (
              <>
                {/* Header row with search and Add User button */}
            <div className="sap-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
              <SearchInput
                placeholder="Search users..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                wrapperStyle={{ maxWidth: 300, width: '100%' }}
                style={{ height: 32, fontSize: 12 }}
              />

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
                  <col style={{ width: 200 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 75 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 155 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Email address</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Servers</th>
                    <th>Last login</th>
                    <th>Created date</th>
                    <th>Password</th>
                    <th className="actions-column" style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => {
                      const isSelf = Boolean(
                        (activeUserId && u.id === activeUserId) ||
                        (activeUserEmail && u.email?.toLowerCase() === activeUserEmail.toLowerCase())
                      );
                      const userServerCount = (Array.isArray(servers) ? servers : []).filter((s) => s.owner_id === u.id).length;
                      return (
                        <tr key={u.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
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
                              <span style={{ fontWeight: 500, color: 'var(--sap-text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.email}>{u.email}</span>
                            </div>
                          </td>
                          <td>
                            <span className={`sap-role-badge ${u.role === 'admin' ? 'sap-role-badge-admin' : 'sap-role-badge-user'}`}>
                              {u.role === 'admin' && <ShieldCheck size={11} />}
                              {u.role === 'admin' ? 'Admin' : 'User'}
                            </span>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: u.is_disabled ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                              color: u.is_disabled ? 'var(--sap-error)' : 'var(--color-success)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              {u.is_disabled ? 'Disabled' : 'Active'}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--sap-text-dark)' }}>
                            <span title={`${userServerCount} owned SAP server(s)`}>
                              {userServerCount}
                            </span>
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5 }}>
                            {formatRelativeTime(u.last_sign_in_at)}
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5 }}>
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="sap-btn sap-btn-secondary"
                              onClick={() => handleAdminResetPassword(u)}
                              title={`Reset password for ${u.email}`}
                              style={{ height: 26, fontSize: 11, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
                            >
                              <KeyRound size={12} />
                              <span>Reset password</span>
                            </button>
                          </td>
                          <td className="actions-column" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              {isSelf ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 500,
                                    color: 'var(--sap-text-subtle)',
                                    background: 'var(--color-surface)',
                                    border: '1px solid var(--sap-border-subtle)',
                                    padding: '2px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    display: 'inline-block'
                                  }}
                                  title="You cannot modify your own logged-in account"
                                >
                                  Current User
                                </span>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="sap-button"
                                    onClick={() => handleToggleUserStatus(u)}
                                    title={u.is_disabled ? `Enable ${u.email}` : `Disable ${u.email}`}
                                    aria-label={u.is_disabled ? `Enable ${u.email}` : `Disable ${u.email}`}
                                    style={{ height: 26, fontSize: 11, padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                  >
                                    {u.is_disabled ? <UserCheck size={13} color="var(--color-success)" /> : <UserX size={13} color="var(--sap-warning)" />}
                                    <span>{u.is_disabled ? 'Enable' : 'Disable'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="rx-table-action-delete"
                                    onClick={() => handleDeleteUser(u)}
                                    title="Deactivate / Remove User"
                                    aria-label="Deactivate / Remove User"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No users found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )}

        {/* =========================================================================
            TAB 2: ALL SAP SERVERS OVERVIEW (READ-ONLY + KILL SWITCHES)
           ========================================================================= */}
        {activeTab === 'servers' && (
          <div style={{ width: '100%' }}>
            {serversError ? (
              <AdminTabErrorState
                title="Failed to Load SAP Servers"
                message={serversError}
                onRetry={loadData}
                isLoading={isLoading}
              />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                  <SearchInput
                    placeholder="Search servers or owners..."
                    value={serverSearch}
                    onChange={(e) => setServerSearch(e.target.value)}
                    wrapperStyle={{ maxWidth: 300, width: '100%' }}
                    style={{ height: 32, fontSize: 12 }}
                  />

                  <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={14} color="var(--sap-primary)" />
                    <span>Read-only system overview · Disable/Delete kill switches apply immediately without credentials exposure</span>
                  </div>
                </div>

            {/* Servers Table - Compact & Scrollable */}
            <div className="sap-admin-table-scroll sap-table-container" tabIndex={0} role="region" aria-label="SAP Servers Table">
              <table className="sap-table sap-admin-compact-table" style={{ width: '100%', minWidth: '760px', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '19%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Server name</th>
                    <th>Owner</th>
                    <th>Host / system</th>
                    <th>Live health</th>
                    <th>Status</th>
                    <th>Last used</th>
                    <th className="actions-column" style={{ textAlign: 'center' }}>Kill Switches &amp; Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredServers.length > 0 ? (
                    filteredServers.map((s) => {
                      const isUnassigned = !s.owner_id || s.owner_email === 'unassigned';
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600, color: 'var(--sap-text-dark)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <Server size={14} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>{s.name}</span>
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <span className={`sap-env-badge ${
                                s.environment === 'PROD'
                                  ? 'sap-env-badge-prod'
                                  : s.environment === 'QA'
                                  ? 'sap-env-badge-qa'
                                  : s.environment === 'SANDBOX'
                                  ? 'sap-env-badge-sandbox'
                                  : 'sap-env-badge-dev'
                              }`}>
                                {formatEnvironment(s.environment)}
                              </span>
                            </div>
                          </td>
                          <td>
                            {isUnassigned ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  color: 'var(--sap-warning-text)',
                                  background: 'var(--sap-warning-bg)',
                                  border: '1px solid var(--sap-warning-border)',
                                  padding: '1px 6px',
                                  borderRadius: 'var(--radius-sm)'
                                }}>
                                  Legacy unowned
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
                                <Users size={13} color="var(--sap-text-muted)" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: 'var(--sap-text-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.owner_email || s.owner_id}>
                                  {s.owner_email || s.owner_id}
                                </span>
                              </div>
                            )}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sap-text-body)' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.ashost || 'N/A'}>{s.ashost || 'N/A'}</div>
                            <div style={{ fontSize: 10, color: 'var(--sap-text-subtle)', marginTop: 2 }}>
                              Sys {s.sysnr || s.sys_number || '00'} | Client {s.client || '100'}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              {renderHealthBadge(s)}
                              <div style={{ fontSize: 10, color: 'var(--sap-text-subtle)' }}>
                                {s.active_connections ?? 0} / {s.max_connections ?? 3} conn
                              </div>
                            </div>
                          </td>
                          <td>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: s.is_disabled ? 'var(--color-danger-bg)' : (s.is_active ? 'var(--color-success-bg)' : 'var(--sap-surface-subtle)'),
                              color: s.is_disabled ? 'var(--sap-error)' : (s.is_active ? 'var(--color-success)' : 'var(--sap-text-subtle)'),
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              {s.is_disabled ? 'Disabled' : (s.is_active ? 'Active' : 'Inactive')}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--sap-text-subtle)', whiteSpace: 'nowrap' }}>
                            {formatRelativeTime(s.last_used_at || s.last_checked)}
                          </td>
                          <td className="actions-column" style={{ textAlign: 'center', whiteSpace: 'nowrap', padding: '6px 8px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {isUnassigned && (
                                <button
                                  type="button"
                                  className="sap-btn sap-btn-ghost"
                                  onClick={() => handleOpenAssignOwner(s)}
                                  title="Assign this server to a user"
                                  aria-label={`Assign ${s.name} to a user`}
                                  style={{
                                    width: 28,
                                    height: 28,
                                    minWidth: 28,
                                    padding: 0,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)'
                                  }}
                                >
                                  <UserPlus size={13} color="var(--sap-primary)" />
                                </button>
                              )}
                              <button
                                type="button"
                                className="sap-btn sap-btn-ghost"
                                onClick={() => handleToggleServerStatus(s)}
                                title={s.is_disabled ? `Enable ${s.name}` : `Disable ${s.name}`}
                                aria-label={s.is_disabled ? `Enable ${s.name}` : `Disable ${s.name}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  minWidth: 28,
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-md)'
                                }}
                              >
                                {s.is_disabled ? <UserCheck size={13} color="var(--color-success)" /> : <PowerOff size={13} color="var(--sap-warning)" />}
                              </button>
                              <button
                                type="button"
                                className="sap-btn sap-btn-ghost"
                                onClick={() => handleClearServerF4Cache(s)}
                                title="Clear F4 cache"
                                aria-label={`Clear F4 cache for ${s.name}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  minWidth: 28,
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-md)',
                                  color: 'var(--sap-text-subtle)'
                                }}
                              >
                                <Database size={13} />
                              </button>
                              <button
                                type="button"
                                className="rx-table-action-delete"
                                onClick={() => handleDeleteServer(s)}
                                title="Delete Server (Kill Switch)"
                                aria-label={`Delete ${s.name}`}
                                style={{
                                  width: 28,
                                  height: 28,
                                  minWidth: 28,
                                  padding: 0,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  border: '1px solid var(--color-danger-border)',
                                  borderRadius: 'var(--radius-md)',
                                  color: 'var(--color-danger)'
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
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
          </>
        )}
      </div>
    )}

        {/* =========================================================================
            TAB 3: SETTINGS (ALLOWLIST & CONNECTION LIMITS)
           ========================================================================= */}
        {activeTab === 'allowlist' && (
          <div style={{ width: '100%' }}>
            {allowlistError ? (
              <AdminTabErrorState
                title="Failed to Load Server Allowlist"
                message={allowlistError}
                onRetry={loadData}
                isLoading={isLoading}
              />
            ) : (
              <>
                {/* Connection Limits and Security Policy Card */}
            <div style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--sap-border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 20px',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Settings size={16} color="var(--sap-primary)" />
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--sap-text-dark)' }}>Platform Connection Limits &amp; Policies</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div style={{ padding: '10px 14px', background: 'var(--sap-surface-subtle)', borderRadius: 6, border: '1px solid var(--sap-border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--sap-text-muted)', fontWeight: 500 }}>Per-User Server Limit</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sap-text-dark)', marginTop: 2 }}>5 Servers</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sap-text-subtle)', marginTop: 2 }}>Configurable default limit per non-admin account</div>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--sap-surface-subtle)', borderRadius: 6, border: '1px solid var(--sap-border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--sap-text-muted)', fontWeight: 500 }}>Global SAP Connection Cap</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sap-text-dark)', marginTop: 2 }}>50 Connections</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sap-text-subtle)', marginTop: 2 }}>Maximum active SAP RFC pool connections platform-wide</div>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--sap-surface-subtle)', borderRadius: 6, border: '1px solid var(--sap-border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--sap-text-muted)', fontWeight: 500 }}>RFC Call Timeout</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sap-text-dark)', marginTop: 2 }}>45 Seconds</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sap-text-subtle)', marginTop: 2 }}>Max execution duration per synchronous RFC invocation</div>
                </div>
                <div style={{ padding: '10px 14px', background: 'var(--sap-surface-subtle)', borderRadius: 6, border: '1px solid var(--sap-border-subtle)' }}>
                  <div style={{ fontSize: 11, color: 'var(--sap-text-muted)', fontWeight: 500 }}>Idle Pool Timeout</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sap-text-dark)', marginTop: 2 }}>10 Minutes</div>
                  <div style={{ fontSize: 10.5, color: 'var(--sap-text-subtle)', marginTop: 2 }}>Automatic teardown of inactive RFC connections</div>
                </div>
              </div>
            </div>

            <div className="sap-toolbar sap-admin-users-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 360 }}>
                <SearchInput
                  placeholder="Filter allowlist patterns..."
                  value={allowlistSearch}
                  onChange={(e) => setAllowlistSearch(e.target.value)}
                  wrapperStyle={{ width: '100%' }}
                  style={{ height: 32, fontSize: 12 }}
                />
              </div>

              <button
                type="button"
                className="sap-button primary"
                onClick={handleOpenAddAllowlistModal}
                style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 14px' }}
              >
                <Plus size={14} />
                <span>Add Allowlist Pattern</span>
              </button>
            </div>

            <div className="sap-admin-table-scroll sap-table-container" tabIndex={0} role="region" aria-label="Allowlist Table">
              <table className="sap-table sap-admin-compact-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: 260 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 280 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Host / IP / CIDR Pattern</th>
                    <th>Environment</th>
                    <th>Comment</th>
                    <th>Created date</th>
                    <th className="actions-column" style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAllowlist.length > 0 ? (
                    filteredAllowlist.map((rule) => {
                      const envKey = (rule.type || '').toLowerCase().startsWith('prod') ? 'prod' :
                                     (rule.type || '').toLowerCase().startsWith('dev') ? 'dev' :
                                     (rule.type || '').toLowerCase().startsWith('qa') ? 'qa' : 'sandbox';
                      return (
                        <tr key={rule.id}>
                          <td>
                            <code style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--sap-text-dark)', fontSize: 12 }}>
                              {rule.pattern}
                            </code>
                          </td>
                          <td>
                            <span className={`sap-env-badge sap-env-badge-${envKey}`}>
                              {rule.type || 'Sandbox'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 12 }}>
                            {rule.comment || '—'}
                          </td>
                          <td style={{ color: 'var(--sap-text-muted)', fontSize: 11.5 }}>
                            {rule.created_at ? new Date(rule.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="actions-column" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="rx-table-action-delete"
                              onClick={() => handleDeleteAllowlistRule(rule)}
                              title="Delete Pattern"
                              aria-label="Delete Pattern"
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--sap-text-subtle)' }}>
                        No allowlist patterns found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
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
        iconColor="var(--color-blue-600)"
        isLoading={userSubmitting}
        maxWidth={480}
        closeOnEscape={true}
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="sap-button"
              onClick={() => setIsUserModalOpen(false)}
              disabled={userSubmitting}
              style={{ height: 32, fontSize: 'var(--sap-size-button)', padding: '0 16px', fontWeight: 500 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-user-modal-form"
              className="sap-button primary"
              disabled={userSubmitting}
              style={{ height: 32, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 90, fontWeight: 600 }}
            >
              {userSubmitting ? 'Creating...' : 'Create User'}
            </button>
          </div>
        }
      >
        <form id="add-user-modal-form" onSubmit={handleCreateUser} className="flex flex-col gap-4">
          {userModalError && (
            <Notification
              placement="popup"
              type="error"
              message={userModalError}
              onClose={() => setUserModalError('')}
            />
          )}

          <FieldWrapper
            label="Email Address"
            htmlFor="add-user-email"
            required
          >
            <input
              id="add-user-email"
              type="email"
              className="rx-input"
              placeholder="Ex. engineer@nextitpoint.com"
              value={userFormData.email}
              onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
              required
              autoFocus
            />
          </FieldWrapper>

          <FieldWrapper
            label="Temporary Password"
            htmlFor="add-user-pwd"
            required
            hint="Minimum 6 characters"
          >
            <PasswordInput
              id="add-user-pwd"
              placeholder="Minimum 6 characters"
              value={userFormData.password}
              onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
              leftIcon={<KeyRound size={16} />}
              className="rx-input"
              style={{ height: 'var(--size-form-input-height)', fontFamily: 'var(--font-sans)' }}
            />
          </FieldWrapper>

          <FieldWrapper
            label="System Role"
            htmlFor="add-user-role"
            required
          >
            <select
              id="add-user-role"
              className="rx-select"
              value={userFormData.role}
              onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
            >
              <option value="user">Standard User (Permitted servers only)</option>
              <option value="admin">Administrator (Full platform &amp; user control)</option>
            </select>
          </FieldWrapper>
        </form>
      </Modal>

      {/* =========================================================================
      {/* =========================================================================
          MODAL: ASSIGN OWNER TO UNOWNED SAP SERVER
         ========================================================================= */}
      <Modal
        isOpen={assignOwnerModal.isOpen}
        onClose={() => !assignOwnerModal.isSubmitting && setAssignOwnerModal((prev) => ({ ...prev, isOpen: false }))}
        title="Assign Server Owner"
        subtitle={`Assign SAP server "${assignOwnerModal.server?.name || ''}" to a registered user`}
        icon={UserPlus}
        iconColor="var(--sap-primary)"
        maxWidth={480}
      >
        <form onSubmit={handleAssignOwnerSubmit}>
          {assignOwnerModal.error && (
            <Notification
              placement="inline"
              type="error"
              message={assignOwnerModal.error}
              onClose={() => setAssignOwnerModal((prev) => ({ ...prev, error: '' }))}
              style={{ marginBottom: 12 }}
            />
          )}

          <FormSection>
            <FieldWrapper label="Select Owner" required htmlFor="assign-owner-select" hint="The selected user will own this server and can use it for BOM operations">
              <select
                id="assign-owner-select"
                className="sap-input"
                value={assignOwnerModal.selectedUserId}
                onChange={(e) => setAssignOwnerModal((prev) => ({ ...prev, selectedUserId: e.target.value }))}
                style={{ width: '100%', height: 34 }}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email} ({u.role})
                  </option>
                ))}
              </select>
            </FieldWrapper>
          </FormSection>

          <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-button"
              onClick={() => setAssignOwnerModal((prev) => ({ ...prev, isOpen: false }))}
              disabled={assignOwnerModal.isSubmitting}
              style={{ height: 32, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-button primary"
              disabled={assignOwnerModal.isSubmitting}
              style={{ height: 32, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 100 }}
            >
              {assignOwnerModal.isSubmitting ? 'Assigning...' : 'Assign Owner'}
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

      {/* =========================================================================
          MODAL: RESET PASSWORD RESULT (Display Temporary Password & Copy Button)
         ========================================================================= */}
      <Modal
        isOpen={resetResultModal.isOpen}
        onClose={() => setResetResultModal({ isOpen: false, user: null, initialPassword: '', copied: false })}
        title="Password Reset Successfully"
        subtitle={resetResultModal.user ? `Account: ${resetResultModal.user.email}` : ''}
        icon={KeyRound}
        iconColor="var(--sap-primary)"
        maxWidth={480}
      >
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--sap-text-primary)', lineHeight: 1.5 }}>
          A temporary password has been generated for this user. The user will be required to create a new password upon their next login.
        </p>

        <div style={{
          background: 'var(--color-surface-subtle)',
          border: '1px solid var(--sap-border-subtle)',
          borderRadius: 'var(--sap-radius-card)',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16
        }}>
          <code style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.05em',
            color: 'var(--sap-text-dark)',
            wordBreak: 'break-all'
          }}>
            {resetResultModal.initialPassword}
          </code>
          <button
            type="button"
            className="sap-button"
            onClick={() => {
              if (navigator?.clipboard?.writeText) {
                navigator.clipboard.writeText(resetResultModal.initialPassword);
                setResetResultModal((prev) => ({ ...prev, copied: true }));
                setTimeout(() => setResetResultModal((prev) => ({ ...prev, copied: false })), 2000);
              }
            }}
            style={{ height: 30, fontSize: 12, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            {resetResultModal.copied ? <Check size={13} color="var(--color-success)" /> : <Copy size={13} />}
            <span>{resetResultModal.copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            type="button"
            className="sap-button primary"
            onClick={() => setResetResultModal({ isOpen: false, user: null, initialPassword: '', copied: false })}
            style={{ height: 32, fontSize: 'var(--sap-size-button)', padding: '0 20px', minWidth: 90 }}
          >
            Done
          </button>
        </div>
      </Modal>

      {/* =========================================================================
          MODAL: ADD SERVER ALLOWLIST PATTERN
         ========================================================================= */}
      <Modal
        isOpen={isAllowlistModalOpen}
        onClose={() => !allowlistSubmitting && setIsAllowlistModalOpen(false)}
        title="Add Server Allowlist Pattern"
        subtitle="Specify allowed hostnames, IP addresses, or CIDR subnets"
        icon={Shield}
        iconColor="var(--sap-primary)"
        maxWidth={500}
      >
        <form onSubmit={handleCreateAllowlistRule}>
          {allowlistModalError && (
            <Notification
              placement="inline"
              type="error"
              message={allowlistModalError}
              onClose={() => setAllowlistModalError('')}
            />
          )}

          <FormSection>
            <FieldWrapper label="Host / IP / CIDR Pattern" required htmlFor="allowlist-pattern" hint="e.g. 192.168.1.0/24, 103.206.249.51, 10.*, or *.corp">
              <input
                id="allowlist-pattern"
                type="text"
                className="sap-input"
                placeholder="192.168.1.0/24 or 10.*"
                value={allowlistFormData.pattern}
                onChange={(e) => setAllowlistFormData((prev) => ({ ...prev, pattern: e.target.value }))}
                required
                style={{ width: '100%', height: 32 }}
              />
            </FieldWrapper>

            <FieldWrapper label="Environment" required htmlFor="allowlist-type">
              <select
                id="allowlist-type"
                className="sap-input"
                value={allowlistFormData.type}
                onChange={(e) => setAllowlistFormData((prev) => ({ ...prev, type: e.target.value }))}
                style={{ width: '100%', height: 32 }}
              >
                <option value="Sandbox">Sandbox</option>
                <option value="Development">Development</option>
                <option value="QA">QA</option>
                <option value="Production">Production</option>
              </select>
            </FieldWrapper>

            <FieldWrapper label="Comment / Purpose" htmlFor="allowlist-comment" hint="Describe the destination or reason for this entry">
              <input
                id="allowlist-comment"
                type="text"
                className="sap-input"
                placeholder="e.g. Corporate SAP ECC Gateway"
                value={allowlistFormData.comment}
                onChange={(e) => setAllowlistFormData((prev) => ({ ...prev, comment: e.target.value }))}
                style={{ width: '100%', height: 32 }}
              />
            </FieldWrapper>
          </FormSection>

          <div className="sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              className="sap-button"
              onClick={() => setIsAllowlistModalOpen(false)}
              disabled={allowlistSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="sap-button primary"
              disabled={allowlistSubmitting}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 18px', minWidth: 100 }}
            >
              {allowlistSubmitting ? 'Adding...' : 'Add Pattern'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
