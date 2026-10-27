/**
 * Utility to lock scrolling on active page scroll containers
 * while a modal/popup is open, compensating with padding-right
 * so that the layout never shifts (0px jump).
 */
let lockCount = 0;
let lockedContainers = [];

export function lockScroll() {
  lockCount++;
  if (lockCount > 1) {
    return unlockScroll;
  }

  // Target all active page scroll containers that might be scrolling
  const candidates = document.querySelectorAll(
    '.fiori-app-view-root, .fiori-launchpad-root, .sap-assistant-layout, .sap-login-viewport'
  );

  lockedContainers = [];

  candidates.forEach((el) => {
    const hasScrollbar = el.scrollHeight > el.clientHeight;
    const scrollbarWidth = el.offsetWidth - el.clientWidth;

    if (hasScrollbar && scrollbarWidth > 0) {
      const origOverflow = el.style.overflow;
      const origPaddingRight = el.style.paddingRight;
      const computedPaddingRight = parseFloat(window.getComputedStyle(el).paddingRight) || 0;

      el.style.overflow = 'hidden';
      el.style.paddingRight = `${computedPaddingRight + scrollbarWidth}px`;

      lockedContainers.push({
        element: el,
        origOverflow,
        origPaddingRight
      });
    }
  });

  return unlockScroll;
}

export function unlockScroll() {
  if (lockCount > 0) {
    lockCount--;
  }

  if (lockCount === 0) {
    lockedContainers.forEach(({ element, origOverflow, origPaddingRight }) => {
      try {
        element.style.overflow = origOverflow;
        element.style.paddingRight = origPaddingRight;
      } catch {
        // Ignore if element was unmounted
      }
    });
    lockedContainers = [];
  }
}
