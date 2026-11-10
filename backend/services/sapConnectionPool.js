/**
 * ============================================================================
 * SAP RFC PER-SERVER CONNECTION POOL & FAIR PRIORITY QUEUE
 * ============================================================================
 * Features:
 * - Lazy instantiation per server ID (keyed strictly in Map, no global state).
 * - Priority queue with 3 tiers: 1 (F4/Reads), 2 (Interactive), 3 (Bulk).
 * - Automatic aging: Priority 3 promoted to Priority 2 after 30s.
 * - Per-user concurrency cap (per_user_limit): prevents single-user starvation.
 * - Connection reuse with idle cleanup (5 min timeout).
 * - Immediate connection discard on error (no poisoned connections reused).
 * - Hard call timeout (rfc_call_timeout_ms) and queue timeout (SERVER_BUSY 503).
 * - Immediate queue slot release on client abort/disconnect.
 * - Read-only single retry on connection-level errors (never retries writes).
 * ============================================================================
 */

import { Client } from 'open-rfc';
import { supabaseService } from './supabaseClient.js';
import {
  getCircuitBreaker,
  recordServerActivity,
  updateServerHealth,
  getServerHealth
} from './serverHealthService.js';

export const DEFAULT_RFC_CLIENT_OPTIONS = Object.freeze({
  bcd: 'string',
  int8Mode: 'number',
  recursiveSerializerPolicy: Object.freeze({
    profile: 'abap-7.50',
    observation: Object.freeze({
      defaultSerializer: 'classic-xrfc',
      basxmlDisabledSerializer: 'classic-xrfc'
    })
  })
});

export const RFC_PRIORITY = Object.freeze({
  READ: 1,        // F4/value-help, lookups, reads, hierarchy display
  INTERACTIVE: 2, // Single create, copy, delete, validate, simulation
  BULK: 3         // Bulk operations, batch validate, batch copy
});

// Default configuration constants
const DEFAULT_MAX_CONNECTIONS = 3;
const DEFAULT_PER_USER_LIMIT = 2;
const DEFAULT_QUEUE_TIMEOUT_MS = 20000;   // 20s
const DEFAULT_RFC_CALL_TIMEOUT_MS = 45000; // 45s
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 min
const BULK_AGING_PROMOTION_MS = 30000;    // 30s aging promotion

// Connection-level error code & message detector
export function isConnectionLevelError(err) {
  if (!err) return false;
  const code = String(err.code || err.errorCode || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === 'RFC_COMMUNICATION_FAILURE' ||
    code === 'RFC_CONN_ERROR' ||
    code === 'RFC_CALL_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'MAX_CONNECTIONS_EXCEEDED' ||
    msg.includes('connection refused') ||
    msg.includes('partner terminated connection') ||
    msg.includes('wsaeconnrefused') ||
    msg.includes('wsaetimedout') ||
    msg.includes('communication failure') ||
    msg.includes('broken pipe') ||
    msg.includes('connection timed out') ||
    msg.includes('socket closed')
  );
}

/**
 * Lightweight mock client used when USE_MOCK_SAP=true and no custom ClientClass was injected.
 */
class DefaultMockRfcClient {
  constructor(params = {}) {
    this.params = params;
    this.isOpen = false;
  }
  async open() {
    this.isOpen = true;
  }
  async call(fn, args = {}) {
    if (!this.isOpen) throw new Error('RFC client is not open');
    return { success: true, mock: true, functionName: fn };
  }
  async close() {
    this.isOpen = false;
  }
  isAlive() {
    return this.isOpen;
  }
}

