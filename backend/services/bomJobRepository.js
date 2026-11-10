import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { liveSupabase } from './supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JOB_SUMMARIES_FILE = path.join(__dirname, '..', 'mock', 'bomJobSummaries.json');

class BomJobRepository {
  constructor() {
    this._writeMutex = Promise.resolve();
    this.tableChecked = false;
    this.tableAvailable = null; // null = unverified, true = available, false = fallback
    this.warnedFallback = false;
  }

  async _checkTableAvailability() {
    if (this.tableAvailable !== null) {
      return this.tableAvailable;
    }

    if (!liveSupabase) {
      this.tableAvailable = false;
      this._logFallbackOnce('Supabase client not configured');
      return false;
    }

    try {
      const { error } = await liveSupabase.from('bom_jobs').select('id').limit(1);
      if (error) {
        this.tableAvailable = false;
        this._logFallbackOnce(error.message);
        return false;
      }
      this.tableAvailable = true;
      return true;
    } catch (err) {
      this.tableAvailable = false;
      this._logFallbackOnce(err.message);
      return false;
    }
  }

  _logFallbackOnce(reason) {
    if (!this.warnedFallback) {
      this.warnedFallback = true;
      console.warn(`[bomJobRepository] Table 'bom_jobs' not available (${reason}), falling back to local atomic file store.`);
    }
  }

  // Map application job object to table row format
  _toTableRow(job) {
    if (!job) return null;
    const now = new Date().toISOString();
    return {
      id: job.jobId || job.id,
      user_id: job.userId || job.user_id || null,
      server_id: job.serverId || job.server_id || null,
      action: this._normalizeAction(job.type || job.action),
      status: String(job.status || 'queued').toLowerCase(),
      total_rows: Number(job.total || job.total_rows || 0),
      processed_rows: Number(job.processed || job.processed_rows || 0),
      success_count: Number(job.successCount || job.success_count || 0),
      error_count: Number(job.failedCount || job.error_count || 0),
      input: job.input || {
        fileName: job.fileName,
        options: job.options,
        total: job.total
      },
      results: job.results || [],
      error: job.error || null,
      created_at: job.createdAt || job.created_at || now,
      started_at: job.startedAt || job.started_at || null,
      finished_at: job.completedAt || job.finished_at || null,
      updated_at: job.updatedAt || job.updated_at || now
    };
  }

  _normalizeAction(typeOrAction) {
    const act = String(typeOrAction || '').toLowerCase();
    if (act.includes('copy')) return 'copy';
    if (act.includes('create')) return 'create';
    if (act.includes('delete')) return 'delete';
    return 'validate';
  }

  _normalizeJobFromRow(row) {
    if (!row) return null;
    const isFinished = ['completed', 'failed', 'cancelled', 'interrupted'].includes(row.status);
    return {
      jobId: row.id,
      id: row.id,
      type: row.action,
      action: row.action,
      userId: row.user_id,
      user_id: row.user_id,
      serverId: row.server_id,
      server_id: row.server_id,
      status: row.status ? row.status.toUpperCase() : 'QUEUED',
      total: row.total_rows || 0,
      total_rows: row.total_rows || 0,
      processed: row.processed_rows || 0,
      processed_rows: row.processed_rows || 0,
      successCount: row.success_count || 0,
      success_count: row.success_count || 0,
      failedCount: row.error_count || 0,
      error_count: row.error_count || 0,
      skippedCount: 0,
      notProcessedCount: Math.max(0, (row.total_rows || 0) - (row.processed_rows || 0)),
      results: row.results || [],
      input: row.input || {},
      error: row.error || null,
      message: row.error || null,
      createdAt: row.created_at,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
      completedAt: row.finished_at
    };
  }

  // --- FILE STORE IMPLEMENTATION ---

