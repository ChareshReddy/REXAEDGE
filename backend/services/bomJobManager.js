import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { auditLogger } from './auditLog.js';
import { parseBomSpreadsheet } from './bomSpreadsheetParser.js';
import { createBomFromData, rfcPreflightCreateBoms } from './bomCreateEngine.js';
import {
  rfcCopyBom,
  rfcBatchValidateBoms,
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy
} from './sapRfcClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JOB_SUMMARIES_FILE = path.join(__dirname, '..', 'mock', 'bomJobSummaries.json');

export const DEFAULT_MAX_BOMS = 500;
export const MAX_BOMS = process.env.BOM_BULK_MAX_LIMIT
  ? parseInt(process.env.BOM_BULK_MAX_LIMIT, 10) || DEFAULT_MAX_BOMS
  : DEFAULT_MAX_BOMS;

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
    msg.includes('saprouter rejected') ||
    msg.includes('return code -5') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('connection reset') ||
    msg.includes('connection closed') ||
    msg.includes('could not establish connection') ||
    msg.includes('partner not reached') ||
    msg.includes('broken pipe')
  );
}

class BomJobManager {
  constructor() {
    this.jobs = new Map(); // jobId -> Job Object
    this.activeUserServerJobs = new Map(); // `${userId}:${serverId}` -> jobId
    this.persistedSummaries = [];
    this.loadPersistedSummaries();
  }

  loadPersistedSummaries() {
    try {
      if (fs.existsSync(JOB_SUMMARIES_FILE)) {
        const raw = fs.readFileSync(JOB_SUMMARIES_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          let hasInterrupted = false;
          this.persistedSummaries = parsed;
          // Populate in-memory map from summaries, marking any interrupted jobs
          for (const summary of parsed) {
            if (summary.status === 'RUNNING' || summary.status === 'QUEUED') {
              hasInterrupted = true;
              summary.status = 'INTERRUPTED';
              summary.message =
                'Job was interrupted by a server restart. Execution was stopped and will not resume automatically.';
              summary.updatedAt = new Date().toISOString();
              summary.completedAt = summary.completedAt || new Date().toISOString();

              const createdCount = (summary.results || []).filter((r) => r.status === 'SUCCESS').length;
              const failedCount = (summary.results || []).filter((r) => r.status === 'FAILED').length;
              summary.successCount = createdCount;
              summary.failedCount = failedCount;

              // Fill out remaining unprocessed BOMs up to total
              const existingCount = (summary.results || []).length;
              const remainingCount = Math.max(0, (summary.total || 0) - existingCount);
              summary.notProcessedCount = remainingCount;

              if (remainingCount > 0) {
                summary.results = summary.results || [];
                for (let k = existingCount; k < summary.total; k++) {
                  summary.results.push({
                    sequenceNum: String(k + 1),
                    status: 'NOT_PROCESSED',
                    message: 'Not processed: job was interrupted by server restart.'
                  });
                }
              }
            }
            this.jobs.set(summary.jobId, { ...summary });
          }

          if (hasInterrupted) {
            this.savePersistedSummaries();
          }
        }
      }
    } catch (err) {
      console.warn('[bomJobManager] Could not load persisted job summaries:', err.message);
      this.persistedSummaries = [];
    }
  }

