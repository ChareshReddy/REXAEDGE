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
          <DialogHeader className="rx-modal-header flex-row items-center justify-between border-b border-[var(--color-border)]">
            <DialogTitle className="rx-modal-title">
              {title}
            </DialogTitle>
            <button
              type="button"
              className="rx-btn rx-btn-ghost rx-btn-sm inline-flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] rounded-[var(--radius-md)]"
              onClick={handleDismiss}
              title="Cancel (Esc)"
              aria-label="Cancel (Esc)"
              style={{ width: 36, height: 36, padding: 0 }}
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </DialogHeader>

          <div className="rx-modal-body py-2">
            {children}
          </div>

          {footer && (
            <DialogFooter className="rx-modal-footer flex items-center justify-end gap-3 border-t border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 -mx-6 -mb-6 rounded-b-[var(--radius-xl)]">
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
