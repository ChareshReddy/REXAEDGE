import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Small, dark single-line tooltip displayed strictly on mouse hover over column headers.
 * - Appears ONLY on mouse hover (no focus or typing trigger)
 * - Positioned above the header cell by default, centered with a small gap (~6px) and arrow pointing down
 * - Flips below ONLY when tight near the top edge of the viewport
 * - Never covers the header text or input fields
 * - Hides immediately on mouse leave, click, scroll, typing (keydown/input), or Esc
 * - Preserves natural cursors and standard accessibility via header aria-labels
 */
export default function Tooltip({
  text,
  title,
  content,
  children,
  placement = 'top',
  delay = 150,
  disabled = false,
  className = '',
  style = {}
}) {
  const label = text || title || (typeof content === 'string' ? content : null);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, actualPlacement: placement });
  const timeoutRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Measure or fallback dimensions
    const tooltipWidth = tooltipRef.current?.offsetWidth || 80;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 24;
    const gap = 6; // Small gap so it does not cover header text

    let targetPlacement = placement;

    // Default 'top': if tight near the top edge of the viewport, flip to 'bottom'
    if (targetPlacement === 'top') {
      if (triggerRect.top < tooltipHeight + gap + 6) {
        targetPlacement = 'bottom';
      }
    } else if (targetPlacement === 'bottom') {
      if (
        window.innerHeight - triggerRect.bottom < tooltipHeight + gap + 6 &&
        triggerRect.top > tooltipHeight + gap + 6
      ) {
        targetPlacement = 'top';
      }
    }

    let top = 0;
    let left = 0;

    if (targetPlacement === 'bottom') {
      top = triggerRect.bottom + scrollY + gap;
      left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipWidth / 2;
    } else {
      // Default top
      top = triggerRect.top + scrollY - tooltipHeight - gap;
      left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipWidth / 2;
    }

    // Keep within window horizontal bounds
    const minLeft = scrollX + 8;
    const maxLeft = scrollX + window.innerWidth - tooltipWidth - 8;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    setCoords({ top, left, actualPlacement: targetPlacement });
  }, [placement]);

  const showTooltip = () => {
    if (disabled || !label) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  }, []);

  // Measure exact position after layout
  useIsomorphicLayoutEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible, updatePosition]);

  // Immediately hide on scroll, click, mousedown, typing (keydown/input), or Esc
  useEffect(() => {
    if (!isVisible) return;
    updatePosition();

    const handleDismiss = () => {
      hideTooltip();
    };

    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('click', handleDismiss, true);
    window.addEventListener('mousedown', handleDismiss, true);
    window.addEventListener('keydown', handleDismiss, true);
    window.addEventListener('input', handleDismiss, true);

    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('click', handleDismiss, true);
      window.removeEventListener('mousedown', handleDismiss, true);
      window.removeEventListener('keydown', handleDismiss, true);
      window.removeEventListener('input', handleDismiss, true);
    };
  }, [isVisible, updatePosition, hideTooltip]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // Attach strictly mouse enter & leave (NO focus or typing triggers)
  let triggerElement = null;
  if (React.isValidElement(children)) {
    const childProps = children.props || {};
    triggerElement = React.cloneElement(children, {
      ref: (node) => {
        triggerRef.current = node;
        const { ref: childRef } = children;
        if (typeof childRef === 'function') childRef(node);
        else if (childRef && typeof childRef === 'object') childRef.current = node;
      },
      title: undefined,
      onMouseEnter: (e) => {
        showTooltip();
        childProps.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        hideTooltip();
        childProps.onMouseLeave?.(e);
      }
    });
  } else {
    triggerElement = (
      <span
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>
    );
  }

  const tooltipPortal =
    isVisible && typeof document !== 'undefined' && label ? (
      createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`sap-tooltip-popup ${className}`}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            zIndex: 10050,
            pointerEvents: 'none',
            backgroundColor: '#1e293b',
            color: '#ffffff',
            borderRadius: 4,
            padding: '4px 8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.28)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '12px',
            fontWeight: 500,
            fontFamily: 'inherit',
            lineHeight: '1.2',
            whiteSpace: 'nowrap',
            opacity: 1,
            animation: 'sapTooltipFadeIn 0.12s ease-out',
            ...style
          }}
        >
          <span>{label}</span>
          {/* Small arrow indicator */}
          <div
            className="sap-tooltip-arrow"
            style={{
              position: 'absolute',
              width: 0,
              height: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              ...(coords.actualPlacement === 'bottom'
                ? {
                    top: '-4px',
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderBottom: '4px solid #1e293b'
                  }
                : {
                    bottom: '-4px',
                    borderLeft: '4px solid transparent',
                    borderRight: '4px solid transparent',
                    borderTop: '4px solid #1e293b'
                  })
            }}
          />
        </div>,
        document.body
      )
    ) : null;

  return (
    <>
      {triggerElement}
      {tooltipPortal}
    </>
  );
}
