import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  queryAuditLogs,
  queryErrorLogs,
  getLogDetail,
  exportLogsCsv
} from '../services/logService.js';

const router = express.Router();

const adminLogsRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests for admin logs. Please slow down.'
  }
});

// Admin protection: strictly require Authentication and Administrator role
router.use(requireAuth);
router.use(requireAdmin);
router.use(adminLogsRateLimiter);

/**
 * GET /api/admin/logs/audit
 * Server-side paginated list of audit logs with filters.
 */
router.get('/audit', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      startDate,
      endDate,
      userEmail,
      action,
      serverId,
      status,
      q
    } = req.query || {};

    const result = await queryAuditLogs({
      page,
      pageSize,
      startDate,
      endDate,
      userEmail,
      action,
      serverId,
      status,
      q
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[AdminLogs] Error querying audit logs:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve audit logs'
    });
  }
});

/**
 * GET /api/admin/logs/errors
 * Server-side paginated list of error logs with filters.
 */
router.get('/errors', async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 50,
      startDate,
      endDate,
      userEmail,
      source,
      serverId,
      errorRef,
      httpStatus,
      q
    } = req.query || {};

    const result = await queryErrorLogs({
      page,
      pageSize,
      startDate,
      endDate,
      userEmail,
      source,
      serverId,
      errorRef,
      httpStatus,
      q
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[AdminLogs] Error querying error logs:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve error logs'
    });
  }
});

/**
 * GET /api/admin/logs/:type/export
 * Exports logs as CSV with CSV-injection protection.
 */
router.get('/:type/export', async (req, res) => {
  const { type } = req.params;
  if (!['audit', 'errors', 'error'].includes(type)) {
    return res.status(400).json({ error: 'Invalid log type for export. Use "audit" or "errors".' });
  }

  try {
    const csvContent = await exportLogsCsv(type, req.query || {});
    const filename = `${type}-logs-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('[AdminLogs] Error exporting logs CSV:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to export logs CSV'
    });
  }
});

/**
 * GET /api/admin/logs/:type/:id
 * Retrieves detail for a single audit or error log entry.
 */
router.get('/:type/:id', async (req, res) => {
  const { type, id } = req.params;
  if (!['audit', 'errors', 'error'].includes(type)) {
    return res.status(400).json({ error: 'Invalid log type. Use "audit" or "errors".' });
  }

  try {
    const entry = await getLogDetail(type, id);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Log entry not found' });
    }
    return res.status(200).json({ success: true, data: entry });
  } catch (err) {
    console.error('[AdminLogs] Error getting log detail:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to retrieve log detail'
    });
  }
});

export default router;
