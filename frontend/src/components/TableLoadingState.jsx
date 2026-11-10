import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shared reusable table loading component with centered orange spinner,
 * clear sentence-case loading text, and a fixed min-height to prevent layout shift.
 */
export default function TableLoadingState({
  message = 'Loading data...',
  minHeight = 360,
  borderless = false,
  style = {},
  className = ''
}) {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    padding: '32px 24px',
    width: '100%',
    boxSizing: 'border-box',
    ...(borderless
      ? {}
      : {
          background: '#ffffff',
          border: '1px solid var(--sap-border-color, #e2d8d8)',
          borderRadius: 'var(--sap-radius-md, 8px)',
          boxShadow: 'var(--sap-shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05))'
        }),
    ...style
  };

  return (
    <div
      className={`sap-table-loading-container ${className}`.trim()}
      style={containerStyle}
      role="status"
      aria-live="polite"
    >
      <Loader2
        size={32}
        className="sap-spin"
        color="#02579A"
        style={{ color: '#02579A', flexShrink: 0 }}
      />
      <span
        style={{
          marginTop: 12,
          fontSize: 13,
          fontWeight: 500,
          color: '#334155', // slate-700
          textAlign: 'center'
        }}
      >
        {message}
      </span>
    </div>
  );
}
