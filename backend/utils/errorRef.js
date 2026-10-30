import crypto from 'crypto';

/**
 * Generates an 8-character uppercase alphanumeric error reference code.
 * Example: '4F2A9C1B'
 */
export function generateErrorRef() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Formats a user-facing error message with the error reference attached.
 * Example: "Failed to validate BOM. Error ref: 4F2A9C1B"
 */
export function formatErrorWithRef(message, errorRef) {
  const base = message || 'An unexpected error occurred.';
  if (!errorRef) return base;
  if (base.includes('Error ref:')) return base;
  return `${base} (Error ref: ${errorRef})`;
}
