import { logAudit, logError } from '../services/logService.js';
import { generateErrorRef, formatErrorWithRef } from './errorRef.js';

/**
 * Convenience helper to record an audit log event from an Express request context.
 */
export function recordRouteAudit(req, {
  action,
  feature,
  target,
  status = 'success',
  message,
  durationMs,
  details = {}
}) {
  try {
    const userEmail =
      req.user?.email ||
      (req.body?.email ? String(req.body.email).trim() : null) ||
      (req.body?.username ? String(req.body.username).trim() : null);

    const serverId = req.selectedServer?.id || req.headers['x-server-id'] || null;
    const serverName = req.selectedServer?.name || req.selectedServer?.system_name || null;

    logAudit({
      requestId: req.id,
      userId: req.user?.id || null,
      userEmail: userEmail || null,
      userRole: req.user?.role || null,
      action: action || 'unknown',
      feature: feature || null,
      serverId: serverId ? String(serverId) : null,
      serverName: serverName ? String(serverName) : null,
      target: target ? String(target) : null,
      status: status === 'failed' ? 'failed' : 'success',
      message: message || null,
      ip: req.ip || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      durationMs: typeof durationMs === 'number' ? Math.round(durationMs) : null,
      details: details || {}
    });
  } catch (err) {
    console.warn('[recordRouteAudit] Failed to record route audit (ignored):', err.message);
  }
}

/**
 * Convenience helper to log an error with an error_ref from an Express request context.
 */
export function recordRouteError(req, err, {
  source = 'backend',
  httpStatus = 500,
  errorCode,
  sapMessage,
  details = {}
} = {}) {
  const errorRef = err?.error_ref || generateErrorRef();
  try {
    const serverId = req.selectedServer?.id || req.headers['x-server-id'] || null;
    const serverName = req.selectedServer?.name || req.selectedServer?.system_name || null;

    logError({
      errorRef,
      requestId: req.id,
      userId: req.user?.id || null,
      userEmail: req.user?.email || req.body?.email || null,
      serverId: serverId ? String(serverId) : null,
      serverName: serverName ? String(serverName) : null,
      source: source || 'backend',
      method: req.method,
      route: req.originalUrl || req.url,
      httpStatus: typeof httpStatus === 'number' ? httpStatus : (err?.status || 500),
      errorCode: errorCode || err?.code || 'SERVER_ERROR',
      message: err?.message || 'Server error occurred',
      sapMessage: sapMessage || err?.sapMessage || null,
      stack: err?.stack || null,
      details: details || {}
    });
  } catch (e) {
    console.warn('[recordRouteError] Failed to log route error (ignored):', e.message);
  }
  return errorRef;
}
