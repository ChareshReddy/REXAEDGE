import React from 'react';
import './layout.css';

/**
 * Shared StickyActionBar Component
 * Pinned to the bottom of the viewport so users never hunt or scroll for actions.
 * Content aligns strictly with the 1680px container and responsive side paddings.
 */
export default function StickyActionBar({
  leftActions,
  rightActions,
  children,
  className = '',
  style = {}
}) {
  return (
    <footer className={`sap-sticky-action-bar ${className}`.trim()} style={style}>
      <div className="sap-sticky-action-bar-inner">
        <div className="sap-sticky-actions-left">
          {leftActions}
        </div>
        <div className="sap-sticky-actions-right">
          {rightActions || children}
        </div>
      </div>
    </footer>
  );
}
