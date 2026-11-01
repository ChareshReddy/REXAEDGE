import React from 'react';
import './layout.css';

/**
 * Shared SummaryPanel Component
 * Right-hand sticky card for wide displays (>= 1500px).
 * Displays a live summary constructed ONLY from real user-entered data or server responses.
 * Automatically hidden/collapsed on smaller viewports (< 1500px).
 */
export default function SummaryPanel({
  title = 'Live Summary',
  items = [],
  badge,
  footer,
  children,
  className = '',
  style = {}
}) {
  return (
    <aside
      className={`sap-summary-panel ${className}`.trim()}
      style={style}
      aria-label={title}
    >
      <div className="sap-summary-panel-header">
        <h3 className="sap-summary-panel-title">{title}</h3>
        {badge && <span className="sap-summary-panel-badge">{badge}</span>}
      </div>

      {Array.isArray(items) && items.length > 0 && (
        <ul className="sap-summary-panel-list">
          {items.map((item, idx) => {
            if (!item) return null;
            const hasValue = item.value !== undefined && item.value !== null && String(item.value).trim() !== '';
            return (
              <li key={idx} className="sap-summary-panel-item">
                <span className="sap-summary-panel-label">{item.label}</span>
                <span className={`sap-summary-panel-val ${hasValue ? '' : 'empty'}`}>
                  {hasValue ? item.value : (item.placeholder || '—')}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {children}

      {footer && (
        <div className="sap-summary-panel-footer">
          {footer}
        </div>
      )}
    </aside>
  );
}
