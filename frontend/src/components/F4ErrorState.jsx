import React, { useState } from 'react';
import { AlertCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { extractErrorInfo } from '../utils/friendlyError.js';

/**
 * Shared F4 Value Help Popup Error State
 *
 * Renders a clean centered error view with amber styling, friendly title/message/hint,
 * a copyable Reference code (error_ref), and a "Try again" action button.
 * Eliminates long horizontal scrollbars, text overflows, and red colors.
 */
export function F4ErrorState({
  error,
  onRetry,
  style = {}
}) {
  const [copied, setCopied] = useState(false);
  const info = extractErrorInfo(error);

  const handleCopyRef = (e) => {
    e.stopPropagation();
    if (info.errorRef && navigator.clipboard) {
      navigator.clipboard.writeText(info.errorRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="sap-f4-error-state"
      style={{
        padding: '36px 20px',
        textAlign: 'center',
        maxWidth: '460px',
        margin: '0 auto',
        boxSizing: 'border-box',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
        ...style
      }}
      role="alert"
    >
      {/* Amber Alert Icon (No Red) */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'var(--color-warning-bg)', // amber-100
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 12px auto'
        }}
        aria-hidden="true"
      >
        <AlertCircle size={24} color="var(--color-warning)" />
      </div>

      {/* Friendly Title */}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-text)',
          marginBottom: 6
        }}
      >
        {info.title || 'Unable to load data'}
      </div>

      {/* Friendly Message */}
      <div
        style={{
          fontSize: 13,
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
          marginBottom: info.hint ? 10 : 14
        }}
      >
        {info.message}
      </div>

      {/* Hint if present */}
      {info.hint && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--color-warning-strong)', // amber-800
            backgroundColor: 'var(--color-warning-bg)', // amber-50
            border: '1px solid var(--color-warning-border)', // amber-200
            borderRadius: 6,
            padding: '8px 12px',
            marginBottom: 14,
            textAlign: 'left',
            lineHeight: 1.4
          }}
        >
          {info.hint}
        </div>
      )}

      {/* Reference Code (error_ref) - Small & Copyable */}
      {info.errorRef && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            backgroundColor: 'var(--color-surface-subtle)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            marginBottom: 16
          }}
        >
          <span>
            Reference: <strong style={{ fontFamily: 'monospace', color: 'var(--color-text)' }}>{info.errorRef}</strong>
          </span>
          <button
            type="button"
            onClick={handleCopyRef}
            title="Copy error reference"
            aria-label="Copy error reference"
            style={{
              background: 'none',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)'
            }}
          >
            {copied ? <Check size={12} color="var(--color-success)" /> : <Copy size={12} />}
          </button>
        </div>
      )}

      {/* Try Again Button */}
      {onRetry && (
        <div>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={onRetry}
            style={{
              fontSize: 13,
              padding: '6px 18px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              margin: '0 auto',
              fontWeight: 500
            }}
          >
            <RefreshCw size={13} />
            <span>Try again</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default F4ErrorState;
