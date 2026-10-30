import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { liveSupabase, isLiveSupabaseConfigured } from './supabaseClient.js';
import { sanitizeLogDetails, sanitizeStack, escapeCsvCell } from '../utils/redact.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGS_DIR = path.resolve(__dirname, '../../logs');

const MAX_QUEUE_SIZE = 1000;
const BATCH_FLUSH_INTERVAL_MS = 1000;
const BATCH_FLUSH_SIZE = 25;

let isSchemaConfigured = true; // Optimistic, set to false on 42P01/PGRST205
let lastSchemaCheck = 0;

const auditQueue = [];
const errorQueue = [];
let flushTimer = null;

// Ensure logs directory exists for fallback logging
function ensureLogsDir() {
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  } catch (_) {}
}

/**
 * Gets current daily fallback log filename: logs/fallback-YYYY-MM-DD.log
 */
function getFallbackLogPath() {
  ensureLogsDir();
  const dateStr = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `fallback-${dateStr}.log`);
}

/**
 * Appends entries to the local daily fallback JSON-lines log file.
 */
function writeToFallbackFile(type, entries) {
  try {
    const filePath = getFallbackLogPath();
    const lines = entries.map((e) => JSON.stringify({ _type: type, _logged_at: new Date().toISOString(), ...e })).join('\n') + '\n';
    fs.appendFileSync(filePath, lines, 'utf8');
  } catch (err) {
    console.warn('[LogService] Failed to write to local fallback log:', err.message);
  }
}

/**
 * Checks if Supabase error indicates missing table or schema cache issue.
 */
function isTableMissingError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const message = String(err.message || '').toLowerCase();
  return (
    code === '42P01' || // relation does not exist
    code === 'PGRST205' || // table not found in schema cache
    code === 'PGRST204' ||
    message.includes('relation "public.audit_logs" does not exist') ||
    message.includes('relation "public.error_logs" does not exist') ||
    message.includes('could not find the table')
  );
}

/**
 * Flushes queued audit and error logs to Supabase or fallback file.
 */
export async function flushLogQueues() {
  // 1. Flush Audit Queue
  if (auditQueue.length > 0) {
    const batch = auditQueue.splice(0, BATCH_FLUSH_SIZE);
    if (!isLiveSupabaseConfigured || !isSchemaConfigured) {
      writeToFallbackFile('audit', batch);
    } else {
      try {
        const { error } = await liveSupabase.from('audit_logs').insert(batch);
        if (error) {
          if (isTableMissingError(error)) {
            isSchemaConfigured = false;
          }
          writeToFallbackFile('audit', batch);
        }
      } catch (err) {
        if (isTableMissingError(err)) {
          isSchemaConfigured = false;
        }
        writeToFallbackFile('audit', batch);
      }
    }
  }

  // 2. Flush Error Queue
  if (errorQueue.length > 0) {
    const batch = errorQueue.splice(0, BATCH_FLUSH_SIZE);
    if (!isLiveSupabaseConfigured || !isSchemaConfigured) {
      writeToFallbackFile('error', batch);
    } else {
      try {
        const { error } = await liveSupabase.from('error_logs').insert(batch);
        if (error) {
          if (isTableMissingError(error)) {
            isSchemaConfigured = false;
          }
          writeToFallbackFile('error', batch);
        }
      } catch (err) {
        if (isTableMissingError(err)) {
          isSchemaConfigured = false;
        }
        writeToFallbackFile('error', batch);
      }
    }
  }
}

// Start periodic queue flush timer
if (!flushTimer && typeof setInterval !== 'undefined') {
  flushTimer = setInterval(() => {
    flushLogQueues().catch(() => {});
  }, BATCH_FLUSH_INTERVAL_MS);
  if (flushTimer.unref) flushTimer.unref();
}

/**
 * Records an audit log event asynchronously.
 * Non-blocking: pushes into in-memory queue.
 */
