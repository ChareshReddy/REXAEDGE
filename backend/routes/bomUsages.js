import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireModuleAccess, requireAppPermission } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { getBomUsages } from '../services/bomUsageService.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { sendFriendlyError } from '../utils/friendlyError.js';

const router = express.Router();

// Rate limiter: 120 requests per minute
export const bomUsageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many BOM usage requests. Please slow down.'
  }
});

// Enforce authentication, BOM module access, and BOM permission (allowed for any bom.* permission)
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));
router.use(requireAppPermission('bom.*'));

/**
 * GET /api/bom-usages?lang=&refresh=true|false
 * Fetches SAP BOM Usage definitions from T416/T416T with caching and language support.
 */
router.get('/', bomUsageRateLimiter, async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { lang, refresh } = req.query || {};
    const serverId = req.selectedServer?.id || 'default';

    if (refresh === 'true' || refresh === true) {
      f4CacheService.clear(serverId);
    }

    const effectiveLang = String(lang || req.headers['accept-language'] || 'E').toUpperCase();
    const result = await f4CacheService.fetchWithCache({
      serverId,
      lookupType: 'bomUsages',
      query: effectiveLang,
      fetchFn: () => getBomUsages({
        server: req.selectedServer,
        lang: lang || req.headers['accept-language'],
        refresh,
        signal: abortController.signal
      })
    });

    return res.status(200).json(result);
  } catch (err) {
    if (err.name === 'AbortError' || req.destroyed || res.writableEnded) {
      return;
    }
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

export default router;
