import express from 'express';
import {
  checkSapSessionHealth,
  discoverSapSessions,
  getSelectedSapSessionId,
  getSelectedSapUser,
  setSelectedSapSessionId
} from '../services/sapGuiClient.js';
import { pingRfcServer } from '../services/sapRfcClient.js';
import { getServerHealth, getCircuitBreaker, updateServerHealth, probeServerHealth, HEALTH_STATE, BREAKER_STATE } from '../services/serverHealthService.js';
import { validateServerHost } from '../services/serverAllowlistService.js';
import { decryptPassword } from '../utils/crypto.js';
import { supabaseService } from '../services/supabaseClient.js';
import { extractToken, requireAuth, requireServerAccess, requireAppPermission } from '../middleware/auth.js';
import { requireServerOwner } from '../middleware/serverOwnership.js';
import { sendFriendlyError, toFriendlyError } from '../utils/friendlyError.js';
import { traceMiddlewareStep } from '../utils/rfcTrace.js';

const router = express.Router();

/**
 * Resolves the target SAP server from request headers, query parameters,
 * or authenticated user permissions.
 */
async function resolveTargetServer(req) {
  const trace = traceMiddlewareStep(req, 'resolveTargetServer');
  try {
    if (req.selectedServer) return req.selectedServer;
    if (req._serverRecord) return req._serverRecord;

    let serverId =
      req.headers?.['x-sap-server-id'] ||
      req.query?.serverId ||
      req.query?.server_id;

    if (serverId) {
      try {
        const server = await supabaseService.getServerById(serverId, { req });
        if (server) return server;
      } catch (err) {
        if (err.code === 'DB_TIMEOUT') throw err;
      }
    }

    // If user is authenticated, resolve their permitted server
    const token = extractToken(req);
    if (token) {
      try {
        const { data } = await supabaseService.getUser(token);
        if (data?.user) {
          const available = await supabaseService.getAvailableServersForUser(data.user.id, data.user.role);
          if (available && available.length > 0) {
            const matched = await supabaseService.getServerById(available[0].id, { req });
            if (matched) return matched;
          } else {
            // Authenticated user has NO permitted servers assigned: fail closed
            return null;
          }
        }
      } catch (err) {
        if (err.code === 'DB_TIMEOUT') throw err;
      }
    }

    // Fallback for tests or single active server in database
    try {
      const allServers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
      if (allServers && allServers.length > 0) {
        const withCreds = allServers.find((s) => s.sap_username && s.is_active !== false);
        const candidate = withCreds || allServers[0];
        if (candidate?.id) {
          const full = await supabaseService.getServerById(candidate.id, { req });
          if (full) return full;
        }
        return candidate;
      }
    } catch (err) {
      if (err.code === 'DB_TIMEOUT') throw err;
    }

    return null;
  } finally {
    trace.end();
  }
}

/**
 * GET /api/sap/sessions
 * Returns all active SAP GUI or RFC sessions and the currently selected session.
 */
router.get('/sessions', requireAuth, requireServerOwner, requireAppPermission('bom.*'), async (req, res) => {
  try {
    const useRfc = process.env.SAP_BOM_MODE !== 'GUI' && process.env.USE_MOCK_SAP !== 'true';
    if (useRfc) {
      const targetServer = await resolveTargetServer(req);
      const serverSystem = targetServer?.environment || targetServer?.name || 'DEV';
      const serverClient = targetServer?.client || process.env.SAP_RFC_CLIENT || '500';
      const serverUser = targetServer?.sap_username || process.env.SAP_RFC_USER || 'SAP User';
      const sessionId = `RFC_${targetServer?.id || 'DEFAULT'}`;

      return res.status(200).json({
        success: true,
        selectedSessionId: sessionId,
        selectedUser: serverUser,
        sessions: [
          {
            id: sessionId,
            system: serverSystem,
            client: serverClient,
            user: serverUser,
            mode: 'RFC/BAPI',
            status: 'AVAILABLE',
            selected: true
          }
        ],
        status: 'AVAILABLE',
        connected: true
      });
    }

    const health = await checkSapSessionHealth();
    const sessions = (health.sessions || []).map((s) => ({
      ...s,
      selected: Boolean(health.selectedSessionId && s.id === health.selectedSessionId)
    }));

    return res.status(200).json({
      success: true,
      selectedSessionId: health.selectedSessionId || null,
      selectedUser: health.selectedUser || health.user || null,
      sessions,
      status: health.status,
      connected: health.connected,
      message: health.message
    });
  } catch (err) {
    return res.status(200).json({
      success: false,
      selectedSessionId: null,
      selectedUser: null,
      sessions: [],
      status: 'SERVER_UNAVAILABLE',
      connected: false,
      message: `Failed to retrieve SAP sessions: ${err.message}`
    });
  }
});

