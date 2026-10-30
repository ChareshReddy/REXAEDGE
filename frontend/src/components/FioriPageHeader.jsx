import React from 'react';

/**
 * Shared Fiori Page Header Component
 * Layout (top to bottom):
 * 1. Top: Page title with a short subtitle above it
 * 2. Bottom: Breadcrumbs trail (Home > Products > ...)
 * Back button and environment pill are removed per design system.
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
  return (
    <div className={`fiori-ph ${className}`} style={style}>
      {/* 1. Top Section: Subtitle above Title */}
      <div className="fiori-ph-header-top">
        {subtitle && <p className="fiori-ph-subtitle">{subtitle}</p>}
        <div className="fiori-ph-title-row">
          <h1 className="fiori-ph-title">{title}</h1>
          {extraTitleContent}
        </div>
      </div>

      {/* 2. Middle Section: Breadcrumbs Trail */}
      {Array.isArray(breadcrumbs) && breadcrumbs.length > 0 && (
        <div className="fiori-bc">
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="fiori-bc-sep">›</span>}
              {b.onClick ? (
                <button
                  type="button"
                  className="fiori-bc-link sap-button"
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
  );
}
