import { recordRouteError } from './auditHelper.js';
import { generateErrorRef } from './errorRef.js';

/**
 * Shared Backend Friendly Error Conversion & Sanitization
 *
 * Converts raw SAP, RFC, Network, and Database errors into structured, user-friendly
 * error responses with code, title, message, hint, retryable flag, and unique error_ref.
 * Strictly guarantees that internal IP addresses, ports, file paths, and technical stacks
 * are NEVER returned to client applications or users.
 */

// Regular expressions to detect and redact internal networking or infrastructure paths
const IP_PORT_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g;
const FILE_PATH_REGEX = /(?:[A-Za-z]:[\\/]|(?:\/[a-zA-Z0-9_\-\.]+){2,})[^\s,'"<>]+/g;
const STACK_LINE_REGEX = /^\s*at\s+.*$/gm;

/**
 * Scrub any internal IPs, ports, or file paths from client-facing text
 */
export function sanitizeClientString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(IP_PORT_REGEX, '[redacted]')
    .replace(FILE_PATH_REGEX, '[redacted]')
    .replace(STACK_LINE_REGEX, '')
    .trim();
}

/**
 * Checks whether a given string contains raw sensitive info (internal IP, port, or file path)
 */
export function containsSensitiveInfo(str) {
  if (typeof str !== 'string') return false;
  return IP_PORT_REGEX.test(str) || FILE_PATH_REGEX.test(str);
}

/**
 * Maps any raw error into { code, title, message, hint, retryable }
 *
 * Mapping rules:
 * - SAProuter / NI / timeout / connection refused / ECONNREFUSED / ETIMEDOUT / RFC_COMMUNICATION_FAILURE / "could not establish connection"
 *     -> SAP_UNREACHABLE
 * - RFC logon failure / wrong user or password / user locked
 *     -> SAP_LOGIN_FAILED
 * - RFC authorization (not authorized, AD/authorization object)
 *     -> SAP_NOT_AUTHORIZED
 * - Timeouts of our own SAP protection (concurrency/timeouts)
 *     -> SAP_BUSY
 * - Table or function not found / not installed
 *     -> SAP_NOT_AVAILABLE
 * - Supabase/database errors
 *     -> DB_ERROR
 * - Validation errors from our own code stay as they are (already readable)
 *     -> VALIDATION_ERROR
 * - Anything unknown
 *     -> UNKNOWN
 */
