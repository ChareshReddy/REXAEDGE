import React from 'react';

/**
 * Shared Fiori Page Header Component
 * Layout (top to bottom):
 * 1. Breadcrumbs on top (13px, muted slate, chevrons, hover orange-700, current navy semi-bold)
 * 2. Title below breadcrumbs (28px bold navy #0f2744, 8px gap)
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
                  {b.onClick ? (
                    <button
                      type="button"
                      className="fiori-bc-link"
                      onClick={b.onClick}
                    >
                      {b.label}
                    </button>
                  ) : (
                    <span className="fiori-bc-current">{b.label}</span>
                  )}
                </React.Fragment>
              ))
            ) : (
              <>
                <span className="fiori-bc-desktop">
                  {breadcrumbs.map((b, idx) => (
                    <React.Fragment key={idx}>
                      {idx > 0 && <span className="fiori-bc-sep">›</span>}
                      {b.onClick ? (
                        <button
                          type="button"
                          className="fiori-bc-link"
                          onClick={b.onClick}
                        >
                          {b.label}
                        </button>
                      ) : (
                        <span className="fiori-bc-current">{b.label}</span>
                      )}
                    </React.Fragment>
                  ))}
                </span>
                <span className="fiori-bc-mobile">
                  {breadcrumbs[0].onClick ? (
                    <button
                      type="button"
                      className="fiori-bc-link"
                      onClick={breadcrumbs[0].onClick}
                    >
                      {breadcrumbs[0].label}
                    </button>
                  ) : (
                    <span className="fiori-bc-current">{breadcrumbs[0].label}</span>
                  )}
                  <span className="fiori-bc-sep">›</span>
                  <span
                    className="fiori-bc-collapsed"
                    title={breadcrumbs.slice(1, -1).map((b) => b.label).join(' › ')}
                  >
                    …
                  </span>
                  <span className="fiori-bc-sep">›</span>
                  {breadcrumbs[breadcrumbs.length - 1].onClick ? (
                    <button
                      type="button"
                      className="fiori-bc-link"
                      onClick={breadcrumbs[breadcrumbs.length - 1].onClick}
                    >
                      {breadcrumbs[breadcrumbs.length - 1].label}
                    </button>
                  ) : (
                    <span className="fiori-bc-current">
                      {breadcrumbs[breadcrumbs.length - 1].label}
                    </span>
                  )}
                </span>
              </>
            )}
          </nav>
        )}

        {/* 2. Title Row below breadcrumbs */}
        <div className="fiori-ph-title-row">
          <h1 className={`fiori-ph-title ${isProductsPage ? 'fiori-ph-title-products' : ''}`}>
            {title}
          </h1>
          {extraTitleContent}
        </div>

        {/* 3. Description below title */}
        {subtitle && <p className="fiori-ph-subtitle sap-layout-subtitle">{subtitle}</p>}

        {/* 4. Tabs / Children (if provided) */}
        {children}
      </div>
    </div>
  );
}