export class SapConnectionPool {
  constructor(serverId, serverConfig = {}, options = {}) {
    this.serverId = String(serverId || 'default');
    this.serverConfig = { ...serverConfig };
    this.ClientClass = options.ClientClass || null;

    // Resolve configuration with fallback to defaults
    this.maxConnections = Number(serverConfig.max_connections || serverConfig.maxConnections) || DEFAULT_MAX_CONNECTIONS;
    this.perUserLimit = Number(serverConfig.per_user_limit || serverConfig.perUserLimit) || DEFAULT_PER_USER_LIMIT;
    this.queueTimeoutMs = Number(serverConfig.queue_timeout_ms || serverConfig.queueTimeoutMs) || DEFAULT_QUEUE_TIMEOUT_MS;
    this.rfcCallTimeoutMs = Number(serverConfig.rfc_call_timeout_ms || serverConfig.rfcCallTimeoutMs) || DEFAULT_RFC_CALL_TIMEOUT_MS;
    this.idleTimeoutMs = Number(serverConfig.idle_timeout_ms || serverConfig.idleTimeoutMs) || DEFAULT_IDLE_TIMEOUT_MS;

    // Connections state
    // activeConnections: Set of { client, userId, acquiredAt }
    this.activeConnections = new Set();
    // idleConnections: Array of { client, lastUsed, idleTimer }
    this.idleConnections = [];
    this.pendingConnections = 0;
    // Queue of pending requests
    this.queue = [];
    // User active connection counts: Map<userId, count>
    this.userActiveCount = new Map();
    this.circuitBreaker = getCircuitBreaker(this.serverId);

    // Telemetry & metrics
    this.stats = {
      peakConnections: 0,
      totalCalls: 0,
      totalTimeouts: 0,
      totalBusyRejections: 0,
      totalErrors: 0,
      totalRetries: 0
    };

    this._processing = false;
  }

  updateConfig(newConfig = {}) {
    if (!newConfig) return;
    this.serverConfig = { ...this.serverConfig, ...newConfig };
    if (newConfig.max_connections !== undefined || newConfig.maxConnections !== undefined) {
      this.maxConnections = Number(newConfig.max_connections !== undefined ? newConfig.max_connections : newConfig.maxConnections);
    }
    if (newConfig.per_user_limit !== undefined || newConfig.perUserLimit !== undefined) {
      this.perUserLimit = Number(newConfig.per_user_limit !== undefined ? newConfig.per_user_limit : newConfig.perUserLimit);
    }
    if (newConfig.queue_timeout_ms !== undefined || newConfig.queueTimeoutMs !== undefined) {
      this.queueTimeoutMs = Number(newConfig.queue_timeout_ms !== undefined ? newConfig.queue_timeout_ms : newConfig.queueTimeoutMs);
    }
    if (newConfig.rfc_call_timeout_ms !== undefined || newConfig.rfcCallTimeoutMs !== undefined) {
      this.rfcCallTimeoutMs = Number(newConfig.rfc_call_timeout_ms !== undefined ? newConfig.rfc_call_timeout_ms : newConfig.rfcCallTimeoutMs);
    }
    if (newConfig.idle_timeout_ms !== undefined || newConfig.idleTimeoutMs !== undefined) {
      this.idleTimeoutMs = Number(newConfig.idle_timeout_ms !== undefined ? newConfig.idle_timeout_ms : newConfig.idleTimeoutMs);
    }
    if (newConfig.is_active !== undefined) {
      this.serverConfig.is_active = Boolean(newConfig.is_active);
    }

    // Lowering max connections drains: trim excess idle connections immediately without touching active connections
    while (this.idleConnections.length > 0 &&
           (this.activeConnections.size + this.idleConnections.length) > this.maxConnections) {
      const excessIdle = this.idleConnections.pop();
      if (excessIdle) {
        this._closeIdleConnection(excessIdle);
      }
    }

    // Raising limits or updating config triggers immediate processing of any queued calls
    this._processQueue();
  }

  _getEffectivePriority(item, now = Date.now()) {
    let prio = item.priority;
    // Aging: Priority 3 promoted to Priority 2 after 30s
    if (prio === RFC_PRIORITY.BULK && (now - item.enqueuedAt) >= BULK_AGING_PROMOTION_MS) {
      prio = RFC_PRIORITY.INTERACTIVE;
    }
    return prio;
  }

  async _createClient() {
    if (this.ClientClass) {
      let params = { user: 'MOCK_USER' };
      try {
        const { getRfcConnectionParams } = await import('./sapRfcClient.js');
        params = getRfcConnectionParams({ server: this.serverConfig });
      } catch (_) {
        params = { user: this.serverConfig?.sap_username || 'MOCK_USER', ...this.serverConfig };
      }
      const client = new this.ClientClass(params, DEFAULT_RFC_CLIENT_OPTIONS);
      await client.open();
      return client;
    }

    if (process.env.USE_MOCK_SAP === 'true') {
      const client = new DefaultMockRfcClient({ server: this.serverConfig });
      await client.open();
      return client;
    }

    const { getRfcConnectionParams } = await import('./sapRfcClient.js');
    const params = getRfcConnectionParams({ server: this.serverConfig });
    const client = new Client(params, DEFAULT_RFC_CLIENT_OPTIONS);
    await client.open();
    return client;
  }

