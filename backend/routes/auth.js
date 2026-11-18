import express from 'express';
import { loginRateLimiter, changePasswordRateLimiter } from '../middleware/security.js';
import { requireAuth, invalidateUserStatusCache } from '../middleware/auth.js';
import { supabaseService, isNetworkOrRetryableError, warmupDatabaseConnection } from '../services/supabaseClient.js';
import { validatePasswordPolicy } from '../utils/passwordPolicy.js';
import { auditLogger } from '../services/auditLog.js';
import { recordRouteAudit } from '../utils/auditHelper.js';
import { sendFriendlyError } from '../utils/friendlyError.js';

const router = express.Router();

let isWarmupRunning = false;
let lastWarmupTimestamp = 0;
const WARMUP_COOLDOWN_MS = 30000; // at most one every 30 seconds

/**
 * GET /api/auth/warmup
 * Public fire-and-forget endpoint to pre-warm the database/auth connection.
 * Coalesced: at most one upstream request every 30 seconds and no concurrent requests.
 * Uses existing per-IP loginRateLimiter.
 */
router.get('/warmup', loginRateLimiter, (req, res) => {
  res.status(200).json({ status: 'ok' });

  const now = Date.now();
  if (isWarmupRunning || (now - lastWarmupTimestamp < WARMUP_COOLDOWN_MS)) {
    return;
  }

  isWarmupRunning = true;
  lastWarmupTimestamp = now;

  if (typeof warmupDatabaseConnection === 'function') {
    warmupDatabaseConnection()
      .catch(() => {})
      .finally(() => {
        isWarmupRunning = false;
      });
  } else {
    isWarmupRunning = false;
  }
});

const COOKIE_NAME = 'sb_access_token';
const LEGACY_COOKIE_NAME = 'sap_session_id';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Returns cookie options based on current environment
 */
function getCookieOptions() {
  const isSecure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    maxAge: SESSION_TTL_MS,
    path: '/'
  };
}

/**
 * POST /api/auth/login
 * Authenticates user via Supabase Auth (or in-memory mock store fallback),
 * sets HttpOnly session cookies, and returns session token and profile.
 */
router.post('/login', loginRateLimiter, async (req, res) => {
  const startTime = Date.now();
  const { email, username, password } = req.body || {};
  const userIdentifier = String(email || username || '').trim();

  if (!userIdentifier || !password) {
    recordRouteAudit(req, {
      action: 'auth.login_failed',
      feature: 'auth',
      status: 'failed',
      message: 'Email and password are required',
      durationMs: Date.now() - startTime,
      details: { email: userIdentifier }
    });
    return res.status(400).json({
      error: 'Email and password are required.'
    });
  }

  const cleanEmail = userIdentifier.toLowerCase();

  try {
    // 1. Check Sign-In Lockout (15 minutes after 5 failed attempts per account)
    const lockoutInfo = await supabaseService.getLoginAttempts(cleanEmail);
    if (lockoutInfo?.locked_until && new Date(lockoutInfo.locked_until).getTime() > Date.now()) {
      const remainingMinutes = Math.max(1, Math.ceil((new Date(lockoutInfo.locked_until).getTime() - Date.now()) / 60000));
      recordRouteAudit(req, {
        action: 'auth.login_locked',
        feature: 'auth',
        status: 'failed',
        message: `Account ${cleanEmail} is locked`,
        durationMs: Date.now() - startTime,
        details: { email: cleanEmail, remainingMinutes }
      });
      return res.status(429).json({
        error: `Account is temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minute(s).`,
        code: 'ACCOUNT_LOCKED'
      });
    }

    const { data, error } = await supabaseService.signInWithPassword({
      email: userIdentifier,
      password: String(password)
    });

    if (error || !data?.session) {
      // Record failed attempt and check for 5-attempt lockout
      const attempt = await supabaseService.recordFailedLogin(cleanEmail);
      if (attempt.isLocked) {
        auditLogger.logAction({
          user: cleanEmail,
          sapUsername: cleanEmail,
          actionType: 'auth_account_locked',
          task: `Account ${cleanEmail} locked for 15 minutes after 5 failed login attempts`,
          reason: 'Security lockout policy'
        });
        recordRouteAudit(req, {
          action: 'auth.account_locked',
          feature: 'auth',
          status: 'failed',
          message: `Account ${cleanEmail} locked for 15 minutes`,
          durationMs: Date.now() - startTime,
          details: { email: cleanEmail, failedAttempts: attempt.failed_attempts }
        });
        return res.status(429).json({
          error: 'Account is locked for 15 minutes due to 5 failed sign-in attempts.',
          code: 'ACCOUNT_LOCKED'
        });
      }

      recordRouteAudit(req, {
        action: 'auth.login_failed',
        feature: 'auth',
        status: 'failed',
        message: error?.message || 'Invalid email or password',
        durationMs: Date.now() - startTime,
        details: { email: cleanEmail, attempts: attempt.failed_attempts }
      });
      if (isNetworkOrRetryableError(error) || error?.message?.includes("Can't reach")) {
        return res.status(503).json({
          error: "Can't reach the sign-in service right now. Please try again."
        });
      }
      return res.status(401).json({
        error: error?.message || 'Invalid email or password.'
      });
    }

    const { session, user } = data;
    const token = session.access_token;
    const cookieOpts = getCookieOptions();

    // Reset failed login attempts on successful sign-in
    await supabaseService.resetLoginAttempts(cleanEmail);

    // Invalidate user status cache to guarantee fresh status read
    invalidateUserStatusCache(user.id);
    const profile = await supabaseService.getUserProfile(user.id);

    // Check if user is disabled
    if (profile?.is_disabled) {
      return res.status(403).json({
        error: 'Your account has been disabled. Please contact your administrator.',
        code: 'USER_DISABLED'
      });
    }

    const mustChangePassword = Boolean(profile ? profile.must_change_password : user.must_change_password);

    // Set secure HttpOnly cookies
    res.cookie(LEGACY_COOKIE_NAME, token, cookieOpts);
    res.cookie(COOKIE_NAME, token, cookieOpts);

    recordRouteAudit(req, {
      action: 'auth.login',
      feature: 'auth',
      status: 'success',
      message: 'User logged in successfully',
      durationMs: Date.now() - startTime,
      details: { role: user.role, must_change_password: mustChangePassword }
    });

    return res.status(200).json({
      success: true,
      token,
      must_change_password: mustChangePassword,
      is_disabled: Boolean(profile?.is_disabled),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        must_change_password: mustChangePassword,
        is_disabled: Boolean(profile?.is_disabled)
      },
      username: user.email
    });
  } catch (err) {
    console.error('[auth.js] Login failure:', err.message);
    recordRouteAudit(req, {
      action: 'auth.login_failed',
      feature: 'auth',
      status: 'failed',
      message: err.message,
      durationMs: Date.now() - startTime,
      details: { email: userIdentifier }
    });
    if (isNetworkOrRetryableError(err) || err.message?.includes("Can't reach")) {
      return res.status(503).json({
        error: "Can't reach the sign-in service right now. Please try again."
      });
    }
    return sendFriendlyError(res, req, err, { source: 'backend' });
  }
});

