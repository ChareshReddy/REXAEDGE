/**
 * Performance and RFC call timing tracker for Bulk BOM operations.
 * Retains timeline and call telemetry for the last 50 jobs in memory.
 */

class JobPerformanceTracker {
  constructor() {
    this.maxTrackedJobs = 50;
    // Map of jobId -> timeline record
    this.timelines = new Map();
  }

  isLoggingEnabled() {
    return process.env.BOM_PERF_LOG === '1' || process.env.NODE_ENV === 'development';
  }

  startJob(jobId, { type = 'unknown', rowCount = 1, serverId = null } = {}) {
    if (!jobId) return;

    // Maintain max 50 entries in ring buffer
    if (this.timelines.size >= this.maxTrackedJobs) {
      const oldestKey = this.timelines.keys().next().value;
      if (oldestKey) this.timelines.delete(oldestKey);
    }

    const record = {
      jobId,
      type,
      rowCount: Math.max(1, rowCount),
      serverId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      totalCalls: 0,
      totalTimeMs: 0,
      callsPerRow: 0,
      calls: [],
      slowestCalls: []
    };

    this.timelines.set(jobId, record);
    if (this.isLoggingEnabled()) {
      console.log(`[BOM_PERF] [Job ${jobId}] Started ${type} tracking for ${rowCount} rows`);
    }
  }

  recordCall(jobId, { functionName = 'RFC_CALL', queueWaitMs = 0, durationMs = 0, rowsInvolved = 1, timestamp = new Date().toISOString(), details = null } = {}) {
    if (!jobId) return;
    let record = this.timelines.get(jobId);
    if (!record) {
      this.startJob(jobId, { rowCount: rowsInvolved });
      record = this.timelines.get(jobId);
    }

    const callEntry = {
      functionName,
      queueWaitMs: Math.max(0, queueWaitMs),
      durationMs: Math.max(0, durationMs),
      rowsInvolved: Math.max(1, rowsInvolved),
      timestamp,
      details
    };

    record.calls.push(callEntry);
    record.totalCalls++;
    record.totalTimeMs += callEntry.durationMs;
    record.callsPerRow = Number((record.totalCalls / record.rowCount).toFixed(2));

    if (this.isLoggingEnabled()) {
      console.log(
        `[BOM_PERF] [Job ${jobId}] RFC ${functionName}: wait=${callEntry.queueWaitMs}ms, dur=${callEntry.durationMs}ms, rows=${callEntry.rowsInvolved}`
      );
    }
  }

  finishJob(jobId) {
    if (!jobId) return null;
    const record = this.timelines.get(jobId);
    if (!record) return null;

    record.finishedAt = new Date().toISOString();
    record.callsPerRow = Number((record.totalCalls / record.rowCount).toFixed(2));

    // Slowest 5 calls
    record.slowestCalls = [...record.calls]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 5);

    if (this.isLoggingEnabled()) {
      const slowestStr = record.slowestCalls
        .map((c) => `${c.functionName} (${c.durationMs}ms)`)
        .join(', ');
      console.log(
        `[BOM_PERF] [Job ${jobId}] Validation finished: totalCalls=${record.totalCalls}, totalTime=${record.totalTimeMs}ms, callsPerRow=${record.callsPerRow}, slowest 5: [${slowestStr}]`
      );
    }

    return record;
  }

  getTimeline(jobId) {
    if (!jobId) return null;
    return this.timelines.get(jobId) || null;
  }

  listRecentTimelines() {
    return Array.from(this.timelines.values()).map((t) => ({
      jobId: t.jobId,
      type: t.type,
      rowCount: t.rowCount,
      startedAt: t.startedAt,
      finishedAt: t.finishedAt,
      totalCalls: t.totalCalls,
      totalTimeMs: t.totalTimeMs,
      callsPerRow: t.callsPerRow,
      slowestCalls: t.slowestCalls
    }));
  }

  clear() {
    this.timelines.clear();
  }
}

export const jobPerformanceTracker = new JobPerformanceTracker();
