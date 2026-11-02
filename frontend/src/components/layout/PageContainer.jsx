import React from 'react';
import './layout.css';

/**
 * Shared PageContainer Component
 * Fluid responsive container:
 * - < 1366px: 24px side padding
 * - 1366px - 1600px: 32px side padding
 * - 1600px+: 40px side padding
 * - Max width: 1680px centered
 * - Automatically accounts for StickyActionBar with bottom padding
 */
export default function PageContainer({
  children,
  className = '',
  style = {},
  hasStickyBar = false,
  as: Component = 'div',
  ...rest
}) {
  const containerClasses = [
    'sap-page-container',
    hasStickyBar ? 'has-sticky-bar' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <Component className={containerClasses} style={style} {...rest}>
      {children}
    </Component>
  );
}
