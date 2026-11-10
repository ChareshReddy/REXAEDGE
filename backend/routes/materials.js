import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireServerAccess, requireModuleAccess, requireAppPermission } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { searchMaterials, getMaterialDetail } from '../services/materialSearchService.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { searchMaterialsByOption } from '../services/searchByOptionService.js';
import { SAP_SEARCH_OPTIONS } from '../config/searchHelpOptions.js';
import { sendFriendlyError } from '../utils/friendlyError.js';
import materialCheckRouter from './materialCheck.js';

const router = express.Router();

// Rate limiter for Material Search and Material Detail lookups:
// 120 requests per minute per user/IP allows smooth debounced typeahead while safeguarding SAP RFC
export const materialSearchRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many material search requests. Please slow down.'
  }
});

// Enforce authentication, BOM module enablement, and server access on all materials routes
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));
router.use(requireAppPermission('bom.*'));

// Forward POST / and POST /check to existing material maintenance check handler for 100% backward compatibility
router.use('/', materialCheckRouter);

/**
 * GET /api/materials/search?q=&plant=&limit=20&mtart=&checkBom=&bomUsage=
 * Searches materials by description (MAKTG uppercase) or material number.
 */
router.get('/search', materialSearchRateLimiter, requireAppPermission('bom.*'), async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { q, plant, limit, mtart, checkBom, bomUsage, mode } = req.query || {};

    const cleanQ = typeof q === 'string' ? q.trim() : '';
    if (cleanQ && cleanQ.length < 2 && cleanQ !== '*') {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters.'
      });
    }

    const serverId = req.selectedServer?.id || 'default';
    const isWildcard = cleanQ === '*';
    const ttlMs = isWildcard ? 0 : 60000;

    const results = await f4CacheService.fetchWithCache({
      serverId,
      lookupType: 'materials',
      query: `${cleanQ}:${plant || ''}:${mtart || ''}:${checkBom || ''}:${bomUsage || ''}:${mode || ''}`,
      paging: String(limit || '20'),
      ttlMs,
      fetchFn: () => searchMaterials({
        query: cleanQ,
        plant,
        limit,
        mtart,
        checkBom,
        bomUsage,
        mode,
        server: req.selectedServer,
        signal: abortController.signal
      })
    });

    return res.status(200).json({
      success: true,
      data: results,
      count: results ? results.length : 0
    });
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * GET /api/materials/search-options
 * Returns the full ordered list of 34 SAP search help options with field metadata.
 */
router.get('/search-options', materialSearchRateLimiter, requireAppPermission('bom.*'), (req, res) => {
  return res.status(200).json({
    success: true,
    data: SAP_SEARCH_OPTIONS
  });
});

/**
 * POST /api/materials/search-by-option
 * Searches materials by specific SAP search help tab option (M, A, B, L, T, P, N, I, J, W, etc.)
 */
router.post('/search-by-option', materialSearchRateLimiter, requireAppPermission('bom.*'), async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { tab, fields, maxRows, noRestriction } = req.body || {};

    if (!tab) {
      return res.status(400).json({
        success: false,
        error: 'Search tab identifier is required (e.g. M, A, B, etc.).'
      });
    }

    const result = await searchMaterialsByOption({
      tab,
      fields: fields || {},
      maxRows,
      noRestriction: noRestriction === true || noRestriction === 'true',
      server: req.selectedServer,
      signal: abortController.signal
    });

    if (!result.available) {
      return res.status(200).json({
        success: false,
        available: false,
        tab: result.tab,
        name: result.name,
        data: [],
        error: result.error || 'Not available on this system'
      });
    }

    return res.status(200).json({
      success: true,
      available: true,
      tab: result.tab,
      name: result.name,
      data: result.data,
      count: result.count,
      limit: result.limit,
      limitReached: result.limitReached,
      message: result.message
    });
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

/**
 * GET /api/materials/:matnr?plant=
 * Retrieves full detail and plant extension status for a specific material number.
 */
router.get('/:matnr', materialSearchRateLimiter, requireAppPermission('bom.*'), async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { matnr } = req.params;
    const { plant, bomUsage } = req.query || {};

    if (!matnr || !matnr.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Material number is required.'
      });
    }

    const detail = await getMaterialDetail({
      matnr,
      plant,
      bomUsage,
      server: req.selectedServer,
      signal: abortController.signal
    });

    return res.status(200).json({
      success: true,
      data: detail
    });
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    return sendFriendlyError(res, req, err, { source: 'sap' });
  }
});

export default router;
