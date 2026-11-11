import { getMaterialDetail, getPlants } from './api';
import { validateField } from '@shared/fieldRules.js';

// In-memory cache for existence checks:
// Key: `${serverId}:${kind}:${cleanValue}` -> { valid: boolean, error: string | null, neutralHint?: string }
const validationCache = new Map();

// In-flight promises to avoid duplicate requests (coalescing)
const inFlightRequests = new Map();

// Plants catalog promise cache per server
const plantsPromiseCache = new Map();

export function getActiveServerId() {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('selected_server_id') || 'default';
  }
  return 'default';
}

/**
 * Clears cached validation results for a specific server or all servers.
 */
export function clearValidationCache(serverId) {
  if (!serverId) {
    validationCache.clear();
    inFlightRequests.clear();
    plantsPromiseCache.clear();
    return;
  }
  for (const key of validationCache.keys()) {
    if (key.startsWith(`${serverId}:`)) {
      validationCache.delete(key);
    }
  }
  for (const key of inFlightRequests.keys()) {
    if (key.startsWith(`${serverId}:`)) {
      inFlightRequests.delete(key);
    }
  }
  plantsPromiseCache.delete(serverId);
}

// Automatically clear validation cache when the SAP server is changed
if (typeof window !== 'undefined') {
  window.addEventListener('sap-server-changed', (e) => {
    const sid = e.detail?.serverId;
    clearValidationCache(sid);
  });
}

/**
 * Determines if an error from SAP is transient/busy/unavailable/timeout.
 * In these cases, we must NOT show "not valid".
 */
export function isSapBusyOrUnavailable(err) {
  if (!err) return false;
  const status = err.response?.status;
  const code = err.response?.data?.code || err.code;
  const msg = (err.response?.data?.message || err.message || '').toLowerCase();

  if (status === 503 || status === 504) return true;
  if ([
    'SERVER_BUSY',
    'SERVER_UNAVAILABLE',
    'TIMEOUT',
    'SAP_UNREACHABLE',
    'SAP_COMMUNICATION_FAILURE'
  ].includes(code)) {
    return true;
  }
  if (
    msg.includes('busy') ||
    msg.includes('timeout') ||
    msg.includes('unreachable') ||
    msg.includes('circuit breaker')
  ) {
    return true;
  }
  if (err.code === 'ECONNABORTED' || msg.includes('network error')) {
    return true;
  }
  return false;
}

/**
 * Instant format validation check using shared fieldRules.js.
 * Returns { valid: boolean, error: string | null }
 */
export function validateFieldFormat(fieldKey, value, isRequired = false) {
  return validateField(fieldKey, value, isRequired);
}

/**
 * Asynchronously checks existence against SAP read-only lookups.
 * Safe against server busy / timeout, incorporates coalescing and per-server caching.
 *
 * @param {object} params
 * @param {'material'|'component'|'plant'} params.kind
 * @param {string} params.value
 * @param {string} [params.plant]
 * @param {string} [params.serverId]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ valid: boolean, error: string | null, neutralHint?: string }>}
 */
export async function checkFieldExistence({ kind, value, plant, serverId, signal }) {
  const cleanVal = String(value || '').trim().toUpperCase();
  if (!cleanVal) {
    return { valid: true, error: null };
  }

  const currentServerId = serverId || getActiveServerId();
  const cacheKey = `${currentServerId}:${kind}:${cleanVal}`;

  if (validationCache.has(cacheKey)) {
    return validationCache.get(cacheKey);
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const checkPromise = (async () => {
    try {
      if (kind === 'material' || kind === 'component') {
        try {
          const detail = await getMaterialDetail(
            cleanVal,
            { plant: plant ? String(plant).trim().toUpperCase() : undefined },
            { signal }
          );
          const matData = detail?.data || detail;
          const meins = matData?.meins || matData?.MEINS || matData?.baseUnit || '';
          const res = { valid: true, error: null, detail: matData, meins };
          validationCache.set(cacheKey, res);
          return res;
        } catch (err) {
          if (signal?.aborted) return { valid: true, error: null, meins: '' };
          if (isSapBusyOrUnavailable(err)) {
            // Safety: If SAP is busy/unreachable/timeout, do NOT show "not valid"
            return { valid: true, error: null, neutralHint: 'Could not verify now', meins: '' };
          }
          if (
            err.response?.status === 404 ||
            err.response?.data?.code === 'NOT_FOUND' ||
            err.message?.toLowerCase().includes('not found')
          ) {
            const res = { valid: false, error: 'Material not valid', meins: '' };
            validationCache.set(cacheKey, res);
            return res;
          }
          // Default fallback for failed existence check
          const res = { valid: false, error: 'Material not valid', meins: '' };
          validationCache.set(cacheKey, res);
          return res;
        }
      } else if (kind === 'plant') {
        try {
          let plants = [];
          if (!plantsPromiseCache.has(currentServerId)) {
            const pPromise = getPlants({}, { signal })
              .then((res) => res?.data || [])
              .catch((e) => {
                plantsPromiseCache.delete(currentServerId);
                throw e;
              });
            plantsPromiseCache.set(currentServerId, pPromise);
          }
          plants = await plantsPromiseCache.get(currentServerId);

          const found = Array.isArray(plants) && plants.some(
            (p) => String(p.werks || '').trim().toUpperCase() === cleanVal
          );
          if (found) {
            const res = { valid: true, error: null };
            validationCache.set(cacheKey, res);
            return res;
          } else {
            const res = { valid: false, error: 'Plant not valid' };
            validationCache.set(cacheKey, res);
            return res;
          }
        } catch (err) {
          if (signal?.aborted) return { valid: true, error: null };
          if (isSapBusyOrUnavailable(err)) {
            return { valid: true, error: null, neutralHint: 'Could not verify now' };
          }
          const res = { valid: false, error: 'Plant not valid' };
          validationCache.set(cacheKey, res);
          return res;
        }
      }

      return { valid: true, error: null };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, checkPromise);
  return checkPromise;
}
