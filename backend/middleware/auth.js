import { supabaseService } from '../services/supabaseClient.js';
import { isModuleAvailable, MODULE_KEYS, ALL_BOM_APPS, normalizePermissions } from '../config/modules.js';

const COOKIE_NAME = 'sb_access_token';

/**
 * Extracts session token from Authorization header or cookies
 */
export function extractToken(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.[COOKIE_NAME] || req.cookies?.sap_session_id || null;
}

// In-memory user status cache (evicted immediately whenever status or password changes)
export const userStatusCache = new Map();

export function invalidateUserStatusCache(userId) {
  if (userId) {
    userStatusCache.delete(String(userId));
  } else {
    userStatusCache.clear();
  }
}

/**
 * Authentication Middleware
 * Requires a valid Supabase Auth session token on every protected route.
 * Reads must_change_password and is_disabled from database on each request.
 * Attaches verified user { id, email, role, must_change_password, is_disabled } to req.user.
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. No active session token found.'
    });
  }

  const { data, error } = await supabaseService.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({
      error: error?.message || 'Session expired or invalid. Please log in again.'
    });
  }

  const userId = data.user.id;
  let userStatus = userStatusCache.get(userId);
  if (!userStatus) {
    const profile = await supabaseService.getUserProfile(userId);
    userStatus = {
      must_change_password: Boolean(profile ? profile.must_change_password : data.user.must_change_password),
      is_disabled: Boolean(profile ? profile.is_disabled : data.user.is_disabled),
      role: profile?.role || data.user.role || 'user'
    };
    userStatusCache.set(userId, userStatus);
  }

  // 1. Refuse disabled users immediately
  if (userStatus.is_disabled) {
    return res.status(403).json({
      error: 'Your account has been disabled. Please contact your administrator.',
      code: 'USER_DISABLED'
    });
  }

  // 2. Enforce must_change_password: reject every route except change-password, me, logout, config
  if (userStatus.must_change_password) {
    const reqPath = (req.path || req.originalUrl || '').split('?')[0];
    const isExempt =
      reqPath.endsWith('/change-password') ||
      reqPath.endsWith('/me') ||
      reqPath.endsWith('/logout') ||
      reqPath.endsWith('/config');

    if (!isExempt) {
      return res.status(403).json({
        error: 'Password change required before accessing other resources.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
  }

  req.user = {
    ...data.user,
    role: userStatus.role,
    must_change_password: userStatus.must_change_password,
    is_disabled: userStatus.is_disabled
  };

  // Backward compatibility attachment
  req.sapSession = {
    sessionId: token,
    username: data.user.email,
    email: data.user.email,
    user: req.user
  };

  next();
}

/**
 * Admin Authorization Middleware
 * Verifies that the authenticated user possesses the 'admin' role.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Forbidden: Administrator privileges required.'
    });
  }

  next();
}

/**
 * Server Permission Verification Middleware
 * Validates on EVERY request that the user has permission to access the specified server.
 *
 * @param {'read_only'|'read_write'} requiredLevel
 */
export function requireServerAccess(requiredLevel = 'read_only') {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Resolve target serverId from headers, body, or query
    let serverId =
      req.headers?.['x-sap-server-id'] ||
      req.body?.serverId ||
      req.body?.server_id ||
      req.query?.serverId ||
      req.query?.server_id;

    // Fallback: If user didn't specify serverId, check user's available servers
    if (!serverId) {
      const available = await supabaseService.getAvailableServersForUser(
        req.user.id,
        req.user.role
      );
      if (available.length === 1) {
        serverId = available[0].id;
      } else if (available.length > 1) {
        // Default to the first available server for backwards-compatibility with single-server tests
        serverId = available[0].id;
      } else {
        return res.status(403).json({
          error: 'Access denied: You have no permitted SAP servers assigned.'
        });
      }
    }

    const accessCheck = await supabaseService.checkUserServerAccess(
      req.user.id,
      serverId,
      req.user.role
    );

    if (!accessCheck.permitted) {
      return res.status(403).json({
        error: accessCheck.reason || 'Access denied: You do not have permission for this SAP server.'
      });
    }

    req.selectedServer = accessCheck.server;
    req.serverAccessLevel = 'read_write';
    req.userPermissions = req.user?.role === 'admin'
      ? [...ALL_BOM_APPS]
      : normalizePermissions(accessCheck.permissions || []);
    next();
  };
}

/**
 * Module Access Verification Middleware
 * Validates on EVERY request that the selected server has the requested module enabled.
 * Strictly rejects coming_soon modules even if a row exists in the database.
 *
 * @param {string} moduleKey - Key from MODULE_KEYS (e.g. 'bom')
 */
