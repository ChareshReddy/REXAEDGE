/**
 * Shared Non-React Utility Functions for Bulk BOM Processing
 * Handles normalization, filtering, counts, merging, and group resolution.
 */

/**
 * Single source of truth for classifying any BOM object or BOM group.
 * Guarantees exactly one status: 'ready', 'error', 'skipped', or 'not_validated'.
 *
 * Rules:
 * - If hasValidated is false or unvalidated/pending -> 'not_validated'
 * - An error anywhere on the BOM (header or any component row) -> 'error' (even if it also has warnings)
 * - If not error, a skipped status or existing alternative -> 'skipped'
 * - If not error and not skipped -> 'ready' (even if it has warnings)
 * - Guarantees: Ready + Errors + Skipped = Total BOMs (for validated BOMs)
 */
export function classifyBomStatus(bom, hasValidated = true) {
  if (!bom) return 'not_validated';

  // If validation has not run, rows are 'not_validated'
  if (!hasValidated) {
    return 'not_validated';
  }

  const rawStatus = String(bom.status || '').trim().toLowerCase();
  const rawMsg = String(bom.message || bom.reason || '').trim().toLowerCase();

  // If status is explicitly pending or not validated
  if (
    rawStatus === 'pending' ||
    rawStatus === 'not_validated' ||
    rawStatus === 'not validated' ||
    rawStatus === 'unvalidated' ||
    (!rawStatus && !bom.errors && !bom.problems && !bom.warnings && !bom.components)
  ) {
    return 'not_validated';
  }

  // 1. ERROR CHECK: Error takes precedence over warnings and skipped
  const hasHeaderErrors =
    rawStatus === 'failed' ||
    rawStatus === 'error' ||
    rawStatus === 'invalid' ||
    bom.failed === true ||
    bom.messageType === 'error' ||
    bom.reasonType === 'error' ||
    (Array.isArray(bom.errors) && bom.errors.length > 0) ||
    (Array.isArray(bom.problems) && bom.problems.length > 0);

  // Check component rows for errors (for grouped BOMs in Bulk Create)
  const hasComponentErrors =
    Array.isArray(bom.components) &&
    bom.components.some((c) => {
      if (!c) return false;
      const cStatus = String(c.status || '').trim().toLowerCase();
      return (
        cStatus === 'failed' ||
        cStatus === 'error' ||
        cStatus === 'invalid' ||
        c.error ||
        (Array.isArray(c.errors) && c.errors.length > 0)
      );
    });

  if (hasHeaderErrors || hasComponentErrors) {
    return 'error';
  }

  // 2. SKIPPED CHECK: Skipped takes precedence over ready
  const isSkipped =
    rawStatus === 'skipped' ||
    rawStatus.includes('skipped') ||
    rawStatus.includes('exist') ||
    rawStatus === 'not_processed' ||
    bom.skipped === true ||
    bom.messageType === 'skipped' ||
    rawMsg.includes('already exist') ||
    rawMsg.includes('already exists') ||
    rawMsg.includes('exists in plant');

  if (isSkipped) {
    return 'skipped';
  }

  // 3. READY CHECK: If not error and not skipped, row is Ready (even with warnings)
  // Ready rows with warnings (e.g. MARC plant extension) remain 'ready'
  return 'ready';
}

/**
 * Normalizes validation status into one of: 'ready', 'error', 'skipped', 'not_validated'.
 * Delegates directly to the single shared classifyBomStatus function.
 */
