import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  PlusSquare,
  Copy,
  Eye,
  Trash2,
  Users,
  Server,
  KeyRound,
  FileSpreadsheet,
  Package,
  Route,
  ShoppingCart,
  Factory
} from 'lucide-react';
import { MODULE_REGISTRY } from '@shared/modules.js';
import { useRouter } from '../../context/RouterContext';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip';

const ICON_MAP = {
  Layers,
  Package,
  Route,
  ShoppingCart,
  Factory
};

const MODULE_ICONS = {
  material_master: Package,
  routing: Route,
  purchase_orders: ShoppingCart,
  production_orders: Factory
};

export function Sidebar({
  activeView = 'home',
  onNavigate,
  userRole = 'user',
  isOpenMobile = false,
  onCloseMobile
}) {
  let router = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }

  // Collapsed mode persistence
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rexa_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Group expanded state persistence (default BOM and Admin collapsed after fresh login)
  const [expandedGroups, setExpandedGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('rexa_sidebar_expanded_groups');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { bom: false, admin: false };
  });

  // Flyout menu state for collapsed mode
  const [activeFlyoutGroup, setActiveFlyoutGroup] = useState(null);
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0 });
  const flyoutRef = useRef(null);
  const sidebarNavRef = useRef(null);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('rexa_sidebar_collapsed', String(next));
      } catch {}
      if (next) {
        setActiveFlyoutGroup(null);
      }
      return next;
    });
  };

  const toggleGroup = (groupKey, e) => {
    if (e) e.stopPropagation();
    setExpandedGroups((prev) => {
      const next = { ...prev, [groupKey]: !prev[groupKey] };
      try {
        localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Close flyout on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (flyoutRef.current && !flyoutRef.current.contains(e.target)) {
        setActiveFlyoutGroup(null);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveFlyoutGroup(null);
        if (isOpenMobile && onCloseMobile) {
          onCloseMobile();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpenMobile, onCloseMobile]);

  // Handle collapsed item click / hover flyout
  const handleCollapsedGroupClick = (groupKey, event) => {
    if (activeFlyoutGroup === groupKey) {
      setActiveFlyoutGroup(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setFlyoutPosition({ top: rect.top });
    setActiveFlyoutGroup(groupKey);
  };

  const handleItemClick = (action, routePath) => {
    setActiveFlyoutGroup(null);
    if (onCloseMobile) onCloseMobile();
    if (routePath && router?.navigate) {
      router.navigate(routePath);
    } else if (onNavigate) {
      onNavigate(action, routePath);
    }
  };

  // Active state checks
  const isHomeActive = activeView === 'home';
  const isCreateBomActive = activeView === 'create_bom' || activeView === 'bulk_create_bom';
  const isCopyBomActive = activeView === 'copy_bom' || activeView === 'bulk_bom';
  const isDisplayBomActive = activeView === 'bom_explorer';
  const isValidateBomActive = activeView === 'validate_bom';
  const isDeleteBomActive = activeView === 'delete_bom';
  const isBomGroupActive = isCreateBomActive || isCopyBomActive || isDisplayBomActive || isValidateBomActive || isDeleteBomActive || activeView === 'bom_operations';

  // Admin active checks
  const currentPath = router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  const isAdminActive = activeView === 'admin' || currentPath.startsWith('/admin');
  const isAdminUsersActive = isAdminActive && (currentPath === '/admin/users' || currentPath === '/admin');
  const isAdminServersActive = isAdminActive && currentPath === '/admin/servers';
  const isAdminPermissionsActive = isAdminActive && currentPath === '/admin/permissions';
  const isAdminLogsActive = isAdminActive && (currentPath.startsWith('/admin/logs') || currentPath === '/admin/activity-logs');

  // Auto-expand group when a contained route is active
  useEffect(() => {
    if (isBomGroupActive && !expandedGroups.bom) {
      setExpandedGroups((prev) => {
        const next = { ...prev, bom: true };
        try {
          localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    if (isAdminActive && !expandedGroups.admin) {
      setExpandedGroups((prev) => {
        const next = { ...prev, admin: true };
        try {
          localStorage.setItem('rexa_sidebar_expanded_groups', JSON.stringify(next));
        } catch {}
        return next;
      });
    }
  }, [isBomGroupActive, isAdminActive]);

  // BOM Management Children
  const bomChildren = [
    {
      id: 'create_bom',
      label: 'Create BOM',
      icon: PlusSquare,
      path: '/products/bom/create/single',
      active: isCreateBomActive
    },
    {
      id: 'copy_bom',
      label: 'Copy BOM',
      icon: Copy,
      path: '/products/bom/copy/single',
      active: isCopyBomActive
    },
    {
      id: 'bom_explorer',
      label: 'Display BOM',
      icon: Eye,
      path: '/products/bom/display',
      active: isDisplayBomActive
    },
    {
      id: 'validate_bom',
      label: 'Validate BOM',
      icon: ShieldCheck,
      path: '/products/bom/validate',
      active: isValidateBomActive
    },
    {
      id: 'delete_bom',
      label: 'Delete BOM',
      icon: Trash2,
      path: '/products/bom/delete',
      active: isDeleteBomActive
    }
  ];

  // Admin Children
  const adminChildren = [
    {
      id: 'admin_users',
      label: 'Users',
      icon: Users,
      path: '/admin/users',
      active: isAdminUsersActive
    },
    {
      id: 'admin_servers',
      label: 'Servers',
      icon: Server,
      path: '/admin/servers',
      active: isAdminServersActive
    },
    {
      id: 'admin_permissions',
      label: 'Permissions',
      icon: KeyRound,
      path: '/admin/permissions',
      active: isAdminPermissionsActive
    },
    {
      id: 'admin_logs',
      label: 'Logs',
      icon: FileSpreadsheet,
      path: '/admin/logs/audit',
      active: isAdminLogsActive
    }
  ];

  // Available future modules from registry (excluding BOM, coming-soon modules are not listed in sidebar)
  const futureModules = MODULE_REGISTRY.filter((m) => m.key !== 'bom' && m.status === 'available');

  // Keyboard navigation across items
  const handleNavKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const buttons = sidebarNavRef.current?.querySelectorAll('button:not([disabled])');
      if (!buttons || buttons.length === 0) return;
      const btnArray = Array.from(buttons);
      const currentIndex = btnArray.indexOf(document.activeElement);
      if (currentIndex === -1) return;
      e.preventDefault();
      if (e.key === 'ArrowDown') {
        const nextIndex = (currentIndex + 1) % btnArray.length;
        btnArray[nextIndex]?.focus();
      } else {
        const prevIndex = (currentIndex - 1 + btnArray.length) % btnArray.length;
        btnArray[prevIndex]?.focus();
      }
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="rx-sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 32, 78, 0.45)',
            zIndex: 1001,
            backdropFilter: 'blur(2px)'
          }}
        />
      )}

      <aside
        className={`rx-sidebar ${isCollapsed ? 'rx-sidebar-collapsed' : 'rx-sidebar-expanded'} ${isOpenMobile ? 'rx-sidebar-mobile-open' : ''}`}
        aria-label="Application Sidebar"
        style={{
          width: isCollapsed ? 'var(--size-sidebar-width-collapsed, 72px)' : 'var(--size-sidebar-width-expanded, 240px)',
          minWidth: isCollapsed ? 'var(--size-sidebar-width-collapsed, 72px)' : 'var(--size-sidebar-width-expanded, 240px)',
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRight: '1px solid var(--color-border, #D9E2EC)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: 'calc(100vh - 64px)',
          position: 'sticky',
          top: 64,
          zIndex: isOpenMobile ? 999 : 99,
          boxSizing: 'border-box',
          transition: 'width var(--transition-normal, 200ms ease), min-width var(--transition-normal, 200ms ease)'
        }}
      >
        {/* Navigation Items Scrollable Container */}
        <div
          ref={sidebarNavRef}
          onKeyDown={handleNavKeyDown}
          style={{
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1
          }}
        >
          {/* 1. Home Link */}
          <button
            type="button"
            onClick={() => handleItemClick('home', '/home')}
            title={isCollapsed ? 'Home' : undefined}
            aria-label="Home"
            aria-current={isHomeActive ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'flex-start',
              gap: 12,
              padding: isCollapsed ? '10px 0' : '10px 14px',
              borderRadius: 'var(--radius-md, 8px)',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: isHomeActive ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
              borderLeft: isHomeActive ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
              color: isHomeActive ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
              fontWeight: isHomeActive ? 600 : 500,
              fontSize: 'var(--font-size-14, 14px)',
              fontFamily: 'var(--font-sans)',
              width: '100%',
              textAlign: 'left',
              transition: 'background-color var(--transition-fast, 150ms ease)',
              boxSizing: 'border-box',
              outline: 'none'
            }}
          >
            <Home size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span>Home</span>}
          </button>

          {/* Section Divider */}
          {!isCollapsed && (
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted, #7A8CA3)', padding: '12px 14px 4px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              OPERATIONS
            </div>
          )}

          {/* 2. BOM Management (Expandable Group) */}
          <div>
            <button
              type="button"
              onClick={(e) => {
                if (isCollapsed) {
                  handleCollapsedGroupClick('bom', e);
                } else {
                  toggleGroup('bom', e);
                }
              }}
              title={isCollapsed ? 'BOM management' : undefined}
              aria-label="BOM management"
              aria-expanded={isCollapsed ? activeFlyoutGroup === 'bom' : Boolean(expandedGroups.bom)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                gap: 10,
                padding: isCollapsed ? '10px 0' : '10px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isBomGroupActive && !isCollapsed && !expandedGroups.bom ? 'var(--color-blue-50, #EEF4F9)' : (isBomGroupActive && isCollapsed ? 'var(--color-blue-50, #EEF4F9)' : 'transparent'),
                borderLeft: isBomGroupActive && (isCollapsed || !expandedGroups.bom) ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                color: isBomGroupActive ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
                fontWeight: 600,
                fontSize: 'var(--font-size-14, 14px)',
                fontFamily: 'var(--font-sans)',
                width: '100%',
                textAlign: 'left',
                transition: 'background-color var(--transition-fast, 150ms ease)',
                boxSizing: 'border-box',
                outline: 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Layers size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                {!isCollapsed && <span className="rx-sidebar-item-label">BOM management</span>}
              </div>
              {!isCollapsed && (
                <span style={{ color: 'var(--color-text-muted, #7A8CA3)', display: 'inline-flex', transition: 'transform 150ms ease' }}>
                  {expandedGroups.bom ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
              )}
            </button>

            {/* Expanded BOM Children */}
            {!isCollapsed && expandedGroups.bom && (
              <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                {bomChildren.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleItemClick(item.id, item.path)}
                      aria-label={item.label}
                      aria-current={item.active ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: item.active ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
                        borderLeft: item.active ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                        color: item.active ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
                        fontWeight: item.active ? 600 : 500,
                        fontSize: 'var(--font-size-14, 14px)',
                        fontFamily: 'var(--font-sans)',
                        width: '100%',
                        textAlign: 'left',
                        transition: 'background-color var(--transition-fast, 150ms ease)',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    >
                      <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                      <span
                        className="rx-sidebar-item-label"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Available Future Modules from Registry */}
          {futureModules.map((mod) => {
            const Icon = (mod.iconName && ICON_MAP[mod.iconName]) || MODULE_ICONS[mod.key] || Package;
            return (
              <div
                key={mod.key}
                title={isCollapsed ? `${mod.label} (Coming soon)` : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isCollapsed ? 'center' : 'space-between',
                  gap: 12,
                  padding: isCollapsed ? '10px 0' : '10px 14px',
                  borderRadius: 'var(--radius-md, 8px)',
                  color: 'var(--color-text-muted, #7A8CA3)',
                  fontSize: 'var(--font-size-14, 14px)',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'default',
                  opacity: 0.65,
                  userSelect: 'none',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  {!isCollapsed && (
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {mod.label}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      padding: '2px 6px',
                      background: 'var(--color-blue-50, #EEF4F9)',
                      color: 'var(--color-text-secondary, #4A5F77)',
                      borderRadius: 'var(--radius-full, 9999px)',
                      border: '1px solid var(--color-border, #D9E2EC)'
                    }}
                  >
                    Soon
                  </span>
                )}
              </div>
            );
          })}

          {/* 4. Administration Group (Expandable, Admins Only) */}
          {userRole === 'admin' && (
            <div style={{ marginTop: isCollapsed ? 0 : 8 }}>
              <div>
                <button
                  type="button"
                  onClick={(e) => {
                    if (isCollapsed) {
                      handleCollapsedGroupClick('admin', e);
                    } else {
                      toggleGroup('admin', e);
                    }
                  }}
                  title={isCollapsed ? 'Enterprise Admin' : undefined}
                  aria-label="Enterprise Admin"
                  aria-expanded={isCollapsed ? activeFlyoutGroup === 'admin' : Boolean(expandedGroups.admin)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCollapsed ? 'center' : 'space-between',
                    gap: 10,
                    padding: isCollapsed ? '10px 0' : '10px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: isAdminActive && (isCollapsed || !expandedGroups.admin) ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
                    borderLeft: isAdminActive && (isCollapsed || !expandedGroups.admin) ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                    color: isAdminActive ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
                    fontWeight: 600,
                    fontSize: 'var(--font-size-14, 14px)',
                    fontFamily: 'var(--font-sans)',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background-color var(--transition-fast, 150ms ease)',
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <ShieldCheck size={18} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                    {!isCollapsed && <span className="rx-sidebar-item-label">Admin</span>}
                  </div>
                  {!isCollapsed && (
                    <span style={{ color: 'var(--color-text-muted, #7A8CA3)', display: 'inline-flex', transition: 'transform 150ms ease' }}>
                      {expandedGroups.admin ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </span>
                  )}
                </button>

                {/* Expanded Admin Children */}
                {!isCollapsed && expandedGroups.admin && (
                  <div style={{ paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {adminChildren.map((item) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleItemClick(item.id, item.path)}
                          aria-label={`Admin: ${item.label}`}
                          aria-current={item.active ? 'page' : undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-md, 8px)',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: item.active ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
                            borderLeft: item.active ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                            color: item.active ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
                            fontWeight: item.active ? 600 : 500,
                            fontSize: 'var(--font-size-14, 14px)',
                            fontFamily: 'var(--font-sans)',
                            width: '100%',
                            textAlign: 'left',
                            transition: 'background-color var(--transition-fast, 150ms ease)',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        >
                          <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                          <span
                            className="rx-sidebar-item-label"
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Collapsed Mode Flyout Popover */}
        {isCollapsed && activeFlyoutGroup && (
          <div
            ref={flyoutRef}
            className="rx-sidebar-flyout"
            role="menu"
            aria-label={`${activeFlyoutGroup === 'bom' ? 'BOM management' : 'Admin'} submenu`}
            style={{
              position: 'fixed',
              left: 72,
              top: Math.max(70, flyoutPosition.top),
              backgroundColor: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border, #D9E2EC)',
              borderRadius: 'var(--radius-lg, 12px)',
              boxShadow: 'var(--shadow-modal, 0 20px 48px rgba(0, 32, 78, 0.18))',
              zIndex: 1000,
              minWidth: 210,
              padding: '8px 6px',
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--color-text-secondary, #4A5F77)',
                padding: '6px 10px 4px',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                borderBottom: '1px solid var(--color-border-subtle, #E2E8F0)',
                marginBottom: 4
              }}
            >
              {activeFlyoutGroup === 'bom' ? 'BOM management' : 'Administration'}
            </div>

            {(activeFlyoutGroup === 'bom' ? bomChildren : adminChildren).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleItemClick(item.id, item.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: item.active ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
                    borderLeft: item.active ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                    color: item.active ? 'var(--color-blue-600, #02579A)' : 'var(--color-text, #0F2742)',
                    fontWeight: item.active ? 600 : 500,
                    fontSize: 'var(--font-size-13, 13px)',
                    fontFamily: 'var(--font-sans)',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background-color var(--transition-fast, 150ms ease)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Sidebar Collapse Toggle Button */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--color-border, #D9E2EC)' }}>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm, 6px)',
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-secondary, #4A5F77)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-12, 12px)',
              fontFamily: 'var(--font-sans)',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          >
            {!isCollapsed && <span>Collapse Sidebar</span>}
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