export function requireModuleAccess(moduleKey) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Strictly reject modules that are coming_soon or unknown even if a DB row exists
    if (!isModuleAvailable(moduleKey)) {
      return res.status(403).json({
        error: 'Module not enabled for this server'
      });
    }

    // Job status/cancel and ticketed downloads are authorized by job/ticket ownership
    if (
      req.params?.jobId ||
      (req.path && req.path.match(/^\/jobs\/[^/]+(\/cancel)?$/)) ||
      (req.path && req.path.match(/^\/download\/[^/]+$/))
    ) {
      return next();
    }

    // Resolve target serverId
    let serverId = req.selectedServer?.id;
    if (!serverId) {
      serverId =
        req.headers?.['x-sap-server-id'] ||
        req.body?.serverId ||
        req.body?.server_id ||
        req.query?.serverId ||
        req.query?.server_id;

      if (!serverId) {
        const available = await supabaseService.getAvailableServersForUser(
          req.user.id,
          req.user.role
        );
        if (available && available.length > 0) {
          serverId = available[0].id;
        } else {
          return res.status(403).json({
            error: 'Access denied: You have no permitted SAP servers assigned.'
          });
        }
      }
    }

    // Verify user server access if not already verified
    if (!req.selectedServer) {
      const accessCheck = await supabaseService.checkUserServerAccess(
        req.user.id,
        serverId,
        req.user.role
      );
      if (!accessCheck.permitted) {
        return res.status(403).json({
          error: accessCheck.reason || 'Access denied: You do not have permission for this SAP server.'
        });
      }
      req.selectedServer = accessCheck.server;
    }

    // Check module enablement on the selected server
    const isEnabled = await supabaseService.isModuleEnabledForServer(serverId, moduleKey);
    if (!isEnabled) {
      return res.status(403).json({
        error: 'Module not enabled for this server'
      });
    }

    next();
  };
}

export const APP_ACTION_NAMES = Object.freeze({
  'bom.create': 'create BOMs',
  'bom.copy': 'copy BOMs',
  'bom.delete': 'delete BOMs',
  'bom.display': 'display BOMs',
  'bom.validate': 'validate BOMs'
});

/**
 * App-Level Permission Verification Middleware
 * Validates that the user has the required BOM app permission on the selected SAP server.
 * Returns 403 with friendly message: "You don't have permission to <action> on this server."
 *
 * @param {string|string[]|Function} targetApp - 'bom.create', ['bom.validate', 'bom.copy'], 'bom.*', etc.
 */
export function requireAppPermission(targetApp) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Resolve target serverId from headers, body, query, or req.selectedServer
    let serverId =
      req.selectedServer?.id ||
      req.headers?.['x-sap-server-id'] ||
      req.body?.serverId ||
      req.body?.server_id ||
      req.query?.serverId ||
      req.query?.server_id;

    if (!serverId) {
      const available = await supabaseService.getAvailableServersForUser(
        req.user.id,
        req.user.role
      );
      if (available && available.length > 0) {
        serverId = available[0].id;
      } else {
        return res.status(403).json({
          error: 'Access denied: You have no permitted SAP servers assigned.'
        });
      }
    }

    const accessCheck = await supabaseService.checkUserServerAccess(
      req.user.id,
      serverId,
      req.user.role
    );

    if (!accessCheck.permitted) {
      return res.status(403).json({
        error: accessCheck.reason || 'Access denied: You do not have permission for this SAP server.'
      });
    }

    req.selectedServer = accessCheck.server;
    req.serverAccessLevel = 'read_write';

    // Admin bypass: full access to everything on all servers
    if (req.user.role === 'admin') {
      req.userPermissions = [...ALL_BOM_APPS];
      return next();
    }

    const userPerms = normalizePermissions(accessCheck.permissions || []);
    req.userPermissions = userPerms;

    // Resolve target app(s)
    let targets = typeof targetApp === 'function' ? targetApp(req) : targetApp;
    if (!targets) {
      return next();
    }

    // Wildcard / helper check: 'bom.*' or '*' means user has ANY bom.* permission on this server
    if (targets === 'bom.*' || targets === '*') {
      const hasAnyBom = userPerms.some((p) => p.startsWith('bom.'));
      if (!hasAnyBom) {
        return res.status(403).json({
          error: "You don't have permission to access BOM features on this server."
        });
      }
      return next();
    }

    // List of allowed apps for this endpoint
    const targetList = Array.isArray(targets) ? targets : [targets];
    const isAllowed = targetList.some((app) => userPerms.includes(app));

    if (!isAllowed) {
      const primaryTarget = targetList[0];
      const actionName = APP_ACTION_NAMES[primaryTarget] || primaryTarget;
      return res.status(403).json({
        error: `You don't have permission to ${actionName} on this server.`
      });
    }

    next();
  };
}
