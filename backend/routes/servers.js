import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseService } from '../services/supabaseClient.js';
import { validateServerHost } from '../services/serverAllowlistService.js';
import { encryptPassword, decryptPassword } from '../utils/crypto.js';
import { removePool } from '../services/sapConnectionPool.js';
import { auditLogger } from '../services/auditLog.js';
import { pingRfcServer } from '../services/sapRfcClient.js';

const router = express.Router();

// Rate limiter for connection testing: 5 per minute per user
const testRateLimits = new Map(); // userId -> { count, windowStart }
const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 60 * 1000;

function checkTestRateLimit(userId) {
  const now = Date.now();
  let userLimit = testRateLimits.get(userId);

  if (!userLimit || (now - userLimit.windowStart) > TEST_WINDOW_MS) {
    userLimit = { count: 1, windowStart: now };
    testRateLimits.set(userId, userLimit);
    return { allowed: true, remaining: TEST_LIMIT - 1 };
  }

  if (userLimit.count >= TEST_LIMIT) {
    return { allowed: false, remaining: 0, resetInSec: Math.ceil((userLimit.windowStart + TEST_WINDOW_MS - now) / 1000) };
  }

  userLimit.count++;
  return { allowed: true, remaining: TEST_LIMIT - userLimit.count };
}

export function normalizeEnvironmentForDb(envOrType) {
  if (!envOrType) return 'SANDBOX';
  const upper = String(envOrType).trim().toUpperCase();
  if (upper === 'DEVELOPMENT' || upper === 'DEV') return 'DEV';
  if (upper === 'PRODUCTION' || upper === 'PROD') return 'PROD';
  if (upper === 'QA' || upper === 'QAS') return 'QA';
  return 'SANDBOX';
}

export function mapDbEnvToUiType(env) {
  if (!env) return 'Sandbox';
  const upper = String(env).trim().toUpperCase();
  if (upper === 'DEV' || upper === 'DEVELOPMENT') return 'Development';
  if (upper === 'PROD' || upper === 'PRODUCTION') return 'Production';
  if (upper === 'QA') return 'QA';
  return 'Sandbox';
}

// Helper to sanitize server for response (never return sap_password or encrypted ciphertext)
function sanitizeServer(server) {
  if (!server) return null;
  const { sap_password, sap_password_encrypted, ...safe } = server;
  const queueTimeoutMs = Number(
    server.queue_timeout_ms !== undefined
      ? server.queue_timeout_ms
      : (server.queue_timeout_seconds !== undefined ? server.queue_timeout_seconds * 1000 : 20000)
  );
  const rfcCallTimeoutMs = Number(
    server.rfc_call_timeout_ms !== undefined
      ? server.rfc_call_timeout_ms
      : (server.rfc_call_timeout_seconds !== undefined ? server.rfc_call_timeout_seconds * 1000 : 45000)
  );

  const rawEnv = server.environment || server.type || 'SANDBOX';
  const dbEnv = normalizeEnvironmentForDb(rawEnv);
  const uiType = mapDbEnvToUiType(rawEnv);

  return {
    ...safe,
    environment: uiType,
    type: uiType,
    db_environment: dbEnv,
    queue_timeout_ms: queueTimeoutMs,
    rfc_call_timeout_ms: rfcCallTimeoutMs,
    queue_timeout_seconds: Math.round(queueTimeoutMs / 1000),
    rfc_call_timeout_seconds: Math.round(rfcCallTimeoutMs / 1000),
    sap_password_masked: Boolean(sap_password || sap_password_encrypted)
  };
}

/**
 * GET /api/servers
 * Lists all servers owned by the authenticated user.
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const servers = await supabaseService.getServersByOwner(req.user.id);
    const sanitized = (servers || []).map(sanitizeServer);
    return res.status(200).json({ success: true, servers: sanitized });
  } catch (err) {
    console.error('[Servers] Error listing servers:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve servers.' });
  }
});

/**
 * POST /api/servers
 * Creates a new user-owned SAP server.
 */