export function normalizeBomStatus(bom, hasValidated = true) {
  return classifyBomStatus(bom, hasValidated);
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
    const s = classifyBomStatus(b, hasValidated);
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
 * Filter BOMs by normalized status and search term together.
 * Uses the exact same classification function as getBomStatusCounts.
 */
export function filterBoms(boms = [], { statusFilter = 'all', searchTerm = '', hasValidated = true } = {}) {
  const term = String(searchTerm || '').trim().toLowerCase();
  const normalizedFilter = String(statusFilter || 'all').toLowerCase();

  return (boms || []).filter((bom) => {
    const norm = classifyBomStatus(bom, hasValidated);
    if (normalizedFilter === 'ready' && norm !== 'ready') return false;
    if ((normalizedFilter === 'errors' || normalizedFilter === 'error') && norm !== 'error') return false;
    if (normalizedFilter === 'skipped' && norm !== 'skipped') return false;

    if (term) {
      const matchMat = (bom.material || bom.sourceMaterial || '').toLowerCase().includes(term);
      const matchPlant = String(bom.plant || bom.sourcePlant || '').toLowerCase().includes(term);
      const matchTgtMat = String(bom.targetMaterial || '').toLowerCase().includes(term);
      const matchTgtPlant = String(bom.targetPlant || '').toLowerCase().includes(term);
      const matchSeq = String(bom.sequenceNum || bom.id || '').toLowerCase().includes(term);
      const matchComp =
        Array.isArray(bom.components) &&
        bom.components.some(
          (c) =>
            String(c.component || '').toLowerCase().includes(term) ||
            String(c.description || '').toLowerCase().includes(term)
        );
      return matchMat || matchPlant || matchTgtMat || matchTgtPlant || matchSeq || matchComp;
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

/**
 * Cleans up and applies plain-language formatting to diagnostic messages:
 * - "Alternative 14 already exists in BOM A1BH0214C/1012/1" -> "Alternative 14 already exists for A1BH0214C in plant 1012."
 * - Removes internal keys like material/plant/usage joined with slashes.
 * - For sub-assemblies (level 1 or deeper), prefixes with "<material>: <message>".
 * - Level 0 errors have NO prefix.
 */
export function cleanDiagnosticMessage(raw, fallbackLevel = 0, fallbackParent = '') {
  if (!raw) return '';
  let str = String(raw).trim();

  // Strip technical prefixes
  str = str.replace(/^Cannot copy(?: BOM)?:\s*/i, '');
  str = str.replace(/^SAP BAPI Error:\s*/i, '');

  let level = fallbackLevel;
  let parentMat = fallbackParent;

  // Extract level and BOM parent if present, Ex. "(BOM of B1BH0214C, level 1)"
  const bomOfMatch = str.match(/\(BOM of ([^,\)]+),\s*level\s*(\d+)\)/i);
  if (bomOfMatch) {
    parentMat = bomOfMatch[1].trim();
    level = parseInt(bomOfMatch[2], 10);
    str = str.replace(/\s*\(BOM of [^,\)]+,\s*level\s*\d+\)/i, '').trim();
  } else {
    const lvlOnlyMatch = str.match(/\(?\blevel\s*(\d+)\)?/i);
    if (lvlOnlyMatch) {
      level = parseInt(lvlOnlyMatch[1], 10);
      str = str.replace(/\s*\(?\blevel\s*\d+\)?/i, '').trim();
    }
  }

  const parentOnlyMatch = str.match(/\(BOM of ([^,\)]+)\)/i);
  if (parentOnlyMatch) {
    if (!parentMat) parentMat = parentOnlyMatch[1].trim();
    str = str.replace(/\s*\(BOM of [^,\)]+\)/i, '').trim();
  }

  // Plain wording transformations
  str = str.replace(
    /Alternative\s+(\d+)\s+already exists in BOM\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'Alternative $1 already exists for $2 in plant $3.'
  );

  str = str.replace(
    /Alternative\s+(\d+)\s+already exists for\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'Alternative $1 already exists for $2 in plant $3.'
  );

  str = str.replace(
    /BOM\s+Alternative\s+(\d+)\s+already exists in plant\s+([A-Za-z0-9]+)\s*\(STLAN=\d+\)[^\.]*/i,
    'Alternative $1 already exists in plant $2.'
  );

  str = str.replace(
    /Alternative\s+(\d+)\s+already exists in plant\s+([A-Za-z0-9]+)\s*\(STLAN=\d+\)[^\.]*/i,
    'Alternative $1 already exists in plant $2.'
  );

  str = str.replace(
    /\bin BOM\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)\/(\d+)\.?/i,
    'for $1 in plant $2.'
  );

  str = str.replace(
    /\bfor material\s+([A-Za-z0-9_\-\.\/]+)\/([A-Za-z0-9]+)(?:\/(\d+))?\.?/i,
    'for material $1 in plant $2.'
  );

  str = str.replace(/\s+with BOM usage\s+\d+/i, '');

  str = str.trim();

  if (level >= 1 && parentMat) {
    if (!str.startsWith(`${parentMat}:`)) {
      str = `${parentMat}: ${str}`;
    }
  }

  if (str && !/[.!?:;]$/.test(str)) {
    str += '.';
  }

  return str;
}

/**
 * Known technical cascade / follow-on messages on failed rows.
 */
