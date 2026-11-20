import { supabaseService } from '../services/supabaseClient.js';
import { traceMiddlewareStep } from '../utils/rfcTrace.js';

/**
 * Checks server ownership and status for a given user.
 * Return 404 (not 403) for servers the user does not own.
 * Refuse disabled servers or disabled users with a clear code.
 *
 * @param {object} user - Authenticated user object ({ id, email, role, is_disabled })
 * @param {string} serverId - Target SAP server UUID
 * @param {object} [options={}] - Optional request context for per-request caching
 * @returns {Promise<{ isAllowed: boolean, server: object|null, statusCode: number, error: string|null, code: string|null }>}
 */
export async function checkServerOwnership(user, serverId, options = {}) {
  if (!user) {
    return {
      isAllowed: false,
      server: null,
      statusCode: 401,
      error: 'Authentication required.',
      code: 'AUTH_REQUIRED'
    };
  }

  if (user.is_disabled) {
    return {
      isAllowed: false,
      server: null,
      statusCode: 403,
      error: 'Your account has been disabled. Please contact your administrator.',
      code: 'USER_DISABLED'
    };
  }

  if (!serverId) {
    return {
      isAllowed: false,
      server: null,
      statusCode: 404,
      error: 'SAP Server not found.',
      code: 'SERVER_NOT_FOUND'
    };
  }

  const req = options.req || (typeof options === 'object' && options.headers ? options : null);
  const server = await supabaseService.getServerById(String(serverId), { req });
  if (!server) {
    return {
      isAllowed: false,
      server: null,
      statusCode: 404,
      error: 'SAP Server not found.',
      code: 'SERVER_NOT_FOUND'
    };
  }

  // F. OWNERSHIP CHECK: every server-scoped route checks that the server belongs to the requesting user.
  // Return 404 (not 403) for servers the user does not own.
  // Legacy unassigned servers (owner_id is null) cannot be accessed by anyone until assigned.
  if (!server.owner_id || server.owner_id !== user.id) {
    return {
      isAllowed: false,
      server: null,
      statusCode: 404,
      error: 'SAP Server not found.',
      code: 'SERVER_NOT_FOUND'
    };
  }

  if (server.is_disabled) {
    return {
      isAllowed: false,
      server,
      statusCode: 403,
      error: 'This SAP server is disabled.',
      code: 'SERVER_DISABLED'
    };
  }

  return {
    isAllowed: true,
    server,
    statusCode: 200,
    error: null,
    code: null
  };
}

/**
 * Express middleware to enforce server ownership on server-scoped routes.
 */
export async function requireServerOwner(req, res, next) {
  const trace = traceMiddlewareStep(req, 'requireServerOwner');

  // Bulk job status, cancel, results, and ticketed downloads are authorized by job/ticket ownership and use that stored server_id.
  // Note: /jobs/start, /jobs/active, and collection routes must NOT skip requireServerOwner.
  const isJobStatusOrDownload =
    Boolean(req.params?.jobId && req.params.jobId !== 'start' && req.params.jobId !== 'active') ||
    (Boolean(req.path) && Boolean(req.path.match(/^\/jobs\/(?!start\b|active\b)[^/]+(\/cancel)?$/))) ||
    (Boolean(req.path) && Boolean(req.path.match(/^\/download\/[^/]+$/)));

  if (isJobStatusOrDownload) {
    trace.end();
    return next();
  }

  // Server must come from the x-sap-server-id header.
  const headerServerId = req.headers?.['x-sap-server-id'];
  const bodyServerId = req.body?.serverId || req.body?.server_id;

  // If req.body.serverId is also present and differs from the header, reject with 400 SERVER_CONTEXT_MISMATCH
  if (bodyServerId && headerServerId && String(bodyServerId).trim() !== String(headerServerId).trim()) {
    trace.end();
    return res.status(400).json({
      error: 'Server ID in request body does not match x-sap-server-id header.',
      code: 'SERVER_CONTEXT_MISMATCH'
    });
  }

  // Never use body serverId when the header is missing
  const serverId = headerServerId;

  if (!serverId) {
    trace.end();
    return res.status(404).json({
      error: 'SAP Server not found. Explicit server header (x-sap-server-id) is required.',
      code: 'SERVER_NOT_FOUND'
    });
  }

  try {
    const result = await checkServerOwnership(req.user, serverId, { req });
    if (!result.isAllowed) {
      trace.end();
      return res.status(result.statusCode || 404).json({
        error: result.error,
        code: result.code
      });
    }

    req.selectedServer = result.server;
    req.server = result.server;
    req._serverRecord = result.server;
    trace.end();
    next();
  } catch (err) {
    trace.end();
    if (err.code === 'DB_TIMEOUT') {
      return res.status(504).json({
        error: err.message,
        code: 'DB_TIMEOUT'
      });
    }
    console.error('[requireServerOwner] Error checking server ownership:', err.message);
    return res.status(500).json({ error: 'Failed to verify server ownership.' });
  }
}
