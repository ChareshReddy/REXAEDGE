import React from 'react';
import './layout.css';

/**
 * Shared PageHeader Component
 * Title, one-line subtitle (gray sentence case), and breadcrumbs.
 * Aligns perfectly with the 1680px container and responsive side paddings.
 */
export default function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  extraTitleContent,
  children,
  className = '',
  style = {}
}) {
  return (
    <header className={`sap-layout-header ${className}`} style={style}>
      <div className="sap-layout-header-inner">
        <div className="fiori-ph-header-top">
          <div className="fiori-ph-title-row">
            <h1 className="fiori-ph-title">{title}</h1>
            {extraTitleContent}
          </div>
          {subtitle && <p className="fiori-ph-subtitle sap-layout-subtitle">{subtitle}</p>}
        </div>

        {Array.isArray(breadcrumbs) && breadcrumbs.length > 0 && (
          <nav className="fiori-bc" aria-label="Breadcrumb">
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
          </nav>
        )}

        {children}
      </div>
    </header>
  );
}
