import crypto from 'crypto';
import { auditLogger } from './auditLog.js';
import { parseBomSpreadsheet } from './bomSpreadsheetParser.js';
import {
  createBomFromData,
  rfcPreflightCreateBoms,
  resolveBomGroups,
  applyGroupValidationRules
} from './bomCreateEngine.js';
import {
  rfcCopyBom,
  rfcReadBom,
  rfcBatchValidateBoms,
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy,
  RFC_PRIORITY
} from './sapRfcClient.js';
import { getCircuitBreaker } from './serverHealthService.js';
import { bomJobRepository } from './bomJobRepository.js';
import { bomLockService } from './bomLockService.js';
import { jobPerformanceTracker } from './jobPerformanceTracker.js';

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
    code === 'CONNECTION_LOST' ||
    code === 'RFC_COMMUNICATION_FAILURE' ||
    code === 'RFC_CLOSED' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'EPIPE' ||
    code === 'SERVER_UNAVAILABLE' ||
    code.includes('NIECONN') ||
    code.includes('NI_SOCKET') ||
    msg.includes('ni socket') ||
    msg.includes('nieconn') ||
    msg.includes('saprouter rejected') ||
    msg.includes('return code -5') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('connection reset') ||
    msg.includes('connection closed') ||
    msg.includes('connection lost') ||
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
    this.activeRunners = new Map(); // jobId -> { startedAt, heartbeatTimer, jobTimeoutTimer }
    this.repository = bomJobRepository;
    this.initialized = false;
    this.init();

    // Background interval to continuously reap stale jobs without heartbeat (> 2 min)
    this.staleCheckerInterval = setInterval(() => {
      try {
        this.cleanStaleJobs();
      } catch (err) {
        console.warn('[bomJobManager] Stale check error:', err.message);
      }
    }, 15000);
    if (this.staleCheckerInterval?.unref) {
      this.staleCheckerInterval.unref();
    }
  }

  cleanStaleJobs() {
    const now = Date.now();
    let cleaned = false;

    for (const job of this.jobs.values()) {
      if (job.status === 'RUNNING' || job.status === 'running') {
        const jobId = job.jobId || job.id;
        const hasRunner = this.activeRunners.has(jobId);
        const lastHeartbeat = new Date(job.updatedAt || job.startedAt || job.createdAt || 0).getTime();
        const createdAge = now - new Date(job.createdAt || 0).getTime();
        const isHeartbeatStale = (now - lastHeartbeat) > 120000; // > 2 minutes
        const isRunnerMissingAndNotStarting = !hasRunner && createdAge > 10000; // 10s grace period for event loop spinup

        if (isHeartbeatStale || isRunnerMissingAndNotStarting) {
          console.warn(`[bomJobManager] Marking stale job ${jobId} as INTERRUPTED (hasRunner=${hasRunner}, age=${now - lastHeartbeat}ms, createdAge=${createdAge}ms)`);
          job.status = 'INTERRUPTED';
          job.message = 'The job was interrupted. Please upload again.';
          job.error = job.message;
          job.updatedAt = new Date().toISOString();
          job.completedAt = job.completedAt || new Date().toISOString();

          if (hasRunner) {
            const runnerInfo = this.activeRunners.get(jobId);
            if (runnerInfo?.heartbeatTimer) clearInterval(runnerInfo.heartbeatTimer);
            if (runnerInfo?.jobTimeoutTimer) clearTimeout(runnerInfo.jobTimeoutTimer);
            this.activeRunners.delete(jobId);
          }

          this.repository.saveJob(job).catch(() => {});
          cleaned = true;
        }
      }
    }

    if (cleaned) {
      this.processQueue().catch(() => {});
    }
  }

  async init() {
    try {
      // 1. Mark interrupted jobs from any previous server run
      await this.repository.markRunningJobsInterrupted();
      // 2. Retention cleanup: keep results 30 days
      await this.repository.cleanupOldJobs(30);
      this.startCleanupTimer();
      // 3. Populate in-memory map from repository
      const existing = await this.repository.listJobs();
      for (const job of existing) {
        this.jobs.set(job.jobId, { ...job });
        if (job.status === 'QUEUED') {
          this.queuedJobs.push(job.jobId);
        }
      }
      this.cleanStaleJobs();
      this.initialized = true;
      // 4. Try processing queued jobs if any
      this.processQueue();
    } catch (err) {
      console.warn('[bomJobManager] Initialization warning:', err.message);
    }
  }

  startCleanupTimer() {
    this.stopCleanupTimer();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    this._cleanupInterval = setInterval(async () => {
      try {
        await this.repository.cleanupOldJobs(30);
      } catch (err) {
        console.error('[bomJobManager] Periodic cleanupOldJobs error:', err.message);
      }
    }, TWENTY_FOUR_HOURS_MS);

    if (this._cleanupInterval && typeof this._cleanupInterval.unref === 'function') {
      this._cleanupInterval.unref();
    }
  }

  stopCleanupTimer() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
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
    this.cleanStaleJobs();
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

    const isCompleted = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(job.status);
    const calculatedPercent = isCompleted ? 100 : (job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0);
    const progressPercent = typeof job.progress_percent === 'number'
      ? (isCompleted ? 100 : job.progress_percent)
      : calculatedPercent;

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
      queuedReason: job.queuedReason || null,
      total: job.total || job.total_rows || 0,
      total_rows: job.total || job.total_rows || 0,
      processed: job.processed || job.processed_rows || 0,
      processed_rows: job.processed || job.processed_rows || 0,
      progress_percent: progressPercent,
      current_step: job.current_step || null,
      completed_steps: job.completed_steps ?? job.processed ?? 0,
      total_steps: job.total_steps ?? (job.total || 0),
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

  async getJob(jobId, requestingUser = null) {
    this.cleanStaleJobs();
    let job = this.jobs.get(jobId);
    if (!job) {
      // Async fallback to repository (dual-written DB or file store) if in-memory cache missed
      const found = await this.repository.getJob(jobId);
      if (found) {
        job = found;
        this.jobs.set(found.jobId || found.id, found);
      } else {
        return null;
      }
    }

    if (requestingUser) {
      const userObj = typeof requestingUser === 'object' ? requestingUser : { id: requestingUser, email: requestingUser };
      const isAdmin = userObj?.role === 'admin';
      const uId = userObj?.id || userObj?.email;
      const uEmail = userObj?.email;
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail || job.user_id === uId || job.user_id === uEmail;

      if (!isAdmin && !isOwner) {
        const err = new Error(`Job ${jobId} not found.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
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

  async cancelJob(jobId, requestingUser = null) {
    let job = this.jobs.get(jobId);
    if (!job) {
      const found = await this.repository.getJob(jobId);
      if (found) {
        job = found;
        this.jobs.set(found.jobId || found.id, found);
      } else {
        const err = new Error(`Job ${jobId} not found.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }
    }

    if (requestingUser) {
      const userObj = typeof requestingUser === 'object' ? requestingUser : { id: requestingUser, email: requestingUser };
      const isAdmin = userObj?.role === 'admin';
      const uId = userObj?.id || userObj?.email;
      const uEmail = userObj?.email;
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail || job.user_id === uId || job.user_id === uEmail;

      if (!isAdmin && !isOwner) {
        const err = new Error(`Job ${jobId} not found.`);
        err.code = 'NOT_FOUND';
        err.status = 404;
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

  async listJobs(requestingUser = null, filters = {}) {
    const userObj = requestingUser && typeof requestingUser === 'object' ? requestingUser : (requestingUser ? { id: requestingUser, email: requestingUser } : null);
    const isAdmin = userObj?.role === 'admin';
    const uId = userObj?.id || userObj?.email;

    // Non-admin can only list their own jobs
    const queryUserId = isAdmin ? (filters.userId || null) : uId;
    return this.repository.listJobs({ ...filters, userId: queryUserId });
  }

  /**
   * Starts a background job. Returns immediately in < 1s with the created jobId.
   */
  startJob({
    type, // 'create_preflight' | 'create_bulk' | 'copy_validate' | 'copy_bulk'
    user,
    server,
    items = [],
    fileName = '',
    options = {}
  }) {
    const userId = user?.id || user?.email || 'SYSTEM';
    const userEmail = user?.email || 'SYSTEM';
    const serverId = server?.id || server?.name || 'default';
    const serverName = server?.name || 'SAP-BOM';

    const processedItems = Array.isArray(items) ? [...items] : [];

    // 1. Strict Stage 4 limit: max 500 rows per job
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

    // 3. Count currently running jobs for user & server (after reaping any stale jobs)
    this.cleanStaleJobs();
    let userRunning = 0;
    let serverRunning = 0;
    for (const j of this.jobs.values()) {
      if (j.status === 'RUNNING') {
        if (j.userId === userId || j.userEmail === userEmail) userRunning++;
        if (j.serverId === serverId || j.serverName === serverName) serverRunning++;
      }
    }

    const shouldQueue = userRunning >= MAX_RUNNING_PER_USER || serverRunning >= MAX_RUNNING_PER_SERVER;
    let queuedReason = null;
    if (shouldQueue) {
      if (userRunning >= MAX_RUNNING_PER_USER) {
        queuedReason = 'Waiting for your running job to finish';
      } else {
        queuedReason = 'Waiting for server capacity';
      }
    }
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
      queuedReason,
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
    const savePromise = this.repository.saveJob(job).catch((e) => {
      console.warn('[bomJobManager] Save error:', e.message);
    });

    if (shouldQueue) {
      this.queuedJobs.push(jobId);
    } else {
      setImmediate(() => {
        this.executeJob(jobId, server, user);
      });
    }

    const startData = {
      success: true,
      jobId,
      total: job.total,
      status: job.status,
      queuedReason: job.queuedReason || null,
      message: shouldQueue
        ? `Capacity reached (${queuedReason}). Job queued for execution.`
        : 'Background job initialized successfully.'
    };

    // Return Promise with attached sync properties: supports both synchronous property reads and `await` for persistence
    const startPromise = savePromise.then(() => startData);
    return Object.assign(startPromise, startData);
  }

  async processQueue() {
    this.cleanStaleJobs();
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
        job.queuedReason = null;
        job.startedAt = new Date().toISOString();
        job.updatedAt = new Date().toISOString();
        await this.repository.saveJob(job);

        setImmediate(() => {
          this.executeJob(job.jobId, job.serverRef, job.userRef);
        });
      } else {
        job.queuedReason = userRunning >= MAX_RUNNING_PER_USER
          ? 'Waiting for your running job to finish'
          : 'Waiting for server capacity';
      }
    }
  }

  async executeJob(jobId, server, user) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'RUNNING';
    job.startedAt = job.startedAt || new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    job.current_step = 'Initializing operation...';
    job.completed_steps = 0;
    job.progress_percent = 3; // Active running segment (min 3%)

    const items = job.items || [];
    const rowsCount = Math.max(items.length, 1);
    // Max job time: max(10 minutes, rows x 2 minutes), capped at 30 minutes for validation and create
    const maxJobTimeMs = Math.min(30 * 60 * 1000, Math.max(10 * 60 * 1000, rowsCount * 2 * 60 * 1000));

    jobPerformanceTracker.startJob(jobId, {
      type: job.type,
      rowCount: rowsCount,
      serverId: job.serverId
    });

    const runnerInfo = {
      startedAt: Date.now(),
      heartbeatTimer: null,
      jobTimeoutTimer: null
    };

    // Heartbeat every 10 seconds during in-flight operations (at least every 15s)
    runnerInfo.heartbeatTimer = setInterval(() => {
      const currentJob = this.jobs.get(jobId);
      if (currentJob && currentJob.status === 'RUNNING') {
        currentJob.updatedAt = new Date().toISOString();
      }
    }, 10000);
    if (runnerInfo.heartbeatTimer.unref) runnerInfo.heartbeatTimer.unref();

    // Maximum job time watchdog: fails after max(10m, rows x 2m) capped at 30m
    runnerInfo.jobTimeoutTimer = setTimeout(() => {
      const currentJob = this.jobs.get(jobId);
      if (currentJob && currentJob.status === 'RUNNING') {
        currentJob.cancelRequested = true;
        currentJob.timedOut = true;
        currentJob.status = 'FAILED';
        const elapsedMinutes = Math.max(1, Math.round((Date.now() - runnerInfo.startedAt) / 60000));
        const maxMinutes = Math.round(maxJobTimeMs / 60000);
        const opName = (currentJob.type || '').includes('validate') || (currentJob.type || '').includes('preflight') ? 'Validation' : 'Execution';
        currentJob.error = `${opName} timed out after running for ${maxMinutes} minutes. Please upload again.`;
        currentJob.message = currentJob.error;
        currentJob.updatedAt = new Date().toISOString();
        currentJob.completedAt = new Date().toISOString();
        this.repository.saveJob(currentJob).catch(() => {});
      }
    }, maxJobTimeMs);
    if (runnerInfo.jobTimeoutTimer.unref) runnerInfo.jobTimeoutTimer.unref();

    this.activeRunners.set(jobId, runnerInfo);

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
      if (runnerInfo.heartbeatTimer) clearInterval(runnerInfo.heartbeatTimer);
      if (runnerInfo.jobTimeoutTimer) clearTimeout(runnerInfo.jobTimeoutTimer);
      this.activeRunners.delete(jobId);
      jobPerformanceTracker.finishJob(jobId);

      job.currentBom = null;
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();

      if (job.status === 'RUNNING') {
        job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
        job.progress_percent = 100;
        job.completed_steps = job.total_steps || job.processed || rowsCount;
        job.current_step = 'Operation complete';
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

    job.total_steps = Math.max(1, boms.length * 2);
    job.completed_steps = 0;
    job.progress_percent = 3;

    for (let i = 0; i < boms.length; i += CHUNK_SIZE) {
      if (job.cancelRequested || job.status === 'FAILED') {
        this._cancelRemaining(job, boms, i);
        break;
      }

      const chunk = boms.slice(i, i + CHUNK_SIZE);
      const startIdx = i + 1;
      const endIdx = Math.min(boms.length, i + chunk.length);

      job.currentBom = {
        index: startIdx,
        total: boms.length,
        material: chunk[0].material,
        plant: chunk[0].plant
      };
      job.current_step = `Validating BOMs ${startIdx} to ${endIdx} of ${boms.length}...`;
      job.completed_steps = Math.max(job.completed_steps || 0, i * 2 + 1);
      job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));

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
          const callStart = Date.now();
          preflightRes = await rfcPreflightCreateBoms({
            boms: chunk,
            server,
            source: 'bulk',
            priority: RFC_PRIORITY.BULK
          });
          jobPerformanceTracker.recordCall(job.jobId || job.id, {
            functionName: 'rfcPreflightCreateBoms',
            durationMs: Date.now() - callStart,
            rowsInvolved: chunk.length
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
          const overallIndex = i + idx + 1;
          const outcome = {
            ...vBom,
            message: vBom.reason || (vBom.errors && vBom.errors.length > 0 ? vBom.errors.join(' | ') : ''),
            input: orig,
            retryable: vBom.status !== 'Ready' && vBom.status !== 'Already exists - skipped' && vBom.status !== 'Skipped'
          };
          job.results.push(outcome);
          if (outcome.status === 'Ready') job.successCount++;
          else if (outcome.status === 'Already exists - skipped' || outcome.status === 'Skipped') job.skippedCount++;
          else job.failedCount++;

          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.completed_steps = Math.max(job.completed_steps || 0, overallIndex * 2);
          job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));
          job.updatedAt = new Date().toISOString();
        }
      } else {
        // Failed chunk after backoff: mark rows failed with retryable flag
        console.error('[bomJobManager] Chunk preflight execution failed:', lastErr);
        const isInternalCodeError = lastErr instanceof ReferenceError || lastErr instanceof TypeError;
        const userMsg = isInternalCodeError
          ? 'Validation could not be completed for this row.'
          : (lastErr?.message || 'Pre-flight check failed.');
        for (let idx = 0; idx < chunk.length; idx++) {
          const c = chunk[idx];
          const overallIndex = i + idx + 1;
          job.results.push({
            sequenceNum: c.sequenceNum,
            material: c.material,
            plant: c.plant,
            status: 'FAILED',
            retryable: !isInternalCodeError,
            message: userMsg,
            input: c
          });
          job.failedCount++;
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.completed_steps = Math.max(job.completed_steps || 0, overallIndex * 2);
          job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));
          job.updatedAt = new Date().toISOString();
        }
      }

      // Persist after every chunk of 10 rows
      await this.repository.saveJob(job);
    }

    // Re-apply group validation across full job results in case groups crossed chunks
    if (Array.isArray(job.results) && job.results.length > 0) {
      applyGroupValidationRules(job.results);
      job.results.forEach((r) => {
        r.message = r.reason || (r.errors && r.errors.length > 0 ? r.errors.join(' | ') : '');
      });
      job.successCount = job.results.filter((r) => r.status === 'Ready').length;
      job.skippedCount = job.results.filter((r) => r.status === 'Already exists - skipped' || r.status === 'Skipped').length;
      job.failedCount = job.results.filter((r) => r.status === 'Invalid' || r.status === 'FAILED').length;
      job.current_step = 'Validation complete';
      job.completed_steps = job.total_steps;
      job.progress_percent = 100;
      await this.repository.saveJob(job);
    }

    job.current_step = 'Copy complete';
    job.completed_steps = job.total_steps;
    job.progress_percent = 100;
  }

  async runCreateBulk(job, boms, server, user) {
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    // Group-aware bottom-up ordering
    const groups = resolveBomGroups(boms);
    const orderedBoms = [];
    groups.forEach((g) => {
      orderedBoms.push(...g.orderedBoms);
    });

    job.total_steps = Math.max(1, orderedBoms.length);
    job.completed_steps = 0;
    job.progress_percent = 3;

    for (let i = 0; i < orderedBoms.length; i += CHUNK_SIZE) {
      if (job.cancelRequested || job.status === 'FAILED') {
        this._cancelRemaining(job, orderedBoms, i);
        break;
      }

      const chunk = orderedBoms.slice(i, i + CHUNK_SIZE);

      for (let j = 0; j < chunk.length; j++) {
        if (job.cancelRequested || job.status === 'FAILED') {
          this._cancelRemaining(job, orderedBoms, i + j);
          break;
        }

        const bom = chunk[j];
        const overallIndex = i + j + 1;
        const group = groups.find((g) => g.members.includes(bom)) || { parent: bom, children: [], createdSubBoms: [] };
        group.createdSubBoms = group.createdSubBoms || [];

        job.currentBom = {
          index: overallIndex,
          total: orderedBoms.length,
          sequenceNum: bom.sequenceNum,
          material: bom.material,
          plant: bom.plant
        };
        job.current_step = `Creating BOM ${overallIndex} of ${orderedBoms.length} (${bom.material})...`;
        job.completed_steps = overallIndex;
        job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((overallIndex / job.total_steps) * 100)));

        // If an earlier sub-BOM in this group failed, skip remaining members of the group
        if (group.failedMaterial) {
          job.skippedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'SKIPPED',
            subStatus: 'NOT_ATTEMPTED',
            retryable: true,
            message: `Not created because ${group.failedMaterial} failed earlier in this group`,
            input: bom
          });
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.updatedAt = new Date().toISOString();
          continue;
        }

        if (bom.status === 'Already exists - skipped' || bom.status === 'Skipped') {
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
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.updatedAt = new Date().toISOString();
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
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.updatedAt = new Date().toISOString();
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
            job.processed = overallIndex;
            job.processed_rows = overallIndex;
            job.updatedAt = new Date().toISOString();
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
            if (bom !== group.parent) {
              group.createdSubBoms.push(bom.material);
            }
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
            const isParent = bom === group.parent;
            if (!isParent) {
              group.failedMaterial = bom.material;
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
            } else {
              let msg = createResult.message || 'SAP rejected BOM creation.';
              if (group.createdSubBoms.length > 0) {
                msg = `${msg} | Partially created: ${group.createdSubBoms.join(', ')}`;
              }
              job.results.push({
                sequenceNum: bom.sequenceNum,
                material: bom.material,
                plant: bom.plant,
                bomUsage: bom.bomUsage,
                alternativeBom: bom.alternativeBom,
                bomNumber: '-',
                status: 'FAILED',
                retryable: false,
                message: msg,
                discrepancies: createResult.discrepancies || [],
                input: bom
              });
            }
          }
        } catch (err) {
          console.error('[bomJobManager] Create BOM row execution failed:', err);
          const isInternalCodeError = err instanceof ReferenceError || err instanceof TypeError;
          const isConn = !isInternalCodeError && (isSapConnectionDrop(err) || err.code === 'CONNECTION_LOST' || err.code === 'WRITE_OUTCOME_UNKNOWN');

          if (isConn) {
            // Safe Retry Protocol for Write Operations: NEVER blindly retry
            // 1. Check read-only whether BOM already exists in SAP
            let createdInSap = false;
            let checkIndeterminate = false;
            try {
              const checkRes = await rfcReadBom({
                material: bom.material,
                plant: bom.plant,
                bomUsage: bom.bomUsage || '1',
                alternativeBom: bom.alternativeBom || '1',
                server,
                useCache: false,
                priority: RFC_PRIORITY.READ
              });
              if (checkRes.success && checkRes.bomExists) {
                createdInSap = true;
              }
            } catch (chkErr) {
              checkIndeterminate = true;
            }

            if (createdInSap) {
              // BOM exists in SAP (connection dropped after save)
              if (bom !== group.parent) {
                group.createdSubBoms.push(bom.material);
              }
              job.successCount++;
              job.results.push({
                sequenceNum: bom.sequenceNum,
                material: bom.material,
                plant: bom.plant,
                bomUsage: bom.bomUsage,
                alternativeBom: bom.alternativeBom,
                bomNumber: bom.alternativeBom || '01',
                status: 'SUCCESS',
                message: 'Created (connection dropped after save, verified in SAP)',
                componentsCount: bom.components?.length || 0,
                input: bom
              });
              job.processed = overallIndex;
              job.processed_rows = overallIndex;
              job.updatedAt = new Date().toISOString();
              continue;
            } else if (!checkIndeterminate) {
              // BOM does NOT exist in SAP: retry write once on a fresh connection
              try {
                const retryRes = await createBomFromData({
                  bom,
                  server,
                  user,
                  source: 'bulk',
                  priority: RFC_PRIORITY.BULK,
                  fileName: job.fileName
                });
                if (retryRes.success) {
                  if (bom !== group.parent) {
                    group.createdSubBoms.push(bom.material);
                  }
                  job.successCount++;
                  job.results.push({
                    sequenceNum: bom.sequenceNum,
                    material: bom.material,
                    plant: bom.plant,
                    bomUsage: bom.bomUsage,
                    alternativeBom: bom.alternativeBom,
                    bomNumber: retryRes.bomNumber || bom.alternativeBom || '-',
                    status: retryRes.status || 'SUCCESS',
                    message: retryRes.message || 'BOM created and verified in SAP.',
                    discrepancies: retryRes.discrepancies || [],
                    componentsCount: bom.components?.length || 0,
                    input: bom
                  });
                  job.processed = overallIndex;
                  job.processed_rows = overallIndex;
                  job.updatedAt = new Date().toISOString();
                  continue;
                } else {
                  job.failedCount++;
                  if (bom !== group.parent) group.failedMaterial = bom.material;
                  job.results.push({
                    sequenceNum: bom.sequenceNum,
                    material: bom.material,
                    plant: bom.plant,
                    bomUsage: bom.bomUsage,
                    alternativeBom: bom.alternativeBom,
                    bomNumber: '-',
                    status: 'FAILED',
                    retryable: false,
                    message: retryRes.message || 'SAP rejected BOM creation.',
                    input: bom
                  });
                  job.processed = overallIndex;
                  job.processed_rows = overallIndex;
                  job.updatedAt = new Date().toISOString();
                  continue;
                }
              } catch (retryErr) {
                // Check if created during retry
                let secondCheckCreated = false;
                try {
                  const checkRes2 = await rfcReadBom({
                    material: bom.material,
                    plant: bom.plant,
                    bomUsage: bom.bomUsage || '1',
                    alternativeBom: bom.alternativeBom || '1',
                    server,
                    useCache: false,
                    priority: RFC_PRIORITY.READ
                  });
                  if (checkRes2.success && checkRes2.bomExists) secondCheckCreated = true;
                } catch (_) {}

                if (secondCheckCreated) {
                  if (bom !== group.parent) group.createdSubBoms.push(bom.material);
                  job.successCount++;
                  job.results.push({
                    sequenceNum: bom.sequenceNum,
                    material: bom.material,
                    plant: bom.plant,
                    bomUsage: bom.bomUsage,
                    alternativeBom: bom.alternativeBom,
                    bomNumber: bom.alternativeBom || '01',
                    status: 'SUCCESS',
                    message: 'Created (connection dropped after save, verified in SAP)',
                    componentsCount: bom.components?.length || 0,
                    input: bom
                  });
                  job.processed = overallIndex;
                  job.processed_rows = overallIndex;
                  job.updatedAt = new Date().toISOString();
                  continue;
                }

                // Verified NOT created in SAP -> friendly message
                job.failedCount++;
                if (bom !== group.parent) group.failedMaterial = bom.material;
                job.results.push({
                  sequenceNum: bom.sequenceNum,
                  material: bom.material,
                  plant: bom.plant,
                  bomUsage: bom.bomUsage,
                  alternativeBom: bom.alternativeBom,
                  bomNumber: '-',
                  status: 'FAILED',
                  retryable: true,
                  connectionLost: true,
                  message: 'Connection to SAP was lost while creating this BOM. No BOM was created. Use Retry Failed Rows.',
                  input: bom
                });
                job.processed = overallIndex;
                job.processed_rows = overallIndex;
                job.updatedAt = new Date().toISOString();
                continue;
              }
            } else {
              // Read verification indeterminate
              job.failedCount++;
              if (bom !== group.parent) group.failedMaterial = bom.material;
              job.results.push({
                sequenceNum: bom.sequenceNum,
                material: bom.material,
                plant: bom.plant,
                bomUsage: bom.bomUsage,
                alternativeBom: bom.alternativeBom,
                bomNumber: '-',
                status: 'FAILED',
                code: 'WRITE_OUTCOME_UNKNOWN',
                retryable: false,
                connectionLost: true,
                message: 'Connection to SAP was lost while writing to SAP and outcome could not be verified. Please verify using Display BOM before attempting again.',
                input: bom
              });
              job.processed = overallIndex;
              job.processed_rows = overallIndex;
              job.updatedAt = new Date().toISOString();
              continue;
            }
          }

          const userMsg = isInternalCodeError
            ? 'Validation could not be completed for this row.'
            : err.message;
          job.failedCount++;
          const isParent = bom === group.parent;
          if (!isParent) {
            group.failedMaterial = bom.material;
          }
          let finalUserMsg = userMsg;
          if (isParent && group.createdSubBoms.length > 0) {
            finalUserMsg = `${finalUserMsg} | Partially created: ${group.createdSubBoms.join(', ')}`;
          }
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'FAILED',
            retryable: false,
            message: finalUserMsg,
            input: bom
          });
        } finally {
          if (rowLock) {
            rowLock.release();
          }
        }

        job.processed = overallIndex;
        job.processed_rows = overallIndex;
        job.updatedAt = new Date().toISOString();
      }

      // Persist progress after each chunk of 10 rows
      await this.repository.saveJob(job);
    }

    job.current_step = 'Creation complete';
    job.completed_steps = job.total_steps;
    job.progress_percent = 100;
  }

  async runCopyValidate(job, items, server) {
    const allocatedByTargetKey = new Map();
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);
    const validationCache = {
      readBom: new Map(),
      existingAlternatives: new Map(),
      subAssemblyExists: new Map()
    };

    job.total_steps = Math.max(1, items.length * 3);
    job.completed_steps = 0;
    job.progress_percent = 3;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      if (job.cancelRequested || job.status === 'FAILED') {
        this._cancelRemaining(job, items, i);
        break;
      }

      const chunk = items.slice(i, i + CHUNK_SIZE);
      const startIdx = i + 1;
      const endIdx = Math.min(items.length, i + chunk.length);

      job.current_step = `Validating BOMs ${startIdx} to ${endIdx} of ${items.length}...`;
      job.completed_steps = Math.max(job.completed_steps || 0, i * 3 + 1);
      job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));

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
          const callStart = Date.now();
          valRes = await rfcBatchValidateBoms(chunk, {
            server,
            allocatedByTargetKey,
            priority: RFC_PRIORITY.BULK,
            jobId: job.jobId || job.id,
            cache: validationCache
          });
          jobPerformanceTracker.recordCall(job.jobId || job.id, {
            functionName: 'rfcBatchValidateBoms',
            durationMs: Date.now() - callStart,
            rowsInvolved: chunk.length
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

      if (valRes && valRes.results && Array.isArray(valRes.results)) {
        for (let j = 0; j < valRes.results.length; j++) {
          const row = valRes.results[j];
          const item = chunk[j] || {};
          const overallIndex = i + j + 1;

          job.currentBom = {
            index: overallIndex,
            total: items.length,
            sourceMaterial: item.sourceMaterial,
            targetMaterial: item.targetMaterial || item.sourceMaterial,
            plant: item.targetPlant || item.sourcePlant
          };

          job.results.push({
            ...row,
            input: item,
            retryable: row.status === 'ERROR'
          });
          if (row.status === 'VALID' || row.status === 'WARNING') job.successCount++;
          else job.failedCount++;

          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.completed_steps = Math.max(job.completed_steps || 0, overallIndex * 3);
          job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));
          job.updatedAt = new Date().toISOString();
        }
      } else {
        console.error('[bomJobManager] Copy validate chunk failed:', lastErr);
        const isInternalCodeError = lastErr instanceof ReferenceError || lastErr instanceof TypeError;
        const userMsg = isInternalCodeError
          ? 'Validation could not be completed for this row.'
          : (lastErr?.message || 'Validation failed.');

        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          const overallIndex = i + j + 1;
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: item.sourceMaterial,
            sourcePlant: item.sourcePlant,
            targetMaterial: item.targetMaterial,
            targetPlant: item.targetPlant,
            status: 'ERROR',
            retryable: !isInternalCodeError,
            message: userMsg,
            input: item
          });
          job.failedCount++;
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.completed_steps = Math.max(job.completed_steps || 0, overallIndex * 3);
          job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((job.completed_steps / job.total_steps) * 100)));
          job.updatedAt = new Date().toISOString();
        }
      }

      await this.repository.saveJob(job);
    }

    job.current_step = 'Validation complete';
    job.completed_steps = job.total_steps;
    job.progress_percent = 100;
  }

  async runCopyBulk(job, items, server, user) {
    const { copyHierarchy = true, skipErrors = true } = job.options || {};
    const allocatedByTargetKey = new Map();
    const serverId = server?.id || server?.name || 'default';
    const breaker = getCircuitBreaker(serverId);

    job.total_steps = Math.max(1, items.length);
    job.completed_steps = 0;
    job.progress_percent = 3;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      if (job.cancelRequested || job.status === 'FAILED') {
        this._cancelRemaining(job, items, i);
        break;
      }

      const chunk = items.slice(i, i + CHUNK_SIZE);

      for (let j = 0; j < chunk.length; j++) {
        if (job.cancelRequested || job.status === 'FAILED') {
          this._cancelRemaining(job, items, i + j);
          break;
        }

        const item = chunk[j];
        const overallIndex = i + j + 1;

        const srcMat = String(item.sourceMaterial || '').trim().toUpperCase();
        const srcPlant = String(item.sourcePlant || '').trim().toUpperCase();
        const srcUsage = String(item.sourceUsage || item.sourceBomUsage || '1').trim();
        const srcAlt = String(item.sourceAltBom || item.sourceAlternative || '').trim();

        const tgtMat = String(item.targetMaterial || srcMat).trim().toUpperCase();
        const tgtPlant = String(item.targetPlant || srcPlant).trim().toUpperCase();
        const tgtUsage = String(item.targetUsage || item.targetBomUsage || '1').trim();
        const tgtAlt = String(item.targetAltBom || item.targetAlternative || '').trim();

        job.currentBom = {
          index: overallIndex,
          total: items.length,
          sourceMaterial: item.sourceMaterial,
          targetMaterial: tgtMat,
          plant: tgtPlant
        };
        job.current_step = `Copying BOM ${overallIndex} of ${items.length} (${item.sourceMaterial} -> ${tgtMat})...`;
        job.completed_steps = overallIndex;
        job.progress_percent = Math.max(job.progress_percent || 0, Math.min(99, Math.round((overallIndex / job.total_steps) * 100)));

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
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.updatedAt = new Date().toISOString();
          continue;
        }

        // Never execute a row that failed pre-execution validation
        if (item.status === 'ERROR' || item.status === 'FAILED' || item.status === 'INVALID') {
          job.failedCount++;
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            status: 'FAILED',
            retryable: false,
            message: item.message || 'Row failed validation and was not executed.',
            input: item
          });
          job.processed = overallIndex;
          job.processed_rows = overallIndex;
          job.updatedAt = new Date().toISOString();
          continue;
        }

        try {
          // Strictly resolve and verify source alternative exists (never trust frontend or blindly fallback)
          const srcAltRes = await resolveSourceAlternativeForCopy({
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            sourceUsage: srcUsage,
            sourceAlternative: srcAlt,
            server,
            priority: RFC_PRIORITY.BULK
          });

          if (!srcAltRes.sourceAlternative) {
            job.failedCount++;
            job.results.push({
              id: item.id || overallIndex,
              sourceMaterial: srcMat,
              sourcePlant: srcPlant,
              targetMaterial: tgtMat,
              targetPlant: tgtPlant,
              status: 'FAILED',
              retryable: false,
              message: srcAltRes.message || `Source alternative ${srcAlt} does not exist for ${srcMat} in plant ${srcPlant}`,
              input: item
            });
            job.processed = overallIndex;
            job.processed_rows = overallIndex;
            job.updatedAt = new Date().toISOString();
            if (!skipErrors) break;
            continue;
          }
          const effectiveSrcAlt = srcAltRes.sourceAlternative;

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
            job.processed = overallIndex;
            job.processed_rows = overallIndex;
            job.updatedAt = new Date().toISOString();
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
              job.processed = overallIndex;
              job.processed_rows = overallIndex;
              job.updatedAt = new Date().toISOString();
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
          console.error('[bomJobManager] Copy bulk row execution failed:', err);
          const isInternalCodeError = err instanceof ReferenceError || err instanceof TypeError;
          const isConn = !isInternalCodeError && (isSapConnectionDrop(err) || err.code === 'CONNECTION_LOST' || err.code === 'WRITE_OUTCOME_UNKNOWN');

          if (isConn) {
            // Check read-only whether target BOM exists in SAP
            let targetCreated = false;
            let checkIndeterminate = false;
            try {
              const checkRes = await rfcReadBom({
                material: tgtMat,
                plant: tgtPlant,
                bomUsage: tgtUsage,
                alternativeBom: resolvedTgtAlt || '01',
                server,
                useCache: false,
                priority: RFC_PRIORITY.READ
              });
              if (checkRes.success && checkRes.bomExists) targetCreated = true;
            } catch (_) {
              checkIndeterminate = true;
            }

            if (targetCreated) {
              job.successCount++;
              job.results.push({
                id: item.id || overallIndex,
                sourceMaterial: srcMat,
                sourcePlant: srcPlant,
                targetMaterial: tgtMat,
                targetPlant: tgtPlant,
                targetAltBom: resolvedTgtAlt,
                bomNumber: resolvedTgtAlt || '',
                status: 'SUCCESS',
                message: 'Copied (connection dropped after save, verified in SAP)',
                input: item
              });
              job.processed = overallIndex;
              job.processed_rows = overallIndex;
              job.updatedAt = new Date().toISOString();
              continue;
            } else if (!checkIndeterminate) {
              // Retry copy once on fresh connection
              try {
                const retryCopyRes = await rfcCopyBom({
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
                if (retryCopyRes.success) {
                  job.successCount++;
                  job.results.push({
                    id: item.id || overallIndex,
                    sourceMaterial: srcMat,
                    sourcePlant: srcPlant,
                    targetMaterial: tgtMat,
                    targetPlant: tgtPlant,
                    targetAltBom: retryCopyRes.alternativeBom || resolvedTgtAlt,
                    bomNumber: retryCopyRes.bomNumber || '',
                    status: 'SUCCESS',
                    message: retryCopyRes.message || 'BOM copied successfully in SAP.',
                    input: item
                  });
                  job.processed = overallIndex;
                  job.processed_rows = overallIndex;
                  job.updatedAt = new Date().toISOString();
                  continue;
                }
              } catch (retryErr) {
                // Check if created during retry
                let secondCheckCreated = false;
                try {
                  const checkRes2 = await rfcReadBom({
                    material: tgtMat,
                    plant: tgtPlant,
                    bomUsage: tgtUsage,
                    alternativeBom: resolvedTgtAlt || '01',
                    server,
                    useCache: false,
                    priority: RFC_PRIORITY.READ
                  });
                  if (checkRes2.success && checkRes2.bomExists) secondCheckCreated = true;
                } catch (_) {}

                if (secondCheckCreated) {
                  job.successCount++;
                  job.results.push({
                    id: item.id || overallIndex,
                    sourceMaterial: srcMat,
                    sourcePlant: srcPlant,
                    targetMaterial: tgtMat,
                    targetPlant: tgtPlant,
                    targetAltBom: resolvedTgtAlt,
                    bomNumber: resolvedTgtAlt || '',
                    status: 'SUCCESS',
                    message: 'Copied (connection dropped after save, verified in SAP)',
                    input: item
                  });
                  job.processed = overallIndex;
                  job.processed_rows = overallIndex;
                  job.updatedAt = new Date().toISOString();
                  continue;
                }

                job.failedCount++;
                job.results.push({
                  id: item.id || overallIndex,
                  sourceMaterial: srcMat,
                  sourcePlant: srcPlant,
                  targetMaterial: tgtMat,
                  targetPlant: tgtPlant,
                  bomNumber: '-',
                  status: 'FAILED',
                  retryable: true,
                  connectionLost: true,
                  message: 'Connection to SAP was lost while creating this BOM. No BOM was created. Use Retry Failed Rows.',
                  input: item
                });
                job.processed = overallIndex;
                job.processed_rows = overallIndex;
                job.updatedAt = new Date().toISOString();
                continue;
              }
            } else {
              job.failedCount++;
              job.results.push({
                id: item.id || overallIndex,
                sourceMaterial: srcMat,
                sourcePlant: srcPlant,
                targetMaterial: tgtMat,
                targetPlant: tgtPlant,
                bomNumber: '-',
                status: 'FAILED',
                code: 'WRITE_OUTCOME_UNKNOWN',
                retryable: false,
                connectionLost: true,
                message: 'Connection to SAP was lost while writing to SAP and outcome could not be verified. Please verify using Display BOM before attempting again.',
                input: item
              });
              job.processed = overallIndex;
              job.processed_rows = overallIndex;
              job.updatedAt = new Date().toISOString();
              continue;
            }
          }

          const userMsg = isInternalCodeError
            ? 'Validation could not be completed for this row.'
            : err.message;
          job.failedCount++;
          job.results.push({
            id: item.id || overallIndex,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            bomNumber: '-',
            status: 'FAILED',
            retryable: false,
            message: userMsg,
            input: item
          });
        }

        job.processed = overallIndex;
        job.processed_rows = overallIndex;
        job.updatedAt = new Date().toISOString();
      }

      await this.repository.saveJob(job);
    }

    job.current_step = 'Copy complete';
    job.completed_steps = job.total_steps;
    job.progress_percent = 100;
  }

  _cancelRemaining(job, items, startIndex) {
    const isTimeout = !!job.timedOut;
    for (let k = startIndex; k < items.length; k++) {
      job.results.push({
        id: items[k].id || k + 1,
        sequenceNum: items[k].sequenceNum || String(k + 1),
        material: items[k].material || items[k].sourceMaterial,
        plant: items[k].plant || items[k].sourcePlant,
        status: 'NOT_PROCESSED',
        message: isTimeout
          ? 'Execution timed out before processing row.'
          : 'Cancelled by user before processing chunk.',
        input: items[k]
      });
    }
    job.notProcessedCount = items.length - startIndex;
    if (job.status === 'RUNNING' || !job.status) {
      job.status = isTimeout ? 'FAILED' : 'CANCELLED';
    }
  }
}

export const bomJobManager = new BomJobManager();
