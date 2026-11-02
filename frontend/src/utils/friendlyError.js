/**
 * Frontend Friendly Error Utility
 *
 * Normalizes API error responses and Axios errors into a consistent format:
 * { code, title, message, hint, errorRef, retryable }
 */

export function extractErrorInfo(err, fallbackMessage = 'An error occurred') {
  if (!err) {
    return {
      code: 'UNKNOWN',
      title: 'Error',
      message: fallbackMessage,
      hint: null,
      errorRef: null,
      retryable: true
    };
  }

  // 1. If err is already a friendly object
  if (err && typeof err === 'object' && !err.response && !err.isAxiosError && (err.title || err.code || err.hint)) {
    return {
      code: err.code || 'UNKNOWN',
      title: err.title || 'Error',
      message: err.message || err.error || fallbackMessage,
      hint: err.hint || null,
      errorRef: err.error_ref || err.errorRef || null,
      retryable: err.retryable !== false
    };
  }

  // 2. Structured API error payload from backend (via sendFriendlyError)
  const data = err.response?.data;
  if (data && typeof data === 'object') {
    return {
      code: data.code || 'UNKNOWN',
      title: data.title || (data.code === 'VALIDATION_ERROR' ? 'Validation notice' : 'Error'),
      message: data.message || data.error || fallbackMessage,
      hint: data.hint || null,
      errorRef: data.error_ref || data.errorRef || null,
      retryable: data.retryable !== undefined ? Boolean(data.retryable) : true
    };
  }

  // 3. String error response
  if (typeof data === 'string' && data.trim()) {
    return {
      code: 'UNKNOWN',
      title: 'Error',
      message: data.trim(),
      hint: null,
      errorRef: null,
      retryable: true
    };
  }

  // 4. Raw client-side network error (offline, refused, timeout)
  const clientMsg = String(err.message || '').toLowerCase();
  if (clientMsg.includes('network error') || err.code === 'ERR_NETWORK' || clientMsg.includes('timeout')) {
    return {
      code: 'SAP_UNREACHABLE',
      title: 'SAP server not reachable',
      message: "RexaEdge can't connect to the selected SAP server right now.",
      hint: 'Check that the server is online and your network or VPN is connected, then try again. If it continues, contact your administrator.',
      errorRef: null,
      retryable: true
    };
  }

  // 5. String passed as error
  if (typeof err === 'string') {
    return {
      code: 'UNKNOWN',
      title: 'Error',
      message: err,
      hint: null,
      errorRef: null,
      retryable: true
    };
  }

  return {
    code: 'UNKNOWN',
    title: 'Error',
    message: err.message || fallbackMessage,
    hint: null,
    errorRef: null,
    retryable: true
  };
}
