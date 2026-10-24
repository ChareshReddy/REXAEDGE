import XLSX from 'xlsx';
import { BOM_FIELD_MAPPING } from '../config/bomFieldMapping.js';

/**
 * Normalizes header string:
 * lowercases, removes asterisks, spaces, underscores, and dashes.
 */
function normalizeHeaderKey(header) {
  if (!header) return '';
  return String(header)
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/[\s_\-.]+/g, '')
    .trim();
}

/**
 * Header synonym dictionary
 */
const HEADER_SYNONYMS = {
  sequencenum: 'sequenceNum',
  sequencenumber: 'sequenceNum',
  seqnum: 'sequenceNum',
  seqno: 'sequenceNum',
  seq: 'sequenceNum',

  material: 'material',
  materialnumber: 'material',
  matnr: 'material',

  plant: 'plant',
  werks: 'plant',

  usage: 'bomUsage',
  bomusage: 'bomUsage',
  stlan: 'bomUsage',

  alternative: 'alternativeBom',
  alternativebom: 'alternativeBom',
  alt: 'alternativeBom',
  stlal: 'alternativeBom',

  validfrom: 'validFrom',
  validfromdate: 'validFrom',
  datuv: 'validFrom',

  basequantity: 'baseQty',
  baseqty: 'baseQty',
  bmeng: 'baseQty',

  bomstatus: 'bomStatus',
  status: 'bomStatus',
  stlst: 'bomStatus',

  alttext: 'altText',
  alternativetext: 'altText',
  stktx: 'altText',

  itemcategory: 'itemCategory',
  itemcat: 'itemCategory',
  postp: 'itemCategory',

  component: 'component',
  componentmaterial: 'component',
  idnrk: 'component',

  quantity: 'quantity',
  compqty: 'quantity',
  menge: 'quantity',

  storagelocation: 'storageLocation',
  issstloc: 'storageLocation',
  lgort: 'storageLocation',
  sloc: 'storageLocation',

  referencenumber: 'referenceNumber',
  referencenum: 'referenceNumber',
  refnumber: 'referenceNumber',
  refnum: 'referenceNumber',
  itemtext1: 'referenceNumber',
  itemtext: 'referenceNumber',
  potx1: 'referenceNumber',

  costingrelevncy: 'costingRelevancy',
  costingrelevancy: 'costingRelevancy',
  costrel: 'costingRelevancy',
  sanka: 'costingRelevancy',

  engineering: 'engineering',
  engrel: 'engineering',
  sanko: 'engineering',

  changenoto: 'changeNo',
  changenumberto: 'changeNo',
  changeno: 'changeNo',
  aennr: 'changeNo'
};

/**
 * Parse date to standard DD.MM.YYYY string
 */
