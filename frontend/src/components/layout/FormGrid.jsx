import React from 'react';
import './layout.css';

/**
 * Shared FormGrid Component
 * Responsive CSS Grid:
 * - auto-fit columns with min 260px
 * - inputs capped at 420px max-width to avoid stretching
 * - consistent spacing (16px gap)
 */
export default function FormGrid({
  children,
  className = '',
  style = {},
  columns,
  ...rest
}) {
  const inlineStyle = {
    ...style,
    ...(columns ? { gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, 1fr)` : columns } : {})
  };

  return (
    <div
      className={`sap-form-grid-responsive ${className}`.trim()}
      style={inlineStyle}
      {...rest}
    >
      {children}
    </div>
  );
}
