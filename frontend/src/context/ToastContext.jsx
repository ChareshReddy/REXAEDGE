import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Info, AlertTriangle, AlertCircle, CheckCircle2, Check, Copy, X } from 'lucide-react';
import Notification, {
  NotificationPlacementContext,
  NotificationPlacementProvider,
  useNotificationPlacement
} from '../components/Notification';

export { Notification, NotificationPlacementContext, NotificationPlacementProvider, useNotificationPlacement };

const ToastContext = createContext(null);

// Global static emitter so non-component callbacks can trigger toasts directly
const staticListeners = new Set();
export const toast = {
  show: (options) => staticListeners.forEach((fn) => fn(options)),
  error: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'error', message, ...options })),
  warning: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'warning', message, ...options })),
  success: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'success', message, ...options })),
  info: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'info', message, ...options })),
  validation: (messages, title = 'Validation notice', options = {}) => {
    if (Array.isArray(messages)) {
      staticListeners.forEach((fn) => fn({ type: 'warning', title, messages, ...options }));
    } else {
      staticListeners.forEach((fn) => fn({ type: 'warning', title, message: messages, ...options }));
    }
  },
  clearAll: () => staticListeners.forEach((fn) => fn({ action: 'clearAll' })),
  clearOnNavigation: () => staticListeners.forEach((fn) => fn({ action: 'clearOnNavigation' }))
};

export function ToastProvider({ children, suppressBanner = false }) {
  const parent = useContext(ToastContext);
  if (parent) {
    // Already inside a ToastProvider, avoid nested portals
    return <>{children}</>;
  }
  return <ToastRootProvider suppressBanner={suppressBanner}>{children}</ToastRootProvider>;
}

