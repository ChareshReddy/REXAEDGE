/**
 * Normalizes and formats raw warnings into readable strings.
 * Converts strings, {message}, {text}, {code, message}, nested objects,
 * drops empty items, "[object Object]" artifacts, and informational noise.
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
      if (trimmed && !isNoise(trimmed)) {
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

      if (text && !isNoise(text)) {
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
