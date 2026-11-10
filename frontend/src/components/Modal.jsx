import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { lockScroll } from '../utils/scrollLock';
import { NotificationPlacementProvider, NotificationOutlet } from '../context/ToastContext';

/**
 * Shared accessible Modal dialog component.
 *
 * Rules:
 * 1. Closes ONLY through explicit user controls (X button, Cancel button, or on completion).
 * 2. Clicking outside / on the backdrop does NOTHING.
 * 3. Pressing Escape does NOTHING.
 * 4. While saving/loading (isLoading = true), X and Cancel are disabled and cannot be closed mid-request.
 * 5. Page behind is dimmed and body scrolling is locked while open.
 * 6. Accessible: role="dialog", aria-modal="true", auto-focus on open, focus-trap with Tab, focus restored to trigger on close.
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconColor = 'var(--sap-primary)',
  iconBadgeBg,
  iconBadgeBorder,
  headerContent,
  children,
  footer,
  isLoading = false,
  maxWidth = 460,
  width = '100%',
  padding,
  className = '',
  cardClassName = '',
  style = {},
  ariaLabel,
  showCloseButton = true,
  customLayout = false
}) {
  const modalCardRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);
  const titleId = useId();

  // 1. Manage body scroll lock & restore focus to trigger element on close
  useEffect(() => {
    if (!isOpen) return;

    // Capture the trigger element before opening
    previouslyFocusedElementRef.current = document.activeElement;

    // Prevent scrolling on the page behind the modal with no layout shift
    const unlock = lockScroll();

    // Move initial focus into modal
    const focusTimer = setTimeout(() => {
      if (!modalCardRef.current) return;
      const autoFocusEl = modalCardRef.current.querySelector('[autofocus]');
      if (autoFocusEl) {
        autoFocusEl.focus();
      } else {
        const focusable = modalCardRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalCardRef.current.focus();
        }
      }
    }, 40);

    return () => {
      clearTimeout(focusTimer);
      unlock();
      if (
        previouslyFocusedElementRef.current &&
        typeof previouslyFocusedElementRef.current.focus === 'function'
      ) {
        try {
          previouslyFocusedElementRef.current.focus();
        } catch {
          // Ignore focus error if trigger unmounted
        }
      }
    };
  }, [isOpen]);

  // 2. Keyboard handling: trap Tab focus inside modal & ignore Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      // Escape key must NOT close the modal
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Trap Tab focus inside the modal
      if (e.key === 'Tab') {
        if (!modalCardRef.current) return;
        const focusableElements = Array.from(
          modalCardRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => {
          return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
        });

        if (focusableElements.length === 0) {
          e.preventDefault();
          modalCardRef.current.focus();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement || !modalCardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement || !modalCardRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`sap-modal-backdrop ${className}`}
      // Clicking the backdrop (outside modal box) does NOTHING
    >
      <div
        ref={modalCardRef}
        className={`sap-modal-card ${cardClassName}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={ariaLabel || (!title ? 'Dialog window' : undefined)}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()} // Clicks inside never bubble to backdrop
        style={{
          maxWidth,
          width,
          outline: 'none',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #B3CDE0',
          borderRadius: 8,
          boxShadow: '0 16px 36px rgba(2, 87, 154, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
          background: '#ffffff',
          ...style
        }}
      >
        {customLayout ? (
          <NotificationPlacementProvider placement="popup">
            {children}
          </NotificationPlacementProvider>
        ) : (
          <NotificationPlacementProvider placement="popup">
            {headerContent ? (
              headerContent
            ) : title ? (
              <div
                className="sap-modal-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  height: 'var(--popup-header-height, 60px)',
                  minHeight: 'var(--popup-header-height, 60px)',
                  maxHeight: 'var(--popup-header-height, 60px)',
                  boxSizing: 'border-box',
                  padding: '0 18px',
                  background: 'var(--sap-popup-header-bg, #EEF4F9)',
                  color: 'var(--sap-popup-header-title, #00204E)',
                  borderTopLeftRadius: 'inherit',
                  borderTopRightRadius: 'inherit',
                  borderBottom: '1px solid var(--sap-popup-header-border, #D9E2EC)',
                  flexShrink: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {Icon && (
                    iconBadgeBg ? (
                      <div
                        className="sap-bulk-icon-badge"
                        style={{
                          backgroundColor: '#D9E2EC',
                          color: '#05396B',
                          borderColor: '#B3CDE0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: 4
                        }}
                      >
                        <Icon size={16} color="#05396B" />
                      </div>
                    ) : (
                      <Icon size={18} color="#05396B" style={{ flexShrink: 0 }} />
                    )
                  )}
                  <div>
                    <h3
                      id={titleId}
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--sap-popup-header-title, #00204E)',
                        lineHeight: 1.2
                      }}
                    >
                      {title}
                    </h3>
                    {subtitle && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sap-text-secondary, #475569)' }}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isLoading}
                    className="sap-modal-close-btn"
                    style={{
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.35 : 1,
                      pointerEvents: isLoading ? 'none' : 'auto',
                      width: 36,
                      height: 36,
                      minWidth: 36,
                      minHeight: 36,
                      padding: 0
                    }}
                    title={isLoading ? 'Operation in progress' : 'Cancel (Esc)'}
                    aria-label="Cancel (Esc)"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ) : null}

            <div className="sap-modal-body" style={{ padding: padding || '20px 24px', flex: 1, overflowY: 'auto' }}>
              <NotificationOutlet placement="popup" />
              {children}
            </div>

            {footer && (
              <div
                className="sap-modal-footer"
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                  padding: '12px 20px',
                  background: 'var(--sap-modal-footer-bg, #EEF4F9)',
                  borderTop: '1px solid #EEF4F9',
                  borderBottomLeftRadius: 'inherit',
                  borderBottomRightRadius: 'inherit',
                  flexShrink: 0
                }}
              >
                {footer}
              </div>
            )}
          </NotificationPlacementProvider>
        )}
      </div>
    </div>
  );
}
