/**
 * Supabase In-Memory Cache with Single-Flight and Stale-While-Timeout Resilience
 *
 * Caches:
 * - Server records by ID (TTL 30s, stale up to 5min)
 * - Module lists by Server ID (TTL 30s, stale up to 5min)
 * - Host allowlist (TTL 60s, stale up to 5min)
 * - Auth tokens / user records (TTL 30s, stale up to 5min)
 *
 * Single-flight: concurrent requests for the same key await the same in-flight Promise.
 * Invalidation: immediately on server create, edit, delete, disable/enable, modules update, allowlist change.
 * Timeout resilience: on database timeout, serves last cached value if <= 5min old; otherwise returns DB_TIMEOUT.
 */

export const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS) || 5000;

/**
 * Wraps any database / Supabase operation with a hard timeout safeguard.
 * If the operation does not settle within timeoutMs, rejects with DB_TIMEOUT error (HTTP 504).
 */
export async function withDbTimeout(fnOrPromise, timeoutMs = DB_TIMEOUT_MS, opName = 'DB operation') {
  const effectiveTimeout = Number(process.env.DB_TIMEOUT_MS) || timeoutMs || 5000;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${opName} timed out after ${effectiveTimeout}ms`);
      err.code = 'DB_TIMEOUT';
      err.status = 504;
      err.userMessage = 'The database is slow right now. Please try again.';
      reject(err);
    }, effectiveTimeout);
  });

  try {
    const execPromise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
    const res = await Promise.race([Promise.resolve(execPromise), timeoutPromise]);
    return res;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const CACHE_TTL = {
  SERVER: 30000,     // 30 seconds
  MODULES: 30000,    // 30 seconds
  ALLOWLIST: 60000,  // 60 seconds
  AUTH: 30000,       // 30 seconds
  USER: 30000        // 30 seconds
};

export const MAX_STALE_TTL = 300000; // 5 minutes

class SupabaseCacheManager {
  constructor() {
    this.cache = new Map();     // key -> { data, fetchedAt, ttlMs }
    this.inFlight = new Map();  // key -> Promise
    this.fetchCounts = new Map(); // key -> count of raw underlying fetches (for test verification)
    this.userTokens = new Map();  // userId -> Set<token>
    this.userInvalidateListeners = [];
  }

  onInvalidateUser(fn) {
    if (typeof fn === 'function') {
      this.userInvalidateListeners.push(fn);
    }
  }

  trackUserToken(userId, token) {
    if (!userId || !token) return;
    const strId = String(userId);
    if (!this.userTokens.has(strId)) {
      this.userTokens.set(strId, new Set());
    }
    this.userTokens.get(strId).add(token);
  }

  /**
   * Retrieves an item from cache, or fetches it with single-flight and timeout protection.
   * Stale-while-timeout fallback is STRICTLY guarded: allowStale=true is only permitted
   * for harmless data (modules list, allowlist). Sensitive records (server, user, auth)
   * must always fail closed on timeout with DB_TIMEOUT.
   */
  async getOrFetch(key, fetchFn, { ttlMs = 30000, allowStale = false, staleTtlMs = MAX_STALE_TTL, timeoutMs = 5000 } = {}) {
    const now = Date.now();
    const cached = this.cache.get(key);

    // 1. Fresh Cache Hit
    if (cached && (now - cached.fetchedAt) <= ttlMs) {
      return cached.data;
    }

    // 2. Single-Flight Coalescing: share in-flight promise across parallel callers
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    // 3. Launch underlying fetch
    const promise = (async () => {
      try {
        this.fetchCounts.set(key, (this.fetchCounts.get(key) || 0) + 1);
        const freshData = await withDbTimeout(fetchFn, timeoutMs, `Supabase ${key}`);

        this.cache.set(key, {
          data: freshData,
          fetchedAt: Date.now(),
          ttlMs
        });
        return freshData;
      } catch (err) {
        // 4. Stale fallback on timeout (ONLY if explicitly allowed for harmless data)
        if (allowStale && cached && (Date.now() - cached.fetchedAt) <= staleTtlMs) {
          const ageSec = Math.round((Date.now() - cached.fetchedAt) / 1000);
          console.warn(`[SupabaseCache] Database timeout (${timeoutMs}ms). Serving stale harmless cached value for "${key}" (age: ${ageSec}s)`);
          return cached.data;
        }

        // 5. Fail closed: no stale fallback for sensitive records or when expired
        if (err.code === 'DB_TIMEOUT' || String(err.message).toLowerCase().includes('timed out')) {
          const timeoutErr = new Error('The database is slow right now. Please try again.');
          timeoutErr.code = 'DB_TIMEOUT';
          timeoutErr.status = 504;
          timeoutErr.userMessage = 'The database is slow right now. Please try again.';
          throw timeoutErr;
        }
        throw err;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  get(key) {
    return this.cache.get(key)?.data;
  }

  set(key, data, ttlMs = 30000, fetchedAt = Date.now()) {
    this.cache.set(key, { data, fetchedAt, ttlMs });
  }

  invalidate(key) {
    this.cache.delete(key);
    this.inFlight.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of Array.from(this.cache.keys())) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    for (const key of Array.from(this.inFlight.keys())) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }
  }

  invalidateServer(serverId) {
    if (!serverId) return;
    this.invalidate(`server:${serverId}`);
    this.invalidate(`modules:${serverId}`);
  }

  invalidateAllServers() {
    this.invalidatePrefix('server:');
    this.invalidatePrefix('modules:');
  }

  invalidateModules(serverId) {
    if (!serverId) return;
    this.invalidate(`modules:${serverId}`);
    this.invalidate(`server:${serverId}`);
  }

  invalidateAllowlist() {
    this.invalidate('allowlist');
  }

  invalidateUser(tokenOrUserId) {
    if (!tokenOrUserId) return;
    const strId = String(tokenOrUserId);
    this.invalidate(`auth:${strId}`);
    this.invalidate(`user:${strId}`);

    // Invalidate tokens mapped to this user ID
    const tokens = this.userTokens.get(strId);
    if (tokens) {
      for (const tok of tokens) {
        this.invalidate(`auth:${tok}`);
      }
      this.userTokens.delete(strId);
    }

    // Invalidate any cache entries where user data matches
    for (const [k, val] of Array.from(this.cache.entries())) {
      const u = val?.data?.user || val?.data;
      if (u && (u.id === strId || (u.email && u.email.toLowerCase() === strId.toLowerCase()))) {
        this.cache.delete(k);
      }
    }

    // Trigger registered listeners (e.g. auth userStatusCache)
    for (const listener of this.userInvalidateListeners) {
      try {
        listener(strId);
      } catch (_) {}
    }
  }

  clear() {
    this.cache.clear();
    this.inFlight.clear();
    this.fetchCounts.clear();
    this.userTokens.clear();
  }

  getFetchCount(key) {
    return this.fetchCounts.get(key) || 0;
  }
}

export const supabaseCache = new SupabaseCacheManager();
