import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

// Global static emitter so non-component callbacks can trigger toasts directly
const staticListeners = new Set();
export const toast = {
  show: (options) => staticListeners.forEach((fn) => fn(options)),
  error: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'error', message, ...options })),
  warning: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'warning', message, ...options })),
  success: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'success', message, ...options })),
  info: (message, options = {}) => staticListeners.forEach((fn) => fn({ type: 'info', message, ...options }))
};

export function ToastProvider({ children }) {
  const parent = useContext(ToastContext);
  if (parent) {
    // Already inside a ToastProvider, avoid nested portals
    return <>{children}</>;
  }
  return <ToastRootProvider>{children}</ToastRootProvider>;
}

function ToastRootProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentToastsRef = useRef([]); // for deduplication: { key, timestamp }

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

    const message = toastObj.message || '';
    const messages = Array.isArray(toastObj.messages) ? toastObj.messages : [];
    const errorRef = toastObj.errorRef || toastObj.error_ref || '';

    // Normalized content key (same title, same text/messages)
    const normTitle = String(title || '').trim().toLowerCase();
    const normMessage = String(message || '').trim().toLowerCase();
    const normMessages = messages.map((m) => String(m).trim().toLowerCase()).sort().join('|');
    const contentKey = `${normTitle}:::${normMessage}:::${normMessages}`;

    const now = Date.now();

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
    // Errors and validation notices stay until manually dismissed (duration = 0).
    let duration = toastObj.duration;
    if (duration === undefined) {
      if (type === 'success' || type === 'info') {
        duration = 4000;
      } else {
        duration = 0; // persistent
      }
    }

    const newToast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      message,
      messages,
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

      // Max 4 visible at a time: evict oldest if necessary
      const updated = [...prev, newToast];
      if (updated.length > 4) {
        return updated.slice(updated.length - 4);
      }
      return updated;
    });
  }, []);

  // Wire static toast emitter
  useEffect(() => {
    const handler = (options) => addToast(options);
    staticListeners.add(handler);
    return () => {
      staticListeners.delete(handler);
    };
  }, [addToast]);

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
    clearAll: () => setToasts([])
  };

  return (
    <ToastContext.Provider value={toastMethods}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <ToastContainer toasts={toasts} onRemove={removeToast} />,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return toast;
  }
  return ctx;
}

function ToastContainer({ toasts, onRemove }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className="sap-toast-container"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast: item, onRemove }) {
  const [isHovered, setIsHovered] = useState(false);
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

  // Icon selection
  let IconComponent = Info;
  if (isWarningOrError) IconComponent = AlertTriangle;
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
          <ul className="sap-toast-list">
            {item.messages.map((msg, idx) => (
              <li key={idx}>{msg}</li>
            ))}
          </ul>
        )}

        {item.errorRef && (
          <div className="sap-toast-error-ref">
            Error Ref: {item.errorRef}
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
