/**
 * ============================================================================
 * SERVER HEALTH CACHE & PER-SERVER CIRCUIT BREAKER
 * ============================================================================
 * Capabilities:
 * - Per-server Circuit Breaker:
 *   - 3 consecutive connection failures -> OPEN for 30s.
 *   - Fails fast with code: SERVER_UNAVAILABLE and retryAfter hint.
 *   - After 30s -> HALF_OPEN (1 probe call allowed).
 *   - Probe success closes circuit (CLOSED); probe failure re-opens (OPEN).
 *   - Business/validation errors (e.g. BOM not found) never count as failures.
 * - Per-server Cached Health Status:
 *   - States: 'healthy', 'degraded', 'down'
 *   - Health endpoints read cache only; zero RFC calls incurred on poll.
 *   - Background health check pings every 30s with short timeout at priority 1.
 *   - Only servers with user activity in the last 10 minutes are pinged (idle servers skipped).
 * ============================================================================
 */

import { isConnectionLevelError } from './sapConnectionPool.js';

export const BREAKER_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
});

export const HEALTH_STATE = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down'
});

export class CircuitBreaker {
  constructor(serverId, options = {}) {
    this.serverId = String(serverId || 'default');
    this.failureThreshold = options.failureThreshold || 3;
    this.openDurationMs = options.openDurationMs || 30000; // 30s
    this.state = BREAKER_STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInProgress = false;
  }

  canExecute() {
    const now = Date.now();

    if (this.state === BREAKER_STATE.CLOSED) {
      return { allowed: true };
    }

    if (this.state === BREAKER_STATE.OPEN) {
      if (now - this.openedAt >= this.openDurationMs) {
        // Transition to half-open and allow single probe
        this.state = BREAKER_STATE.HALF_OPEN;
        this.probeInProgress = true;
        return { allowed: true, isProbe: true };
      }
      const retryAfter = Math.ceil((this.openedAt + this.openDurationMs - now) / 1000);
      return {
        allowed: false,
        retryAfter: Math.max(1, retryAfter),
        state: this.state
      };
    }

    if (this.state === BREAKER_STATE.HALF_OPEN) {
      if (!this.probeInProgress) {
        this.probeInProgress = true;
        return { allowed: true, isProbe: true };
      }
      // Probe already running, fail others fast
      return { allowed: false, retryAfter: 5, state: this.state };
    }

    return { allowed: true };
  }

  onSuccess() {
    this.state = BREAKER_STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInProgress = false;
  }

  onFailure(isConnectionError = false, errMsg = '') {
    if (!isConnectionError) {
      // Business/validation errors do NOT trip the breaker
      if (this.state === BREAKER_STATE.HALF_OPEN) {
        // Business error implies RFC connection reached SAP successfully
        this.onSuccess();
      }
      return;
    }

    this.consecutiveFailures++;

    if (this.state === BREAKER_STATE.HALF_OPEN) {
      this.state = BREAKER_STATE.OPEN;
      this.openedAt = Date.now();
      this.probeInProgress = false;
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = BREAKER_STATE.OPEN;
      this.openedAt = Date.now();
      this.probeInProgress = false;
    }
  }

  getState() {
    if (this.state === BREAKER_STATE.OPEN && (Date.now() - this.openedAt >= this.openDurationMs)) {
      return BREAKER_STATE.HALF_OPEN;
    }
    return this.state;
  }

  reset() {
    this.state = BREAKER_STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.openedAt = null;
    this.probeInProgress = false;
  }
}

const serverBreakers = new Map();
const serverHealthCache = new Map();
const serverActivityMap = new Map();
const inFlightProbes = new Map();

const ACTIVITY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
let backgroundTimer = null;

export function getCircuitBreaker(serverId, options = {}) {
  const sId = String(serverId || 'default');
  if (!serverBreakers.has(sId)) {
    serverBreakers.set(sId, new CircuitBreaker(sId, options));
  }
  return serverBreakers.get(sId);
}

export function recordServerActivity(serverId) {
  const sId = String(serverId || 'default');
  serverActivityMap.set(sId, Date.now());
}

export function hasRecentActivity(serverId, windowMs = ACTIVITY_WINDOW_MS) {
  const sId = String(serverId || 'default');
  const last = serverActivityMap.get(sId);
  if (!last) return false;
  return (Date.now() - last) < windowMs;
}

