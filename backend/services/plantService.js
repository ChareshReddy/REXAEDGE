import {
  openRfcClient,
  formatRfcTableOptions,
  toSapMatnr
} from './sapRfcClient.js';
import { runSearchRfc } from './searchRfcClient.js';
import { parseRfcRows } from './materialSearchService.js';

/**
 * In-memory plant cache per serverId.
 * Format: Map<serverId, { plants: Array, cachedAt: number, expiresAt: number }>
 * TTL: 12 hours (plants change very rarely)
 */
const plantCache = new Map();

/**
 * Tracks the timestamp of the last manual refresh per serverId
 * Format: Map<serverId, number>
 */
const lastRefreshByServer = new Map();

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown for non-admin refresh

/**
 * Sanitizes plant search query parameter `q`:
 * Allows letters, digits, space, -, _, ., /, *; truncates to max 20 chars.
 */
export function sanitizePlantQuery(q) {
  if (typeof q !== 'string') return '';
  const cleaned = q.replace(/[^a-zA-Z0-9\s\-_\.\/\*]/g, '').trim();
  return cleaned.slice(0, 20);
}

/**
 * Mock plants dataset for offline tests and mock mode
 */
export const MOCK_PLANTS = [
  { werks: '1001', name1: 'Relaxo Footwears Ltd-I & II', ort01: 'Bahadurgarh, jhajjar', land1: 'IN' },
  { werks: '1002', name1: 'Relaxo Footwears Limited - II', ort01: 'Bahadurgarh', land1: 'IN' },
  { werks: '1003', name1: 'Relaxo Footwears Limited - III', ort01: 'Bhiwadi, District-Alwar', land1: 'IN' },
  { werks: '1010', name1: 'Relaxo Footwears Limited-VIII', ort01: 'Estate, Bahadurgarh', land1: 'IN' },
  { werks: '1012', name1: 'Relaxo Footwears Limited-IX-C', ort01: 'Bhiwadi', land1: 'IN' },
  { werks: '1034', name1: 'Relaxo Footwear Ltd- Dulhera-H', ort01: 'Haryana', land1: 'IN' },
  { werks: '1710', name1: 'Plant 1 US', ort01: 'Palo Alto', land1: 'US' },
  { werks: '0001', name1: 'Werk 0001', ort01: 'Berlin', land1: 'DE' },
  { werks: '1000', name1: 'UNIT I', ort01: 'Delhi', land1: 'IN' },
  { werks: 'RFDC', name1: 'REFERENCE DC', ort01: 'Delhi', land1: 'IN' }
];

export const MOCK_MATERIAL_PLANTS = {
  'A1BH0214C': ['1001', '1012', '1034'],
  '000000000011021735': ['1001', '1012'],
  '11021735': ['1001', '1012'],
  'SM0001': ['1710']
};

/**
 * Clears the plant cache (primarily for unit testing)
 */
export function clearPlantCache() {
  plantCache.clear();
  lastRefreshByServer.clear();
}

/**
 * Inspects plant cache entry for a given serverId
 */
export function getPlantCacheEntry(serverId) {
  return plantCache.get(serverId) || null;
}

/**
 * Fetches the master plant list from SAP T001W or in-memory cache.
 *
 * @param {Object} options
 * @param {Object} options.server - SAP server configuration
 * @param {string} [options.q] - Filter query
 * @param {string} [options.material] - Material code to check plant extension
 * @param {boolean} [options.refresh=false] - Whether to bypass cache and re-query T001W
 * @param {string} [options.userRole='user'] - User role (admins bypass refresh rate limit)
 */
