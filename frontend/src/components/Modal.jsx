import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';
import { lockScroll } from '../utils/scrollLock';

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
          border: '1px solid #FDBA74',
          borderRadius: 8,
          boxShadow: '0 16px 36px rgba(234, 88, 12, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
          background: '#ffffff',
          ...style
        }}
      >
        {customLayout ? (
          children
        ) : (
          <>
            {headerContent ? (
              headerContent
            ) : title ? (
              <div
                className="sap-modal-header"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
                  color: '#ffffff',
                  borderTopLeftRadius: 'inherit',
                  borderTopRightRadius: 'inherit',
                  borderBottom: '1px solid #C2410C',
                  flexShrink: 0
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {Icon && (
                    iconBadgeBg ? (
                      <div
                        className="sap-bulk-icon-badge"
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#EA580C',
                          borderColor: 'rgba(255, 255, 255, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: 4
                        }}
                      >
                        <Icon size={16} color="#EA580C" />
                      </div>
                    ) : (
                      <Icon size={18} color="#ffffff" style={{ flexShrink: 0 }} />
                    )
                  )}
                  <div>
                    <h3
                      id={titleId}
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        margin: 0,
                        color: '#ffffff'
                      }}
                    >
                      {title}
                    </h3>
                    {subtitle && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.85)' }}>
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
                  background: '#FFF7ED',
                  borderTop: '1px solid #FFEDD5',
                  borderBottomLeftRadius: 'inherit',
                  borderBottomRightRadius: 'inherit',
                  flexShrink: 0
                }}
              >
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
