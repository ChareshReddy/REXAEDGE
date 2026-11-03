import React from 'react';
import { Compass, ArrowLeft } from 'lucide-react';
import { Link } from '../context/RouterContext';
import { ROUTE_IDS } from '../config/routes';

export default function NotFoundView({ pathname = '' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
        maxWidth: 540,
        margin: '60px auto',
        background: 'var(--sap-card-bg, #ffffff)',
        borderRadius: 'var(--radius-xl, 12px)',
        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
        boxShadow: 'var(--sap-shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1))'
      }}
      role="region"
      aria-label="Page Not Found"
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--sap-info-bg, #e8f4fd)',
          border: '1px solid var(--sap-info-border, #b8daff)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: 'var(--sap-shell-navy, #0f2744)'
        }}
        aria-hidden="true"
      >
        <Compass size={34} />
      </div>

      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--sap-shell-navy, #0f2744)',
          margin: '0 0 10px'
        }}
      >
        Page Not Found (404)
      </h1>

      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--sap-text-muted, #64748b)',
          margin: '0 0 12px',
          lineHeight: 1.6,
          maxWidth: '420px'
        }}
      >
        The page you requested could not be found. Please check the address or return to the main portal.
      </p>

      {pathname && (
        <code
          style={{
            fontSize: '0.8125rem',
            padding: '3px 8px',
            background: 'var(--sap-surface-subtle, #f1f5f9)',
            borderRadius: '4px',
            color: 'var(--sap-text-dark, #1e293b)',
            marginBottom: '24px'
          }}
        >
          {pathname}
        </code>
      )}

      <Link
        to={ROUTE_IDS.HOME}
        className="sap-button sap-btn sap-btn-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 20px',
          fontSize: '0.875rem',
          fontWeight: 600,
          textDecoration: 'none'
        }}
      >
        <ArrowLeft size={16} />
        <span>Return to Home</span>
      </Link>
    </div>
  );
}
