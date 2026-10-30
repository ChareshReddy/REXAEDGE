import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { logError } from '../services/logService.js';
import { generateErrorRef } from '../utils/errorRef.js';

const router = express.Router();

// Strict rate limiter for client error reporting: max 60 per minute per IP
const clientErrorRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many client error logs submitted. Please slow down.'
  }
});

/**
 * POST /api/logs/client-error
 * Stores frontend runtime/render errors in error_logs with source='frontend'.
 * Body size capped to 16KB.
 */
router.post(
  '/client-error',
  clientErrorRateLimiter,
  express.json({ limit: '16kb' }),
  requireAuth,
  async (req, res) => {
    try {
      const { message, stack, route, error_ref, details } = req.body || {};
      const errorRef = error_ref || generateErrorRef();

      logError({
        errorRef,
        requestId: req.id,
        userId: req.user?.id,
        userEmail: req.user?.email,
        serverId: req.headers['x-server-id'] || null,
        source: 'frontend',
        method: req.method,
        route: route || req.headers['referer'] || 'unknown',
        httpStatus: 500,
        errorCode: 'CLIENT_RENDER_ERROR',
        message: message || 'Frontend unhandled error',
        stack: stack || null,
        details: details || {}
      });

      return res.status(200).json({
        success: true,
        error_ref: errorRef
      });
    } catch (err) {
      console.warn('[clientLogsRoute] Failed to record client error:', err.message);
      return res.status(200).json({
        success: true,
        error_ref: generateErrorRef()
      });
    }
  }
);

export default router;
