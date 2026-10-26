import {
  openRfcClient,
  formatRfcTableOptions,
  toSapMatnr
} from './sapRfcClient.js';
import { runSearchRfc } from './searchRfcClient.js';

/**
 * Parses RFC_READ_TABLE result DATA rows dynamically according to FIELDS mapping
 */
export function parseRfcRows(res) {
  const fieldNames = (res.FIELDS || []).map((f) => f.FIELDNAME.trim());
  return (res.DATA || []).map((r) => {
    const parts = r.WA.split('|');
    const row = {};
    fieldNames.forEach((name, idx) => {
      row[name] = parts[idx]?.trim() || '';
    });
    return row;
  });
}

/**
 * Trims leading zeros from numeric SAP material numbers for clean display.
 * Alphanumeric materials remain unchanged.
 */
export function fromSapMatnr(val) {
  if (!val) return '';
  const str = String(val).trim();
  if (/^0+\d+$/.test(str)) {
    return str.replace(/^0+/, '');
  }
  return str;
}

/**
 * Sanitizes material search query:
 * - Allows only letters, digits, space, -, _, ., /, and *
 * - Max length 40 characters
 * - Strips everything else (specifically single quotes and SQL delimiters)
 */
export function sanitizeSearchQuery(query) {
  if (typeof query !== 'string') return '';
  const trimmed = query.trim().slice(0, 40);
  return trimmed.replace(/[^a-zA-Z0-9\s\-_\.\/\*]/g, '').trim();
}

/**
 * In-Memory LRU Cache with per-entry TTL
 */
export class MaterialLruCache {
  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value, ttlMs) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs
    });
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

export const materialSearchCache = new MaterialLruCache(500);

// In-Memory T141T Status text cache per server (persists across searches within 30 min)
const statusTextCache = new Map();

/**
 * Mock dataset for deterministic testing and mock mode execution
 */
export const MOCK_MATERIALS = [
  {
    matnr: 'A1BH0214C',
    maktx: 'BAHAMAS 214',
    mtart: 'HALB',
    meins: 'PAA',
    mstae: '',
    mmsta: '',
    statusText: '',
    lvorm: '',
    plants: ['1001', '1012', '1034'],
    hasBom: true
  },
  {
    matnr: '11021735',
    maktx: 'INK EVA SCREEN PRINTING BLUE',
    mtart: 'ROH',
    meins: 'KG',
    mstae: '',
    mmsta: '',
    statusText: '',
    lvorm: '',
    plants: ['1001', '1012'],
    hasBom: false
  },
  {
    matnr: 'SM0001',
    maktx: 'Service Material 01',
    mtart: 'SERV',
    meins: 'H',
    mstae: '01',
    mmsta: '01',
    statusText: 'Design',
    lvorm: '',
    plants: ['1710'],
    hasBom: false
  },
  {
    matnr: 'TG0001',
    maktx: 'Trading Good for Consumption',
    mtart: 'MAT',
    meins: 'ST',
    mstae: '',
    mmsta: '',
    statusText: '',
    lvorm: '',
    plants: ['1710'],
    hasBom: false
  },
  {
    matnr: '13000340',
    maktx: 'AIR FILTER (AF-100)',
    mtart: 'ROH',
    meins: 'PC',
    mstae: '',
    mmsta: '',
    statusText: '',
    lvorm: '',
    plants: ['1001'],
    hasBom: false
  },
  {
    matnr: '13000291',
    maktx: 'AIR CLEANER FILTER CARTRIDG',
    mtart: 'ROH',
    meins: 'PC',
    mstae: '',
    mmsta: '',
    statusText: '',
    lvorm: '',
    plants: ['1001'],
    hasBom: false
  },
  {
    matnr: 'MAT_OBSOLETE_01',
    maktx: 'Obsolete Steel Flange',
    mtart: 'ROH',
    meins: 'PC',
    mstae: '05',
    mmsta: '05',
    statusText: 'Obsolete',
    lvorm: 'X',
    plants: ['1001', '1010'],
    hasBom: false
  }
];

/**
 * Searches materials in Mock Mode
 */
