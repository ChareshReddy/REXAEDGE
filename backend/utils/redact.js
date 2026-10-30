/**
 * Sensitive field names that must always be redacted.
 * Checks lowercase / partial match.
 */
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'encryption_key',
  'sap_password',
  'service_role',
  'bearer',
  'credential',
  'auth_tag',
  'private_key'
];

/**
 * Disallowed large business structures that should never be stored in logs.
 * We store counts and identifiers, not component item arrays or bulk spreadsheets.
 */
const STRIPPED_LARGE_KEYS = [
  'components',
  'items',
  'rows',
  'spreadsheet',
  'spreadsheetrows',
  'data',
  'exceldata',
  'buffer',
  'parsedrows'
];

const MAX_STRING_LENGTH = 1000;
const MAX_STACK_LENGTH = 4000;

/**
 * Checks whether a key is sensitive and must be masked.
 */
export function isSensitiveKey(key) {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase().replace(/[-_]/g, '');
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern.replace(/[-_]/g, '')));
}

/**
 * Checks whether a key is a large bulk payload that should be summarized instead of stored.
 */
export function isLargePayloadKey(key) {
  if (!key || typeof key !== 'string') return false;
  const lower = key.toLowerCase().replace(/[-_]/g, '');
  return STRIPPED_LARGE_KEYS.some((pattern) => lower === pattern.replace(/[-_]/g, ''));
}

/**
 * Recursively sanitizes and redacts an object, stripping secrets, long strings,
 * circular references, and oversized component/spreadsheet arrays.
 */
export function sanitizeLogDetails(input, depth = 0, seen = new WeakSet()) {
  if (depth > 6) return '[Max Depth Exceeded]';
  if (input === null || input === undefined) return input;

  if (typeof input === 'string') {
    if (input.length > MAX_STRING_LENGTH) {
      return `${input.slice(0, MAX_STRING_LENGTH)}... [truncated ${input.length - MAX_STRING_LENGTH} chars]`;
    }
    return input;
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (typeof input === 'object') {
    if (seen.has(input)) {
      return '[CIRCULAR]';
    }
    seen.add(input);
  }

  if (Array.isArray(input)) {
    // For arrays, summarize if large
    if (input.length > 20) {
      return {
        total_count: input.length,
        _summary: `Array with ${input.length} items (truncated for log size)`,
        sample: input.slice(0, 3).map((item) => sanitizeLogDetails(item, depth + 1, seen))
      };
    }
    return input.map((item) => sanitizeLogDetails(item, depth + 1, seen));
  }

  if (typeof input === 'object') {
    const output = {};
    for (const [key, value] of Object.entries(input)) {
      if (isSensitiveKey(key)) {
        output[key] = '[REDACTED]';
      } else if (key === 'stack' && typeof value === 'string') {
        output[key] = sanitizeStack(value);
      } else if (isLargePayloadKey(key) && Array.isArray(value)) {
        output[`${key}_summary`] = {
          total_count: value.length,
          sample: value.slice(0, 3).map((item) => sanitizeLogDetails(item, depth + 1, seen))
        };
      } else {
        output[key] = sanitizeLogDetails(value, depth + 1, seen);
      }
    }
    return output;
  }

  return String(input);
}

export const redactSensitive = sanitizeLogDetails;

/**
 * Truncates an error stack trace to ~4000 characters safely.
 */
export function sanitizeStack(stack) {
  if (!stack || typeof stack !== 'string') return null;
  if (stack.length <= MAX_STACK_LENGTH) return stack;
  return `${stack.slice(0, MAX_STACK_LENGTH)}\n... [stack truncated]`;
}

/**
 * Escapes values for safe CSV export to prevent Formula / CSV Injection in Excel.
 * Cells starting with =, +, -, @, or tab are prepended with a single quote.
 */
export function escapeCsvCell(val) {
  if (val === null || val === undefined) return '';
  let str = typeof val === 'object' ? JSON.stringify(val) : String(val);

  // CSV Injection prevention: prepend single quote if cell starts with risky chars
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If string contains quotes, commas or newlines, quote it and escape internal quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
