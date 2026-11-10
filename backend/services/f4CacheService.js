/**
 * ============================================================================
 * F4 / VALUE HELP CACHE SERVICE (STAGE 5)
 * ============================================================================
 * Features:
 * - Server-isolated in-memory cache keyed by serverId + lookupType + query + paging
 * - Configurable TTLs: 10m for plants, storage locations, BOM usages; 60s for material search
 * - Strict LRU eviction capped at 500 total entries
 * - In-flight promise coalescing (10 users opening same popup = 1 RFC call)
 * - Never caches errors or empty/failed responses
 * - Admin clear cache & telemetry stats
 * ============================================================================
 */

export const F4_TTL = Object.freeze({
  PLANTS: 10 * 60 * 1000,          // 10 minutes
  STORAGE_LOCATIONS: 10 * 60 * 1000, // 10 minutes
  BOM_USAGES: 10 * 60 * 1000,       // 10 minutes
  MATERIALS: 60 * 1000              // 60 seconds
});

export const MAX_CACHE_ENTRIES = 500;

class F4CacheService {
  constructor(maxEntries = MAX_CACHE_ENTRIES) {
    this.cache = new Map(); // key -> { data, expiresAt, serverId, lookupType }
    this.pending = new Map(); // key -> Promise
    this.maxEntries = maxEntries;
    this.stats = {
      hits: 0,
      misses: 0,
      coalesced: 0,
      clears: 0
    };
  }

  _buildKey({ serverId, lookupType, query = '', paging = '' }) {
    const sId = String(serverId || 'default').trim();
    const lType = String(lookupType || 'general').trim().toLowerCase();
    const q = String(query || '').trim().toLowerCase();
    const p = String(paging || '').trim().toLowerCase();
    return `${sId}:${lType}:${q}:${p}`;
  }

  _resolveTtl(lookupType) {
    const t = String(lookupType || '').toLowerCase();
    if (t.includes('plant')) return F4_TTL.PLANTS;
    if (t.includes('storage')) return F4_TTL.STORAGE_LOCATIONS;
    if (t.includes('usage')) return F4_TTL.BOM_USAGES;
    if (t.includes('material')) return F4_TTL.MATERIALS;
    return 60 * 1000;
  }

  /**
   * Fetches data with LRU cache and in-flight request coalescing.
   */
  async fetchWithCache({ serverId, lookupType, query = '', paging = '', fetchFn, ttlMs = null }) {
    const key = this._buildKey({ serverId, lookupType, query, paging });
    const now = Date.now();

    // 1. Check cache hit
    const cached = this.cache.get(key);
    if (cached) {
      if (now < cached.expiresAt) {
        this.stats.hits++;
        // Refresh LRU order (delete and re-insert)
        this.cache.delete(key);
        this.cache.set(key, cached);
        return cached.data;
      }
      // Expired entry
      this.cache.delete(key);
    }

    this.stats.misses++;

    // 2. Check in-flight request coalescing
    if (this.pending.has(key)) {
      this.stats.coalesced++;
      return this.pending.get(key);
    }

    // 3. Execute fetch with single in-flight promise
    const promise = (async () => {
      try {
        const data = await fetchFn();

        // Validate result: do NOT cache errors, null/undefined, or explicit failure objects
        const isValid =
          data !== null &&
          data !== undefined &&
          data.error !== true &&
          data.success !== false;

        if (isValid) {
          const effectiveTtl = ttlMs !== null ? ttlMs : this._resolveTtl(lookupType);

          if (effectiveTtl > 0) {
            // LRU eviction if full
            if (this.cache.size >= this.maxEntries) {
              const oldestKey = this.cache.keys().next().value;
              if (oldestKey) this.cache.delete(oldestKey);
            }

            this.cache.set(key, {
              data,
              expiresAt: Date.now() + effectiveTtl,
              serverId: String(serverId || 'default'),
              lookupType: String(lookupType || 'general')
            });
          }
        }

        return data;
      } finally {
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, promise);
    return promise;
  }

  clear(serverId = null) {
    if (!serverId) {
      this.cache.clear();
      this.stats.clears++;
      return;
    }
    const sId = String(serverId).trim();
    for (const [key, val] of this.cache.entries()) {
      if (val.serverId === sId || key.startsWith(`${sId}:`)) {
        this.cache.delete(key);
      }
    }
    this.stats.clears++;
  }

  getStats() {
    const byType = {};
    for (const entry of this.cache.values()) {
      byType[entry.lookupType] = (byType[entry.lookupType] || 0) + 1;
    }

    return {
      total_entries: this.cache.size,
      max_entries: this.maxEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      coalesced_requests: this.stats.coalesced,
      clears: this.stats.clears,
      by_type: byType
    };
  }
}

export const f4CacheService = new F4CacheService();
