/**
 * Shared Non-React Utility Functions for Bulk BOM Processing
 * Handles normalization, filtering, counts, merging, and group resolution.
 */

/**
 * Normalizes validation status into one of: 'ready', 'error', 'skipped', 'not_validated'
 */
export function normalizeBomStatus(bom) {
  if (!bom) return 'not_validated';
  const statusStr = String(bom.status || '').trim().toLowerCase();

  if (
    statusStr === 'failed' ||
    statusStr === 'error' ||
    statusStr === 'invalid' ||
    (Array.isArray(bom.errors) && bom.errors.length > 0) ||
    (Array.isArray(bom.problems) && bom.problems.length > 0)
  ) {
    return 'error';
  }
  if (
    statusStr === 'ready' ||
    statusStr === 'valid' ||
    statusStr === 'success'
  ) {
    return 'ready';
  }
  if (
    statusStr.includes('skipped') ||
    statusStr.includes('exist') ||
    statusStr === 'not_processed' ||
    statusStr === 'warning'
  ) {
    return 'skipped';
  }
  if (statusStr === 'pending' || !statusStr) {
    return 'not_validated';
  }
  return 'not_validated';
}

/**
 * Single source of truth for BOM counts across All, Ready, Errors, and Skipped.
 */
export function getBomStatusCounts(boms = [], hasValidated = true) {
  let ready = 0;
  let errors = 0;
  let skipped = 0;
  let notValidated = 0;

  (boms || []).forEach((b) => {
    if (!hasValidated) {
      notValidated++;
      return;
    }
    const s = normalizeBomStatus(b);
    if (s === 'ready') ready++;
    else if (s === 'error') errors++;
    else if (s === 'skipped') skipped++;
    else notValidated++;
  });

  return {
    all: (boms || []).length,
    ready,
    errors,
    skipped,
    notValidated
  };
}

/**
 * Filter BOMs by normalized status tab and search term together.
 */
export function filterBoms(boms = [], { statusFilter = 'all', searchTerm = '' } = {}) {
  const term = String(searchTerm || '').trim().toLowerCase();

  return (boms || []).filter((bom) => {
    const norm = normalizeBomStatus(bom);
    if (statusFilter === 'ready' && norm !== 'ready') return false;
    if (statusFilter === 'errors' && norm !== 'error') return false;
    if (statusFilter === 'skipped' && norm !== 'skipped') return false;

    if (term) {
      const matchMat = (bom.material || bom.sourceMaterial || '').toLowerCase().includes(term);
      const matchPlant = String(bom.plant || bom.sourcePlant || '').toLowerCase().includes(term);
      const matchTgtMat = String(bom.targetMaterial || '').toLowerCase().includes(term);
      const matchTgtPlant = String(bom.targetPlant || '').toLowerCase().includes(term);
      const matchSeq = String(bom.sequenceNum || bom.id || '').toLowerCase().includes(term);
      return matchMat || matchPlant || matchTgtMat || matchTgtPlant || matchSeq;
    }
    return true;
  });
}

/**
 * Safely merges validation outcomes into original parsed BOMs without overwriting parsed fields or dropping component rows.
 */