/**
 * POST /api/sap/sessions/select
 * Selects an active SAP session to be used for SAP operations.
 */
router.post('/sessions/select', requireAuth, requireServerOwner, requireAppPermission('bom.*'), async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_SESSION_ID',
        message: 'A valid sessionId string is required.'
      });
    }

    if (sessionId.startsWith('RFC_') || sessionId === 'RFC_S4A') {
      const targetServer = await resolveTargetServer(req);
      const rfcUser = targetServer?.sap_username || process.env.SAP_RFC_USER || 'SAP User';
      return res.status(200).json({
        success: true,
        selectedSessionId: sessionId,
        selectedUser: rfcUser,
        message: `Active session set to RFC/BAPI (${rfcUser}).`
      });
    }

    const discovery = await discoverSapSessions();
    const sessions = discovery.sessions || [];
    const matched = sessions.find((s) => s.id === sessionId.trim());

    if (!matched) {
      return res.status(404).json({
        success: false,
        code: 'SESSION_NOT_FOUND',
        message: 'The requested SAP session was not found or is no longer available.'
      });
    }

    setSelectedSapSessionId(matched.id, matched.user, req.user?.id);
    const health = await checkSapSessionHealth();

    return res.status(200).json({
      success: true,
      message: `Active SAP session switched to ${matched.user}.`,
      selectedSessionId: matched.id,
      selectedUser: matched.user,
      session: {
        id: matched.id,
        user: matched.user,
        system: matched.system,
        client: matched.client,
        transaction: matched.transaction,
        title: matched.title,
        busy: matched.busy
      },
      health
    });
  } catch (err) {
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * GET /api/sap/session-status
 * Health check endpoint for dynamic SAP RFC or GUI session monitoring.
 */
router.get('/session-status', requireAuth, requireServerOwner, requireAppPermission('bom.*'), async (req, res) => {
  const overallStart = Date.now();
  let overallTimer = null;
  let isDone = false;

  // Hard timeout on session-status as a whole (10 s)
  overallTimer = setTimeout(() => {
    if (!isDone && !res.headersSent) {
      isDone = true;
      const duration = Date.now() - overallStart;
      console.warn(`[SlowStep] session-status timed out after ${duration}ms`);
      return res.status(200).json({
        connected: false,
        mode: 'RFC',
        status: 'SERVER_UNAVAILABLE',
        code: 'HEALTH_CHECK_TIMEOUT',
        message: 'SAP health check timed out. Please try again shortly.',
        system: req.selectedServer?.environment || 'DEV',
        client: req.selectedServer?.client || '',
        user: req.selectedServer?.sap_username || '',
        selectedUser: req.selectedServer?.sap_username || '',
        latencyMs: null,
        selectedSessionId: req.selectedServer ? `RFC_${req.selectedServer.id}` : null,
        sessions: []
      });
    }
  }, 10000);

  const respondJson = (data) => {
    if (isDone || res.headersSent) return;
    isDone = true;
    if (overallTimer) clearTimeout(overallTimer);
    const duration = Date.now() - overallStart;
    if (duration > 2000) {
      console.warn(`[SlowStep] session-status total duration took ${duration}ms`);
    }
    return res.status(200).json(data);
  };

  try {
    const resolveStart = Date.now();
    const [targetServer, allowlist] = await Promise.all([
      resolveTargetServer(req),
      supabaseService.getAllowlist()
    ]);
    const resolveDur = Date.now() - resolveStart;
    if (resolveDur > 2000) {
      console.warn(`[SlowStep] resolveTargetServer and allowlist fetch took ${resolveDur}ms`);
    }

    if (process.env.SAP_BOM_MODE !== 'GUI') {
      if (!targetServer) {
        return respondJson({
          connected: false,
          mode: 'RFC',
          status: 'SERVER_UNAVAILABLE',
          code: 'NO_SERVER_SELECTED',
          message: 'No SAP server selected or assigned to your account.',
          system: 'DEV',
          client: '',
          user: '',
          selectedUser: '',
          latencyMs: null,
          selectedSessionId: null,
          sessions: []
        });
      }

      const serverSystem = targetServer.environment || targetServer.name || 'DEV';
      const serverClient = targetServer.client || '100';
      const serverUser = targetServer.sap_username || '';
      const sessionId = `RFC_${targetServer.id}`;

      // 1. Check disabled
      if (targetServer.is_disabled) {
        return respondJson({
          connected: false,
          mode: 'RFC',
          status: 'SERVER_UNAVAILABLE',
          code: 'SERVER_DISABLED',
          message: 'This SAP server is disabled.',
          system: serverSystem,
          client: serverClient,
          user: serverUser,
          selectedUser: serverUser,
          latencyMs: null,
          selectedSessionId: sessionId,
          sessions: []
        });
      }

      // 2. Check credentials presence
      const hasCreds = Boolean(
        targetServer.sap_username &&
        (targetServer.sap_password || targetServer.sap_password_encrypted)
      );

      if (!hasCreds) {
        return respondJson({
          connected: false,
          mode: 'RFC',
          status: 'SERVER_UNAVAILABLE',
          code: 'NO_CREDENTIALS',
          message: `No SAP credentials configured for server "${targetServer.name}".`,
          system: serverSystem,
          client: serverClient,
          user: serverUser,
          selectedUser: serverUser,
          latencyMs: null,
          selectedSessionId: sessionId,
          sessions: []
        });
      }

      // 3. Check password decryption
      if (targetServer.sap_password_encrypted && !targetServer.sap_password) {
        try {
          decryptPassword(targetServer.sap_password_encrypted);
        } catch (decErr) {
          return respondJson({
            connected: false,
            mode: 'RFC',
            status: 'SERVER_UNAVAILABLE',
            code: 'DECRYPT_FAILED',
            message: 'Failed to decrypt saved SAP password. Please re-enter credentials in My Servers.',
            system: serverSystem,
            client: serverClient,
            user: serverUser,
            selectedUser: serverUser,
            latencyMs: null,
            selectedSessionId: sessionId,
            sessions: []
          });
        }
      }

      // 4. Check host allowlist with validation & slow logging
      const hostValStart = Date.now();
      const validation = await validateServerHost(targetServer, allowlist || []);
      const hostValDur = Date.now() - hostValStart;
      if (hostValDur > 2000) {
        console.warn(`[SlowStep] validateServerHost took ${hostValDur}ms`);
      }

      if (!validation.permitted) {
        return respondJson({
          connected: false,
          mode: 'RFC',
          status: 'SERVER_UNAVAILABLE',
          code: validation.code,
          message: validation.message,
          system: serverSystem,
          client: serverClient,
          user: serverUser,
          selectedUser: serverUser,
          latencyMs: null,
          selectedSessionId: sessionId,
          sessions: []
        });
      }

      // 5. Automatic health probing with circuit breaker respect, in-flight deduplication & 60s cache
      const health = await probeServerHealth(targetServer);
      const isUp = health.status === HEALTH_STATE.HEALTHY && health.circuit_breaker === BREAKER_STATE.CLOSED;

      return respondJson({
        connected: isUp,
        mode: 'RFC',
        status: isUp ? 'AVAILABLE' : 'SERVER_UNAVAILABLE',
        code: isUp ? 'AVAILABLE' : (health.last_code || 'SAP_SERVER_UNAVAILABLE'),
        system: serverSystem,
        client: serverClient,
        user: serverUser,
        selectedUser: serverUser,
        message: isUp ? `SAP RFC Online (${health.latency_ms || 2}ms)` : (health.last_error || 'SAP server is not reachable right now. Please try again shortly.'),
        latencyMs: health.latency_ms,
        health: health.status,
        circuit_breaker: health.circuit_breaker,
        selectedSessionId: sessionId,
        sessions: isUp
          ? [
              {
                id: sessionId,
                system: serverSystem,
                client: serverClient,
                user: serverUser,
                mode: 'RFC/BAPI',
                status: 'AVAILABLE',
                selected: true
              }
            ]
          : []
      });
    }

    const health = await checkSapSessionHealth();
    return respondJson(health);
  } catch (err) {
    const friendly = toFriendlyError(err);
    return respondJson({
      connected: false,
      status: 'SERVER_UNAVAILABLE',
      code: friendly.code,
      title: friendly.title,
      message: friendly.message,
      hint: friendly.hint,
      retryable: friendly.retryable
    });
  }
});

export default router;
