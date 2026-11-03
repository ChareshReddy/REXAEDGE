import React from 'react';
import './layout.css';

/**
 * Shared PageContainer Component
 * Fluid responsive container:
 * - < 1366px: 24px side padding
 * - 1366px - 1600px: 32px side padding
 * - 1600px+: 40px side padding
 * - Max width: 1680px centered
 * - Standard 24px bottom padding (no extra reserved footer height)
 */
export default function PageContainer({
  children,
  className = '',
  style = {},
  hasStickyBar = false, // Deprecated, kept for backward compatibility without adding class
  as: Component = 'div',
  ...rest
}) {
  const containerClasses = [
    'sap-page-container',
    className
  ].filter(Boolean).join(' ');

  return (
    <Component className={containerClasses} style={style} {...rest}>
      {children}
    </Component>
  );
}
