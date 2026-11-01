import React from 'react';

/**
 * Shared Fiori Page Header Component
 * Layout (top to bottom):
 * 1. Title first (big, bold, navy)
 * 2. One-line subtitle below it (gray, normal sentence case)
 * 3. Breadcrumbs trail (Home > Products > ...)
 * 4. Children (tabs, filters, etc.)
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
        {/* 1. Top Section: Title first, then Subtitle directly below it */}
        <div className="fiori-ph-header-top">
          <div className="fiori-ph-title-row">
            <h1 className={`fiori-ph-title ${isProductsPage ? 'fiori-ph-title-products' : ''}`}>
              {title}
            </h1>
            {extraTitleContent}
          </div>
          {subtitle && <p className="fiori-ph-subtitle sap-layout-subtitle">{subtitle}</p>}
        </div>

        {/* 2. Middle Section: Breadcrumbs Trail (plain text links with chevron separators, no pills) */}
        {Array.isArray(breadcrumbs) && breadcrumbs.length > 0 && (
          <div className="fiori-bc">
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
          </div>
        )}

        {/* 3. Bottom Section: Tabs / Toolbar (if provided) */}
        {children}
      </div>
    </div>
  );
}
