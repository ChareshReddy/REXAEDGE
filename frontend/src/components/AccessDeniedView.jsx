import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Link } from '../context/RouterContext';
import { ROUTE_IDS } from '../config/routes';

export default function AccessDeniedView({
  reason = 'You do not have permission to access this screen.',
  details = null
}) {
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
      role="alert"
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'var(--sap-warning-bg)',
          border: '1px solid var(--sap-warning-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
          color: 'var(--color-blue-600)'
        }}
        aria-hidden="true"
      >
        <ShieldAlert size={34} />
      </div>

      <h1
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          color: 'var(--color-navy-900)',
          margin: '0 0 10px'
        }}
      >
        Access Denied
      </h1>

      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--sap-text-muted)',
          margin: '0 0 24px',
          lineHeight: 1.6,
          maxWidth: '420px'
        }}
      >
        {reason}
      </p>

      {details && (
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'var(--sap-text-subtle)',
            margin: '-12px 0 24px',
            lineHeight: 1.5
          }}
        >
          {details}
        </p>
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
