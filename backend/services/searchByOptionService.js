import {
  formatRfcTableOptions,
  toSapMatnr
} from './sapRfcClient.js';
import { runSearchRfc } from './searchRfcClient.js';
import {
  parseRfcRows,
  fromSapMatnr,
  materialSearchCache,
  MOCK_MATERIALS
} from './materialSearchService.js';
import { SAP_SEARCH_OPTIONS, getSearchOption } from '../config/searchHelpOptions.js';

// Safety thresholds
const DEFAULT_LIMIT = 500;
const MAX_SAFETY_LIMIT = 2000;
const ABSOLUTE_MAX_LIMIT = 5000;

export function isDescriptionField(fieldId) {
  if (!fieldId) return false;
  const upper = String(fieldId).toUpperCase();
  return (
    upper === 'MAKTG' ||
    upper === 'MAKTX' ||
    upper === 'TEXT_HTN' ||
    upper === 'MAKTG_ORG_ART' ||
    upper === 'MAKTG_FOLUP_ART' ||
    upper === 'WGBEZ' ||
    upper === 'VTEXT' ||
    upper.includes('DESC') ||
    upper.includes('TEXT')
  );
}

/**
 * Sanitizes input values for RFC_READ_TABLE WHERE options:

 * - Allows alphanumeric, spaces, '-', '_', '.', '/', '*', '?'
 * - Max length capped per field
 * - Explicitly strips single quotes, semicolons, and SQL delimiters
 */
export function sanitizeOptionValue(val, maxLen = 40) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().slice(0, maxLen);
  // Strip SQL comment delimiters and quote sequences
  str = str.replace(/--+/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return str.replace(/[^a-zA-Z0-9\s\-_\.\/\*\?]/g, '').trim();
}

/**
 * Converts SAP language code (e.g. 'EN' -> 'E', 'DE' -> 'D')
 */
export function normalizeSapLanguage(lang) {
  const clean = sanitizeOptionValue(lang, 2).toUpperCase();
  if (!clean || clean === 'EN' || clean === 'E') return 'E';
  if (clean === 'DE' || clean === 'D') return 'D';
  if (clean === 'FR' || clean === 'F') return 'F';
  if (clean === 'ES' || clean === 'S') return 'S';
  return clean.slice(0, 1);
}

/**
 * Converts SAP wildcard input (* and ?) into RFC_READ_TABLE SQL WHERE clause
 */
export function formatFieldClause(fieldName, userVal, isNumericKey = false) {
  const clean = sanitizeOptionValue(userVal);
  if (!clean) return '';

  const hasWildcard = clean.includes('*') || clean.includes('?');

  if (hasWildcard) {
    const sqlPattern = clean.replace(/\*/g, '%').replace(/\?/g, '_');
    return `${fieldName} LIKE '${sqlPattern}'`;
  }

  if (fieldName === 'MAKTG' || fieldName === 'MAKTX' || fieldName === 'TEXT_HTN') {
    return `${fieldName} LIKE '%${clean}%'`;
  }

  if (isNumericKey && /^\d+$/.test(clean)) {
    const padded = toSapMatnr(clean);
    return `( ${fieldName} = '${padded}' OR ${fieldName} = '${clean}' )`;
  }

  return `${fieldName} = '${clean}'`;
}

/**
 * Executes a search using a specific search help tab option
 */
