import express from 'express';
import { Client } from 'open-rfc';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { supabaseService } from '../services/supabaseClient.js';
import { auditLogger } from '../services/auditLog.js';
import { getRfcConnectionParams } from '../services/sapRfcClient.js';
import { decryptPassword } from '../utils/crypto.js';
import { testServerConnection } from '../services/sapConnectionTest.js';
import { validatePasswordPolicy } from '../utils/passwordPolicy.js';

const router = express.Router();

// Enforce both Authentication and Administrator role on ALL /api/admin/* routes
router.use(requireAuth);
router.use(requireAdmin);

/**
 * ============================================================================
 * USER MANAGEMENT ROUTES
 * ============================================================================
 */

/**
 * GET /api/admin/users
 * Lists all registered users.
 */
router.get('/users', async (req, res) => {
  try {
    const users = await supabaseService.listUsers();
    return res.status(200).json({ success: true, users });
  } catch (err) {
    console.error('[Admin] Error listing users:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve users list.' });
  }
});

/**
 * POST /api/admin/users
 * Creates a new user via Supabase Admin API with initial password and role.
 */
router.post('/users', async (req, res) => {
  const { email, password, role = 'user' } = req.body || {};

  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedRole = role === 'admin' ? 'admin' : 'user';

  try {
    const result = await supabaseService.createUser({
      email: String(email).trim(),
      password,
      role: normalizedRole
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to create user.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_create_user',
      recordId: result.data.user.id,
      afterValues: { email: result.data.user.email, role: normalizedRole },
      task: `Admin created user ${result.data.user.email} (${normalizedRole})`,
      reason: 'Administrator action'
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: result.data.user
    });
  } catch (err) {
    console.error('[Admin] Error creating user:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred while creating user.' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Removes/deactivates a user and cascades their server permissions.
 */
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  // Prevent admin from deleting their own account (by ID or email)
  if (req.user.id === id || req.user.email?.toLowerCase() === id?.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  try {
    const allUsers = await supabaseService.listUsers();
    const targetUser = allUsers.find((u) => u.id === id || u.email?.toLowerCase() === id?.toLowerCase());
    if (targetUser && (targetUser.id === req.user.id || targetUser.email?.toLowerCase() === req.user.email?.toLowerCase())) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }
    const result = await supabaseService.deleteUser(id);

    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to delete user.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_delete_user',
      recordId: id,
      task: `Admin deleted user ${id}`,
      reason: 'Administrator action'
    });

    return res.status(200).json({
      success: true,
      message: 'User removed successfully.'
    });
  } catch (err) {
    console.error('[Admin] Error deleting user:', err.message);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

/**
 * POST /api/admin/users/:id/password
 * Sets a new password for the specified user via Supabase Admin API.
 * Admin-only; validates password policy, logs audit event, never returns/logs passwords.
 */
router.post('/users/:id/password', async (req, res) => {
  const { id } = req.params;
  const { password, confirmPassword } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  if (!password || !confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation are required.' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match.' });
  }

  const policyCheck = validatePasswordPolicy(password);
  if (!policyCheck.isValid) {
    return res.status(400).json({
      error: policyCheck.errors[0] || 'Password does not meet security requirements.',
      errors: policyCheck.errors
    });
  }

  try {
    const result = await supabaseService.updateUserPassword(id, password);

    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to set password.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_set_user_password',
      recordId: id,
      afterValues: { user_id: id, password_updated: true },
      task: `Admin set new password for user ${id}`,
      reason: 'Administrator password reset'
    });

    return res.status(200).json({
      success: true,
      message: 'Password set successfully.'
    });
  } catch (err) {
    console.error('[Admin] Error setting user password:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred while setting password.' });
  }
});

/**
 * ============================================================================
 * SAP SERVER MANAGEMENT ROUTES
 * ============================================================================
 */

/**
 * GET /api/admin/servers
 * Lists all configured SAP servers with connection parameters.
 */
/**
 * GET /api/admin/servers
 * Lists all configured SAP servers with connection parameters.
 */
router.get('/servers', async (req, res) => {
  try {
    const servers = await supabaseService.listServers({ includeSensitive: true, role: req.user.role });
    return res.status(200).json({ success: true, servers });
  } catch (err) {
    console.error('[Admin] Error listing servers:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve SAP servers.' });
  }
});

/**
 * POST /api/admin/servers
 * Adds a new SAP server endpoint.
 */
