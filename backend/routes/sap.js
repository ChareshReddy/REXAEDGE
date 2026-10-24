import express from 'express';
import {
  checkSapSessionHealth,
  discoverSapSessions,
  getSelectedSapSessionId,
  getSelectedSapUser,
  setSelectedSapSessionId
} from '../services/sapGuiClient.js';
import { pingRfcServer } from '../services/sapRfcClient.js';
import { supabaseService } from '../services/supabaseClient.js';
import { extractToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Resolves the target SAP server from request headers, query parameters,
 * or authenticated user permissions.
 */
async function resolveTargetServer(req) {
  let serverId =
    req.headers?.['x-server-id'] ||
    req.headers?.['x-sap-server-id'] ||
    req.query?.serverId ||
    req.query?.server_id;

  if (serverId) {
    try {
      const server = await supabaseService.getServerById(serverId);
      if (server) return server;
    } catch (_) {}
  }

  // If user is authenticated, resolve their permitted server
  const token = extractToken(req);
  if (token) {
    try {
      const { data } = await supabaseService.getUser(token);
      if (data?.user) {
        const available = await supabaseService.getAvailableServersForUser(data.user.id, data.user.role);
        if (available && available.length > 0) {
          const matched = await supabaseService.getServerById(available[0].id);
          if (matched) return matched;
        }
      }
    } catch (_) {}
  }

  // Fallback for tests or single active server in database
  try {
    const allServers = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
    if (allServers && allServers.length > 0) {
      const withCreds = allServers.find((s) => s.sap_username && s.is_active !== false);
      const candidate = withCreds || allServers[0];
      if (candidate?.id) {
        const full = await supabaseService.getServerById(candidate.id);
        if (full) return full;
      }
      return candidate;
    }
  } catch (_) {}

  return null;
}

/**
 * GET /api/sap/sessions
 * Returns all active SAP GUI or RFC sessions and the currently selected session.
 */
router.get('/sessions', async (req, res) => {
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
router.post('/sessions/select', async (req, res) => {
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

    setSelectedSapSessionId(matched.id, matched.user);
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
    return res.status(500).json({
      success: false,
      code: 'SELECTION_ERROR',
      message: `Failed to select SAP GUI session: ${err.message}`
    });
  }
});

/**
 * GET /api/sap/session-status
 * Health check endpoint for dynamic SAP RFC or GUI session monitoring.
 */
router.get('/session-status', async (req, res) => {
  try {
    const useRfc = process.env.SAP_BOM_MODE !== 'GUI' && process.env.USE_MOCK_SAP !== 'true';
    if (useRfc) {
      const targetServer = await resolveTargetServer(req);

      if (!targetServer) {
        return res.status(200).json({
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

      // Check if credentials exist on this server
      const hasCreds = Boolean(
        targetServer.sap_username &&
        (targetServer.sap_password || targetServer.sap_password_encrypted)
      );

      if (!hasCreds) {
        const serverSystem = targetServer.environment || targetServer.name || 'DEV';
        const serverClient = targetServer.client || '100';
        return res.status(200).json({
          connected: false,
          mode: 'RFC',
          status: 'SERVER_UNAVAILABLE',
          code: 'NO_CREDENTIALS',
          message: `No SAP credentials configured for server "${targetServer.name}".`,
          system: serverSystem,
          client: serverClient,
          user: targetServer.sap_username || '',
          selectedUser: targetServer.sap_username || '',
          latencyMs: null,
          selectedSessionId: `RFC_${targetServer.id}`,
          sessions: []
        });
      }

      const ping = await pingRfcServer(targetServer);
      const serverSystem = targetServer.environment || targetServer.name || 'DEV';
      const serverClient = targetServer.client || '100';
      const serverUser = targetServer.sap_username || '';
      const sessionId = `RFC_${targetServer.id}`;

      return res.status(200).json({
        connected: ping.success,
        mode: 'RFC',
        status: ping.success ? 'AVAILABLE' : 'SERVER_UNAVAILABLE',
        code: ping.success ? 'AVAILABLE' : (ping.code || 'SAP_SERVER_UNAVAILABLE'),
        system: serverSystem,
        client: serverClient,
        user: serverUser,
        selectedUser: serverUser,
        message: ping.success ? `SAP RFC Online (${ping.latencyMs}ms)` : ping.message,
        latencyMs: ping.latencyMs,
        selectedSessionId: sessionId,
        sessions: ping.success
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
    return res.status(200).json(health);
  } catch (err) {
    return res.status(200).json({
      connected: false,
      status: 'SERVER_UNAVAILABLE',
      code: 'SAP_SERVER_UNAVAILABLE',
      message: `The SAP server is currently unavailable: ${err.message}`
    });
  }
});

export default router;
