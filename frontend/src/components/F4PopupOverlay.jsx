import React, { useEffect, useRef } from 'react';
import { createLayerId, popLayer, pushLayer } from '../utils/modalStack';
import { NotificationPlacementProvider } from '../context/ToastContext';

/**
 * Shared F4 Value Help Popup Overlay component.
 *
 * Rules:
 * 1. Clicking outside / on the backdrop does NOT close the popup (no exceptions).
 * 2. Clicking the backdrop does not steal focus or lose typed filters.
 * 3. Popups close only via: X button, Cancel (Esc) button, Escape key, or selection confirmation.
 * 4. When nested popups are open, clicking outside the top one does not close the lower one either.
 * 5. Registers as the top popup layer while mounted, so an underlying Modal's Esc / Tab
 *    handling stays inactive until this popup closes.
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
  const layerIdRef = useRef(null);
  if (layerIdRef.current === null) layerIdRef.current = createLayerId('f4');

  useEffect(() => {
    const id = layerIdRef.current;
    pushLayer(id);
    return () => popLayer(id);
  }, []);

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
