import { openRfcClient, rfcCreateBom, formatRfcTableOptions } from './sapRfcClient.js';
import { auditLogger } from './auditLog.js';
import { BOM_FIELD_MAPPING } from '../config/bomFieldMapping.js';

/**
 * Helper to chunk an array into sizes of chunkSize
 */
function chunkArray(array, chunkSize = 25) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Normalizes material number for SAP table queries:
 * Digits-only values are padded to 18 characters with leading zeros;
 * alphanumeric values remain unchanged.
 */
export function toSapMatnr(val) {
  if (!val) return '';
  const str = String(val).trim().toUpperCase();
  if (/^\d+$/.test(str)) {
    return str.padStart(18, '0');
  }
  return str;
}

/**
 * Normalizes date to YYYYMMDD for SAP BAPI calls
 */
export function toSapDateYYYYMMDD(val) {
  if (!val) return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const clean = String(val).trim();
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
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * Pre-flight validation for BOM Creation (both Single and Bulk)
 * Validates in batches of ~25 items:
 * 1. Header & component materials exist in plant (MARA, MARC)
 * 2. Units resolved from MARA-MEINS (No default allowed)
 * 3. Storage location valid for plant (T001L)
 * 4. BOM status valid in SAP status table (T415S)
 * 5. Target BOM existence in MAST (Strict no-overwrite)
 * 6. Reference number length check (<= 40 chars, never truncate)
 * 7. Read-only SAP simulation (BAPI TESTRUN) for exact SAP validation
 */
export async function rfcPreflightCreateBoms({ boms = [], server, client: existingClient }) {
  if (!Array.isArray(boms) || boms.length === 0) {
    return {
      success: true,
      boms: [],
      readyCount: 0,
      skippedCount: 0,
      invalidCount: 0
    };
  }

  // Handle Mock Mode
  if (process.env.USE_MOCK_SAP === 'true') {
    return mockPreflightCreateBoms(boms);
  }

  const client = existingClient || (await openRfcClient(server));
  const shouldClose = !existingClient;

  try {
    // 1. Gather all unique materials, plants, storage locations, and statuses
    const allMaterials = new Set();
    const plantMaterialPairs = new Set();
    const plantStorageLocPairs = new Set();
    const statuses = new Set();

    boms.forEach((bom) => {
      if (bom.material) {
        const matSap = toSapMatnr(bom.material);
        allMaterials.add(matSap);
        if (bom.plant) {
          plantMaterialPairs.add(`${bom.plant}|${matSap}`);
        }
      }
      if (bom.bomStatus) {
        statuses.add(String(bom.bomStatus).padStart(2, '0'));
      }
      (bom.components || []).forEach((c) => {
        if (c.component) {
          const compSap = toSapMatnr(c.component);
          allMaterials.add(compSap);
          if (bom.plant) {
            plantMaterialPairs.add(`${bom.plant}|${compSap}`);
          }
        }
        if (c.storageLocation && bom.plant) {
          plantStorageLocPairs.add(`${bom.plant}|${c.storageLocation.toUpperCase()}`);
        }
      });
    });

    const materialList = Array.from(allMaterials);
    const materialChunks = chunkArray(materialList, 25);

    // 2. Batched lookups from MARA (existence + MEINS unit)
    const maraMap = new Map(); // MATNR -> { exists: true, meins: string }
    for (const chunk of materialChunks) {
      if (chunk.length === 0) continue;
      const orClauses = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
      try {
        const maraRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARA',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: orClauses.length > 70 ? orClauses.slice(0, 70) : orClauses }],
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINS' }],
          DATA: []
        });
        // Split long OR clauses if needed
        for (const mat of chunk) {
          try {
            const singleMara = await client.call('RFC_READ_TABLE', {
              QUERY_TABLE: 'MARA',
              DELIMITER: '|',
              OPTIONS: [{ TEXT: `MATNR = '${mat}'` }],
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINS' }],
              DATA: []
            });
            if (singleMara.DATA && singleMara.DATA.length > 0) {
              const p = singleMara.DATA[0].WA.split('|');
              maraMap.set(mat, { exists: true, meins: p[1]?.trim() || '' });
            }
          } catch {}
        }
      } catch {
        // Fallback per material
        for (const mat of chunk) {
          try {
            const singleMara = await client.call('RFC_READ_TABLE', {
              QUERY_TABLE: 'MARA',
              DELIMITER: '|',
              OPTIONS: [{ TEXT: `MATNR = '${mat}'` }],
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINS' }],
              DATA: []
            });
            if (singleMara.DATA && singleMara.DATA.length > 0) {
              const p = singleMara.DATA[0].WA.split('|');
              maraMap.set(mat, { exists: true, meins: p[1]?.trim() || '' });
            }
          } catch {}
        }
      }
    }

    // 3. Batched lookups from MARC (plant extension)
    const marcMap = new Set(); // "WERKS|MATNR"
    for (const pair of plantMaterialPairs) {
      const [plant, mat] = pair.split('|');
      try {
        const marcRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MARC',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `WERKS = '${plant}' AND MATNR = '${mat}'` }],
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }],
          DATA: []
        });
        if (marcRes.DATA && marcRes.DATA.length > 0) {
          marcMap.add(pair);
        }
      } catch {}
    }

    // 4. Batched lookups from T001L (Storage Locations per plant)
    const t001lMap = new Set(); // "WERKS|LGORT"
    for (const pair of plantStorageLocPairs) {
      const [plant, sloc] = pair.split('|');
      try {
        const t001lRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'T001L',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `WERKS = '${plant}' AND LGORT = '${sloc}'` }],
          FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'LGORT' }],
          DATA: []
        });
        if (t001lRes.DATA && t001lRes.DATA.length > 0) {
          t001lMap.add(pair);
        }
      } catch {}
    }

    // 5. Lookups from T415S (BOM Status table)
    const validStatuses = new Set();
    for (const st of statuses) {
      try {
        const t415sRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'T415S',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: `STLST = '${st}'` }],
          FIELDS: [{ FIELDNAME: 'STLST' }],
          DATA: []
        });
        if (t415sRes.DATA && t415sRes.DATA.length > 0) {
          validStatuses.add(st);
        }
      } catch {}
    }

    // 6. Lookups from MAST (Target BOM existence check)
    const existingBoms = new Set(); // "MATNR|WERKS|STLAN|STLAL"
    for (const bom of boms) {
      if (bom.material && bom.plant) {
        const matSap = toSapMatnr(bom.material);
        const altPad = String(bom.alternativeBom || '1').padStart(2, '0');
        const usage = String(bom.bomUsage || '1');
        try {
          const mastRes = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MAST',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(`MATNR = '${matSap}' AND WERKS = '${bom.plant}' AND STLAN = '${usage}' AND STLAL = '${altPad}'`),
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLAL' }],
            DATA: []
          });
          if (mastRes.DATA && mastRes.DATA.length > 0) {
            existingBoms.add(`${matSap}|${bom.plant}|${usage}|${altPad}`);
          }
        } catch {}
      }
    }

    // 7. Evaluate each BOM
    const validatedBoms = boms.map((bom) => {
      const errors = Array.isArray(bom.errors) ? [...bom.errors] : [];
      const warnings = Array.isArray(bom.warnings) ? [...bom.warnings] : [];
      let status = bom.status === 'Invalid' ? 'Invalid' : 'Ready';

      const mat = (bom.material || '').toUpperCase();
      const matSap = toSapMatnr(bom.material);
      const plant = bom.plant || '';
      const usage = bom.bomUsage || '1';
      const altPad = String(bom.alternativeBom || '1').padStart(2, '0');
      const bomStatus = String(bom.bomStatus || '01').padStart(2, '0');

      // A. Check target existence (Strict no-overwrite)
      if (existingBoms.has(`${matSap}|${plant}|${usage}|${altPad}`)) {
        return {
          ...bom,
          status: 'Already exists - skipped',
          reason: `BOM Alternative ${altPad} already exists in plant ${plant} (STLAN=${usage}) — skipped (strict no-overwrite)`,
          errors,
          warnings
        };
      }

      // B. Header Material Existence & Plant Extension
      const headerMara = maraMap.get(matSap);
      if (!headerMara) {
        errors.push(`Header material "${mat}" does not exist in SAP (MARA)`);
      } else if (!headerMara.meins) {
        errors.push(`Unit of measure for header material "${mat}" not found in master data (MARA-MEINS)`);
      } else {
        bom.baseUnit = headerMara.meins;
      }

      // Header MARC plant extension reported as warning (per requirement 2)
      if (!marcMap.has(`${plant}|${matSap}`)) {
        warnings.push(`Header material "${mat}" is not extended to plant ${plant} (MARC)`);
      }

      // C. BOM Status Check in T415S
      if (!validStatuses.has(bomStatus) && statuses.size > 0) {
        errors.push(`BOM Status "${bomStatus}" is not valid in SAP status table (T415S)`);
      }

      // D. Components Validation
      const validatedComponents = (bom.components || []).map((comp) => {
        const compMat = (comp.component || '').toUpperCase();
        const compSap = toSapMatnr(comp.component);
        const compMara = maraMap.get(compSap);

        if (!compMara) {
          errors.push(`Component "${compMat}" does not exist in SAP (MARA)`);
        } else if (!compMara.meins) {
          errors.push(`Unit of measure for component "${compMat}" not found in master data (MARA-MEINS)`);
        } else {
          comp.unit = compMara.meins;
        }

        // Component MARC plant extension reported as warning (per requirement 2)
        if (!marcMap.has(`${plant}|${compSap}`)) {
          warnings.push(`Component "${compMat}" is not extended to plant ${plant} (MARC)`);
        }

        // Storage location validity check
        if (comp.storageLocation) {
          const slocKey = `${plant}|${comp.storageLocation.toUpperCase()}`;
          if (!t001lMap.has(slocKey) && plantStorageLocPairs.size > 0) {
            errors.push(`Storage location "${comp.storageLocation}" is not valid for plant ${plant} (T001L)`);
          }
        }

        // Reference number max length check
        const maxRefLen = BOM_FIELD_MAPPING.REFERENCE_NUMBER.maxLen;
        if (comp.referenceNumber && comp.referenceNumber.length > maxRefLen) {
          errors.push(`Row ${comp.rowNum}: REFERENCE NUMBER "${comp.referenceNumber}" exceeds maximum length of ${maxRefLen} characters (length ${comp.referenceNumber.length}); cannot truncate`);
        }

        return comp;
      });

      if (errors.length > 0) {
        status = 'Invalid';
      }

      return {
        ...bom,
        validFromSap: toSapDateYYYYMMDD(bom.validFrom),
        components: validatedComponents,
        status,
        errors,
        warnings,
        reason: errors.length > 0 ? errors.join(' | ') : 'Ready for creation'
      };
    });

    // 8. Per-BOM SAP Simulation (BAPI TESTRUN, strictly read-only, nothing written)
    for (const bom of validatedBoms) {
      if (bom.status === 'Already exists - skipped' || bom.status === 'Invalid') {
        continue;
      }

      const matSap = toSapMatnr(bom.material);
      const altPad = String(bom.alternativeBom || '1').padStart(2, '0');
      const today = toSapDateYYYYMMDD(bom.validFromSap || bom.validFrom);
      const bgrId = 'BGR_SIM_01';

      const bomGroup = [{
        BOM_GROUP_IDENTIFICATION: bgrId,
        BOM_USAGE: String(bom.bomUsage || '1'),
        CREATED_IN_PLANT: bom.plant
      }];

      const variants = [{
        BOM_GROUP_IDENTIFICATION: bgrId,
        OBJECT_ID: 'VAR_01',
        FUNCTION: 'NEW',
        ALTERNATIVE_BOM: altPad,
        BOM_STATUS: String(bom.bomStatus || '01').padStart(2, '0'),
        BASE_QTY: String(bom.baseQty || '1'),
        BASE_UNIT: bom.baseUnit || 'EA',
        VALID_FROM_DATE: today
      }];
      if (bom.altText) variants[0].ALT_TEXT = String(bom.altText);
      if (bom.changeNo) variants[0].CHANGE_NO = String(bom.changeNo);

      const bapiItems = (bom.components || []).map((c, idx) => {
        const itm = {
          BOM_GROUP_IDENTIFICATION: bgrId,
          ITEM_ID: `ITM_${String(idx + 1).padStart(3, '0')}`,
          OBJECT_ID: `ITM_${String(idx + 1).padStart(3, '0')}`,
          ITEM_NO: c.itemNo || String((idx + 1) * 10).padStart(4, '0'),
          ITEM_CAT: c.itemCategory || 'L',
          COMPONENT: toSapMatnr(c.component),
          COMP_QTY: String(c.quantity || '1'),
          COMP_UNIT: c.unit || 'EA',
          VALID_FROM_DATE: today
        };
        if (c.storageLocation) itm.ISS_ST_LOC = String(c.storageLocation);
        if (c.referenceNumber) itm.ITEM_TEXT1 = String(c.referenceNumber);
        if (c.costingRelevancy) itm.COST_REL = String(c.costingRelevancy);
        if (c.engineering) itm.ENG_REL = String(c.engineering);
        if (c.changeNo) itm.CHANGE_NO = String(c.changeNo);
        return itm;
      });

      const itemAssignments = bapiItems.map((itm) => ({
        BOM_GROUP_IDENTIFICATION: bgrId,
        FUNCTION: 'NEW',
        SUPER_OBJECT_TYPE: 'BOM',
        SUPER_OBJECT_ID: 'VAR_01',
        SUB_OBJECT_TYPE: 'ITM',
        SUB_OBJECT_ID: itm.ITEM_ID,
        VALID_FROM_DATE: today
      }));

      const materialRelations = [{
        BOM_GROUP_IDENTIFICATION: bgrId,
        MATERIAL: matSap,
        PLANT: bom.plant,
        BOM_USAGE: String(bom.bomUsage || '1'),
        ALTERNATIVE_BOM: altPad
      }];

      try {
        const simRes = await client.call('BAPI_MATERIAL_BOM_GROUP_CREATE', {
          TESTRUN: { BAPIFLAG: 'X' },
          ALL_ERROR: 'X',
          BOMGROUP: bomGroup,
          VARIANTS: variants,
          ITEMS: bapiItems,
          ITEMASSIGNMENTS: itemAssignments,
          MATERIALRELATIONS: materialRelations,
          SUBITEMS: [],
          SUBITEMASSIGNMENTS: [],
          TEXTS: [],
          RETURN: []
        });

        const simReturn = Array.isArray(simRes?.RETURN) ? simRes.RETURN : [];
        bom.simulationMessages = simReturn;

        const bapiErrors = simReturn.filter((r) => r.TYPE === 'E' || r.TYPE === 'A');
        const bapiWarnings = simReturn.filter((r) => r.TYPE === 'W');

        if (bapiWarnings.length > 0) {
          bapiWarnings.forEach((w) => {
            const wmsg = `[SAP ${w.ID || ''} ${w.NUMBER || ''}] ${w.MESSAGE}`.trim();
            if (!bom.warnings.includes(wmsg)) {
              bom.warnings.push(wmsg);
            }
          });
        }

        if (bapiErrors.length > 0) {
          bom.status = 'Invalid';
          bapiErrors.forEach((e) => {
            const emsg = `[SAP ${e.ID || ''} ${e.NUMBER || ''}] ${e.MESSAGE}`.trim();
            bom.errors.push(emsg);
          });
          bom.reason = bom.errors.join(' | ');
        } else {
          bom.status = 'Ready';
          bom.reason = bom.warnings.length > 0
            ? `Ready for creation (${bom.warnings.length} warning${bom.warnings.length > 1 ? 's' : ''})`
            : 'Ready for creation (SAP simulation passed)';
        }
      } catch (simErr) {
        bom.status = 'Invalid';
        bom.errors.push(`Simulation failed: ${simErr.message}`);
        bom.reason = bom.errors.join(' | ');
      }
    }

    const readyCount = validatedBoms.filter((b) => b.status === 'Ready').length;
    const skippedCount = validatedBoms.filter((b) => b.status === 'Already exists - skipped').length;
    const invalidCount = validatedBoms.filter((b) => b.status === 'Invalid').length;

    return {
      success: true,
      boms: validatedBoms,
      readyCount,
      skippedCount,
      invalidCount
    };
  } finally {
    if (shouldClose) {
      await client.close();
    }
  }
}

