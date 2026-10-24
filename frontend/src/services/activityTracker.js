/**
 * Activity Tracker Service
 * Tracks active asynchronous operations and pending confirmation cards across views.
 */
class ActivityTracker {
  constructor() {
    this.runningOperations = new Set();
    this.pendingConfirmations = new Set();
    this.listeners = new Set();
  }

  setOperation(key, isRunning) {
    if (isRunning) {
      this.runningOperations.add(key);
    } else {
      this.runningOperations.delete(key);
    }
    this.notify();
  }

  setConfirmation(key, isPending) {
    if (isPending) {
      this.pendingConfirmations.add(key);
    } else {
      this.pendingConfirmations.delete(key);
    }
    this.notify();
  }

  hasRunningOperation() {
    return this.runningOperations.size > 0;
  }

  hasPendingConfirmation() {
    return this.pendingConfirmations.size > 0;
  }

  /**
   * Comprehensive check checking registered activities and DOM indicators.
   */
  hasRunningOrPending() {
    if (this.hasRunningOperation() || this.hasPendingConfirmation()) {
      return true;
    }

    if (typeof document !== 'undefined') {
      // Check for pending confirmation card timer or active confirmation buttons
      const hasTimerBadge = Boolean(document.querySelector('.sap-badge-timer'));
      const hasConfirmBtn = Boolean(document.querySelector('.sap-confirm-card .sap-confirm-btn'));
      const hasRunningBadge = Boolean(document.querySelector('.sap-badge-running'));
      // Check for active spinners outside modal backdrops and header dropdowns
      const hasActiveSpinner = Boolean(
        document.querySelector('.sap-spinner:not(.sap-modal-backdrop .sap-spinner):not(.sap-session-dropdown .sap-spinner)')
      );

      if (hasTimerBadge || hasConfirmBtn || hasRunningBadge || hasActiveSpinner) {
        return true;
      }
    }

    return false;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch (_) {}
    });
  }
}

export const activityTracker = new ActivityTracker();
export default activityTracker;