export function hasHealthData(serverId) {
  const sId = String(serverId || 'default');
  const entry = serverHealthCache.get(sId);
  return Boolean(entry && entry.has_probed);
}

export function getServerHealth(serverId) {
  const sId = String(serverId || 'default');
  const breaker = getCircuitBreaker(sId);
  const breakerState = breaker.getState();

  let entry = serverHealthCache.get(sId);
  if (!entry) {
    entry = {
      serverId: sId,
      status: HEALTH_STATE.DEGRADED,
      circuit_breaker: breakerState,
      last_checked: 0,
      has_probed: false,
      last_error: null,
      last_code: null,
      latency_ms: null,
      consecutive_failures: 0
    };
    serverHealthCache.set(sId, entry);
  }

  entry.circuit_breaker = breakerState;
  if (breakerState === BREAKER_STATE.OPEN) {
    entry.status = HEALTH_STATE.DOWN;
  } else if (breakerState === BREAKER_STATE.HALF_OPEN) {
    entry.status = HEALTH_STATE.DEGRADED;
  } else if (breaker.consecutiveFailures > 0) {
    entry.status = HEALTH_STATE.DEGRADED;
  } else if (entry.has_probed) {
    entry.status = HEALTH_STATE.HEALTHY;
  }
  entry.consecutive_failures = breaker.consecutiveFailures;

  return { ...entry };
}

export function updateServerHealth(serverId, { success, error = null, latencyMs = 0 }) {
  const sId = String(serverId || 'default');
  const breaker = getCircuitBreaker(sId);
  const now = Date.now();

  let entry = serverHealthCache.get(sId) || {
    serverId: sId,
    status: HEALTH_STATE.HEALTHY,
    circuit_breaker: BREAKER_STATE.CLOSED,
    last_checked: now,
    has_probed: true,
    last_error: null,
    last_code: null,
    latency_ms: 2,
    consecutive_failures: 0
  };

  entry.last_checked = now;
  entry.has_probed = true;
  if (latencyMs) entry.latency_ms = latencyMs;

  if (success) {
    breaker.reset();
    entry.status = HEALTH_STATE.HEALTHY;
    entry.last_error = null;
    entry.last_code = null;
    entry.circuit_breaker = BREAKER_STATE.CLOSED;
    entry.consecutive_failures = 0;
  } else if (error) {
    entry.last_error = error.message || String(error);
    entry.last_code = error.code || null;
    entry.consecutive_failures = breaker.consecutiveFailures;
    if (breaker.getState() === BREAKER_STATE.OPEN) {
      entry.status = HEALTH_STATE.DOWN;
      entry.circuit_breaker = BREAKER_STATE.OPEN;
    } else {
      entry.status = HEALTH_STATE.DEGRADED;
      entry.circuit_breaker = breaker.getState();
    }
  }

  serverHealthCache.set(sId, entry);
  return entry;
}

/**
 * Probes the target SAP server with a lightweight RFC_PING if:
 * 1. Server has no health data, OR
 * 2. Last check is older than 60s, OR
 * 3. Circuit breaker is in HALF_OPEN state (allows single probe).
 *
 * Respects circuit breaker: when OPEN, does not probe until half-open time.
 * In-flight coalescing: concurrent polls from many tabs share one probe.
 * Hard timeout: 5s.
 */
