import { supabaseService } from '../services/supabaseClient.js';

/**
 * Checks server ownership and status for a given user.
 * Return 404 (not 403) for servers the user does not own.
 * Refuse disabled servers or disabled users with a clear code.
 *
 * @param {object} user - Authenticated user object ({ id, email, role, is_disabled })
 * @param {string} serverId - Target SAP server UUID
 * @returns {Promise<{ isAllowed: boolean, server: object|null, statusCode: number, error: string|null, code: string|null }>}
 */
export async function checkServerOwnership(user, serverId) {
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

  const server = await supabaseService.getServerById(String(serverId));
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
  // Bulk job status, cancel, results, and ticketed downloads are authorized by job/ticket ownership and use that stored server_id
  if (
    req.params?.jobId ||
    (req.path && req.path.match(/^\/jobs\/[^/]+(\/cancel)?$/)) ||
    (req.path && req.path.match(/^\/download\/[^/]+$/))
  ) {
    return next();
  }

  // Accept ONLY x-sap-server-id (x-server-id removed)
  const serverId =
    req.headers?.['x-sap-server-id'] ||
    req.body?.serverId ||
    req.body?.server_id ||
    req.query?.serverId ||
    req.query?.server_id ||
    req.params?.serverId ||
    req.params?.id;

  if (!serverId) {
    return res.status(404).json({
      error: 'SAP Server not found. Explicit server header (x-sap-server-id) is required.',
      code: 'SERVER_NOT_FOUND'
    });
  }

  try {
    const result = await checkServerOwnership(req.user, serverId);
    if (!result.isAllowed) {
      return res.status(result.statusCode || 404).json({
        error: result.error,
        code: result.code
      });
    }

    req.selectedServer = result.server;
    req.server = result.server;
    next();
  } catch (err) {
    console.error('[requireServerOwner] Error checking server ownership:', err.message);
    return res.status(500).json({ error: 'Failed to verify server ownership.' });
  }
}