router.post('/servers', async (req, res) => {
  const {
    name,
    ashost,
    sysnr,
    client,
    lang = 'EN',
    environment,
    router: sapRouter,
    gwserv,
    modules,
    sap_username,
    sap_password
  } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Server name is required.' });
  }

  if (!ashost || !String(ashost).trim()) {
    return res.status(400).json({ error: 'Application Server host (ashost) is required.' });
  }

  if (!sysnr || !String(sysnr).trim()) {
    return res.status(400).json({ error: 'System Number (sysnr) is required.' });
  }

  if (!client || !String(client).trim()) {
    return res.status(400).json({ error: 'Client number is required.' });
  }

  const validEnvs = ['SANDBOX', 'DEV', 'QA', 'PROD'];
  const env = String(environment || 'SANDBOX').toUpperCase();
  if (!validEnvs.includes(env)) {
    return res.status(400).json({ error: `Environment must be one of: ${validEnvs.join(', ')}.` });
  }

  try {
    const server = await supabaseService.createServer({
      name: String(name).trim(),
      ashost: String(ashost).trim(),
      sysnr: String(sysnr).trim(),
      client: String(client).trim(),
      lang: String(lang || 'EN').toUpperCase(),
      environment: env,
      router: sapRouter,
      gwserv,
      modules,
      sap_username: sap_username ? String(sap_username).trim() : null,
      sap_password: sap_password ? String(sap_password).trim() : null,
      createdBy: req.user.id
    });

    // Safe audit logging: NEVER log passwords
    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_create_server',
      recordId: server.id,
      afterValues: {
        name: server.name,
        environment: server.environment,
        sap_username: server.sap_username,
        has_password: Boolean(server.has_password),
        modules: server.modules
      },
      task: `Admin created SAP server ${server.name} (${server.environment}) with modules: ${(server.modules || []).join(', ') || 'none'}`,
      reason: 'Administrator action'
    });

    // Trigger automatic background connection test if credentials exist
    if (server.sap_username && server.has_password) {
      testServerConnection(server, { persist: true }).catch((err) => {
        console.warn('[Admin] Background connection test warning:', err.message);
      });
    }

    return res.status(201).json({
      success: true,
      message: 'SAP server created successfully.',
      server
    });
  } catch (err) {
    console.error('[Admin] Error creating server:', err.message);
    const pass = req.body?.sap_password ? String(req.body.sap_password).trim() : '';
    const rawError = err.message || 'Failed to create SAP server.';
    const sanitizedError = pass ? rawError.split(pass).join('***') : rawError;
    return res.status(400).json({ error: sanitizedError });
  }
});

/**
 * PUT /api/admin/servers/:id
 * Updates an existing SAP server.
 */
router.put('/servers/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Server ID is required.' });
  }

  if (req.body?.environment !== undefined) {
    const validEnvs = ['SANDBOX', 'DEV', 'QA', 'PROD'];
    const env = String(req.body.environment).toUpperCase();
    if (!validEnvs.includes(env)) {
      return res.status(400).json({ error: `Environment must be one of: ${validEnvs.join(', ')}.` });
    }
    req.body.environment = env;
  }

  try {
    const updated = await supabaseService.updateServer(id, {
      ...req.body,
      updatedBy: req.user.id
    });

    if (!updated) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    // Safe audit logging: NEVER log passwords
    const safeAuditValues = { ...req.body };
    delete safeAuditValues.sap_password;
    delete safeAuditValues.sap_password_encrypted;

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_edit_server',
      recordId: id,
      afterValues: {
        ...safeAuditValues,
        sap_username: updated.sap_username,
        has_password: Boolean(updated.has_password),
        modules: updated.modules
      },
      task: `Admin updated SAP server ${updated.name} (modules: ${(updated.modules || []).join(', ') || 'none'})`,
      reason: 'Administrator action'
    });

    // Trigger automatic background connection test if credentials exist
    if (updated.sap_username && updated.has_password) {
      testServerConnection(updated, { persist: true }).catch((err) => {
        console.warn('[Admin] Background connection test warning:', err.message);
      });
    }

    return res.status(200).json({
      success: true,
      message: 'SAP server updated successfully.',
      server: updated
    });
  } catch (err) {
    console.error('[Admin] Error updating server:', err.message);
    return res.status(400).json({ error: err.message || 'Failed to update SAP server.' });
  }
});

/**
 * POST /api/admin/servers/test-connection
 * Tests RFC connectivity using the provided connection parameters and credentials.
 * Read-only check with no writes to SAP.
 */
router.post('/servers/test-connection', async (req, res) => {
  const {
    serverId,
    name,
    ashost,
    sysnr,
    client,
    lang = 'EN',
    router: sapRouter,
    gwserv,
    sap_username,
    sap_password
  } = req.body || {};

  let resolvedUsername = sap_username ? String(sap_username).trim() : '';
  let resolvedPassword = sap_password ? String(sap_password).trim() : '';

  // If on edit and password wasn't provided, resolve stored encrypted password from existing server
  if (serverId && (!resolvedPassword || !resolvedUsername)) {
    try {
      const existing = await supabaseService.getServerById(serverId);
      if (existing) {
        if (!resolvedUsername) resolvedUsername = existing.sap_username || '';
        if (!resolvedPassword && existing.sap_password_encrypted) {
          resolvedPassword = decryptPassword(existing.sap_password_encrypted);
        }
      }
    } catch (err) {
      console.error('[Admin] Error resolving stored password for test connection:', err.message);
    }
  }

  if (!resolvedUsername || !resolvedPassword) {
    return res.status(400).json({
      success: false,
      error: 'SAP Username and SAP Password are required to test connection.'
    });
  }

  try {
    const testResult = await testServerConnection({
      id: serverId,
      name,
      ashost,
      sysnr,
      client,
      lang,
      router: sapRouter,
      gwserv,
      sap_username: resolvedUsername,
      sap_password: resolvedPassword
    }, { persist: Boolean(serverId) });

    if (testResult.overallStatus === 'FAIL') {
      const isAuthFail = String(testResult.summary).includes('RFC_LOGON_FAILURE') || String(testResult.summary).includes('User or password incorrect') || testResult.checks.some((c) => c.id === 'rfc_logon' && c.status === 'FAIL' && /password|logon|auth/i.test(c.message));
      return res.status(isAuthFail ? 401 : 400).json({
        success: false,
        error: testResult.summary,
        connection_test: testResult
      });
    }

    return res.status(200).json({
      success: true,
      message: testResult.summary,
      connection_test: testResult
    });
  } catch (err) {
    const safeError = (err.message || 'RFC Connection Error').split(resolvedPassword).join('***');
    return res.status(400).json({
      success: false,
      error: safeError
    });
  }
});

