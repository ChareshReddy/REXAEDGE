import { formatRfcTableOptions } from './sapRfcClient.js';
import { runSearchRfc } from './searchRfcClient.js';
import { parseRfcRows } from './materialSearchService.js';

/**
 * In-memory BOM Usage cache per serverId and language.
 * Format: Map<cacheKey, { entries: Array, cachedAt: number, expiresAt: number }>
 * TTL: 1 hour
 */
const bomUsageCache = new Map();

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Rich mock BOM usages dataset matching SAP standard T416 and T416T entries
 */
export const MOCK_BOM_USAGES = [
  { stlan: '1', pmpfe: '+', pmpko: '.', pmpin: '-', pmper: '.', pmpka: '.', pmprv: '-', antxt: 'Production' },
  { stlan: '2', pmpfe: '.', pmpko: '+', pmpin: '-', pmper: '.', pmpka: '.', pmprv: '-', antxt: 'Engineering/Design' },
  { stlan: '3', pmpfe: '.', pmpko: '.', pmpin: '-', pmper: '.', pmpka: '.', pmprv: '.', antxt: 'Universal' },
  { stlan: '4', pmpfe: '-', pmpko: '-', pmpin: '+', pmper: '.', pmpka: '.', pmprv: '-', antxt: 'Plant Maintenance' },
  { stlan: '5', pmpfe: '.', pmpko: '.', pmpin: '-', pmper: '.', pmpka: '.', pmprv: '+', antxt: 'Sales and Distribution' },
  { stlan: '6', pmpfe: '.', pmpko: '.', pmpin: '-', pmper: '.', pmpka: '+', pmprv: '.', antxt: 'Costing' },
  { stlan: '7', pmpfe: '.', pmpko: '-', pmpin: '-', pmper: '-', pmpka: '.', pmprv: '.', antxt: 'Empties' },
  { stlan: '8', pmpfe: '-', pmpko: '.', pmpin: '-', pmper: '-', pmpka: '-', pmprv: '-', antxt: 'Stability Study' },
  { stlan: 'B', pmpfe: '.', pmpko: '.', pmpin: '-', pmper: '.', pmpka: '.', pmprv: '+', antxt: 'Sales Bundles (IS-HT-SW)' },
  { stlan: 'C', pmpfe: '-', pmpko: '-', pmpin: '+', pmper: '.', pmpka: '.', pmprv: '-', antxt: 'Configuration Control' },
  { stlan: 'M', pmpfe: '.', pmpko: '.', pmpin: '.', pmper: '.', pmpka: '.', pmprv: '.', antxt: 'External Munitions Display' },
  { stlan: 'U', pmpfe: '.', pmpko: '-', pmpin: '.', pmper: '-', pmpka: '-', pmprv: '-', antxt: 'IUID Embedded Items' }
];

/**
 * Clears the BOM usage cache (for unit testing)
 */
export function clearBomUsageCache() {
  bomUsageCache.clear();
}

/**
 * Sanitizes language input to single SAP internal char (e.g. 'EN' -> 'E', 'DE' -> 'D')
 */
export function sanitizeSapLanguage(lang = 'EN') {
  if (typeof lang !== 'string') return 'E';
  const clean = lang.trim().toUpperCase();
  if (clean === 'EN' || clean === 'E') return 'E';
  if (clean === 'DE' || clean === 'D') return 'D';
  if (clean === 'FR' || clean === 'F') return 'F';
  if (clean === 'ES' || clean === 'S') return 'S';
  return clean.slice(0, 1) || 'E';
}

/**
 * Fetches BOM Usage definitions from SAP T416 (relevancy flags) and T416T (usage texts).
 * - Caches result in-memory for 1 hour per server and language
 * - Protected by searchRfcClient concurrency limiter and timeout
 * - Resilient fallback: if T416 cannot be read, still returns Usage and Text from T416T
 */