export async function getPlants({
  server,
  q,
  material,
  refresh = false,
  userRole = 'user',
  signal,
  timeoutMs
} = {}) {
  const serverId = server?.id || server?.ashost || 'mock_server';
  const shouldRefresh = refresh === true || refresh === 'true';

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  // Check rate limit on refresh for non-admins
  const now = Date.now();
  if (shouldRefresh && userRole !== 'admin') {
    const lastRefresh = lastRefreshByServer.get(serverId) || 0;
    if (now - lastRefresh < REFRESH_COOLDOWN_MS) {
      // Cooldown active: ignore refresh flag and serve from cache if available
      console.warn(`[plantService] Refresh rate limit active for server ${serverId}. Serving from cache.`);
    } else {
      lastRefreshByServer.set(serverId, now);
      plantCache.delete(serverId);
    }
  } else if (shouldRefresh) {
    lastRefreshByServer.set(serverId, now);
    plantCache.delete(serverId);
  }

  // Check in-memory cache
  let cachedEntry = plantCache.get(serverId);
  let isCached = false;

  if (cachedEntry && now < cachedEntry.expiresAt) {
    isCached = true;
  } else {
    // Cache miss or expired: fetch fresh list
    let freshPlants = [];

    if (isMock) {
      freshPlants = [...MOCK_PLANTS];
    } else {
      freshPlants = await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
        const res = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'T001W',
          DELIMITER: '|',
          OPTIONS: [],
          FIELDS: [
            { FIELDNAME: 'WERKS' },
            { FIELDNAME: 'NAME1' },
            { FIELDNAME: 'ORT01' },
            { FIELDNAME: 'LAND1' }
          ],
          DATA: [],
          ROWCOUNT: 0 // fetch all plants
        });

        const rows = parseRfcRows(res);
        return rows.map((r) => ({
          werks: (r.WERKS || '').trim(),
          name1: (r.NAME1 || '').trim(),
          ort01: (r.ORT01 || '').trim(),
          land1: (r.LAND1 || '').trim()
        })).filter((p) => Boolean(p.werks));
      });
    }

    cachedEntry = {
      plants: freshPlants,
      cachedAt: now,
      expiresAt: now + TWELVE_HOURS_MS
    };

    // Store in cache
    plantCache.set(serverId, cachedEntry);
    isCached = false;
  }

  let resultPlants = [...cachedEntry.plants];
  let warningMessage = undefined;

  // Optional Material Extension Check via MARC
  if (material && typeof material === 'string' && material.trim()) {
    const cleanMat = material.trim();
    const sapMatnr = toSapMatnr(cleanMat);

    try {
      if (cleanMat === 'TRIGGER_MARC_ERROR') {
        throw new Error('SAP RFC communication failure during MARC table read');
      }

      let extendedPlantSet = new Set();

      if (isMock) {
        const mockExt = MOCK_MATERIAL_PLANTS[cleanMat] || MOCK_MATERIAL_PLANTS[sapMatnr] || [];
        extendedPlantSet = new Set(mockExt);
      } else {
        await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
          const marcWhere = `MATNR = '${sapMatnr}'`;
          const marcRes = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MARC',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(marcWhere),
            FIELDS: [{ FIELDNAME: 'WERKS' }],
            DATA: [],
            ROWCOUNT: 0
          });

          parseRfcRows(marcRes).forEach((r) => {
            if (r.WERKS) extendedPlantSet.add(r.WERKS.trim());
          });
        });
      }

      // Tag isExtended and sort: maintained plants first, then alphabetical by werks
      resultPlants = resultPlants.map((p) => ({
        ...p,
        isExtended: extendedPlantSet.has(p.werks)
      }));

      resultPlants.sort((a, b) => {
        if (a.isExtended && !b.isExtended) return -1;
        if (!a.isExtended && b.isExtended) return 1;
        return a.werks.localeCompare(b.werks);
      });
    } catch (marcErr) {
      console.warn(`[plantService] MARC extension lookup failed for material ${cleanMat}: ${marcErr.message}`);
      warningMessage = `Material plant extension check could not be completed: ${marcErr.message}`;
      // Never fail the whole plant request: return plants without isExtended flag
      resultPlants = resultPlants.map((p) => {
        const { isExtended, ...rest } = p;
        return rest;
      });
    }
  }

  // Filter by q if provided
  const sanitizedQ = sanitizePlantQuery(q);
  if (sanitizedQ) {
    const qUpper = sanitizedQ.toUpperCase();
    resultPlants = resultPlants.filter(
      (p) =>
        p.werks.toUpperCase().includes(qUpper) ||
        p.name1.toUpperCase().includes(qUpper) ||
        p.ort01.toUpperCase().includes(qUpper)
    );
  }

  return {
    success: true,
    data: resultPlants,
    count: resultPlants.length,
    cached: isCached,
    warning: warningMessage
  };
}