export function mergeValidationIntoBoms(originalBoms = [], validationResults = []) {
  if (!Array.isArray(originalBoms) || originalBoms.length === 0) return originalBoms || [];
  if (!Array.isArray(validationResults) || validationResults.length === 0) return originalBoms;

  const byBomKey = new Map();
  validationResults.forEach((res, idx) => {
    const mat = String(res.material || '').trim().toUpperCase();
    const plant = String(res.plant || '').trim();
    const usage = String(res.bomUsage || '1').trim();
    const alt = String(parseInt(res.alternativeBom, 10) || res.alternativeBom || '01').trim();
    const fullKey = `${mat}|${plant}|${usage}|${alt}`;
    if (!byBomKey.has(fullKey)) {
      byBomKey.set(fullKey, res);
    }
  });

  return originalBoms.map((origBom, idx) => {
    const mat = String(origBom.material || '').trim().toUpperCase();
    const plant = String(origBom.plant || '').trim();
    const usage = String(origBom.bomUsage || '1').trim();
    const alt = String(parseInt(origBom.alternativeBom, 10) || origBom.alternativeBom || '01').trim();
    const fullKey = `${mat}|${plant}|${usage}|${alt}`;
    const result = byBomKey.get(fullKey) || validationResults[idx] || {};

    const rawStatus = result.status || origBom.status || 'Pending';
    const reason = result.reason || result.message || origBom.reason || '';

    const errorsList = [];
    const addClean = (raw) => {
      if (!raw) return;
      const text = typeof raw === 'string' ? raw : (raw.message || JSON.stringify(raw));
      if (!text || typeof text !== 'string') return;
      if (text.includes(' | ')) {
        text.split(/\s*\|\s*/).forEach(addClean);
        return;
      }
      if (!errorsList.includes(text)) errorsList.push(text);
    };

    const isErrorStatus = ['failed', 'error', 'invalid'].includes(String(rawStatus).trim().toLowerCase());

    if (Array.isArray(result.errors)) {
      result.errors.forEach(addClean);
    }
    if (isErrorStatus) {
      if (result.reason) {
        addClean(result.reason);
      }
      if (result.message && result.message !== result.reason) {
        addClean(result.message);
      }
    }
    if (Array.isArray(origBom.errors) && isErrorStatus) {
      origBom.errors.forEach(addClean);
    }

    const origComponents = Array.isArray(origBom.components) ? origBom.components : [];
    const resComponents = Array.isArray(result.components) ? result.components : [];

    const mergedComponents = origComponents.map((comp, cIdx) => {
      const match = resComponents.find((r) => String(r.rowNum || '') === String(comp.rowNum || '')) || resComponents[cIdx] || {};
      return {
        ...comp,
        unit: match.unit || comp.unit || '',
        itemNo: match.itemNo || comp.itemNo || String((cIdx + 1) * 10).padStart(4, '0')
      };
    });

    return {
      ...origBom,
      ...result,
      status: rawStatus,
      reason,
      errors: errorsList,
      warnings: Array.isArray(result.warnings) ? result.warnings : (origBom.warnings || []),
      components: mergedComponents.length > 0 ? mergedComponents : origComponents
    };
  });
}

/**
 * Normalizes execution row status to 'CREATED' | 'FAILED' | 'SKIPPED'.
 * Ensures no row ever displays an unexecuted state (e.g., 'Ready') in the final Execution Details table.
 */
export function normalizeExecutionStatus(row) {
  if (!row) return 'FAILED';
  const status = String(row.status || '').toUpperCase();
  const rawMsg = Array.isArray(row.messages)
    ? row.messages.join(' ')
    : String(row.message || row.reason || '');
  const msg = rawMsg.toLowerCase();
  const hasErrors = Boolean(
    (row.errors && row.errors.length > 0) ||
    (row.problems && row.problems.length > 0) ||
    (row.discrepancies && row.discrepancies.length > 0) ||
    row.error ||
    row.failed === true ||
    row.success === false
  );

  // 1. Explicit Skipped status always takes precedence
  if (
    status === 'SKIPPED' ||
    status.includes('SKIP') ||
    status === 'ALREADY EXISTS - SKIPPED' ||
    status === 'NOT_PROCESSED'
  ) {
    return 'SKIPPED';
  }

  // 2. Explicit or implicit failure
  if (
    status === 'FAILED' ||
    status === 'ERROR' ||
    status === 'INVALID' ||
    hasErrors ||
    msg.includes('rejected') ||
    msg.includes('could not') ||
    msg.includes('dropped') ||
    (msg.includes('failed') && !msg.includes('failed earlier in this group')) ||
    (msg.includes('error') && !msg.includes('in this group has errors'))
  ) {
    return 'FAILED';
  }

  // 3. Fallback Skipped if message mentions skipped, already exists, or group blocked/failed
  if (
    msg.includes('already exists') ||
    msg.includes('skipped') ||
    msg.includes('failed earlier in this group') ||
    msg.includes('in this group has errors')
  ) {
    return 'SKIPPED';
  }

  // 4. Succeeded / Created
  if (
    status === 'SUCCESS' ||
    status === 'CREATED' ||
    status === 'READY' ||
    status === 'VALID' ||
    row.success === true ||
    row.bomNumber
  ) {
    return 'CREATED';
  }

  return 'FAILED';
}

/**
 * Resolves BOM groups based on explicit sequenceNum and/or component hierarchy.
 */
export function resolveBomGroups(boms = []) {
  if (!Array.isArray(boms) || boms.length === 0) return [];

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

  // 2. Connect BOMs by component hierarchy
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

    const orderedBoms = [];
    const visited = new Set();

    const visit = (b) => {
      if (visited.has(b)) return;
      visited.add(b);
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
