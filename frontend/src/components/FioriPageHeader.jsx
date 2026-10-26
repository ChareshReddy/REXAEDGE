import React from 'react';
import { ChevronLeft } from 'lucide-react';
import MaterialFinder from './MaterialFinder';

/**
 * Shared Fiori Page Header Component (Requirement 1, 4, 6)
 * - Renders breadcrumbs on the left
 * - Renders Title row: Back button, Title (h1), systemKey pill on the left
 * - Renders Material Finder search input on the right (width ~360px, min 240px, collapsed below 900px)
 * - Tightened vertical spacing so main page content starts higher
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
  showFinder = true,
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

      {/* Title Row with Left Title and Right-Aligned Material Finder */}
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

        {/* Right-aligned Material Finder */}
        {showFinder && (
          <div style={{ flexShrink: 0, marginLeft: 'auto' }}>
            <MaterialFinder />
          </div>
        )}
      </div>

      {/* Subtitle */}
      {subtitle && <p className="fiori-ph-subtitle">{subtitle}</p>}
    </div>
  );
}
