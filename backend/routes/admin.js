import express from 'express';
import crypto from 'crypto';
import { Client } from 'open-rfc';
import { requireAuth, requireAdmin, invalidateUserStatusCache } from '../middleware/auth.js';
import { supabaseService } from '../services/supabaseClient.js';
import { auditLogger } from '../services/auditLog.js';
import { recordRouteAudit } from '../utils/auditHelper.js';
import { getRfcConnectionParams } from '../services/sapRfcClient.js';
import { decryptPassword } from '../utils/crypto.js';
import { validatePasswordPolicy } from '../utils/passwordPolicy.js';
import { ALL_BOM_APPS } from '../config/modules.js';
import { getAllPoolStats, getPoolStats, updatePoolConfig, removePool } from '../services/sapConnectionPool.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { jobPerformanceTracker } from '../services/jobPerformanceTracker.js';
import { getServerHealth } from '../services/serverHealthService.js';
import { bomJobRepository } from '../services/bomJobRepository.js';
import { bomJobManager } from '../services/bomJobManager.js';

const router = express.Router();

function generateInitialPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) {
    pwd += letters[crypto.randomInt(letters.length)];
  }
  for (let i = 0; i < 4; i++) {
    pwd += digits[crypto.randomInt(digits.length)];
  }
  return pwd.split('').sort(() => 0.5 - Math.random()).join('') + '!';
}

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

  // Generate initial password if not provided
  const initialPassword = password ? String(password) : generateInitialPassword();

  const policyCheck = validatePasswordPolicy(initialPassword);
  if (!policyCheck.isValid) {
    return res.status(400).json({
      error: policyCheck.errors[0] || 'Password does not meet security requirements.',
      errors: policyCheck.errors
    });
  }

  const normalizedRole = role === 'admin' ? 'admin' : 'user';

  try {
    const result = await supabaseService.createUser({
      email: String(email).trim(),
      password: initialPassword,
      role: normalizedRole,
      must_change_password: true
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to create user.' });
    }

    invalidateUserStatusCache(result.data.user.id);

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_create_user',
      recordId: result.data.user.id,
      afterValues: { email: result.data.user.email, role: normalizedRole, must_change_password: true },
      task: `Admin created user ${result.data.user.email} (${normalizedRole})`,
      reason: 'Administrator action'
    });

    recordRouteAudit(req, {
      action: 'admin.user_create',
      feature: 'admin',
      target: result.data.user.email,
      status: 'success',
      message: `User created: ${result.data.user.email} (${normalizedRole})`,
      details: { userId: result.data.user.id, email: result.data.user.email, role: normalizedRole }
    });

    return res.status(201).json({
      success: true,
      message: 'User created successfully.',
      user: {
        id: result.data.user.id,
        email: result.data.user.email,
        role: normalizedRole,
        must_change_password: true,
        is_disabled: false
      },
      initialPassword // Shown once for copy button, never logged or stored in plain text
    });
  } catch (err) {
    console.error('[Admin] Error creating user:', err.message);
    return res.status(500).json({ error: 'An unexpected error occurred while creating user.' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Removes/deactivates a user, cleans up their servers, closes pools, and cancels running jobs.
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

    const targetUserId = targetUser?.id || id;
    const targetUserEmail = targetUser?.email || id;

    // SECTION A CLEANUP:
    // 1. Cancel running jobs owned by this user
    try {
      const jobs = await bomJobManager.listJobs({ role: 'admin' });
      for (const job of (jobs || [])) {
        if (job.userId === targetUserId && (job.status === 'RUNNING' || job.status === 'QUEUED')) {
          await bomJobManager.cancelJob(job.id, { role: 'admin' }, 'Owner account deleted');
        }
      }
    } catch (_) {}

    // 2. Disable and delete their servers, close their pools
    try {
      const userServers = await supabaseService.getServersByOwner(targetUserId);
      for (const s of (userServers || [])) {
        await removePool(s.id);
      }
      await supabaseService.deleteServersByOwner(targetUserId);
    } catch (_) {}

    // 3. Delete user record (audit logs are retained with owner email)
    const result = await supabaseService.deleteUser(targetUserId);
    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to delete user.' });
    }

    invalidateUserStatusCache(targetUserId);

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_delete_user',
      recordId: targetUserId,
      task: `Admin deleted user ${targetUserEmail} and cleaned up servers and pools`,
      reason: 'Administrator action'
    });

    recordRouteAudit(req, {
      action: 'admin.user_delete',
      feature: 'admin',
      target: targetUserId,
      status: 'success',
      message: `User deleted: ${targetUserEmail}`,
      details: { userId: targetUserId, email: targetUserEmail }
    });

    return res.status(200).json({
      success: true,
      message: 'User removed successfully and associated servers/pools cleaned up.'
    });
  } catch (err) {
    console.error('[Admin] Error deleting user:', err.message);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
});