function searchMockMaterials({ query, plant, limit, mtart, checkBom }) {
  const qUpper = query.toUpperCase();
  const tokens = qUpper.split(/\s+/).filter(Boolean);
  const isNum = /^\d+$/.test(query);

  let matches = MOCK_MATERIALS.filter((m) => {
    // Number match or description match
    let matchesText = false;
    if (isNum) {
      matchesText = m.matnr.includes(query) || m.matnr === query;
    } else {
      matchesText =
        tokens.every((tok) => m.maktx.toUpperCase().includes(tok)) ||
        m.matnr.toUpperCase().includes(qUpper);
    }
    if (!matchesText) return false;

    // Plant filter
    if (plant && !m.plants.includes(String(plant).trim())) {
      return false;
    }

    // MTART filter
    if (mtart) {
      const allowedTypes = mtart.toUpperCase().split(',').map((t) => t.trim());
      if (!allowedTypes.includes(m.mtart.toUpperCase())) {
        return false;
      }
    }

    return true;
  });

  matches = matches.slice(0, limit);

  return matches.map((m) => ({
    matnr: fromSapMatnr(m.matnr),
    maktx: m.maktx,
    mtart: m.mtart,
    meins: m.meins,
    mstae: m.mstae,
    mmsta: m.mmsta,
    statusText: m.statusText,
    lvorm: m.lvorm,
    hasBom: checkBom ? Boolean(m.hasBom) : undefined,
    extendedInPlant: plant ? m.plants.includes(String(plant).trim()) : false
  }));
}

/**
 * Retrieves material detail in Mock Mode
 */
function getMockMaterialDetail({ matnr, plant, bomUsage = '1' }) {
  const clean = sanitizeSearchQuery(matnr);
  const found = MOCK_MATERIALS.find(
    (m) => m.matnr === clean || fromSapMatnr(m.matnr) === clean
  );
  if (!found) {
    const notFoundErr = new Error(`Material ${clean} not found in SAP.`);
    notFoundErr.status = 404;
    throw notFoundErr;
  }

  const extendedInPlant = plant ? found.plants.includes(String(plant).trim()) : false;

  return {
    matnr: fromSapMatnr(found.matnr),
    maktx: found.maktx,
    mtart: found.mtart,
    meins: found.meins,
    mstae: found.mstae,
    mmsta: found.mmsta,
    statusText: found.statusText,
    lvorm: found.lvorm,
    hasBom: Boolean(found.hasBom),
    extendedInPlant,
    plants: found.plants
  };
}

/**
 * Chunks array into smaller batches
 */
function chunkArray(arr, size = 20) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Fetches status text descriptions from T141T using RFC_READ_TABLE.
 * Caches descriptions per server.
 */
async function loadStatusTexts(client, serverId) {
  const cacheKey = `status_texts_${serverId || 'default'}`;
  const cached = statusTextCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.map;
  }

  try {
    const res = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'T141T',
      DELIMITER: '|',
      OPTIONS: formatRfcTableOptions("SPRAS = 'E'"),
      FIELDS: [{ FIELDNAME: 'MMSTA' }, { FIELDNAME: 'MTSTB' }],
      DATA: []
    });

    const statusMap = {};
    parseRfcRows(res).forEach((r) => {
      if (r.MMSTA) {
        statusMap[r.MMSTA] = r.MTSTB;
      }
    });

    statusTextCache.set(cacheKey, {
      map: statusMap,
      expiresAt: Date.now() + 30 * 60 * 1000 // 30 min
    });

    return statusMap;
  } catch (err) {
    console.warn(`[materialSearchService] Could not read T141T: ${err.message}`);
    return {};
  }
}

/**
 * Searches SAP materials via RFC_READ_TABLE on MAKT, enriched via MARA, MARC, T141T, and MAST.
 *
 * @param {Object} params
 * @param {string} params.query - Search query string (min 2 chars)
 * @param {string} [params.plant] - Plant filter (e.g. 1001)
 * @param {number} [params.limit=20] - Max rows (1-50)
 * @param {string} [params.mtart] - Comma-separated material types (e.g. FERT,HALB)
 * @param {boolean} [params.checkBom=false] - Check whether BOM exists in MAST
 * @param {string} [params.bomUsage='1'] - BOM Usage (default 1)
 * @param {Object} [params.server] - Target SAP server configuration
 */
