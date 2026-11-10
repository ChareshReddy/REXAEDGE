import crypto from 'crypto';
import { auditLogger } from './auditLog.js';
import { parseBomSpreadsheet } from './bomSpreadsheetParser.js';
import { createBomFromData, rfcPreflightCreateBoms } from './bomCreateEngine.js';
import {
  rfcCopyBom,
  rfcBatchValidateBoms,
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy,
  RFC_PRIORITY
} from './sapRfcClient.js';
import { getCircuitBreaker } from './serverHealthService.js';
import { bomJobRepository } from './bomJobRepository.js';
import { bomLockService } from './bomLockService.js';

export const DEFAULT_MAX_BOMS = 500;
export const MAX_BOMS = 500; // Strict Stage 4 limit: max 500 rows per job
export const CHUNK_SIZE = 10; // Strict Stage 4 chunk size: 10 rows per chunk

export const MAX_RUNNING_PER_USER = 1;
export const MAX_RUNNING_PER_SERVER = 3;

/**
 * Detects if an error is caused by a broken network interface, SAProuter timeout, or socket termination.
 */
export function isSapConnectionDrop(err) {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'RFC_COMMUNICATION_FAILURE' ||
    code === 'RFC_CLOSED' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'SERVER_UNAVAILABLE' ||
    msg.includes('saprouter rejected') ||
    msg.includes('return code -5') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('connection reset') ||
    msg.includes('connection closed') ||
    msg.includes('could not establish connection') ||
    msg.includes('partner not reached') ||
    msg.includes('broken pipe') ||
    msg.includes('server is not reachable')
  );
}

