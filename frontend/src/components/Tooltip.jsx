import React, { useState, useRef, useEffect, useId, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Accessible, small, single-line portal-based tooltip.
 * - Displays a single plain name (no technical codes, no description sentence)
 * - Small dark rounded box with white text and an arrow
 * - Positioned so it does not cover the hovered/focused element (with gap)
 * - Delay (~300ms) to avoid flashing on rapid mouse movements
 * - Closes on mouse leave, blur, or Escape key
 * - Uses createPortal to document.body so it is never clipped by table containers
 * - Attaches aria-describedby for screen reader accessibility
 */
export default function Tooltip({
  text,
  title,
  content,
  children,
  placement = 'top',
  delay = 300,
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
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;

    // Measure or fallback dimensions
    const tooltipWidth = tooltipRef.current?.offsetWidth || 80;
    const tooltipHeight = tooltipRef.current?.offsetHeight || 24;
    const gap = 8; // Clear gap so it does not cover the field

    let targetPlacement = placement;
    // Auto-flip if tight on top of screen
    if (placement === 'top' && triggerRect.top < tooltipHeight + gap + 10) {
      targetPlacement = 'bottom';
    } else if (placement === 'bottom' && window.innerHeight - triggerRect.bottom < tooltipHeight + gap + 10) {
      targetPlacement = 'top';
    }

    let top = 0;
    let left = 0;

    if (targetPlacement === 'bottom') {
      top = triggerRect.bottom + scrollY + gap;
      left = triggerRect.left + scrollX + (triggerRect.width / 2) - (tooltipWidth / 2);
    } else {
      // Default top
      top = triggerRect.top + scrollY - tooltipHeight - gap;
      left = triggerRect.left + scrollX + (triggerRect.width / 2) - (tooltipWidth / 2);
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

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  // Measure exact position after layout
  useIsomorphicLayoutEffect(() => {
    if (isVisible) {
      updatePosition();
    }
  }, [isVisible, updatePosition]);

  // Handle Escape key and scroll/resize repositioning
  useEffect(() => {
    if (!isVisible) return;
    updatePosition();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isVisible, updatePosition]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  // Clone trigger element or wrap in inline span to attach event listeners & ref
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
      'aria-describedby': isVisible && label ? tooltipId : childProps['aria-describedby'],
      onMouseEnter: (e) => {
        showTooltip();
        childProps.onMouseEnter?.(e);
      },
      onMouseLeave: (e) => {
        hideTooltip();
        childProps.onMouseLeave?.(e);
      },
      onFocus: (e) => {
        showTooltip();
        childProps.onFocus?.(e);
      },
      onBlur: (e) => {
        hideTooltip();
        childProps.onBlur?.(e);
      }
    });
  } else {
    triggerElement = (
      <span
        ref={triggerRef}
        aria-describedby={isVisible && label ? tooltipId : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        tabIndex={0}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>
    );
  }

  const tooltipPortal = isVisible && typeof document !== 'undefined' && label ? (
    createPortal(
      <div
        id={tooltipId}
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
