import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireModuleAccess, requireAppPermission } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { getStorageLocations } from '../services/storageLocationService.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { sendFriendlyError } from '../utils/friendlyError.js';

const router = express.Router();

// Rate limiter: 120 requests per minute
export const storageLocationRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many storage location requests. Please slow down.'
  }
});

// Enforce authentication, BOM module access, and BOM permission (allowed for any bom.* permission)
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));
router.use(requireAppPermission('bom.*'));

/**
 * GET /api/storage-locations?plant=&q=&refresh=true|false
 * Fetches SAP storage location definitions from T001L with caching and plant filtering.
 */
router.get('/', storageLocationRateLimiter, async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { plant, q, refresh } = req.query || {};
    const serverId = req.selectedServer?.id || 'default';

    if (refresh === 'true' || refresh === true) {
      f4CacheService.clear(serverId);
    }

    const result = await f4CacheService.fetchWithCache({
      serverId,
      lookupType: 'storageLocations',
      query: `${plant || ''}:${q || ''}`,
      fetchFn: () => getStorageLocations({
        server: req.selectedServer,
        plant,
        q,
        refresh,
        signal: abortController.signal
      })
    });

    return res.status(200).json(result);
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

export default router;