class BomJobManager {
  constructor() {
    this.jobs = new Map(); // jobId -> Job Object (in-memory cache)
    this.queuedJobs = []; // Queue of jobIds waiting for capacity (FIFO)
    this.repository = bomJobRepository;
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      // 1. Mark interrupted jobs from any previous server run
      await this.repository.markRunningJobsInterrupted();
      // 2. Retention cleanup: keep results 30 days
      await this.repository.cleanupOldJobs(30);
      // 3. Populate in-memory map from repository
      const existing = await this.repository.listJobs();
      for (const job of existing) {
        this.jobs.set(job.jobId, { ...job });
        if (job.status === 'QUEUED') {
          this.queuedJobs.push(job.jobId);
        }
      }
      this.initialized = true;
      // 4. Try processing queued jobs if any
      this.processQueue();
    } catch (err) {
      console.warn('[bomJobManager] Initialization warning:', err.message);
    }
  }

  loadPersistedSummaries() {
    const list = this.repository._loadFileJobs();
    this.persistedSummaries = list;
    for (const summary of list) {
      if (summary.status === 'RUNNING' || summary.status === 'running') {
        summary.status = 'INTERRUPTED';
        summary.message =
          'Job was interrupted by a server restart. Execution was stopped and will not resume automatically.';
        summary.updatedAt = new Date().toISOString();
        summary.completedAt = summary.completedAt || new Date().toISOString();

        const createdCount = (summary.results || []).filter((r) => r.status === 'SUCCESS').length;
        const failedCount = (summary.results || []).filter((r) => r.status === 'FAILED').length;
        summary.successCount = createdCount;
        summary.failedCount = failedCount;

        const existingCount = (summary.results || []).length;
        const remainingCount = Math.max(0, (summary.total || summary.total_rows || 0) - existingCount);
        summary.notProcessedCount = remainingCount;

        if (remainingCount > 0) {
          summary.results = summary.results || [];
          for (let k = existingCount; k < (summary.total || summary.total_rows || 0); k++) {
            summary.results.push({
              sequenceNum: String(k + 1),
              status: 'NOT_PROCESSED',
              message: 'Not processed: job was interrupted by server restart.'
            });
          }
        }
      }
      this.jobs.set(summary.jobId || summary.id, { ...summary });
    }
    return list;
  }

  savePersistedSummaries() {
    const summaries = Array.from(this.jobs.values())
      .map((j) => this.toCleanSummary(j))
      .filter(Boolean)
      .slice(-200);
    this.persistedSummaries = summaries;
    this.repository._saveFileJobsSync(summaries);
    return summaries;
  }

  toCleanSummary(job) {
    if (!job) return null;
    const results = job.results || [];
    const failedRows = results
      .filter((r) => r.status === 'FAILED' || r.status === 'ERROR')
      .map((r) => r.input || r);

    return {
      jobId: job.jobId || job.id,
      id: job.jobId || job.id,
      type: job.type || job.action,
      action: job.action || job.type,
      userId: job.userId || job.user_id,
      userEmail: job.userEmail,
      serverId: job.serverId || job.server_id,
      serverName: job.serverName,
      status: job.status,
      total: job.total || job.total_rows || 0,
      total_rows: job.total || job.total_rows || 0,
      processed: job.processed || job.processed_rows || 0,
      processed_rows: job.processed || job.processed_rows || 0,
      successCount: job.successCount || job.success_count || 0,
      success_count: job.successCount || job.success_count || 0,
      failedCount: job.failedCount || job.error_count || 0,
      error_count: job.failedCount || job.error_count || 0,
      skippedCount: job.skippedCount || 0,
      notProcessedCount: job.notProcessedCount || 0,
      currentBom: job.currentBom || null,
      results,
      failedRows,
      error: job.error || null,
      message: job.message || null,
      createdAt: job.createdAt || job.created_at,
      startedAt: job.startedAt || job.started_at,
      updatedAt: job.updatedAt || job.updated_at,
      completedAt: job.completedAt || job.finished_at || null
    };
  }

  getJob(jobId, requestingUser = null) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    if (requestingUser) {
      const userObj = typeof requestingUser === 'object' ? requestingUser : { id: requestingUser, email: requestingUser };
      const isAdmin = userObj?.role === 'admin';
      const uId = userObj?.id || userObj?.email;
      const uEmail = userObj?.email;
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail || job.user_id === uId;

      if (!isAdmin && !isOwner) {
        const err = new Error('Forbidden: You do not have permission to access this job.');
        err.code = 'FORBIDDEN';
        err.status = 403;
        throw err;
      }
    }

    return this.toCleanSummary(job);
  }

  getActiveJob(userId, server) {
    const sId = server?.id || server?.name || 'default';
    const uId = userId || 'unknown_user';

    for (const job of this.jobs.values()) {
      const matchUser = job.userId === uId || job.userEmail === uId;
      const matchServer = job.serverId === sId || job.serverName === sId;
      if (matchUser && matchServer && (job.status === 'RUNNING' || job.status === 'QUEUED')) {
        return this.toCleanSummary(job);
      }
    }
    return null;
  }

  cancelJob(jobId, requestingUser = null) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, message: `Job ${jobId} not found.` };
    }

    if (requestingUser) {
      const userObj = typeof requestingUser === 'object' ? requestingUser : { id: requestingUser, email: requestingUser };
      const isAdmin = userObj?.role === 'admin';
      const uId = userObj?.id || userObj?.email;
      const uEmail = userObj?.email;
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail || job.user_id === uId;

      if (!isAdmin && !isOwner) {
        const err = new Error('Forbidden: You do not have permission to cancel this job.');
        err.code = 'FORBIDDEN';
        err.status = 403;
        throw err;
      }
    }

    if (job.status !== 'RUNNING' && job.status !== 'QUEUED') {
      return { success: false, message: `Job cannot be cancelled in state ${job.status}.` };
    }

    job.cancelRequested = true;
    job.updatedAt = new Date().toISOString();

    if (job.status === 'QUEUED') {
      job.status = 'CANCELLED';
      job.completedAt = new Date().toISOString();
      job.message = 'Cancelled by user before execution started.';
      this.repository.saveJob(job).catch(() => {});
      const qIdx = this.queuedJobs.indexOf(jobId);
      if (qIdx >= 0) this.queuedJobs.splice(qIdx, 1);
      return { success: true, message: 'Queued job cancelled immediately.' };
    }

    this.repository.saveJob(job).catch(() => {});
    return {
      success: true,
      message: 'Cancellation requested. Job will stop after the current chunk of 10 rows finishes.'
    };
  }

  /**
   * Starts a background job. Returns immediately in < 1s with the created jobId.
   */
  startJob({
    type, // 'create_preflight' | 'create_bulk' | 'copy_validate' | 'copy_bulk'
    user,
    server,
    items = [],
    fileContent = null,
    fileName = '',
    options = {}
  }) {
    const userId = user?.id || user?.email || 'SYSTEM';
    const userEmail = user?.email || 'SYSTEM';
    const serverId = server?.id || server?.name || 'default';
    const serverName = server?.name || 'SAP-BOM';

    // 1. Parse file if fileContent provided
    let processedItems = [...items];
    if (fileContent) {
      const raw = String(fileContent);
      const buffer = raw.startsWith('data:')
        ? Buffer.from(raw.split(',')[1], 'base64')
        : Buffer.from(raw, 'base64');
      const parseInfo = parseBomSpreadsheet(buffer);
      fileContent = null;

      if (parseInfo.errors && parseInfo.errors.length > 0 && (!parseInfo.boms || parseInfo.boms.length === 0)) {
        const err = new Error(parseInfo.errors.join(' | '));
        err.code = 'PARSE_ERROR';
        throw err;
      }
      processedItems = parseInfo.boms || [];
    }

    // 2. Strict Stage 4 limit: max 500 rows per job
    if (processedItems.length > MAX_BOMS) {
      const err = new Error(
        `Uploaded file contains ${processedItems.length} BOMs, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split your file into smaller batches of ${MAX_BOMS} or fewer.`
      );
      err.code = 'BOM_LIMIT_EXCEEDED';
      err.status = 400;
      err.limit = MAX_BOMS;
      err.actual = processedItems.length;
      throw err;
    }

    if (processedItems.length === 0) {
      const err = new Error('No BOM items provided to process.');
      err.code = 'EMPTY_PAYLOAD';
      err.status = 400;
      throw err;
    }

    // 3. Count currently running jobs for user & server
    let userRunning = 0;
    let serverRunning = 0;
    for (const j of this.jobs.values()) {
      if (j.status === 'RUNNING') {
        if (j.userId === userId || j.userEmail === userEmail) userRunning++;
        if (j.serverId === serverId || j.serverName === serverName) serverRunning++;
      }
    }

    const shouldQueue = userRunning >= MAX_RUNNING_PER_USER || serverRunning >= MAX_RUNNING_PER_SERVER;
    const initialStatus = shouldQueue ? 'QUEUED' : 'RUNNING';

    // 4. Create Job Record
    const jobId = `job_${type}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const job = {
      jobId,
      id: jobId,
      type,
      action: type.includes('copy') ? 'copy' : type.includes('create') ? 'create' : 'validate',
      userId,
      user_id: user?.id || null,
      userEmail,
      serverId,
      server_id: server?.id || null,
      serverName,
      status: initialStatus,
      total: processedItems.length,
      total_rows: processedItems.length,
      processed: 0,
      processed_rows: 0,
      successCount: 0,
      success_count: 0,
      failedCount: 0,
      error_count: 0,
      skippedCount: 0,
      notProcessedCount: 0,
      currentBom: null,
      results: [],
      items: processedItems, // In-memory reference for execution loop only
      input: {
        fileName,
        options,
        total: processedItems.length
      },
      options,
      fileName,
      createdAt: new Date().toISOString(),
      startedAt: initialStatus === 'RUNNING' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      completedAt: null,
      cancelRequested: false,
      error: null,
      serverRef: server,
      userRef: user
    };

    this.jobs.set(jobId, job);
    this.repository.saveJob(job).catch((e) => console.warn('[bomJobManager] Save error:', e.message));

    if (shouldQueue) {
      this.queuedJobs.push(jobId);
    } else {
      setImmediate(() => {
        this.executeJob(jobId, server, user);
      });
    }

    return {
      success: true,
      jobId,
      total: job.total,
      status: job.status,
      message: shouldQueue
        ? 'Capacity reached (max 1 running per user, 3 per server). Job queued for execution.'
        : 'Background job initialized successfully.'
    };
  }

  async processQueue() {
    if (this.queuedJobs.length === 0) return;

    for (let i = 0; i < this.queuedJobs.length; i++) {
      const jobId = this.queuedJobs[i];
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'QUEUED') {
        this.queuedJobs.splice(i, 1);
        i--;
        continue;
      }

      // Check current capacity
      let userRunning = 0;
      let serverRunning = 0;
      for (const j of this.jobs.values()) {
        if (j.status === 'RUNNING') {
          if (j.userId === job.userId || j.userEmail === job.userEmail) userRunning++;
          if (j.serverId === job.serverId || j.serverName === job.serverName) serverRunning++;
        }
      }

      if (userRunning < MAX_RUNNING_PER_USER && serverRunning < MAX_RUNNING_PER_SERVER) {
        // Can run this job!
        this.queuedJobs.splice(i, 1);
        i--;
        job.status = 'RUNNING';
        job.startedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
        await this.repository.saveJob(job);

        setImmediate(() => {
          this.executeJob(job.jobId, job.serverRef, job.userRef);
        });
      }
    }
  }

  async executeJob(jobId, server, user) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'RUNNING';
    job.startedAt = job.startedAt || new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    const items = job.items || [];

    try {
      if (job.type === 'create_preflight') {
        await this.runCreatePreflight(job, items, server);
      } else if (job.type === 'create_bulk') {
        await this.runCreateBulk(job, items, server, user);
      } else if (job.type === 'copy_validate') {
        await this.runCopyValidate(job, items, server);
      } else if (job.type === 'copy_bulk') {
        await this.runCopyBulk(job, items, server, user);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }
    } catch (err) {
      console.error(`[bomJobManager] Unhandled job error in ${jobId}:`, err.message);
      if (job.status === 'RUNNING') {
        job.status = 'FAILED';
        job.error = err.message;
      }
    } finally {
      job.currentBom = null;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      if (job.status === 'RUNNING') {
        job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
      }

      // Free items memory from RAM
      delete job.items;

      // Persist final state
      await this.repository.saveJob(job);

      // Audit Log
      try {
        auditLogger.logAction({
          user: job.userEmail,
          sapUsername: job.userEmail,
          system: job.serverName,
          actionType: job.type.includes('create') ? 'create' : 'copy_bom',
          entityKey: 'bom',
          recordId: `Job-${job.jobId}`,
          task: `Bulk ${job.type} execution (${job.processed}/${job.total})`,
          afterValues: {
            total: job.total,
            processed: job.processed,
            successCount: job.successCount,
            failedCount: job.failedCount,
            skippedCount: job.skippedCount,
            notProcessedCount: job.notProcessedCount,
            status: job.status
          }
        });
      } catch (logErr) {
        console.warn('[bomJobManager] Audit log write failed:', logErr.message);
      }

      // Trigger next queued job in FIFO order
      this.processQueue();
    }
  }

  // --- JOB HANDLERS WITH 10-ROW CHUNKS & BACKOFF/CIRCUIT BREAKER HANDLING ---

  async runCreatePreflight(job, boms, server) {
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    for (let i = 0; i < boms.length; i += CHUNK_SIZE) {
      if (job.cancelRequested) {
        this._cancelRemaining(job, boms, i);
        break;
      }

      const chunk = boms.slice(i, i + CHUNK_SIZE);
      job.currentBom = {
        index: i + 1,
        total: boms.length,
        material: chunk[0].material,
        plant: chunk[0].plant
      };

      // Read/Validate: circuit breaker / SERVER_BUSY with short backoff (max 3 tries)
      let preflightRes = null;
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const canExec = breaker.canExecute();
        if (!canExec.allowed) {
          lastErr = new Error('SAP server is busy or circuit breaker is open.');
          lastErr.code = 'SERVER_UNAVAILABLE';
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        try {
          preflightRes = await rfcPreflightCreateBoms({
            boms: chunk,
            server,
            source: 'bulk',
            priority: RFC_PRIORITY.BULK
          });
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          if (err.code === 'SERVER_BUSY' || isSapConnectionDrop(err)) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          break;
        }
      }

      if (preflightRes && preflightRes.boms) {
        for (let idx = 0; idx < preflightRes.boms.length; idx++) {
          const vBom = preflightRes.boms[idx];
          const orig = chunk[idx];
          const outcome = {
            ...vBom,
            input: orig,
            retryable: vBom.status !== 'Ready' && vBom.status !== 'Already exists - skipped'
          };
          job.results.push(outcome);
          if (vBom.status === 'Ready') job.successCount++;
          else if (vBom.status === 'Already exists - skipped') job.skippedCount++;
          else job.failedCount++;
        }
      } else {
        // Failed chunk after backoff: mark rows failed with retryable flag
        for (const c of chunk) {
          job.results.push({
            sequenceNum: c.sequenceNum,
            material: c.material,
            plant: c.plant,
            status: 'FAILED',
            retryable: true,
            message: lastErr?.message || 'Pre-flight check failed.',
            input: c
          });
          job.failedCount++;
        }
      }

      job.processed = Math.min(boms.length, i + chunk.length);
      job.processed_rows = job.processed;
      job.updatedAt = new Date().toISOString();

      // Persist after every chunk of 10 rows
      await this.repository.saveJob(job);
    }
  }

  async runCreateBulk(job, boms, server, user) {
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    for (let i = 0; i < boms.length; i += CHUNK_SIZE) {
      if (job.cancelRequested) {
        this._cancelRemaining(job, boms, i);
        break;
      }

      const chunk = boms.slice(i, i + CHUNK_SIZE);

      for (let j = 0; j < chunk.length; j++) {
        const bom = chunk[j];
        const overallIndex = i + j + 1;

        job.currentBom = {
          index: overallIndex,
          total: boms.length,
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant
        };

        if (bom.status === 'Already exists - skipped') {
          job.skippedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'SKIPPED',
            message: bom.reason || 'BOM already exists in plant; skipped.',
            input: bom
          });
          continue;
        }

        // Writes: If circuit breaker is open, mark failed immediately with retryable=true, DO NOT RETRY!
        const canExec = breaker.canExecute();
        if (!canExec.allowed) {
          job.failedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'FAILED',
            retryable: true,
            message: 'SAP server circuit breaker is open. Write operation not attempted.',
            input: bom
          });
          continue;
        }

        // Acquire granular per-BOM row lock (Stage 5 Part A)
        let rowLock = null;
        try {
          rowLock = bomLockService.acquireLock({
            serverId,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternative: bom.alternativeBom,
            userId: user?.id || user?.email || job.userId
          });
        } catch (lockErr) {
          if (lockErr.code === 'BOM_LOCKED') {
            job.failedCount++;
            job.results.push({
              sequenceNum: bom.sequenceNum,
              material: bom.material,
              plant: bom.plant,
              bomUsage: bom.bomUsage,
              alternativeBom: bom.alternativeBom,
              bomNumber: '-',
              status: 'FAILED',
              code: 'BOM_LOCKED',
              retryable: true,
              message: 'This BOM is being changed by another user. Please try again in a moment.',
              input: bom
            });
            continue;
          }
          throw lockErr;
        }

        // Execute write: NEVER RETRIED AUTOMATICALLY
        try {
          const createResult = await createBomFromData({
            bom,
            server,
            user,
            source: 'bulk',
            priority: RFC_PRIORITY.BULK,
            fileName: job.fileName
          });

          if (createResult.success) {
            job.successCount++;
            job.results.push({
              sequenceNum: bom.sequenceNum,
              material: bom.material,
              plant: bom.plant,
              bomUsage: bom.bomUsage,
              alternativeBom: bom.alternativeBom,
              bomNumber: createResult.bomNumber || bom.alternativeBom || '-',
              status: createResult.status || 'SUCCESS',
              message: createResult.message || 'BOM created and verified in SAP.',
              discrepancies: createResult.discrepancies || [],
              componentsCount: bom.components?.length || 0,
              input: bom
            });
          } else {
            job.failedCount++;
            job.results.push({
              sequenceNum: bom.sequenceNum,
              material: bom.material,
              plant: bom.plant,
              bomUsage: bom.bomUsage,
              alternativeBom: bom.alternativeBom,
              bomNumber: '-',
              status: 'FAILED',
              retryable: false, // Business rejection is not retryable
              message: createResult.message || 'SAP rejected BOM creation.',
              discrepancies: createResult.discrepancies || [],
              input: bom
            });
          }
        } catch (err) {
          const isConn = isSapConnectionDrop(err);
          job.failedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'FAILED',
            retryable: isConn, // Connection error marked retryable for user to re-run
            message: isConn ? `SAP connection dropped: ${err.message}` : err.message,
            input: bom
          });
        } finally {
          if (rowLock) {
            rowLock.release();
          }
        }
      }

      job.processed = Math.min(boms.length, i + chunk.length);
      job.processed_rows = job.processed;
      job.updatedAt = new Date().toISOString();

      // Persist progress after each chunk of 10 rows
      await this.repository.saveJob(job);
    }
  }

  async runCopyValidate(job, items, server) {
    const allocatedByTargetKey = new Map();
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      if (job.cancelRequested) {
        this._cancelRemaining(job, items, i);
        break;
      }

      const chunk = items.slice(i, i + CHUNK_SIZE);

      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const overallIndex = i + j + 1;

        job.currentBom = {
          index: overallIndex,
          total: items.length,
          sourceMaterial: item.sourceMaterial,
          targetMaterial: item.targetMaterial || item.sourceMaterial,
          plant: item.targetPlant || item.sourcePlant
        };

        // Reads: circuit breaker / SERVER_BUSY with short backoff (max 3 tries)
        let valRes = null;
        let lastErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const canExec = breaker.canExecute();
          if (!canExec.allowed) {
            lastErr = new Error('SAP server is busy or circuit breaker open.');
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }

          try {
            valRes = await rfcBatchValidateBoms([item], {
              server,
              allocatedByTargetKey,
              priority: RFC_PRIORITY.BULK
            });
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (err.code === 'SERVER_BUSY' || isSapConnectionDrop(err)) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
              continue;
            }
            break;
          }
        }

        if (valRes && valRes.results && valRes.results[0]) {
          const row = valRes.results[0];
          job.results.push({
            ...row,
            input: item,
            retryable: row.status === 'ERROR'
          });
          if (row.status === 'VALID' || row.status === 'WARNING') job.successCount++;
          else job.failedCount++;
        } else {
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: item.sourceMaterial,
            sourcePlant: item.sourcePlant,
            targetMaterial: item.targetMaterial,
            targetPlant: item.targetPlant,
            status: 'ERROR',
            retryable: true,
            message: lastErr?.message || 'Validation failed.',
            input: item
          });
          job.failedCount++;
        }
      }

      job.processed = Math.min(items.length, i + chunk.length);
      job.processed_rows = job.processed;
      job.updatedAt = new Date().toISOString();

      await this.repository.saveJob(job);
    }
  }

  async runCopyBulk(job, items, server, user) {
    const { copyHierarchy = true, skipErrors = true } = job.options || {};
    const allocatedByTargetKey = new Map();
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      if (job.cancelRequested) {
        this._cancelRemaining(job, items, i);
        break;
      }

      const chunk = items.slice(i, i + CHUNK_SIZE);

      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const overallIndex = i + j + 1;

        job.currentBom = {
          index: overallIndex,
          total: items.length,
          sourceMaterial: item.sourceMaterial,
          targetMaterial: item.targetMaterial || item.sourceMaterial,
          plant: item.targetPlant || item.sourcePlant
        };

        const srcMat = String(item.sourceMaterial || '').trim().toUpperCase();
        const srcPlant = String(item.sourcePlant || '').trim().toUpperCase();
        const srcUsage = String(item.sourceUsage || item.sourceBomUsage || '1').trim();
        const srcAlt = String(item.sourceAltBom || item.sourceAlternative || '').trim();

        const tgtMat = String(item.targetMaterial || srcMat).trim().toUpperCase();
        const tgtPlant = String(item.targetPlant || '').trim().toUpperCase();
        const tgtUsage = String(item.targetUsage || item.targetBomUsage || '1').trim();
        const tgtAlt = String(item.targetAltBom || item.targetAlternative || '').trim();

        // Check circuit breaker: Writes NEVER RETRIED
        const canExec = breaker.canExecute();
        if (!canExec.allowed) {
          job.failedCount++;
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            status: 'FAILED',
            retryable: true,
            message: 'SAP server circuit breaker is open. Copy operation not attempted.',
            input: item
          });
          continue;
        }

        try {
          let effectiveSrcAlt = srcAlt;
          if (!effectiveSrcAlt) {
            const srcAltRes = await resolveSourceAlternativeForCopy({
              sourceMaterial: srcMat,
              sourcePlant: srcPlant,
              sourceUsage: srcUsage,
              sourceAlternative: srcAlt,
              server,
              priority: RFC_PRIORITY.BULK
            });
            if (srcAltRes.sourceAlternative) effectiveSrcAlt = srcAltRes.sourceAlternative;
          }

          const targetKey = `${tgtMat}|${tgtPlant}|${tgtUsage}`;
          const allocatedList = allocatedByTargetKey.get(targetKey) || [];

          const tgtAltRes = await resolveTargetAlternativeForCopy({
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            targetUsage: tgtUsage,
            targetAlternative: tgtAlt,
            allocatedAlternatives: allocatedList,
            server,
            priority: RFC_PRIORITY.BULK
          });

          const resolvedNum = parseInt(tgtAltRes.targetAlternative, 10);
          allocatedByTargetKey.set(targetKey, [...allocatedList, resolvedNum]);
          const resolvedTgtAlt = tgtAltRes.targetAlternative;

          if (tgtAltRes.exists) {
            job.failedCount++;
            job.results.push({
              id: item.id || overallIndex,
              sourceMaterial: srcMat,
              sourcePlant: srcPlant,
              targetMaterial: tgtMat,
              targetPlant: tgtPlant,
              targetAltBom: resolvedTgtAlt,
              bomNumber: '-',
              status: 'FAILED',
              retryable: false,
              message: `Cannot copy: Alternative ${parseInt(resolvedTgtAlt, 10)} already exists in BOM ${tgtMat}/${tgtPlant}/${tgtUsage}`,
              input: item
            });
            if (!skipErrors) break;
            continue;
          }

          // Acquire target BOM row lock (Stage 5 Part A)
          let copyRowLock = null;
          try {
            copyRowLock = bomLockService.acquireLock({
              serverId,
              material: tgtMat,
              plant: tgtPlant,
              bomUsage: tgtUsage,
              alternative: resolvedTgtAlt,
              userId: user?.id || user?.email || job.userId
            });
          } catch (lockErr) {
            if (lockErr.code === 'BOM_LOCKED') {
              job.failedCount++;
              job.results.push({
                id: item.id || overallIndex,
                sourceMaterial: srcMat,
                sourcePlant: srcPlant,
                targetMaterial: tgtMat,
                targetPlant: tgtPlant,
                targetAltBom: resolvedTgtAlt,
                bomNumber: '-',
                status: 'FAILED',
                code: 'BOM_LOCKED',
                retryable: true,
                message: 'This BOM is being changed by another user. Please try again in a moment.',
                input: item
              });
              if (!skipErrors) break;
              continue;
            }
            throw lockErr;
          }

          try {
            const copyRes = await rfcCopyBom({
              sourceMaterial: srcMat,
              sourcePlant: srcPlant,
              targetMaterial: tgtMat,
              targetPlant: tgtPlant,
              bomUsage: tgtUsage,
              sourceAlternative: effectiveSrcAlt || '1',
              targetAlternative: resolvedTgtAlt,
              copyHierarchy,
              server,
              priority: RFC_PRIORITY.BULK
            });

            if (copyRes.success) {
              job.successCount++;
              job.results.push({
                id: item.id || overallIndex,
                sourceMaterial: srcMat,
                sourcePlant: srcPlant,
                targetMaterial: tgtMat,
                targetPlant: tgtPlant,
                targetAltBom: copyRes.alternativeBom || resolvedTgtAlt,
                bomNumber: copyRes.bomNumber || '',
                status: 'SUCCESS',
                message: copyRes.message || 'BOM copied successfully in SAP.',
                input: item
              });
            } else {
              job.failedCount++;
              job.results.push({
                id: item.id || overallIndex,
                sourceMaterial: srcMat,
                sourcePlant: srcPlant,
                targetMaterial: tgtMat,
                targetPlant: tgtPlant,
                targetAltBom: resolvedTgtAlt,
                bomNumber: '-',
                status: 'FAILED',
                retryable: false,
                message: copyRes.message || 'BOM copy rejected by SAP.',
                input: item
              });
            }
          } finally {
            if (copyRowLock) {
              copyRowLock.release();
            }
          }
        } catch (err) {
          const isConn = isSapConnectionDrop(err);
          job.failedCount++;
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            bomNumber: '-',
            status: 'FAILED',
            retryable: isConn,
            message: isConn ? `SAP connection dropped: ${err.message}` : err.message,
            input: item
          });
        }
      }

      job.processed = Math.min(items.length, i + chunk.length);
      job.processed_rows = job.processed;
      job.updatedAt = new Date().toISOString();

      await this.repository.saveJob(job);
    }
  }

  _cancelRemaining(job, items, startIndex) {
    for (let k = startIndex; k < items.length; k++) {
      job.results.push({
        id: items[k].id || k + 1,
        sequenceNum: items[k].sequenceNum || String(k + 1),
        material: items[k].material || items[k].sourceMaterial,
        plant: items[k].plant || items[k].sourcePlant,
        status: 'NOT_PROCESSED',
        message: 'Cancelled by user before processing chunk.',
        input: items[k]
      });
    }
    job.notProcessedCount = items.length - startIndex;
    job.status = 'CANCELLED';
  }
}

export const bomJobManager = new BomJobManager();