export async function searchMaterials({
  query,
  plant,
  limit = 20,
  mtart,
  checkBom = false,
  bomUsage = '1',
  mode,
  server,
  signal,
  timeoutMs
}) {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery || sanitizedQuery.length < 2) {
    const badInputErr = new Error('Search query must be at least 2 characters.');
    badInputErr.status = 400;
    throw badInputErr;
  }

  const cleanLimit = Math.max(1, Math.min(Number(limit) || 20, 50));
  const cleanPlant = plant ? String(plant).trim().toUpperCase() : '';
  const cleanUsage = String(bomUsage || '1').trim();
  const shouldCheckBom = checkBom === true || checkBom === 'true';

  const serverId = server?.id || server?.ashost || 'mock_server';
  const flags = `limit=${cleanLimit}&mtart=${mtart || ''}&checkBom=${shouldCheckBom}&usage=${cleanUsage}&mode=${mode || ''}`;
  const cacheKey = `${serverId}:${cleanPlant}:${sanitizedQuery}:${flags}`;

  // Check In-Memory LRU Cache
  const cachedResult = materialSearchCache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  if (isMock) {
    const mockRes = searchMockMaterials({
      query: sanitizedQuery,
      plant: cleanPlant,
      limit: cleanLimit,
      mtart,
      checkBom: shouldCheckBom
    });
    // Cache for 60s
    materialSearchCache.set(cacheKey, mockRes, 60 * 1000);
    return mockRes;
  }

  return await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
    // 1. Build MAKT search WHERE clause based on mode and query shape
    const isNum = /^\d+$/.test(sanitizedQuery);
    const hasDigits = /\d/.test(sanitizedQuery);
    const isPrefixMode =
      mode === 'prefix' ||
      (mode !== 'description' &&
        (isNum || (hasDigits && !/\s/.test(sanitizedQuery) && sanitizedQuery.length <= 18)));

    let maktWhere = "SPRAS = 'E'";

    if (isNum) {
      const padded = toSapMatnr(sanitizedQuery);
      // Key prefix search: uses primary index on MATNR
      maktWhere += ` AND ( MATNR = '${padded}' OR MATNR LIKE '${sanitizedQuery}%' )`;
    } else if (isPrefixMode) {
      // Key prefix search for material codes: uses index on MATNR
      const prefixTerm = sanitizedQuery.toUpperCase().replace(/\*/g, '%');
      maktWhere += ` AND ( MATNR LIKE '${prefixTerm}%' )`;
    } else {
      // Description words search
      const tokens = sanitizedQuery.toUpperCase().split(/\s+/).filter(Boolean);
      const descClause = tokens
        .map((tok) => `MAKTG LIKE '%${tok.replace(/\*/g, '%')}%'`)
        .join(' AND ');
      maktWhere += ` AND ( ${descClause} )`;
    }

    // If plant is specified, fetch up to 3x limit to allow MARC filtering
    const maktFetchLimit = cleanPlant ? Math.min(cleanLimit * 3, 100) : cleanLimit;

    const maktRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MAKT',
      DELIMITER: '|',
      OPTIONS: formatRfcTableOptions(maktWhere),
      FIELDS: [
        { FIELDNAME: 'MATNR' },
        { FIELDNAME: 'MAKTX' },
        { FIELDNAME: 'MAKTG' }
      ],
      DATA: [],
      ROWCOUNT: maktFetchLimit
    });

    const maktRows = parseRfcRows(maktRes).map((r) => ({
      matnr: r.MATNR,
      maktx: r.MAKTX,
      maktg: r.MAKTG
    })).filter((r) => Boolean(r.matnr));

    if (maktRows.length === 0) {
      materialSearchCache.set(cacheKey, [], 60 * 1000);
      return [];
    }

    let candidateMatnrs = [...new Set(maktRows.map((r) => r.matnr))];

    // Cap candidate pool before parallel queries (up to cleanLimit * 2 if filtering by plant, else cleanLimit)
    const initialPool = candidateMatnrs.slice(0, cleanPlant ? Math.min(cleanLimit * 2, 60) : cleanLimit);

    if (initialPool.length === 0) {
      materialSearchCache.set(cacheKey, [], 60 * 1000);
      return [];
    }

    // 2. Parallel Enrichment: MARA, MARC (if plant), MAST (if checkBom), and T141T on the same RFC connection
    const matChunks = chunkArray(initialPool, 20);

    // (a) MARA task
    const maraTask = Promise.all(
      matChunks.map((chunk) => {
        const maraWhere = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
        return client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MTART' },
            { FIELDNAME: 'MEINS' },
            { FIELDNAME: 'MSTAE' },
            { FIELDNAME: 'LVORM' }
          ],
          DATA: []
        });
      })
    );

    // (b) MARC task (if plant restriction specified)
    const marcTask = cleanPlant
      ? Promise.all(
          matChunks.map((chunk) => {
            const matClause = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
            const marcWhere = `WERKS = '${cleanPlant}' AND ( ${matClause} )`;
            return client.call('RFC_READ_TABLE', {
              QUERY_TABLE: 'MARC',
              DELIMITER: '|',
              OPTIONS: formatRfcTableOptions(marcWhere),
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'MMSTA' },
                { FIELDNAME: 'MMSTD' },
                { FIELDNAME: 'LVORM' }
              ],
              DATA: []
            });
          })
        )
      : Promise.resolve([]);

    // (c) MAST task (if BOM check requested)
    const mastTask = shouldCheckBom
      ? Promise.all(
          matChunks.map((chunk) => {
            const matClause = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
            const mastWhere = cleanPlant
              ? `WERKS = '${cleanPlant}' AND STLAN = '${cleanUsage}' AND ( ${matClause} )`
              : `STLAN = '${cleanUsage}' AND ( ${matClause} )`;
            return client.call('RFC_READ_TABLE', {
              QUERY_TABLE: 'MAST',
              DELIMITER: '|',
              OPTIONS: formatRfcTableOptions(mastWhere),
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' }
              ],
              DATA: []
            });
          })
        )
      : Promise.resolve([]);

    // (d) T141T task
    const statusTask = loadStatusTexts(client, serverId);

    // Execute independent enrichment queries in parallel
    const [maraResponses, marcResponses, mastResponses, statusMap] = await Promise.all([
      maraTask,
      marcTask,
      mastTask,
      statusTask
    ]);

    // Parse MARA records
    const maraByMatnr = new Map();
    maraResponses.forEach((res) => {
      parseRfcRows(res).forEach((r) => {
        if (r.MATNR) {
          maraByMatnr.set(r.MATNR, {
            mtart: r.MTART,
            meins: r.MEINS,
            mstae: r.MSTAE,
            lvorm: r.LVORM
          });
        }
      });
    });

    // Parse MARC records
    const marcByMatnr = new Map();
    const validPlantMatnrs = new Set();
    marcResponses.forEach((res) => {
      parseRfcRows(res).forEach((r) => {
        if (r.MATNR) {
          validPlantMatnrs.add(r.MATNR);
          marcByMatnr.set(r.MATNR, {
            werks: r.WERKS,
            mmsta: r.MMSTA,
            mmstd: r.MMSTD,
            lvorm: r.LVORM
          });
        }
      });
    });

    // Parse MAST BOM records
    const bomExistsSet = new Set();
    mastResponses.forEach((res) => {
      parseRfcRows(res).forEach((r) => {
        if (r.MATNR) {
          bomExistsSet.add(r.MATNR);
        }
      });
    });

    // Filter by plant if cleanPlant was specified
    let finalCandidates = cleanPlant
      ? initialPool.filter((m) => validPlantMatnrs.has(m))
      : initialPool;

    // Filter by MTART if requested
    if (mtart) {
      const allowedTypes = mtart.toUpperCase().split(',').map((t) => t.trim()).filter(Boolean);
      finalCandidates = finalCandidates.filter((m) => {
        const mara = maraByMatnr.get(m);
        return mara && allowedTypes.includes(mara.mtart.toUpperCase());
      });
    }

    // Limit final candidates to cleanLimit
    finalCandidates = finalCandidates.slice(0, cleanLimit);

    if (finalCandidates.length === 0) {
      materialSearchCache.set(cacheKey, [], 60 * 1000);
      return [];
    }

    // Build final response objects
    const results = finalCandidates.map((m) => {
      const makt = maktRows.find((r) => r.matnr === m) || {};
      const mara = maraByMatnr.get(m) || {};
      const marc = marcByMatnr.get(m);

      const mmsta = marc?.mmsta || '';
      const mstae = mara.mstae || '';
      const statusText = (mmsta && statusMap[mmsta]) || (mstae && statusMap[mstae]) || '';
      const lvorm = mara.lvorm || marc?.lvorm || '';

      return {
        matnr: fromSapMatnr(m),
        maktx: makt.maktx || '',
        mtart: mara.mtart || '',
        meins: mara.meins || '',
        mstae,
        mmsta,
        statusText,
        lvorm,
        hasBom: shouldCheckBom ? bomExistsSet.has(m) : undefined,
        extendedInPlant: cleanPlant ? Boolean(marc) : false
      };
    });

    // Cache TTL: 60s if includes status or hasBom, 5 min (300s) for plain description lookup
    const hasStatusOrBom = shouldCheckBom || Boolean(cleanPlant);
    const ttlMs = hasStatusOrBom ? 60 * 1000 : 5 * 60 * 1000;
    materialSearchCache.set(cacheKey, results, ttlMs);

    return results;
  });
}

