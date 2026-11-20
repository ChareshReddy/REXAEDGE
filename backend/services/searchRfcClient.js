import { openRfcClient, assertResolvedServer } from './sapRfcClient.js';
import { traceRfc, startRfcTrace } from '../utils/rfcTrace.js';

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
      wrappedClient: null,
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
async function isClientHealthy(client, serverId = 'default') {
  if (!client) return false;
  let timer = null;
  const healthTrace = startRfcTrace('search_rfc_client_health', serverId);
  try {
    if (typeof client.isAlive === 'function') {
      if (!client.isAlive()) {
        healthTrace.end();
        return false;
      }
    }
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Ping timeout')), 2000);
    });

    if (typeof client.ping === 'function') {
      await Promise.race([client.ping(), timeoutPromise]);
      healthTrace.end();
      return true;
    }
    // Fallback quick ping via RFC_PING
    if (typeof client.call === 'function') {
      await Promise.race([client.call('RFC_PING', {}), timeoutPromise]);
      healthTrace.end();
      return true;
    }
    healthTrace.end();
    return false;
  } catch (_) {
    healthTrace.end();
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Safely closes and discards a client instance with bounded timeout
 */
async function discardClient(holder) {
  if (holder.idleTimer) {
    clearTimeout(holder.idleTimer);
    holder.idleTimer = null;
  }
  holder.wrappedClient = null;
  const oldClient = holder.client;
  holder.client = null;
  if (oldClient) {
    try {
      if (typeof oldClient.close === 'function') {
        const closePromise = Promise.resolve(oldClient.close()).catch(() => {});
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
        await Promise.race([closePromise, timeoutPromise]);
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
 * Wraps raw RFC client with timeout watchdog and tracing for call/invoke
 */
function wrapClientForSearch(rawClient, timeoutMs = 20000, serverId = 'default') {
  if (!rawClient) return rawClient;
  return new Proxy(rawClient, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig === 'function' && (prop === 'call' || prop === 'invoke')) {
        return function (...args) {
          const fnName = args[0] || prop;
          const trace = startRfcTrace(`search_rfc_call_${fnName}`, serverId);
          let callTimer = null;
          const timeoutPromise = new Promise((_, reject) => {
            callTimer = setTimeout(() => {
              const err = new Error(`RFC invoke timed out after ${timeoutMs}ms for ${fnName}`);
              err.code = 'RFC_INVOKE_TIMEOUT';
              err.status = 504;
              err.statusCode = 504;
              reject(err);
            }, timeoutMs);
          });
          const invokePromise = Promise.resolve(orig.apply(target, args));
          return Promise.race([invokePromise, timeoutPromise])
            .finally(() => {
              if (callTimer) clearTimeout(callTimer);
              trace.end();
            });
        };
      }
      return orig;
    }
  });
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
  assertResolvedServer(server, 'runSearchRfc');
  if (signal?.aborted) {
    const abortErr = new Error('Search request was cancelled.');
    abortErr.status = 499;
    abortErr.code = 'CLIENT_ABORTED';
    throw abortErr;
  }

  const serverId = server?.id || server?.ashost || 'default_server';
  const holder = getServerHolder(serverId);

  // 1. Concurrency Limiter: At most 2 concurrent searches per server
  if (holder.activeCount >= MAX_CONCURRENT_SEARCHES) {
    let waitTimer = null;
    let queueAbortListener = null;
    try {
      await new Promise((resolve, reject) => {
        const queueEntry = { resolve, reject };

        waitTimer = setTimeout(() => {
          const idx = holder.waitQueue.indexOf(queueEntry);
          if (idx !== -1) holder.waitQueue.splice(idx, 1);
          const busyErr = new Error('SAP server is busy with searches. Please try again in a moment.');
          busyErr.status = 503;
          busyErr.code = 'SERVER_BUSY';
          reject(busyErr);
        }, WAIT_QUEUE_TIMEOUT_MS);

        queueEntry.timer = waitTimer;

        // If client aborts while waiting in queue
        if (signal) {
          queueAbortListener = () => {
            clearTimeout(waitTimer);
            const idx = holder.waitQueue.indexOf(queueEntry);
            if (idx !== -1) holder.waitQueue.splice(idx, 1);
            const cancelErr = new Error('Search request was cancelled.');
            cancelErr.status = 499;
            cancelErr.code = 'CLIENT_ABORTED';
            reject(cancelErr);
          };
          signal.addEventListener('abort', queueAbortListener, { once: true });
        }

        holder.waitQueue.push(queueEntry);
      });
    } finally {
      if (waitTimer) clearTimeout(waitTimer);
      if (signal && queueAbortListener) {
        signal.removeEventListener('abort', queueAbortListener);
      }
    }
  }

  // Check if aborted while in queue just as slot was granted
  if (signal?.aborted) {
    const cancelErr = new Error('Search request was cancelled.');
    cancelErr.status = 499;
    cancelErr.code = 'CLIENT_ABORTED';
    throw cancelErr;
  }

  // Slot acquired
  holder.activeCount++;
  traceRfc('search_rfc_acquire_slot', serverId, 'START');
  if (holder.idleTimer) {
    clearTimeout(holder.idleTimer);
    holder.idleTimer = null;
  }

  let client = holder.client;
  let hasFailed = false;
  let slotReleased = false;

  const releaseSlot = () => {
    if (slotReleased) return;
    slotReleased = true;
    holder.activeCount = Math.max(0, holder.activeCount - 1);
    traceRfc('search_rfc_release_slot', serverId, 'END');

    // If waitQueue has waiting callers, wake the next one immediately
    if (holder.waitQueue.length > 0) {
      const next = holder.waitQueue.shift();
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    } else if (holder.activeCount === 0 && !hasFailed && holder.client) {
      // Schedule idle closure after 2 minutes
      scheduleIdleClosure(holder);
    }
  };

  // 3. Protection: Hard timeout (20s) + AbortSignal listening covering connection & search
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutErr = new Error('SAP took too long. Narrow the search or use more characters.');
      timeoutErr.status = 504;
      timeoutErr.code = 'RFC_SEARCH_TIMEOUT';
      reject(timeoutErr);
    }, timeoutMs);
  });

  let abortListener = null;
  const abortPromise = new Promise((_, reject) => {
    if (signal) {
      abortListener = () => {
        releaseSlot();
        discardClient(holder).catch(() => {});
        const cancelErr = new Error('Search request was cancelled.');
        cancelErr.status = 499;
        cancelErr.code = 'CLIENT_ABORTED';
        reject(cancelErr);
      };
      signal.addEventListener('abort', abortListener, { once: true });
    }
  });

  const executeSearch = async () => {
    // 2. Health check before use / auto-reconnect
    const healthy = await isClientHealthy(client, serverId);
    if (!healthy) {
      if (client) {
        await discardClient(holder);
      }
      const openTrace = startRfcTrace('search_rfc_client_open', serverId);
      try {
        client = await openRfcClient({ server }, ClientClass);
        holder.client = client;
        holder.wrappedClient = wrapClientForSearch(client, timeoutMs, serverId);
        openTrace.end();
      } catch (openErr) {
        openTrace.end();
        throw openErr;
      }
    }

    if (!holder.wrappedClient) {
      holder.wrappedClient = wrapClientForSearch(client, timeoutMs, serverId);
    }
    const result = await searchFn(holder.wrappedClient);
    holder.lastUsed = Date.now();
    return result;
  };

  try {
    return await Promise.race([
      executeSearch(),
      timeoutPromise,
      abortPromise
    ]);
  } catch (err) {
    hasFailed = true;
    // 4. Protection: Never leave a connection open after an error or timeout
    try {
      if (holder.client) {
        await discardClient(holder);
      }
    } catch (_) {}
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener);
    }
    releaseSlot();
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
