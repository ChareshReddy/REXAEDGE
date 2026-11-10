import React from 'react';
import { useRouter } from '../../context/RouterContext';

/**
 * Single | Bulk Switch Component
 * Segmented control on the right of the page header for Create, Copy, and Delete pages.
 * Seamlessly switches between Single and Bulk routes while preserving app context.
 */
export default function SingleBulkSwitch({
  operation = 'create', // 'create' | 'copy' | 'delete'
  mode = 'single',       // 'single' | 'bulk'
  onModeChange,
  className = '',
  style = {}
}) {
  let router = null;
  try {
    router = useRouter();
  } catch {
    router = null;
  }

  const handleSwitch = (targetMode) => {
    if (targetMode === mode) return;

    if (onModeChange) {
      onModeChange(targetMode);
      return;
    }

    // Default route mapping
    if (operation === 'create') {
      const targetPath = targetMode === 'bulk' ? '/products/bom/create/bulk' : '/products/bom/create/single';
      if (router?.navigate) {
        router.navigate(targetPath);
      } else if (typeof window !== 'undefined') {
        window.location.pathname = targetPath;
      }
    } else if (operation === 'copy') {
      const targetPath = targetMode === 'bulk' ? '/products/bom/copy/bulk' : '/products/bom/copy/single';
      if (router?.navigate) {
        router.navigate(targetPath);
      } else if (typeof window !== 'undefined') {
        window.location.pathname = targetPath;
      }
    }
  };

  const isBulkDisabled = operation === 'delete';

  return (
    <div
      className={`rx-single-bulk-switch ${className}`}
      role="group"
      aria-label="Operation mode selection"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        backgroundColor: 'var(--color-blue-50, #EEF4F9)',
        borderRadius: '10px',
        border: '1px solid var(--color-border, #D9E2EC)',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {/* Single Mode Button */}
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'single'}
        aria-pressed={mode === 'single'}
        aria-current={mode === 'single' ? 'page' : undefined}
        onClick={() => handleSwitch('single')}
        className={`rx-switch-btn ${mode === 'single' ? 'active' : ''}`}
        style={{
          height: '36px',
          padding: '0 16px',
          borderRadius: '8px',
          border: 'none',
          cursor: 'pointer',
          backgroundColor: mode === 'single' ? 'var(--color-blue-600, #02579A)' : 'transparent',
          color: mode === 'single' ? '#FFFFFF' : 'var(--color-navy-900, #00204E)',
          fontWeight: mode === 'single' ? 600 : 500,
          fontSize: 'var(--font-size-13, 13px)',
          fontFamily: 'var(--font-sans)',
          boxShadow: mode === 'single' ? 'var(--shadow-sm, 0 1px 2px rgba(0, 32, 78, 0.05))' : 'none',
          transition: 'all var(--transition-fast, 150ms ease)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none'
        }}
      >
        Single
      </button>

      {/* Bulk Mode Button */}
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'bulk'}
        aria-pressed={mode === 'bulk'}
        aria-current={mode === 'bulk' ? 'page' : undefined}
        disabled={isBulkDisabled}
        title={isBulkDisabled ? 'Bulk delete is not supported in SAP' : undefined}
        onClick={() => !isBulkDisabled && handleSwitch('bulk')}
        className={`rx-switch-btn ${mode === 'bulk' ? 'active' : ''}`}
        style={{
          height: '36px',
          padding: '0 16px',
          borderRadius: '8px',
          border: 'none',
          cursor: isBulkDisabled ? 'not-allowed' : 'pointer',
          opacity: isBulkDisabled ? 0.45 : 1,
          backgroundColor: mode === 'bulk' ? 'var(--color-blue-600, #02579A)' : 'transparent',
          color: mode === 'bulk' ? '#FFFFFF' : 'var(--color-navy-900, #00204E)',
          fontWeight: mode === 'bulk' ? 600 : 500,
          fontSize: 'var(--font-size-13, 13px)',
          fontFamily: 'var(--font-sans)',
          boxShadow: mode === 'bulk' ? 'var(--shadow-sm, 0 1px 2px rgba(0, 32, 78, 0.05))' : 'none',
          transition: 'all var(--transition-fast, 150ms ease)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none'
        }}
      >
        Bulk
      </button>
    </div>
  );
}