export async function getBomUsages({
  server,
  lang = 'EN',
  refresh = false,
  signal,
  timeoutMs
} = {}) {
  const serverId = server?.id || server?.ashost || 'mock_server';
  const sapLang = sanitizeSapLanguage(lang || server?.lang);
  const shouldRefresh = refresh === true || refresh === 'true';

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  const cacheKey = `${serverId}:${sapLang}`;
  const now = Date.now();

  let cachedEntry = bomUsageCache.get(cacheKey);
  let rawEntries = [];
  let isCached = false;
  let missingWarning = null;

  if (!shouldRefresh && cachedEntry && now < cachedEntry.expiresAt) {
    rawEntries = cachedEntry.entries;
    isCached = true;
  } else {
    if (isMock) {
      rawEntries = [...MOCK_BOM_USAGES];
    } else {
      rawEntries = await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
        let t416Rows = [];
        let t416tRows = [];

        // 1. Read T416 (Usage keys and relevancy flags)
        try {
          const res416 = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'T416',
            DELIMITER: '|',
            OPTIONS: [],
            FIELDS: [
              { FIELDNAME: 'STLAN' },
              { FIELDNAME: 'PMPFE' }, // Production
              { FIELDNAME: 'PMPKO' }, // Engineering/Design
              { FIELDNAME: 'PMPIN' }, // Plant Maintenance
              { FIELDNAME: 'PMPER' }, // Spare Parts
              { FIELDNAME: 'PMPKA' }, // Costing
              { FIELDNAME: 'PMPRV' }  // Sales & Distribution
            ],
            DATA: [],
            ROWCOUNT: 100
          });
          t416Rows = parseRfcRows(res416);
        } catch (err416) {
          console.warn('[bomUsageService] Could not read T416:', err416.message);
          missingWarning = `Table T416 (relevancy indicators) could not be read: ${err416.message}`;
        }

        // 2. Read T416T (Usage texts in requested language)
        try {
          const res416T = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'T416T',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(`SPRAS = '${sapLang}'`),
            FIELDS: [
              { FIELDNAME: 'STLAN' },
              { FIELDNAME: 'ANTXT' }
            ],
            DATA: [],
            ROWCOUNT: 100
          });
          t416tRows = parseRfcRows(res416T);
        } catch (err416T) {
          console.warn('[bomUsageService] Could not read T416T:', err416T.message);
          if (!missingWarning) {
            missingWarning = `Table T416T (usage texts) could not be read: ${err416T.message}`;
          }
        }

        // Build text lookup map: STLAN -> ANTXT
        const textMap = new Map();
        for (const row of t416tRows) {
          const key = (row.STLAN || '').trim().toUpperCase();
          if (key) textMap.set(key, (row.ANTXT || '').trim());
        }

        // If T416 succeeded, merge with texts
        if (t416Rows.length > 0) {
          return t416Rows.map((r) => {
            const stlan = (r.STLAN || '').trim().toUpperCase();
            return {
              stlan,
              pmpfe: (r.PMPFE || '.').trim() || '.',
              pmpko: (r.PMPKO || '.').trim() || '.',
              pmpin: (r.PMPIN || '.').trim() || '.',
              pmper: (r.PMPER || '.').trim() || '.',
              pmpka: (r.PMPKA || '.').trim() || '.',
              pmprv: (r.PMPRV || '.').trim() || '.',
              antxt: textMap.get(stlan) || ''
            };
          }).filter((item) => Boolean(item.stlan));
        }

        // Fallback: If T416 failed but T416T succeeded, return Usage and Text with default '.' symbols
        if (t416tRows.length > 0) {
          return t416tRows.map((r) => {
            const stlan = (r.STLAN || '').trim().toUpperCase();
            return {
              stlan,
              pmpfe: '.',
              pmpko: '.',
              pmpin: '.',
              pmper: '.',
              pmpka: '.',
              pmprv: '.',
              antxt: (r.ANTXT || '').trim()
            };
          }).filter((item) => Boolean(item.stlan));
        }

        return [];
      });
    }

    bomUsageCache.set(cacheKey, {
      entries: rawEntries,
      cachedAt: now,
      expiresAt: now + ONE_HOUR_MS
    });
  }

  return {
    success: true,
    data: rawEntries,
    count: rawEntries.length,
    cached: isCached,
    warning: missingWarning
  };
}