  savePersistedSummaries() {
    try {
      const dir = path.dirname(JOB_SUMMARIES_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Keep most recent 50 job summaries
      const summaries = Array.from(this.jobs.values())
        .map((j) => this.toCleanSummary(j))
        .slice(-50);
      fs.writeFileSync(JOB_SUMMARIES_FILE, JSON.stringify(summaries, null, 2), 'utf-8');
    } catch (err) {
      console.error('[bomJobManager] Failed to persist job summaries:', err.message);
    }
  }

  toCleanSummary(job) {
    if (!job) return null;
    return {
      jobId: job.jobId,
      type: job.type,
      userId: job.userId,
      userEmail: job.userEmail,
      serverId: job.serverId,
      serverName: job.serverName,
      status: job.status,
      total: job.total || 0,
      processed: job.processed || 0,
      successCount: job.successCount || 0,
      failedCount: job.failedCount || 0,
      skippedCount: job.skippedCount || 0,
      notProcessedCount: job.notProcessedCount || 0,
      currentBom: job.currentBom || null,
      results: job.results || [],
      error: job.error || null,
      message: job.message || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt || null
    };
  }

  getUserServerKey(userId, server) {
    const sId = server?.id || server?.name || 'default';
    const uId = userId || 'unknown_user';
    return `${uId}:${sId}`;
  }

  getActiveJob(userId, server) {
    const key = this.getUserServerKey(userId, server);
    const existingJobId = this.activeUserServerJobs.get(key);
    if (!existingJobId) return null;
    const job = this.jobs.get(existingJobId);
    if (job && (job.status === 'RUNNING' || job.status === 'QUEUED')) {
      return this.toCleanSummary(job);
    }
    // Stale lock cleanup
    this.activeUserServerJobs.delete(key);
    return null;
  }

  getJob(jobId, requestingUser = null) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    if (requestingUser) {
      const userObj = typeof requestingUser === 'object' ? requestingUser : { id: requestingUser, email: requestingUser };
      const isAdmin = userObj?.role === 'admin';
      const uId = userObj?.id || userObj?.email;
      const uEmail = userObj?.email;
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail;

      if (!isAdmin && !isOwner) {
        const err = new Error('Forbidden: You do not have permission to access this job.');
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    return this.toCleanSummary(job);
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
      const isOwner = job.userId === uId || job.userEmail === uEmail || job.userId === uEmail;

      if (!isAdmin && !isOwner) {
        const err = new Error('Forbidden: You do not have permission to cancel this job.');
        err.code = 'FORBIDDEN';
        throw err;
      }
    }

    if (job.status !== 'RUNNING' && job.status !== 'QUEUED') {
      return { success: false, message: `Job cannot be cancelled in state ${job.status}.` };
    }
    job.cancelRequested = true;
    job.updatedAt = new Date().toISOString();
    return {
      success: true,
      message: 'Cancellation requested. Job will stop after current BOM finishes.'
    };
  }

  /**
   * Starts a background job. Returns immediately with the created jobId.
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
    const key = this.getUserServerKey(userId, server);

    // 1. Enforce single active job per user & server
    const active = this.getActiveJob(userId, server);
    if (active) {
      const err = new Error(
        `An active bulk job (${active.jobId}) is already running on ${serverName}. Please wait for it to complete or cancel it.`
      );
      err.code = 'ACTIVE_JOB_EXISTS';
      err.activeJobId = active.jobId;
      throw err;
    }

    // 2. Parse file if fileContent provided (with zero-storage guarantee)
    let processedItems = [...items];
    if (fileContent) {
      try {
        const raw = String(fileContent);
        const buffer = raw.startsWith('data:')
          ? Buffer.from(raw.split(',')[1], 'base64')
          : Buffer.from(raw, 'base64');
        const parseInfo = parseBomSpreadsheet(buffer);
        // Explicitly clear references to prevent memory retention
        fileContent = null;

        if (parseInfo.errors && parseInfo.errors.length > 0 && (!parseInfo.boms || parseInfo.boms.length === 0)) {
          const err = new Error(parseInfo.errors.join(' | '));
          err.code = 'PARSE_ERROR';
          throw err;
        }
        processedItems = parseInfo.boms || [];
      } catch (parseErr) {
        throw parseErr;
      }
    }

    // 3. BOM Cap Validation (reject files above configurable limit, default 500)
    if (processedItems.length > MAX_BOMS) {
      const err = new Error(
        `Uploaded file contains ${processedItems.length} BOMs, which exceeds the maximum limit of ${MAX_BOMS} BOMs. Please split your file into smaller batches of ${MAX_BOMS} or fewer.`
      );
      err.code = 'BOM_LIMIT_EXCEEDED';
      err.limit = MAX_BOMS;
      err.actual = processedItems.length;
      throw err;
    }

    if (processedItems.length === 0) {
      const err = new Error('No BOM items provided to process.');
      err.code = 'EMPTY_PAYLOAD';
      throw err;
    }

    // 4. Create Job Record
    const jobId = `job_${type}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const job = {
      jobId,
      type,
      userId,
      userEmail,
      serverId,
      serverName,
      status: 'QUEUED',
      total: processedItems.length,
      processed: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      notProcessedCount: 0,
      currentBom: null,
      results: [],
      items: processedItems, // In-memory reference for execution loop only
      options,
      fileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      cancelRequested: false,
      error: null
    };

    this.jobs.set(jobId, job);
    this.activeUserServerJobs.set(key, jobId);

    // 5. Kick off asynchronous processing immediately
    setImmediate(() => {
      this.executeJob(jobId, server, user);
    });

    return {
      success: true,
      jobId,
      total: job.total,
      status: job.status,
      message: 'Background job initialized successfully.'
    };
  }

  async executeJob(jobId, server, user) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'RUNNING';
    job.updatedAt = new Date().toISOString();

    const items = job.items || [];
    const isMock = process.env.USE_MOCK_SAP === 'true';

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

      // Free items memory from memory map
      delete job.items;

      // Release active concurrency lock
      const key = this.getUserServerKey(job.userId, server);
      if (this.activeUserServerJobs.get(key) === jobId) {
        this.activeUserServerJobs.delete(key);
      }

      // Persist results summary
      this.savePersistedSummaries();

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
    }
  }

  // --- JOB TYPE HANDLERS ---

  async runCreatePreflight(job, boms, server) {
    // Validate BOMs sequentially / in chunks of 5 for responsive progress reporting
    const chunkSize = 5;
    for (let i = 0; i < boms.length; i += chunkSize) {
      if (job.cancelRequested) {
        for (let k = i; k < boms.length; k++) {
          job.results.push({
            sequenceNum: boms[k].sequenceNum,
            material: boms[k].material,
            plant: boms[k].plant,
            status: 'NOT_PROCESSED',
            message: 'Cancelled by user before validation.'
          });
        }
        job.notProcessedCount = boms.length - i;
        job.status = 'CANCELLED';
        break;
      }

      const chunk = boms.slice(i, i + chunkSize);
      job.currentBom = {
        index: i + 1,
        total: boms.length,
        material: chunk[0].material,
        plant: chunk[0].plant,
        alternativeBom: chunk[0].alternativeBom
      };

      try {
        const preflightRes = await rfcPreflightCreateBoms({ boms: chunk, server });
        const validatedChunk = preflightRes.boms || chunk;
        for (const vBom of validatedChunk) {
          job.results.push(vBom);
          if (vBom.status === 'Ready') job.successCount++;
          else if (vBom.status === 'Already exists - skipped') job.skippedCount++;
          else job.failedCount++;
        }
      } catch (err) {
        if (isSapConnectionDrop(err)) {
          // Connection drop: mark current and remaining as NOT_PROCESSED and abort
          for (const c of chunk) {
            job.results.push({
              sequenceNum: c.sequenceNum,
              material: c.material,
              plant: c.plant,
              status: 'FAILED',
              message: `SAP connection dropped: ${err.message}`
            });
            job.failedCount++;
          }
          const remainingStart = i + chunkSize;
          for (let k = remainingStart; k < boms.length; k++) {
            job.results.push({
              sequenceNum: boms[k].sequenceNum,
              material: boms[k].material,
              plant: boms[k].plant,
              status: 'NOT_PROCESSED',
              message: 'Skipped: SAP connection dropped during pre-flight.'
            });
          }
          job.notProcessedCount = Math.max(0, boms.length - remainingStart);
          job.status = 'STOPPED_ON_CONNECTION_DROP';
          job.error = err.message;
          break;
        } else {
          // Regular error on chunk: mark as invalid and continue
          for (const c of chunk) {
            job.results.push({
              ...c,
              status: 'Invalid',
              errors: [err.message]
            });
            job.failedCount++;
          }
        }
      }

      job.processed = Math.min(boms.length, i + chunkSize);
      job.updatedAt = new Date().toISOString();
    }

    if (job.status === 'RUNNING') {
      job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    }
  }

  async runCreateBulk(job, boms, server, user) {
    for (let i = 0; i < boms.length; i++) {
      const bom = boms[i];

      // 1. Check user cancellation
      if (job.cancelRequested) {
        for (let k = i; k < boms.length; k++) {
          job.results.push({
            sequenceNum: boms[k].sequenceNum,
            material: boms[k].material,
            plant: boms[k].plant,
            bomUsage: boms[k].bomUsage,
            alternativeBom: boms[k].alternativeBom,
            bomNumber: '-',
            status: 'NOT_PROCESSED',
            message: 'Cancelled by user before creation.',
            componentsCount: boms[k].components?.length || 0
          });
        }
        job.notProcessedCount = boms.length - i;
        job.status = 'CANCELLED';
        break;
      }

      // 2. Update current BOM indicator
      job.currentBom = {
        index: i + 1,
        total: boms.length,
        sequenceNum: bom.sequenceNum,
        material: bom.material,
        plant: bom.plant,
        alternativeBom: bom.alternativeBom
      };

      // 3. Skip already skipped items
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
          discrepancies: [],
          componentsCount: bom.components?.length || 0
        });
        job.processed = i + 1;
        job.updatedAt = new Date().toISOString();
        continue;
      }

      // 4. Execute single BOM creation via shared engine (strict: no retries of SAP writes)
      try {
        const createResult = await createBomFromData({
          bom,
          server,
          user,
          source: 'bulk',
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
            componentsCount: bom.components?.length || 0
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
            message: createResult.message || 'SAP rejected BOM creation.',
            discrepancies: createResult.discrepancies || [],
            componentsCount: bom.components?.length || 0
          });
        }
      } catch (err) {
        if (isSapConnectionDrop(err)) {
          // Connection drop: mark current item failed, mark all remaining NOT_PROCESSED and abort job
          job.failedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'FAILED',
            message: `SAP connection dropped: ${err.message}`,
            discrepancies: [],
            componentsCount: bom.components?.length || 0
          });

          for (let k = i + 1; k < boms.length; k++) {
            job.results.push({
              sequenceNum: boms[k].sequenceNum,
              material: boms[k].material,
              plant: boms[k].plant,
              bomUsage: boms[k].bomUsage,
              alternativeBom: boms[k].alternativeBom,
              bomNumber: '-',
              status: 'NOT_PROCESSED',
              message: 'Skipped: SAP connection dropped during job execution.',
              discrepancies: [],
              componentsCount: boms[k].components?.length || 0
            });
          }
          job.notProcessedCount = boms.length - (i + 1);
          job.status = 'STOPPED_ON_CONNECTION_DROP';
          job.error = `SAP connection dropped: ${err.message}`;
          job.processed = boms.length;
          break;
        } else {
          // Regular item failure: record failure, DO NOT retry, continue with next BOM
          job.failedCount++;
          job.results.push({
            sequenceNum: bom.sequenceNum,
            material: bom.material,
            plant: bom.plant,
            bomUsage: bom.bomUsage,
            alternativeBom: bom.alternativeBom,
            bomNumber: '-',
            status: 'FAILED',
            message: err.message || 'Unexpected error creating BOM in SAP.',
            discrepancies: [],
            componentsCount: bom.components?.length || 0
          });
        }
      }

      job.processed = i + 1;
      job.updatedAt = new Date().toISOString();
    }

    if (job.status === 'RUNNING') {
      job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    }
  }

  async runCopyValidate(job, items, server) {
    const allocatedByTargetKey = new Map();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (job.cancelRequested) {
        for (let k = i; k < items.length; k++) {
          job.results.push({
            id: items[k].id || k + 1,
            sourceMaterial: items[k].sourceMaterial,
            sourcePlant: items[k].sourcePlant,
            targetMaterial: items[k].targetMaterial,
            targetPlant: items[k].targetPlant,
            status: 'NOT_PROCESSED',
            message: 'Cancelled by user.'
          });
        }
        job.notProcessedCount = items.length - i;
        job.status = 'CANCELLED';
        break;
      }

      job.currentBom = {
        index: i + 1,
        total: items.length,
        sourceMaterial: item.sourceMaterial,
        targetMaterial: item.targetMaterial || item.sourceMaterial,
        plant: item.targetPlant || item.sourcePlant
      };

      try {
        const valRes = await rfcBatchValidateBoms([item], { server, allocatedByTargetKey });
        const row = valRes.results && valRes.results[0]
          ? valRes.results[0]
          : { id: item.id || i + 1, status: 'ERROR', message: 'Validation failed.' };

        job.results.push(row);
        if (row.status === 'VALID' || row.status === 'WARNING') job.successCount++;
        else job.failedCount++;
      } catch (err) {
        if (isSapConnectionDrop(err)) {
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: item.sourceMaterial,
            sourcePlant: item.sourcePlant,
            targetMaterial: item.targetMaterial,
            targetPlant: item.targetPlant,
            status: 'ERROR',
            message: `SAP connection dropped: ${err.message}`
          });
          job.failedCount++;

          for (let k = i + 1; k < items.length; k++) {
            job.results.push({
              id: items[k].id || k + 1,
              sourceMaterial: items[k].sourceMaterial,
              sourcePlant: items[k].sourcePlant,
              targetMaterial: items[k].targetMaterial,
              targetPlant: items[k].targetPlant,
              status: 'NOT_PROCESSED',
              message: 'Skipped: SAP connection dropped.'
            });
          }
          job.notProcessedCount = items.length - (i + 1);
          job.status = 'STOPPED_ON_CONNECTION_DROP';
          job.error = err.message;
          job.processed = items.length;
          break;
        } else {
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: item.sourceMaterial,
            sourcePlant: item.sourcePlant,
            targetMaterial: item.targetMaterial,
            targetPlant: item.targetPlant,
            status: 'ERROR',
            message: err.message
          });
          job.failedCount++;
        }
      }

      job.processed = i + 1;
      job.updatedAt = new Date().toISOString();
    }

    if (job.status === 'RUNNING') {
      job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    }
  }

  async runCopyBulk(job, items, server, user) {
    const { copyHierarchy = true, skipErrors = true } = job.options || {};
    const allocatedByTargetKey = new Map();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (job.cancelRequested) {
        for (let k = i; k < items.length; k++) {
          job.results.push({
            id: items[k].id || k + 1,
            sourceMaterial: items[k].sourceMaterial,
            sourcePlant: items[k].sourcePlant,
            targetMaterial: items[k].targetMaterial || items[k].sourceMaterial,
            targetPlant: items[k].targetPlant,
            status: 'NOT_PROCESSED',
            message: 'Cancelled by user before copy.'
          });
        }
        job.notProcessedCount = items.length - i;
        job.status = 'CANCELLED';
        break;
      }

      job.currentBom = {
        index: i + 1,
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

      // Resolve source alternative if blank
      let effectiveSrcAlt = srcAlt;
      if (!effectiveSrcAlt) {
        const srcAltRes = await resolveSourceAlternativeForCopy({
          sourceMaterial: srcMat,
          sourcePlant: srcPlant,
          sourceUsage: srcUsage,
          sourceAlternative: srcAlt,
          server
        });
        if (srcAltRes.sourceAlternative) {
          effectiveSrcAlt = srcAltRes.sourceAlternative;
        }
      }

      // Resolve target alternative using shared function
      const targetKey = `${tgtMat}|${tgtPlant}|${tgtUsage}`;
      const allocatedList = allocatedByTargetKey.get(targetKey) || [];

      const tgtAltRes = await resolveTargetAlternativeForCopy({
        targetMaterial: tgtMat,
        targetPlant: tgtPlant,
        targetUsage: tgtUsage,
        targetAlternative: tgtAlt,
        allocatedAlternatives: allocatedList,
        server
      });

      const resolvedNum = parseInt(tgtAltRes.targetAlternative, 10);
      allocatedByTargetKey.set(targetKey, [...allocatedList, resolvedNum]);
      const resolvedTgtAlt = tgtAltRes.targetAlternative;

      // If an explicitly specified target alternative already exists, block it
      if (tgtAltRes.exists) {
        job.failedCount++;
        job.results.push({
          id: item.id || i + 1,
          sourceMaterial: srcMat,
          sourcePlant: srcPlant,
          targetMaterial: tgtMat,
          targetPlant: tgtPlant,
          targetAltBom: resolvedTgtAlt,
          bomNumber: '-',
          status: 'FAILED',
          message: `Cannot copy: Alternative ${parseInt(resolvedTgtAlt, 10)} already exists in BOM ${tgtMat}/${tgtPlant}/${tgtUsage}`
        });
        job.processed = i + 1;
        job.updatedAt = new Date().toISOString();
        if (!skipErrors) break;
        continue;
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
          server
        });

        if (copyRes.success) {
          job.successCount++;
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            targetAltBom: copyRes.alternativeBom || resolvedTgtAlt,
            bomNumber: copyRes.bomNumber || '',
            status: 'SUCCESS',
            message: copyRes.message || 'BOM copied successfully in SAP.',
            totalLevels: copyRes.totalLevels || 1,
            totalBoms: copyRes.totalBoms || 1
          });
        } else {
          job.failedCount++;
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            targetAltBom: resolvedTgtAlt,
            bomNumber: '-',
            status: 'FAILED',
            message: copyRes.message || 'BOM copy rejected by SAP.'
          });
        }
      } catch (err) {
        if (isSapConnectionDrop(err)) {
          job.failedCount++;
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: srcMat,
            sourcePlant: srcPlant,
            targetMaterial: tgtMat,
            targetPlant: tgtPlant,
            targetAltBom: resolvedTgtAlt,
            bomNumber: '-',
            status: 'FAILED',
            message: `SAP connection dropped: ${err.message}`
          });

          for (let k = i + 1; k < items.length; k++) {
            job.results.push({
              id: items[k].id || k + 1,
              sourceMaterial: items[k].sourceMaterial,
              sourcePlant: items[k].sourcePlant,
              targetMaterial: items[k].targetMaterial || items[k].sourceMaterial,
              targetPlant: items[k].targetPlant,
              bomNumber: '-',
              status: 'NOT_PROCESSED',
              message: 'Skipped: SAP connection dropped.'
            });
          }
          job.notProcessedCount = items.length - (i + 1);
          job.status = 'STOPPED_ON_CONNECTION_DROP';
          job.error = `SAP connection dropped: ${err.message}`;
          job.processed = items.length;
          break;
        } else {
          job.failedCount++;
          job.results.push({
            id: item.id || i + 1,
            sourceMaterial: item.sourceMaterial,
            sourcePlant: item.sourcePlant,
            targetMaterial: item.targetMaterial || item.sourceMaterial,
            targetPlant: item.targetPlant,
            bomNumber: '-',
            status: 'FAILED',
            message: err.message || 'BOM copy failed in SAP.'
          });
        }
      }

      job.processed = i + 1;
      job.updatedAt = new Date().toISOString();
    }

    if (job.status === 'RUNNING') {
      job.status = job.failedCount > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
    }
  }
}

export const bomJobManager = new BomJobManager();