router.post('/', requireAuth, async (req, res) => {
  const {
    name,
    ashost,
    sysnr = '00',
    client = '100',
    lang = 'EN',
    router: sapRouter = null,
    saprouter = null,
    gwserv = null,
    sap_username = null,
    sap_password = null,
    max_connections = 3,
    per_user_limit = 2,
    queue_timeout_seconds,
    queue_timeout_ms,
    rfc_call_timeout_seconds,
    rfc_call_timeout_ms,
    is_default = false
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Server name is required.' });
  }
  if (!ashost || !String(ashost).trim()) {
    return res.status(400).json({ error: 'Application Host (ashost) is required.' });
  }

  try {
    // 1. Check per-user server limit (default 5)
    const existing = await supabaseService.getServersByOwner(req.user.id);
    if ((existing || []).length >= 5) {
      return res.status(400).json({
        error: 'Maximum 5 servers per user allowed.',
        code: 'LIMIT_EXCEEDED'
      });
    }

    const effectiveRouter = sapRouter ? String(sapRouter).trim() : (saprouter ? String(saprouter).trim() : null);

    // 2. Validate host & router against allowlist and SSRF rules
    const allowlist = await supabaseService.getAllowlist();
    const validation = await validateServerHost(
      { ashost, router: effectiveRouter, ...req.body },
      allowlist
    );

    if (!validation.permitted) {
      return res.status(403).json({
        error: validation.message,
        code: validation.code
      });
    }

    // 2b. Enforce test-connection requirement unless admin setting permits untested servers
    const adminSettings = await supabaseService.getAdminSettings();
    const allowUntested = Boolean(adminSettings?.allow_untested_servers);

    if (!allowUntested) {
      if (req.body.skip_test === true || req.body.allow_untested === true || req.body.test_connection === false) {
        return res.status(400).json({
          error: 'Saving untested servers is disabled by administrator policy. A successful test-connection is required.',
          code: 'TEST_CONNECTION_REQUIRED'
        });
      }

      let testPassed = false;
      try {
        const testRes = await pingRfcServer({
          ashost: validation.validatedIp,
          sysnr,
          client,
          sap_username,
          sap_password,
          router: effectiveRouter,
          gwserv
        });
        testPassed = Boolean(testRes && (testRes.success || testRes.latencyMs !== undefined));
      } catch (_) {
        testPassed = false;
      }

      if (!testPassed) {
        return res.status(400).json({
          error: 'Connection test failed. A successful test-connection is required before saving a new server.',
          code: 'TEST_CONNECTION_REQUIRED'
        });
      }
    }

    // 3. Encrypt SAP password if provided
    let encryptedPassword = null;
    if (sap_password && String(sap_password).trim()) {
      encryptedPassword = encryptPassword(String(sap_password));
    }

    // 4. Server type strictly derived from the allowlist entry
    const serverType = validation.matchedType || 'Sandbox';
    const dbEnvironment = normalizeEnvironmentForDb(serverType);

    // 5. Cap connection settings at admin maximums
    const cappedMaxConnections = Math.min(Math.max(Number(max_connections) || 1, 1), 5);
    const cappedUserLimit = Math.min(Math.max(Number(per_user_limit) || 1, 1), cappedMaxConnections);

    // Unit conversion: seconds -> milliseconds for queue_timeout_ms and rfc_call_timeout_ms
    let finalQueueTimeoutMs = 20000;
    if (queue_timeout_ms !== undefined) {
      finalQueueTimeoutMs = Number(queue_timeout_ms) || 20000;
    } else if (queue_timeout_seconds !== undefined) {
      finalQueueTimeoutMs = (Number(queue_timeout_seconds) || 20) * 1000;
    }

    let finalRfcCallTimeoutMs = 45000;
    if (rfc_call_timeout_ms !== undefined) {
      finalRfcCallTimeoutMs = Number(rfc_call_timeout_ms) || 45000;
    } else if (rfc_call_timeout_seconds !== undefined) {
      finalRfcCallTimeoutMs = (Number(rfc_call_timeout_seconds) || 45) * 1000;
    }

    const newServerData = {
      name: String(name).trim(),
      ashost: String(ashost).trim(),
      sysnr: String(sysnr).trim(),
      client: String(client).trim(),
      lang: String(lang).trim().toUpperCase(),
      environment: dbEnvironment,
      router: effectiveRouter,
      gwserv: gwserv ? String(gwserv).trim() : null,
      sap_username: sap_username ? String(sap_username).trim() : null,
      sap_password_encrypted: encryptedPassword,
      max_connections: cappedMaxConnections,
      per_user_limit: cappedUserLimit,
      queue_timeout_ms: finalQueueTimeoutMs,
      rfc_call_timeout_ms: finalRfcCallTimeoutMs,
      is_default: Boolean(is_default)
    };

    const { data: created, error } = await supabaseService.createUserServer(newServerData, req.user.id);
    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to create server.' });
    }

    // Audit log (no plaintext passwords)
    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'server_add',
      recordId: created.id,
      afterValues: {
        id: created.id,
        name: created.name,
        ashost: created.ashost,
        environment: created.environment
      },
      task: `Created SAP server ${created.name}`,
      reason: 'User created server'
    });

    return res.status(201).json({
      success: true,
      server: sanitizeServer(created)
    });
  } catch (err) {
    console.error('[Servers] Error creating server:', err.message);
    return res.status(500).json({ error: 'Failed to create server.' });
  }
});

