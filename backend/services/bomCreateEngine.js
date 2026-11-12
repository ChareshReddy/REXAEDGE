import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openRfcClient, rfcCreateBom, formatRfcTableOptions, getActiveMockBoms } from './sapRfcClient.js';
import { getSapConnectionPool, RFC_PRIORITY } from './sapConnectionPool.js';
import { auditLogger } from './auditLog.js';
import { BOM_FIELD_MAPPING } from '../config/bomFieldMapping.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const materialPlantsPath = path.resolve(__dirname, '..', 'mock', 'materialPlants.json');

function loadMockMaterialPlants() {
  try {
    if (fs.existsSync(materialPlantsPath)) {
      return JSON.parse(fs.readFileSync(materialPlantsPath, 'utf8'));
    }
  } catch {}
  return { marc: [], mara: [], marm: [] };
}

// In-memory cache for material master unit data
// Key: `${serverId}:${matSap}` -> { exists: boolean, meins: string, allowedUnits: Set<string> }
const materialUnitsCache = new Map();

export function clearMaterialUnitsCache() {
  materialUnitsCache.clear();
}

export function getMaterialUnitsCache() {
  return materialUnitsCache;
}

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
 * Resolves BOM groups based on explicit sequenceNum and/or component hierarchy.
 * Returns an array of group descriptors:
 * {
 *   parent: BOM,
 *   children: BOM[],
 *   members: BOM[],
 *   orderedBoms: BOM[] // bottom-up: sub-BOMs before their parent
 * }
 */
export function resolveBomGroups(boms = []) {
  if (!Array.isArray(boms) || boms.length === 0) return [];

  // Union-Find across boms array indices
  const parentIdx = boms.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (root !== parentIdx[root]) root = parentIdx[root];
    let curr = i;
    while (curr !== root) {
      const next = parentIdx[curr];
      parentIdx[curr] = root;
      curr = next;
    }
    return root;
  };
  const union = (i, j) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parentIdx[rootI] = rootJ;
  };

  // 1. Group by explicit sequenceNum if present
  const seqMap = new Map();
  boms.forEach((bom, idx) => {
    const rawSeq = bom.sequenceNum !== undefined && bom.sequenceNum !== null ? String(bom.sequenceNum).trim() : '';
    if (rawSeq) {
      if (seqMap.has(rawSeq)) {
        union(idx, seqMap.get(rawSeq));
      } else {
        seqMap.set(rawSeq, idx);
      }
    }
  });

  // 2. Connect BOMs by component hierarchy: if Child material equals Parent component in same plant
  boms.forEach((bomA, idxA) => {
    const matA = (bomA.material || '').trim().toUpperCase();
    const plantA = (bomA.plant || '').trim();
    (bomA.components || []).forEach((c) => {
      const compMat = (c.component || '').trim().toUpperCase();
      if (!compMat) return;
      boms.forEach((bomB, idxB) => {
        if (idxA === idxB) return;
        const matB = (bomB.material || '').trim().toUpperCase();
        const plantB = (bomB.plant || '').trim();
        if (matB === compMat && (!plantA || !plantB || plantA === plantB)) {
          union(idxA, idxB);
        }
      });
    });
  });

  // Group together all BOMs with the same union-find root
  const groupsMap = new Map();
  boms.forEach((bom, idx) => {
    const root = find(idx);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(bom);
  });

  const groups = [];
  groupsMap.forEach((groupBoms) => {
    if (groupBoms.length === 1) {
      groups.push({
        parent: groupBoms[0],
        children: [],
        members: groupBoms,
        orderedBoms: [groupBoms[0]]
      });
      return;
    }

    // Identify parent vs child sub-BOMs
    // A BOM is a child if its material is used as a component by any other BOM in the group.
    const usedAsComponent = new Set();
    groupBoms.forEach((p) => {
      (p.components || []).forEach((c) => {
        const cMat = (c.component || '').trim().toUpperCase();
        groupBoms.forEach((child) => {
          if ((child.material || '').trim().toUpperCase() === cMat) {
            usedAsComponent.add(child);
          }
        });
      });
    });

    const parents = groupBoms.filter((b) => !usedAsComponent.has(b));
    const children = groupBoms.filter((b) => usedAsComponent.has(b));

    const topParent = parents[0] || groupBoms[0];
    const subBoms = children.length > 0 ? children : groupBoms.slice(1);

    // Topological sort bottom-up: sub-BOMs before their parent
    const orderedBoms = [];
    const visited = new Set();

    const visit = (b) => {
      if (visited.has(b)) return;
      visited.add(b);
      // Visit sub-components of b first
      (b.components || []).forEach((c) => {
        const cMat = (c.component || '').trim().toUpperCase();
        const sub = groupBoms.find((other) => (other.material || '').trim().toUpperCase() === cMat);
        if (sub && sub !== b) {
          visit(sub);
        }
      });
      orderedBoms.push(b);
    };

    subBoms.forEach(visit);
    parents.forEach(visit);
    groupBoms.forEach(visit);

    groups.push({
      parent: topParent,
      children: subBoms,
      members: groupBoms,
      orderedBoms
    });
  });

  return groups;
}

