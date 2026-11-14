/**
 * Helper to identify MARC plant extension informational messages.
 * "Header material X is not extended to plant P (MARC)" and
 * "Component Y is not extended to plant P (MARC)" do not block creation in SAP.
 */
export function isMarcExtensionMessage(text) {
  if (!text || typeof text !== 'string') return false;
  return /not extended to plant|marc\b/i.test(text);
}

/**
 * Formats a MARC message as a clean informational note:
 * e.g., "Note: A1PSB001B is not extended to plant 1010 (MARC)."
 */
export function formatMarcNote(text) {
  if (!text || typeof text !== 'string') return '';
  let clean = text.trim();
  if (/^note:\s*/i.test(clean)) return clean;
  clean = clean.replace(/^(?:Header material|Component)\s+/i, '');
  clean = clean.replace(/^"([^"]+)"/, '$1');
  clean = `Note: ${clean}`;
  if (!clean.endsWith('.')) {
    clean += '.';
  }
  return clean;
}

/**
 * Normalizes and formats raw warnings into readable strings.
 * Converts strings, {message}, {text}, {code, message}, nested objects,
 * drops empty items, "[object Object]" artifacts, informational noise,
 * and MARC plant extension informational notes (which are classified as info).
 *
 * @param {Array|object|string} rawWarnings
 * @returns {string[]} Deduplicated readable warning strings
 */
export function formatWarnings(rawWarnings) {
  if (!rawWarnings) return [];

  const items = Array.isArray(rawWarnings) ? rawWarnings : [rawWarnings];
  const results = [];
  const seen = new Set();

  const isNoise = (text) => {
    if (!text || typeof text !== 'string') return true;
    const lower = text.toLowerCase().trim();
    return (
      !lower ||
      lower.includes('[object object]') ||
      lower === 'simulation successful' ||
      lower === 'simulation passed' ||
      lower === 'pre-flight passed' ||
      lower === 'ready for creation' ||
      lower === 'success' ||
      lower.startsWith('ready for creation (')
    );
  };

  const processItem = (item) => {
    if (!item) return;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !isNoise(trimmed) && !isMarcExtensionMessage(trimmed)) {
        if (!seen.has(trimmed)) {
          seen.add(trimmed);
          results.push(trimmed);
        }
      }
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(processItem);
      return;
    }

    if (typeof item === 'object') {
      // Check for nested collections
      if (Array.isArray(item.warnings)) {
        item.warnings.forEach(processItem);
      }
      if (Array.isArray(item.details)) {
        item.details.forEach(processItem);
      }
      if (Array.isArray(item.messages)) {
        item.messages.forEach(processItem);
      }

      // Ignore pure info or success severity objects
      if (
        item.type === 'success' ||
        item.severity === 'success' ||
        item.type === 'info' ||
        item.severity === 'info'
      ) {
        return;
      }

      const msg = item.message || item.text || item.msg || item.description || item.reason || item.error || '';
      const code = item.code || item.id || item.number || '';

      let text = String(msg || '').trim();
      if (!text && code) {
        text = String(code).trim();
      } else if (text && code && !text.includes(code)) {
        text = `${code}: ${text}`;
      }

      if (text && !isNoise(text) && !isMarcExtensionMessage(text)) {
        if (!seen.has(text)) {
          seen.add(text);
          results.push(text);
        }
      }
    }
  };

  items.forEach(processItem);
  return results;
}

/**
 * Extracts and formats informational notes (such as MARC extension notes)
 * from raw warnings, notes, or messages.
 *
 * @param {Array|object|string} rawItems
 * @returns {string[]} Formatted note strings (e.g. "Note: A1PSB001B is not extended to plant 1010 (MARC).")
 */
export function formatNotes(rawItems) {
  if (!rawItems) return [];

  const items = Array.isArray(rawItems) ? rawItems : [rawItems];
  const results = [];
  const seen = new Set();

  const processItem = (item) => {
    if (!item) return;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && isMarcExtensionMessage(trimmed)) {
        const formatted = formatMarcNote(trimmed);
        if (formatted && !seen.has(formatted)) {
          seen.add(formatted);
          results.push(formatted);
        }
      }
      return;
    }

    if (Array.isArray(item)) {
      item.forEach(processItem);
      return;
    }

    if (typeof item === 'object') {
      if (Array.isArray(item.warnings)) item.warnings.forEach(processItem);
      if (Array.isArray(item.notes)) item.notes.forEach(processItem);
      if (Array.isArray(item.details)) item.details.forEach(processItem);
      if (Array.isArray(item.messages)) item.messages.forEach(processItem);

      const msg = item.message || item.text || item.msg || item.description || '';
      if (msg && isMarcExtensionMessage(String(msg))) {
        const formatted = formatMarcNote(String(msg));
        if (formatted && !seen.has(formatted)) {
          seen.add(formatted);
          results.push(formatted);
        }
      }
    }
  };

  items.forEach(processItem);
  return results;
}