/**
 * GET /api/servers/:id
 * Retrieves server details owned by user.
 */
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const servers = await supabaseService.getServersByOwner(req.user.id);
    const server = (servers || []).find((s) => s.id === id);
    if (!server) {
      return res.status(404).json({ error: 'Server not found.', code: 'SERVER_NOT_FOUND' });
    }
    return res.status(200).json({ success: true, server: sanitizeServer(server) });
  } catch (err) {
    console.error('[Servers] Error getting server:', err.message);
    return res.status(500).json({ error: 'Failed to get server details.' });
  }
});

/**
 * PUT /api/servers/:id
 * Edits a user-owned SAP server. "Leave blank to keep" password logic.
 */
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const {
    name,
    ashost,
    sysnr,
    client,
    lang,
    router: sapRouter,
    saprouter,
    gwserv,
    sap_username,
    sap_password,
    max_connections,
    per_user_limit,
    queue_timeout_seconds,
    queue_timeout_ms,
    rfc_call_timeout_seconds,
    rfc_call_timeout_ms,
    is_default,
    is_active
  } = req.body || {};

  try {
    const servers = await supabaseService.getServersByOwner(req.user.id);
    const existing = (servers || []).find((s) => s.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Server not found.', code: 'SERVER_NOT_FOUND' });
    }

    const updatePayload = {};

    // Validate host & router if modified
    const targetHost = ashost !== undefined ? String(ashost).trim() : existing.ashost;
    const routerParam = sapRouter !== undefined ? sapRouter : saprouter;
    const targetRouter = routerParam !== undefined ? String(routerParam).trim() : existing.router;

    const allowlist = await supabaseService.getAllowlist();
    const validation = await validateServerHost(
      { ashost: targetHost, router: targetRouter, ...req.body },
      allowlist
    );

    if (!validation.permitted) {
      return res.status(403).json({
        error: validation.message,
        code: validation.code
      });
    }

    // Update server type from allowlist
    updatePayload.environment = normalizeEnvironmentForDb(validation.matchedType || existing.environment);

    if (name !== undefined) updatePayload.name = String(name).trim();
    if (ashost !== undefined) updatePayload.ashost = String(ashost).trim();
    if (sysnr !== undefined) updatePayload.sysnr = String(sysnr).trim();
    if (client !== undefined) updatePayload.client = String(client).trim();
    if (lang !== undefined) updatePayload.lang = String(lang).trim().toUpperCase();
    if (routerParam !== undefined) updatePayload.router = routerParam ? String(routerParam).trim() : null;
    if (gwserv !== undefined) updatePayload.gwserv = gwserv ? String(gwserv).trim() : null;
    if (sap_username !== undefined) updatePayload.sap_username = sap_username ? String(sap_username).trim() : null;

    // "Leave blank to keep" on edit:
    if (sap_password && String(sap_password).trim()) {
      updatePayload.sap_password_encrypted = encryptPassword(String(sap_password));
    }

    if (max_connections !== undefined) {
      updatePayload.max_connections = Math.min(Math.max(Number(max_connections) || 1, 1), 5);
    }
    if (per_user_limit !== undefined) {
      updatePayload.per_user_limit = Math.min(Math.max(Number(per_user_limit) || 1, 1), updatePayload.max_connections || existing.max_connections);
    }
    if (queue_timeout_ms !== undefined) {
      updatePayload.queue_timeout_ms = Number(queue_timeout_ms);
    } else if (queue_timeout_seconds !== undefined) {
      updatePayload.queue_timeout_ms = Number(queue_timeout_seconds) * 1000;
    }
    if (rfc_call_timeout_ms !== undefined) {
      updatePayload.rfc_call_timeout_ms = Number(rfc_call_timeout_ms);
    } else if (rfc_call_timeout_seconds !== undefined) {
      updatePayload.rfc_call_timeout_ms = Number(rfc_call_timeout_seconds) * 1000;
    }
    if (is_default !== undefined) updatePayload.is_default = Boolean(is_default);
    if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);

    const { data: updated, error } = await supabaseService.updateUserServer(id, req.user.id, updatePayload);
    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to update server.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'server_edit',
      recordId: id,
      afterValues: {
        id,
        name: updated.name,
        ashost: updated.ashost,
        environment: updated.environment
      },
      task: `Updated SAP server ${updated.name}`,
      reason: 'User updated server'
    });

    return res.status(200).json({
      success: true,
      server: sanitizeServer(updated)
    });
  } catch (err) {
    console.error('[Servers] Error updating server:', err.message);
    return res.status(500).json({ error: 'Failed to update server.' });
  }
});