export function toFriendlyError(err, options = {}) {
  let rawText = '';
  let errCode = '';
  let isValidation = false;

  if (typeof err === 'string') {
    rawText = err;
  } else if (err && typeof err === 'object') {
    rawText = [
      err.message,
      err.sapMessage,
      err.details?.message,
      err.error,
      err.name,
      typeof err.details === 'string' ? err.details : ''
    ].filter(Boolean).join(' ');

    errCode = String(err.code || err.errorCode || err.key || '').toUpperCase();
    if (err.isValidation || err.status === 400 || err.statusCode === 400) {
      isValidation = true;
    }
  }

  const textLower = rawText.toLowerCase();

  // 1. DB_ERROR (Database / Supabase / PostgreSQL errors)
  const isDbError =
    textLower.includes('supabase') ||
    textLower.includes('postgrest') ||
    textLower.includes('pgrst') ||
    textLower.includes('postgres') ||
    textLower.includes('database error') ||
    textLower.includes('database query') ||
    textLower.includes('relation "') ||
    textLower.includes('violates foreign key') ||
    textLower.includes('unique constraint') ||
    errCode === 'DB_ERROR' ||
    (typeof errCode === 'string' && (errCode.startsWith('23') || errCode.startsWith('42')));

  if (isDbError) {
    return {
      code: 'DB_ERROR',
      title: 'Database error',
      message: 'Something went wrong on our side.',
      hint: 'A database operation could not be completed. Please try again or notify an administrator.',
      retryable: true
    };
  }

  // 2. SAP_UNREACHABLE
  const isSapUnreachable =
    textLower.includes('saprouter') ||
    /\bni\b/.test(textLower) ||
    textLower.includes('network interface') ||
    textLower.includes('connection refused') ||
    textLower.includes('econnrefused') ||
    textLower.includes('etimedout') ||
    textLower.includes('timed out') ||
    textLower.includes('connection timed out') ||
    textLower.includes('rfc_communication_failure') ||
    textLower.includes('could not establish connection') ||
    textLower.includes('cannot establish connection') ||
    textLower.includes('partner not reached') ||
    textLower.includes('wsaeconnrefused') ||
    textLower.includes('wsaetimedout') ||
    textLower.includes('ehostunreach') ||
    textLower.includes('enetunreach') ||
    textLower.includes('host unreachable') ||
    textLower.includes('server not reachable') ||
    textLower.includes('server unavailable') ||
    textLower.includes('failed to connect to sap') ||
    textLower.includes('failed to connect to server') ||
    errCode === 'SAP_UNREACHABLE' ||
    errCode === 'ECONNREFUSED' ||
    errCode === 'ETIMEDOUT' ||
    errCode === 'RFC_COMMUNICATION_FAILURE';

  if (isSapUnreachable) {
    return {
      code: 'SAP_UNREACHABLE',
      title: 'SAP server not reachable',
      message: "RexaEdge can't connect to the selected SAP server right now.",
      hint: 'Check that the server is online and your network or VPN is connected, then try again. If it continues, contact your administrator.',
      retryable: true
    };
  }

  // 2. SAP_LOGIN_FAILED
  const isSapLoginFailed =
    textLower.includes('logon failure') ||
    textLower.includes('rfc_logon_failure') ||
    textLower.includes('wrong user or password') ||
    textLower.includes('password logon no longer possible') ||
    textLower.includes('user or password incorrect') ||
    textLower.includes('user locked') ||
    textLower.includes('account locked') ||
    textLower.includes('logon not possible') ||
    textLower.includes('rfc_user_locked') ||
    textLower.includes('rfc_invalid_credentials') ||
    errCode === 'SAP_LOGIN_FAILED' ||
    errCode === 'RFC_LOGON_FAILURE' ||
    errCode === 'RFC_USER_LOCKED';

  if (isSapLoginFailed) {
    return {
      code: 'SAP_LOGIN_FAILED',
      title: "Couldn't sign in to SAP",
      message: "RexaEdge couldn't sign in to the SAP server with the configured credentials.",
      hint: 'Ask your administrator to check the SAP user for this server.',
      retryable: false
    };
  }

  // 3. SAP_NOT_AUTHORIZED
  const isSapNotAuthorized =
    textLower.includes('not authorized') ||
    textLower.includes('no authorization') ||
    textLower.includes('rfc authorization') ||
    textLower.includes('authorization object') ||
    textLower.includes('authority-check') ||
    textLower.includes('missing authorization') ||
    textLower.includes('user has no authorization') ||
    textLower.includes('rfc_no_authority') ||
    textLower.includes('rfc_authorization_failure') ||
    textLower.includes('ad:559') ||
    errCode === 'SAP_NOT_AUTHORIZED' ||
    errCode === 'RFC_NO_AUTHORITY';

  if (isSapNotAuthorized) {
    return {
      code: 'SAP_NOT_AUTHORIZED',
      title: "You don't have SAP permission for this",
      message: "You don't have SAP permission for this.",
      hint: 'Ask your administrator to grant the required SAP authorization.',
      retryable: false
    };
  }

  // 4. SAP_BUSY
  const isSapBusy =
    textLower.includes('sap is busy') ||
    textLower.includes('system is busy') ||
    textLower.includes('concurrency') ||
    textLower.includes('queue full') ||
    textLower.includes('too many concurrent') ||
    textLower.includes('connection pool full') ||
    textLower.includes('sap protection timeout') ||
    errCode === 'SAP_BUSY' ||
    errCode === 'QUEUE_FULL' ||
    errCode === 'CONCURRENCY_LIMIT';

  if (isSapBusy) {
    return {
      code: 'SAP_BUSY',
      title: 'SAP is busy',
      message: 'The SAP server or connection pool is currently busy.',
      hint: 'Please try again in a moment.',
      retryable: true
    };
  }

  // 5. SAP_NOT_AVAILABLE
  const isSapNotAvailable =
    textLower.includes('function not found') ||
    textLower.includes('table not found') ||
    textLower.includes('not installed') ||
    textLower.includes('does not exist') ||
    textLower.includes('fu_not_found') ||
    textLower.includes('rfc_function_not_found') ||
    textLower.includes('da:131') ||
    errCode === 'SAP_NOT_AVAILABLE' ||
    errCode === 'FU_NOT_FOUND' ||
    errCode === 'TABLE_NOT_FOUND';

  if (isSapNotAvailable) {
    return {
      code: 'SAP_NOT_AVAILABLE',
      title: 'Option not available',
      message: "This option isn't available on this server.",
      hint: 'This SAP function or table is not installed or enabled on this system.',
      retryable: false
    };
  }

  // 6. Validation errors from our own code stay as they are (already readable)
  if (isValidation || (err && typeof err === 'object' && (err.status === 400 || err.statusCode === 400))) {
    const rawMsg = err.message || err.error || rawText || 'Validation error.';
    return {
      code: 'VALIDATION_ERROR',
      title: 'Validation notice',
      message: sanitizeClientString(rawMsg),
      hint: err.hint ? sanitizeClientString(err.hint) : null,
      retryable: false
    };
  }

  // 8. UNKNOWN: Anything unknown
  return {
    code: 'UNKNOWN',
    title: 'Something went wrong',
    message: 'An unexpected error occurred while processing your request.',
    hint: 'Please try again. If it continues, share the reference code with your administrator.',
    retryable: true
  };
}