export const FOLLOW_ON_TECHNICAL_REGEX =
  /consistency check when creating bom item|no instance of object type bomgroup|cascade|subsequent error|internal error occurred/i;

/**
 * Helper to identify MARC plant extension informational messages.
 * "Header material X is not extended to plant P (MARC)" and
 * "Component Y is not extended to plant P (MARC)" are informational notes,
 * not warnings, because they do not block BOM creation in SAP.
 */
export function isMarcExtensionMessage(text) {
  if (!text || typeof text !== 'string') return false;
  return /not extended to plant|marc\b/i.test(text);
}

/**
 * Shared helper to derive severity ('error' | 'warning' | 'skipped' | 'info') for a message line.
 *
 * Rules:
 * - All messages of a row whose status is Skipped are severity 'skipped'.
 * - Messages that make a row Failed are 'error'.
 * - MARC plant extension notes are severity 'info' (non-blocking informational notes).
 * - Non-blocking real warnings on a Ready row are 'warning'.
 * - Follow-on technical messages on failed rows stay 'info'.
 * - Confirmation/informational messages on created execution rows are 'info'.
 */
export function deriveMessageSeverity(message, rowOrStatus = {}, options = {}) {
  // If message itself is null/empty
  if (!message && !options.defaultSeverity && !options.type) {
    return 'info';
  }

  const msgText = typeof message === 'string' ? message : (message?.text || message?.message || '');
  const cleanText = msgText.trim();

  // MARC extension is strictly an informational note (never warning or error)
  if (isMarcExtensionMessage(cleanText)) {
    return 'info';
  }

  // 1. Check explicit type on message object, options.type, or row.messageType
  const explicitType = typeof message === 'object' && message !== null && (message.type || message.severity)
    ? (message.type || message.severity)
    : (options.type || (typeof rowOrStatus === 'object' && rowOrStatus && rowOrStatus.messageType));

  if (explicitType) {
    const cleanType = String(explicitType).trim().toLowerCase();
    if (['error', 'warning', 'skipped', 'info', 'success'].includes(cleanType)) {
      return cleanType;
    }
  }

  // 2. Success notes (e.g. "Ready to copy...", "Ready for creation...", "Source BOM verified...")
  if (/^ready\s+(?:to|for)\b/i.test(cleanText) || /^source bom verified/i.test(cleanText) || /^copied successfully/i.test(cleanText) || /^created successfully/i.test(cleanText)) {
    return 'success';
  }

  // 3. Not validated placeholder
  if (/^not validated yet\.?$/i.test(cleanText)) {
    return 'info';
  }

  const normStatus = typeof rowOrStatus === 'string'
    ? rowOrStatus.trim().toLowerCase()
    : normalizeBomStatus(rowOrStatus);

  const isExecution = Boolean(
    options.isExecution ||
    (typeof rowOrStatus === 'object' && rowOrStatus && (rowOrStatus.bomNumber || rowOrStatus.success !== undefined || rowOrStatus.completed !== undefined))
  );

  const execStatus = (isExecution && typeof rowOrStatus === 'object')
    ? normalizeExecutionStatus(rowOrStatus)
    : null;

  // 4. All messages of a row whose status is Skipped are severity 'skipped'
  if (normStatus === 'skipped' || execStatus === 'SKIPPED') {
    return 'skipped';
  }

  // 5. Ready row:
  if (normStatus === 'ready' || execStatus === 'CREATED') {
    if (execStatus === 'CREATED' || options.isSuccessInfo) {
      return 'info';
    }
    // Real warnings that need attention (e.g. data inconsistencies) are 'warning'
    if (options.isWarning || (options.defaultSeverity === 'warning' && !isMarcExtensionMessage(cleanText))) {
      return 'warning';
    }
    // Ready row with no real warning is success
    return 'success';
  }

  // 6. Not validated row
  if (normStatus === 'not_validated') {
    return 'info';
  }

  // 7. Failed / error row
  if (options.isFollowOn || FOLLOW_ON_TECHNICAL_REGEX.test(cleanText)) {
    return 'info';
  }

  if (options.defaultSeverity === 'warning' || options.isNonBlockingWarning) {
    return 'warning';
  }

  if (normStatus === 'error' || execStatus === 'FAILED') {
    return 'error';
  }

  if (options.defaultSeverity && ['error', 'warning', 'skipped', 'info', 'success'].includes(options.defaultSeverity)) {
    return options.defaultSeverity;
  }

  // Unknown or missing type falls back to info
  return 'info';
}