/**
 * Retrieves detailed material information for a single material number.
 *
 * @param {Object} params
 * @param {string} params.matnr - Material number
 * @param {string} [params.plant] - Plant code
 * @param {string} [params.bomUsage='1'] - BOM Usage
 * @param {Object} [params.server] - Target SAP server
 */
export async function getMaterialDetail({
  matnr,
  plant,
  bomUsage = '1',
  server,
  signal,
  timeoutMs
}) {
  const sanitized = sanitizeSearchQuery(matnr);
  if (!sanitized) {
    const badErr = new Error('Material number is required.');
    badErr.status = 400;
    throw badErr;
  }

  const cleanPlant = plant ? String(plant).trim().toUpperCase() : '';
  const cleanUsage = String(bomUsage || '1').trim();
  const serverId = server?.id || server?.ashost || 'mock_server';

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  if (isMock) {
    return getMockMaterialDetail({
      matnr: sanitized,
      plant: cleanPlant,
      bomUsage: cleanUsage
    });
  }

  return await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
    const sapMat = toSapMatnr(sanitized);

    const mastWhere = cleanPlant
      ? `MATNR = '${sapMat}' AND WERKS = '${cleanPlant}' AND STLAN = '${cleanUsage}'`
      : `MATNR = '${sapMat}' AND STLAN = '${cleanUsage}'`;

    // Execute MARA, MAKT, MARC, MAST, and T141T concurrently on the same connection
    const [maraRes, maktRes, marcRes, mastRes, statusMap] = await Promise.all([
      client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MARA',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(`MATNR = '${sapMat}'`),
        FIELDS: [
          { FIELDNAME: 'MATNR' },
          { FIELDNAME: 'MTART' },
          { FIELDNAME: 'MATKL' },
          { FIELDNAME: 'MEINS' },
          { FIELDNAME: 'MSTAE' },
          { FIELDNAME: 'LVORM' }
        ],
        DATA: [],
        ROWCOUNT: 1
      }),
      client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAKT',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(`MATNR = '${sapMat}' AND SPRAS = 'E'`),
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTX' }, { FIELDNAME: 'MAKTG' }],
        DATA: [],
        ROWCOUNT: 1
      }),
      client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MARC',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(`MATNR = '${sapMat}'`),
        FIELDS: [
          { FIELDNAME: 'MATNR' },
          { FIELDNAME: 'WERKS' },
          { FIELDNAME: 'MMSTA' },
          { FIELDNAME: 'MMSTD' },
          { FIELDNAME: 'LVORM' }
        ],
        DATA: []
      }),
      client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'MAST',
        DELIMITER: '|',
        OPTIONS: formatRfcTableOptions(mastWhere),
        FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }],
        DATA: [],
        ROWCOUNT: 1
      }),
      loadStatusTexts(client, serverId)
    ]);

    const maraRows = parseRfcRows(maraRes);
    if (maraRows.length === 0) {
      const notFound = new Error(`Material ${sanitized} not found in SAP.`);
      notFound.status = 404;
      throw notFound;
    }

    const maraData = {
      matnr: maraRows[0].MATNR,
      mtart: maraRows[0].MTART,
      matkl: maraRows[0].MATKL,
      meins: maraRows[0].MEINS,
      mstae: maraRows[0].MSTAE,
      lvorm: maraRows[0].LVORM
    };

    const maktRows = parseRfcRows(maktRes);
    const maktx = maktRows[0]?.MAKTX || '';

    const marcRows = parseRfcRows(marcRes).map((r) => ({
      werks: r.WERKS,
      mmsta: r.MMSTA,
      mmstd: r.MMSTD,
      lvorm: r.LVORM
    }));

    const plantsExtended = marcRows.map((r) => r.werks).filter(Boolean);
    const plantMarc = cleanPlant ? marcRows.find((r) => r.werks === cleanPlant) : null;
    const extendedInPlant = cleanPlant ? Boolean(plantMarc) : false;

    const mmsta = plantMarc?.mmsta || '';
    const mstae = maraData.mstae || '';
    const statusText = (mmsta && statusMap[mmsta]) || (mstae && statusMap[mstae]) || '';
    const lvorm = maraData.lvorm || plantMarc?.lvorm || '';
    const hasBom = (mastRes.DATA || []).length > 0;

    return {
      matnr: fromSapMatnr(maraData.matnr),
      maktx,
      mtart: maraData.mtart,
      matkl: maraData.matkl,
      meins: maraData.meins,
      mstae,
      mmsta,
      statusText,
      lvorm,
      hasBom,
      extendedInPlant,
      plants: plantsExtended
    };
  });
}