export async function searchMaterialsByOption({
  tab,
  fields = {},
  maxRows = DEFAULT_LIMIT,
  noRestriction = false,
  server,
  signal,
  timeoutMs
}) {
  const option = getSearchOption(tab);
  if (!option) {
    const notFoundErr = new Error(`Unknown search help tab: ${tab}`);
    notFoundErr.status = 400;
    throw notFoundErr;
  }

  if (!option.available) {
    return {
      success: false,
      available: false,
      tab: option.key,
      name: option.name,
      data: [],
      count: 0,
      limit: 0,
      limitReached: false,
      error: option.unavailableReason || `${option.name} is not available on this system.`
    };
  }

  // 1. Sanitize all field values according to tab schema
  const cleanFields = {};
  let filledFieldCount = 0;
  for (const f of option.fields || []) {
    const rawVal = fields[f.id] ?? fields[f.id.toLowerCase()];
    let cleanVal = sanitizeOptionValue(rawVal, f.length || 40);
    if (!isDescriptionField(f.id) && cleanVal) {
      cleanVal = cleanVal.toUpperCase();
    }
    cleanFields[f.id] = cleanVal;
    if (cleanVal && !(f.id === 'SPRAS' && (cleanVal === 'EN' || cleanVal === 'E'))) {
      filledFieldCount++;
    }
  }

  // 2. Compute effective row limit and check broad search guard
  const reqLimit = Number(maxRows);
  const effectiveLimit = noRestriction
    ? MAX_SAFETY_LIMIT
    : Math.min(Math.max(1, reqLimit || DEFAULT_LIMIT), ABSOLUTE_MAX_LIMIT);

  // Broad search check (e.g. empty or pure "*" with no restriction)
  const isPureWildcardSearch =
    filledFieldCount === 0 ||
    Object.values(cleanFields).every((v) => !v || v === '*' || v === '%');

  if (noRestriction && isPureWildcardSearch) {
    const broadErr = new Error(
      'Search criteria too broad. Please provide at least one filter term or specify a maximum number of entries.'
    );
    broadErr.status = 400;
    throw broadErr;
  }

  const serverId = server?.id || server?.ashost || 'mock_server';
  const fieldKey = Object.entries(cleanFields)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const cacheKey = `shlp:${serverId}:${option.key}:${fieldKey}:${effectiveLimit}:${noRestriction}`;

  // Check LRU Cache
  const cached = materialSearchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const isMock =
    process.env.USE_MOCK_SAP === 'true' ||
    process.env.NODE_ENV === 'test' ||
    server?.is_mock ||
    server?.system_type === 'MOCK' ||
    !server?.ashost;

  if (isMock) {
    const mockResults = filterMockByOption(option.key, cleanFields, effectiveLimit);
    const resultPayload = {
      success: true,
      available: true,
      tab: option.key,
      name: option.name,
      data: mockResults,
      count: mockResults.length,
      limit: effectiveLimit,
      limitReached: mockResults.length >= effectiveLimit,
      message:
        mockResults.length >= effectiveLimit
          ? `Maximum number of entries reached (${effectiveLimit}). Refine your search criteria if needed.`
          : null
    };
    materialSearchCache.set(cacheKey, resultPayload, 60 * 1000);
    return resultPayload;
  }

  // Live SAP RFC execution with protection pool
  return await runSearchRfc({ server, signal, timeoutMs }, async (client) => {
    let candidateMatnrs = [];
    let tabBRecords = null;
    const maktMap = new Map();
    const maraMap = new Map();
    const languageKey = normalizeSapLanguage(cleanFields.SPRAS || 'EN');
    const descClause = cleanFields.MAKTG
      ? formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase())
      : '';

    // Dispatch table query per tab
    switch (option.key) {
      case 'M': {
        // MAKT: MATNR, MAKTG, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (descClause) {
          clauses.push(descClause);
        }
        const maktWhere = clauses.join(' AND ');
        const maktRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MAKT',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maktWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTX' }, { FIELDNAME: 'MAKTG' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maktRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'A': {
        // MARA: BISMT, MATNR
        const clauses = [];
        if (cleanFields.BISMT) {
          clauses.push(formatFieldClause('BISMT', cleanFields.BISMT));
        } else {
          clauses.push("BISMT NE ''");
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const maraWhere = clauses.join(' AND ');
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'BISMT' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maraRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'B': {
        // MAST: MATNR, WERKS, STLAN, STLAL
        const clauses = [];
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR.toUpperCase(), true));
        }
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.STLAN) {
          clauses.push(formatFieldClause('STLAN', cleanFields.STLAN.toUpperCase()));
        }
        const mastWhere = clauses.length > 0 ? clauses.join(' AND ') : '';
        const mastRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MAST',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(mastWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'WERKS' },
            { FIELDNAME: 'STLAN' },
            { FIELDNAME: 'STLAL' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const mastRows = parseRfcRows(mastRes);
        tabBRecords = mastRows;
        candidateMatnrs = mastRows.map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'L': {
        // MARA: MATKL, MATNR
        const clauses = [];
        if (cleanFields.MATKL) {
          clauses.push(formatFieldClause('MATKL', cleanFields.MATKL.toUpperCase()));
        } else {
          clauses.push("MATKL NE ''");
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const maraWhere = clauses.join(' AND ');
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MATKL' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maraRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'T': {
        // MARA: MTART, MATNR
        const clauses = [];
        if (cleanFields.MTART) {
          clauses.push(formatFieldClause('MTART', cleanFields.MTART.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const maraWhere = clauses.join(' AND ');
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maraRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'P': {
        // MARA: PRDHA, MATNR
        const clauses = [];
        if (cleanFields.PRDHA) {
          clauses.push(formatFieldClause('PRDHA', cleanFields.PRDHA.toUpperCase()));
        } else {
          clauses.push("PRDHA NE ''");
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const maraWhere = clauses.join(' AND ');
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'PRDHA' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maraRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'N': {
        // MEAN: EAN11, MEINH, MATNR
        const clauses = [];
        if (cleanFields.EAN11) {
          clauses.push(formatFieldClause('EAN11', cleanFields.EAN11));
        } else {
          clauses.push("EAN11 NE ''");
        }
        if (cleanFields.MEINH) {
          clauses.push(formatFieldClause('MEINH', cleanFields.MEINH.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const meanWhere = clauses.join(' AND ');
        const meanRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MEAN',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(meanWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'EAN11' }, { FIELDNAME: 'MEINH' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = [...new Set(parseRfcRows(meanRes).map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'I': {
        // EINA: IDNLF, LIFNR, MATNR
        const clauses = [];
        if (cleanFields.IDNLF) {
          clauses.push(formatFieldClause('IDNLF', cleanFields.IDNLF));
        } else {
          clauses.push("IDNLF NE ''");
        }
        if (cleanFields.LIFNR) {
          clauses.push(formatFieldClause('LIFNR', cleanFields.LIFNR, true));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const einaWhere = clauses.join(' AND ');
        const einaRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'EINA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(einaWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'IDNLF' }, { FIELDNAME: 'LIFNR' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = [...new Set(parseRfcRows(einaRes).map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'J': {
        // MARA: ATTYP, MATKL, MATNR
        const clauses = [];
        if (cleanFields.ATTYP) {
          clauses.push(formatFieldClause('ATTYP', cleanFields.ATTYP));
        } else {
          clauses.push("ATTYP NE ''");
        }
        if (cleanFields.MATKL) {
          clauses.push(formatFieldClause('MATKL', cleanFields.MATKL.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const maraWhere = clauses.join(' AND ');
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(maraWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'ATTYP' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(maraRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'W': {
        // M_MAT1W: WERKS, MATNR, MAKTG, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const wWhere = clauses.join(' AND ');
        const wRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1W',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(wWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'WERKS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(wRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'S': {
        // M_MAT1S: MAKTG, SPRAS, VKORG, VTWEG, MATNR
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.VKORG) {
          clauses.push(formatFieldClause('VKORG', cleanFields.VKORG.toUpperCase()));
        }
        if (cleanFields.VTWEG) {
          clauses.push(formatFieldClause('VTWEG', cleanFields.VTWEG.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const sWhere = clauses.join(' AND ');
        const sRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1S',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(sWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'VKORG' },
            { FIELDNAME: 'VTWEG' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(sRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'R': {
        // M_MAT1R: MAPL_WERKS, PLNTY, PLNNR, PLNAL, MATNR, MAKTG, SPRAS, DATUV
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('MAPL_WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.PLNTY) {
          clauses.push(formatFieldClause('PLNTY', cleanFields.PLNTY.toUpperCase()));
        }
        if (cleanFields.PLNNR) {
          clauses.push(formatFieldClause('PLNNR', cleanFields.PLNNR.toUpperCase()));
        }
        if (cleanFields.PLNAL) {
          clauses.push(formatFieldClause('PLNAL', cleanFields.PLNAL.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const rWhere = clauses.join(' AND ');
        const rRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1R',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(rWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'MAPL_WERKS' },
            { FIELDNAME: 'PLNTY' },
            { FIELDNAME: 'PLNNR' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(rRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'H': {
        // M_MAT1H: PRDHA, VKORG, VTWEG, MATNR, SPRAS, MAKTG
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.PRDHA) {
          clauses.push(formatFieldClause('PRDHA', cleanFields.PRDHA.toUpperCase()));
        }
        if (cleanFields.VKORG) {
          clauses.push(formatFieldClause('VKORG', cleanFields.VKORG.toUpperCase()));
        }
        if (cleanFields.VTWEG) {
          clauses.push(formatFieldClause('VTWEG', cleanFields.VTWEG.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const hWhere = clauses.join(' AND ');
        const hRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1H',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(hWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'PRDHA' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(hRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'V': {
        // M_MAT1V: PRVBE, MATNR, WERKS, MAKTG, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.PRVBE) {
          clauses.push(formatFieldClause('PRVBE', cleanFields.PRVBE.toUpperCase()));
        }
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const vWhere = clauses.join(' AND ');
        const vRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1V',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(vWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'PRVBE' },
            { FIELDNAME: 'WERKS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(vRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'C': {
        // M_MAT1C: MAKTG, SPRAS, MATNR
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const cWhere = clauses.join(' AND ');
        const cRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1C',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(cWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTG' }, { FIELDNAME: 'SPRAS' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(cRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'E': {
        // M_MAT1E: KUNNR, MAKTG, SPRAS, MATNR
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.KUNNR) {
          clauses.push(formatFieldClause('KUNNR', cleanFields.KUNNR.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const eWhere = clauses.join(' AND ');
        const eRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1E',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(eWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'KUNNR' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(eRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'F': {
        // M_MAT1F: MAKTG, FHM_FGRU1, FHM_FGRU2, SPRAS, MATNR, WERKS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.FHM_FGRU1) {
          clauses.push(formatFieldClause('FHM_FGRU1', cleanFields.FHM_FGRU1.toUpperCase()));
        }
        if (cleanFields.FHM_FGRU2) {
          clauses.push(formatFieldClause('FHM_FGRU2', cleanFields.FHM_FGRU2.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const fWhere = clauses.join(' AND ');
        const fRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1F',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(fWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'WERKS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(fRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'D': {
        // M_MAT1MPN (MAT6MPN - Inventory-Managed Material): MATNR_B, MATNR_HTN, MFRNR, MFRPN, TEXT_HTN, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.MATNR_B) {
          clauses.push(formatFieldClause('MATNR_B', cleanFields.MATNR_B, true));
        }
        if (cleanFields.MATNR_HTN) {
          clauses.push(formatFieldClause('MATNR_HTN', cleanFields.MATNR_HTN, true));
        }
        if (cleanFields.MFRNR) {
          clauses.push(formatFieldClause('MFRNR', cleanFields.MFRNR.toUpperCase()));
        }
        if (cleanFields.MFRPN) {
          clauses.push(formatFieldClause('MFRPN', cleanFields.MFRPN.toUpperCase()));
        }
        if (cleanFields.TEXT_HTN) {
          clauses.push(formatFieldClause('TEXT_HTN', cleanFields.TEXT_HTN.toUpperCase()));
        }
        const dWhere = clauses.join(' AND ');
        const dRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1MPN',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(dWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR_B' },
            { FIELDNAME: 'MATNR_HTN' },
            { FIELDNAME: 'MFRPN' },
            { FIELDNAME: 'TEXT_HTN' },
            { FIELDNAME: 'SPRAS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(dRes);
        rows.forEach((r) => {
          const mat = r.MATNR_B || r.MATNR_HTN;
          if (mat && r.TEXT_HTN) {
            maktMap.set(mat, { MATNR: mat, MAKTX: r.TEXT_HTN, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR_B || r.MATNR_HTN).filter(Boolean))];
        break;
      }

      case 'G': {
        // M_MAT1MPN (MAT1MPN - Manufacturer Part Number): MFRPN, MFRNR, TEXT_HTN, MATNR_HTN, MATNR_B, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.MFRPN) {
          clauses.push(formatFieldClause('MFRPN', cleanFields.MFRPN.toUpperCase()));
        }
        if (cleanFields.MFRNR) {
          clauses.push(formatFieldClause('MFRNR', cleanFields.MFRNR.toUpperCase()));
        }
        if (cleanFields.TEXT_HTN) {
          clauses.push(formatFieldClause('TEXT_HTN', cleanFields.TEXT_HTN.toUpperCase()));
        }
        if (cleanFields.MATNR_HTN) {
          clauses.push(formatFieldClause('MATNR_HTN', cleanFields.MATNR_HTN, true));
        }
        if (cleanFields.MATNR_B) {
          clauses.push(formatFieldClause('MATNR_B', cleanFields.MATNR_B, true));
        }
        const gWhere = clauses.join(' AND ');
        const gRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT1MPN',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(gWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR_HTN' },
            { FIELDNAME: 'MATNR_B' },
            { FIELDNAME: 'MFRPN' },
            { FIELDNAME: 'TEXT_HTN' },
            { FIELDNAME: 'SPRAS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(gRes);
        rows.forEach((r) => {
          const mat = r.MATNR_HTN || r.MATNR_B;
          if (mat && r.TEXT_HTN) {
            maktMap.set(mat, { MATNR: mat, MAKTX: r.TEXT_HTN, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR_HTN || r.MATNR_B).filter(Boolean))];
        break;
      }

      case 'GENERIC': {
        // MGW_GENERIC_VAR: SATNR, MATNR, MAKTG, MATKL, SPRAS, ATTYP
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.SATNR) {
          clauses.push(formatFieldClause('SATNR', cleanFields.SATNR.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MATKL) {
          clauses.push(formatFieldClause('MATKL', cleanFields.MATKL.toUpperCase()));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const genWhere = clauses.join(' AND ');
        const genRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MGW_GENERIC_VAR',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(genWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' },
            { FIELDNAME: 'SATNR' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(genRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'MPN':
      case 'FFF': {
        // If WERKS is specified, use view M_MAT2MPN (which has WERKS); otherwise use M_MAT1MPN
        const useMat2 = Boolean(cleanFields.WERKS);
        const queryTable = useMat2 ? 'M_MAT2MPN' : 'M_MAT1MPN';
        const clauses = useMat2 ? [] : [`SPRAS = '${languageKey}'`];
        if (cleanFields.WERKS && useMat2) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.MFRNR) {
          clauses.push(formatFieldClause('MFRNR', cleanFields.MFRNR.toUpperCase()));
        }
        if (cleanFields.MFRPN) {
          clauses.push(formatFieldClause('MFRPN', cleanFields.MFRPN.toUpperCase()));
        }
        if (cleanFields.TEXT_HTN && !useMat2) {
          clauses.push(formatFieldClause('TEXT_HTN', cleanFields.TEXT_HTN.toUpperCase()));
        }
        if (cleanFields.MATNR_HTN) {
          clauses.push(formatFieldClause('MATNR_HTN', cleanFields.MATNR_HTN, true));
        }
        if (cleanFields.MATNR_B) {
          clauses.push(formatFieldClause('MATNR_B', cleanFields.MATNR_B, true));
        }
        const mpnWhere = clauses.join(' AND ');
        const mpnFields = [{ FIELDNAME: 'MATNR_HTN' }, { FIELDNAME: 'MFRPN' }];
        if (!useMat2) {
          mpnFields.push({ FIELDNAME: 'TEXT_HTN' }, { FIELDNAME: 'SPRAS' });
        }
        const mpnRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: queryTable,
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(mpnWhere),
          FIELDS: mpnFields,
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(mpnRes);
        rows.forEach((r) => {
          const mat = r.MATNR_HTN;
          if (mat && r.TEXT_HTN) {
            maktMap.set(mat, { MATNR: mat, MAKTX: r.TEXT_HTN, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR_HTN).filter(Boolean))];
        break;
      }

      case 'SEGMENTATION': {
        // MARA: SGT_CSGR, SGT_COVSA, MATNR
        const clauses = [];
        if (cleanFields.SGT_CSGR) {
          clauses.push(formatFieldClause('SGT_CSGR', cleanFields.SGT_CSGR.toUpperCase()));
        } else {
          clauses.push("SGT_CSGR NE ''");
        }
        if (cleanFields.SGT_COVSA) {
          clauses.push(formatFieldClause('SGT_COVSA', cleanFields.SGT_COVSA.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const sgtWhere = clauses.join(' AND ');
        const sgtRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(sgtWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'SGT_CSGR' },
            { FIELDNAME: 'SGT_COVSA' },
            { FIELDNAME: 'MTART' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = parseRfcRows(sgtRes).map((r) => r.MATNR).filter(Boolean);
        break;
      }

      case 'FASHION': {
        // FSH_MG_MATNR_V: FSH_SEASON_YEAR, FSH_SEASON, FSH_COLLECTION, FSH_THEME, MATNR, MAKTG, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.FSH_SEASON_YEAR) {
          clauses.push(formatFieldClause('FSH_SEASON_YEAR', cleanFields.FSH_SEASON_YEAR));
        }
        if (cleanFields.FSH_SEASON) {
          clauses.push(formatFieldClause('FSH_SEASON', cleanFields.FSH_SEASON.toUpperCase()));
        }
        if (cleanFields.FSH_COLLECTION) {
          clauses.push(formatFieldClause('FSH_COLLECTION', cleanFields.FSH_COLLECTION.toUpperCase()));
        }
        if (cleanFields.FSH_THEME) {
          clauses.push(formatFieldClause('FSH_THEME', cleanFields.FSH_THEME.toUpperCase()));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MAKTG) {
          clauses.push(formatFieldClause('MAKTG', cleanFields.MAKTG.toUpperCase()));
        }
        const fshWhere = clauses.join(' AND ');
        const fshRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'FSH_MG_MATNR_V',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(fshWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'MAKTG' },
            { FIELDNAME: 'SPRAS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(fshRes);
        rows.forEach((r) => {
          if (r.MATNR && r.MAKTG) {
            maktMap.set(r.MATNR, { MATNR: r.MATNR, MAKTX: r.MAKTG, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'ORIGINAL':
      case 'FOLLOWUP': {
        // VWRF_ART_SHLP: ORIGINAL_ART_NR, FOLUP_ART_NR, FOLLOWUP_TYP_DE, MAKTG_ORG_ART, MAKTG_FOLUP_ART, SPRAS
        const clauses = [`SPRAS = '${languageKey}'`];
        if (cleanFields.ORIGINAL_ART_NR) {
          clauses.push(formatFieldClause('ORIGINAL_ART_NR', cleanFields.ORIGINAL_ART_NR, true));
        }
        if (cleanFields.FOLUP_ART_NR) {
          clauses.push(formatFieldClause('FOLUP_ART_NR', cleanFields.FOLUP_ART_NR, true));
        }
        if (cleanFields.FOLLOWUP_TYP_DE) {
          clauses.push(formatFieldClause('FOLLOWUP_TYP_DE', cleanFields.FOLLOWUP_TYP_DE.toUpperCase()));
        }
        if (cleanFields.MAKTG_ORG_ART) {
          clauses.push(formatFieldClause('MAKTG_ORG_ART', cleanFields.MAKTG_ORG_ART.toUpperCase()));
        }
        if (cleanFields.MAKTG_FOLUP_ART) {
          clauses.push(formatFieldClause('MAKTG_FOLUP_ART', cleanFields.MAKTG_FOLUP_ART.toUpperCase()));
        }
        const origWhere = clauses.join(' AND ');
        const origRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'VWRF_ART_SHLP',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(origWhere),
          FIELDS: [
            { FIELDNAME: 'ORIGINAL_ART_NR' },
            { FIELDNAME: 'FOLUP_ART_NR' },
            { FIELDNAME: 'MAKTG_ORG_ART' },
            { FIELDNAME: 'MAKTG_FOLUP_ART' },
            { FIELDNAME: 'SPRAS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(origRes);
        const mats = [];
        rows.forEach((r) => {
          const mat = option.key === 'FOLLOWUP' ? (r.FOLUP_ART_NR || r.ORIGINAL_ART_NR) : (r.ORIGINAL_ART_NR || r.FOLUP_ART_NR);
          const txt = option.key === 'FOLLOWUP' ? (r.MAKTG_FOLUP_ART || r.MAKTG_ORG_ART) : (r.MAKTG_ORG_ART || r.MAKTG_FOLUP_ART);
          if (mat) {
            mats.push(mat);
            if (txt) maktMap.set(mat, { MATNR: mat, MAKTX: txt, SPRAS: r.SPRAS || languageKey });
          }
        });
        candidateMatnrs = [...new Set(mats)];
        break;
      }

      case 'Z_INTER': {
        // V_PICPSRL: MATNR, WERKS, BERID, LMATN, MRPGR
        const clauses = [];
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.BERID) {
          clauses.push(formatFieldClause('BERID', cleanFields.BERID.toUpperCase()));
        }
        if (cleanFields.LMATN) {
          clauses.push(formatFieldClause('LMATN', cleanFields.LMATN, true));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        const picWhere = clauses.join(' AND ');
        const picRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'V_PICPSRL',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(picWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = [...new Set(parseRfcRows(picRes).map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      case 'U': {
        // M_MAT2MPN (MAT2MPN - Manufacturer Part Number with AMPL): WERKS, AMPSP, MFRNR, REVLV, MATNR_B, MFRPN, MATNR_HTN
        const clauses = [];
        if (cleanFields.WERKS) {
          clauses.push(formatFieldClause('WERKS', cleanFields.WERKS.toUpperCase()));
        }
        if (cleanFields.AMPSP) {
          clauses.push(formatFieldClause('AMPSP', cleanFields.AMPSP.toUpperCase()));
        }
        if (cleanFields.MFRNR) {
          clauses.push(formatFieldClause('MFRNR', cleanFields.MFRNR.toUpperCase()));
        }
        if (cleanFields.REVLV) {
          clauses.push(formatFieldClause('REVLV', cleanFields.REVLV.toUpperCase()));
        }
        if (cleanFields.MFRPN) {
          clauses.push(formatFieldClause('MFRPN', cleanFields.MFRPN.toUpperCase()));
        }
        if (cleanFields.MATNR_HTN) {
          clauses.push(formatFieldClause('MATNR_HTN', cleanFields.MATNR_HTN, true));
        }
        if (cleanFields.MATNR_B) {
          clauses.push(formatFieldClause('MATNR_B', cleanFields.MATNR_B, true));
        }
        const uWhere = clauses.join(' AND ');
        const uRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'M_MAT2MPN',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(uWhere),
          FIELDS: [
            { FIELDNAME: 'MATNR_HTN' },
            { FIELDNAME: 'MATNR_B' },
            { FIELDNAME: 'MFRPN' },
            { FIELDNAME: 'WERKS' }
          ],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        const rows = parseRfcRows(uRes);
        candidateMatnrs = [...new Set(rows.map((r) => r.MATNR_HTN || r.MATNR_B).filter(Boolean))];
        break;
      }

      case 'Z_EAN': {
        // MLEA: EAN11, LIFNR, MATNR, MEINH, LFEAN
        const clauses = [];
        if (cleanFields.EAN11) {
          clauses.push(formatFieldClause('EAN11', cleanFields.EAN11));
        }
        if (cleanFields.LIFNR) {
          clauses.push(formatFieldClause('LIFNR', cleanFields.LIFNR, true));
        }
        if (cleanFields.MATNR) {
          clauses.push(formatFieldClause('MATNR', cleanFields.MATNR, true));
        }
        if (cleanFields.MEINH) {
          clauses.push(formatFieldClause('MEINH', cleanFields.MEINH.toUpperCase()));
        }
        if (cleanFields.LFEAN) {
          clauses.push(formatFieldClause('LFEAN', cleanFields.LFEAN.toUpperCase()));
        }
        const mleaWhere = clauses.join(' AND ');
        const mleaRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MLEA',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(mleaWhere),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'EAN11' }, { FIELDNAME: 'LIFNR' }],
          DATA: [],
          ROWCOUNT: effectiveLimit
        });
        candidateMatnrs = [...new Set(parseRfcRows(mleaRes).map((r) => r.MATNR).filter(Boolean))];
        break;
      }

      default:
        break;
    }

    if (candidateMatnrs.length === 0) {
      const emptyPayload = {
        success: true,
        available: true,
        tab: option.key,
        name: option.name,
        data: [],
        count: 0,
        limit: effectiveLimit,
        limitReached: false,
        message: null
      };
      materialSearchCache.set(cacheKey, emptyPayload, 60 * 1000);
      return emptyPayload;
    }

    // Deduplicate candidate pool
    const uniqueMatnrs = [...new Set(candidateMatnrs)].slice(0, effectiveLimit);

    // Batch enrichment in chunks of 40 (drastically reduces sequential RFC roundtrips)
    const chunkSize = 40;
    const chunks = [];
    for (let i = 0; i < uniqueMatnrs.length; i += chunkSize) {
      chunks.push(uniqueMatnrs.slice(i, i + chunkSize));
    }

    // 1. Fetch MAKT descriptions sequentially for any candidates not already enriched by views
    for (const chunk of chunks) {
      const missingChunk = chunk.filter((m) => !maktMap.has(m));
      if (missingChunk.length === 0) continue;
      try {
        const maktOptions = [{ TEXT: `SPRAS = '${languageKey}' AND (` }];
        missingChunk.forEach((m, idx) => {
          const isLast = idx === missingChunk.length - 1;
          maktOptions.push({
            TEXT: `MATNR = '${toSapMatnr(m)}'${isLast ? ' )' : ' OR'}`
          });
        });
        if (descClause) {
          maktOptions.push({ TEXT: `AND ${descClause}` });
        }
        const res = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MAKT',
          DELIMITER: '|',
          OPTIONS: maktOptions,
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTX' }, { FIELDNAME: 'SPRAS' }],
          DATA: [],
          ROWCOUNT: missingChunk.length
        });
        parseRfcRows(res).forEach((r) => maktMap.set(r.MATNR, r));
      } catch (e) {
        console.warn('[searchByOption] MAKT enrichment error:', e.message);
      }
    }

    // 2. Fetch MARA details sequentially (if not Tab M where MARA wasn't primary, or for tabs needing MTART)
    for (const chunk of chunks) {
      try {
        const maraOptions = [{ TEXT: '(' }];
        chunk.forEach((m, idx) => {
          const isLast = idx === chunk.length - 1;
          maraOptions.push({
            TEXT: `MATNR = '${toSapMatnr(m)}'${isLast ? ' )' : ' OR'}`
          });
        });
        const res = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: maraOptions,
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MTART' }],
          DATA: [],
          ROWCOUNT: chunk.length
        });
        parseRfcRows(res).forEach((r) => maraMap.set(r.MATNR, r));
      } catch (e) {
        console.warn('[searchByOption] MARA enrichment error:', e.message);
      }
    }

    // Assemble final output matching the exact results popup shape
    const finalData = [];
    if (option.key === 'B' && tabBRecords && tabBRecords.length > 0) {
      for (const rec of tabBRecords.slice(0, effectiveLimit)) {
        const rawMat = rec.MATNR;
        const makt = maktMap.get(rawMat);
        if (descClause && !makt) {
          continue;
        }
        const mara = maraMap.get(rawMat);
        finalData.push({
          matnr: fromSapMatnr(rawMat),
          rawMatnr: rawMat,
          stlal: rec.STLAL || '01',
          werks: rec.WERKS || cleanFields.WERKS || '',
          stlan: rec.STLAN || cleanFields.STLAN || '',
          maktx: makt?.MAKTX || '',
          mtart: mara?.MTART || '',
          spras: makt?.SPRAS || languageKey,
          hasBom: true
        });
      }
    } else {
      for (const rawMat of uniqueMatnrs) {
        const makt = maktMap.get(rawMat);
        // If user provided description filter, skip items that don't match MAKT
        if (descClause && !makt) {
          continue;
        }
        const mara = maraMap.get(rawMat);
        finalData.push({
          matnr: fromSapMatnr(rawMat),
          rawMatnr: rawMat,
          maktx: makt?.MAKTX || '',
          mtart: mara?.MTART || '',
          spras: makt?.SPRAS || languageKey,
          hasBom: option.key === 'B' ? true : false
        });
      }
    }

    const isLimitHit = finalData.length >= effectiveLimit;
    const responsePayload = {
      success: true,
      available: true,
      tab: option.key,
      name: option.name,
      data: finalData,
      count: finalData.length,
      limit: effectiveLimit,
      limitReached: isLimitHit,
      message: isLimitHit
        ? `Maximum number of entries reached (${effectiveLimit}). Refine your search criteria if your item is not listed.`
        : null
    };

    materialSearchCache.set(cacheKey, responsePayload, 60 * 1000);
    return responsePayload;
  });
}

/**
 * In-memory mock search filter for automated test runs and mock mode
 */
function filterMockByOption(tabKey, fields, limit) {
  // Enhanced mock dataset with various fields
  const mockExtended = [
    {
      matnr: 'A1BH0214C',
      stlal: '01',
      bismt: 'OLD-A1BH',
      mtart: 'FERT',
      matkl: 'F1SX',
      prdha: 'PROD-FTW',
      ean11: '8905495000010',
      idnlf: 'VEND-A1BH',
      lifnr: '0000451688',
      attyp: '00',
      werks: '1001',
      stlan: '1',
      hasBom: true,
      maktx: 'Relaxo Sparx Footwear 0214C Alt 1',
      spras: 'EN'
    },
    {
      matnr: 'A1BH0214C',
      stlal: '02',
      bismt: 'OLD-A1BH',
      mtart: 'FERT',
      matkl: 'F1SX',
      prdha: 'PROD-FTW',
      ean11: '8905495000011',
      idnlf: 'VEND-A1BH',
      lifnr: '0000451688',
      attyp: '00',
      werks: '1001',
      stlan: '1',
      hasBom: true,
      maktx: 'Relaxo Sparx Footwear 0214C Alt 2',
      spras: 'EN'
    },
    {
      matnr: 'A1BH0214C',
      stlal: '03',
      bismt: 'OLD-A1BH',
      mtart: 'FERT',
      matkl: 'F1SX',
      prdha: 'PROD-FTW',
      ean11: '8905495000012',
      idnlf: 'VEND-A1BH',
      lifnr: '0000451688',
      attyp: '00',
      werks: '1001',
      stlan: '1',
      hasBom: true,
      maktx: 'Relaxo Sparx Footwear 0214C Alt 3',
      spras: 'EN'
    },
    {
      matnr: '11021735',
      stlal: '01',
      bismt: '1527279',
      mtart: 'ROH',
      matkl: 'F1SX',
      prdha: 'PROD-01',
      ean11: '8905495075880',
      idnlf: 'VEND-1102',
      lifnr: '0000451688',
      attyp: '11',
      werks: '1000',
      stlan: '1',
      hasBom: true,
      maktx: 'SOLAR PANEL 400W MONO',
      spras: 'EN'
    },
    {
      matnr: '13000340',
      bismt: 'OLD-INV-01',
      mtart: 'FERT',
      matkl: 'ELEC-INV',
      prdha: 'PROD-INV',
      ean11: '8905495079999',
      idnlf: 'INV-4421',
      lifnr: '0000451688',
      attyp: '00',
      werks: '1001',
      stlan: '1',
      hasBom: true,
      maktx: 'Solar Inverter 5kW Pro',
      spras: 'EN'
    },
    {
      matnr: '100-100',
      bismt: 'ASSY-001',
      mtart: 'FERT',
      matkl: 'ELEC-INV',
      prdha: 'PROD-INV',
      ean11: '',
      idnlf: '',
      lifnr: '',
      attyp: '00',
      werks: '1000',
      stlan: '1',
      vkorg: '1000',
      vtweg: '10',
      plnty: 'N',
      plnnr: '09M06154',
      plnal: '01',
      prvbe: 'PV01',
      kunnr: '0000100000',
      fhm_fgru1: 'PRT1',
      hasBom: true,
      maktx: 'Solar Hybrid Inverter 10kW',
      spras: 'EN'
    },
    {
      matnr: 'SX0167L-BKPC0608',
      bismt: '1527280',
      mtart: 'FERT',
      matkl: 'F1SX',
      prdha: 'PROD-FTW',
      ean11: '8905495075001',
      idnlf: 'VEND-SX',
      lifnr: '0000100022',
      attyp: '11',
      werks: '1000',
      stlan: '1',
      vkorg: '1000',
      vtweg: '10',
      plnty: 'N',
      plnnr: '09M06154',
      plnal: '01',
      prvbe: 'PV01',
      kunnr: '',
      fhm_fgru1: '',
      satnr: 'SX0167L',
      mfrnr: '0000100000',
      mfrpn: 'PART-167',
      text_htn: 'SPARX SHOES 167 L,BKPC0608',
      sgt_csgr: 'ZRFL',
      sgt_covsa: 'ZRFL01',
      fsh_season_year: '2024',
      fsh_season: 'SS01',
      original_art_nr: '100-100',
      folup_art_nr: 'SX0167L-BKPC0608',
      followup_typ_de: 'REPLACEMENT',
      berid: '0001',
      lmatn: '100-100',
      hasBom: false,
      maktx: 'RELAXO CASUAL FOOTWEAR SX0167L',
      spras: 'EN'
    },
    {
      matnr: 'XA1FL0464L-GBTB0003',
      bismt: '',
      mtart: 'FERT',
      matkl: 'A1',
      prdha: 'PROD-FLT',
      ean11: '8905495000033',
      idnlf: '',
      lifnr: '',
      attyp: '02',
      werks: '1000',
      stlan: '',
      satnr: 'XA1FL0464L',
      mfrnr: '0000100000',
      mfrpn: 'FLITE-464',
      text_htn: 'FLITE 464 L, BLUISH GREY T.BLU, 0003',
      sgt_csgr: '',
      sgt_covsa: '',
      fsh_season_year: '2024',
      fsh_season: 'SS01',
      original_art_nr: '',
      folup_art_nr: '',
      followup_typ_de: '',
      berid: '',
      lmatn: '',
      hasBom: false,
      maktx: 'FLITE 464 L, BLUISH GREY T.BLU, 0003',
      spras: 'EN'
    },
    {
      matnr: '200-201',
      bismt: 'PCB-MAIN-V2',
      mtart: 'HALB',
      matkl: 'ELEC-PCB',
      prdha: 'PROD-PCB',
      ean11: '',
      idnlf: 'SUB-PCB-99',
      lifnr: '0000200044',
      attyp: '00',
      werks: '1000',
      stlan: '1',
      hasBom: true,
      maktx: 'Main Power Control Board',
      spras: 'EN'
    },
    {
      matnr: '300-301',
      bismt: 'CAP-220UF',
      mtart: 'ROH',
      matkl: 'ELEC-CAP',
      prdha: '',
      ean11: '',
      idnlf: 'CAP-PAN-220',
      lifnr: '0000300055',
      attyp: '00',
      werks: '1000',
      stlan: '',
      hasBom: false,
      maktx: 'Electrolytic Capacitor 220uF 450V',
      spras: 'EN'
    }
  ];

  function matchesWildcard(val, pattern, isDescription = false) {
    if (!pattern) return true;
    if (!val) return false;
    const v = String(val).toUpperCase();
    const p = String(pattern).toUpperCase();
    if (p === '*' || p === '%') return true;
    if (isDescription && !p.includes('*') && !p.includes('?') && !p.includes('%')) {
      return v.includes(p);
    }
    const regexStr = '^' + p.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
    try {
      return new RegExp(regexStr).test(v);
    } catch {
      return v.includes(p.replace(/[\*\?]/g, ''));
    }
  }

  const results = mockExtended.filter((item) => {
    // Matnr filter
    if (fields.MATNR && !matchesWildcard(item.matnr, fields.MATNR)) {
      return false;
    }
    // Description filter
    if (fields.MAKTG && !matchesWildcard(item.maktx, fields.MAKTG, true)) {
      return false;
    }

    switch (tabKey) {
      case 'A':
        if (fields.BISMT && !matchesWildcard(item.bismt, fields.BISMT)) return false;
        break;
      case 'B':
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.STLAN && item.stlan !== fields.STLAN) return false;
        if (!item.hasBom) return false;
        break;
      case 'L':
        if (fields.MATKL && !matchesWildcard(item.matkl, fields.MATKL)) return false;
        break;
      case 'T':
        if (fields.MTART && !matchesWildcard(item.mtart, fields.MTART)) return false;
        break;
      case 'P':
        if (fields.PRDHA && !matchesWildcard(item.prdha, fields.PRDHA)) return false;
        break;
      case 'N':
        if (fields.EAN11 && !matchesWildcard(item.ean11, fields.EAN11)) return false;
        break;
      case 'I':
        if (fields.IDNLF && !matchesWildcard(item.idnlf, fields.IDNLF)) return false;
        if (fields.LIFNR && !matchesWildcard(item.lifnr, fields.LIFNR)) return false;
        break;
      case 'J':
        if (fields.ATTYP && !matchesWildcard(item.attyp, fields.ATTYP)) return false;
        if (fields.MATKL && !matchesWildcard(item.matkl, fields.MATKL)) return false;
        break;
      case 'W':
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        break;
      case 'S':
        if (fields.VKORG && !matchesWildcard(item.vkorg, fields.VKORG)) return false;
        if (fields.VTWEG && !matchesWildcard(item.vtweg, fields.VTWEG)) return false;
        break;
      case 'R':
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.PLNTY && !matchesWildcard(item.plnty, fields.PLNTY)) return false;
        if (fields.PLNNR && !matchesWildcard(item.plnnr, fields.PLNNR)) return false;
        if (fields.PLNAL && !matchesWildcard(item.plnal, fields.PLNAL)) return false;
        break;
      case 'H':
        if (fields.PRDHA && !matchesWildcard(item.prdha, fields.PRDHA)) return false;
        if (fields.VKORG && !matchesWildcard(item.vkorg, fields.VKORG)) return false;
        if (fields.VTWEG && !matchesWildcard(item.vtweg, fields.VTWEG)) return false;
        break;
      case 'V':
        if (fields.PRVBE && !matchesWildcard(item.prvbe, fields.PRVBE)) return false;
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        break;
      case 'C':
        // CAD material filter already evaluated via MATNR / MAKTG
        break;
      case 'E':
        if (fields.KUNNR && !matchesWildcard(item.kunnr, fields.KUNNR)) return false;
        break;
      case 'F':
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.FHM_FGRU1 && !matchesWildcard(item.fhm_fgru1, fields.FHM_FGRU1)) return false;
        break;
      case 'D':
      case 'G':
      case 'MPN':
      case 'FFF':
        if (fields.WERKS && item.werks && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.MFRNR && !matchesWildcard(item.mfrnr, fields.MFRNR)) return false;
        if (fields.MFRPN && !matchesWildcard(item.mfrpn, fields.MFRPN)) return false;
        if (fields.TEXT_HTN && !matchesWildcard(item.text_htn, fields.TEXT_HTN)) return false;
        break;
      case 'U':
        if (fields.WERKS && item.werks && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.MFRNR && !matchesWildcard(item.mfrnr, fields.MFRNR)) return false;
        if (fields.MFRPN && !matchesWildcard(item.mfrpn, fields.MFRPN)) return false;
        break;
      case 'GENERIC':
        if (fields.SATNR && !matchesWildcard(item.satnr, fields.SATNR)) return false;
        if (fields.MATKL && !matchesWildcard(item.matkl, fields.MATKL)) return false;
        break;
      case 'SEGMENTATION':
        if (fields.SGT_CSGR && !matchesWildcard(item.sgt_csgr, fields.SGT_CSGR)) return false;
        if (fields.SGT_COVSA && !matchesWildcard(item.sgt_covsa, fields.SGT_COVSA)) return false;
        break;
      case 'FASHION':
        if (fields.FSH_SEASON_YEAR && !matchesWildcard(item.fsh_season_year, fields.FSH_SEASON_YEAR)) return false;
        if (fields.FSH_SEASON && !matchesWildcard(item.fsh_season, fields.FSH_SEASON)) return false;
        break;
      case 'ORIGINAL':
      case 'FOLLOWUP':
        if (fields.ORIGINAL_ART_NR && !matchesWildcard(item.original_art_nr, fields.ORIGINAL_ART_NR)) return false;
        if (fields.FOLUP_ART_NR && !matchesWildcard(item.folup_art_nr, fields.FOLUP_ART_NR)) return false;
        if (fields.FOLLOWUP_TYP_DE && !matchesWildcard(item.followup_typ_de, fields.FOLLOWUP_TYP_DE)) return false;
        break;
      case 'Z_INTER':
        if (fields.WERKS && !matchesWildcard(item.werks, fields.WERKS)) return false;
        if (fields.BERID && !matchesWildcard(item.berid, fields.BERID)) return false;
        if (fields.LMATN && !matchesWildcard(item.lmatn, fields.LMATN)) return false;
        break;
      case 'Z_EAN':
        if (fields.EAN11 && !matchesWildcard(item.ean11, fields.EAN11)) return false;
        if (fields.LIFNR && !matchesWildcard(item.lifnr, fields.LIFNR)) return false;
        break;
      default:
        break;
    }
    return true;
  });

  return results.slice(0, limit).map((r) => ({
    matnr: r.matnr,
    rawMatnr: r.matnr.padStart(18, '0'),
    stlal: r.stlal || '01',
    werks: r.werks || '',
    stlan: r.stlan || '',
    maktx: r.maktx,
    mtart: r.mtart,
    spras: r.spras,
    hasBom: r.hasBom
  }));
}