/**
 * Extracts and normalizes all message lines for a row with assigned severities.
 */
export function getBomRowMessages(bom, options = {}) {
  if (!bom) {
    return { errors: [], warnings: [], skipped: [], info: [], success: [], total: 0, all: [] };
  }

  const normStatus = normalizeBomStatus(bom);
  // Unvalidated row shows NO message line
  if (normStatus === 'not_validated') {
    return { errors: [], warnings: [], skipped: [], info: [], success: [], total: 0, all: [] };
  }

  const isSkipped = normStatus === 'skipped';
  const isReady = normStatus === 'ready';
  const isError = normStatus === 'error';

  const rawMessages = [];
  const seen = new Set();

  const addRaw = (raw, defaultSeverity = 'error') => {
    if (!raw) return;
    const rawType = typeof raw === 'object' && raw !== null ? (raw.type || raw.severity) : null;
    const text = typeof raw === 'string' ? raw : (raw.text || raw.message || JSON.stringify(raw));
    if (!text || typeof text !== 'string') return;
    if (text.includes(' | ')) {
      text.split(/\s*\|\s*/).forEach((sub) => addRaw(sub, defaultSeverity));
      return;
    }
    const cleanRaw = text.trim();
    if (/^not validated yet\.?$/i.test(cleanRaw)) {
      return; // Never render placeholder
    }
    const cleaned = cleanDiagnosticMessage(cleanRaw);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      rawMessages.push({ text: cleaned, explicitType: rawType, defaultSeverity });
    }
  };

  // 1. Process individual errors and warnings from bom
  if (Array.isArray(bom.errors)) {
    bom.errors.forEach((e) => addRaw(e, 'error'));
  }
  if (Array.isArray(bom.warnings)) {
    bom.warnings.forEach((w) => addRaw(w, 'warning'));
  }

  // 2. Process problems (used in Bulk Copy)
  if (Array.isArray(bom.problems)) {
    bom.problems.forEach((p) => {
      if (typeof p === 'string') addRaw(p, 'error');
      else if (p && (p.text || p.message)) {
        const isWarn = p.type === 'warning' || p.severity === 'warning' || p.isWarning;
        addRaw(p.text || p.message, isWarn ? 'warning' : 'error');
      }
    });
  }

  // 3. Process component level errors and warnings
  if (Array.isArray(bom.components)) {
    bom.components.forEach((c) => {
      if (Array.isArray(c.errors)) c.errors.forEach((e) => addRaw(e, 'error'));
      if (c.error) addRaw(c.error, 'error');
      if (Array.isArray(c.warnings)) c.warnings.forEach((w) => addRaw(w, 'warning'));
      if (c.warning) addRaw(c.warning, 'warning');
    });
  }

  // 4. Process reason / message
  if (bom.reason) {
    const isSuccessMsg = /^ready\s+(?:to|for)\b/i.test(bom.reason.trim());
    addRaw(bom.reason, isSkipped ? 'skipped' : (isReady ? (isSuccessMsg ? 'success' : 'warning') : 'error'));
  }
  if (bom.message && bom.message !== bom.reason) {
    const isSuccessMsg = /^ready\s+(?:to|for)\b/i.test(bom.message.trim());
    addRaw(bom.message, isSkipped ? 'skipped' : (isReady ? (isSuccessMsg ? 'success' : 'warning') : 'error'));
  }

  // Map to severity objects using deriveMessageSeverity
  const allItems = rawMessages.map((item) => {
    const severity = deriveMessageSeverity(
      item.explicitType ? { text: item.text, type: item.explicitType } : item.text,
      bom,
      { defaultSeverity: item.defaultSeverity }
    );
    return {
      text: item.text,
      severity,
      type: severity
    };
  });

  // Success messages are NOT rendered as lines
  const displayLines = allItems.filter((m) => m.severity !== 'success');

  const errors = displayLines.filter((m) => m.severity === 'error').map((m) => m.text);
  const warnings = displayLines.filter((m) => m.severity === 'warning').map((m) => m.text);
  const skipped = displayLines.filter((m) => m.severity === 'skipped').map((m) => m.text);
  const info = displayLines.filter((m) => m.severity === 'info').map((m) => m.text);
  const success = allItems.filter((m) => m.severity === 'success').map((m) => m.text);

  return {
    errors,
    warnings,
    skipped,
    info,
    success,
    total: displayLines.length,
    all: displayLines
  };
}