/**
 * POST /api/admin/users/:id/reset-password
 * Admin resets a user's password, generating a new initial password and setting must_change_password = true.
 */
router.post('/users/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  const initialPassword = password ? String(password) : generateInitialPassword();
  const policyCheck = validatePasswordPolicy(initialPassword);
  if (!policyCheck.isValid) {
    return res.status(400).json({
      error: policyCheck.errors[0] || 'Password does not meet security requirements.',
      errors: policyCheck.errors
    });
  }

  try {
    const updateResult = await supabaseService.updateUserPassword(id, initialPassword);
    if (updateResult.error) {
      return res.status(400).json({ error: updateResult.error.message || 'Failed to reset password.' });
    }

    // Set must_change_password = true in database
    await supabaseService.setUserMustChangePassword(id, true);

    // Clear any login lockout for this account
    const userObj = updateResult.data?.user;
    if (userObj?.email) {
      await supabaseService.resetLoginAttempts(userObj.email);
    }

    invalidateUserStatusCache(id);

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_reset_user_password',
      recordId: id,
      afterValues: { user_id: id, password_reset: true, must_change_password: true },
      task: `Admin reset password for user ${id}`,
      reason: 'Administrator password reset'
    });

    recordRouteAudit(req, {
      action: 'admin.user_password_reset',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `Password reset for user ${id}`,
      details: { userId: id }
    });

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully.',
      initialPassword // Shown once for copy button
    });
  } catch (err) {
    console.error('[Admin] Error resetting user password:', err.message);
    return res.status(500).json({ error: 'Failed to reset user password.' });
  }
});

/**
 * PATCH /api/admin/users/:id/status
 * Admin disables or enables a user.
 */
