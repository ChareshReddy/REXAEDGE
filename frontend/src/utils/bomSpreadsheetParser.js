import * as XLSX from 'xlsx';

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
 * Header synonym dictionary for Bulk Create BOM spreadsheet
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

export function formatToDDMMYYYY(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val)) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(val.getDate())}.${pad(val.getMonth() + 1)}.${val.getFullYear()}`;
  }
  const str = String(val).trim();
  const ddmmyyyy = str.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, '0');
    const month = ddmmyyyy[2].padStart(2, '0');
    const year = ddmmyyyy[3];
    return `${day}.${month}.${year}`;
  }
  const yyyymmdd = str.match(/^(\d{4})[./\-]?(\d{2})[./\-]?(\d{2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2];
    const day = yyyymmdd[3];
    return `${day}.${month}.${year}`;
  }
  if (/^\d{5}$/.test(str)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const days = parseInt(str, 10);
    const date = new Date(excelEpoch.getTime() + days * 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}`;
  }
  return str;
}

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
 * Client-side spreadsheet parser for Bulk Create BOM.
 * Parses workbook, maps headers, groups into BOMs, and applies client-side validation rules.
 */
export function parseBomSpreadsheetClient(arrayBufferOrBinary) {
  let workbook;
  try {
    workbook = XLSX.read(arrayBufferOrBinary, {
      type: typeof arrayBufferOrBinary === 'string' ? 'string' : 'array',
      raw: false,
      defval: ''
    });
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file as spreadsheet: ${err.message}`,
      boms: []
    };
  }

  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName) {
    return {
      success: false,
      error: 'The uploaded file contains no sheets or data.',
      boms: []
    };
  }

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

  if (!rawRows || rawRows.length === 0) {
    return {
      success: false,
      error: 'The Excel sheet contains no data rows.',
      boms: []
    };
  }

  // 1. Map column headers dynamically
  const sampleRow = rawRows[0] || {};
  const headerMap = {};
  let recognizedHeaderCount = 0;

  Object.keys(sampleRow).forEach((origHeader) => {
    const norm = normalizeHeaderKey(origHeader);
    const canonical = HEADER_SYNONYMS[norm];
    if (canonical) {
      headerMap[origHeader] = canonical;
      recognizedHeaderCount++;
    }
  });

  if (recognizedHeaderCount === 0) {
    return {
      success: false,
      error: 'Could not recognize any valid BOM columns. Please use the sample template.',
      boms: []
    };
  }

  const parsedRows = [];
  rawRows.forEach((row, rowIdx) => {
    const mapped = {};
    Object.keys(row).forEach((origHeader) => {
      const canonical = headerMap[origHeader];
      if (canonical) {
        mapped[canonical] = String(row[origHeader] || '').trim();
      }
    });

    const rowNum = rowIdx + 2;
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

  // Filter out completely blank lines
  const nonEmptyRows = parsedRows.filter((r) => r.material || r.component || r.plant);
  if (nonEmptyRows.length === 0) {
    return {
      success: false,
      error: 'The uploaded spreadsheet has no non-empty BOM rows.',
      boms: []
    };
  }

  // 2. Group rows into BOMs sharing Material + Plant + Usage + Alternative
  const bomGroups = new Map();
  nonEmptyRows.forEach((row) => {
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

    // Header validations
    if (!firstRow.material) bomErrors.push('Missing required header field: Material');
    if (!firstRow.plant) bomErrors.push('Missing required header field: Plant');
    if (!firstRow.bomUsage) bomErrors.push('Missing required header field: Usage');
    if (!firstRow.alternativeBom) bomErrors.push('Missing required header field: Alternative');
    if (!firstRow.validFrom) bomErrors.push('Missing required header field: Valid From');
    if (!firstRow.baseQty) bomErrors.push('Missing required header field: Base quantity');
    if (!firstRow.bomStatus) bomErrors.push('Missing required header field: BOM Status');

    // Header consistency check across rows of same BOM
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

    // Component rows
    const components = rows.map((r, idx) => {
      const itemNo = String((idx + 1) * 10).padStart(4, '0');
      const compErrors = [];

      if (!r.component) compErrors.push(`Row ${r.rowNum}: Missing Component material`);
      if (!r.quantity || isNaN(parseFloat(r.quantity)) || parseFloat(r.quantity) <= 0) {
        compErrors.push(`Row ${r.rowNum}: Invalid Quantity "${r.quantity}"`);
      }
      if (!r.storageLocation) compErrors.push(`Row ${r.rowNum}: Missing Storage Location`);
      if (r.referenceNumber && r.referenceNumber.length > 40) {
        compErrors.push(
          `Row ${r.rowNum}: REFERENCE NUMBER "${r.referenceNumber}" exceeds maximum length of 40 characters (length ${r.referenceNumber.length}); cannot truncate`
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
        unit: ''
      };
    });

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
      baseUnit: '',
      bomStatus: firstRow.bomStatus,
      altText: firstRow.altText,
      changeNo: firstRow.changeNo,
      components,
      componentCount: components.length,
      status: 'NOT_VALIDATED', // Neutral status upon upload before SAP validation
      errors: bomErrors,
      reason: bomErrors.length > 0 ? bomErrors.join(' | ') : null
    });
  });

  // 3. BOM Cap Validation (500 BOM cap)
  if (boms.length > 500) {
    return {
      success: false,
      error: `Uploaded file contains ${boms.length} BOMs, which exceeds the maximum limit of 500 BOMs. Please split your file into smaller batches of 500 or fewer.`,
      boms: []
    };
  }

  return {
    success: true,
    boms,
    totalRows: nonEmptyRows.length,
    totalBoms: boms.length,
    error: null
  };
}