/**
 * POST /api/admin/servers/:id/test-connection
 * Runs the comprehensive 5-point test on an existing server by ID and persists results.
 */
router.post('/servers/:id/test-connection', async (req, res) => {
  const { id } = req.params;
  const server = await supabaseService.getServerById(id);
  if (!server) {
    return res.status(404).json({ success: false, error: 'Server not found.' });
  }

  try {
    const testResult = await testServerConnection(server, { persist: true });
    return res.status(200).json({
      success: testResult.overallStatus !== 'FAIL',
      message: testResult.summary,
      connection_test: testResult
    });
  } catch (err) {
    const isMissingCol = String(err.message).includes('migration_server_connection_test.sql') || String(err.message).includes('connection_test column missing');
    if (isMissingCol) {
      console.error('[Admin] connection_test column missing - run migration_server_connection_test.sql');
      return res.status(500).json({
        success: false,
        error: 'connection_test column missing - run migration_server_connection_test.sql',
        migration_required: true
      });
    }
    return res.status(400).json({
      success: false,
      error: err.message || 'Connection test failed.'
    });
  }
});

/**
 * DELETE /api/admin/servers/:id
 * Removes a SAP server endpoint and cascades permissions.
 */
router.delete('/servers/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Server ID is required.' });
  }

  try {
    const deleted = await supabaseService.deleteServer(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_delete_server',
      recordId: id,
      task: `Admin deleted SAP server ${id}`,
      reason: 'Administrator action'
    });

    return res.status(200).json({
      success: true,
      message: 'SAP server removed successfully.'
    });
  } catch (err) {
    console.error('[Admin] Error deleting server:', err.message);
    return res.status(500).json({ error: 'Failed to delete SAP server.' });
  }
});

/**
 * ============================================================================
 * PERMISSION MANAGEMENT ROUTES
 * ============================================================================
 */

/**
 * GET /api/admin/permissions
 * Lists all active user-server permissions with joined emails and server names.
 */
router.get('/permissions', async (req, res) => {
  try {
    const permissions = await supabaseService.listPermissions();
    return res.status(200).json({ success: true, permissions });
  } catch (err) {
    console.error('[Admin] Error listing permissions:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve permissions.' });
  }
});

/**
 * POST /api/admin/permissions
 * Grants a user access to a SAP server.
 */
router.post('/permissions', async (req, res) => {
  const userId = req.body?.user_id || req.body?.userId;
  const serverId = req.body?.server_id || req.body?.serverId;

  if (!userId) {
    return res.status(400).json({ error: 'user_id or userId is required.' });
  }

  if (!serverId) {
    return res.status(400).json({ error: 'server_id or serverId is required.' });
  }

  try {
    const permission = await supabaseService.grantPermission({
      userId: userId,
      serverId: serverId,
      grantedBy: req.user.id
    });

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_grant_permission',
      recordId: permission.id,
      afterValues: { user_id: userId, server_id: serverId },
      task: `Admin granted permission to user ${userId} on server ${serverId}`,
      reason: 'Administrator action'
    });

    return res.status(201).json({
      success: true,
      message: 'Permission granted successfully.',
      permission
    });
  } catch (err) {
    console.error('[Admin] Error granting permission:', err.message);
    return res.status(400).json({ error: err.message || 'Failed to grant permission.' });
  }
});

/**
 * DELETE /api/admin/permissions/:id
 * Revokes an existing permission.
 */
router.delete('/permissions/:id', async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Permission ID is required.' });
  }

  try {
    const revoked = await supabaseService.revokePermission(id);

    if (!revoked) {
      return res.status(404).json({ error: 'Permission not found.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_revoke_permission',
      recordId: id,
      task: `Admin revoked permission ${id}`,
      reason: 'Administrator action'
    });

    return res.status(200).json({
      success: true,
      message: 'Permission revoked successfully.'
    });
  } catch (err) {
    console.error('[Admin] Error revoking permission:', err.message);
    return res.status(500).json({ error: 'Failed to revoke permission.' });
  }
});

export default router;
