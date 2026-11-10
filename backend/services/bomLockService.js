/**
 * ============================================================================
 * BOM LOCK LEASE SERVICE (STAGE 5)
 * ============================================================================
 * Features:
 * - Granular In-Process Lease: Lock key = serverId + ':' + material + ':' + plant + ':' + bomUsage + ':' + alternative
 * - 30s auto-expiry so crashes never leave orphaned locks
 * - Heartbeat auto-renewal while a long-running operation is active
 * - Fast-fail for different users with code: BOM_LOCKED (409)
 * - Safe re-entrancy for the SAME user holding the lock
 * - Clean release in finally blocks
 * ============================================================================
 */

export function normalizeBomLockKey({ serverId, material, plant, bomUsage, alternative }) {
  const sId = String(serverId || 'default').trim();
  const mat = String(material || '').trim().toUpperCase();
  const plt = String(plant || '').trim().toUpperCase();
  const usg = String(bomUsage || '1').trim();
  const alt = String(alternative || '01').trim().padStart(2, '0');
  return `${sId}:${mat}:${plt}:${usg}:${alt}`;
}

export class BomLockError extends Error {
  constructor(message = 'This BOM is being changed by another user. Please try again in a moment.') {
    super(message);
    this.name = 'BomLockError';
    this.code = 'BOM_LOCKED';
    this.status = 409;
    this.statusCode = 409;
    this.retryable = true;
  }
}

class BomLockService {
  constructor(defaultLeaseMs = 30000) {
    this.locks = new Map(); // key -> LockEntry
    this.defaultLeaseMs = defaultLeaseMs;
  }

  /**
   * Attempts to acquire a lease on the specified BOM lock key.
   * Fails fast if locked by another user. Allows re-entry if requested by the same user.
   */
  acquireLock({ serverId, material, plant, bomUsage, alternative, userId, leaseMs = this.defaultLeaseMs }) {
    const key = normalizeBomLockKey({ serverId, material, plant, bomUsage, alternative });
    const uId = String(userId || 'anonymous');
    const now = Date.now();

    const existing = this.locks.get(key);
    if (existing) {
      if (now < existing.expiresAt) {
        // Active unexpired lock
        if (existing.userId === uId) {
          // Same user re-entrancy
          existing.refCount++;
          return {
            key,
            userId: uId,
            release: () => this.releaseLock(key, uId)
          };
        }

        // Held by a different user -> FAIL FAST immediately
        throw new BomLockError();
      } else {
        // Lock expired
        if (existing.renewalTimer) clearInterval(existing.renewalTimer);
        this.locks.delete(key);
      }
    }

    // Create fresh lock lease
    const lockEntry = {
      key,
      userId: uId,
      acquiredAt: now,
      expiresAt: now + leaseMs,
      leaseMs,
      refCount: 1,
      renewalTimer: null
    };

    // Auto-renewal heartbeat while operation continues
    const renewInterval = Math.max(1000, Math.floor(leaseMs / 2));
    lockEntry.renewalTimer = setInterval(() => {
      const cur = this.locks.get(key);
      if (cur && cur.userId === uId) {
        cur.expiresAt = Date.now() + leaseMs;
      } else {
        clearInterval(lockEntry.renewalTimer);
      }
    }, renewInterval);

    // Unref timer so it doesn't block Node process exit in tests
    if (lockEntry.renewalTimer && typeof lockEntry.renewalTimer.unref === 'function') {
      lockEntry.renewalTimer.unref();
    }

    this.locks.set(key, lockEntry);

    return {
      key,
      userId: uId,
      release: () => this.releaseLock(key, uId)
    };
  }

  /**
   * Releases a lock held by a given user.
   */
  releaseLock(key, userId) {
    const uId = String(userId || 'anonymous');
    const existing = this.locks.get(key);
    if (!existing) return;

    if (existing.userId === uId) {
      existing.refCount--;
      if (existing.refCount <= 0) {
        if (existing.renewalTimer) clearInterval(existing.renewalTimer);
        this.locks.delete(key);
      }
    }
  }

  /**
   * Helper that executes an operation with automatic lock acquisition and release.
   */
  async withLock({ serverId, material, plant, bomUsage, alternative, userId, leaseMs }, fn) {
    const lock = this.acquireLock({ serverId, material, plant, bomUsage, alternative, userId, leaseMs });
    try {
      return await fn();
    } finally {
      lock.release();
    }
  }

  isLocked(key) {
    const existing = this.locks.get(key);
    if (!existing) return false;
    if (Date.now() >= existing.expiresAt) {
      if (existing.renewalTimer) clearInterval(existing.renewalTimer);
      this.locks.delete(key);
      return false;
    }
    return true;
  }

  clearAllLocks() {
    for (const lock of this.locks.values()) {
      if (lock.renewalTimer) clearInterval(lock.renewalTimer);
    }
    this.locks.clear();
  }
}

export const bomLockService = new BomLockService();