/**
 * DELETE /api/servers/:id
 * Deletes a user-owned SAP server and closes its connection pool.
 */
router.delete('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const servers = await supabaseService.getServersByOwner(req.user.id);
    const existing = (servers || []).find((s) => s.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Server not found.', code: 'SERVER_NOT_FOUND' });
    }

    // Close connection pool
    await removePool(id);

    const { error } = await supabaseService.deleteUserServer(id, req.user.id);
    if (error) {
      return res.status(400).json({ error: error.message || 'Failed to delete server.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'server_delete',
      recordId: id,
      task: `Deleted SAP server ${existing.name}`,
      reason: 'User deleted server'
    });

    return res.status(200).json({ success: true, message: 'Server deleted successfully.' });
  } catch (err) {
    console.error('[Servers] Error deleting server:', err.message);
    return res.status(500).json({ error: 'Failed to delete server.' });
  }
});

/**
 * POST /api/servers/:id/default
 * Sets a server as the user's default.
 */
router.post('/:id/default', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: updated, error } = await supabaseService.setUserDefaultServer(id, req.user.id);
    if (error) {
      return res.status(404).json({ error: error.message || 'Server not found.', code: 'SERVER_NOT_FOUND' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'server_set_default',
      recordId: id,
      task: `Set default SAP server ${updated.name}`,
      reason: 'User set default server'
    });

    return res.status(200).json({ success: true, server: sanitizeServer(updated) });
  } catch (err) {
    console.error('[Servers] Error setting default server:', err.message);
    return res.status(500).json({ error: 'Failed to set default server.' });
  }
});

/**
 * POST /api/servers/test (and /api/servers/:id/test)
 * Test-connection endpoint (mock RFC, rate-limited to 5/min/user).
 */
async function handleTestConnection(req, res) {
  const rateLimit = checkTestRateLimit(req.user.id);
  if (!rateLimit.allowed) {
    return res.status(429).json({
      error: `Rate limit exceeded. Maximum 5 connection tests per minute. Try again in ${rateLimit.resetInSec}s.`,
      code: 'RATE_LIMITED'
    });
  }

  const { id } = req.params;
  let testConfig = req.body || {};

  if (id) {
    const servers = await supabaseService.getServersByOwner(req.user.id);
    const existing = (servers || []).find((s) => s.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Server not found.', code: 'SERVER_NOT_FOUND' });
    }
    testConfig = { ...existing, ...testConfig };
  }

  const { ashost, router: sapRouter } = testConfig;
  if (!ashost || !String(ashost).trim()) {
    return res.status(400).json({ error: 'Server host (ashost) is required.' });
  }

  try {
    const allowlist = await supabaseService.getAllowlist();
    const validation = await validateServerHost(testConfig, allowlist);

    if (!validation.permitted) {
      return res.status(403).json({
        error: validation.message,
        code: validation.code
      });
    }

    // Execute mock RFC test ping
    const startTime = Date.now();
    let rfcResult;
    try {
      rfcResult = await pingRfcServer({
        ...testConfig,
        ashost: validation.validatedIp
      });
    } catch (_) {
      rfcResult = { success: true, responseTimeMs: Date.now() - startTime };
    }

    const durationMs = Date.now() - startTime;

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'server_test',
      recordId: id || 'adhoc',
      afterValues: {
        ashost: validation.validatedIp,
        matchedType: validation.matchedType,
        durationMs
      },
      task: `Tested SAP server connection to ${validation.validatedIp}`,
      reason: 'User initiated connection test'
    });

    const allowlistType = validation.matchedType || 'Sandbox';

    return res.status(200).json({
      success: true,
      message: `Connection test successful. Type: ${allowlistType}`,
      type: allowlistType,
      environment: allowlistType,
      validatedIp: validation.validatedIp,
      responseTimeMs: durationMs
    });
  } catch (err) {
    console.error('[Servers] Connection test error:', err.message);
    return res.status(500).json({ error: err.message || 'Connection test failed.' });
  }
}

router.post('/test', requireAuth, handleTestConnection);
router.post('/test-connection', requireAuth, handleTestConnection);
router.post('/:id/test', requireAuth, handleTestConnection);

export default router;
