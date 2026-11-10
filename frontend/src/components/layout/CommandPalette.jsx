import React, { useState, useEffect, useRef } from 'react';
import { Search, ArrowRight, Layers, Home, ShieldCheck, FileSpreadsheet, Copy, Trash2, Eye, ShieldAlert, X } from 'lucide-react';
import { ROUTES } from '../../config/routes';
import { MODULE_REGISTRY, ALL_BOM_APPS, hasCardPermission } from '@shared/modules.js';

export function CommandPalette({
  isOpen,
  onClose,
  onNavigate,
  userRole = 'user',
  userPermissions = [],
  enabledModules = ['bom']
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open via custom event or parent prop
          window.dispatchEvent(new CustomEvent('rexa:open-command-palette'));
        }
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Build searchable items aligned with sidebar groups and breadcrumbs
  const items = [
    { id: 'home', title: 'Home', subtitle: 'Home', breadcrumb: 'Home', icon: Home, routeId: 'home', path: '/home', tab: 'home' },
    { id: 'bom_create_single', title: 'Create Single BOM', subtitle: 'Home / BOM management / Create BOM', breadcrumb: 'Home / BOM management / Create BOM', icon: Layers, routeId: 'bomCreateSingle', path: '/products/bom/create/single', tab: 'create_bom' },
    { id: 'bom_create_bulk', title: 'Create Bulk BOM', subtitle: 'Home / BOM management / Create BOM', breadcrumb: 'Home / BOM management / Create BOM', icon: Layers, routeId: 'bomCreateBulk', path: '/products/bom/create/bulk', tab: 'bulk_create_bom' },
    { id: 'bom_copy_single', title: 'Copy Single BOM', subtitle: 'Home / BOM management / Copy BOM', breadcrumb: 'Home / BOM management / Copy BOM', icon: Copy, routeId: 'bomCopySingle', path: '/products/bom/copy/single', tab: 'copy_bom' },
    { id: 'bom_copy_bulk', title: 'Copy Bulk BOM', subtitle: 'Home / BOM management / Copy BOM', breadcrumb: 'Home / BOM management / Copy BOM', icon: Copy, routeId: 'bomCopyBulk', path: '/products/bom/copy/bulk', tab: 'bulk_bom' },
    { id: 'bom_display', title: 'Display BOM', subtitle: 'Home / BOM management / Display BOM', breadcrumb: 'Home / BOM management / Display BOM', icon: Eye, routeId: 'bomDisplay', path: '/products/bom/display', tab: 'bom_explorer' },
    { id: 'bom_validate', title: 'Validate BOM', subtitle: 'Home / BOM management / Validate BOM', breadcrumb: 'Home / BOM management / Validate BOM', icon: ShieldCheck, routeId: 'bomValidate', path: '/products/bom/validate', tab: 'validate_bom' },
    { id: 'bom_delete', title: 'Delete BOM', subtitle: 'Home / BOM management / Delete BOM', breadcrumb: 'Home / BOM management / Delete BOM', icon: Trash2, routeId: 'bomDelete', path: '/products/bom/delete', tab: 'delete_bom' },
    { id: 'bom_hub', title: 'Bill of Materials Operations', subtitle: 'Home / BOM management', breadcrumb: 'Home / BOM management', icon: FileSpreadsheet, routeId: 'bomOperations', path: '/products/bom', tab: 'launchpad', subView: 'bom_operations' },
    ...(userRole === 'admin' ? [
      { id: 'admin_users', title: 'Users Management', subtitle: 'Home / Admin / Users', breadcrumb: 'Home / Admin / Users', icon: ShieldCheck, routeId: 'adminUsers', path: '/admin/users', tab: 'admin', adminTab: 'users' },
      { id: 'admin_servers', title: 'SAP Servers', subtitle: 'Home / Admin / Servers', breadcrumb: 'Home / Admin / Servers', icon: ShieldCheck, routeId: 'adminServers', path: '/admin/servers', tab: 'admin', adminTab: 'servers' },
      { id: 'admin_permissions', title: 'Permissions Matrix', subtitle: 'Home / Admin / Permissions', breadcrumb: 'Home / Admin / Permissions', icon: ShieldCheck, routeId: 'adminPermissions', path: '/admin/permissions', tab: 'admin', adminTab: 'permissions' },
      { id: 'admin_audit', title: 'Audit & Error Logs', subtitle: 'Home / Admin / Logs', breadcrumb: 'Home / Admin / Logs', icon: ShieldCheck, routeId: 'adminLogsAudit', path: '/admin/logs/audit', tab: 'admin', adminTab: 'activity-logs' }
    ] : [])
  ];

  const filtered = items.filter(item => {
    // Module check
    if (item.module && !enabledModules.includes(item.module) && userRole !== 'admin') return false;
    // App check
    if (item.app && userRole !== 'admin') {
      const permitted = userPermissions.includes('*') || userPermissions.includes(item.app);
      if (!permitted) return false;
    }
    // Search query
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.breadcrumb.toLowerCase().includes(q) ||
      item.path.toLowerCase().includes(q)
    );
  });

  const handleSelect = (item) => {
    onClose();
    if (onNavigate) {
      onNavigate(item);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="rx-command-palette-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 32, 78, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh'
      }}
    >
      <div
        className="rx-command-palette-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 580,
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: 'var(--radius-xl, 16px)',
          border: '1px solid var(--color-border, #D9E2EC)',
          boxShadow: 'var(--shadow-modal, 0 20px 48px rgba(0, 32, 78, 0.18))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Search Input Bar */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--color-border)', gap: 12 }}>
          <Search size={18} strokeWidth={1.75} style={{ color: 'var(--color-blue-600, #02579A)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, module, or search pages..."
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: 15,
              fontFamily: 'var(--font-sans)',
              color: 'var(--color-text)',
              background: 'transparent'
            }}
          />
          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--color-blue-50)', color: 'var(--color-text-secondary)', borderRadius: 4, border: '1px solid var(--color-border)' }}>
            ESC to close
          </span>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: 340, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 13 }}>
              No matching pages or operations found for "{query}".
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 18px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'var(--color-blue-50, #EEF4F9)' : 'transparent',
                    borderLeft: isSelected ? '3px solid var(--color-blue-600, #02579A)' : '3px solid transparent',
                    transition: 'background-color 100ms ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isSelected ? 'var(--color-blue-100)' : 'var(--color-blue-50)',
                      color: 'var(--color-blue-600)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-navy-900)' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={14} style={{ color: isSelected ? 'var(--color-blue-600)' : 'var(--color-text-muted)' }} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
