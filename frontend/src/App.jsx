import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Layers,
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
  CheckCircle2,
  Mail,
  Send,
  Phone,
  MapPin,
  Check
} from 'lucide-react';
import Login from './components/Login';
import ChatBox from './components/ChatBox';
import FioriLaunchpad from './components/FioriLaunchpad';
import CopyBomView from './components/CopyBomView';
import DeleteBomView from './components/DeleteBomView';
import BomExplorerView from './components/BomExplorerView';
import BulkBomView from './components/BulkBomView';
import ValidateBomView from './components/ValidateBomView';
import { ToastProvider, toast } from './context/ToastContext';
import CreateBomView from './components/CreateBomView';
import BulkCreateBomView from './components/BulkCreateBomView';
import DesignSystemShowcase from './components/dev/DesignSystemShowcase';

import AdminView from './components/AdminView';
import Sidebar from './components/layout/Sidebar';
import CommandPalette from './components/layout/CommandPalette';
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
import rexaEdgeLogo from './assets/rexaedge_logo.png';
import rexaEdgeFullColourLogo from './assets/rexaedge_full_colour.png';
import HomePage from './components/HomePage';
import activityTracker from './services/activityTracker';
import { formatEnvironment, formatDisplayName } from './utils/textFormatters';
import { getNewestActiveServer } from './utils/serverUtils';
import { RouterProvider, useRouter, Link } from './context/RouterContext';
import {
  ROUTES,
  ROUTE_IDS,
  ACTION_TO_ROUTE_ID,
  SUBVIEW_TO_ROUTE_ID,
  normalizePath,
  isInternalPath,
  resolveLegacyRedirect,
  getRouteByPath,
  getRouteById,
  routeTo
} from './config/routes';
import AccessDeniedView from './components/AccessDeniedView';
import NotFoundView from './components/NotFoundView';

