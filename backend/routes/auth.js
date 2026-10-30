import express from 'express';
import { loginRateLimiter, changePasswordRateLimiter } from '../middleware/security.js';
import { requireAuth } from '../middleware/auth.js';
import { supabaseService, isNetworkOrRetryableError } from '../services/supabaseClient.js';
import { validatePasswordPolicy } from '../utils/passwordPolicy.js';
import { auditLogger } from '../services/auditLog.js';

const router = express.Router();

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
  const { email, username, password } = req.body || {};
  const userIdentifier = String(email || username || '').trim();

  if (!userIdentifier || !password) {
    return res.status(400).json({
      error: 'Email and password are required.'
    });
  }

  try {
    const { data, error } = await supabaseService.signInWithPassword({
      email: userIdentifier,
      password: String(password)
    });

    if (error || !data?.session) {
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

    // Set secure HttpOnly cookies
    res.cookie(LEGACY_COOKIE_NAME, token, cookieOpts);
    res.cookie(COOKIE_NAME, token, cookieOpts);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      username: user.email
    });
  } catch (err) {
    console.error('[auth.js] Login failure:', err.message);
    if (isNetworkOrRetryableError(err) || err.message?.includes("Can't reach")) {
      return res.status(503).json({
        error: "Can't reach the sign-in service right now. Please try again."
      });
    }
    return res.status(500).json({
      error: 'Authentication failed: ' + err.message
    });
  }
});

/**
 * POST /api/auth/logout
 * Clears HttpOnly session cookies and terminates session.
 */
router.post('/logout', async (req, res) => {
  const token = req.cookies?.[COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (token) {
    try {
      await supabaseService.signOut(token);
    } catch (_) {}
  }

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
    role: req.user.role
  });
});

/**
 * POST /api/auth/change-password
 * Allows authenticated users to change their own password.
 * Checks current password, enforces password policy, verifies new differs from current,
 * rate limits requests, signs out other sessions, and logs audit event without credentials.
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

  const policyCheck = validatePasswordPolicy(newPassword);
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

    // 3. Terminate other sessions if supported, preserving current session
    const currentToken = req.cookies?.[COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
    await supabaseService.signOutOtherSessions(req.user.id, currentToken);

    // 4. Audit log without sensitive passwords
    auditLogger.logAction({
      user: req.user.email,
      sapUsername: req.user.email,
      actionType: 'user_change_password',
      recordId: req.user.id,
      afterValues: { email: req.user.email, password_updated: true },
      task: `User ${req.user.email} updated their password`,
      reason: 'User self-service password change'
    });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully.'
    });
  } catch (err) {
    console.error('[auth.js] Error changing password:', err.message);
    return res.status(500).json({ error: 'Failed to change password: ' + err.message });
  }
});

export default router;
