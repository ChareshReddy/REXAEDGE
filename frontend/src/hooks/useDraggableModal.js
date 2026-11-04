import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Custom hook to make a modal dialog draggable by its title bar.
 * - Anchors to fixed top (e.g. 12vh) and horizontally centered by default.
 * - Allows dragging anywhere on screen via pointer events.
 * - Clamps coordinates so the dialog and title bar never go off-screen.
 * - Ignores drag initiation from buttons, inputs, links, or marked elements.
 * - Prevents text selection during dragging.
 * - Resets position when modal opens, but preserves position when switching tabs.
 */
export function useDraggableModal({ isOpen, dialogRef, defaultTopRatio = 0.12 }) {
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, startX: 0, startY: 0 });
  const capturedPointerIdRef = useRef(null);

  // Reset to default centered position when modal opens
  useEffect(() => {
    if (isOpen) {
      setPosition(null);
      setIsDragging(false);
      isDraggingRef.current = false;
    }
  }, [isOpen]);

  // Keep modal clamped inside viewport if window is resized
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (dialogRef.current && position) {
        const rect = dialogRef.current.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - rect.width);
        const maxY = Math.max(0, window.innerHeight - 44);
        const clampedX = Math.max(0, Math.min(position.x, maxX));
        const clampedY = Math.max(0, Math.min(position.y, maxY));
        if (clampedX !== position.x || clampedY !== position.y) {
          setPosition({ x: clampedX, y: clampedY });
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, position, dialogRef]);

  // Drag start handler (attach to dialog header)
  const handlePointerDown = useCallback((e) => {
    // Disable dragging on mobile screens (< 640px) to act as a responsive sheet
    if (typeof window !== 'undefined' && window.innerWidth < 640) return;

    // Only drag with primary mouse button / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Do not initiate drag from buttons, inputs, dropdowns, or close icons
    if (e.target.closest('button, input, select, textarea, a, [data-no-drag="true"]')) {
      return;
    }

    if (!dialogRef.current) return;

    const rect = dialogRef.current.getBoundingClientRect();

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: rect.left,
      startY: rect.top
    };

    isDraggingRef.current = true;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      capturedPointerIdRef.current = e.pointerId;
    } catch (_) {
      // Ignore if setPointerCapture fails
    }

    e.preventDefault();
  }, [dialogRef]);

  // Window pointermove & pointerup listeners for butter-smooth dragging
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e) => {
      if (!isDraggingRef.current || !dialogRef.current) return;

      const rect = dialogRef.current.getBoundingClientRect();
      const modalWidth = rect.width || 650;

      const deltaX = e.clientX - dragStartRef.current.pointerX;
      const deltaY = e.clientY - dragStartRef.current.pointerY;

      let nextX = dragStartRef.current.startX + deltaX;
      let nextY = dragStartRef.current.startY + deltaY;

      // Bounds clamping:
      // Keep popup inside viewport; title bar (top 44px) can never go off-screen
      const minX = 0;
      const maxX = Math.max(0, window.innerWidth - modalWidth);
      const minY = 0;
      const maxY = Math.max(0, window.innerHeight - 44);

      nextX = Math.max(minX, Math.min(nextX, maxX));
      nextY = Math.max(minY, Math.min(nextY, maxY));

      setPosition({ x: Math.round(nextX), y: Math.round(nextY) });
    };

    const handlePointerUp = (e) => {
      isDraggingRef.current = false;
      setIsDragging(false);
      if (capturedPointerIdRef.current !== null && e.currentTarget?.releasePointerCapture) {
        try {
          e.currentTarget.releasePointerCapture(capturedPointerIdRef.current);
        } catch (_) {}
        capturedPointerIdRef.current = null;
      }
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging, dialogRef]);

  // Calculated modal dialog style (full-screen sheet on mobile < 640px)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const dialogStyle = isMobile ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw',
    height: '100dvh',
    maxHeight: '100dvh',
    transform: 'none',
    margin: 0,
    borderRadius: 0
  } : {
    position: 'fixed',
    top: position ? `${position.y}px` : `${Math.round(defaultTopRatio * 100)}vh`,
    left: position ? `${position.x}px` : '50%',
    transform: position ? 'none' : 'translateX(-50%)',
    margin: 0
  };

  const headerProps = {
    onPointerDown: handlePointerDown,
    style: {
      cursor: isDragging ? 'grabbing' : 'grab',
      userSelect: 'none',
      touchAction: 'none'
    }
  };

  return {
    position,
    isDragging,
    dialogStyle,
    headerProps,
    handlePointerDown
  };
}

export default useDraggableModal;
