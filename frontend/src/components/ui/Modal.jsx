import React, { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from './dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Enterprise Modal Dialog (built on real Radix/shadcn Dialog)
 * Strict rule: NO backdrop click closing (override onInteractOutside / onPointerDownOutside)
 */
export function Modal({
  isOpen = false,
  title,
  subtitle,
  icon: Icon,
  onClose,
  children,
  footer = null,
  maxWidth = '600px',
  className = ''
}) {
  const handleDismiss = () => {
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleDismiss();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      {/* Radix Dialog overlay presentation */}
      <div role="presentation" style={{ display: 'contents' }}>
        <DialogContent
          role="dialog"
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn('rx-modal-dialog', className)}
          style={{ maxWidth }}
          showCloseButton={false}
        >
          <DialogHeader
            className="rx-modal-header"
            style={{
              height: 62,
              minHeight: 62,
              maxHeight: 62,
              padding: '0 24px',
              backgroundColor: 'var(--color-blue-50, #EEF4F9)',
              borderBottom: '1px solid var(--color-border, #D9E2EC)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, marginRight: 12 }}>
              {Icon && (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    minWidth: 36,
                    minHeight: 36,
                    borderRadius: 'var(--radius-md, 6px)',
                    backgroundColor: 'var(--color-blue-100, #DCE8F1)',
                    border: '1px solid var(--color-blue-300, #B3CDE0)',
                    color: 'var(--color-blue-600, #02579A)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {React.isValidElement(Icon) ? Icon : <Icon size={18} strokeWidth={1.75} />}
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <DialogTitle
                  className="rx-modal-title"
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: 'var(--color-navy-900, #00204E)',
                    lineHeight: 1.2,
                    margin: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {title}
                </DialogTitle>
                {subtitle && (
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-secondary, #475569)',
                      lineHeight: 1.2,
                      marginTop: 4,
                      marginBottom: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={typeof subtitle === 'string' ? subtitle : undefined}
                  >
                    {subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              className="rx-btn rx-btn-ghost rx-btn-sm inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-[var(--radius-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-600)]"
              onClick={handleDismiss}
              title="Cancel (Esc)"
              aria-label="Cancel (Esc)"
              tabIndex={-1}
              style={{
                width: 32,
                height: 32,
                minWidth: 32,
                minHeight: 32,
                padding: 0,
                outline: 'none',
                flexShrink: 0
              }}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </DialogHeader>

          <div className="rx-modal-body" style={{ padding: 24 }}>
            {children}
          </div>

          {footer && (
            <DialogFooter
              className="rx-modal-footer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 12,
                padding: '16px 24px',
                borderTop: '1px solid var(--color-border-subtle, #E2E8F0)',
                backgroundColor: 'var(--color-surface, #FFFFFF)'
              }}
            >
              {footer}
            </DialogFooter>
          )}
        </DialogContent>
      </div>
    </Dialog>
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
};

export default Modal;