  _loadFileJobs() {
    try {
      if (fs.existsSync(JOB_SUMMARIES_FILE)) {
        const raw = fs.readFileSync(JOB_SUMMARIES_FILE, 'utf-8');
        if (!raw || !raw.trim()) {
          const corruptBackup = `${JOB_SUMMARIES_FILE}.corrupt.${Date.now()}`;
          try { fs.renameSync(JOB_SUMMARIES_FILE, corruptBackup); } catch {}
          console.warn(`[bomJobManager] Empty job summaries file backed up to ${corruptBackup} and reset.`);
          return [];
        }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (parseErr) {
          const corruptBackup = `${JOB_SUMMARIES_FILE}.corrupt.${Date.now()}`;
          try { fs.renameSync(JOB_SUMMARIES_FILE, corruptBackup); } catch {}
          console.warn(`[bomJobManager] Corrupted JSON in job summaries backed up to ${corruptBackup}: ${parseErr.message}`);
          return [];
        }

        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[bomJobRepository] Error reading file store:', err.message);
    }
    return [];
  }

  _saveFileJobsSync(jobsList) {
    try {
      const dir = path.dirname(JOB_SUMMARIES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const content = JSON.stringify(jobsList, null, 2);
      fs.writeFileSync(JOB_SUMMARIES_FILE, content, 'utf-8');
    } catch (err) {
      console.error('[bomJobRepository] Error in _saveFileJobsSync:', err.message);
    }
  }

  async _saveFileJobs(jobsList) {
    this._writeMutex = this._writeMutex.then(async () => {
      let tempFile = null;
      try {
        const dir = path.dirname(JOB_SUMMARIES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const content = JSON.stringify(jobsList, null, 2);
        tempFile = path.join(
          dir,
          `.bomJobSummaries.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`
        );
        fs.writeFileSync(tempFile, content, 'utf-8');

        let renamed = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            fs.renameSync(tempFile, JOB_SUMMARIES_FILE);
            renamed = true;
            break;
          } catch (renameErr) {
            if (attempt === 4) throw renameErr;
            await new Promise((r) => setTimeout(r, 25));
          }
        }
      } catch (err) {
        console.error('[bomJobRepository] Failed to save file store:', err.message);
      } finally {
        if (tempFile && fs.existsSync(tempFile)) {
          try { fs.unlinkSync(tempFile); } catch {}
        }
      }
    });

    return this._writeMutex;
  }

  // --- PUBLIC REPOSITORY METHODS ---

  async saveJob(job) {
    const isDb = await this._checkTableAvailability();
    const row = this._toTableRow(job);

    if (isDb) {
      try {
        const { error } = await liveSupabase
          .from('bom_jobs')
          .upsert(row, { onConflict: 'id' });
        if (error) throw error;
        return this._normalizeJobFromRow(row);
      } catch (err) {
        console.warn('[bomJobRepository] DB upsert failed, using file fallback:', err.message);
        this.tableAvailable = false;
      }
    }

    // File Store Fallback
    const list = this._loadFileJobs();
    const existingIdx = list.findIndex((j) => (j.jobId || j.id) === (job.jobId || job.id));
    const cleanJob = {
      ...job,
      jobId: job.jobId || job.id,
      id: job.jobId || job.id,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      list[existingIdx] = cleanJob;
    } else {
      list.push(cleanJob);
    }

    await this._saveFileJobs(list);
    return cleanJob;
  }

  async getJob(jobId) {
    if (!jobId) return null;
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        const { data, error } = await liveSupabase
          .from('bom_jobs')
          .select('*')
          .eq('id', jobId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        if (data) return this._normalizeJobFromRow(data);
      } catch (err) {
        console.warn('[bomJobRepository] DB getJob failed, trying file:', err.message);
      }
    }

    // File Store
    const list = this._loadFileJobs();
    const found = list.find((j) => (j.jobId || j.id) === jobId);
    return found || null;
  }

