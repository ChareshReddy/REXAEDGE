import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ui.css';

const ICON_MAP = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info
};

/**
 * Enterprise Toast Banner Notification (max 440px, under top bar)
 */
export function ToastBanner({
  toasts = [],
  onDismiss
}) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="rx-toast-banner-container" role="region" aria-label="Notifications">
      {toasts.slice(0, 3).map((toast) => {
        const Icon = ICON_MAP[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={cn('rx-toast-banner', `rx-toast-${toast.type || 'info'}`)}
            role={toast.type === 'danger' ? 'alert' : 'status'}
          >
            <Icon size={18} strokeWidth={1.75} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
            <div style={{ flex: 1 }}>
              {toast.title && <div style={{ fontWeight: 600, marginBottom: 2 }}>{toast.title}</div>}
              <div>{toast.message}</div>
            </div>
            <button
              type="button"
              className="rx-btn rx-btn-ghost rx-btn-sm"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              style={{ width: 24, height: 24, padding: 0, margin: '-4px -6px 0 0' }}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action = null,
  className = ''
}) {
  return (
    <div className={cn('rx-empty-state', className)}>
      {Icon && (
        <div className="rx-empty-icon">
          <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
        </div>
      )}
      {title && <h3 className="rx-empty-title text-base font-semibold text-[var(--color-navy-900)]">{title}</h3>}
      {description && <p className="rx-empty-desc text-sm text-[var(--color-text-secondary)]">{description}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
