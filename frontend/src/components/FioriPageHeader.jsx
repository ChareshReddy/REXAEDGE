import React from 'react';
import { Link } from '../context/RouterContext';

/**
 * Shared Fiori Page Header Component
 * Layout (top to bottom):
 * 1. Breadcrumbs on top (13px, muted slate, chevrons, hover orange-700, current navy semi-bold)
 * 2. Title below breadcrumbs (28px bold navy #00204E, 8px gap)
 * 3. Description below title (15px regular slate-600 #475569, 4px gap, max 70ch)
 * 4. Children (tabs, filters, etc. at bottom edge with 16px gap above)
 */
export default function FioriPageHeader({
  title,
  subtitle,
  onBack,
  backTitle,
  isLocked = false,
  breadcrumbs,
  systemKey,
  extraTitleContent,
  children,
  className = '',
  style = {}
}) {
  const isProductsPage = title === 'Products';

  const renderBreadcrumbItem = (b, isLast = false) => {
    if (isLast) {
      return <span className="fiori-bc-current">{b.label}</span>;
    }
    if (b.path || b.to) {
      return (
        <Link to={b.path || b.to} className="fiori-bc-link">
          {b.label}
        </Link>
      );
    }
    if (b.onClick) {
      return (
        <button
          type="button"
          className="fiori-bc-link"
          onClick={b.onClick}
        >
          {b.label}
        </button>
      );
    }
    return <span className="fiori-bc-current">{b.label}</span>;
  };

  return (
    <div className={`fiori-ph ${className}`} style={style}>
      <div className="sap-layout-header-inner">
        {/* 1. Breadcrumbs Trail on top */}
        {Array.isArray(breadcrumbs) && breadcrumbs.length > 0 && (
          <nav className="fiori-bc" aria-label="Breadcrumb">
            {breadcrumbs.length <= 2 ? (
              breadcrumbs.map((b, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <span className="fiori-bc-sep">›</span>}
                  {renderBreadcrumbItem(b, idx === breadcrumbs.length - 1)}
                </React.Fragment>
              ))
            ) : (
              <>
                <span className="fiori-bc-desktop">
                  {breadcrumbs.map((b, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="fiori-bc-sep">›</span>}
                      {renderBreadcrumbItem(b, idx === breadcrumbs.length - 1)}
                    </React.Fragment>
                  ))}
                </span>
                <span className="fiori-bc-mobile">
                  {renderBreadcrumbItem(breadcrumbs[0], false)}
                  <span className="fiori-bc-sep">›</span>
                  <span
                    className="fiori-bc-collapsed"
                    title={breadcrumbs.slice(1, -1).map((b) => b.label).join(' › ')}
                  >
                    …
                  </span>
                  <span className="fiori-bc-sep">›</span>
                  {renderBreadcrumbItem(breadcrumbs[breadcrumbs.length - 1], true)}
                </span>
              </>
            )}
          </nav>
        )}

        {/* 2. Title Row below breadcrumbs */}
        <div className="fiori-ph-title-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className={`fiori-ph-title ${isProductsPage ? 'fiori-ph-title-products' : ''}`}>
              {title}
            </h1>
            {/* 3. Description below title */}
            {subtitle && <p className="fiori-ph-subtitle sap-layout-subtitle">{subtitle}</p>}
          </div>
          {extraTitleContent && (
            <div className="fiori-ph-actions-right" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              {extraTitleContent}
            </div>
          )}
        </div>

        {/* 4. Tabs / Children (if provided) */}
        {children}
      </div>
    </div>
  );
}