export function formatToDDMMYYYY(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val)) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(val.getDate())}.${pad(val.getMonth() + 1)}.${val.getFullYear()}`;
  }
  const str = String(val).trim();
  // If DD.MM.YYYY or DD/MM/YYYY
  const ddmmyyyy = str.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${day}.${month}.${year}`;
  }
  // If YYYY-MM-DD or YYYYMMDD
  const yyyymmdd = str.match(/^(\d{4})[./\-]?(\d{2})[./\-]?(\d{2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2];
    const day = yyyymmdd[3];
    return `${day}.${month}.${year}`;
  }
  // Excel serial date number
  if (/^\d{5}$/.test(str)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const days = parseInt(str, 10);
    const date = new Date(excelEpoch.getTime() + days * 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  }
  return str;
}

/**
 * Convert DD.MM.YYYY to YYYYMMDD for SAP
 */
export function formatToYYYYMMDD(ddmmyyyy) {
  if (!ddmmyyyy) return '';
  const clean = String(ddmmyyyy).trim();
  const m = clean.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    return `${m[3]}${m[2]}${m[1]}`;
  }
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${iso[1]}${iso[2]}${iso[3]}`;
  }
  if (/^\d{8}$/.test(clean)) {
    return clean;
  }
  return clean.replace(/\D/g, '').slice(0, 8);
}

/**
 * Detect file format:
 * Checks if content is TSV (tab-delimited text saved as .XLS), real .xlsx, or real .xls
 */
export function detectFormat(bufferOrString) {
  if (Buffer.isBuffer(bufferOrString)) {
    // Check magic numbers
    // PK zip header for .xlsx
    if (bufferOrString.length >= 4 &&
        bufferOrString[0] === 0x50 && bufferOrString[1] === 0x4B &&
        bufferOrString[2] === 0x03 && bufferOrString[3] === 0x04) {
      return 'xlsx';
    }
    // OLE Compound File header for binary .xls (BIFF8)
    if (bufferOrString.length >= 8 &&
        bufferOrString[0] === 0xD0 && bufferOrString[1] === 0xCF &&
        bufferOrString[2] === 0x11 && bufferOrString[3] === 0xE0) {
      return 'xls';
    }
    // Otherwise check if it is UTF-8 text containing tab characters
    const preview = bufferOrString.slice(0, 4096).toString('utf8');
    if (preview.includes('\t') || preview.includes('\n')) {
      return 'tsv';
    }
    return 'unknown';
  } else if (typeof bufferOrString === 'string') {
    return 'tsv';
  }
  return 'unknown';
}

/**
 * Parse raw rows from TSV or Excel buffer
 */
export function parseRawRows(bufferOrString) {
  const format = detectFormat(bufferOrString);
  let rawJsonRows = [];

  if (format === 'tsv') {
    const text = Buffer.isBuffer(bufferOrString) ? bufferOrString.toString('utf8') : String(bufferOrString);
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    const headerLine = lines[0];
    const headerCols = headerLine.split('\t').map((h) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const colValues = lines[i].split('\t');
      const rowObj = {};
      headerCols.forEach((colName, cIdx) => {
        rowObj[colName] = (colValues[cIdx] || '').trim();
      });
      rawJsonRows.push(rowObj);
    }
  } else {
    // xlsx or xls (or fallback to SheetJS which auto-detects)
    const workbook = XLSX.read(bufferOrString, {
      type: Buffer.isBuffer(bufferOrString) ? 'buffer' : 'string',
      raw: false,
      defval: ''
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const worksheet = workbook.Sheets[firstSheetName];
    rawJsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
  }

  return rawJsonRows;
}

/**
 * Main parser: takes a file buffer or string, parses rows, normalizes fields,
 * groups by Material + Plant + Usage + Alternative, and performs initial validations.
 */
export function parseBomSpreadsheet(bufferOrString) {
  const rawRows = parseRawRows(bufferOrString);
  if (rawRows.length === 0) {
    return {
      boms: [],
      totalRows: 0,
      invalidCount: 0,
      errors: ['The uploaded file contains no data or could not be parsed.']
    };
  }

  // 1. Map column headers dynamically
  const sampleRow = rawRows[0] || {};
  const headerMap = {}; // normalizedKey -> canonicalField
  Object.keys(sampleRow).forEach((origHeader) => {
    const norm = normalizeHeaderKey(origHeader);
    const canonical = HEADER_SYNONYMS[norm];
    if (canonical) {
      headerMap[origHeader] = canonical;
    }
  });

  const parsedRows = [];
  const globalErrors = [];

  rawRows.forEach((row, rowIdx) => {
    const mapped = {};
    Object.keys(row).forEach((origHeader) => {
      const canonical = headerMap[origHeader];
      if (canonical) {
        mapped[canonical] = String(row[origHeader] || '').trim();
      }
    });

    // Check mandatory fields
    const rowNum = rowIdx + 2; // +1 for 0-index, +1 for header
    parsedRows.push({
      rowNum,
      sequenceNum: mapped.sequenceNum || String(rowNum),
      material: mapped.material || '',
      plant: mapped.plant || '',
      bomUsage: mapped.bomUsage || '1',
      alternativeBom: mapped.alternativeBom ? String(mapped.alternativeBom).padStart(2, '0') : '01',
      validFrom: formatToDDMMYYYY(mapped.validFrom),
      validFromSap: formatToYYYYMMDD(mapped.validFrom),
      baseQty: mapped.baseQty || '1',
      bomStatus: mapped.bomStatus ? String(mapped.bomStatus).padStart(2, '0') : '01',
      altText: mapped.altText || '',
      itemCategory: mapped.itemCategory ? mapped.itemCategory.toUpperCase() : 'L',
      component: mapped.component || '',
      quantity: mapped.quantity || '1',
      storageLocation: mapped.storageLocation ? mapped.storageLocation.toUpperCase() : '',
      referenceNumber: mapped.referenceNumber || '',
      costingRelevancy: String(mapped.costingRelevancy || '').toUpperCase() === 'X' ? 'X' : '',
      engineering: String(mapped.engineering || '').toUpperCase() === 'X' ? 'X' : '',
      changeNo: mapped.changeNo || '',
      raw: row
    });
  });

  // 2. Group rows into BOMs sharing Material + Plant + Usage + Alternative
  const bomGroups = new Map();

  parsedRows.forEach((row) => {
    const groupKey = `${row.material.toUpperCase()}|${row.plant}|${row.bomUsage}|${row.alternativeBom}`;
    if (!bomGroups.has(groupKey)) {
      bomGroups.set(groupKey, []);
    }
    bomGroups.get(groupKey).push(row);
  });

  const boms = [];

  bomGroups.forEach((rows, groupKey) => {
    const firstRow = rows[0];
    const bomErrors = [];
    let bomStatusState = 'Ready';

    // A. Check required header fields
    if (!firstRow.material) {
      bomErrors.push('Missing required header field: Material');
    }
    if (!firstRow.plant) {
      bomErrors.push('Missing required header field: Plant');
    }
    if (!firstRow.bomUsage) {
      bomErrors.push('Missing required header field: Usage');
    }
    if (!firstRow.alternativeBom) {
      bomErrors.push('Missing required header field: Alternative');
    }
    if (!firstRow.validFrom) {
      bomErrors.push('Missing required header field: Valid From');
    }
    if (!firstRow.baseQty) {
      bomErrors.push('Missing required header field: Base quantity');
    }
    if (!firstRow.bomStatus) {
      bomErrors.push('Missing required header field: BOM Status');
    }

    // B. Check header consistency across all rows of this BOM
    const headerFieldsToCheck = [
      { key: 'baseQty', label: 'Base quantity' },
      { key: 'bomStatus', label: 'BOM Status' },
      { key: 'validFrom', label: 'Valid From' },
      { key: 'altText', label: 'Alt Text' }
    ];

    headerFieldsToCheck.forEach(({ key, label }) => {
      const val0 = firstRow[key];
      for (let r = 1; r < rows.length; r++) {
        if (rows[r][key] !== val0) {
          bomErrors.push(
            `Header conflict on "${label}": row ${rows[0].rowNum} has "${val0}" but row ${rows[r].rowNum} has "${rows[r][key]}"`
          );
          break;
        }
      }
    });

    // C. Validate component rows & auto-number items in sheet order
    const components = rows.map((r, idx) => {
      const itemNo = String((idx + 1) * 10).padStart(4, '0');
      const compErrors = [];

      if (!r.component) {
        compErrors.push(`Row ${r.rowNum}: Missing Component material`);
      }
      if (!r.quantity || isNaN(parseFloat(r.quantity)) || parseFloat(r.quantity) <= 0) {
        compErrors.push(`Row ${r.rowNum}: Invalid Quantity "${r.quantity}"`);
      }
      if (!r.storageLocation) {
        compErrors.push(`Row ${r.rowNum}: Missing Storage Location`);
      }

      // Check REFERENCE NUMBER length against config constant (40 max, never truncate)
      const maxRefLen = BOM_FIELD_MAPPING.REFERENCE_NUMBER.maxLen;
      if (r.referenceNumber && r.referenceNumber.length > maxRefLen) {
        compErrors.push(
          `Row ${r.rowNum}: REFERENCE NUMBER "${r.referenceNumber}" exceeds maximum length of ${maxRefLen} characters (length ${r.referenceNumber.length}); cannot truncate`
        );
      }

      if (compErrors.length > 0) {
        bomErrors.push(...compErrors);
      }

      return {
        itemNo,
        rowNum: r.rowNum,
        component: r.component.toUpperCase(),
        quantity: r.quantity,
        itemCategory: r.itemCategory,
        storageLocation: r.storageLocation,
        referenceNumber: r.referenceNumber,
        costingRelevancy: r.costingRelevancy,
        engineering: r.engineering,
        changeNo: r.changeNo,
        unit: '' // To be populated during pre-flight from MARA-MEINS
      };
    });

    if (bomErrors.length > 0) {
      bomStatusState = 'Invalid';
    }

    boms.push({
      groupKey,
      sequenceNum: firstRow.sequenceNum,
      material: firstRow.material.toUpperCase(),
      plant: firstRow.plant,
      bomUsage: firstRow.bomUsage,
      alternativeBom: firstRow.alternativeBom,
      validFrom: firstRow.validFrom,
      validFromSap: firstRow.validFromSap,
      baseQty: firstRow.baseQty,
      baseUnit: '', // To be populated from MARA-MEINS
      bomStatus: firstRow.bomStatus,
      altText: firstRow.altText,
      changeNo: firstRow.changeNo,
      components,
      componentCount: components.length,
      status: bomStatusState,
      errors: bomErrors,
      reason: bomErrors.join(' | ')
    });
  });

  const invalidCount = boms.filter((b) => b.status === 'Invalid').length;

  return {
    boms,
    totalRows: parsedRows.length,
    invalidCount,
    errors: globalErrors
  };
}
