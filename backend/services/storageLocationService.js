import { formatRfcTableOptions } from './sapRfcClient.js';
import { runSearchRfc } from './searchRfcClient.js';
import { parseRfcRows } from './materialSearchService.js';

/**
 * In-memory storage location cache per serverId and plant.
 * Format: Map<cacheKey, { entries: Array, cachedAt: number, expiresAt: number }>
 * TTL: 1 hour
 */
const storageLocationCache = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;
const ROW_LIMIT = 500;

/**
 * Sanitizes search query:
 * Allows letters, digits, spaces, -, _, ., /, *; truncates to max 20 chars.
 */
export function sanitizeStorageLocationQuery(q) {
  if (typeof q !== 'string') return '';
  const cleaned = q.replace(/[^a-zA-Z0-9\s\-_\.\/\*]/g, '').trim();
  return cleaned.slice(0, 20);
}

/**
 * Sanitizes plant code:
 * Up to 4 uppercase alphanumeric characters.
 */
export function sanitizePlantCode(plant) {
  if (typeof plant !== 'string') return '';
  return plant.replace(/[^a-zA-Z0-9]/g, '').trim().toUpperCase().slice(0, 4);
}

/**
 * Rich mock storage locations dataset for offline tests and mock mode
 */
export const MOCK_STORAGE_LOCATIONS = [
  // Plant 1010
  { werks: '1010', lgort: 'FG01', lgobe: 'Finished Goods' },
  { werks: '1010', lgort: 'JW01', lgobe: 'Job Work Outward' },
  { werks: '1010', lgort: 'MN01', lgobe: 'Manesar Store co' },
  { werks: '1010', lgort: 'PR01', lgobe: 'Production Store' },
  { werks: '1010', lgort: 'PR50', lgobe: 'Sole Store' },
  { werks: '1010', lgort: 'PR55', lgobe: 'Strap/Uppr Store' },
  { werks: '1010', lgort: 'RE01', lgobe: 'Rejection Store' },
  { werks: '1010', lgort: 'RM01', lgobe: 'Raw Material' },
  { werks: '1010', lgort: 'SD01', lgobe: 'Scrap Disposal' },
  { werks: '1010', lgort: 'SP01', lgobe: 'Sample Stock of' },
  { werks: '1010', lgort: 'SR01', lgobe: 'Scrap Recycleabl' },
  { werks: '1010', lgort: 'ST01', lgobe: 'Main Store' },
  { werks: '1010', lgort: 'ST03', lgobe: 'WMS Store' },

  // Plant 1001
  { werks: '1001', lgort: 'FG01', lgobe: 'Finished Goods' },
  { werks: '1001', lgort: 'RM01', lgobe: 'Raw Material' },
  { werks: '1001', lgort: 'ST01', lgobe: 'Main Store' },

  // Plant 1000
  { werks: '1000', lgort: '0001', lgobe: 'General Storage' },
  { werks: '1000', lgort: '0002', lgobe: 'Shipping Area' },
  { werks: '1000', lgort: 'ST01', lgobe: 'Central Depot' },

  // Plant 1710
  { werks: '1710', lgort: '171A', lgobe: 'Standard Storage' },
  { werks: '1710', lgort: '171B', lgobe: 'Assembly SLoc' }
];

/**
 * Clears the storage location cache (for unit testing)
 */
export function clearStorageLocationCache() {
  storageLocationCache.clear();
}

/**
 * Fetches storage locations from SAP T001L or in-memory cache.
 *
 * @param {Object} options
 * @param {Object} options.server - SAP server configuration
 * @param {string} [options.plant] - Optional plant filter (WERKS)
 * @param {string} [options.q] - Optional text search query
 * @param {boolean} [options.refresh=false] - Force cache bypass
 * @param {AbortSignal} [options.signal] - Cancellation signal
 * @param {number} [options.timeoutMs] - RFC timeout
 */
export async function getStorageLocations({
  server,
  plant = '',
  q = '',
  refresh = false,
  signal,
  timeoutMs
} = {}) {
  const serverId = server?.id || server?.ashost || 'mock_server';
  const cleanPlant = sanitizePlantCode(plant);
  const cleanQ = sanitizeStorageLocationQuery(q);
  const shouldRefresh = refresh === true || refresh === 'true';

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  const cacheKey = `${serverId}:${cleanPlant || 'ALL'}`;
  const now = Date.now();

  let cachedEntry = storageLocationCache.get(cacheKey);
  let rawEntries = [];
  let isCached = false;

  if (!shouldRefresh && cachedEntry && now < cachedEntry.expiresAt) {
    rawEntries = cachedEntry.entries;
    isCached = true;
  } else {
    if (isMock) {
      if (cleanPlant) {
        rawEntries = MOCK_STORAGE_LOCATIONS.filter((s) => s.werks === cleanPlant);
      } else {
        rawEntries = [...MOCK_STORAGE_LOCATIONS];
      }
    } else {
      rawEntries = await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
        const options = [];
        if (cleanPlant) {
          options.push({ TEXT: `WERKS = '${cleanPlant}'` });
        }

        const res = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'T001L',
          DELIMITER: '|',
          OPTIONS: options,
          FIELDS: [
            { FIELDNAME: 'WERKS' },
            { FIELDNAME: 'LGORT' },
            { FIELDNAME: 'LGOBE' }
          ],
          DATA: [],
          ROWCOUNT: ROW_LIMIT
        });

        const rows = parseRfcRows(res);
        return rows
          .map((r) => ({
            werks: (r.WERKS || '').trim().toUpperCase(),
            lgort: (r.LGORT || '').trim().toUpperCase(),
            lgobe: (r.LGOBE || '').trim()
          }))
          .filter((r) => Boolean(r.werks && r.lgort));
      });
    }

    storageLocationCache.set(cacheKey, {
      entries: rawEntries,
      cachedAt: now,
      expiresAt: now + ONE_HOUR_MS
    });
  }

  // Client-side / In-memory text filtering across WERKS, LGORT, LGOBE
  let filtered = rawEntries;
  if (cleanQ) {
    const terms = cleanQ.toLowerCase().replace(/\*/g, '').split(/\s+/).filter(Boolean);
    if (terms.length > 0) {
      filtered = rawEntries.filter((item) => {
        const werks = (item.werks || '').toLowerCase();
        const lgort = (item.lgort || '').toLowerCase();
        const lgobe = (item.lgobe || '').toLowerCase();
        return terms.every((t) => werks.includes(t) || lgort.includes(t) || lgobe.includes(t));
      });
    }
  }

  const limitReached = rawEntries.length >= ROW_LIMIT;

  return {
    success: true,
    data: filtered,
    count: filtered.length,
    totalFetched: rawEntries.length,
    plant: cleanPlant || null,
    limitReached,
    cached: isCached
  };
}
