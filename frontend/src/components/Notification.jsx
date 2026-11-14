import React, { createContext, useContext, useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X, Copy, Check } from 'lucide-react';

/**
 * Shared Notification Placement Context
 * Supported values: 'banner' (default floating app banner) | 'inline' (inside form/card) | 'popup' (inside modal/popup)
 */
export const NotificationPlacementContext = createContext({ placement: 'banner' });

export function NotificationPlacementProvider({ placement = 'banner', children }) {
  return (
    <NotificationPlacementContext.Provider value={{ placement }}>
      {children}
    </NotificationPlacementContext.Provider>
  );
}

export function useNotificationPlacement() {
  return useContext(NotificationPlacementContext);
}

/**
 * Unified Notification component supporting 'inline', 'banner', and 'popup' placements.
 * Adheres strictly to the pure orange theme with amber errors (zero red).
 * Includes title, message, list of validation messages, hints, error references with copy button, and dismissible close.
 */
export default function Notification({
  placement: propPlacement,
  type = 'error',
  title,
  message,
  messages = [],
  notes = [],
  hint,
  errorRef,
  onClose,
  role,
  className = '',
  style = {},
  autoClose = 0
}) {
  const contextPlacement = useNotificationPlacement();
  const placement = propPlacement || contextPlacement?.placement || 'banner';

  const [copied, setCopied] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);

  // Auto-close if specified
  useEffect(() => {
    if (!autoClose || autoClose <= 0 || !onClose) return;
    const timer = setTimeout(() => {
      onClose();
    }, autoClose);
    return () => clearTimeout(timer);
  }, [autoClose, onClose]);

  const isWarningOrError = type === 'error' || type === 'warning';
  const isSuccess = type === 'success';

  // Accessible role: 'alert' for errors/warnings, 'status' for success/info
  const computedRole = role || (isWarningOrError ? 'alert' : 'status');
  const ariaLive = isWarningOrError ? 'assertive' : 'polite';

  // Icon selection
  let IconComponent = Info;
  if (isWarningOrError) IconComponent = AlertTriangle;
  else if (isSuccess) IconComponent = CheckCircle2;

  // Default title if none provided
  let displayTitle = title;
  if (!displayTitle) {
    if (type === 'error') displayTitle = 'Error';
    else if (type === 'warning') displayTitle = 'Validation notice';
    else if (type === 'success') displayTitle = 'Success';
    else displayTitle = 'Notice';
  }

  const handleCopyRef = (e) => {
    e.stopPropagation();
    if (errorRef && navigator.clipboard) {
      navigator.clipboard.writeText(errorRef);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={`sap-notification sap-notification-${placement} sap-notification-${type} ${className}`}
      role={computedRole}
      aria-live={ariaLive}
      style={style}
    >
      <div className="sap-notification-icon-wrap" aria-hidden="true">
        <IconComponent size={18} className="sap-notification-icon" />
      </div>

      <div className="sap-notification-content">
        {displayTitle && <div className="sap-notification-title">{displayTitle}</div>}
        {message && <div className="sap-notification-message">{message}</div>}

        {messages && messages.length > 0 && (
          <>
            <ul className={`sap-notification-list ${isListExpanded ? 'is-expanded' : ''}`}>
              {(isListExpanded || messages.length <= 3
                ? messages
                : messages.slice(0, 3)
              ).map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            {messages.length > 3 && (
              <button
                type="button"
                className="sap-notification-list-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsListExpanded(!isListExpanded);
                }}
              >
                {isListExpanded ? 'Show less' : `+${messages.length - 3} more`}
              </button>
            )}
          </>
        )}

        {notes && notes.length > 0 && (
          <div className="sap-notification-notes-section" style={{ marginTop: (messages && messages.length > 0) || message ? 6 : 2 }}>
            <ul
              className="sap-notification-notes-list"
              style={{
                margin: 0,
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 3
              }}
            >
              {(notes.length <= 3 ? notes : notes.slice(0, 3)).map((note, idx) => (
                <li
                  key={idx}
                  className="sap-notification-note-item"
                  style={{
                    fontSize: 13,
                    lineHeight: 1.45,
                    color: 'var(--color-text-secondary, #4A5F77)',
                    fontFamily: 'var(--font-sans)'
                  }}
                >
                  {note}
                </li>
              ))}
            </ul>
            {notes.length > 3 && (
              <div
                className="sap-notification-notes-more"
                style={{
                  fontSize: 12,
                  marginTop: 2,
                  color: 'var(--color-text-muted, #7A8CA3)',
                  fontStyle: 'italic'
                }}
              >
                and {notes.length - 3} more
              </div>
            )}
          </div>
        )}

        {hint && <div className="sap-notification-hint">{hint}</div>}

        {errorRef && (
          <div className="sap-notification-error-ref">
            <span>
              Reference: <strong style={{ fontFamily: 'monospace' }}>{errorRef}</strong>
            </span>
            <button
              type="button"
              onClick={handleCopyRef}
              title="Copy error reference"
              aria-label="Copy error reference"
              className="sap-notification-copy-btn"
            >
              {copied ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
            </button>
          </div>
        )}
      </div>

      {onClose && (
        <button
          type="button"
          className="sap-notification-close-btn"
          onClick={onClose}
          aria-label="Dismiss notification"
          title="Dismiss notification"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
}
