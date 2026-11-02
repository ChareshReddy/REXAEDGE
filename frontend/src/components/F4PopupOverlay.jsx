import React from 'react';
import { NotificationPlacementProvider } from '../context/ToastContext';

/**
 * Shared F4 Value Help Popup Overlay component.
 *
 * Rules:
 * 1. Clicking outside / on the backdrop does NOT close the popup (no exceptions).
 * 2. Clicking the backdrop does not steal focus or lose typed filters.
 * 3. Popups close only via: X button, Cancel (Esc) button, Escape key, or selection confirmation.
 * 4. When nested popups are open, clicking outside the top one does not close the lower one either.
 */
export default function F4PopupOverlay({
  children,
  className = 'sap-f4-portal-overlay',
  style = {},
  onKeyDown,
  role = 'dialog',
  ariaModal = 'true',
  ariaLabelledBy,
  ariaLabel,
  ...restProps
}) {
  return (
    <div
      className={className}
      role={role}
      aria-modal={ariaModal}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        // Prevent backdrop click from stealing focus away from active input or dialog
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        // Explicitly block backdrop click-to-close across all F4 popups
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={onKeyDown}
      style={style}
      {...restProps}
    >
      <NotificationPlacementProvider placement="popup">
        {children}
      </NotificationPlacementProvider>
    </div>
  );
}
