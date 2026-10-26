import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * Shared Fiori Page Header Component
 * - Renders breadcrumbs on the left
 * - Renders Title row: Back button, Title (h1), systemKey pill on the left
 * - Renders extraTitleContent if provided
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
  className = '',
  style = {}
}) {
  return (
    <div className={`fiori-ph ${className}`} style={style}>
      {/* Breadcrumbs Row */}
      {Array.isArray(breadcrumbs) && breadcrumbs.length > 0 && (
        <div className="fiori-bc">
          {breadcrumbs.map((b, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="fiori-bc-sep">›</span>}
              {b.onClick ? (
                <button type="button" className="fiori-bc-link" onClick={b.onClick}>
                  {b.label}
                </button>
              ) : (
                <span className="fiori-bc-current">{b.label}</span>
              )}
            </React.Fragment>
          ))}
          {systemKey && (
            <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>
              {systemKey}
            </span>
          )}
        </div>
      )}

      {/* Title Row with Left Title */}
      <div className="fiori-ph-title-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {onBack && (
            <button
              type="button"
              className="fiori-ph-back"
              onClick={isLocked ? undefined : onBack}
              title={backTitle || (isLocked ? 'Operation in progress' : 'Back')}
              aria-label={backTitle || 'Back'}
              style={{ cursor: isLocked ? 'not-allowed' : 'pointer', opacity: isLocked ? 0.6 : 1 }}
            >
              <ChevronLeft size={16} />
            </button>
          )}

          <h1 className="fiori-ph-title">{title}</h1>

          {systemKey && !breadcrumbs && (
            <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>
              {systemKey}
            </span>
          )}

          {extraTitleContent}
        </div>
      </div>

      {/* Subtitle */}
      {subtitle && <p className="fiori-ph-subtitle">{subtitle}</p>}
    </div>
  );
}