function AppContent({
  initialUser = null,
  initialCheckingAuth = true,
  initialServers = [],
  initialSelectedServer = null,
  initialActiveTab = 'home',
  initialLaunchpadSubView = 'home',
  initialEnabledModules = ['bom']
} = {}) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [authConfig, setAuthConfig] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(initialCheckingAuth);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  // SAP Server selection state (dynamically loaded per user permissions)
  const [availableServers, setAvailableServers] = useState(initialServers);
  const [selectedServer, setSelectedServer] = useState(initialSelectedServer);
  const [currentSystem, setCurrentSystem] = useState('DEV'); // 'DEV' | 'QA' | 'PROD'
  const [enabledModules, setEnabledModules] = useState(initialEnabledModules);
  const [isLoadingServers, setIsLoadingServers] = useState(initialServers.length === 0);

  // Application view state - defaults to modern Home page matching RexaEdge ERP portal
  const getInitialActiveTab = () => {
    if (initialActiveTab === 'launchpad' && (!initialLaunchpadSubView || initialLaunchpadSubView === 'home')) return 'home';
    if (initialActiveTab && initialActiveTab !== 'home') return initialActiveTab;
    const path = normalizePath(router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '/home'));
    if (path === '/dev/design-system') return import.meta.env.DEV ? 'dev_design_system' : 'not_found';
    if (path.startsWith('/admin')) return 'admin';
    if (path === '/products/bom/create/single') return 'create_bom';
    if (path === '/products/bom/create/bulk') return 'bulk_create_bom';
    if (path === '/products/bom/copy/single') return 'copy_bom';
    if (path === '/products/bom/copy/bulk') return 'bulk_bom';
    if (path === '/products/bom/display') return 'bom_explorer';
    if (path === '/products/bom/validate') return 'validate_bom';
    if (path === '/products/bom/delete') return 'delete_bom';
    if (path === '/products' || path === '/launchpad') return 'home';
    if (path.startsWith('/products')) return 'launchpad';
    if (path === '/home' || path === '/') return 'home';
    if (path === '/about' || path === '/contact' || path === '/signin') return 'home';
    return 'not_found';
  };

  const getInitialLaunchpadSubView = () => {
    if (initialLaunchpadSubView && initialLaunchpadSubView !== 'home') return initialLaunchpadSubView;
    const path = normalizePath(router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '/home'));
    if (path === '/products/bom/create') return 'bom_create_operations';
    if (path === '/products/bom/copy') return 'bom_copy_operations';
    if (path === '/products/bom') return 'bom_operations';
    return 'bom_operations';
  };

  const [activeTab, setActiveTab] = useState(getInitialActiveTab); // 'home' | 'launchpad' | 'copy_bom' | 'delete_bom' | 'bom_explorer' | 'validate_bom' | 'bulk_bom' | 'admin' | 'not_found' | 'access_denied'
  const [launchpadSubView, setLaunchpadSubView] = useState(getInitialLaunchpadSubView); // 'home' | 'bom_operations' | 'bom_create_operations' | 'bom_copy_operations'

  const getPathForView = (tab, subView) => {
    if (tab === 'home') return '/home';
    if (tab === 'launchpad') {
      if (subView === 'bom_operations') return '/products/bom';
      if (subView === 'bom_create_operations') return '/products/bom/create';
      if (subView === 'bom_copy_operations') return '/products/bom/copy';
      return '/home';
    }
    if (tab === 'admin_users') return '/admin/users';
    if (tab === 'admin_servers') return '/admin/servers';
    if (tab === 'admin_permissions') return '/admin/permissions';
    if (tab === 'admin_logs') return '/admin/logs/audit';
    if (tab === 'admin') {
      if (subView === 'servers') return '/admin/servers';
      if (subView === 'permissions') return '/admin/permissions';
      if (subView === 'logs' || subView === 'audit' || subView === 'activity-logs') return '/admin/logs/audit';
      return '/admin/users';
    }
    if (tab === 'create_bom') return '/products/bom/create/single';
    if (tab === 'bulk_create_bom') return '/products/bom/create/bulk';
    if (tab === 'copy_bom') return '/products/bom/copy/single';
    if (tab === 'bulk_bom') return '/products/bom/copy/bulk';
    if (tab === 'bom_explorer') return '/products/bom/display';
    if (tab === 'validate_bom') return '/products/bom/validate';
    if (tab === 'delete_bom') return '/products/bom/delete';
    return `/${tab}`;
  };

  const navigateToView = (tab, subView = null, replace = false) => {
    toast.clearOnNavigation();
    if (tab === 'launchpad' && (!subView || subView === 'home')) {
      tab = 'home';
      subView = null;
    }
    if (tab === 'admin_users') {
      tab = 'admin';
      subView = 'users';
    } else if (tab === 'admin_servers') {
      tab = 'admin';
      subView = 'servers';
    } else if (tab === 'admin_permissions') {
      tab = 'admin';
      subView = 'permissions';
    } else if (tab === 'admin_logs') {
      tab = 'admin';
      subView = 'logs';
    }
    setActiveTab(tab);
    if (subView !== null) {
      setLaunchpadSubView(subView);
    }
    const targetSub = subView !== null ? subView : (tab === 'launchpad' ? launchpadSubView : null);
    const targetPath = getPathForView(tab, targetSub);
    if (router?.navigate) {
      router.navigate(targetPath, { replace });
    } else if (typeof window !== 'undefined' && window.history) {
      if (window.location.pathname !== targetPath) {
        if (replace) {
          window.history.replaceState({ tab, subView: targetSub }, '', targetPath);
        } else {
          window.history.pushState({ tab, subView: targetSub }, '', targetPath);
        }
      }
    }
  };
  const [selectedHomeGroup, setSelectedHomeGroup] = useState('');
  const [prefilledMaterial, setPrefilledMaterial] = useState('');
  const [prefilledPlant, setPrefilledPlant] = useState('');
  const [isHeaderContactOpen, setIsHeaderContactOpen] = useState(false);

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
  const userMenuHoverTimeoutRef = useRef(null);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener and rexa:open-command-palette event listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    const handleOpenCommandPalette = () => {
      setIsCommandPaletteOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('rexa:open-command-palette', handleOpenCommandPalette);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('rexa:open-command-palette', handleOpenCommandPalette);
    };
  }, []);

  const handleUserMenuMouseEnter = () => {
    if (userMenuHoverTimeoutRef.current) clearTimeout(userMenuHoverTimeoutRef.current);
    userMenuHoverTimeoutRef.current = setTimeout(() => {
      setIsUserMenuOpen(true);
    }, 150);
  };

  const handleUserMenuMouseLeave = () => {
    if (userMenuHoverTimeoutRef.current) clearTimeout(userMenuHoverTimeoutRef.current);
    userMenuHoverTimeoutRef.current = setTimeout(() => {
      setIsUserMenuOpen(false);
    }, 200);
  };

  const handleUserMenuFocus = () => {
    setIsUserMenuOpen(true);
  };

  const showToast = (message, type = 'success') => {
    if (type === 'error') toast.error(message);
    else if (type === 'warning') toast.warning(message);
    else if (type === 'info') toast.info(message);
    else toast.success(message);
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

  // URL Synchronization & Deep Link Routing (supports /home, /products, /admin, deep links & popstate)
  useEffect(() => {
    function handleLocationChange() {
      if (typeof window === 'undefined') return;
      const path = normalizePath(window.location.pathname);
      const hash = (window.location.hash || '').toLowerCase();

      // Check legacy redirects
      const redirect = resolveLegacyRedirect(path);
      if (redirect) {
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ path: redirect }, '', redirect);
        }
      }

      if (path === '/products/bom/create/single' || path === '/create_bom' || hash === '#create_bom') {
        setActiveTab('create_bom');
        return;
      }
      if (path === '/products/bom/create/bulk' || path === '/bulk_create_bom' || hash === '#bulk_create_bom') {
        setActiveTab('bulk_create_bom');
        return;
      }
      if (path === '/products/bom/copy/single' || path === '/copy_bom' || hash === '#copy_bom') {
        setActiveTab('copy_bom');
        return;
      }
      if (path === '/products/bom/copy/bulk' || path === '/bulk_bom' || hash === '#bulk_bom') {
        setActiveTab('bulk_bom');
        return;
      }
      if (path === '/products/bom/display' || path === '/bom_explorer' || hash === '#bom_explorer') {
        setActiveTab('bom_explorer');
        return;
      }
      if (path === '/products/bom/validate' || path === '/validate_bom' || hash === '#validate_bom') {
        setActiveTab('validate_bom');
        return;
      }
      if (path === '/products/bom/delete' || path === '/delete_bom' || hash === '#delete_bom') {
        setActiveTab('delete_bom');
        return;
      }
      if (path.startsWith('/admin') || hash === '#admin') {
        if (user && user.role !== 'admin') {
          setActiveTab('access_denied');
        } else {
          setActiveTab('admin');
        }
        return;
      }
      if (path === '/products/bom' || path === '/bom' || hash === '#bom') {
        setActiveTab('launchpad');
        setLaunchpadSubView('bom_operations');
        return;
      }
      if (path === '/products/bom/create') {
        setActiveTab('launchpad');
        setLaunchpadSubView('bom_create_operations');
        return;
      }
      if (path === '/products/bom/copy') {
        setActiveTab('launchpad');
        setLaunchpadSubView('bom_copy_operations');
        return;
      }
      if (path === '/products' || path === '/launchpad' || hash === '#products' || hash === '#launchpad') {
        setActiveTab('home');
        setLaunchpadSubView(null);
        if (typeof window !== 'undefined' && window.location.pathname !== '/home') {
          window.history.replaceState({ activeTab: 'home' }, '', '/home');
        }
        return;
      }
      if (path === '/home' || hash === '#home') {
        setActiveTab('home');
        return;
      }
      if (path === '/about') {
        setActiveTab('home');
        return;
      }
      if (path === '/contact') {
        setActiveTab('home');
        setIsHeaderContactOpen(true);
        return;
      }
      if (path === '/signin') {
        return;
      }
      if (path === '/dev/design-system') {
        if (import.meta.env.DEV) {
          setActiveTab('dev_design_system');
        } else {
          setActiveTab('not_found');
        }
        return;
      }

      // Default root path: map to /home
      if (path === '/' || path === '') {
        setActiveTab('home');
        if (window.history && window.history.replaceState) {
          window.history.replaceState({ tab: 'home' }, '', '/home');
        }
        return;
      }

      // If not recognized: 404
      setActiveTab('not_found');
    }

    window.addEventListener('popstate', handleLocationChange);
    handleLocationChange();

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, [user, router?.pathname]);

  // Reset main content scroll on view/route change
  useEffect(() => {
    const mainEl = document.querySelector(".sap-assistant-layout") || document.querySelector("main");
    if (mainEl) {
      mainEl.scrollTop = 0;
    }
  }, [activeTab, launchpadSubView, router?.pathname]);

  // Auth guard & redirect handler
  useEffect(() => {
    if (isCheckingAuth) return;

    const currentPath = normalizePath(window.location.pathname);

    // Unauthenticated user attempting to access protected route
    if (!user) {
      if (currentPath !== '/signin') {
        const returnTarget = currentPath !== '/' ? currentPath : '/home';
        if (router?.navigate) {
          router.navigate(`/signin?returnTo=${encodeURIComponent(returnTarget)}`, { replace: true });
        }
      }
      return;
    }

    // Authenticated user landing on /signin or root /
    if (currentPath === '/signin' || currentPath === '/') {
      if (router?.navigate) {
        router.navigate('/home', { replace: true });
      }
      return;
    }
  }, [user, isCheckingAuth, router]);

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
          // On load, select the most recently added active server the user has access to
          const defaultServer = getNewestActiveServer(servers);
          if (defaultServer) {
            setSelectedServer(defaultServer);
            setSelectedServerHeader(defaultServer.id);
            setCurrentSystem(defaultServer.environment || 'DEV');
          } else {
            setSelectedServer(null);
            setSelectedServerHeader(null);
          }
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
    toast.clearAll();
    const chosen = availableServers.find((s) => s.id === serverId);
    if (chosen) {
      setSelectedServer(chosen);
      setSelectedServerHeader(chosen.id);
      setCurrentSystem(chosen.environment || 'DEV');
      setSelectedHomeGroup('');
    }
  };

  const handleLoginSuccess = (userData) => {
    toast.clearAll();
    try {
      localStorage.removeItem('rexa_sidebar_expanded_groups');
    } catch {}
    setUser(userData);
    setSelectedHomeGroup('');
    const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem('selected_server_id') : null;
    if (savedId) prefetchPlants(savedId);

    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      const returnTo = query.get('returnTo');
      if (returnTo && isInternalPath(returnTo) && returnTo !== '/signin') {
        if (router?.navigate) {
          router.navigate(returnTo, { replace: true });
        }
      } else {
        if (router?.navigate) {
          router.navigate(ROUTE_IDS.HOME, { replace: true });
        }
      }
    }
  };

  const handleLogout = async () => {
    toast.clearAll();
    try {
      localStorage.removeItem('rexa_sidebar_expanded_groups');
    } catch {}
    try {
      await logoutUser();
    } catch {
      // Ignore network errors during logout
    } finally {
      toast.clearAll();
      setUser(null);
      setAvailableServers([]);
      setSelectedServer(null);
      setActiveTab('launchpad');
      setLaunchpadSubView('home');
      setSelectedHomeGroup('');
      if (router?.navigate) {
        router.navigate(ROUTE_IDS.SIGN_IN, { replace: true });
      }
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

  // SAP Server Health & Session monitoring: Polls /api/sap/session-status every ~30s with ±20% jitter (24-36s)
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

    const scheduleNextPoll = () => {
      if (!isMounted) return;
      if (document.hidden) return; // Pause when tab is hidden
      if (timeoutId) clearTimeout(timeoutId);
      // 30s with ±20% random jitter: 24000ms to 36000ms
      const jitterMs = Math.round(30000 * (0.8 + Math.random() * 0.4));
      timeoutId = setTimeout(pollStatus, jitterMs);
    };

    const pollStatus = async () => {
      if (isPolling || !isMounted) return;
      if (document.hidden) return; // Don't poll while tab is hidden
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
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible: poll immediately if idle
        if (!isPolling) {
          pollStatus();
        }
      } else {
        // Tab hidden: clear any scheduled timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    pollStatus();

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [user, selectedServer?.id, availableServers.length]);

  // Listen for global SAP unreachable broadcasts from API interceptors
  useEffect(() => {
    const handleServerStatus = (e) => {
      if (e.detail?.status === 'UNREACHABLE') {
        setSapSession((prev) => ({
          ...prev,
          connected: false,
          status: 'UNREACHABLE',
          message: 'SAP server not reachable'
        }));
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('sap:server-status', handleServerStatus);
      return () => window.removeEventListener('sap:server-status', handleServerStatus);
    }
  }, []);

  if (isCheckingAuth) {
    return (
      <div className="sap-login-viewport" style={{ color: 'var(--sap-shell-text)', flexDirection: 'column', gap: 16 }}>
        <span className="sap-spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
        <p style={{ fontSize: 14, opacity: 0.8 }}>Initializing session...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <ToastProvider suppressBanner={true}>
        <Login authConfig={authConfig} onLoginSuccess={handleLoginSuccess} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <div className="sap-app-root">
      {/* SAP Shell Top Header */}
      <header className="sap-shell-header sap-toolbar" style={{ height: 'var(--size-topbar-height, 64px)', minHeight: 'var(--size-topbar-height, 64px)', maxHeight: 'var(--size-topbar-height, 64px)' }}>
        <div className="sap-shell-header-left">
          <button
            type="button"
            className="rx-topbar-sidebar-toggle"
            onClick={() => {
              setIsMobileDrawerOpen((prev) => !prev);
            }}
            aria-label="Toggle navigation sidebar"
            title="Toggle navigation sidebar"
          >
            <Menu size={18} strokeWidth={2} />
          </button>
          <Link
            to={ROUTE_IDS.HOME}
            className="sap-brand"
            style={{ textDecoration: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="RexaEdge - Return to Home"
            aria-label="RexaEdge - Return to Home"
          >
            <div className="sap-brand-logo-container" title="RexaEdge">
              <img src={rexaEdgeFullColourLogo} alt="RexaEdge" className="sap-brand-logo-img" />
            </div>
          </Link>
        </div>

        {/* Desktop actions and user badge */}
        <div className="sap-shell-actions">
          {/* Quick Search / Command Palette */}
          <button
            type="button"
            className="rx-topbar-search-btn"
            onClick={() => setIsCommandPaletteOpen(true)}
            title="Quick search operations and modules (Ctrl+K)"
            aria-label="Quick search operations and modules"
          >
            <Search size={16} />
            <span className="rx-topbar-search-text">Search...</span>
            <kbd className="rx-topbar-search-kbd">Ctrl K</kbd>
          </button>

          {/* 1. Admin button (pill, only visible for admin users) */}
          

          {/* 2. Connection indicator dot (clean compact dot, no text, accessible tooltips) */}
          {(() => {
            const isConnected = Boolean(sapSession.connected);
            const isChecking = !isConnected && (sapSession.status === 'CHECKING' || !selectedServer);
            const dotClass = isConnected
              ? 'dot-connected'
              : isChecking
              ? 'dot-checking'
              : 'dot-disconnected';
            const tooltip = isConnected
              ? `Connected to ${selectedServer?.name || 'SAP Server'}${sapSession.latencyMs ? ` (${sapSession.latencyMs}ms)` : ' (< 50ms)'}`
              : isChecking
              ? 'Checking connection...'
              : 'SAP server not reachable';

            return (
              <div
                className="sap-connection-dot-container"
                role="status"
                aria-label={tooltip}
                title={tooltip}
                tabIndex={0}
              >
                <span className={`sap-connection-dot ${dotClass}`} />
              </div>
            );
          })()}

          {/* 3. Server selector dropdown */}
          <div className="sap-system-select-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="sap-system-label sap-label">Server</span>
            {(() => {
              const currentServerType = selectedServer?.type || selectedServer?.environment;
              const isCurrentProd = currentServerType && /^(prod|production)$/i.test(String(currentServerType).trim());

              if (availableServers.length === 1) {
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span
                      className="sap-system-static-label"
                      title={`${selectedServer?.name || ''}${currentServerType ? ` (${currentServerType})` : ''}`}
                    >
                      <span className="sap-system-static-name">{selectedServer?.name}</span>
                      {currentServerType && (
                        <span className="sap-system-env-tag" style={{ display: 'none' }}>
                          ({formatEnvironment(currentServerType)})
                        </span>
                      )}
                    </span>
                    {currentServerType && (
                      <span
                        data-testid="server-environment-badge"
                        className={`rx-server-env-badge ${isCurrentProd ? 'rx-server-env-prod' : 'rx-server-env-neutral'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-badge, 4px)',
                          lineHeight: '1.2',
                          letterSpacing: '0.02em',
                          backgroundColor: isCurrentProd ? 'var(--color-danger, #B42318)' : 'var(--color-blue-100, #DCE8F1)',
                          color: isCurrentProd ? '#FFFFFF' : 'var(--color-navy-900, #00204E)',
                          border: isCurrentProd ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-blue-300, #98B5CE)'
                        }}
                      >
                        {formatEnvironment(currentServerType)}
                      </span>
                    )}
                  </div>
                );
              }

              if (availableServers.length > 1) {
                return (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <select
                      value={selectedServer?.id || ''}
                      onChange={(e) => handleServerChange(e.target.value)}
                      className="sap-system-select"
                      aria-label="Select SAP Server"
                    >
                      {availableServers.map((srv) => {
                        const srvType = srv.type || srv.environment;
                        return (
                          <option key={srv.id} value={srv.id}>
                            {srv.name}{srvType ? ` (${formatEnvironment(srvType)})` : ''}
                          </option>
                        );
                      })}
                    </select>
                    {currentServerType && (
                      <span
                        data-testid="server-environment-badge"
                        className={`rx-server-env-badge ${isCurrentProd ? 'rx-server-env-prod' : 'rx-server-env-neutral'}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-badge, 4px)',
                          lineHeight: '1.2',
                          letterSpacing: '0.02em',
                          backgroundColor: isCurrentProd ? 'var(--color-danger, #B42318)' : 'var(--color-blue-100, #DCE8F1)',
                          color: isCurrentProd ? '#FFFFFF' : 'var(--color-navy-900, #00204E)',
                          border: isCurrentProd ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-blue-300, #98B5CE)'
                        }}
                      >
                        {formatEnvironment(currentServerType)}
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <span className="sap-badge sap-badge-warning" style={{ fontSize: '11px', padding: '3px 8px' }}>
                  No Permitted Servers
                </span>
              );
            })()}
          </div>

          {/* 4. User profile avatar (accessible click toggle, keyboard accessible) */}
          <div
            className="sap-user-menu-wrapper"
            ref={userMenuRef}
          >
            <button
              type="button"
              className={`sap-user-avatar-btn sap-button ${isUserMenuOpen ? 'active' : ''}`}
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsUserMenuOpen((prev) => !prev);
                } else if (e.key === 'Escape') {
                  setIsUserMenuOpen(false);
                }
              }}
              title={user.email}
              aria-label={`User profile menu for ${user.email}`}
              aria-expanded={isUserMenuOpen}
              aria-haspopup="menu"
            >
              <div className="sap-user-avatar-circle">
                {user.email ? user.email.charAt(0).toUpperCase() : 'A'}
              </div>
            </button>

            {isUserMenuOpen && (
              <div className="sap-user-dropdown-menu" role="menu">
                <div className="sap-user-dropdown-header">
                  <div className="sap-user-dropdown-email" title={user.email} style={{ fontWeight: 500, color: 'var(--color-navy-900)' }}>
                    {user.email}
                  </div>
                  {user.role ? (
                    <span
                      className={`sap-role-badge ${String(user.role).toLowerCase() === 'admin' ? 'sap-role-badge-admin' : 'sap-role-badge-user'}`}
                      style={{ flexShrink: 0, fontSize: 11 }}
                    >
                      {String(user.role).toLowerCase() === 'admin' && <ShieldCheck size={12} />}
                      {String(user.role).toLowerCase() === 'admin' ? 'Admin' : (user.role === 'user' ? 'User' : user.role)}
                    </span>
                  ) : null}
                </div>

                {/* Multi-Session Capability Preserved */}
                {sapSession.sessions && sapSession.sessions.length > 0 && (
                  <div style={{ padding: '8px 14px', background: '#ffffff', borderBottom: '1px solid var(--sap-border, var(--color-border, #D9E2EC))' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--sap-text-muted, #475569)', marginBottom: 6 }}>
                      Active SAP Sessions ({sapSession.sessions.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {sapSession.sessions.map((sess) => {
                        const isSelected = sess.id === sapSession.selectedSessionId || sess.selected;
                        return (
                          <button
                            key={sess.id}
                            type="button"
                            onClick={() => handleSelectSession(sess.id)}
                            disabled={isSwitchingSession}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 8px',
                              fontSize: '12px',
                              borderRadius: '4px',
                              border: isSelected ? '1px solid var(--sap-primary, var(--color-blue-600, #02579A))' : '1px solid var(--sap-border, var(--color-border, #D9E2EC))',
                              background: isSelected ? 'var(--color-blue-50, #EEF4F9)' : '#ffffff',
                              cursor: 'pointer',
                              color: isSelected ? 'var(--sap-primary, var(--color-blue-600, #02579A))' : 'var(--sap-text-body, #334155)',
                              fontWeight: isSelected ? 600 : 400,
                              textAlign: 'left'
                            }}
                          >
                            <span>{sess.user} ({sess.system}/{sess.client})</span>
                            {isSelected ? (
                              <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 700 }}>Active</span>
                            ) : (
                              <span style={{ fontSize: '10px', color: '#64748b' }}>Select</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="sap-user-dropdown-items">
                  {user.role === 'admin' && (
                    <button
                      type="button"
                      className="sap-user-menu-item"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        if (activeTab === 'admin') {
                          navigateToView('home');
                        } else {
                          if (router?.navigate) {
                            router.navigate(ROUTE_IDS.ADMIN_USERS);
                          } else {
                            setActiveTab('admin');
                          }
                        }
                      }}
                      role="menuitem"
                    >
                      <ShieldCheck size={14} color="var(--color-blue-600, #02579A)" className="sap-user-menu-icon" />
                      <span className="sap-user-menu-label">{activeTab === 'admin' ? 'Exit Administration' : 'Enterprise Administration'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="sap-user-menu-item"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsChangePasswordOpen(true);
                    }}
                    role="menuitem"
                  >
                    <KeyRound size={14} color="var(--color-blue-600, #02579A)" className="sap-user-menu-icon" />
                    <span className="sap-user-menu-label">Change password</span>
                  </button>

                  <div className="sap-user-menu-divider" />

                  <button
                    type="button"
                    className="sap-user-menu-item sap-user-menu-signout"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleOpenLogoutModal();
                    }}
                    role="menuitem"
                  >
                    <LogOut size={14} className="sap-user-menu-icon" />
                    <span className="sap-user-menu-label">Sign out</span>
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
                    <option key={s.id} value={s.id}>{s.name} ({formatEnvironment(s.environment)})</option>
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
                      ({formatEnvironment(selectedServer.environment)})
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
                  className={`sap-btn sap-btn-secondary ${activeTab === 'launchpad' && launchpadSubView === 'bom_operations' ? 'active' : ''}`}
                  onClick={() => {
                    navigateToView('launchpad', 'bom_operations');
                    setIsMobileMenuOpen(false);
                  }}
                  style={{ fontSize: '12px', padding: '6px' }}
                >
                  <Layers size={14} />
                  <span>BOM</span>
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

      {/* App Shell Body with Modern Sidebar */}
      <div className="rx-app-shell-body">
        <Sidebar
          activeView={activeTab}
          onNavigate={(target, sub) => navigateToView(target, sub)}
          userRole={user?.role}
          isOpenMobile={isMobileDrawerOpen}
          onCloseMobile={() => setIsMobileDrawerOpen(false)}
        />
        {/* Main SAP Fiori Workspace Layout */}
        <main className="sap-assistant-layout">
        {(activeTab === 'home' || (activeTab === 'launchpad' && (!launchpadSubView || launchpadSubView === 'home'))) && (
          <HomePage
            onExploreProducts={() => navigateToView('launchpad', 'bom_operations')}
            onOpenBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateHome={() => navigateToView('home')}
            onOpenContact={() => setIsHeaderContactOpen(true)}
            user={user}
            sapSession={sapSession}
            selectedServer={selectedServer}
          />
        )}

        {activeTab === 'launchpad' && launchpadSubView && launchpadSubView !== 'home' && (
          <FioriLaunchpad
            sapSession={sapSession}
            systemKey={currentSystem}
            subView={launchpadSubView}
            onSubViewChange={(sub) => navigateToView('launchpad', sub)}
            onOpenAction={(action) => navigateToView(action)}
            onNavigateHome={() => navigateToView('home')}
            onNavigateProducts={() => navigateToView('home')}
            enabledModules={enabledModules}
            userRole={user.role}
            userPermissions={currentPermittedApps}
            selectedGroup={selectedHomeGroup}
            onSelectGroup={setSelectedHomeGroup}
            isLoading={isLoadingServers}
          />
        )}

        {/* Inline Alert when no SAP server is selected on operational pages */}
        {['create_bom', 'bulk_create_bom', 'copy_bom', 'bulk_bom', 'delete_bom', 'bom_explorer', 'validate_bom'].includes(activeTab) && !selectedServer && (
          <div style={{ maxWidth: 'var(--sap-layout-max-width, 1680px)', margin: '16px auto 0', padding: '0 var(--page-gutter, 32px)', boxSizing: 'border-box', width: '100%' }}>
            <div
              className="rx-no-server-alert"
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 16px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: 'var(--color-warning-bg, #FFFBEB)',
                border: '1px solid var(--color-warning-border, #FDE68A)',
                color: 'var(--color-warning, #B45309)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)'
              }}
            >
              <AlertTriangle size={18} style={{ color: 'var(--color-warning, #B45309)', flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', fontWeight: 600 }}>Select an SAP server to continue</strong>
                <span>No SAP server is selected. Please choose a server from the top bar before performing operations.</span>
              </div>
            </div>
          </div>
        )}

        {/* Admin Serverless Gate: When an admin opens an operational card requiring an SAP server, but 0 servers exist */}
        {activeTab !== 'home' && activeTab !== 'launchpad' && activeTab !== 'admin' && !selectedServer && user?.role === 'admin' && (
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
            <h2 className="sap-section-header" style={{ fontSize: 16, margin: '0 0 8px' }}>
              Add a SAP server first
            </h2>
            <p style={{ fontSize: 13, color: 'var(--sap-text-muted)', margin: '0 0 24px', lineHeight: 1.5 }}>
              No SAP server has been added to the system yet. To perform operations in this module, please add and configure an SAP server in the Administration panel.
            </p>
            <div className="sap-toolbar" style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="sap-button sap-btn sap-btn-primary"
                onClick={() => navigateToView('admin_servers')}
                style={{ padding: '8px 18px', fontSize: 13 }}
              >
                <ShieldCheck size={16} />
                <span>Go to Admin &gt; Servers</span>
              </button>
              <button
                type="button"
                className="sap-button sap-btn sap-btn-secondary"
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

        {/* Module Guard: Render AccessDeniedView for non-admins if navigating to an unenabled module */}
        {activeTab !== 'home' && activeTab !== 'launchpad' && activeTab !== 'admin' && activeTab !== 'not_found' && activeTab !== 'access_denied' && user?.role !== 'admin' && getModuleKeyForAction(activeTab) && !enabledModules.includes(getModuleKeyForAction(activeTab)) && (
          <AccessDeniedView
            reason={`This module is not enabled for ${selectedServer?.name || 'this server'}. Please switch to another server or contact an administrator to enable access.`}
            details={selectedServer?.name ? `Server: ${selectedServer.name}` : null}
          />
        )}

        {/* App Permission Guard: Direct URL or deep link to non-permitted app */}
        {activeTab !== 'home' && activeTab !== 'launchpad' && activeTab !== 'admin' && activeTab !== 'not_found' && activeTab !== 'access_denied' && !hasAppAccess && (
          <AccessDeniedView
            reason="You do not have permission to run this feature on this server. Please switch to another server or contact an administrator to request access."
            details={selectedServer?.name ? `Server: ${selectedServer.name}` : null}
          />
        )}

        {/* Dev Design System Showcase (Dev Only) */}
        {activeTab === 'dev_design_system' && (
          <DesignSystemShowcase />
        )}

        {/* 404 Route Not Found */}
        {activeTab === 'not_found' && (
          <NotFoundView pathname={router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '')} />
        )}

        {/* Admin Access Denied for Non-Admins */}
        {activeTab === 'access_denied' && (
          <AccessDeniedView reason="This section is restricted to enterprise administrators." />
        )}

        {activeTab === 'create_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('create_bom') || enabledModules.includes(getModuleKeyForAction('create_bom'))) && (
          <CreateBomView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => navigateToView('launchpad', 'bom_create_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'bulk_create_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bulk_create_bom') || enabledModules.includes(getModuleKeyForAction('bulk_create_bom'))) && (
          <BulkCreateBomView
            systemKey={currentSystem}
            onBack={() => navigateToView('launchpad', 'bom_create_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'copy_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('copy_bom') || enabledModules.includes(getModuleKeyForAction('copy_bom'))) && (
          <CopyBomView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => navigateToView('launchpad', 'bom_copy_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'bulk_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bulk_bom') || enabledModules.includes(getModuleKeyForAction('bulk_bom'))) && (
          <BulkBomView
            systemKey={currentSystem}
            onBack={() => navigateToView('launchpad', 'bom_copy_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'delete_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('delete_bom') || enabledModules.includes(getModuleKeyForAction('delete_bom'))) && (
          <DeleteBomView
            systemKey={currentSystem}
            onBack={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'bom_explorer' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('bom_explorer') || enabledModules.includes(getModuleKeyForAction('bom_explorer'))) && (
          <BomExplorerView
            systemKey={currentSystem}
            initialMaterial={prefilledMaterial}
            initialPlant={prefilledPlant}
            onBack={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'validate_bom' && hasAppAccess && (selectedServer || user?.role !== 'admin') && (!getModuleKeyForAction('validate_bom') || enabledModules.includes(getModuleKeyForAction('validate_bom'))) && (
          <ValidateBomView
            systemKey={currentSystem}
            onBack={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateBom={() => navigateToView('launchpad', 'bom_operations')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminView
            currentUser={user}
            onBack={() => navigateToView('home')}
            onNavigateProducts={() => navigateToView('home')}
            onNavigateHome={() => navigateToView('home')}
          />
        )}
      </main>
      </div>

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

        <div  style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            className="sap-button sap-btn sap-btn-secondary"
            onClick={handleCloseLogoutModal}
            disabled={isLoggingOut}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sap-button sap-btn destructive sap-button-danger sap-btn-primary"
            onClick={handleConfirmLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>
      </Modal>


      {/* Contact Modal (Global Header Trigger) */}
      {isHeaderContactOpen && (
        <div className="rexa-modal-backdrop" onClick={() => setIsHeaderContactOpen(false)}>
          <div
            className="rexa-modal-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="rexa-modal-header">
              <div className="rexa-modal-title-wrap">
                <Mail size={22} className="rexa-modal-icon-blue" />
                <h3>Contact Next IT Point / RexaEdge</h3>
              </div>
              <button
                type="button"
                className="rexa-modal-close-btn"
                onClick={() => setIsHeaderContactOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rexa-modal-body">
              <div className="rexa-contact-layout">
                <div className="rexa-contact-info-panel">
                  <h4>Direct Channels</h4>
                  <p>Have questions about RexaEdge automation, SAP modules, or IT consulting?</p>

                  <div className="rexa-contact-item">
                    <Mail size={16} className="rexa-contact-item-icon" />
                    <div>
                      <strong>Email Us</strong>
                      <span>support@nextitpoint.com</span>
                    </div>
                  </div>

                  <div className="rexa-contact-item">
                    <Phone size={16} className="rexa-contact-item-icon" />
                    <div>
                      <strong>Enterprise Support</strong>
                      <span>+91 98765 43210 / Available 24x7</span>
                    </div>
                  </div>

                  <div className="rexa-contact-item">
                    <MapPin size={16} className="rexa-contact-item-icon" />
                    <div>
                      <strong>Headquarters</strong>
                      <span>Next IT Point Intellectual Services Pvt. Ltd.</span>
                    </div>
                  </div>
                </div>

                <form
                  className="rexa-contact-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    showToast('Inquiry sent successfully! Our team will contact you promptly.');
                    setIsHeaderContactOpen(false);
                  }}
                >
                  <div className="rexa-form-field">
                    <label htmlFor="hdr-contact-name">Full Name</label>
                    <input id="hdr-contact-name" type="text" required placeholder="Ex. John Doe" />
                  </div>

                  <div className="rexa-form-field">
                    <label htmlFor="hdr-contact-email">Corporate Email</label>
                    <input id="hdr-contact-email" type="email" required placeholder="Ex. j.doe@company.com" />
                  </div>

                  <div className="rexa-form-field">
                    <label htmlFor="hdr-contact-msg">Message / Inquiry</label>
                    <textarea id="hdr-contact-msg" required rows={3} placeholder="How can RexaEdge help your ERP operations?" />
                  </div>

                  <button type="submit" className="rexa-contact-submit-btn">
                    <Send size={15} />
                    <span>Send Inquiry</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Change Password Modal */}
      
      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(item) => {
          setIsCommandPaletteOpen(false);
          if (!item) return;
          if (item.path && router?.navigate) {
            router.navigate(item.path);
          } else if (item.tab) {
            navigateToView(item.tab, item.subView || null);
          }
        }}
        userRole={user?.role}
        userPermissions={currentPermittedApps}
      />
      <PasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        mode="user"
        onSuccess={(msg) => showToast(msg, 'success')}
      />
    </div>
    </ToastProvider>
  );
}

export default function App(props = {}) {
  const {
    initialActiveTab = 'home',
    initialLaunchpadSubView = 'home'
  } = props;

  let initialPath = '/home';
  if (initialActiveTab === 'launchpad') {
    if (initialLaunchpadSubView === 'bom_operations') {
      initialPath = '/products/bom';
    } else if (initialLaunchpadSubView === 'bom_create_operations') {
      initialPath = '/products/bom/create';
    } else if (initialLaunchpadSubView === 'bom_copy_operations') {
      initialPath = '/products/bom/copy';
    } else {
      initialPath = '/products';
    }
  } else if (initialActiveTab === 'admin') {
    initialPath = '/admin/users';
  } else if (initialActiveTab === 'create_bom') {
    initialPath = '/products/bom/create/single';
  } else if (initialActiveTab === 'bulk_create_bom') {
    initialPath = '/products/bom/create/bulk';
  } else if (initialActiveTab === 'copy_bom') {
    initialPath = '/products/bom/copy/single';
  } else if (initialActiveTab === 'bulk_bom') {
    initialPath = '/products/bom/copy/bulk';
  } else if (initialActiveTab === 'bom_explorer') {
    initialPath = '/products/bom/display';
  } else if (initialActiveTab === 'validate_bom') {
    initialPath = '/products/bom/validate';
  } else if (initialActiveTab === 'delete_bom') {
    initialPath = '/products/bom/delete';
  } else if (initialActiveTab && initialActiveTab !== 'home') {
    initialPath = `/${initialActiveTab}`;
  } else if (typeof window !== 'undefined' && window.location.pathname) {
    initialPath = window.location.pathname;
  }

  return (
    <RouterProvider initialPath={initialPath}>
      <AppContent {...props} />
    </RouterProvider>
  );
}
