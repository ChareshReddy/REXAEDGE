import { openRfcClient } from './sapRfcClient.js';

/**
 * ============================================================================
 * DEDICATED READ-ONLY RFC CONNECTION POOL & SAP PROTECTION
 * ============================================================================
 * Used ONLY by read-only Material Search and Plant Selector services.
 * Never used by Create BOM, Copy BOM, or Background Jobs.
 *
 * Capabilities:
 * 1. Connection reuse: Maintains at most 1 shared open RFC connection per server.
 * 2. Health-check before use: Verifies connection alive before dispatching calls.
 * 3. Auto-reconnect: Reconnects cleanly if the existing socket dropped.
 * 4. Idle auto-close: Automatically closes connection after 2 minutes of inactivity.
 * 5. Strict Server Isolation: Server connections are strictly keyed by serverId.
 * 6. Never leave open on error: Discards and closes connection on any RFC failure.
 * 7. Hard Timeout (default 20s): Aborts and returns explicit 504 message.
 * 8. Client Disconnect / Abort: Releases and discards connection when browser aborts.
 * 9. Concurrency Limiter: At most 2 concurrent searches per server (waits 3s or 503).
 * ============================================================================
 */

const MAX_CONCURRENT_SEARCHES = 2;
const WAIT_QUEUE_TIMEOUT_MS = 3000; // 3 seconds max wait for a busy server slot
const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes idle close
const DEFAULT_SEARCH_TIMEOUT_MS = Number(process.env.SAP_SEARCH_TIMEOUT_MS) || 20000; // 20s

// Map<serverId, ServerHolder>
const serverPool = new Map();

function getServerHolder(serverId) {
  if (!serverPool.has(serverId)) {
    serverPool.set(serverId, {
      serverId,
      client: null,
      activeCount: 0,
      waitQueue: [],
      idleTimer: null,
      lastUsed: Date.now()
    });
  }
  return serverPool.get(serverId);
}

/**
 * Verifies if an existing RFC client is healthy and responsive
 */
async function isClientHealthy(client) {
  if (!client) return false;
  try {
    if (typeof client.isAlive === 'function') {
      if (!client.isAlive()) return false;
    }
    if (typeof client.ping === 'function') {
      const pingPromise = client.ping();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Ping timeout')), 2000)
      );
      await Promise.race([pingPromise, timeoutPromise]);
      return true;
    }
    // Fallback quick ping via RFC_PING
    const pingPromise = client.call('RFC_PING', {});
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Ping timeout')), 2000)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Safely closes and discards a client instance
 */
async function discardClient(holder) {
  if (holder.idleTimer) {
    clearTimeout(holder.idleTimer);
    holder.idleTimer = null;
  }
  const oldClient = holder.client;
  holder.client = null;
  if (oldClient) {
    try {
      if (typeof oldClient.close === 'function') {
        await oldClient.close();
      }
    } catch (_) {}
  }
}

/**
 * Schedules idle closure after 2 minutes of no search activity
 */
function scheduleIdleClosure(holder) {
  if (holder.idleTimer) {
    clearTimeout(holder.idleTimer);
  }
  holder.idleTimer = setTimeout(async () => {
    if (holder.activeCount === 0 && holder.client) {
      await discardClient(holder);
    }
  }, IDLE_TIMEOUT_MS);
}

/**
 * Executes a search function using a managed, protected RFC client
 *
 * @param {Object} options
 * @param {Object} options.server - Target SAP server config
 * @param {AbortSignal} [options.signal] - Optional AbortSignal from HTTP request
 * @param {number} [options.timeoutMs] - Optional custom timeout in ms (default 20s)
 * @param {Function} searchFn - Async callback receiving (client)
 */
export async function runSearchRfc(
  { server, signal, timeoutMs = DEFAULT_SEARCH_TIMEOUT_MS, ClientClass },
  searchFn
) {
  if (signal?.aborted) {
    const abortErr = new Error('Search request was cancelled.');
    abortErr.status = 499;
    throw abortErr;
  }

  const serverId = server?.id || server?.ashost || 'default_server';
  const holder = getServerHolder(serverId);

  // 1. Concurrency Limiter: At most 2 concurrent searches per server
  if (holder.activeCount >= MAX_CONCURRENT_SEARCHES) {
    let waitTimer = null;
    try {
      await new Promise((resolve, reject) => {
        const queueEntry = { resolve, reject };

        waitTimer = setTimeout(() => {
          const idx = holder.waitQueue.indexOf(queueEntry);
          if (idx !== -1) holder.waitQueue.splice(idx, 1);
          const busyErr = new Error('SAP server is busy with searches. Please try again in a moment.');
          busyErr.status = 503;
          reject(busyErr);
        }, WAIT_QUEUE_TIMEOUT_MS);

        queueEntry.timer = waitTimer;

        // If client aborts while waiting in queue
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(waitTimer);
              const idx = holder.waitQueue.indexOf(queueEntry);
              if (idx !== -1) holder.waitQueue.splice(idx, 1);
              const cancelErr = new Error('Search request was cancelled.');
              cancelErr.status = 499;
              reject(cancelErr);
            },
            { once: true }
          );
        }

        holder.waitQueue.push(queueEntry);
      });
    } finally {
      if (waitTimer) clearTimeout(waitTimer);
    }
  }

  // Slot acquired
  holder.activeCount++;
  if (holder.idleTimer) {
    clearTimeout(holder.idleTimer);
    holder.idleTimer = null;
  }

  let client = holder.client;
  let hasFailed = false;

  try {
    // 2. Health check before use / auto-reconnect
    const healthy = await isClientHealthy(client);
    if (!healthy) {
      if (client) {
        await discardClient(holder);
      }
      client = await openRfcClient({ server }, ClientClass);
      holder.client = client;
    }

    // 3. Protection: Hard timeout (20s) + AbortSignal listening
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const timeoutErr = new Error('SAP took too long. Narrow the search or use more characters.');
        timeoutErr.status = 504;
        reject(timeoutErr);
      }, timeoutMs);
    });

    let abortListener = null;
    const abortPromise = new Promise((_, reject) => {
      if (signal) {
        abortListener = () => {
          const cancelErr = new Error('Search request was cancelled.');
          cancelErr.status = 499;
          reject(cancelErr);
        };
        signal.addEventListener('abort', abortListener, { once: true });
      }
    });

    try {
      const result = await Promise.race([
        searchFn(client),
        timeoutPromise,
        abortPromise
      ]);
      holder.lastUsed = Date.now();
      return result;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  } catch (err) {
    hasFailed = true;
    // 4. Protection: Never leave a connection open after an error or timeout
    await discardClient(holder);
    throw err;
  } finally {
    holder.activeCount = Math.max(0, holder.activeCount - 1);

    // If waitQueue has waiting callers, wake the next one immediately
    if (holder.waitQueue.length > 0) {
      const next = holder.waitQueue.shift();
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    } else if (holder.activeCount === 0 && !hasFailed && holder.client) {
      // 5. Schedule idle closure after 2 minutes
      scheduleIdleClosure(holder);
    }
  }
}

/**
 * Closes all managed search clients across all servers (useful for tests and shutdown)
 */
export async function closeAllSearchClients() {
  for (const holder of serverPool.values()) {
    await discardClient(holder);
  }
  serverPool.clear();
}