/**
 * POST /api/auth/logout
 * Clears HttpOnly session cookies and terminates session.
 */
router.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  let userEmail = null;
  if (token) {
    try {
      const { data } = await supabaseService.getUser(token);
      userEmail = data?.user?.email || null;
      await supabaseService.signOut(token);
    } catch (_) {}
  }

  recordRouteAudit(req, {
    action: 'auth.logout',
    feature: 'auth',
    status: 'success',
    message: 'User logged out',
    details: { email: userEmail }
  });

  const isSecure = process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
  const clearOpts = {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'strict',
    path: '/'
  };

  res.clearCookie(COOKIE_NAME, clearOpts);
  res.clearCookie(LEGACY_COOKIE_NAME, clearOpts);

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

/**
 * GET /api/auth/config
 * Returns public auth configuration flags.
 */
router.get('/config', (req, res) => {
  return res.status(200).json({
    authMode: 'supabase',
    skipGatewayAuth: false,
    mockMode: process.env.USE_MOCK_SAP !== 'false'
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user profile from verified Supabase session token.
 */
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    authenticated: true,
    user: req.user,
    username: req.user.email,
    role: req.user.role,
    must_change_password: Boolean(req.user.must_change_password),
    is_disabled: Boolean(req.user.is_disabled)
  });
});

/**
 * POST /api/auth/change-password
 * Allows authenticated users to change their own password.
 * Checks current password, enforces password policy, verifies new differs from current,
 * rate limits requests, signs out other sessions, clears must_change_password flag,
 * and logs audit event without credentials.
 */
router.post('/change-password', requireAuth, changePasswordRateLimiter, async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};

  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required.' });
  }

  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation are required.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'New password and confirmation do not match.' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must be different from current password.' });
  }

  const policyCheck = validatePasswordPolicy(newPassword, currentPassword);
  if (!policyCheck.isValid) {
    return res.status(400).json({
      error: policyCheck.errors[0] || 'New password does not meet security requirements.',
      errors: policyCheck.errors
    });
  }

  try {
    // 1. Verify current password
    const verifyResult = await supabaseService.verifyPassword(req.user.email, currentPassword);
    if (!verifyResult.valid) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    // 2. Update password via Supabase
    const updateResult = await supabaseService.updateUserPassword(req.user.id, newPassword);
    if (updateResult.error) {
      return res.status(400).json({
        error: updateResult.error.message || 'Failed to update password.'
      });
    }

    // 3. Clear must_change_password flag in database and evict status cache immediately
    await supabaseService.setUserMustChangePassword(req.user.id, false);
    invalidateUserStatusCache(req.user.id);

    // 4. Terminate other sessions if supported, preserving current session
    const currentToken = req.cookies?.[COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    await supabaseService.signOutOtherSessions(req.user.id, currentToken);

    // 5. Audit log without sensitive passwords
    const wasFirstLogin = Boolean(req.user?.must_change_password);
    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: wasFirstLogin ? 'first_login_completed' : 'user_change_password',
      recordId: req.user.id,
      afterValues: { email: req.user.email, password_updated: true, first_login_completed: wasFirstLogin },
      task: wasFirstLogin ? `User ${req.user.email} completed initial password setup` : `User ${req.user.email} updated their password`,
      reason: wasFirstLogin ? 'First-login mandatory password change completed' : 'User self-service password change'
    });

    recordRouteAudit(req, {
      action: 'auth.password_changed',
      feature: 'auth',
      status: 'success',
      message: `Password changed for user ${req.user.email}`,
      details: { email: req.user.email }
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err) {
    console.error('[auth.js] Error changing password:', err.message);
    return sendFriendlyError(res, req, err, { source: 'backend' });
  }
});

export default router;