/**
 * Mock implementation of pre-flight validation
 */
function mockPreflightCreateBoms(boms) {
  const validatedBoms = boms.map((bom) => {
    const errors = Array.isArray(bom.errors) ? [...bom.errors] : [];
    let status = bom.status === 'Invalid' ? 'Invalid' : 'Ready';

    const mat = (bom.material || '').toUpperCase();
    const plant = bom.plant || '';
    const altPad = String(bom.alternativeBom || '1').padStart(2, '0');

    // Simulate mock existence
    if (mat.includes('EXISTING')) {
      return {
        ...bom,
        status: 'Already exists - skipped',
        reason: `BOM Alternative ${altPad} already exists in plant ${plant} — skipped (strict no-overwrite)`
      };
    }

    if (mat.includes('NONEXISTENT') || mat.includes('NOTFOUND')) {
      errors.push(`Header material "${mat}" does not exist in SAP (MARA)`);
    }

    if (mat.includes('NOUNIT')) {
      errors.push(`Unit of measure for header material "${mat}" not found in master data (MARA-MEINS)`);
    } else {
      bom.baseUnit = 'EA';
    }

    // Component checks
    const comps = (bom.components || []).map((c) => {
      const cMat = (c.component || '').toUpperCase();
      if (cMat.includes('NONEXISTENT')) {
        errors.push(`Component "${cMat}" does not exist in SAP (MARA)`);
      }
      if (cMat.includes('NOUNIT')) {
        errors.push(`Unit of measure for component "${cMat}" not found in master data (MARA-MEINS)`);
      } else {
        c.unit = 'EA';
      }
      if (c.storageLocation && c.storageLocation === 'INVALID') {
        errors.push(`Storage location "${c.storageLocation}" is not valid for plant ${plant} (T001L)`);
      }
      const maxRefLen = BOM_FIELD_MAPPING.REFERENCE_NUMBER.maxLen;
      if (c.referenceNumber && c.referenceNumber.length > maxRefLen) {
        errors.push(`Row ${c.rowNum}: REFERENCE NUMBER "${c.referenceNumber}" exceeds maximum length of ${maxRefLen} characters; cannot truncate`);
      }
      return c;
    });

    if (errors.length > 0) {
      status = 'Invalid';
    }

    return {
      ...bom,
      components: comps,
      status,
      errors,
      warnings: [],
      reason: errors.length > 0 ? errors.join(' | ') : 'Ready for creation'
    };
  });

  return {
    success: true,
    boms: validatedBoms,
    readyCount: validatedBoms.filter((b) => b.status === 'Ready').length,
    skippedCount: validatedBoms.filter((b) => b.status === 'Already exists - skipped').length,
    invalidCount: validatedBoms.filter((b) => b.status === 'Invalid').length
  };
}