export function logAudit({
  requestId,
  userId,
  userEmail,
  userRole,
  action,
  feature,
  serverId,
  serverName,
  target,
  status = 'success',
  message,
  ip,
  userAgent,
  durationMs,
  details = {}
} = {}) {
  try {
    if (auditQueue.length >= MAX_QUEUE_SIZE) {
      console.warn('[LogService] Audit log queue full, dropping oldest item');
      auditQueue.shift();
    }

    const sanitizedDetails = sanitizeLogDetails(details);

    auditQueue.push({
      request_id: requestId || null,
      user_id: userId || null,
      user_email: userEmail || null,
      user_role: userRole || null,
      action: action || 'unknown',
      feature: feature || null,
      server_id: serverId || null,
      server_name: serverName || null,
      target: target || null,
      status: status === 'failed' ? 'failed' : 'success',
      message: message ? String(message).slice(0, 1000) : null,
      ip: ip || null,
      user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
      duration_ms: typeof durationMs === 'number' ? Math.round(durationMs) : null,
      details: sanitizedDetails || {}
    });

    if (auditQueue.length >= BATCH_FLUSH_SIZE) {
      setImmediate(() => flushLogQueues().catch(() => {}));
    }
  } catch (err) {
    console.warn('[LogService] logAudit internal failure (ignored):', err.message);
  }
}

/**
 * Records an error log event asynchronously.
 * Non-blocking: pushes into in-memory queue.
 */
export function logError({
  errorRef,
  requestId,
  userId,
  userEmail,
  serverId,
  serverName,
  source = 'backend',
  method,
  route,
  httpStatus = 500,
  errorCode,
  message,
  sapMessage,
  stack,
  details = {}
} = {}) {
  try {
    if (errorQueue.length >= MAX_QUEUE_SIZE) {
      console.warn('[LogService] Error log queue full, dropping oldest item');
      errorQueue.shift();
    }

    const sanitizedDetails = sanitizeLogDetails(details);
    const sanitizedStackStr = sanitizeStack(stack);

    errorQueue.push({
      error_ref: errorRef || 'UNKNOWN',
      request_id: requestId || null,
      user_id: userId || null,
      user_email: userEmail || null,
      server_id: serverId || null,
      server_name: serverName || null,
      source: ['backend', 'sap', 'frontend'].includes(source) ? source : 'backend',
      method: method ? String(method).toUpperCase().slice(0, 10) : null,
      route: route ? String(route).slice(0, 500) : null,
      http_status: typeof httpStatus === 'number' ? httpStatus : 500,
      error_code: errorCode ? String(errorCode).slice(0, 100) : null,
      message: message ? String(message).slice(0, 2000) : 'Unknown error',
      sap_message: sapMessage ? String(sapMessage).slice(0, 2000) : null,
      stack: sanitizedStackStr,
      details: sanitizedDetails || {}
    });

    if (errorQueue.length >= BATCH_FLUSH_SIZE) {
      setImmediate(() => flushLogQueues().catch(() => {}));
    }
  } catch (err) {
    console.warn('[LogService] logError internal failure (ignored):', err.message);
  }
}

/**
 * Probes whether the database tables exist in Supabase.
 */
export async function checkLogSchema() {
  if (!isLiveSupabaseConfigured) {
    isSchemaConfigured = false;
    return false;
  }
  const now = Date.now();
  if (now - lastSchemaCheck < 30000 && !isSchemaConfigured) {
    return isSchemaConfigured;
  }
  lastSchemaCheck = now;

  try {
    const { error } = await liveSupabase.from('audit_logs').select('id').limit(1);
    if (error) {
      if (isTableMissingError(error)) {
        isSchemaConfigured = false;
        return false;
      }
    }
    isSchemaConfigured = true;
    return true;
  } catch (err) {
    if (isTableMissingError(err)) {
      isSchemaConfigured = false;
    }
    return isSchemaConfigured;
  }
}

/**
 * Server-side paginated query for Audit Logs.
 */
