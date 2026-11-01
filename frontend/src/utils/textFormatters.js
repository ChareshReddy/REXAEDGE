/**
 * Utility functions for sentence-case UI display formatting.
 * Strictly display-only: does not alter database values, API payloads, or internal logic.
 */

export function formatEnvironment(env) {
  if (!env || typeof env !== 'string') return env || '';
  const trimmed = env.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'DEV') return 'Dev';
  if (upper === 'SANDBOX') return 'Sandbox';
  if (upper === 'PROD') return 'Prod';
  if (upper === 'QA') return 'Qa';
  if (upper === 'QAS') return 'Qas';
  // Default sentence case: First letter uppercase, rest lowercase
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function toSentenceCase(str) {
  if (!str || typeof str !== 'string') return str || '';
  const trimmed = str.trim();
  if (trimmed.length <= 1) return trimmed.toUpperCase();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