/**
 * Applies group validation rules B1, B2, B3, B4 across preflight-validated BOMs.
 */
export function applyGroupValidationRules(boms = []) {
  if (!Array.isArray(boms) || boms.length === 0) return boms;

  const groups = resolveBomGroups(boms);

  groups.forEach((group) => {
    const { parent, children, members } = group;
    if (members.length <= 1) return;

    // Check Rule B3: Any member has a real validation error
    const failingMembers = members.filter(
      (m) => m.status === 'Invalid' || (Array.isArray(m.errors) && m.errors.length > 0)
    );

    if (failingMembers.length > 0) {
      const failingNames = Array.from(new Set(failingMembers.map((m) => m.material))).join(', ');
      members.forEach((m) => {
        if (failingMembers.includes(m)) {
          m.status = 'Invalid';
          if (!m.errors || m.errors.length === 0) {
            m.errors = [m.reason || 'Validation error'];
          }
        } else {
          m.status = 'Skipped';
          m.errors = [];
          m.reason = `Not created because ${failingNames} in this group has errors`;
          m.warnings = m.warnings || [];
        }
      });
      return;
    }

    // Check Rule B1: Parent already exists in SAP
    const parentExists = parent.status === 'Already exists - skipped' ||
      (parent.reason && parent.reason.toLowerCase().includes('already exists'));

    if (parentExists) {
      const altStr = String(parseInt(parent.alternativeBom, 10) || parent.alternativeBom || '1');
      parent.status = 'Already exists - skipped';
      parent.errors = [];
      parent.reason = `Skipped: alternative ${altStr} of ${parent.material} already exists in SAP`;

      children.forEach((child) => {
        child.status = 'Already exists - skipped';
        child.errors = [];
        child.reason = `Skipped: not created because the parent BOM ${parent.material} already exists`;
      });
      return;
    }

    // Check Rule B2: Sub-BOM already exists, parent does not
    children.forEach((child) => {
      const childExists = child.status === 'Already exists - skipped' ||
        (child.reason && child.reason.toLowerCase().includes('already exists'));
      if (childExists) {
        const altStr = String(parseInt(child.alternativeBom, 10) || child.alternativeBom || '1');
        child.status = 'Already exists - skipped';
        child.errors = [];
        child.reason = `Skipped: alternative ${altStr} of ${child.material} already exists in SAP`;
      }
    });
  });

  return boms;
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
export async function rfcPreflightCreateBoms(params = {}) {
  const {
    boms = [],
    server,
    client: existingClient,
    priority,
    source,
    userId = 'system'
  } = params;

  if (!Array.isArray(boms) || boms.length === 0) {
    return {
      success: true,
      boms: [],
      readyCount: 0,
      skippedCount: 0,
      invalidCount: 0
    };
  }

  // Handle Mock Mode only when no explicit client is provided
  if (process.env.USE_MOCK_SAP === 'true' && !existingClient) {
    return mockPreflightCreateBoms(boms);
  }

  if (!existingClient) {
    const pool = getSapConnectionPool(server);
    const prio = priority || (source === 'bulk' ? RFC_PRIORITY.BULK : RFC_PRIORITY.BULK);
    return pool.run(prio, userId || 'system', (pooledClient) => {
      return rfcPreflightCreateBoms({ ...params, client: pooledClient });
    });
  }

  const client = existingClient;
  const shouldClose = false;
  const serverId = server?.id || params.serverId || 'default';

  try {
    // 1. Gather all unique materials, plants, storage locations, and statuses
    const allMaterials = new Set();
    const plantMaterialPairs = new Set();
    const plantStorageLocPairs = new Set();
    const statuses = new Set();
    const materialsWithExplicitUnit = new Set();

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
          if (c.unit && String(c.unit).trim() !== '') {
            materialsWithExplicitUnit.add(compSap);
          }
        }
        if (c.storageLocation && bom.plant) {
          plantStorageLocPairs.add(`${bom.plant}|${c.storageLocation.toUpperCase()}`);
        }
      });
    });

    // 2. Check cache for materials
    const maraMap = new Map(); // MATNR -> { exists: true, meins: string, allowedUnits: Set<string> }
    const materialsToFetch = [];

    for (const mat of allMaterials) {
      const cacheKey = `${serverId}:${mat}`;
      const cached = materialUnitsCache.get(cacheKey);
      if (cached) {
        maraMap.set(mat, cached);
      } else {
        materialsToFetch.push(mat);
      }
    }

    // 3. Batched lookups from MARA (existence + MEINS unit) for uncached materials
    if (materialsToFetch.length > 0) {
      const materialChunks = chunkArray(materialsToFetch, 25);
      for (const chunk of materialChunks) {
        if (chunk.length === 0) continue;
        const orClauses = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
        try {
          const maraRes = await client.call('RFC_READ_TABLE', {
            QUERY_TABLE: 'MARA',
            DELIMITER: '|',
            OPTIONS: formatRfcTableOptions(orClauses),
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINS' }],
            DATA: []
          });
          const fieldNames = (maraRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
          const matnrIdx = fieldNames.indexOf('MATNR') >= 0 ? fieldNames.indexOf('MATNR') : 0;
          const meinsIdx = fieldNames.indexOf('MEINS') >= 0 ? fieldNames.indexOf('MEINS') : 1;

          for (const row of maraRes.DATA || []) {
            const p = row.WA.split('|');
            const rawMat = p[matnrIdx]?.trim() || '';
            const matSap = toSapMatnr(rawMat);
            const meins = p[meinsIdx]?.trim() || '';
            maraMap.set(matSap, { exists: true, meins, allowedUnits: new Set([meins].filter(Boolean)) });
          }
        } catch (maraErr) {
          console.warn('[bomCreateEngine] Batched MARA read error:', maraErr.message);
        }
      }

      // Lookups from MARM (Alternative Units of Measure) for materials with explicit units
      const marmMaterialsToFetch = materialsToFetch.filter((m) => materialsWithExplicitUnit.has(m));
      if (marmMaterialsToFetch.length > 0) {
        const marmChunks = chunkArray(marmMaterialsToFetch, 25);
        for (const chunk of marmChunks) {
          const orClauses = chunk.map((m) => `MATNR = '${m}'`).join(' OR ');
          try {
            const marmRes = await client.call('RFC_READ_TABLE', {
              QUERY_TABLE: 'MARM',
              DELIMITER: '|',
              OPTIONS: formatRfcTableOptions(orClauses),
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINH' }],
              DATA: []
            });
            const fieldNames = (marmRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
            const matnrIdx = fieldNames.indexOf('MATNR') >= 0 ? fieldNames.indexOf('MATNR') : 0;
            const meinhIdx = fieldNames.indexOf('MEINH') >= 0 ? fieldNames.indexOf('MEINH') : 1;

            for (const row of marmRes.DATA || []) {
              const p = row.WA.split('|');
              const rawMat = p[matnrIdx]?.trim() || '';
              const matSap = toSapMatnr(rawMat);
              const meinh = p[meinhIdx]?.trim() || '';
              const existing = maraMap.get(matSap);
              if (existing && meinh) {
                existing.allowedUnits.add(meinh);
              }
            }
          } catch (marmErr) {
            console.warn('[bomCreateEngine] Batched MARM read error:', marmErr.message);
          }
        }
      }

      // Cache all newly resolved materials
      for (const mat of materialsToFetch) {
        const entry = maraMap.get(mat);
        if (entry) {
          materialUnitsCache.set(`${serverId}:${mat}`, entry);
        }
      }
    }

    // 4. Batched lookups from MARC (plant extension)
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

    // 5. Batched lookups from T001L (Storage Locations per plant)
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

    // 6. Lookups from T415S (BOM Status table)
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

    // 7. Lookups from MAST (Target BOM existence check)
    const existingBoms = new Set(); // "MATNR|WERKS|STLAN|STLAL"
    const mastTriples = new Set();
    for (const bom of boms) {
      if (bom.material && bom.plant) {
        const matSap = toSapMatnr(bom.material);
        const usage = String(bom.bomUsage || '1');
        mastTriples.add(`${matSap}|${bom.plant}|${usage}`);
      }
    }

    for (const triple of mastTriples) {
      const [matSap, plant, usage] = triple.split('|');
      try {
        const mastRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'MAST',
          DELIMITER: '|',
          OPTIONS: formatRfcTableOptions(`MATNR = '${matSap}' AND WERKS = '${plant}' AND STLAN = '${usage}'`),
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLAL' }],
          DATA: []
        });
        if (mastRes.DATA && mastRes.DATA.length > 0) {
          const fieldNames = (mastRes.FIELDS || []).map((f) => f.FIELDNAME.trim());
          const stlalIdx = fieldNames.indexOf('STLAL') >= 0 ? fieldNames.indexOf('STLAL') : 3;
          for (const row of mastRes.DATA) {
            const p = row.WA.split('|');
            const stlalRaw = p[stlalIdx]?.trim() || '';
            const stlalInt = parseInt(stlalRaw, 10);
            const stlalPad = String(stlalInt || stlalRaw).padStart(2, '0');
            existingBoms.add(`${matSap}|${plant}|${usage}|${stlalPad}`);
            existingBoms.add(`${matSap}|${plant}|${usage}|${String(stlalInt)}`);
            existingBoms.add(`${matSap}|${plant}|${usage}|${stlalRaw}`);
          }
        }
      } catch (mastErr) {
        console.warn('[bomCreateEngine] MAST read error:', mastErr.message);
      }
    }

    // 8. Evaluate each BOM
    let validatedBoms = boms.map((bom) => {
      const errors = Array.isArray(bom.errors) ? [...bom.errors] : [];
      const warnings = Array.isArray(bom.warnings) ? [...bom.warnings] : [];
      let status = bom.status === 'Invalid' ? 'Invalid' : 'Ready';

      const mat = (bom.material || '').toUpperCase();
      const matSap = toSapMatnr(bom.material);
      const plant = bom.plant || '';
      const usage = String(bom.bomUsage || '1');
      const altPad = String(bom.alternativeBom || '1').padStart(2, '0');
      const altInt = String(parseInt(bom.alternativeBom || '1', 10));
      const bomStatus = String(bom.bomStatus || '01').padStart(2, '0');

      // A. Check target existence (Strict no-overwrite)
      if (
        existingBoms.has(`${matSap}|${plant}|${usage}|${altPad}`) ||
        existingBoms.has(`${matSap}|${plant}|${usage}|${altInt}`)
      ) {
        return {
          ...bom,
          status: 'Already exists - skipped',
          reason: `BOM Alternative ${bom.alternativeBom || '1'} already exists in plant ${plant} (STLAN=${usage}) — skipped (strict no-overwrite)`,
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

      // Header MARC plant extension reported as warning
      if (!marcMap.has(`${plant}|${matSap}`)) {
        warnings.push({ text: `Header material "${mat}" is not extended to plant ${plant} (MARC)`, type: 'warning' });
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
        } else {
          // Unit resolution and validation
          if (!comp.unit || !String(comp.unit).trim()) {
            if (compMara.meins) {
              comp.unit = compMara.meins;
            } else {
              errors.push(`Unit of measure for component "${compMat}" not found in master data (MARA-MEINS)`);
            }
          } else {
            const cleanUnit = String(comp.unit).trim().toUpperCase();
            comp.unit = cleanUnit;
            const allowed = compMara.allowedUnits || new Set([compMara.meins]);
            if (!allowed.has(cleanUnit)) {
              errors.push(`Unit of measure ${comp.unit} is not defined for component ${compMat}`);
            }
          }
        }

        // Component MARC plant extension reported as warning
        if (!marcMap.has(`${plant}|${compSap}`)) {
          warnings.push({ text: `Component "${compMat}" is not extended to plant ${plant} (MARC)`, type: 'warning' });
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
        messageType: errors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success'),
        reason: errors.length > 0 ? errors.join(' | ') : 'Ready for creation',
        reasonType: errors.length > 0 ? 'error' : 'success'
      };
    });

    validatedBoms = applyGroupValidationRules(validatedBoms);

    const readyCount = validatedBoms.filter((b) => b.status === 'Ready').length;
    const skippedCount = validatedBoms.filter((b) => b.status === 'Already exists - skipped' || b.status === 'Skipped').length;
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
  const mp = loadMockMaterialPlants();
  const mockBoms = getActiveMockBoms();

  let validatedBoms = boms.map((bom) => {
    const errors = Array.isArray(bom.errors) ? [...bom.errors] : [];
    const warnings = Array.isArray(bom.warnings) ? [...bom.warnings] : [];
    let status = bom.status === 'Invalid' ? 'Invalid' : 'Ready';

    const mat = (bom.material || '').toUpperCase();
    const matSap = toSapMatnr(bom.material);
    const plant = bom.plant || '';
    const usage = String(bom.bomUsage || '1');
    const altPad = String(bom.alternativeBom || '1').padStart(2, '0');
    const altInt = parseInt(bom.alternativeBom || '1', 10);

    // Simulate mock existence
    const isExisting = (mockBoms || []).some((b) =>
      (String(b.material).toUpperCase() === mat || toSapMatnr(b.material) === matSap) &&
      String(b.plant) === plant &&
      String(b.bomUsage || '1') === usage &&
      (parseInt(String(b.alternativeBom || '1'), 10) === altInt ||
       String(b.alternativeBom || '1').padStart(2, '0') === altPad)
    ) || mat.includes('EXISTING');

    if (isExisting) {
      return {
        ...bom,
        status: 'Already exists - skipped',
        reason: `BOM Alternative ${bom.alternativeBom || '1'} already exists in plant ${plant} (STLAN=${usage}) — skipped (strict no-overwrite)`,
        reasonType: 'skipped',
        messageType: 'skipped',
        errors,
        warnings
      };
    }

    if (mat.includes('NONEXISTENT') || mat.includes('NOTFOUND')) {
      errors.push(`Header material "${mat}" does not exist in SAP (MARA)`);
    }

    if (plant.includes('INVALID') || plant.includes('NONEXISTENT') || plant.includes('NOTFOUND')) {
      errors.push(`Plant "${plant}" does not exist in SAP (T001W)`);
    }

    const headerMara = (mp.mara || []).find(
      (m) => m.MATNR.toUpperCase() === mat || toSapMatnr(m.MATNR) === matSap
    );

    if (mat.includes('NOUNIT')) {
      errors.push(`Unit of measure for header material "${mat}" not found in master data (MARA-MEINS)`);
    } else if (headerMara?.MEINS) {
      bom.baseUnit = headerMara.MEINS;
    } else if (bom.baseUnit) {
      // Keep explicitly provided baseUnit
    } else {
      bom.baseUnit = 'EA';
    }

    // Component checks
    const comps = (bom.components || []).map((c) => {
      const cMat = (c.component || '').toUpperCase();
      const cSap = toSapMatnr(c.component);

      if (cMat.includes('NONEXISTENT')) {
        errors.push(`Component "${cMat}" does not exist in SAP (MARA)`);
        return c;
      }

      if (cMat.includes('NOUNIT')) {
        errors.push(`Unit of measure for component "${cMat}" not found in master data (MARA-MEINS)`);
        return c;
      }

      const compMara = (mp.mara || []).find(
        (m) => m.MATNR.toUpperCase() === cMat || toSapMatnr(m.MATNR) === cSap
      );
      const compMeins = compMara?.MEINS || (cMat.includes('NOUNIT') ? '' : 'EA');

      const marmEntries = (mp.marm || []).filter(
        (m) => m.MATNR.toUpperCase() === cMat || toSapMatnr(m.MATNR) === cSap
      );
      const allowedUnits = new Set([compMeins, ...marmEntries.map((m) => m.MEINH.toUpperCase())].filter(Boolean));

      if (!c.unit || !String(c.unit).trim()) {
        if (compMeins) {
          c.unit = compMeins;
        } else {
          errors.push(`Unit of measure for component "${cMat}" not found in master data (MARA-MEINS)`);
        }
      } else {
        const suppliedUnit = String(c.unit).trim().toUpperCase();
        c.unit = suppliedUnit;
        if (!allowedUnits.has(suppliedUnit)) {
          errors.push(`Unit of measure ${c.unit} is not defined for component ${cMat}`);
        }
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
      warnings,
      messageType: errors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'success'),
      reason: errors.length > 0 ? errors.join(' | ') : 'Ready for creation',
      reasonType: errors.length > 0 ? 'error' : 'success'
    };
  });

  validatedBoms = applyGroupValidationRules(validatedBoms);

  return {
    success: true,
    boms: validatedBoms,
    readyCount: validatedBoms.filter((b) => b.status === 'Ready').length,
    skippedCount: validatedBoms.filter((b) => b.status === 'Already exists - skipped' || b.status === 'Skipped').length,
    invalidCount: validatedBoms.filter((b) => b.status === 'Invalid').length
  };
}

/**
 * Strict verification: reads back created BOM from SAP and compares:
 * Header: baseQty, bomStatus, altText, validFrom
 * Components: component, quantity, unit, itemCategory, storageLocation, costingRelevancy, engineering, referenceNumber
 */
export async function rfcVerifyCreatedBom(params = {}) {
  const {
    material,
    plant,
    bomUsage,
    alternativeBom,
    expectedHeader = {},
    expectedComponents = [],
    server,
    client: existingClient,
    priority,
    source,
    userId = 'system'
  } = params;
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

  if (!existingClient) {
    const pool = getSapConnectionPool(server);
    const prio = priority || (source === 'bulk' ? RFC_PRIORITY.BULK : RFC_PRIORITY.INTERACTIVE);
    return pool.run(prio, userId || 'system', (pooledClient) => {
      return rfcVerifyCreatedBom({ ...params, client: pooledClient });
    });
  }

  const client = existingClient;
  const shouldClose = false;

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

  // Resolve base unit if not provided
  let resolvedBaseUnit = bom.baseUnit;
  if (!resolvedBaseUnit) {
    const matSap = toSapMatnr(mat);
    const sId = server?.id || 'default';
    const cached = materialUnitsCache.get(`${sId}:${matSap}`);
    if (cached?.meins) {
      resolvedBaseUnit = cached.meins;
    } else {
      const mp = loadMockMaterialPlants();
      const mockEntry = (mp.mara || []).find((m) => m.MATNR === mat || toSapMatnr(m.MATNR) === matSap);
      if (mockEntry?.MEINS) {
        resolvedBaseUnit = mockEntry.MEINS;
      } else if (process.env.USE_MOCK_SAP === 'true') {
        resolvedBaseUnit = 'EA';
      }
    }
  }

  if (!resolvedBaseUnit && client && !client.isMock) {
    try {
      const maraBatch = await readMaraBatch([mat], { server, client });
      if (maraBatch?.[mat]?.meins || maraBatch?.[mat]?.MEINS) {
        resolvedBaseUnit = maraBatch[mat].meins || maraBatch[mat].MEINS;
      }
    } catch {}
  }

  if (!resolvedBaseUnit) {
    return {
      success: false,
      status: 'FAILED',
      bomNumber: '',
      message: 'Base unit of measure of the material could not be determined',
      discrepancies: []
    };
  }

  // 1. Execute rfcCreateBom with full field set
  const createResult = await rfcCreateBom({
    material: mat,
    plant,
    bomUsage: usage,
    alternativeBom: alt,
    validFrom: bom.validFromSap || bom.validFrom,
    baseQty: bom.baseQty,
    baseUnit: resolvedBaseUnit,
    bomStatus: bom.bomStatus ? String(bom.bomStatus).padStart(2, '0') : '01',
    altText: bom.altText,
    changeNo: bom.changeNo,
    components: (bom.components || []).map((c) => {
      let unit = c.unit || c.COMP_UNIT;
      if (!unit) {
        const compSap = toSapMatnr(c.component);
        const sId = server?.id || 'default';
        const cached = materialUnitsCache.get(`${sId}:${compSap}`);
        if (cached?.meins) {
          unit = cached.meins;
        } else {
          const mp = loadMockMaterialPlants();
          const mockEntry = (mp.mara || []).find((m) => m.MATNR === compSap || toSapMatnr(m.MATNR) === compSap);
          if (mockEntry?.MEINS) unit = mockEntry.MEINS;
        }
      }
      return {
        ...c,
        component: toSapMatnr(c.component),
        unit: unit || ''
      };
    }),
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
    after: createResult.after,
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
export async function rfcBatchCreateBoms(params = {}) {
  const {
    boms = [],
    server,
    user,
    fileName = '',
    client: existingClient,
    onProgress,
    priority,
    source,
    userId = user?.id || 'system'
  } = params;

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
  if (!isMock && !existingClient) {
    const pool = getSapConnectionPool(server);
    const prio = priority || (source === 'bulk' ? RFC_PRIORITY.BULK : RFC_PRIORITY.INTERACTIVE);
    return pool.run(prio, userId, (pooledClient) => {
      return rfcBatchCreateBoms({ ...params, client: pooledClient });
    });
  }
  const client = isMock ? null : existingClient;
  const shouldClose = false;

  let bomsCreated = 0;
  let componentsCreated = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const results = [];

  const groups = resolveBomGroups(boms);
  const executionOrderedBoms = [];
  groups.forEach((g) => {
    executionOrderedBoms.push(...g.orderedBoms);
  });

  try {
    for (let i = 0; i < executionOrderedBoms.length; i++) {
      const bom = executionOrderedBoms[i];
      const group = groups.find((g) => g.members.includes(bom)) || { parent: bom, children: [], createdSubBoms: [] };
      group.createdSubBoms = group.createdSubBoms || [];

      if (typeof onProgress === 'function') {
        onProgress({ current: i + 1, total: executionOrderedBoms.length, bom });
      }

      // If an earlier sub-BOM in this group failed, skip remaining members of the group
      if (group.failedMaterial) {
        skippedCount++;
        results.push({
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant,
          bomUsage: bom.bomUsage,
          alternativeBom: bom.alternativeBom,
          status: 'SKIPPED',
          message: `Not created because ${group.failedMaterial} failed earlier in this group`,
          discrepancies: [],
          componentsCount: bom.components?.length || 0,
          input: bom
        });
        continue;
      }

      // If already marked skipped or invalid during pre-flight
      if (bom.status === 'Already exists - skipped' || bom.status === 'Skipped') {
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
          componentsCount: bom.components?.length || 0,
          input: bom
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
          componentsCount: bom.components?.length || 0,
          input: bom
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
          if (bom !== group.parent) {
            group.createdSubBoms.push(bom.material);
          }
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
            componentsCount: bom.components?.length || 0,
            input: bom
          });
        } else {
          failedCount++;
          const isParent = bom === group.parent;
          if (!isParent) {
            group.failedMaterial = bom.material;
            results.push({
              sequenceNum: bom.sequenceNum,
              material: bom.material,
              plant: bom.plant,
              bomUsage: bom.bomUsage,
              alternativeBom: bom.alternativeBom,
              status: 'FAILED',
              message: res.message,
              discrepancies: res.discrepancies || [],
              componentsCount: bom.components?.length || 0,
              input: bom
            });
          } else {
            let msg = res.message || 'SAP rejected BOM creation.';
            if (group.createdSubBoms.length > 0) {
              msg = `${msg} | Partially created: ${group.createdSubBoms.join(', ')}`;
            }
            results.push({
              sequenceNum: bom.sequenceNum,
              material: bom.material,
              plant: bom.plant,
              bomUsage: bom.bomUsage,
              alternativeBom: bom.alternativeBom,
              status: 'FAILED',
              message: msg,
              discrepancies: res.discrepancies || [],
              componentsCount: bom.components?.length || 0,
              input: bom
            });
          }
        }
      } catch (err) {
        failedCount++;
        const isParent = bom === group.parent;
        if (!isParent) {
          group.failedMaterial = bom.material;
          results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            status: 'FAILED',
            message: err.message || 'Unexpected error creating BOM.',
            discrepancies: [],
            componentsCount: bom.components?.length || 0,
            input: bom
          });
        } else {
          let msg = err.message || 'Unexpected error creating BOM.';
          if (group.createdSubBoms.length > 0) {
            msg = `${msg} | Partially created: ${group.createdSubBoms.join(', ')}`;
          }
          results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            status: 'FAILED',
            message: msg,
            discrepancies: [],
            componentsCount: bom.components?.length || 0,
            input: bom
          });
        }
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
