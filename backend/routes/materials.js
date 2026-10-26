import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireServerAccess, requireModuleAccess } from '../middleware/auth.js';
import { MODULE_KEYS } from '../config/modules.js';
import { searchMaterials, getMaterialDetail } from '../services/materialSearchService.js';
import materialCheckRouter from './materialCheck.js';

const router = express.Router();

// Forward POST / and POST /check to existing material maintenance check handler for 100% backward compatibility
router.use('/', materialCheckRouter);

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

// Enforce authentication and BOM module enablement on all materials lookup routes
router.use(requireAuth);
router.use(requireModuleAccess(MODULE_KEYS.BOM));

/**
 * GET /api/materials/search?q=&plant=&limit=20&mtart=&checkBom=&bomUsage=
 * Searches materials by description (MAKTG uppercase) or material number.
 */
router.get('/search', materialSearchRateLimiter, requireServerAccess('read_only'), async (req, res) => {
  const abortController = new AbortController();
  req.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const { q, plant, limit, mtart, checkBom, bomUsage, mode } = req.query || {};

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters.'
      });
    }

    const results = await searchMaterials({
      query: q,
      plant,
      limit,
      mtart,
      checkBom,
      bomUsage,
      mode,
      server: req.selectedServer,
      signal: abortController.signal
    });

    return res.status(200).json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (err) {
    if (req.destroyed || res.writableEnded) {
      return;
    }
    console.error('[materialsRoute] Search error:', err.message);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Failed to search materials in SAP.'
    });
  }
});

/**
 * GET /api/materials/:matnr?plant=
 * Retrieves full detail and plant extension status for a specific material number.
 */
router.get('/:matnr', materialSearchRateLimiter, requireServerAccess('read_only'), async (req, res) => {
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
    console.error('[materialsRoute] Detail error:', err.message);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      error: err.message || 'Failed to retrieve material details from SAP.'
    });
  }
});

export default router;
