/**
 * Frontend Friendly Error Utility
 *
 * Normalizes API error responses and Axios errors into a consistent format:
 * { code, title, message, hint, errorRef, retryable }
 */

function stripLeadingEmoji(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/^[\u274C\u274E\u26A0\uFE0F\u2705\u2714\u2716\u2747\uD83C-\uDBFF\uDC00-\uDFFF\s]+/u, '').trim();
}

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
    const rawMsg = stripLeadingEmoji(err.message || err.error || fallbackMessage);
    const execMatch = typeof rawMsg === 'string' ? rawMsg.match(/^execution failed:\s*(.*)/i) : null;
    return {
      code: err.code || (execMatch ? 'EXECUTION_FAILED' : 'UNKNOWN'),
      title: stripLeadingEmoji(execMatch ? 'Execution failed' : (err.title || 'Error')),
      message: execMatch ? (execMatch[1].trim() || 'Operation failed') : rawMsg,
      hint: err.hint || null,
      errorRef: err.error_ref || err.errorRef || null,
      retryable: err.retryable !== false
    };
  }

  // 2. Structured API error payload from backend (via sendFriendlyError)
  const data = err.response?.data;
  if (data && typeof data === 'object') {
    let rawMsg = data.message || (typeof data.error === 'string' ? data.error : null) || data.reply || fallbackMessage;
    rawMsg = stripLeadingEmoji(rawMsg);
    const execMatch = typeof rawMsg === 'string' ? rawMsg.match(/^execution failed:\s*(.*)/i) : null;
    const resolvedTitle = stripLeadingEmoji(
      execMatch
        ? 'Execution failed'
        : (data.title || (data.code === 'VALIDATION_ERROR' ? 'Validation notice' : 'Error'))
    );
    const resolvedMsg = execMatch ? (execMatch[1].trim() || 'Operation failed') : rawMsg;

    return {
      code: data.code || (execMatch ? 'EXECUTION_FAILED' : 'UNKNOWN'),
      title: resolvedTitle,
      message: resolvedMsg,
      hint: data.hint || null,
      errorRef: data.error_ref || data.errorRef || null,
      retryable: data.retryable !== undefined ? Boolean(data.retryable) : true
    };
  }

  // 3. String error response
  if (typeof data === 'string' && data.trim()) {
    const cleanStr = stripLeadingEmoji(data.trim());
    const execMatch = cleanStr.match(/^execution failed:\s*(.*)/i);
    return {
      code: execMatch ? 'EXECUTION_FAILED' : 'UNKNOWN',
      title: execMatch ? 'Execution failed' : 'Error',
      message: execMatch ? (execMatch[1].trim() || 'Operation failed') : cleanStr,
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
    const cleanStr = stripLeadingEmoji(err);
    const execMatch = cleanStr.match(/^execution failed:\s*(.*)/i);
    return {
      code: execMatch ? 'EXECUTION_FAILED' : 'UNKNOWN',
      title: execMatch ? 'Execution failed' : 'Error',
      message: execMatch ? (execMatch[1].trim() || 'Operation failed') : cleanStr,
      hint: null,
      errorRef: null,
      retryable: true
    };
  }

  const rawFallback = stripLeadingEmoji(err.message || fallbackMessage);
  const execMatch = typeof rawFallback === 'string' ? rawFallback.match(/^execution failed:\s*(.*)/i) : null;
  return {
    code: execMatch ? 'EXECUTION_FAILED' : 'UNKNOWN',
    title: execMatch ? 'Execution failed' : 'Error',
    message: execMatch ? (execMatch[1].trim() || 'Operation failed') : rawFallback,
    hint: null,
    errorRef: null,
    retryable: true
  };
}