export async function queryAuditLogs({
  page = 1,
  pageSize = 50,
  startDate,
  endDate,
  userEmail,
  action,
  serverId,
  status,
  q
} = {}) {
  const isReady = await checkLogSchema();
  if (!isReady) {
    return {
      success: true,
      notConfigured: true,
      data: [],
      count: 0,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      totalPages: 0,
      message: 'Logs are not set up yet. Run the migration.'
    };
  }

  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(10, Number(pageSize) || 50));
  const from = (p - 1) * size;
  const to = from + size - 1;

  try {
    let query = liveSupabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (userEmail) query = query.ilike('user_email', `%${userEmail.trim()}%`);
    if (action) query = query.eq('action', action);
    if (serverId) query = query.eq('server_id', serverId);
    if (status) query = query.eq('status', status);
    if (q) {
      const cleanQ = q.trim();
      query = query.or(`message.ilike.%${cleanQ}%,target.ilike.%${cleanQ}%,feature.ilike.%${cleanQ}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      if (isTableMissingError(error)) {
        isSchemaConfigured = false;
        return {
          success: true,
          notConfigured: true,
          data: [],
          count: 0,
          page: p,
          pageSize: size,
          totalPages: 0,
          message: 'Logs are not set up yet. Run the migration.'
        };
      }
      throw error;
    }

    return {
      success: true,
      notConfigured: false,
      data: data || [],
      count: count || 0,
      page: p,
      pageSize: size,
      totalPages: Math.ceil((count || 0) / size)
    };
  } catch (err) {
    console.error('[LogService] queryAuditLogs error:', err.message);
    throw err;
  }
}

/**
 * Server-side paginated query for Error Logs.
 */
export async function queryErrorLogs({
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
} = {}) {
  const isReady = await checkLogSchema();
  if (!isReady) {
    return {
      success: true,
      notConfigured: true,
      data: [],
      count: 0,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 50,
      totalPages: 0,
      message: 'Logs are not set up yet. Run the migration.'
    };
  }

  const p = Math.max(1, Number(page) || 1);
  const size = Math.min(100, Math.max(10, Number(pageSize) || 50));
  const from = (p - 1) * size;
  const to = from + size - 1;

  try {
    let query = liveSupabase
      .from('error_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (userEmail) query = query.ilike('user_email', `%${userEmail.trim()}%`);
    if (source) query = query.eq('source', source);
    if (serverId) query = query.eq('server_id', serverId);
    if (errorRef) query = query.ilike('error_ref', `%${errorRef.trim()}%`);
    if (httpStatus) query = query.eq('http_status', Number(httpStatus));
    if (q) {
      const cleanQ = q.trim();
      query = query.or(`message.ilike.%${cleanQ}%,route.ilike.%${cleanQ}%,error_code.ilike.%${cleanQ}%`);
    }

    const { data, count, error } = await query;
    if (error) {
      if (isTableMissingError(error)) {
        isSchemaConfigured = false;
        return {
          success: true,
          notConfigured: true,
          data: [],
          count: 0,
          page: p,
          pageSize: size,
          totalPages: 0,
          message: 'Logs are not set up yet. Run the migration.'
        };
      }
      throw error;
    }

    return {
      success: true,
      notConfigured: false,
      data: data || [],
      count: count || 0,
      page: p,
      pageSize: size,
      totalPages: Math.ceil((count || 0) / size)
    };
  } catch (err) {
    console.error('[LogService] queryErrorLogs error:', err.message);
    throw err;
  }
}

/**
 * Retrieves a single log entry by type and id.
 */
export async function getLogDetail(type, id) {
  if (!id) return null;
  const isReady = await checkLogSchema();
  if (!isReady) return null;

  const table = type === 'errors' || type === 'error' ? 'error_logs' : 'audit_logs';

  try {
    const { data, error } = await liveSupabase.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error('[LogService] getLogDetail error:', err.message);
    return null;
  }
}

/**
 * Generates CSV export for Audit or Error logs (capped at 5000 rows).
 * Protects against CSV formula injection.
 */
export async function exportLogsCsv(type, filters = {}) {
  const isErrors = type === 'errors' || type === 'error';
  const table = isErrors ? 'error_logs' : 'audit_logs';

  const isReady = await checkLogSchema();
  if (!isReady) {
    throw new Error('Logs are not set up yet. Run the migration.');
  }

  let query = liveSupabase.from(table).select('*').order('created_at', { ascending: false }).limit(5000);

  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);
  if (filters.userEmail) query = query.ilike('user_email', `%${filters.userEmail.trim()}%`);
  if (filters.serverId) query = query.eq('server_id', filters.serverId);

  if (isErrors) {
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.errorRef) query = query.ilike('error_ref', `%${filters.errorRef.trim()}%`);
    if (filters.httpStatus) query = query.eq('http_status', Number(filters.httpStatus));
  } else {
    if (filters.action) query = query.eq('action', filters.action);
    if (filters.status) query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];

  if (isErrors) {
    const headers = ['Time', 'Error Ref', 'User Email', 'Source', 'Method', 'Route', 'Status', 'Code', 'Message', 'Details'];
    const csvLines = [headers.join(',')];
    for (const r of rows) {
      csvLines.push([
        escapeCsvCell(r.created_at),
        escapeCsvCell(r.error_ref),
        escapeCsvCell(r.user_email),
        escapeCsvCell(r.source),
        escapeCsvCell(r.method),
        escapeCsvCell(r.route),
        escapeCsvCell(r.http_status),
        escapeCsvCell(r.error_code),
        escapeCsvCell(r.message),
        escapeCsvCell(r.details)
      ].join(','));
    }
    return csvLines.join('\n');
  }

  const headers = ['Time', 'User Email', 'Role', 'Action', 'Feature', 'Server', 'Target', 'Status', 'Duration (ms)', 'Message', 'Details'];
  const csvLines = [headers.join(',')];
  for (const r of rows) {
    csvLines.push([
      escapeCsvCell(r.created_at),
      escapeCsvCell(r.user_email),
      escapeCsvCell(r.user_role),
      escapeCsvCell(r.action),
      escapeCsvCell(r.feature),
      escapeCsvCell(r.server_name || r.server_id),
      escapeCsvCell(r.target),
      escapeCsvCell(r.status),
      escapeCsvCell(r.duration_ms),
      escapeCsvCell(r.message),
      escapeCsvCell(r.details)
    ].join(','));
  }
  return csvLines.join('\n');
}

/**
 * Retention cleanup: deletes rows older than retentionDays (default 90) in batches.
 */
export async function cleanupOldLogs(retentionDays) {
  const days = Number(retentionDays || process.env.LOG_RETENTION_DAYS || 90);
  if (!isLiveSupabaseConfigured || days <= 0) return { deletedCount: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const isReady = await checkLogSchema();
    if (!isReady) return { deletedCount: 0 };

    // Delete in batches from audit_logs
    const resAudit = await liveSupabase.from('audit_logs').delete().lt('created_at', cutoff);
    // Delete in batches from error_logs
    const resErrors = await liveSupabase.from('error_logs').delete().lt('created_at', cutoff);

    return {
      cutoff,
      days,
      auditError: resAudit.error?.message || null,
      errorError: resErrors.error?.message || null
    };
  } catch (err) {
    console.warn('[LogService] cleanupOldLogs warning:', err.message);
    return { error: err.message };
  }
}

// Schedule daily retention cleanup
if (typeof setInterval !== 'undefined') {
  setTimeout(() => {
    cleanupOldLogs().catch(() => {});
  }, 10000); // 10s after startup

  const dailyTimer = setInterval(() => {
    cleanupOldLogs().catch(() => {});
  }, 24 * 60 * 60 * 1000);
  if (dailyTimer.unref) dailyTimer.unref();
}

/**
 * Clears in-memory queues (used for testing).
 */
export function clearLogQueues() {
  auditQueue.length = 0;
  errorQueue.length = 0;
}
