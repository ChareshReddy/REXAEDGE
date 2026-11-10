import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import FioriPageHeader from './FioriPageHeader';
import './FioriOpCard.css';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowRight,
  Layers,
  Wrench,
  TrendingUp,
  Package,
  ShoppingCart,
  Search,
  Eye,
  Copy,
  FileSpreadsheet,
  ShieldCheck,
  Trash2,
  ChevronLeft,
  AlertCircle,
  PlusSquare,
  FilePlus,
  FolderPlus,
  Files
} from 'lucide-react';
import { MODULE_REGISTRY, MODULE_STATUS, hasCardPermission, ALL_BOM_APPS, normalizePermissions } from '@shared/modules.js';

export const ICON_MAP = {
  Layers,
  Wrench,
  TrendingUp,
  Package,
  ShoppingCart,
  Search,
  Eye,
  Copy,
  FileSpreadsheet,
  ShieldCheck,
  Trash2,
  ChevronLeft,
  PlusSquare,
  FilePlus,
  FolderPlus,
  Files
};

/**
 * Shared Card Component for Launchpad Hub and Sub-Pages
 * Enforces uniform size, padding, typography, hover state, and badge icons.
 */
export function FioriOpCard({
  id,
  title,
  desc,
  iconName,
  danger,
  disabled,
  onClick
}) {
  const Icon = (id === 'display' || iconName === 'Eye') ? Eye : (ICON_MAP[iconName] || Search);
  const isDestructive = Boolean(danger || id === 'delete');

  return (
    <button
      key={id}
      type="button"
      className={`fiori-op-card ${isDestructive ? 'fiori-op-card-destructive' : ''} ${disabled ? 'disabled' : ''}`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <div className="fiori-op-top-row">
        <div className="fiori-op-icon-badge">
          <Icon size={24} strokeWidth={1.8} />
        </div>
        {isDestructive && (
          <span className="fiori-destructive-badge">
            Destructive
          </span>
        )}
      </div>
      <div className="fiori-op-title">{title}</div>
      <div className="fiori-op-desc">{desc}</div>
      <div className="fiori-op-open-link" aria-hidden="true">
        <span>Open</span>
        <ArrowRight size={14} strokeWidth={2} />
      </div>
    </button>
  );
}

export default function FioriLaunchpad({
  onOpenAction,
  sapSession,
  systemKey = 'DEV',
  subView = 'home',
  onSubViewChange,
  onNavigateHome,
  onNavigateProducts,
  enabledModules = [],
  userRole = 'user',
  userPermissions = [],
  selectedGroup,
  onSelectGroup,
  isLoading = false
}) {
  const [internalView, setInternalView] = useState(subView || 'home');
  const currentView = subView !== undefined ? subView : internalView;

  const [internalGroup, setInternalGroup] = useState('');
  const currentGroup = selectedGroup !== undefined ? selectedGroup : internalGroup;
  const tabRefs = useRef({});

  const handleSetView = (view) => {
    setInternalView(view);
    if (onSubViewChange) {
      onSubViewChange(view);
    }
  };

  const handleSelectGroup = (groupName) => {
    setInternalGroup(groupName);
    if (onSelectGroup) {
      onSelectGroup(groupName);
    }
  };

  const bomPerms = normalizePermissions(
    Array.isArray(userPermissions)
      ? userPermissions
      : (userPermissions?.permissions || userPermissions?.actions || [])
  );
  const bomAppCount = userRole === 'admin' ? ALL_BOM_APPS.length : bomPerms.length;

  // 1. Filter modules strictly based on role and current server enablement
  // - Admin ALWAYS sees every registered module/card, independent of servers and server_modules
  // - Coming soon tiles visible ONLY to admins (hidden for regular users)
  // - Available modules visible to regular users ONLY IF enabled on current server
  const visibleModules = MODULE_REGISTRY.filter((mod) => {
    if (userRole === 'admin') {
      return true;
    }
    if (mod.status === MODULE_STATUS.COMING_SOON) {
      return false;
    }
    if (!enabledModules.includes(mod.key)) {
      return false;
    }
    if (mod.key === 'bom' && bomPerms.length === 0) {
      return false;
    }
    return true;
  });

  // 2. Derive unique groups in the order they appear in MODULE_REGISTRY (dynamic, no hardcoded groups)
  const groupOrder = [];
  MODULE_REGISTRY.forEach((m) => {
    const groupName = m.group || 'Applications';
    if (!groupOrder.includes(groupName)) {
      groupOrder.push(groupName);
    }
  });

  // 3. Keep only groups that have at least one visible module
  const homeGroups = groupOrder
    .map((name) => ({
      name,
      modules: visibleModules.filter((m) => (m.group || 'Applications') === name)
    }))
    .filter((g) => g.modules.length > 0);

  // 4. Derive active group:
  // If currentGroup matches a currently visible group, use it.
  // Otherwise, fallback to the first visible group (homeGroups[0])
  const activeGroup = homeGroups.find((g) => g.name === currentGroup) || homeGroups[0] || null;
  const activeGroupName = activeGroup ? activeGroup.name : '';

  // Synchronize active group with parent when falling back (Ex. server switch)
  useEffect(() => {
    if (activeGroupName && activeGroupName !== currentGroup) {
      if (onSelectGroup) {
        onSelectGroup(activeGroupName);
      }
    }
  }, [activeGroupName, currentGroup, onSelectGroup]);

  // Keyboard navigation for tablist (WAI-ARIA APG pattern)
  const handleTabKeyDown = (e, currentIndex) => {
    if (homeGroups.length <= 1) return;

    let targetIndex = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (currentIndex + 1) % homeGroups.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (currentIndex - 1 + homeGroups.length) % homeGroups.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = homeGroups.length - 1;
    }

    if (targetIndex !== null) {
      const targetGroup = homeGroups[targetIndex];
      handleSelectGroup(targetGroup.name);
      const targetBtn = tabRefs.current[targetGroup.name];
      if (targetBtn) {
        targetBtn.focus();
      }
    }
  };

  // Identify active module if in a sub-operations view (hub)
  const activeModule = MODULE_REGISTRY.find((m) => m.subView === currentView);

  // Identify parent group if in a group sub-page view (Level 3)
  const parentGroup = MODULE_REGISTRY.flatMap((m) =>
    (m.subApps || []).map((sa) => ({
      ...sa,
      moduleKey: m.key,
      moduleLabel: m.label,
      moduleSubView: m.subView
    }))
  ).find((sa) => sa.subView === currentView);

  return (
    <div className="fiori-launchpad-root">
      {currentView === 'home' ? (
        /* ================= LEVEL 1: PRODUCTS ================= */
        <>
          <FioriPageHeader
            title="Products"
            subtitle="Enterprise applications"
            onBack={onNavigateHome}
            backTitle="Back to Home"
            systemKey={systemKey}
            breadcrumbs={getBreadcrumbTrail('products', { onNavigateHome, onNavigateProducts })}
          >
            {/* Dynamic Horizontal Tab Bar (Tabs at bottom edge with 16px above) */}
            {homeGroups.length > 0 && (
              <div
                className="fiori-home-tabs"
                role="tablist"
                aria-label="Application categories"
                style={{ marginTop: 16 }}
              >
                {homeGroups.map((group, index) => {
                  const isActive = group.name === activeGroupName;
                  const tabSlug = group.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                  return (
                    <button
                      key={group.name}
                      ref={(el) => {
                        tabRefs.current[group.name] = el;
                      }}
                      type="button"
                      role="tab"
                      id={`fiori-home-tab-${tabSlug}`}
                      aria-selected={isActive}
                      aria-controls={`fiori-home-tabpanel-${tabSlug}`}
                      tabIndex={isActive ? 0 : -1}
                      className={`sap-btn fiori-home-tab ${isActive ? 'sap-btn-primary active' : 'sap-btn-secondary'}`}
                      onClick={() => handleSelectGroup(group.name)}
                      onKeyDown={(e) => handleTabKeyDown(e, index)}
                    >
                      <span>{group.name}</span>
                      <span className="fiori-home-tab-badge">
                        {group.modules.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </FioriPageHeader>

          <div className="fiori-body">
            {isLoading ? (
              <div className="fiori-tiles-grid" aria-label="Loading modules">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className="fiori-tile"
                    style={{
                      height: 154,
                      opacity: 0.6,
                      background: 'var(--sap-card-bg, #fff)',
                      border: '1px solid var(--sap-border, #d9d9d9)',
                      borderRadius: 'var(--radius-xl, 12px)',
                      padding: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.06)' }} />
                    <div>
                      <div style={{ width: '65%', height: 16, borderRadius: 4, background: 'rgba(0,0,0,0.08)', marginBottom: 6 }} />
                      <div style={{ width: '85%', height: 12, borderRadius: 4, background: 'rgba(0,0,0,0.05)' }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : activeGroup && activeGroup.modules.length > 0 ? (
              <div
                key={activeGroup.name}
                role="tabpanel"
                id={`fiori-home-tabpanel-${activeGroup.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                aria-labelledby={`fiori-home-tab-${activeGroup.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                tabIndex={0}
                style={{ outline: 'none' }}
              >
                <div className="fiori-tiles-grid">
                  {activeGroup.modules.map((mod) => {
                    const Icon = ICON_MAP[mod.iconName] || Layers;
                    const isSoon = mod.status === MODULE_STATUS.COMING_SOON;

                    return (
                      <button
                        key={mod.key}
                        type="button"
                        className={`fiori-tile ${isSoon ? 'off' : ''}`}
                        disabled={isSoon}
                        onClick={() => {
                          if (!isSoon && mod.subView) {
                            handleSetView(mod.subView);
                          }
                        }}
                      >
                        <div className="fiori-tile-header">
                          <div className="fiori-tile-icon">
                            <Icon size={22} strokeWidth={1.8} />
                          </div>
                          {isSoon && (
                            <span className="fiori-tile-top-pill">Coming soon</span>
                          )}
                        </div>
                        <div className="fiori-tile-title">{mod.label}</div>
                        <div className="fiori-tile-desc">{mod.desc}</div>
                        <div className="fiori-tile-footer">
                          {(mod.key === 'bom' ? bomAppCount > 0 : mod.kpiNum) && (
                            <div className="fiori-tile-kpi">
                              {mod.key === 'bom' ? bomAppCount : mod.kpiNum}
                              <small>{mod.key === 'bom' ? (bomAppCount === 1 ? 'feature' : 'features') : mod.kpiLabel}</small>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Empty Launchpad State when zero modules or features are enabled for this server */
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 20px',
                  textAlign: 'center',
                  background: 'var(--sap-card-bg)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--sap-border-subtle)',
                  margin: '20px 0'
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--sap-surface-empty)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                    color: 'var(--sap-text-muted)'
                  }}
                >
                  <AlertCircle size={28} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sap-text-dark)', margin: '0 0 8px' }}>
                  No Modules Enabled
                </h3>
                <p style={{ fontSize: 14, color: 'var(--sap-text-muted)', maxWidth: 440, margin: 0, lineHeight: 1.5 }}>
                  There are currently no functional modules enabled for this SAP server.
                  Please select another server or contact an administrator to grant module access.
                </p>
              </div>
            )}
          </div>
        </>
      ) : activeModule ? (
        /* ================= LEVEL 2: DYNAMIC MODULE OPERATIONS (HUB - 5 CARDS) ================= */
        <>
          <FioriPageHeader
            title={activeModule.label}
            subtitle={activeModule.key === 'bom' ? "Create, copy, display, validate and delete Bills of Materials." : (activeModule.desc || "Manage your enterprise operations.")}
            onBack={onNavigateHome || (() => handleSetView('home'))}
            backTitle="Back to Home"
            systemKey={systemKey}
            breadcrumbs={getBreadcrumbTrail(activeModule.subView, {
              onNavigateHome,
              onNavigateBom: () => handleSetView('bom_operations')
            })}
          />

          <div className="fiori-body">
            <div className="fiori-operations-header-block">
              <h2 className="fiori-group-title">Operations</h2>
              <p className="fiori-group-subtitle">Choose an operation</p>
            </div>
            <div className="fiori-op-grid">
              {(userRole === 'admin' || enabledModules.includes(activeModule.key)) && (activeModule.subApps || [])
                .filter((op) => hasCardPermission(op, userPermissions, userRole))
                .map((op) => (
                  <FioriOpCard
                    key={op.id}
                    id={op.id}
                    title={op.title}
                    desc={op.desc}
                    iconName={op.iconName}
                    danger={op.danger}
                    onClick={() => {
                      if (op.isGroup && op.subView) {
                        handleSetView(op.subView);
                      } else if (op.action) {
                        onOpenAction(op.action);
                      }
                    }}
                  />
                ))}
            </div>
          </div>
        </>
      ) : parentGroup ? (
        /* ================= LEVEL 3: GROUP SUB-PAGE (Create BOM / Copy BOM - 2 CARDS) ================= */
        <>
          <FioriPageHeader
            title={parentGroup.title}
            subtitle={
              parentGroup.subView === 'bom_create_operations' || parentGroup.id === 'create_group'
                ? 'Create a single BOM, or many at once from a file.'
                : parentGroup.subView === 'bom_copy_operations' || parentGroup.id === 'copy_group'
                ? 'Copy a single BOM, or many at once.'
                : parentGroup.desc || 'Choose an operation'
            }
            onBack={() => handleSetView(parentGroup.moduleSubView)}
            backTitle={`Back to ${parentGroup.moduleLabel}`}
            systemKey={systemKey}
            breadcrumbs={getBreadcrumbTrail(parentGroup.subView, {
              onNavigateHome,
              onNavigateProducts: () => handleSetView('home'),
              onNavigateBom: () => handleSetView(parentGroup.moduleSubView)
            })}
          />

          <div className="fiori-body">
            <div className="fiori-operations-header-block">
              <h2 className="fiori-group-title">Operations</h2>
              <p className="fiori-group-subtitle">Choose an operation</p>
            </div>
            <div className="fiori-op-grid">
              {(userRole === 'admin' || enabledModules.includes(parentGroup.moduleKey)) && (parentGroup.children || [])
                .filter((child) => hasCardPermission(child, userPermissions, userRole))
                .map((child) => (
                  <FioriOpCard
                    key={child.id}
                    id={child.id}
                    title={child.title}
                    desc={child.desc}
                    iconName={child.iconName}
                    danger={child.danger}
                    onClick={() => {
                      if (child.action) {
                        onOpenAction(child.action);
                      }
                    }}
                  />
                ))}
            </div>
          </div>
        </>
      ) : (
        /* Fallback if view not recognized */
        <div style={{ padding: 24, textAlign: 'center' }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={onNavigateHome || (() => handleSetView('home'))}
          >
            Return to Home
          </button>
        </div>
      )}
    </div>
  );
}