router.patch('/users/:id/status', async (req, res) => {
  const { id } = req.params;
  const { isDisabled, is_disabled } = req.body || {};
  const disabledFlag = Boolean(isDisabled !== undefined ? isDisabled : is_disabled);

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  if (req.user.id === id || req.user.email?.toLowerCase() === id?.toLowerCase()) {
    return res.status(400).json({ error: 'You cannot disable your own admin account.' });
  }

  try {
    await supabaseService.setUserDisabled(id, disabledFlag, req.user.id);
    invalidateUserStatusCache(id);

    if (disabledFlag) {
      // Disabling user: cancel running jobs and close connection pools
      try {
        const jobs = await bomJobManager.listJobs({ role: 'admin' });
        for (const job of (jobs || [])) {
          if (job.userId === id && (job.status === 'RUNNING' || job.status === 'QUEUED')) {
            await bomJobManager.cancelJob(job.id, { role: 'admin' }, 'User account disabled');
          }
        }
      } catch (_) {}

      try {
        const userServers = await supabaseService.getServersByOwner(id);
        for (const s of (userServers || [])) {
          await removePool(s.id);
        }
      } catch (_) {}
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: disabledFlag ? 'admin_disable_user' : 'admin_enable_user',
      recordId: id,
      task: `Admin ${disabledFlag ? 'disabled' : 'enabled'} user ${id}`,
      reason: 'Administrator action'
    });

    recordRouteAudit(req, {
      action: disabledFlag ? 'admin.user_disable' : 'admin.user_enable',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `User ${disabledFlag ? 'disabled' : 'enabled'}: ${id}`,
      details: { userId: id, is_disabled: disabledFlag }
    });

    return res.status(200).json({
      success: true,
      message: disabledFlag ? 'User disabled successfully.' : 'User enabled successfully.',
      is_disabled: disabledFlag
    });
  } catch (err) {
    console.error('[Admin] Error updating user status:', err.message);
    return res.status(500).json({ error: 'Failed to update user status.' });
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

    await supabaseService.setUserMustChangePassword(id, true);
    invalidateUserStatusCache(id);

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_set_user_password',
      recordId: id,
      afterValues: { user_id: id, password_updated: true, must_change_password: true },
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
 * Validates connection limit settings for SAP servers
 * Ranges:
 * - max_connections: 1-20 (integer, default 3)
 * - per_user_limit: 1 to max_connections (integer, default 2)
 * - queue_timeout_ms (or seconds * 1000): 5,000 - 120,000 ms (5 - 120 seconds, default 20000)
 * - rfc_call_timeout_ms (or seconds * 1000): 10,000 - 300,000 ms (10 - 300 seconds, default 45000)
 */
export function validateServerLimits(input = {}, existing = {}) {
  let maxConn = input.max_connections !== undefined
    ? Number(input.max_connections)
    : (existing.max_connections !== undefined ? Number(existing.max_connections) : 3);

  let userLimit = input.per_user_limit !== undefined
    ? Number(input.per_user_limit)
    : (existing.per_user_limit !== undefined ? Number(existing.per_user_limit) : 2);

  // Queue timeout: accept seconds or ms
  let queueMs = input.queue_timeout_ms !== undefined
    ? Number(input.queue_timeout_ms)
    : (input.queue_timeout_seconds !== undefined
      ? Number(input.queue_timeout_seconds) * 1000
      : (existing.queue_timeout_ms !== undefined ? Number(existing.queue_timeout_ms) : 20000));

  // Call timeout: accept seconds or ms
  let callMs = input.rfc_call_timeout_ms !== undefined
    ? Number(input.rfc_call_timeout_ms)
    : (input.rfc_call_timeout_seconds !== undefined
      ? Number(input.rfc_call_timeout_seconds) * 1000
      : (existing.rfc_call_timeout_ms !== undefined ? Number(existing.rfc_call_timeout_ms) : 45000));

  if (!Number.isInteger(maxConn) || maxConn < 1 || maxConn > 20) {
    return { valid: false, error: 'Max connections must be an integer between 1 and 20.' };
  }

  if (!Number.isInteger(userLimit) || userLimit < 1) {
    return { valid: false, error: 'Per-user limit must be an integer of at least 1.' };
  }

  if (userLimit > maxConn) {
    return { valid: false, error: 'Per-user limit cannot exceed max connections.' };
  }

  const queueSec = queueMs / 1000;
  if (isNaN(queueMs) || queueSec < 5 || queueSec > 120) {
    return { valid: false, error: 'Queue wait timeout must be between 5 and 120 seconds.' };
  }

  const callSec = callMs / 1000;
  if (isNaN(callMs) || callSec < 10 || callSec > 300) {
    return { valid: false, error: 'SAP call timeout must be between 10 and 300 seconds.' };
  }

  return {
    valid: true,
    max_connections: maxConn,
    per_user_limit: userLimit,
    queue_timeout_ms: Math.round(queueMs),
    rfc_call_timeout_ms: Math.round(callMs)
  };
}

/**
 * GET /api/admin/servers
 * Lists all configured SAP servers with connection parameters and live status metrics.
 */
router.get('/servers', async (req, res) => {
  try {
    const rawServers = await supabaseService.listServers({ includeSensitive: true, role: req.user.role });
    const poolStatsMap = getAllPoolStats().servers || {};

    const servers = rawServers.map((s) => {
      const health = getServerHealth(s.id);
      const pStats = poolStatsMap[s.id] || null;
      const { sap_password, sap_password_encrypted, ...safeServer } = s;

      return {
        ...safeServer,
        has_password: Boolean(sap_password || sap_password_encrypted),
        max_connections: s.max_connections || 3,
        per_user_limit: s.per_user_limit || 2,
        queue_timeout_ms: s.queue_timeout_ms || 20000,
        rfc_call_timeout_ms: s.rfc_call_timeout_ms || 45000,
        health_status: health.status,
        circuit_breaker: health.circuit_breaker,
        last_checked: health.last_checked,
        last_error: health.last_error,
        active_connections: pStats ? pStats.activeConnections : 0,
        idle_connections: pStats ? pStats.idleConnections : 0,
        queued_calls: pStats ? (pStats.queued?.total || 0) : 0
      };
    });

    return res.status(200).json({ success: true, servers });
  } catch (err) {
    console.error('[Admin] Error listing servers:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve SAP servers.' });
  }
});

/**
 * Removed central server creation/modification routes (User-Owned Servers architecture).
 * Users add and manage their own SAP servers via /api/servers.
 */
router.post('/servers', (req, res) => {
  return res.status(404).json({ error: 'Endpoint removed: Users manage their own SAP servers via /api/servers.' });
});

router.put('/servers/:id', (req, res) => {
  return res.status(404).json({ error: 'Endpoint removed: Users manage their own SAP servers via /api/servers.' });
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
    // Admin kill switch: cancel any running or queued jobs on this server
    try {
      await bomJobManager.cancelJobsForServer(id, 'Server deleted by administrator kill switch');
    } catch (jobErr) {
      console.warn('[Admin] Failed to cancel jobs during server deletion:', jobErr.message);
    }

    const deleted = await supabaseService.deleteServer(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    // Clean up any in-memory RFC connection pool
    await removePool(id);

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_delete_server',
      recordId: id,
      task: `Admin deleted SAP server ${id}`,
      reason: 'Administrator action'
    });

    recordRouteAudit(req, {
      action: 'admin.server_delete',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `Server deleted: ${id}`,
      details: { serverId: id }
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
 * PATCH /api/admin/servers/:id/status
 * Kill switch: disable or enable a SAP server. When disabled, closes connection pools and cancels jobs.
 */
router.patch('/servers/:id/status', async (req, res) => {
  const { id } = req.params;
  const { is_disabled } = req.body || {};

  if (typeof is_disabled !== 'boolean') {
    return res.status(400).json({ error: 'is_disabled (boolean) is required.' });
  }

  try {
    const updated = await supabaseService.updateServer(id, { is_disabled });
    if (!updated) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    if (is_disabled) {
      await removePool(id);
      await bomJobManager.cancelJobsForServer(id, 'Server disabled by administrator');
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: is_disabled ? 'admin_disable_server' : 'admin_enable_server',
      recordId: id,
      task: `Admin ${is_disabled ? 'disabled' : 'enabled'} server ${id}`,
      reason: 'Administrator kill-switch action'
    });

    recordRouteAudit(req, {
      action: is_disabled ? 'admin.server_disable' : 'admin.server_enable',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `Server ${is_disabled ? 'disabled' : 'enabled'}: ${id}`,
      details: { serverId: id, is_disabled }
    });

    return res.status(200).json({ success: true, server: updated });
  } catch (err) {
    console.error('[Admin] Error updating server status:', err.message);
    return res.status(500).json({ error: 'Failed to update server status.' });
  }
});

/**
 * PATCH /api/admin/servers/:id/owner
 * Assigns an owner to an unassigned/legacy SAP server.
 */
router.patch('/servers/:id/owner', async (req, res) => {
  const { id } = req.params;
  const { owner_id } = req.body || {};

  if (!owner_id) {
    return res.status(400).json({ error: 'owner_id is required.' });
  }

  try {
    const targetUser = await supabaseService.getUserById(owner_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const updated = await supabaseService.updateServer(id, { owner_id });
    if (!updated) {
      return res.status(404).json({ error: 'Server not found.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_assign_server_owner',
      recordId: id,
      task: `Admin assigned server ${id} to user ${targetUser.email}`,
      reason: 'Administrator owner assignment'
    });

    recordRouteAudit(req, {
      action: 'admin.server_assign_owner',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `Server ${id} assigned to ${targetUser.email}`,
      details: { serverId: id, owner_id, owner_email: targetUser.email }
    });

    return res.status(200).json({ success: true, server: updated });
  } catch (err) {
    console.error('[Admin] Error assigning server owner:', err.message);
    return res.status(500).json({ error: 'Failed to assign server owner.' });
  }
});

/**
 * ============================================================================
 * PERMISSION MANAGEMENT ROUTES
 * ============================================================================
 */

/**
 * Removed permissions routes (User-Owned Servers architecture: per-action permissions removed).
 */
router.get('/permissions', (req, res) => {
  return res.status(404).json({ error: 'Endpoint removed: Per-action permissions have been removed.' });
});

router.post('/permissions', (req, res) => {
  return res.status(404).json({ error: 'Endpoint removed: Per-action permissions have been removed.' });
});

router.delete('/permissions/:id', (req, res) => {
  return res.status(404).json({ error: 'Endpoint removed: Per-action permissions have been removed.' });
});

/**
 * GET /api/admin/pool-stats
 * Retrieves real-time connection pool metrics for all configured SAP servers.
 */
router.get('/pool-stats', (req, res) => {
  try {
    const stats = getAllPoolStats();
    const f4Cache = f4CacheService.getStats();
    return res.status(200).json({ success: true, stats, f4_cache: f4Cache });
  } catch (err) {
    console.error('[Admin] Error retrieving pool stats:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve connection pool stats.' });
  }
});

/**
 * POST /api/admin/cache/clear
 * Clears F4 / value-help cache globally or for a specific serverId.
 */
router.post('/cache/clear', (req, res) => {
  try {
    const serverId = req.body?.serverId || req.query?.serverId || null;
    f4CacheService.clear(serverId);
    return res.status(200).json({
      success: true,
      message: serverId
        ? `F4 cache cleared for server ${serverId}`
        : 'All F4 caches cleared successfully',
      serverId,
      stats: f4CacheService.getStats()
    });
  } catch (err) {
    console.error('[Admin] Error clearing F4 cache:', err.message);
    return res.status(500).json({ error: 'Failed to clear cache.' });
  }
});

/**
 * GET /api/admin/jobs/:jobId/timeline
 * Returns the RFC call timeline, duration, and slowest calls for a background job.
 */
router.get('/jobs/:jobId/timeline', (req, res) => {
  const { jobId } = req.params;
  const timeline = jobPerformanceTracker.getTimeline(jobId);
  if (!timeline) {
    return res.status(404).json({
      success: false,
      message: `No performance timeline found for job ${jobId}.`
    });
  }
  return res.status(200).json({
    success: true,
    timeline
  });
});

/**
 * ============================================================================
 * SERVER ALLOWLIST MANAGEMENT ROUTES (Admin Only)
 * ============================================================================
 */

/**
 * GET /api/admin/allowlist
 * Lists all active server allowlist rules.
 */
router.get('/allowlist', async (req, res) => {
  try {
    const allowlist = await supabaseService.getAllowlist();
    return res.status(200).json({ success: true, allowlist });
  } catch (err) {
    console.error('[Admin] Error fetching allowlist:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve allowlist.' });
  }
});

/**
 * POST /api/admin/allowlist
 * Adds a new server allowlist rule (pattern, type, comment).
 */
router.post('/allowlist', async (req, res) => {
  const { pattern, type, comment } = req.body || {};
  if (!pattern || !String(pattern).trim()) {
    return res.status(400).json({ error: 'Pattern is required (e.g. 192.168.12.*, 10.0.0.0/16).' });
  }

  const validTypes = ['Sandbox', 'Development', 'Production', 'QA'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({
      error: 'Allowlist entry type is required and must be Sandbox, Development, Production, or QA.'
    });
  }
  const entryType = type;

  try {
    const result = await supabaseService.addAllowlistEntry({
      pattern: String(pattern).trim(),
      type: entryType,
      comment: comment ? String(comment).trim() : null,
      created_by: req.user.id
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to add allowlist entry.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_add_allowlist',
      recordId: result.data?.id || pattern,
      afterValues: { pattern, type: entryType, comment },
      task: `Admin added allowlist pattern "${pattern}" (${entryType})`,
      reason: 'Administrator allowlist management'
    });

    recordRouteAudit(req, {
      action: 'admin.allowlist_add',
      feature: 'admin',
      target: result.data?.id,
      status: 'success',
      message: `Allowlist rule added: ${pattern}`,
      details: { pattern, type: entryType }
    });

    return res.status(201).json({ success: true, entry: result.data });
  } catch (err) {
    console.error('[Admin] Error adding allowlist rule:', err.message);
    return res.status(500).json({ error: 'Failed to add allowlist rule.' });
  }
});

/**
 * DELETE /api/admin/allowlist/:id
 * Removes a server allowlist rule.
 */
router.delete('/allowlist/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Allowlist rule ID is required.' });
  }

  try {
    const result = await supabaseService.deleteAllowlistEntry(id);
    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Failed to delete allowlist entry.' });
    }

    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'admin_delete_allowlist',
      recordId: id,
      task: `Admin deleted allowlist rule ${id}`,
      reason: 'Administrator allowlist management'
    });

    recordRouteAudit(req, {
      action: 'admin.allowlist_delete',
      feature: 'admin',
      target: id,
      status: 'success',
      message: `Allowlist rule deleted: ${id}`,
      details: { id }
    });

    return res.status(200).json({ success: true, message: 'Allowlist rule removed.' });
  } catch (err) {
    console.error('[Admin] Error deleting allowlist rule:', err.message);
    return res.status(500).json({ error: 'Failed to delete allowlist rule.' });
  }
});

export default router;