  _discardClient(client) {
    if (!client) return;
    try {
      if (typeof client.close === 'function') {
        const p = client.close();
        if (p && typeof p.then === 'function') {
          p.catch(() => {});
        }
      }
    } catch (_) {}
  }

  _closeIdleConnection(idleEntry) {
    const idx = this.idleConnections.indexOf(idleEntry);
    if (idx !== -1) {
      this.idleConnections.splice(idx, 1);
    }
    if (idleEntry.idleTimer) {
      clearTimeout(idleEntry.idleTimer);
      idleEntry.idleTimer = null;
    }
    this._discardClient(idleEntry.client);
  }

  _decrementUserCount(userId) {
    const current = this.userActiveCount.get(userId) || 1;
    if (current <= 1) {
      this.userActiveCount.delete(userId);
    } else {
      this.userActiveCount.set(userId, current - 1);
    }
  }

  _handleCancellation(item, reason) {
    if (item.started || item.cancelled) return;
    item.cancelled = true;
    if (item.timer) {
      clearTimeout(item.timer);
      item.timer = null;
    }
    const idx = this.queue.indexOf(item);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      console.log(`[SapConnectionPool][${this.serverId}] Cancelled request removed from queue at position ${idx + 1} (user: ${item.userId})`);
    }
    item.reject(reason || new Error('Request cancelled'));
    this._processQueue();
  }

  _handleQueueTimeout(item) {
    if (item.started || item.cancelled) return;
    item.cancelled = true;
    if (item.timer) {
      clearTimeout(item.timer);
      item.timer = null;
    }
    const idx = this.queue.indexOf(item);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      console.warn(`[SapConnectionPool][${this.serverId}] Queue timeout after ${this.queueTimeoutMs}ms (was at position ${idx + 1}/${this.queue.length + 1}, priority: ${item.priority}, user: ${item.userId})`);
    }
    this.stats.totalBusyRejections++;

    const err = new Error('The SAP server is busy. Please try again in a moment.');
    err.code = 'SERVER_BUSY';
    err.status = 503;
    err.retryAfter = Math.ceil(this.queueTimeoutMs / 1000);
    item.reject(err);
    this._processQueue();
  }

  _releaseConnection(activeEntry, isHealthy) {
    this.activeConnections.delete(activeEntry);
    this._decrementUserCount(activeEntry.userId);

    if (isHealthy && activeEntry.client) {
      // Reusable open connection, as long as total connections don't exceed maxConnections
      if (this.activeConnections.size + this.idleConnections.length < this.maxConnections) {
        const idleEntry = {
          client: activeEntry.client,
          lastUsed: Date.now(),
          idleTimer: null
        };
        idleEntry.idleTimer = setTimeout(() => {
          this._closeIdleConnection(idleEntry);
        }, this.idleTimeoutMs);
        this.idleConnections.push(idleEntry);
      } else {
        // Excess connection from lowered maxConnections limit -> drain and close cleanly
        this._discardClient(activeEntry.client);
      }
    } else if (activeEntry.client) {
      // Discard connection immediately on error or timeout
      this._discardClient(activeEntry.client);
    }

    this._processQueue();
  }

  async _processQueue() {
    if (this._processing) return;
    this._processing = true;

    try {
      const now = Date.now();
      // Purge cancelled/started items
      this.queue = this.queue.filter((item) => !item.cancelled && !item.started);
      if (this.queue.length === 0) return;

      // Sort by effective priority ASC (1 before 2 before 3), then FIFO enqueuedAt ASC
      this.queue.sort((a, b) => {
        const pA = this._getEffectivePriority(a, now);
        const pB = this._getEffectivePriority(b, now);
        if (pA !== pB) return pA - pB;
        return a.enqueuedAt - b.enqueuedAt;
      });

      while (this.queue.length > 0) {
        const totalConns = this.activeConnections.size + this.idleConnections.length + this.pendingConnections;
        const canAcquire = (this.idleConnections.length > 0) || (totalConns < this.maxConnections);
        if (!canAcquire) {
          // Pool saturated at maxConnections
          break;
        }

        // Find highest-priority candidate whose user has not exceeded perUserLimit
        let candidateIdx = -1;
        for (let i = 0; i < this.queue.length; i++) {
          const item = this.queue[i];
          const userCount = this.userActiveCount.get(item.userId) || 0;
          if (userCount < this.perUserLimit) {
            candidateIdx = i;
            break;
          }
        }

        if (candidateIdx === -1) {
          // All queued candidates belong to users at their perUserLimit
          break;
        }

        const item = this.queue.splice(candidateIdx, 1)[0];
        if (item.timer) {
          clearTimeout(item.timer);
          item.timer = null;
        }
        item.started = true;

        const currentActive = this.userActiveCount.get(item.userId) || 0;
        this.userActiveCount.set(item.userId, currentActive + 1);

        // Reserve connection synchronously to prevent race conditions during async connection creation
        let clientEntry = null;
        if (this.idleConnections.length > 0) {
          clientEntry = this.idleConnections.pop();
          if (clientEntry.idleTimer) {
            clearTimeout(clientEntry.idleTimer);
            clientEntry.idleTimer = null;
          }
        } else {
          this.pendingConnections++;
        }

        this._executeItem(item, clientEntry).catch((err) => {
          console.error(`[SapConnectionPool][${this.serverId}] Queued execution error:`, err);
        });
      }
    } finally {
      this._processing = false;
    }
  }

  async _executeItem(item, clientEntry = null) {
    if (!clientEntry) {
      try {
        const client = await this._createClient();
        this.pendingConnections--;
        clientEntry = { client, lastUsed: Date.now() };
      } catch (err) {
        this.pendingConnections--;
        this._decrementUserCount(item.userId);
        this.stats.totalErrors++;
        item.reject(err);
        this._processQueue();
        return;
      }
    }

    const activeEntry = {
      client: clientEntry.client,
      userId: item.userId,
      acquiredAt: Date.now()
    };
    this.activeConnections.add(activeEntry);
    this.stats.totalCalls++;

    if (this.activeConnections.size > this.stats.peakConnections) {
      this.stats.peakConnections = this.activeConnections.size;
    }

    // Call timeout watchdog
    let callTimer = null;
    const timeoutPromise = new Promise((_, reject) => {
      callTimer = setTimeout(() => {
        const err = new Error(`SAP RFC call timed out after ${this.rfcCallTimeoutMs}ms`);
        err.code = 'RFC_CALL_TIMEOUT';
        err.status = 504;
        reject(err);
      }, this.rfcCallTimeoutMs);
    });

    try {
      const result = await Promise.race([
        item.fn(activeEntry.client),
        timeoutPromise
      ]);
      clearTimeout(callTimer);

      this.circuitBreaker.onSuccess();
      updateServerHealth(this.serverId, { success: true });
      this._releaseConnection(activeEntry, true);
      item.resolve(result);
    } catch (err) {
      clearTimeout(callTimer);
      this.stats.totalErrors++;

      const isConnErr = isConnectionLevelError(err);
      this.circuitBreaker.onFailure(isConnErr, err.message);
      updateServerHealth(this.serverId, { success: false, error: err });

      // Discard broken or timed-out connection
      this._releaseConnection(activeEntry, false);

      // Read retry rule: reads retry once on connection-level error
      if (item.isRead && isConnectionLevelError(err) && item.retryCount === 0) {
        item.retryCount++;
        this.stats.totalRetries++;
        console.warn(`[SapConnectionPool][${this.serverId}] Retrying read operation after connection failure: ${err.message}`);
        item.started = false;
        item.enqueuedAt = Date.now();
        item.timer = setTimeout(() => {
          this._handleQueueTimeout(item);
        }, this.queueTimeoutMs);
        this.queue.unshift(item); // insert at front
        this._processQueue();
        return;
      }

      // Safe write rule (Stage 5 Part B): writes are NEVER retried.
      // If a write operation timed out or lost connection while in flight to SAP,
      // the outcome in SAP is unknown.
      if (item.isWrite && (isConnErr || err.code === 'RFC_CALL_TIMEOUT' || err.code === 'TIMEOUT')) {
        const unknownErr = new Error('The operation timed out or connection was lost while writing to SAP. The outcome is unknown; please verify using Display BOM before attempting again.');
        unknownErr.code = 'WRITE_OUTCOME_UNKNOWN';
        unknownErr.status = 504;
        unknownErr.statusCode = 504;
        unknownErr.retryable = false;
        unknownErr.originalError = err;
        item.reject(unknownErr);
        this._processQueue();
        return;
      }

      item.reject(err);
    }
  }

  /**
   * Dispatches a function through the priority queue and connection pool.
   * @param {number} priority - 1 (Read/F4), 2 (Interactive), 3 (Bulk)
   * @param {string} userId - User identifier for fair per-user concurrency
   * @param {function(client): Promise<any>} fn - RFC function to execute with pooled client
   * @param {object} [options={}] - Optional signal or Express req for cancellation
   */
  async run(priority, userId, fn, options = {}) {
    const prio = Number(priority) || RFC_PRIORITY.INTERACTIVE;
    const uid = String(userId || 'anonymous');

    recordServerActivity(this.serverId);

    // Disabled server check: rejects new calls with friendly error; running calls finish normally
    if (this.serverConfig.is_active === false) {
      const err = new Error('This SAP server is currently disabled. Please contact your administrator.');
      err.code = 'SERVER_DISABLED';
      err.status = 503;
      err.statusCode = 503;
      err.retryable = false;
      return Promise.reject(err);
    }

    const canRun = this.circuitBreaker.canExecute();
    if (!canRun.allowed) {
      const err = new Error('SAP server is not reachable right now. Please try again shortly.');
      err.code = 'SERVER_UNAVAILABLE';
      err.status = 503;
      err.retryAfter = canRun.retryAfter || 30;
      return Promise.reject(err);
    }

    return new Promise((resolve, reject) => {
      const item = {
        id: `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        priority: prio,
        userId: uid,
        fn,
        isRead: options.isRead !== undefined ? Boolean(options.isRead) : prio === RFC_PRIORITY.READ,
        isWrite: options.isWrite !== undefined ? Boolean(options.isWrite) : prio !== RFC_PRIORITY.READ,
        enqueuedAt: Date.now(),
        resolve,
        reject,
        timer: null,
        signal: options.signal || null,
        req: options.req || null,
        cancelled: false,
        started: false,
        retryCount: 0
      };

      // Queue timeout timer
      item.timer = setTimeout(() => {
        this._handleQueueTimeout(item);
      }, this.queueTimeoutMs);

      // AbortSignal listener
      if (item.signal) {
        if (item.signal.aborted) {
          clearTimeout(item.timer);
          return reject(new Error('Operation aborted by client'));
        }
        item.signal.addEventListener('abort', () => {
          this._handleCancellation(item, new Error('Operation aborted by client'));
        }, { once: true });
      }

      // Express request disconnect listener
      if (item.req) {
        item.req.on('close', () => {
          if (item.req.destroyed && !item.started && !item.cancelled) {
            this._handleCancellation(item, new Error('Client disconnected'));
          }
        });
      }

      this.queue.push(item);
      this._processQueue();
    });
  }

  getStats() {
    let prio1 = 0;
    let prio2 = 0;
    let prio3 = 0;

    for (const item of this.queue) {
      if (item.priority === RFC_PRIORITY.READ) prio1++;
      else if (item.priority === RFC_PRIORITY.INTERACTIVE) prio2++;
      else if (item.priority === RFC_PRIORITY.BULK) prio3++;
    }

    const userCounts = {};
    for (const [uId, count] of this.userActiveCount.entries()) {
      userCounts[uId] = count;
    }

    const health = getServerHealth(this.serverId);

    return {
      serverId: this.serverId,
      serverName: this.serverConfig.name || this.serverId,
      maxConnections: this.maxConnections,
      perUserLimit: this.perUserLimit,
      queueTimeoutMs: this.queueTimeoutMs,
      rfcCallTimeoutMs: this.rfcCallTimeoutMs,
      activeConnections: this.activeConnections.size,
      idleConnections: this.idleConnections.length,
      totalConnections: this.activeConnections.size + this.idleConnections.length,
      circuit_breaker: health.circuit_breaker,
      health_status: health.status,
      last_checked: health.last_checked,
      last_error: health.last_error,
      queued: {
        priority1: prio1,
        priority2: prio2,
        priority3: prio3,
        total: this.queue.length
      },
      userCounts,
      peakConnections: this.stats.peakConnections,
      totalCalls: this.stats.totalCalls,
      totalBusyRejections: this.stats.totalBusyRejections,
      totalErrors: this.stats.totalErrors,
      totalRetries: this.stats.totalRetries
    };
  }

  async closeAll() {
    for (const item of this.queue) {
      if (item.timer) clearTimeout(item.timer);
      item.cancelled = true;
      item.reject(new Error('Pool closed'));
    }
    this.queue = [];

    for (const idle of this.idleConnections) {
      if (idle.idleTimer) clearTimeout(idle.idleTimer);
      this._discardClient(idle.client);
    }
    this.idleConnections = [];

    for (const active of this.activeConnections) {
      this._discardClient(active.client);
    }
    this.activeConnections.clear();
    this.userActiveCount.clear();
  }
}

// Global server pool registry (Map<serverId, SapConnectionPool>)
const poolRegistry = new Map();

/**
 * Returns or creates the connection pool for a specific SAP server.
 * @param {string|object} serverInput - Server object or server ID string
 * @param {object} [options={}] - Optional ClientClass or custom overrides
 * @returns {SapConnectionPool}
 */
export function getSapConnectionPool(serverInput, options = {}) {
  let server = serverInput;
  let serverId = null;

  if (typeof server === 'string') {
    serverId = server;
    server = { id: serverId };
    if (supabaseService.getServerByIdSync) {
      const dbServer = supabaseService.getServerByIdSync(serverId);
      if (dbServer) server = { ...dbServer, ...server };
    }
  } else if (server && typeof server === 'object') {
    serverId = server.id || server.serverId || server.name || 'default';
  } else {
    serverId = 'default';
    server = { id: serverId };
  }

  if (poolRegistry.has(serverId)) {
    const existingPool = poolRegistry.get(serverId);
    if (options.ClientClass && existingPool.ClientClass !== options.ClientClass) {
      existingPool.ClientClass = options.ClientClass;
    }
    if (server && typeof server === 'object') {
      existingPool.updateConfig(server);
    }
    return existingPool;
  }

  const pool = new SapConnectionPool(serverId, server, options);
  poolRegistry.set(serverId, pool);
  return pool;
}

/**
 * Internal helper to retrieve pool stats for a specific server
 */
export function getPoolStats(serverId) {
  if (poolRegistry.has(serverId)) {
    return poolRegistry.get(serverId).getStats();
  }
  return null;
}

/**
 * Internal helper to retrieve pool stats across all configured servers
 */
export function getAllPoolStats() {
  const servers = {};
  let totalActive = 0;
  let totalIdle = 0;
  let totalQueued = 0;

  for (const [sId, pool] of poolRegistry.entries()) {
    const pStats = pool.getStats();
    servers[sId] = pStats;
    totalActive += pStats.activeConnections;
    totalIdle += pStats.idleConnections;
    totalQueued += pStats.queued.total;
  }

  return {
    servers,
    summary: {
      totalServers: poolRegistry.size,
      totalActiveConnections: totalActive,
      totalIdleConnections: totalIdle,
      totalQueued
    }
  };
}

/**
 * Updates pool configuration live without server restart
 */
export function updatePoolConfig(serverId, newConfig = {}) {
  const sId = String(serverId || 'default');
  if (poolRegistry.has(sId)) {
    const pool = poolRegistry.get(sId);
    pool.updateConfig(newConfig);
    return pool;
  }
  return null;
}

/**
 * Closes and removes a server's connection pool
 */
export async function removePool(serverId) {
  const sId = String(serverId || 'default');
  if (poolRegistry.has(sId)) {
    const pool = poolRegistry.get(sId);
    await pool.closeAll();
    poolRegistry.delete(sId);
  }
}

/**
 * Resets and closes all connection pools (for clean test teardown)
 */
export async function resetAllPools() {
  for (const pool of poolRegistry.values()) {
    await pool.closeAll();
  }
  poolRegistry.clear();
}
