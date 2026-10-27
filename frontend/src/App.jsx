import React, { useState, useEffect, useRef } from 'react';
import {
  LogOut,
  User,
  Menu,
  X,
  ChevronDown,
  AlertTriangle,
  LayoutGrid,
  Copy,
  FileSpreadsheet,
  Trash2,
  Search,
  Eye,
  ShieldCheck,
  Server,
  PlusSquare,
  FilePlus,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import Login from './components/Login';
import ChatBox from './components/ChatBox';
import FioriLaunchpad from './components/FioriLaunchpad';
import CopyBomView from './components/CopyBomView';
import DeleteBomView from './components/DeleteBomView';
import BomExplorerView from './components/BomExplorerView';
import BulkBomView from './components/BulkBomView';
import ValidateBomView from './components/ValidateBomView';
import CreateBomView from './components/CreateBomView';
import BulkCreateBomView from './components/BulkCreateBomView';

import AdminView from './components/AdminView';
import Modal from './components/Modal';
import PasswordModal from './components/PasswordModal';
import {
  checkSession,
  logoutUser,
  getAuthConfig,
  getSapSessionStatus,
  selectSapSession,
  getAvailableServers,
  setSelectedServerHeader,
  prefetchPlants,
  getServerModules
} from './services/api';
import { MODULE_REGISTRY, getModuleKeyForAction, getAppKeyForAction, normalizePermissions, ALL_BOM_APPS, hasCardPermission } from '@shared/modules.js';
import nextItPointLogo from './assets/next_it_point_logo.png';
import activityTracker from './services/activityTracker';
import { HEADER_BRAND_TITLE } from './config/branding';

export default function App() {
  const [user, setUser] = useState(null);
  const [authConfig, setAuthConfig] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // SAP Server selection state (dynamically loaded per user permissions)
  const [availableServers, setAvailableServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [currentSystem, setCurrentSystem] = useState('DEV'); // 'DEV' | 'QA' | 'PROD'
  const [enabledModules, setEnabledModules] = useState([]);
  const [isLoadingServers, setIsLoadingServers] = useState(true);

  // Application view state
  const [activeTab, setActiveTab] = useState('launchpad'); // 'launchpad' | 'copy_bom' | 'delete_bom' | 'bom_explorer' | 'validate_bom' | 'bulk_bom' | 'admin' | 'material_search'
  const [launchpadSubView, setLaunchpadSubView] = useState('home'); // 'home' | 'bom_operations'
  const [selectedHomeGroup, setSelectedHomeGroup] = useState('');
  const [prefilledMaterial, setPrefilledMaterial] = useState('');
  const [prefilledPlant, setPrefilledPlant] = useState('');

  const handleMaterialActionNavigate = (action, params = {}) => {
    setPrefilledMaterial(params.material || '');
    setPrefilledPlant(params.plant || '');
    setActiveTab(action);
  };

  const isBomScreen = Boolean(
    user && (
      ['create_bom', 'bulk_create_bom', 'copy_bom', 'bulk_bom', 'delete_bom', 'bom_explorer', 'validate_bom'].includes(activeTab) ||
      (activeTab === 'launchpad' && typeof launchpadSubView === 'string' && launchpadSubView.startsWith('bom'))
    )
  );

  const currentPermittedApps = user?.role === 'admin'
    ? ALL_BOM_APPS
    : normalizePermissions(selectedServer?.permissions || []);
  const activeAppKey = getAppKeyForAction(activeTab);
  const hasAppAccess = !activeAppKey || user?.role === 'admin' || currentPermittedApps.includes(activeAppKey);

  // Logout confirmation modal state
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [hasInterruptionRisk, setHasInterruptionRisk] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState(false);
  const [isSwitchingSession, setIsSwitchingSession] = useState(false);
  const sessionDropdownRef = useRef(null);
  const userMenuRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message, type = 'success') => {
    setToastMessage({ message, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const [sapSession, setSapSession] = useState({
    connected: false,
    status: 'CHECKING',
    message: 'Checking SAP connection...',
    system: '',
    client: '',
    user: '',
    selectedUser: '',
    selectedSessionId: null,
    sessions: []
  });

  // Close session dropdown & user profile menu when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event) {
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(event.target)) {
        setIsSessionDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsSessionDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Check URL hash for admin routing on initial load
  useEffect(() => {
    if (window.location.hash === '#admin' || window.location.pathname === '/admin') {
      if (user?.role === 'admin') {
        setActiveTab('admin');
      }
    }
  }, [user]);

  // Verify active session on initial mount
  useEffect(() => {
    async function verifyAuth() {
      try {
        const config = await getAuthConfig();
        setAuthConfig(config);

        const sessionData = await checkSession();
        if (sessionData.authenticated && sessionData.user) {
          setUser(sessionData.user);
        }
      } catch {
        setUser(null);
      } finally {
        setIsCheckingAuth(false);
      }
    }

    verifyAuth();
  }, []);

  // Load available SAP servers for the current authenticated user
  useEffect(() => {
    if (!user) {
      setAvailableServers([]);
      setSelectedServer(null);
      setSelectedServerHeader(null);
      setIsLoadingServers(false);
      return;
    }

    async function loadServers() {
      setIsLoadingServers(true);
      try {
        const servers = await getAvailableServers();
        setAvailableServers(servers || []);

        if (servers && servers.length > 0) {
          // If previously saved server exists and is in available list, pick it; otherwise select first
          const savedId = localStorage.getItem('selected_server_id');
          const matched = servers.find((s) => s.id === savedId) || servers[0];
          setSelectedServer(matched);
          setSelectedServerHeader(matched.id);
          setCurrentSystem(matched.environment || 'DEV');
        } else {
          setSelectedServer(null);
          setSelectedServerHeader(null);
        }
      } catch (err) {
        console.error('Failed to load permitted servers for user:', err);
      } finally {
        setIsLoadingServers(false);
      }
    }

    loadServers();
  }, [user]);

  // Load enabled modules whenever selected server changes (Admin always sees all registered modules)
  useEffect(() => {
    if (user?.role === 'admin') {
      // Admin bypass: always sees all registered modules independent of server existence
      const allKeys = MODULE_REGISTRY.map((m) => m.key);
      setEnabledModules(allKeys);
      return;
    }

    if (!selectedServer?.id) {
      setEnabledModules([]);
      return;
    }

    async function loadModules() {
      try {
        const modules = await getServerModules(selectedServer.id);
        setEnabledModules(modules || []);
      } catch (err) {
        console.error('Failed to load server modules:', err);
        setEnabledModules([]);
      }
    }

    loadModules();
  }, [selectedServer?.id, user?.role]);

  const handleServerChange = (serverId) => {
    const chosen = availableServers.find((s) => s.id === serverId);
    if (chosen) {
      setSelectedServer(chosen);
      setSelectedServerHeader(chosen.id);
      setCurrentSystem(chosen.environment || 'DEV');
      setSelectedHomeGroup('');
    }
  };

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setSelectedHomeGroup('');
    const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null;
    if (savedId) prefetchPlants(savedId);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Ignore network errors during logout
    } finally {
      setUser(null);
      setAvailableServers([]);
      setSelectedServer(null);
      setActiveTab('launchpad');
      setLaunchpadSubView('home');
      setSelectedHomeGroup('');
    }
  };

  const handleOpenLogoutModal = () => {
    const risk = Boolean(isSwitchingSession || activityTracker.hasRunningOrPending());
    setHasInterruptionRisk(risk);
    setIsLogoutModalOpen(true);
  };

  const handleCloseLogoutModal = () => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  };

  const handleConfirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      await handleLogout();
    } finally {
      setIsLoggingOut(false);
      setIsLogoutModalOpen(false);
    }
  };

  // Live risk sync when logout modal is open
  useEffect(() => {
    if (!isLogoutModalOpen) return;

    const updateRisk = () => {
      const risk = Boolean(isSwitchingSession || activityTracker.hasRunningOrPending());
      setHasInterruptionRisk(risk);
    };

    updateRisk();
    const unsubscribe = activityTracker.subscribe(updateRisk);

    return () => {
      unsubscribe();
    };
  }, [isLogoutModalOpen, isSwitchingSession]);

  const handleSelectSession = async (sessionId) => {
    if (!sessionId || isSwitchingSession) return;
    setIsSwitchingSession(true);
    try {
      const res = await selectSapSession(sessionId);
      if (res.success) {
        if (res.health) {
          setSapSession(res.health);
        } else {
          setSapSession((prev) => ({
            ...prev,
            selectedSessionId: res.selectedSessionId,
            selectedUser: res.selectedUser,
            user: res.selectedUser,
            connected: true,
            status: 'CONNECTED',
            code: 'CONNECTED'
          }));
        }
        setIsSessionDropdownOpen(false);
      }
    } catch (err) {
      console.error('Failed to select SAP session:', err);
    } finally {
      setIsSwitchingSession(false);
    }
  };

  // SAP GUI Heartbeat monitoring: Polls /api/sap/session-status every ~5s
  useEffect(() => {
    if (!user) return;

    // If user has no permitted servers, do not poll SAP status or sessions
    if (!availableServers || availableServers.length === 0) {
      setSapSession({
        connected: false,
        status: 'DISCONNECTED',
        message: 'No SAP servers assigned to your account.',
        sessions: []
      });
      return;
    }

    let isMounted = true;
    let timeoutId = null;
    let isPolling = false;

    const pollStatus = async () => {
      if (isPolling || !isMounted) return;
      isPolling = true;
      try {
        const data = await getSapSessionStatus(selectedServer?.id);
        if (isMounted && data) {
          setSapSession(data);
        }
      } catch (err) {
        if (isMounted) {
          setSapSession({
            connected: false,
            status: 'SERVER_UNAVAILABLE',
            message: 'The SAP server is currently unavailable. Please start/reconnect SAP and try again.',
            sessions: []
          });
        }
      } finally {
        isPolling = false;
        if (isMounted) {
          timeoutId = setTimeout(pollStatus, 5000);
        }
      }
    };

    pollStatus();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, selectedServer?.id, availableServers.length]);

  if (isCheckingAuth) {
    return (
      <div className="sap-login-viewport" style={{ color: 'var(--sap-shell-text)', flexDirection: 'column', gap: 16 }}>
        <span className="sap-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
        <p style={{ fontSize: 14, opacity: 0.8 }}>Initializing session...</p>
      </div>
    );
  }

  if (!user) {
    return <Login authConfig={authConfig} onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="sap-app-root">
      {/* SAP Shell Top Header */}
      <header className="sap-shell-header">
        <div className="sap-brand">
          <div className="sap-brand-logo-container" title="Next IT Point">
            <img src={nextItPointLogo} alt="Next IT Point" className="sap-brand-logo-img" />
          </div>
          <span className="sap-brand-divider">|</span>
          <span className="sap-brand-title">{HEADER_BRAND_TITLE}</span>
        </div>

        {/* Desktop actions and user badge */}
        <div className="sap-shell-actions">
          {/* Dynamic SAP Server Selector (populated from permitted servers) */}
          <div className="sap-system-select-wrapper">
            <span className="sap-system-label">Server:</span>
            {availableServers.length === 1 ? (
              // Single server: read-only label in header style with neutral env tag
              <span
                className="sap-system-static-label"
                title={`${selectedServer?.name || ''}${selectedServer?.environment ? ` (${selectedServer.environment})` : ''}`}
              >
                <span className="sap-system-static-name">{selectedServer?.name}</span>
                {selectedServer?.environment && (
                  <span className="sap-system-env-tag">
                    ({selectedServer.environment})
                  </span>
                )}
              </span>
            ) : availableServers.length > 1 ? (
              // Multiple permitted servers: render dropdown selector
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <select
                  value={selectedServer?.id || ''}
                  onChange={(e) => handleServerChange(e.target.value)}
                  className={`sap-system-select ${selectedServer?.environment === 'PROD' ? 'prod' : ''}`}
                >
                  {availableServers.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} ({srv.environment})
                    </option>
                  ))}
                </select>
                {selectedServer?.environment === 'PROD' && (
                  <span className="sap-badge sap-badge-danger" style={{ fontSize: '10px', padding: '2px 6px' }}>
                    PROTECTED
                  </span>
                )}
              </div>
            ) : (
              <span className="sap-badge sap-badge-danger" style={{ fontSize: '11px', padding: '3px 8px' }}>
                No Permitted Servers
              </span>
            )}
          </div>

          {/* SAP GUI Session Selector & RFC Status Pill (only visible when user has permitted servers) */}
          {availableServers.length > 0 && (
            <>
              {/* SAP GUI Session Selector */}
              <div className="sap-session-select-wrapper" ref={sessionDropdownRef}>
                <span className="sap-session-label">Session:</span>
                <button
                  type="button"
                  className={`sap-session-selector-btn ${sapSession.code === 'SELECTED_SESSION_UNAVAILABLE' ? 'error' : ''}`}
                  onClick={() => setIsSessionDropdownOpen(!isSessionDropdownOpen)}
                  title={sapSession.message || 'Click to select active SAP GUI session'}
                >
                  <span className="sap-session-user-text">
                    {sapSession.selectedUser || sapSession.user || 'No Session'}
                  </span>
                  {sapSession.system && sapSession.client && (
                    <span className="sap-session-env-sub">
                      ({sapSession.system}/{sapSession.client})
                    </span>
                  )}
                  <ChevronDown size={14} className={`sap-chevron ${isSessionDropdownOpen ? 'open' : ''}`} />
                </button>

                {isSessionDropdownOpen && (
                  <div className="sap-session-dropdown-menu">
                    <div className="sap-session-dropdown-header">
                      <span>SAP Session</span>
                      <span className="sap-session-count-badge">
                        {sapSession.sessions?.length || 0} active
                      </span>
                    </div>

                    {sapSession.code === 'SELECTED_SESSION_UNAVAILABLE' && (
                      <div className="sap-session-alert-banner">
                        <AlertTriangle size={14} />
                        <span>Selected session disconnected. Please choose an active session:</span>
                      </div>
                    )}

                    <div className="sap-session-list">
                      {sapSession.sessions && sapSession.sessions.length > 0 ? (
                        sapSession.sessions.map((sess) => {
                          const isSelected = sess.id === sapSession.selectedSessionId || sess.selected;
                          return (
                            <button
                              key={sess.id}
                              type="button"
                              className={`sap-session-item ${isSelected ? 'selected' : ''}`}
                              onClick={() => handleSelectSession(sess.id)}
                              disabled={isSwitchingSession}
                            >
                              <span className="sap-session-radio">
                                {isSelected ? '●' : '○'}
                              </span>
                              <div className="sap-session-item-content">
                                <div className="sap-session-item-top">
                                  <strong className="sap-session-item-user">{sess.user}</strong>
                                  <span className="sap-session-item-env">
                                    {sess.system} / {sess.client}
                                  </span>
                                  {isSelected && (
                                    <span className="sap-session-active-pill">Selected</span>
                                  )}
                                </div>
                                <div className="sap-session-item-sub">
                                  <span className="sap-session-item-title">
                                    {sess.title || sess.transaction || 'SAP Easy Access'}
                                  </span>
                                  <span className={`sap-session-item-status ${sess.busy ? 'busy' : 'ready'}`}>
                                    {sess.busy ? 'Busy' : 'Ready'}
                                  </span>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="sap-session-empty">
                          <p>No active SAP GUI sessions found.</p>
                          <small>Please open SAP GUI and log into a client.</small>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic SAP Session Status Badge */}
              <span
                className={`sap-session-pill status-${(sapSession.status || 'checking').toLowerCase()} ${
                  sapSession.code === 'SELECTED_SESSION_UNAVAILABLE' ? 'status-selected_session_unavailable' : ''
                }`}
                title={sapSession.message || `SAP Status: ${sapSession.status}`}
                onClick={
                  sapSession.code === 'SELECTED_SESSION_UNAVAILABLE'
                    ? () => setIsSessionDropdownOpen(true)
                    : undefined
                }
                style={sapSession.code === 'SELECTED_SESSION_UNAVAILABLE' ? { cursor: 'pointer' } : {}}
              >
                <span className={`sap-status-dot dot-${sapSession.connected ? 'connected' : (sapSession.status || 'checking').toLowerCase()}`}></span>
                <span className="sap-session-pill-text">
                  {sapSession.mode === 'RFC' && sapSession.connected ? (
                    <>SAP RFC ONLINE {sapSession.latencyMs ? `(${sapSession.latencyMs}ms)` : ''}</>
                  ) : sapSession.code === 'SELECTED_SESSION_UNAVAILABLE' ? (
                    <>SELECTED SESSION DISCONNECTED</>
                  ) : sapSession.status === 'CONNECTED' || sapSession.status === 'AVAILABLE' ? (
                    <>SAP CONNECTED</>
                  ) : sapSession.status === 'CHECKING' ? (
                    <>CHECKING SAP...</>
                  ) : sapSession.status === 'BUSY' ? (
                    <>SAP BUSY</>
                  ) : sapSession.status === 'SERVER_UNAVAILABLE' ? (
                    <>SAP SERVER UNAVAILABLE</>
                  ) : sapSession.status === 'DISCONNECTED' || sapSession.status === 'SESSION_NOT_FOUND' ? (
                    <>SAP DISCONNECTED</>
                  ) : (
                    <>SAP {sapSession.status}</>
                  )}
                </span>
              </span>
            </>
          )}

          {/* Admin Navigation Button (Only visible for admin role) */}
          {user.role === 'admin' && (
            <button
              type="button"
              className={`sap-btn ${activeTab === 'admin' ? 'sap-btn-primary' : 'sap-btn-ghost'} sap-admin-nav-btn`}
              onClick={() => setActiveTab(activeTab === 'admin' ? 'launchpad' : 'admin')}
              title="Enterprise Administration & Permissions"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                height: 32,
                padding: '0 12px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                background: activeTab === 'admin' ? 'var(--sap-admin-pill-bg)' : 'rgba(255,255,255,0.08)',
                color: 'var(--sap-shell-text)',
                border: '1px solid rgba(255,255,255,0.18)'
              }}
            >
              <ShieldCheck size={15} />
              <span className="sap-header-btn-text">Admin</span>
            </button>
          )}

          {/* User Profile Avatar Chip */}
          <div className="sap-user-menu-wrapper" ref={userMenuRef}>
            <button
              type="button"
              className={`sap-user-avatar-btn ${isUserMenuOpen ? 'active' : ''}`}
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              title={user.email}
              aria-label={`User profile menu for ${user.email}`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="true"
            >
              <div className={`sap-user-avatar-circle ${user.role === 'admin' ? 'admin' : ''}`}>
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <ChevronDown size={13} className={`sap-user-chevron ${isUserMenuOpen ? 'open' : ''}`} />
            </button>

            {isUserMenuOpen && (
              <div className="sap-user-dropdown-menu" role="menu">
                <div className="sap-user-dropdown-header">
                  <div className="sap-user-dropdown-email" title={user.email}>
                    {user.email}
                  </div>
                  <span className={`sap-role-badge ${user.role === 'admin' ? 'sap-role-badge-admin' : 'sap-role-badge-user'}`} style={{ fontSize: 10.5 }}>
                    {user.role === 'admin' && <ShieldCheck size={11} />}
                    {user.role ? user.role.toUpperCase() : 'USER'}
                  </span>
                </div>

                <div className="sap-user-dropdown-items">
                  <button
                    type="button"
                    className="sap-user-menu-item"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsChangePasswordOpen(true);
                    }}
                    role="menuitem"
                  >
                    <KeyRound size={14} color="var(--sap-primary, #0a6ed1)" className="sap-user-menu-icon" />
                    <span className="sap-user-menu-label">Change password</span>
                  </button>

                  <div className="sap-user-menu-divider" />

                  <button
                    type="button"
                    className="sap-user-menu-item sap-user-menu-danger"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleOpenLogoutModal();
                    }}
                    role="menuitem"
                  >
                    <LogOut size={14} className="sap-user-menu-icon" />
                    <span className="sap-user-menu-label">Log out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile menu toggle button */}
        <button
          type="button"
          className="sap-mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? 'Close menu' : 'Open navigation menu'}
          aria-expanded={isMobileMenuOpen}
        >
          {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="sap-mobile-dropdown">
            <div className="sap-mobile-user-info">
              <User size={16} color="var(--sap-text-subtle)" />
              <span>Signed in as <strong>{user.email}</strong> ({user.role})</span>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsChangePasswordOpen(true);
                }}
                style={{ height: 28, fontSize: 11.5, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4 }}
              >
                <KeyRound size={13} />
                <span>Change password</span>
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--sap-text-subtle)' }}>Server:</span>
              {availableServers.length > 1 ? (
                <select
                  value={selectedServer?.id || ''}
                  onChange={(e) => handleServerChange(e.target.value)}
                  className={`sap-system-select ${selectedServer?.environment === 'PROD' ? 'prod' : ''}`}
                  style={{ flex: 1 }}
                >
                  {availableServers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.environment})</option>
                  ))}
                </select>
              ) : (
                <span
                  style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sap-shell-text)' }}
                  title={`${selectedServer?.name || ''}${selectedServer?.environment ? ` (${selectedServer.environment})` : ''}`}
                >
                  {selectedServer?.name || 'No Servers'}
                  {selectedServer?.environment && (
                    <span className="sap-system-env-tag">
                      ({selectedServer.environment})
                    </span>
                  )}
                </span>
              )}
            </div>

            {/* Mobile Navigation Tabs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: '12px', color: 'var(--sap-text-subtle)' }}>Applications:</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  className={`sap-btn sap-btn-secondary ${activeTab === 'launchpad' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('launchpad');
                    setLaunchpadSubView('home');
                    setIsMobileMenuOpen(false);
                  }}
                  style={{ fontSize: '12px', padding: '6px' }}
                >
                  <LayoutGrid size={14} />
                  <span>Launchpad</span>
                </button>

                {/* Dynamic Mobile Shortcuts from Enabled Modules */}
                {MODULE_REGISTRY
                  .filter((mod) => enabledModules.includes(mod.key))
                  .flatMap((mod) => {
                    const items = [];
                    (mod.subApps || []).forEach((sa) => {
                      if (sa.children) {
                        items.push(...sa.children);
                      } else {
                        items.push(sa);
                      }
                    });
                    return items;
                  })
                  .filter((op) => hasCardPermission(op, currentPermittedApps, user?.role))
                  .map((op) => {
                    const iconMap = {
                      Search,
                      Eye,
                      Copy,
                      FileSpreadsheet,
                      ShieldCheck,
                      Trash2,
                      PlusSquare,
                      FilePlus
                    };
                    const Icon = iconMap[op.iconName] || Search;
                    return (
                      <button
                        key={op.action || op.id}
                        type="button"
                        className={`sap-btn sap-btn-secondary ${activeTab === op.action ? 'active' : ''}`}
                        onClick={() => {
                          setActiveTab(op.action);
                          setIsMobileMenuOpen(false);
                        }}
                        style={{ fontSize: '12px', padding: '6px' }}
                      >
                        <Icon size={14} />
                        <span>{op.title}</span>
                      </button>
                    );
                  })}

                {user.role === 'admin' && (
                  <button
                    type="button"
                    className={`sap-btn sap-btn-secondary ${activeTab === 'admin' ? 'active' : ''}`}
                    onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
                    style={{ fontSize: '12px', padding: '6px', gridColumn: 'span 2', background: 'var(--sap-admin-pill-bg)', color: 'var(--sap-admin-pill-text)' }}
                  >
                    <ShieldCheck size={14} />
                    <span>Admin Panel</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              className="sap-btn sap-btn-secondary sap-mobile-action-btn"
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleOpenLogoutModal();
              }}
              style={{ color: 'var(--sap-error)', borderColor: 'var(--sap-error-border)' }}
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main SAP Fiori Workspace Layout */}
      <main className="sap-assistant-layout">
        {activeTab === 'launchpad' && (
          <FioriLaunchpad
            sapSession={sapSession}
            systemKey={currentSystem}
            subView={launchpadSubView}
            onSubViewChange={setLaunchpadSubView}
            onOpenAction={(action) => setActiveTab(action)}
            enabledModules={enabledModules}
            userRole={user.role}
            userPermissions={currentPermittedApps}
            selectedGroup={selectedHomeGroup}
            onSelectGroup={setSelectedHomeGroup}
            isLoading={isLoadingServers}
          />
        )}

        {/* Admin Serverless Gate: When an admin opens an operational card requiring an SAP server, but 0 servers exist */}
        {activeTab !== 'launchpad' && activeTab !== 'admin' && !selectedServer && user?.role === 'admin' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 24px',
              textAlign: 'center',
              maxWidth: 540,
              margin: '60px auto',
              background: 'var(--sap-card-bg)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--sap-border-subtle)',
              boxShadow: 'var(--sap-shadow-md)'
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 'var(--radius-full)',
                background: 'rgba(10, 110, 209, 0.1)',
                color: 'var(--sap-primary, #0a6ed1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16
              }}
            >
              <Server size={30} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sap-text-dark)', margin: '0 0 8px' }}>
              Add a SAP server first
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sap-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              No SAP server has been added to the system yet. To perform operations in this module, please add and configure an SAP server in the Administration panel.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="sap-btn sap-btn-primary"
                onClick={() => setActiveTab('admin')}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                <ShieldCheck size={16} />
                <span>Go to Admin &gt; Servers</span>
              </button>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={() => {
                  setActiveTab('launchpad');
                  setLaunchpadSubView('bom_operations');
                }}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                Return to BOM Hub
              </button>
            </div>
          </div>
        )}

        {/* Module Guard: Render "Not available for this server" for non-admins if navigating to an unenabled module */}
        {activeTab !== 'launchpad' && activeTab !== 'admin' && user?.role !== 'admin' && getModuleKeyForAction(activeTab) && !enabledModules.includes(getModuleKeyForAction(activeTab)) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 24px',
              textAlign: 'center',
              maxWidth: 520,
              margin: '60px auto',
              background: 'var(--sap-card-bg)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--sap-border-subtle)',
              boxShadow: 'var(--sap-shadow-md)'
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 'var(--radius-full)',
                background: 'var(--sap-error-bg)',
                color: 'var(--sap-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16
              }}
            >
              <ShieldCheck size={30} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sap-text-dark)', margin: '0 0 8px' }}>
              Not Available For This Server
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sap-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              This module is not enabled for{' '}
              <strong>{selectedServer?.name || 'this server'}</strong>.
              Please switch to another server or contact an administrator to enable access.
            </p>
            <button
              type="button"
              className="sap-btn sap-btn-primary"
              onClick={() => {
                setActiveTab('launchpad');
                setLaunchpadSubView('home');
              }}
              style={{ padding: '8px 18px', fontSize: 13 }}
            >
              Return to Launchpad
            </button>
          </div>
        )}

        {/* App Permission Guard: Direct URL or deep link to non-permitted app */}
        {activeTab !== 'launchpad' && activeTab !== 'admin' && !hasAppAccess && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 24px',
              textAlign: 'center',
              maxWidth: 520,
              margin: '60px auto',
              background: 'var(--sap-card-bg)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--sap-border-subtle)',
              boxShadow: 'var(--sap-shadow-md)'
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 'var(--radius-full)',
                background: 'var(--sap-error-bg)',
                color: 'var(--sap-error)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16
              }}
            >
              <ShieldCheck size={30} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sap-text-dark)', margin: '0 0 8px' }}>
              You don't have access to this feature
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sap-text-muted)', margin: '0 0 20px', lineHeight: 1.5 }}>
              You do not have permission to run this feature on{' '}
              <strong>{selectedServer?.name || 'this server'}</strong>.
              Please switch to another server or contact an administrator to request access.
            </p>
            <button
              type="button"
              className="sap-btn sap-btn-primary"
              onClick={() => {
                setActiveTab('launchpad');
                setLaunchpadSubView('home');
              }}
              style={{ padding: '8px 18px', fontSize: 13 }}
            >
              Back to Launchpad
            </button>
          </div>
        )}

        {activeTab === 'create_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('create_bom') || enabledModules.includes(getModuleKeyForAction('create_bom'))) && (
          <CreateBomView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_create_operations');
            }}
            onNavigateBom={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'bulk_create_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bulk_create_bom') || enabledModules.includes(getModuleKeyForAction('bulk_create_bom'))) && (
          <BulkCreateBomView
            systemKey={currentSystem}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_create_operations');
            }}
            onNavigateBom={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'copy_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('copy_bom') || enabledModules.includes(getModuleKeyForAction('copy_bom'))) && (
          <CopyBomView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_copy_operations');
            }}
            onNavigateBom={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'bulk_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bulk_bom') || enabledModules.includes(getModuleKeyForAction('bulk_bom'))) && (
          <BulkBomView
            systemKey={currentSystem}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_copy_operations');
            }}
            onNavigateBom={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'delete_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('delete_bom') || enabledModules.includes(getModuleKeyForAction('delete_bom'))) && (
          <DeleteBomView
            systemKey={currentSystem}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'bom_explorer' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bom_explorer') || enabledModules.includes(getModuleKeyForAction('bom_explorer'))) && (
          <BomExplorerView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'validate_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('validate_bom') || enabledModules.includes(getModuleKeyForAction('validate_bom'))) && (
          <ValidateBomView
            systemKey={currentSystem}
            onBack={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('bom_operations');
            }}
            onNavigateHome={() => {
              setActiveTab('launchpad');
              setLaunchpadSubView('home');
            }}
          />
        )}

        {activeTab === 'admin' && (
          <AdminView
            currentUser={user}
            onBack={() => setActiveTab('launchpad')}
            onNavigateHome={() => setActiveTab('launchpad')}
          />
        )}
      </main>

      {/* Logout Confirmation Modal */}
      <Modal
        isOpen={isLogoutModalOpen}
        onClose={handleCloseLogoutModal}
        title="Log out?"
        icon={LogOut}
        isLoading={isLoggingOut}
        maxWidth={420}
      >
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sap-text-body)', lineHeight: 1.5 }}>
          Are you sure you want to log out?
        </p>

        {hasInterruptionRisk && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              marginBottom: 16,
              background: 'var(--sap-warning-bg, #fffbeb)',
              border: '1px solid var(--sap-warning-border, #fde68a)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--sap-warning-text, #b45309)',
              fontSize: 12.5,
              lineHeight: 1.4
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>A running operation may be interrupted.</span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={handleCloseLogoutModal}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sap-btn sap-btn-primary"
            onClick={handleConfirmLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </Modal>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`sap-alert sap-alert-${toastMessage.type === 'error' ? 'error' : 'success'}`}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: 13,
            fontWeight: 500
          }}
        >
          <CheckCircle2 size={16} />
          <span>{toastMessage.message}</span>
        </div>
      )}

      {/* User Change Password Modal */}
      <PasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        mode="user"
        onSuccess={(msg) => showToast(msg, 'success')}
      />
    </div>
  );
}
