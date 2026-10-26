import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireServerAccess, requireModuleAccess } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { getPlants } from '../services/plantService.js';

const router = express.Router();

// Rate limiter for plant lookups: 120 requests per minute per IP/user
export const plantRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many plant requests. Please slow down.'
  }
});

// Enforce authentication, BOM module enablement, and server access
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));
router.use(requireServerAccess('read_only'));

/**
 * GET /api/plants?q=&material=&refresh=true|false
 * Fetches SAP plant definitions from T001W with long-TTL caching and material extension status.
 */
router.get('/', plantRateLimiter, async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { q, material, refresh } = req.query || {};

    const result = await getPlants({
      server: req.selectedServer,
      q,
      material,
      refresh,
      userRole: req.user?.role || 'user',
      signal: abortController.signal
    });

    return res.status(200).json(result);
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    console.error('[plantsRoute] Error:', err.message);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Failed to retrieve plants from SAP.'
    });
  }
});

export default router;
