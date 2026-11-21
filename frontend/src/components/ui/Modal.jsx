import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { lockScroll } from '../../utils/scrollLock';
import { createLayerId, isTopLayer, popLayer, pushLayer } from '../../utils/modalStack';
import { NotificationPlacementProvider, NotificationOutlet } from '../../context/ToastContext';
import './ui.css';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * RexaEdge enterprise modal — the single dialog shell used by every popup
 * (forms, confirmations, server management, bulk flows).
 *
 * Behaviour rules (AGENTS.md §4):
 * - Never closes on backdrop / outside click.
 * - Closes only via the X / Cancel controls, the Esc key, or a completed action.
 * - While `isLoading` is true it cannot be closed (X disabled, Esc ignored).
 * - Only the top-most open popup reacts to Esc / Tab (see utils/modalStack).
 *
 * Accessibility: role="dialog", aria-modal, labelled by its title and described
 * by its subtitle, focus moved into the dialog on open (form fields first),
 * Tab focus trapped inside, focus restored to the trigger on close.
 */
export function Modal({
  isOpen = false,
  onClose,
  title,
  subtitle,
  icon: Icon,
  headerContent,
  children,
  footer = null,
  isLoading = false,
  maxWidth = 460,
  width = '100%',
  padding,
  className = '',
  cardClassName = '',
  style,
  ariaLabel,
  showCloseButton = true,
  customLayout = false,
  closeOnEscape = true
}) {
  const cardRef = useRef(null);
  const layerIdRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = useId();
  const subtitleId = useId();

  // Latest values for the long-lived key handler (avoids stale closures).
  const latest = useRef({ onClose, isLoading, closeOnEscape });
  latest.current = { onClose, isLoading, closeOnEscape };

  if (layerIdRef.current === null) layerIdRef.current = createLayerId('modal');

  const requestClose = () => {
    const { onClose: close, isLoading: busy } = latest.current;
    if (!busy && typeof close === 'function') close();
  };

  // Layer registration, scroll lock, initial focus and focus restoration.
  useEffect(() => {
    if (!isOpen) return undefined;
    const layerId = layerIdRef.current;
    previouslyFocusedRef.current = document.activeElement;
    pushLayer(layerId);
    const unlock = lockScroll();

    const focusTimer = setTimeout(() => {
      const card = cardRef.current;
      if (!card) return;
      // Never steal focus: if a field inside the dialog is already focused
      // (autoFocus, a fast click, or typing has started), leave it there.
      const active = document.activeElement;
      if (active && active !== card && card.contains(active)) return;
      const target =
        card.querySelector('[autofocus], [data-autofocus]') ||
        card.querySelector(
          '.rx-modal-body input:not([disabled]):not([type="hidden"]):not([readonly]), .rx-modal-body select:not([disabled]), .rx-modal-body textarea:not([disabled])'
        ) ||
        card.querySelector(`.rx-modal-body ${FOCUSABLE.split(', ').join(', .rx-modal-body ')}`) ||
        card.querySelector('.rx-modal-footer button:not([disabled])') ||
        card;
      target.focus();
    }, 40);

    return () => {
      clearTimeout(focusTimer);
      popLayer(layerId);
      unlock();
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try {
          prev.focus();
        } catch {
          /* trigger may have unmounted */
        }
      }
    };
  }, [isOpen]);

  // Keyboard: Esc closes (top-most layer only), Tab is trapped inside the dialog.
  useEffect(() => {
    if (!isOpen) return undefined;
    const layerId = layerIdRef.current;

    const handleKeyDown = (e) => {
      if (!isTopLayer(layerId)) return;
      const card = cardRef.current;

      if (e.key === 'Escape') {
        // A control inside the dialog (dropdown, combobox, suggestion list) already
        // consumed this Esc, or focus sits in a floating layer outside the dialog
        // (e.g. an open Radix select/menu): let that layer close first.
        const active = document.activeElement;
        if (e.defaultPrevented) return;
        if (card && active && active !== document.body && !card.contains(active)) return;
        e.preventDefault();
        e.stopPropagation();
        if (latest.current.closeOnEscape) requestClose();
        return;
      }

      if (e.key === 'Tab' && card) {
        const focusables = Array.from(card.querySelectorAll(FOCUSABLE)).filter(
          (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
        );
        if (focusables.length === 0) {
          e.preventDefault();
          card.focus();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const outside = !card.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || outside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || outside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const cardStyle = {
    maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
    width,
    ...style
  };
  const bodyStyle = padding !== undefined ? { padding } : undefined;

  const header = headerContent
    ? headerContent
    : title
      ? (
        <div className="rx-modal-header sap-modal-header">
          <div className="rx-modal-heading">
            {Icon && (
              <span className="rx-modal-icon sap-bulk-icon-badge" aria-hidden="true">
                {React.isValidElement(Icon) ? Icon : <Icon size={18} strokeWidth={1.75} />}
              </span>
            )}
            <div className="rx-modal-heading-text">
              <h3 id={titleId} className="rx-modal-title">
                {title}
              </h3>
              {subtitle && (
                <p
                  id={subtitleId}
                  className="rx-modal-subtitle"
                  title={typeof subtitle === 'string' ? subtitle : undefined}
                >
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {showCloseButton && (
            <button
              type="button"
              onClick={requestClose}
              disabled={isLoading}
              className="rx-modal-close sap-modal-close-btn"
              title={isLoading ? 'Operation in progress' : 'Close (Esc)'}
              aria-label="Close dialog"
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      )
      : null;

  return createPortal(
    <div className={cn('sap-modal-backdrop rx-modal-backdrop', className)} role="presentation">
      <div
        ref={cardRef}
        className={cn('sap-modal-card rx-modal-card', cardClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title && !headerContent ? titleId : undefined}
        aria-describedby={subtitle && !headerContent ? subtitleId : undefined}
        aria-label={ariaLabel || (!title || headerContent ? 'Dialog window' : undefined)}
        aria-busy={isLoading || undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={cardStyle}
      >
        <NotificationPlacementProvider placement="popup">
          {customLayout ? (
            children
          ) : (
            <>
              {header}
              <div className="rx-modal-body sap-modal-body" style={bodyStyle}>
                <NotificationOutlet placement="popup" />
                {children}
              </div>
              {footer && <div className="rx-modal-footer sap-modal-footer">{footer}</div>}
            </>
          )}
        </NotificationPlacementProvider>
      </div>
    </div>,
    document.body
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './dialog';

export default Modal;