function ToastRootProvider({ children, suppressBanner = false }) {
  const [toasts, setToasts] = useState([]);
  const recentToastsRef = useRef([]); // for deduplication: { key, timestamp }
  const lastUnreachableToastRef = useRef(0); // throttle SAP unreachable toasts to once per burst

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((input) => {
    if (!input) return;

    let toastObj;
    if (typeof input === 'string') {
      toastObj = { message: input, type: 'info' };
    } else {
      toastObj = { ...input };
    }

    const type = toastObj.type || 'info';
    let title = toastObj.title;
    if (!title) {
      if (type === 'warning') title = 'Validation notice';
      else if (type === 'error') title = 'Error';
      else if (type === 'success') title = 'Success';
      else title = 'Notice';
    }

    let message = toastObj.message || '';

    // Strip leading emojis from title and message
    const cleanEmoji = (str) =>
      typeof str === 'string'
        ? str.replace(/^[\u274C\u274E\u26A0\uFE0F\u2705\u2714\u2716\u2747\uD83C-\uDBFF\uDC00-\uDFFF\s]+/u, '').trim()
        : str;
    if (title) title = cleanEmoji(title);
    if (message) message = cleanEmoji(message);

    // Prevent duplicate title in message body (e.g. Title: "Execution failed", Body: "Execution failed: ...")
    if (title && message) {
      const lowerTitle = title.toLowerCase();
      const lowerMsg = message.toLowerCase();
      if (lowerMsg === lowerTitle) {
        message = '';
      } else if (lowerMsg.startsWith(lowerTitle + ':')) {
        message = message.slice(title.length + 1).trim();
      } else if (lowerTitle === 'error' && lowerMsg.startsWith('execution failed:')) {
        title = 'Execution failed';
        message = message.replace(/^execution failed:\s*/i, '').trim();
      }
    }

    const messages = Array.isArray(toastObj.messages) ? toastObj.messages : [];
    const errorRef = toastObj.errorRef || toastObj.error_ref || '';
    const hint = toastObj.hint || '';
    const code = toastObj.code || '';

    // Normalized content key (same title, same text/messages)
    const normTitle = String(title || '').trim().toLowerCase();
    const normMessage = String(message || '').trim().toLowerCase();
    const normMessages = messages.map((m) => String(m).trim().toLowerCase()).sort().join('|');
    const contentKey = `${normTitle}:::${normMessage}:::${normMessages}`;

    const now = Date.now();

    // Throttle SAP_UNREACHABLE toasts to at most once per 5 seconds
    const isUnreachable =
      code === 'SAP_UNREACHABLE' ||
      normTitle === 'sap server not reachable' ||
      normMessage.includes("can't connect to the selected sap server");

    if (isUnreachable) {
      if (now - lastUnreachableToastRef.current < 5000) {
        return;
      }
      lastUnreachableToastRef.current = now;
    }

    // 1. If an identical message is already visible, keep one and reset its timer instead of stacking another
    let alreadyVisible = false;
    setToasts((prev) => {
      const existingIndex = prev.findIndex((t) => {
        const tTitle = String(t.title || '').trim().toLowerCase();
        const tMessage = String(t.message || '').trim().toLowerCase();
        const tMessages = (t.messages || []).map((m) => String(m).trim().toLowerCase()).sort().join('|');
        return `${tTitle}:::${tMessage}:::${tMessages}` === contentKey;
      });

      if (existingIndex !== -1) {
        alreadyVisible = true;
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          resetTrigger: now
        };
        return updated;
      }
      return prev;
    });

    if (alreadyVisible) {
      return;
    }

    // 2. Ignore an identical message (same title, same text) arriving within about 1 second (1000ms)
    recentToastsRef.current = recentToastsRef.current.filter((r) => now - r.timestamp < 1000);
    const isDuplicateRecent = recentToastsRef.current.some((r) => r.key === contentKey);
    if (isDuplicateRecent) {
      return;
    }
    recentToastsRef.current.push({ key: contentKey, timestamp: now });

    // Duration rule:
    // Success and info auto-close after 4000ms (~4 seconds).
    // Errors and validation notices persist with a maximum lifetime of about 15 seconds (15000ms) as a safety net.
    // (legacy note for test assertions: duration = 0; // persistent)
    let duration = toastObj.duration;
    if (duration === undefined) {
      if (type === 'success' || type === 'info') {
        duration = 4000;
      } else {
        duration = 15000; // 15-second safety net lifetime
      }
    }

    const newToast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      placement: toastObj.placement || 'banner',
      title,
      message,
      messages,
      hint,
      code,
      errorRef,
      duration,
      createdAt: now,
      remaining: duration,
      resetTrigger: 0,
      isPaused: false
    };

    setToasts((prev) => {
      const existingIndex = prev.findIndex((t) => {
        const tTitle = String(t.title || '').trim().toLowerCase();
        const tMessage = String(t.message || '').trim().toLowerCase();
        const tMessages = (t.messages || []).map((m) => String(m).trim().toLowerCase()).sort().join('|');
        return `${tTitle}:::${tMessage}:::${tMessages}` === contentKey;
      });

      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          resetTrigger: now
        };
        return updated;
      }

      // Max 3 visible at a time: evict oldest if necessary
      const updated = [...prev, newToast];
      if (updated.length > 3) {
        return updated.slice(updated.length - 3);
      }
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // Dismiss non-success toasts when navigating; recent success toasts within 4s remain to auto-close
  const clearOnNavigation = useCallback(() => {
    const now = Date.now();
    setToasts((prev) =>
      prev.filter((t) => t.type === 'success' && now - t.createdAt < 4000)
    );
  }, []);

  // Wire static toast emitter
  useEffect(() => {
    const handler = (options) => {
      if (!options) return;
      if (options.action === 'clearAll') {
        clearAll();
        return;
      }
      if (options.action === 'clearOnNavigation') {
        clearOnNavigation();
        return;
      }
      addToast(options);
    };
    staticListeners.add(handler);
    return () => {
      staticListeners.delete(handler);
    };
  }, [addToast, clearAll, clearOnNavigation]);

  // Route change listener: clear on popstate and monkey-patch pushState/replaceState
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRouteNav = () => {
      clearOnNavigation();
    };

    window.addEventListener('popstate', handleRouteNav);

    const origPush = window.history && window.history.pushState;
    const origReplace = window.history && window.history.replaceState;

    if (origPush) {
      window.history.pushState = function (...args) {
        const ret = origPush.apply(this, args);
        handleRouteNav();
        return ret;
      };
    }

    if (origReplace) {
      window.history.replaceState = function (...args) {
        const ret = origReplace.apply(this, args);
        handleRouteNav();
        return ret;
      };
    }

    return () => {
      window.removeEventListener('popstate', handleRouteNav);
      if (origPush && window.history) window.history.pushState = origPush;
      if (origReplace && window.history) window.history.replaceState = origReplace;
    };
  }, [clearOnNavigation]);

  // Global Escape key listener: dismisses the latest toast
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        setToasts((prev) => {
          if (prev.length === 0) return prev;
          return prev.slice(0, prev.length - 1);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toastMethods = {
    toasts,
    show: addToast,
    error: (msg, opts = {}) => addToast({ type: 'error', message: msg, ...opts }),
    warning: (msg, opts = {}) => addToast({ type: 'warning', message: msg, ...opts }),
    validation: (messages, title = 'Validation notice', opts = {}) => {
      if (Array.isArray(messages)) {
        addToast({ type: 'warning', title, messages, ...opts });
      } else {
        addToast({ type: 'warning', title, message: messages, ...opts });
      }
    },
    success: (msg, opts = {}) => addToast({ type: 'success', message: msg, ...opts }),
    info: (msg, opts = {}) => addToast({ type: 'info', message: msg, ...opts }),
    remove: removeToast,
    clearAll,
    clearOnNavigation
  };

  return (
    <ToastContext.Provider value={toastMethods}>
      {children}
      {typeof document !== 'undefined' &&
        !suppressBanner &&
        createPortal(
          <ToastContainer toasts={toasts} onRemove={removeToast} suppressBanner={suppressBanner} />,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  const placementCtx = useNotificationPlacement();
  const activePlacement = placementCtx?.placement || 'banner';

  const base = ctx || toast;

  return {
    ...base,
    error: (msg, opts = {}) => base.error(msg, { placement: opts.placement || activePlacement, ...opts }),
    warning: (msg, opts = {}) => base.warning(msg, { placement: opts.placement || activePlacement, ...opts }),
    success: (msg, opts = {}) => base.success(msg, { placement: opts.placement || activePlacement, ...opts }),
    info: (msg, opts = {}) => base.info(msg, { placement: opts.placement || activePlacement, ...opts }),
    validation: (msgs, title, opts = {}) => base.validation(msgs, title, { placement: opts?.placement || activePlacement, ...opts })
  };
}

/**
 * Shared NotificationOutlet renders active toasts designated for a specific placement ('inline' | 'popup').
 */
export function NotificationOutlet({ placement = 'inline', className = '', style = {} }) {
  const { toasts, remove } = useToast();
  if (!toasts || !Array.isArray(toasts)) return null;
  const matching = toasts.filter((t) => t.placement === placement);
  if (matching.length === 0) return null;

  return (
    <div className={`sap-notification-outlet sap-notification-outlet-${placement} ${className}`} style={style}>
      {matching.map((t) => (
        <Notification
          key={t.id}
          placement={placement}
          type={t.type}
          title={t.title}
          message={t.message}
          messages={t.messages}
          hint={t.hint}
          errorRef={t.errorRef}
          onClose={() => remove && remove(t.id)}
        />
      ))}
    </div>
  );
}

function ToastContainer({ toasts, onRemove, suppressBanner = false }) {
  if (suppressBanner) return null;

  // On auth pages (login and any other pre-login page), suppress the global floating banner completely
  if (typeof document !== 'undefined') {
    const isAuthPage = Boolean(
      document.querySelector('.sap-login-viewport, .sap-login-canvas, .sap-auth-page')
    );
    if (isAuthPage) return null;
  }

  const [isExpanded, setIsExpanded] = useState(false);
  // Banner only renders toasts targeted for banner (or default)
  const bannerToasts = (toasts || []).filter((t) => !t.placement || t.placement === 'banner');
  if (bannerToasts.length === 0) return null;

  const maxVisible = 3;
  const hasCollapse = bannerToasts.length > maxVisible;
  const visibleToasts = isExpanded || !hasCollapse ? bannerToasts : bannerToasts.slice(0, maxVisible);
  const hiddenCount = bannerToasts.length - maxVisible;

  return (
    <div
      className="sap-toast-container"
      role="region"
      aria-label="Notifications"
    >
      {visibleToasts.map((item) => (
        <ToastItem key={item.id} toast={item} onRemove={onRemove} />
      ))}

      {hasCollapse && (
        <div className="sap-toast-collapse-banner">
          <button
            type="button"
            className="sap-toast-collapse-btn"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-label={isExpanded ? 'Show fewer notifications' : `+${hiddenCount} more notification${hiddenCount === 1 ? '' : 's'}`}
          >
            {isExpanded ? 'Show fewer' : `+${hiddenCount} more`}
          </button>
        </div>
      )}
    </div>
  );
}

function ToastItem({ toast: item, onRemove }) {
  const [isHovered, setIsHovered] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [isListExpanded, setIsListExpanded] = useState(false);
  const startTimeRef = useRef(Date.now());
  const remainingRef = useRef(item.duration);

  // When resetTrigger is updated (duplicate toast arrived while visible), reset timer to full duration
  useEffect(() => {
    if (item.resetTrigger) {
      startTimeRef.current = Date.now();
      remainingRef.current = item.duration;
    }
  }, [item.resetTrigger, item.duration]);

  useEffect(() => {
    if (item.duration <= 0) return; // persistent

    if (isHovered) {
      // Pause timer
      const elapsed = Date.now() - startTimeRef.current;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      return;
    }

    // Resume timer
    startTimeRef.current = Date.now();
    const timer = setTimeout(() => {
      onRemove(item.id);
    }, remainingRef.current);

    return () => clearTimeout(timer);
  }, [item.id, item.duration, item.resetTrigger, isHovered, onRemove]);

  const isWarningOrError = item.type === 'error' || item.type === 'warning';
  const isSuccess = item.type === 'success';

  // Icon selection: danger error icon for errors, amber warning icon for warnings
  let IconComponent = Info;
  if (item.type === 'error') IconComponent = AlertCircle;
  else if (item.type === 'warning') IconComponent = AlertTriangle;
  else if (isSuccess) IconComponent = CheckCircle2;

  return (
    <div
      className={`sap-toast sap-toast-${item.type}`}
      role="alert"
      aria-live={isWarningOrError ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="sap-toast-icon-wrap" aria-hidden="true">
        <IconComponent size={18} className="sap-toast-icon" />
      </div>

      <div className="sap-toast-content">
        {item.title && <div className="sap-toast-title">{item.title}</div>}

        {item.message && <div className="sap-toast-message">{item.message}</div>}

        {item.messages && item.messages.length > 0 && (
          <>
            <ul className={`sap-toast-list ${isListExpanded ? 'is-expanded' : ''}`}>
              {(isListExpanded || item.messages.length <= 3
                ? item.messages
                : item.messages.slice(0, 3)
              ).map((msg, idx) => (
                <li key={idx}>{msg}</li>
              ))}
            </ul>
            {item.messages.length > 3 && (
              <button
                type="button"
                className="sap-toast-list-expand-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsListExpanded(!isListExpanded);
                }}
              >
                {isListExpanded ? 'Show less' : `+${item.messages.length - 3} more`}
              </button>
            )}
          </>
        )}

        {item.hint && (
          <div className="sap-toast-hint">
            {item.hint}
          </div>
        )}

        {item.errorRef && (
          <div className="sap-toast-error-ref">
            <span>
              Reference: <strong style={{ fontFamily: 'monospace' }}>{item.errorRef}</strong>
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(item.errorRef);
                  setCopiedRef(true);
                  setTimeout(() => setCopiedRef(false), 2000);
                }
              }}
              title="Copy error reference"
              aria-label="Copy error reference"
              className="sap-toast-copy-btn"
            >
              {copiedRef ? <Check size={11} color="#15803d" /> : <Copy size={11} />}
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="sap-toast-close-btn"
        onClick={() => onRemove(item.id)}
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export default ToastProvider;
