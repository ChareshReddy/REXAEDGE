import React from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { reportClientError } from '../services/api.js';

function generateClientErrorRef() {
  const bytes = new Uint8Array(4);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  return Math.random().toString(16).slice(2, 10).toUpperCase();
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorRef: null,
      copied: false
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
      errorRef: generateClientErrorRef()
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Render Crash caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });

    const ref = this.state.errorRef || generateClientErrorRef();
    if (!this.state.errorRef) {
      this.setState({ errorRef: ref });
    }

    reportClientError({
      error_ref: ref,
      message: error?.message || 'Client render exception',
      stack: error?.stack || null,
      component_stack: errorInfo?.componentStack || null,
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    }).catch(() => {});
  }

  handleCopyRef = () => {
    if (this.state.errorRef && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.state.errorRef).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2000);
      }).catch(() => {});
    }
  };

  handleReload = () => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, errorRef: null, copied: false });
  };

  render() {
    if (this.state.hasError) {
      const errorMessage =
        this.state.error?.message || String(this.state.error || 'An unexpected rendering error occurred.');
      const stack = this.state.error?.stack || this.state.errorInfo?.componentStack || '';
      const ref = this.state.errorRef;

      return (
        <div
          className="sap-error-boundary-root"
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            backgroundColor: 'var(--color-bg, #FFFBFB)',
            fontFamily:
              'var(--font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif)',
            color: 'var(--color-text, #1d2d3e)',
            boxSizing: 'border-box'
          }}
        >
          <div
            className="sap-error-boundary-card"
            style={{
              maxWidth: 620,
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid var(--color-border, #e2e8f0)',
              boxShadow: 'var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.08))',
              padding: '32px',
              textAlign: 'center',
              boxSizing: 'border-box'
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                backgroundColor: 'var(--color-amber-50, #fffbeb)',
                color: 'var(--color-amber-700, #b45309)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}
            >
              <AlertTriangle size={32} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: 'var(--color-text, #1d2d3e)' }}>
              Application Render Error
            </h2>

            <p style={{ fontSize: '14px', color: 'var(--color-text-muted, #64748b)', margin: '0 0 16px', lineHeight: 1.5 }}>
              The application encountered an unexpected error while rendering this view.
            </p>

            {ref && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'var(--color-amber-50, #fffbeb)',
                  border: '1px solid var(--color-amber-200, #fde68a)',
                  borderRadius: '6px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  color: 'var(--color-amber-900, #78350f)',
                  marginBottom: '18px'
                }}
              >
                <span>
                  Error ref: <strong>{ref}</strong> — quote this to your administrator
                </span>
                <button
                  type="button"
                  onClick={this.handleCopyRef}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 4px',
                    cursor: 'pointer',
                    color: 'var(--color-amber-800, #92400e)',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                  title="Copy error reference"
                >
                  {this.state.copied ? <Check size={14} color="#15803d" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            <div
              style={{
                backgroundColor: 'var(--color-amber-50, #fffbeb)',
                border: '1px solid var(--color-amber-300, #fcd34d)',
                borderRadius: '8px',
                padding: '12px 16px',
                textAlign: 'left',
                marginBottom: '24px',
                fontSize: '13px',
                color: 'var(--color-amber-800, #92400e)',
                wordBreak: 'break-word',
                fontFamily: 'monospace'
              }}
            >
              <strong>Error:</strong> {errorMessage}
            </div>

            {stack && (
              <details
                style={{
                  marginBottom: '24px',
                  textAlign: 'left',
                  fontSize: '12px',
                  color: 'var(--color-text-muted, #64748b)',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--color-border, #e2e8f0)',
                  borderRadius: '6px',
                  padding: '8px 12px'
                }}
              >
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Technical Stack Trace</summary>
                <pre
                  style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '160px',
                    overflowY: 'auto'
                  }}
                >
                  {stack}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReload}
                className="sap-btn sap-btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: 'var(--sap-btn-primary-bg, #02579A)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={16} />
                <span>Reload Application</span>
              </button>

              <button
                type="button"
                onClick={this.handleReset}
                className="sap-btn sap-btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  backgroundColor: '#ffffff',
                  color: 'var(--color-text, #32363a)',
                  border: '1px solid var(--color-border, #d9d9d9)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span>Try Again</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