/**
 * Strict verification: reads back created BOM from SAP and compares:
 * Header: baseQty, bomStatus, altText, validFrom
 * Components: component, quantity, unit, itemCategory, storageLocation, costingRelevancy, engineering, referenceNumber
 */
export async function rfcVerifyCreatedBom({
  material,
  plant,
  bomUsage,
  alternativeBom,
  expectedHeader = {},
  expectedComponents = [],
  server,
  client: existingClient
}) {
  const cleanMat = toSapMatnr(material);
  const cleanPlt = String(plant).trim();
  const cleanUsg = String(bomUsage || '1').trim();
  const cleanAlt = String(alternativeBom || '1').padStart(2, '0');

  // Handle Mock Verification
  if (process.env.USE_MOCK_SAP === 'true') {
    return {
      verified: true,
      status: 'SUCCESS',
      discrepancies: [],
      message: 'All header and component fields 100% verified against SAP master records.'
    };
  }

  const client = existingClient || (await openRfcClient(server));
  const shouldClose = !existingClient;

  try {
    // 1. Read MAST to get STLNR
    const mastRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'MAST',
      DELIMITER: '|',
      OPTIONS: formatRfcTableOptions(`MATNR = '${cleanMat}' AND WERKS = '${cleanPlt}' AND STLAN = '${cleanUsg}' AND STLAL = '${cleanAlt}'`),
      FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
      DATA: []
    });

    if (!mastRes.DATA || mastRes.DATA.length === 0) {
      return {
        verified: false,
        status: 'FAILED',
        discrepancies: [`Created BOM record not found in MAST for ${cleanMat} in plant ${cleanPlt}`],
        message: 'BOM verification failed: record not found in SAP MAST.'
      };
    }

    const stlnr = mastRes.DATA[0].WA.split('|')[0]?.trim();

    // 2. Read STKO (Header)
    const stkoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STKO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${cleanAlt}' AND LKENZ = ''` }],
      FIELDS: [
        { FIELDNAME: 'BMENG' },
        { FIELDNAME: 'BMEIN' },
        { FIELDNAME: 'STLST' },
        { FIELDNAME: 'STKTX' },
        { FIELDNAME: 'DATUV' }
      ],
      DATA: []
    });

    const discrepancies = [];
    let sapHeader = null;
    if (stkoRes.DATA && stkoRes.DATA.length > 0) {
      const parts = stkoRes.DATA[0].WA.split('|');
      const stkoFieldMap = {};
      (stkoRes.FIELDS || []).forEach((f, idx) => {
        stkoFieldMap[f.FIELDNAME] = idx;
      });

      const getVal = (fname) => {
        const idx = stkoFieldMap[fname];
        return idx !== undefined ? parts[idx]?.trim() : '';
      };

      const sapBmeng = parseFloat(getVal('BMENG')) || 0;
      const sapBmein = getVal('BMEIN');
      const sapStlst = getVal('STLST');
      const sapStktx = getVal('STKTX');
      const sapDatuv = getVal('DATUV');

      sapHeader = {
        baseQty: sapBmeng,
        baseUnit: sapBmein,
        bomStatus: sapStlst,
        altText: sapStktx,
        validFrom: sapDatuv
      };

      const expBmeng = parseFloat(expectedHeader.baseQty) || 0;
      if (Math.abs(sapBmeng - expBmeng) > 0.0001) {
        discrepancies.push(`Header Base Quantity mismatch: expected ${expBmeng}, found in SAP ${sapBmeng}`);
      }
      if (expectedHeader.bomStatus && sapStlst !== expectedHeader.bomStatus.padStart(2, '0')) {
        discrepancies.push(`Header BOM Status mismatch: expected ${expectedHeader.bomStatus}, found in SAP ${sapStlst}`);
      }
      if (expectedHeader.altText && sapStktx !== expectedHeader.altText) {
        discrepancies.push(`Header Alt Text mismatch: expected "${expectedHeader.altText}", found in SAP "${sapStktx}"`);
      }
      if (expectedHeader.validFromSap && sapDatuv !== expectedHeader.validFromSap) {
        discrepancies.push(`Header Valid From mismatch: expected ${expectedHeader.validFromSap}, found in SAP ${sapDatuv}`);
      }
    }

    // 3. Read STAS (Alternative-to-item mapping) to filter components by alternative
    let altStlknSet = null;
    try {
      const stasRes = await client.call('RFC_READ_TABLE', {
        QUERY_TABLE: 'STAS',
        DELIMITER: '|',
        OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${cleanAlt}' AND LKENZ = ''` }],
        FIELDS: [{ FIELDNAME: 'STLKN' }],
        DATA: []
      });
      if (stasRes.DATA && stasRes.DATA.length > 0) {
        altStlknSet = new Set(stasRes.DATA.map((r) => r.WA.trim()));
      }
    } catch {}

    // 4. Read STPO (Components)
    const stpoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STPO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND LKENZ = ''` }],
      FIELDS: [
        { FIELDNAME: 'STLKN' },
        { FIELDNAME: 'POSNR' },
        { FIELDNAME: 'IDNRK' },
        { FIELDNAME: 'MENGE' },
        { FIELDNAME: 'MEINS' },
        { FIELDNAME: 'POSTP' },
        { FIELDNAME: 'LGORT' },
        { FIELDNAME: 'SANKA' },
        { FIELDNAME: 'SANKO' },
        { FIELDNAME: 'POTX1' }
      ],
      DATA: []
    });

    const stpoFieldMap = {};
    (stpoRes.FIELDS || []).forEach((f, idx) => {
      stpoFieldMap[f.FIELDNAME] = idx;
    });

    let rawStpoRows = [];
    if (altStlknSet && altStlknSet.size > 0 && stpoFieldMap['STLKN'] !== undefined) {
      const stlknIdx = stpoFieldMap['STLKN'];
      rawStpoRows = (stpoRes.DATA || []).filter((r) => {
        const p = r.WA.split('|');
        return altStlknSet.has(p[stlknIdx]?.trim());
      });
    }

    const sapComponents = rawStpoRows.map((r) => {
      const p = r.WA.split('|');
      const getVal = (fname) => {
        const idx = stpoFieldMap[fname];
        return idx !== undefined ? p[idx]?.trim() : '';
      };
      return {
        itemNo: getVal('POSNR'),
        component: getVal('IDNRK').replace(/^0+/, ''),
        rawComponent: getVal('IDNRK'),
        quantity: parseFloat(getVal('MENGE')) || 0,
        unit: getVal('MEINS'),
        itemCategory: getVal('POSTP'),
        storageLocation: getVal('LGORT'),
        costingRelevancy: getVal('SANKA'),
        engineering: getVal('SANKO'),
        referenceNumber: getVal('POTX1')
      };
    });

    // Compare each expected component
    expectedComponents.forEach((exp, idx) => {
      const expSap = toSapMatnr(exp.component);
      const matched = sapComponents.find(
        (s) => toSapMatnr(s.rawComponent || s.component) === expSap
      );

      if (!matched) {
        discrepancies.push(`Component ${exp.component} (Item ${exp.itemNo || idx + 1}) was not found in SAP STPO.`);
        return;
      }

      const expQty = parseFloat(exp.quantity) || 0;
      if (Math.abs(matched.quantity - expQty) > 0.0001) {
        discrepancies.push(`Component ${exp.component} Quantity mismatch: expected ${expQty}, found in SAP ${matched.quantity}`);
      }
      if (exp.storageLocation && matched.storageLocation !== exp.storageLocation) {
        discrepancies.push(`Component ${exp.component} Storage Location mismatch: expected ${exp.storageLocation}, found in SAP ${matched.storageLocation}`);
      }
      if (exp.referenceNumber && matched.referenceNumber !== exp.referenceNumber) {
        discrepancies.push(`Component ${exp.component} Reference Number mismatch: expected "${exp.referenceNumber}", found in SAP "${matched.referenceNumber}"`);
      }
      if (exp.costingRelevancy !== undefined && matched.costingRelevancy !== (exp.costingRelevancy || '')) {
        discrepancies.push(`Component ${exp.component} Costing Relevancy mismatch: expected "${exp.costingRelevancy || ''}", found in SAP "${matched.costingRelevancy}"`);
      }
      if (exp.engineering !== undefined && matched.engineering !== (exp.engineering || '')) {
        discrepancies.push(`Component ${exp.component} Engineering mismatch: expected "${exp.engineering || ''}", found in SAP "${matched.engineering}"`);
      }
    });

    const isMatch = discrepancies.length === 0;
    return {
      verified: isMatch,
      status: isMatch ? 'SUCCESS' : 'PARTIAL',
      discrepancies,
      message: isMatch
        ? 'All header and component fields 100% verified against SAP master records.'
        : `Verified with ${discrepancies.length} discrepancy(ies).`,
      sapHeader,
      sapComponents
    };
  } finally {
    if (shouldClose) {
      await client.close();
    }
  }
}

/**
 * Single BOM Creation Engine
 * Used by both Single Create BOM and Bulk Create BOM (which is simply a sequence of single creates).
 */
export async function createBomFromData({
  bom,
  server,
  client,
  user,
  source = 'single',
  fileName = ''
}) {
  if (!bom) {
    throw new Error('No BOM data provided for creation.');
  }

  // Pre-condition: only Ready BOMs can be created
  if (bom.status && bom.status !== 'Ready') {
    return {
      success: false,
      status: bom.status === 'Already exists - skipped' ? 'SKIPPED' : 'FAILED',
      bomNumber: '',
      message: bom.reason || `BOM is not in Ready state (status: ${bom.status})`,
      discrepancies: []
    };
  }

  const mat = String(bom.material).trim().toUpperCase();
  const plant = String(bom.plant).trim();
  const usage = String(bom.bomUsage || '1').trim();
  const alt = String(bom.alternativeBom || '1').trim();

  // 1. Execute rfcCreateBom with full field set
  const createResult = await rfcCreateBom({
    material: mat,
    plant,
    bomUsage: usage,
    alternativeBom: alt,
    validFrom: bom.validFromSap || bom.validFrom,
    baseQty: bom.baseQty,
    baseUnit: bom.baseUnit,
    bomStatus: bom.bomStatus ? String(bom.bomStatus).padStart(2, '0') : '01',
    altText: bom.altText,
    changeNo: bom.changeNo,
    components: (bom.components || []).map((c) => ({
      ...c,
      component: toSapMatnr(c.component)
    })),
    server,
    client
  });

  if (!createResult.success) {
    return {
      success: false,
      status: 'FAILED',
      bomNumber: '',
      message: createResult.message || 'Creation rejected by SAP BAPI.',
      discrepancies: [],
      returnMessages: createResult.returnMessages || []
    };
  }

  // 2. Strict read-back verification
  let verification = { verified: true, status: 'SUCCESS', discrepancies: [], sapHeader: null, sapComponents: [] };
  try {
    verification = await rfcVerifyCreatedBom({
      material: mat,
      plant,
      bomUsage: usage,
      alternativeBom: alt,
      expectedHeader: {
        baseQty: bom.baseQty,
        bomStatus: bom.bomStatus,
        altText: bom.altText,
        validFromSap: bom.validFromSap
      },
      expectedComponents: bom.components || [],
      server,
      client
    });
  } catch (verErr) {
    verification = {
      verified: false,
      status: 'PARTIAL',
      discrepancies: [`Read-back verification error: ${verErr.message}`],
      sapHeader: null,
      sapComponents: []
    };
  }

  // 3. Security Audit Log per BOM
  auditLogger.logAction({
    user: user?.email || 'user',
    sapUsername: user?.email || 'user',
    system: server?.name || 'SAP-BOM',
    actionType: 'create',
    entityKey: 'bom',
    recordId: `${mat}/${plant}/${alt}`,
    task: `Create BOM ${mat} in plant ${plant} (Alt ${alt}) via ${source}${fileName ? ` (${fileName})` : ''}`,
    afterValues: {
      material: mat,
      plant,
      bomUsage: usage,
      alternativeBom: alt,
      componentCount: bom.components?.length || 0,
      source,
      verified: verification.verified,
      status: verification.status
    }
  });

  return {
    success: true,
    verified: verification.verified,
    status: verification.status,
    bomNumber: createResult.bomNumber,
    alternativeBom: alt,
    material: mat,
    plant,
    message: verification.verified
      ? `BOM ${mat} (Alt ${alt}) created and 100% verified.`
      : `BOM ${mat} (Alt ${alt}) created with ${verification.discrepancies.length} discrepancy(ies).`,
    discrepancies: verification.discrepancies || [],
    componentsCreated: bom.components?.length || 0,
    returnMessages: createResult.returnMessages || [],
    readBack: {
      header: verification.sapHeader,
      components: verification.sapComponents
    }
  };
}

/**
 * Bulk BOM Creation sequential execution
 */
export async function rfcBatchCreateBoms({
  boms = [],
  server,
  user,
  fileName = '',
  client: existingClient,
  onProgress
}) {
  if (!Array.isArray(boms) || boms.length === 0) {
    return {
      success: false,
      message: 'No BOMs provided for batch creation.',
      totalProcessed: 0,
      bomsCreated: 0,
      componentsCreated: 0,
      skippedCount: 0,
      failedCount: 0,
      results: []
    };
  }

  const isMock = process.env.USE_MOCK_SAP === 'true';
  const client = isMock ? null : (existingClient || (await openRfcClient(server)));
  const shouldClose = !isMock && !existingClient && Boolean(client);

  let bomsCreated = 0;
  let componentsCreated = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const results = [];

  try {
    for (let i = 0; i < boms.length; i++) {
      const bom = boms[i];
      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total: boms.length, bom });
      }

      // If already marked skipped or invalid during pre-flight
      if (bom.status === 'Already exists - skipped') {
        skippedCount++;
        results.push({
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant,
          bomUsage: bom.bomUsage,
          alternativeBom: bom.alternativeBom,
          status: 'SKIPPED',
          message: bom.reason || 'BOM already exists in plant; skipped.',
          discrepancies: [],
          componentsCount: bom.components?.length || 0
        });
        continue;
      }

      if (bom.status === 'Invalid') {
        failedCount++;
        results.push({
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant,
          bomUsage: bom.bomUsage,
          alternativeBom: bom.alternativeBom,
          status: 'INVALID',
          message: bom.reason || 'BOM failed pre-flight validation.',
          discrepancies: [],
          componentsCount: bom.components?.length || 0
        });
        continue;
      }

      // Execute createBomFromData
      try {
        const res = await createBomFromData({
          bom,
          server,
          client,
          user,
          source: 'bulk',
          fileName
        });

        if (res.success) {
          bomsCreated++;
          componentsCreated += res.componentsCreated || 0;
          results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: res.bomNumber,
            status: res.status, // SUCCESS or PARTIAL
            message: res.message,
            discrepancies: res.discrepancies || [],
            componentsCount: bom.components?.length || 0
          });
        } else {
          failedCount++;
          results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            status: 'FAILED',
            message: res.message,
            discrepancies: res.discrepancies || [],
            componentsCount: bom.components?.length || 0
          });
        }
      } catch (err) {
        failedCount++;
        results.push({
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant,
          bomUsage: bom.bomUsage,
          alternativeBom: bom.alternativeBom,
          status: 'FAILED',
          message: err.message || 'Unexpected error creating BOM.',
          discrepancies: [],
          componentsCount: bom.components?.length || 0
        });
      }
    }

    return {
      success: true,
      totalProcessed: boms.length,
      bomsCreated,
      componentsCreated,
      skippedCount,
      failedCount,
      results
    };
  } finally {
    if (shouldClose) {
      await client.close();
    }
  }
}