/**
 * Standardized API error response sender.
 *
 * Records the raw error in server-side error logs (Supabase / in-memory queue)
 * and responds to the HTTP client with a friendly, sanitized payload.
 */
export function sendFriendlyError(res, req, err, { httpStatus, source = 'backend', details = {} } = {}) {
  if (req?.destroyed || res?.writableEnded) {
    return;
  }

  const friendly = toFriendlyError(err);

  // Determine appropriate HTTP status code
  let status = httpStatus || err?.status || err?.statusCode;
  if (!status || typeof status !== 'number') {
    if (friendly.code === 'SAP_UNREACHABLE') {
      status = 503;
    } else if (friendly.code === 'SAP_BUSY') {
      status = 503;
    } else if (friendly.code === 'SAP_NOT_AUTHORIZED') {
      status = 403;
    } else if (friendly.code === 'SAP_LOGIN_FAILED') {
      status = 502;
    } else if (friendly.code === 'SAP_NOT_AVAILABLE') {
      status = 501;
    } else if (friendly.code === 'VALIDATION_ERROR') {
      status = 400;
    } else {
      status = 500;
    }
  }

  let errorRef;
  try {
    errorRef = recordRouteError(req, err, {
      source,
      httpStatus: status,
      errorCode: friendly.code,
      sapMessage: err?.sapMessage || (typeof err === 'string' ? err : err?.message),
      details: {
        ...details,
        rawError: typeof err === 'string' ? err : err?.message,
        friendlyCode: friendly.code
      }
    });
  } catch (logErr) {
    errorRef = generateErrorRef();
  }

  if (!errorRef) {
    errorRef = generateErrorRef();
  }

  console.error(`[Error Ref: ${errorRef}] [${friendly.code}] ${err?.message || err}`);

  return res.status(status).json({
    success: false,
    error: friendly.message,
    message: friendly.message,
    code: friendly.code,
    title: friendly.title,
    hint: friendly.hint,
    retryable: friendly.retryable,
    error_ref: errorRef
  });
}