export async function probeServerHealth(server, { force = false, timeoutMs = 5000 } = {}) {
  const sId = String(server?.id || server?.ashost || 'default');
  const breaker = getCircuitBreaker(sId);
  const breakerState = breaker.getState();

  const cached = serverHealthCache.get(sId);
  const hasData = Boolean(cached && cached.has_probed);
  const isFresh = hasData && (Date.now() - cached.last_checked <= 60000);

  // 1. Respect the circuit breaker: when OPEN, do not probe until half-open time
  if (breakerState === BREAKER_STATE.OPEN) {
    return getServerHealth(sId);
  }

  // 2. Fresh cache check: if data is fresh (<= 60s) and breaker is CLOSED, answer from cache without pinging
  if (isFresh && !force && breakerState === BREAKER_STATE.CLOSED) {
    return getServerHealth(sId);
  }

  // 3. Share in-flight probe across concurrent polls
  if (inFlightProbes.has(sId)) {
    try {
      await inFlightProbes.get(sId);
    } catch (_) {}
    return getServerHealth(sId);
  }

  // 4. Run probe
  const probePromise = (async () => {
    let probeTimer = null;
    const probeStart = Date.now();
    try {
      const { pingRfcServer } = await import('./sapRfcClient.js');

      const timeoutPromise = new Promise((_, reject) => {
        probeTimer = setTimeout(() => {
          const err = new Error(
            breakerState === BREAKER_STATE.HALF_OPEN
              ? 'HALF_OPEN ping probe timed out after 5000ms'
              : `RFC ping probe timed out after ${timeoutMs}ms`
          );
          err.code = breakerState === BREAKER_STATE.HALF_OPEN ? 'PROBE_TIMEOUT' : 'HEALTH_CHECK_TIMEOUT';
          reject(err);
        }, timeoutMs);
      });

      const pingPromise = pingRfcServer(server);
      const res = await Promise.race([pingPromise, timeoutPromise]);
      if (probeTimer) clearTimeout(probeTimer);

      const probeDur = Date.now() - probeStart;
      if (probeDur > 2000) {
        const stepName = breakerState === BREAKER_STATE.HALF_OPEN ? 'HALF_OPEN ping probe' : 'health check probe';
        console.warn(`[SlowStep] ${stepName} took ${probeDur}ms`);
      }

      if (res && res.success) {
        breaker.onSuccess();
        updateServerHealth(sId, { success: true, latencyMs: res.latencyMs || Math.max(1, probeDur) });
      } else {
        const err = new Error(res?.message || 'RFC ping probe failed');
        err.code = res?.code || 'RFC_CONN_ERROR';
        breaker.onFailure(true, err.message);
        updateServerHealth(sId, { success: false, error: err, latencyMs: res?.latencyMs || Math.max(1, probeDur) });
      }
    } catch (err) {
      if (probeTimer) clearTimeout(probeTimer);
      const probeDur = Date.now() - probeStart;
      if (probeDur > 2000) {
        const stepName = breakerState === BREAKER_STATE.HALF_OPEN ? 'HALF_OPEN ping probe' : 'health check probe';
        console.warn(`[SlowStep] ${stepName} took ${probeDur}ms (failed: ${err.message})`);
      }
      breaker.onFailure(true, err.message);
      updateServerHealth(sId, { success: false, error: err, latencyMs: Math.max(1, probeDur) });
    }
  })();

  inFlightProbes.set(sId, probePromise);
  try {
    await probePromise;
  } finally {
    inFlightProbes.delete(sId);
  }

  return getServerHealth(sId);
}

/**
 * Runs one cycle of background health checks across all active servers.
 * Pings only servers that had activity within the last 10 minutes.
 * Idle servers are completely skipped (0 RFC calls).
 */
export async function performBackgroundHealthCheck() {
  const { getAllPoolStats, getSapConnectionPool, RFC_PRIORITY } = await import('./sapConnectionPool.js');
  const poolStats = getAllPoolStats();
  const serverIds = Object.keys(poolStats.servers || {});

  const results = [];
  for (const serverId of serverIds) {
    // Check activity window
    if (!hasRecentActivity(serverId)) {
      continue;
    }

    try {
      const pool = getSapConnectionPool(serverId);
      const start = Date.now();
      await pool.run(RFC_PRIORITY.READ, 'health_background_ping', async (client) => {
        return client.call('RFC_PING', {});
      }, { timeoutMs: 3000 });
      const latencyMs = Date.now() - start;
      const updated = updateServerHealth(serverId, { success: true, latencyMs });
      results.push({ serverId, success: true, health: updated });
    } catch (err) {
      const updated = updateServerHealth(serverId, { success: false, error: err });
      results.push({ serverId, success: false, error: err.message, health: updated });
    }
  }
  return results;
}

export function startBackgroundHealthChecks(intervalMs = 30000) {
  if (backgroundTimer) clearInterval(backgroundTimer);
  backgroundTimer = setInterval(() => {
    performBackgroundHealthCheck().catch((err) => {
      console.warn('[ServerHealthService] Background health check error:', err.message);
    });
  }, intervalMs);
}

export function stopBackgroundHealthChecks() {
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = null;
  }
}

export function resetAllHealthAndBreakers() {
  for (const breaker of serverBreakers.values()) {
    breaker.reset();
  }
  serverBreakers.clear();
  serverHealthCache.clear();
  serverActivityMap.clear();
  inFlightProbes.clear();
  stopBackgroundHealthChecks();
}
