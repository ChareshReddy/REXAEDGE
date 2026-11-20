/**
 * RFC Trace Utility
 * Enabled when RFC_TRACE=1 or RFC_TRACE=true.
 * Logs one line when each step STARTS and one when it ENDS.
 * Step name, server ID, elapsed ms, NO secrets. Off by default.
 */

export function isRfcTraceEnabled() {
  return process.env.RFC_TRACE === '1' || process.env.RFC_TRACE === 'true';
}

export function traceRfc(step, serverId, status, durationMs = null) {
  if (!isRfcTraceEnabled()) return;
  const sId = serverId ? String(serverId).trim() : 'default';
  const timestamp = new Date().toISOString();
  if (status === 'START') {
    console.log(`[RFC_TRACE][${timestamp}][${sId}] START ${step}`);
  } else {
    const elapsed = durationMs !== null ? `${durationMs}ms` : '';
    console.log(`[RFC_TRACE][${timestamp}][${sId}] END ${step} ${elapsed}`.trim());
  }
}

export function startRfcTrace(step, serverId) {
  const start = Date.now();
  traceRfc(step, serverId, 'START');
  return {
    end: () => {
      const elapsed = Date.now() - start;
      traceRfc(step, serverId, 'END', elapsed);
    }
  };
}

/**
 * Request-level tracing for HTTP requests & middlewares
 */
export function traceRequestArrival(req) {
  if (!isRfcTraceEnabled()) return;
  const reqId = req?.id || 'req';
  const timestamp = new Date().toISOString();
  console.log(`[RFC_TRACE][${timestamp}][${reqId}] ARRIVED ${req.method} ${req.originalUrl || req.url}`);
}

export function traceMiddlewareStep(req, stepName) {
  if (!isRfcTraceEnabled()) {
    return { end: () => {} };
  }
  const reqId = req?.id || 'req';
  const start = Date.now();
  const timestamp = new Date().toISOString();
  console.log(`[RFC_TRACE][${timestamp}][${reqId}] START ${stepName}`);
  return {
    end: () => {
      const elapsed = Date.now() - start;
      const endTs = new Date().toISOString();
      console.log(`[RFC_TRACE][${endTs}][${reqId}] END ${stepName} ${elapsed}ms`);
    }
  };
}
