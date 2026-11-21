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
        background: 'var(--sap-card-bg)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--sap-border-subtle)',
        boxShadow: 'var(--sap-shadow-md)'
      }}
      role="region"
      aria-label="Page Not Found"
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--sap-info-bg)',
          border: '1px solid var(--sap-info-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: 'var(--color-navy-900)'
        }}
        aria-hidden="true"
      >
        <Compass size={34} />
      </div>

      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-navy-900)',
          margin: '0 0 10px'
        }}
      >
        Page Not Found (404)
      </h1>

      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--sap-text-muted)',
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
            background: 'var(--sap-surface-subtle)',
            borderRadius: '4px',
            color: 'var(--sap-text-dark)',
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
