/**
 * Utility functions for SAP server selection and defaults.
 */

/**
 * Selects the default server on load:
 * The most recently added active server the user has access to
 * (newest created_at; if there is no created_at, use the highest id).
 *
 * @param {Array<object>} servers - List of accessible servers for the user
 * @returns {object|null} The default server object, or null if none accessible
 */
export function getNewestActiveServer(servers) {
  if (!Array.isArray(servers) || servers.length === 0) return null;

  // Filter to active servers only (is_active !== false)
  const activeServers = servers.filter((s) => s && s.is_active !== false);
  if (activeServers.length === 0) return null;

  // Find newest by created_at, fallback to highest id
  const sorted = [...activeServers].sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : NaN;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : NaN;

    const validA = !isNaN(timeA);
    const validB = !isNaN(timeB);

    if (validA && validB) {
      if (timeB !== timeA) {
        return timeB - timeA; // newest first (descending timestamp)
      }
    } else if (validA && !validB) {
      return -1; // valid created_at prioritized over missing
    } else if (!validA && validB) {
      return 1;
    }

    // Fallback: highest id (numeric or natural string)
    const idA = a.id !== undefined && a.id !== null ? a.id : '';
    const idB = b.id !== undefined && b.id !== null ? b.id : '';

    const numA = Number(idA);
    const numB = Number(idB);
    if (!isNaN(numA) && !isNaN(numB) && String(numA) === String(idA).trim() && String(numB) === String(idB).trim()) {
      return numB - numA;
    }

    return String(idB).localeCompare(String(idA), undefined, { numeric: true });
  });

  return sorted[0] || null;
}