  async listJobs({ userId, serverId, status } = {}) {
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        let query = liveSupabase.from('bom_jobs').select('*');
        if (userId) query = query.eq('user_id', userId);
        if (serverId) query = query.eq('server_id', serverId);
        if (status) query = query.eq('status', String(status).toLowerCase());
        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map((r) => this._normalizeJobFromRow(r));
      } catch (err) {
        console.warn('[bomJobRepository] DB listJobs failed, reading file:', err.message);
      }
    }

    // File Store
    let list = this._loadFileJobs();
    if (userId) {
      list = list.filter((j) => j.userId === userId || j.userEmail === userId);
    }
    if (serverId) {
      list = list.filter((j) => j.serverId === serverId || j.serverName === serverId);
    }
    if (status) {
      list = list.filter((j) => String(j.status).toUpperCase() === String(status).toUpperCase());
    }
    return list;
  }

  async countRunningJobsForUser(userId) {
    if (!userId) return 0;
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        const { count, error } = await liveSupabase
          .from('bom_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'running');
        if (!error && typeof count === 'number') return count;
      } catch (_) {}
    }

    const list = this._loadFileJobs();
    return list.filter(
      (j) => (j.userId === userId || j.userEmail === userId) && String(j.status).toUpperCase() === 'RUNNING'
    ).length;
  }

  async countRunningJobsForServer(serverId) {
    if (!serverId) return 0;
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        const { count, error } = await liveSupabase
          .from('bom_jobs')
          .select('id', { count: 'exact', head: true })
          .eq('server_id', serverId)
          .eq('status', 'running');
        if (!error && typeof count === 'number') return count;
      } catch (_) {}
    }

    const list = this._loadFileJobs();
    return list.filter(
      (j) => (j.serverId === serverId || j.serverName === serverId) && String(j.status).toUpperCase() === 'RUNNING'
    ).length;
  }

  async getOldestQueuedJobForServer(serverId) {
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        let q = liveSupabase
          .from('bom_jobs')
          .select('*')
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(1);
        if (serverId) q = q.eq('server_id', serverId);

        const { data, error } = await q;
        if (!error && data && data.length > 0) {
          return this._normalizeJobFromRow(data[0]);
        }
      } catch (_) {}
    }

    const list = this._loadFileJobs();
    const queued = list
      .filter((j) => {
        const matchServer = serverId ? j.serverId === serverId || j.serverName === serverId : true;
        return matchServer && String(j.status).toUpperCase() === 'QUEUED';
      })
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

    return queued[0] || null;
  }

  async markRunningJobsInterrupted() {
    const isDb = await this._checkTableAvailability();
    const message = 'Job was interrupted by a server restart. Execution was stopped and will not resume automatically.';
    const now = new Date().toISOString();

    if (isDb) {
      try {
        const { error } = await liveSupabase
          .from('bom_jobs')
          .update({
            status: 'interrupted',
            error: message,
            finished_at: now,
            updated_at: now
          })
          .eq('status', 'running');
        if (error) throw error;
      } catch (err) {
        console.warn('[bomJobRepository] DB markRunningJobsInterrupted error:', err.message);
      }
    }

    // Always ensure file store is also updated
    const list = this._loadFileJobs();
    let updated = false;
    for (const job of list) {
      if (String(job.status).toUpperCase() === 'RUNNING') {
        job.status = 'INTERRUPTED';
        job.message = message;
        job.error = message;
        job.completedAt = now;
        job.updatedAt = now;
        updated = true;
      }
    }
    if (updated) {
      await this._saveFileJobs(list);
    }
  }

  async cleanupOldJobs(retentionDays = 30) {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const isDb = await this._checkTableAvailability();

    if (isDb) {
      try {
        await liveSupabase.from('bom_jobs').delete().lt('created_at', cutoffDate);
      } catch (err) {
        console.warn('[bomJobRepository] DB cleanup error:', err.message);
      }
    }

    const list = this._loadFileJobs();
    const filtered = list.filter((j) => {
      const created = j.createdAt || j.created_at;
      if (!created) return true;
      return new Date(created).toISOString() >= cutoffDate;
    });

    if (filtered.length !== list.length) {
      await this._saveFileJobs(filtered);
    }
  }
}

export const bomJobRepository = new BomJobRepository();
