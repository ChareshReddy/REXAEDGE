import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  MinusCircle,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { cleanDiagnosticMessage } from './BlockedReasonsList';
import { getBomJob, cancelBomJob } from '../services/api';
import BulkLayout, { BulkWorkflowSteps as ModernBulkWorkflowSteps } from './bulk/BulkLayout';
import BulkUploadCard from './bulk/BulkUploadCard';
import BulkStatTiles from './bulk/BulkStatTiles';

export { BulkLayout, BulkUploadCard, BulkStatTiles };

/**
 * Shared layout wrapper for bulk flows.
 * Ensures a single shared container width aligned with page breadcrumbs and title,
 * fills available width with max-width 1440px, centered with margin: 0 auto.
 */
export function BulkFlowContainer({ children, className = '', style = {} }) {
  return (
    <div
      className={`rx-bulk-flow-container sap-bulk-flow-container ${className}`.trim()}
      style={{
        width: '100%',
        maxWidth: 1440,
        margin: '0 auto',
        boxSizing: 'border-box',
        paddingLeft: 'var(--page-gutter, 32px)',
        paddingRight: 'var(--page-gutter, 32px)',
        paddingTop: 20,
        paddingBottom: 64,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 20,
        ...style
      }}
    >
      {children}
    </div>
  );
}

/**
 * Standard column specifications for Bulk Upload helper chips
 */
export const COPY_BULK_COLUMNS = [
  { label: 'Source Material', required: true },
  { label: 'Source Plant', required: true },
  { label: 'Target Plant', required: true },
  { label: 'Target Alternative', required: true },
  { label: 'Source BOM Usage', default: '1' },
  { label: 'Source Alternative', default: '1' },
  { label: 'Target Material', default: 'Source' },
  { label: 'Target BOM Usage', default: '1' }
];

export const CREATE_BULK_COLUMNS = [
  { label: 'Material', required: true },
  { label: 'Plant', required: true },
  { label: 'Component', required: true },
  { label: 'Quantity', required: true },
  { label: 'BOM Usage', default: '1' },
  { label: 'Alternative BOM', default: '01' },
  { label: 'Item Category', default: 'L' },
  { label: 'Valid From', default: 'Today' },
  { label: 'Base Qty', default: '1' },
  { label: 'BOM Status', default: '01' }
];

/**
 * Lightweight columns helper chips displayed below the dropzone
 */
export function BulkColumnsGuide({ columns = [], title = 'Required Excel Columns:', style = {} }) {
  if (!columns || columns.length === 0) return null;
  return (
    <div className="rx-bulk-columns-guide sap-bulk-columns-guide" style={{ marginTop: 14, ...style }}>
      <div
        style={{
          fontSize: 'var(--font-size-12, 12px)',
          fontWeight: 600,
          color: 'var(--color-text-secondary, #4A5F77)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-muted, #7A8CA3)' }}>
          (* required)
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {columns.map((col, idx) => (
          <span
            key={idx}
            className={`sap-col-chip ${col.required ? 'required' : 'optional'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '11.5px',
              padding: '3px 9px',
              borderRadius: 'var(--radius-full, 9999px)',
              backgroundColor: col.required ? 'var(--color-blue-50, #EEF4F9)' : 'var(--color-surface-subtle, #F8FAFC)',
              color: col.required ? 'var(--color-blue-600, #02579A)' : 'var(--color-text-secondary, #4A5F77)',
              border: col.required ? '1px solid var(--color-blue-200, #B3CDE0)' : '1px solid var(--color-border, #D9E2EC)',
              fontWeight: col.required ? 600 : 500
            }}
          >
            {col.required && <span style={{ color: 'var(--color-danger, #B42318)', fontWeight: 700 }}>*</span>}
            <span>{col.label}</span>
            {col.default && (
              <span style={{ fontSize: '10.5px', color: 'var(--color-text-muted, #7A8CA3)', opacity: 0.85 }}>
                (def: {col.default})
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Shared 3-Step Workflow Indicator
 * Full content width, connected by lines, filled blue-600 active step, never black.
 */
export function BulkWorkflowSteps({ activeStep = 1, style = {}, mode = 'create', type }) {
  return (
    <ModernBulkWorkflowSteps
      activeStep={activeStep}
      mode={mode}
      type={type}
      style={style}
    />
  );
}

/**
 * Shared Slim File Info Bar (shown in Step 2 preview)
 */
export function BulkFileInfoBar({
  fileName = '',
  countText = '',
  isLocked = false,
  onDownloadTemplate,
  onChangeFile,
  style = {}
}) {
  return (
    <div
      className="rx-bulk-file-info-bar sap-bulk-file-info-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        padding: '10px 16px',
        backgroundColor: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-border, #D9E2EC)',
        borderRadius: 'var(--radius-md, 8px)',
        fontSize: 'var(--font-size-13, 13px)',
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}>
        <FileSpreadsheet size={16} color="var(--color-blue-600, #02579A)" style={{ flexShrink: 0 }} />
        <span
          style={{
            fontWeight: 600,
            color: 'var(--color-navy-900, #00204E)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
          title={fileName}
        >
          {fileName}
        </span>
        {countText && (
          <>
            <span style={{ color: 'var(--color-text-muted, #7A8CA3)' }}>·</span>
            <span style={{ color: 'var(--color-text-secondary, #4A5F77)', whiteSpace: 'nowrap' }}>
              {countText}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onDownloadTemplate && (
          <button
            type="button"
            className="rx-btn rx-btn-secondary rx-btn-sm"
            onClick={onDownloadTemplate}
            disabled={isLocked}
            title="Download Template"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--font-size-12, 12px)',
              height: 'var(--size-button-sm-height, 32px)',
              padding: '0 12px',
              borderRadius: 'var(--radius-md, 8px)'
            }}
          >
            <Download size={13} />
            <span>Template</span>
          </button>
        )}

        {!isLocked && onChangeFile && (
          <button
            type="button"
            className="rx-btn rx-btn-secondary rx-btn-sm"
            onClick={onChangeFile}
            title="Change File"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 'var(--font-size-12, 12px)',
              height: 'var(--size-button-sm-height, 32px)',
              padding: '0 12px',
              borderRadius: 'var(--radius-md, 8px)'
            }}
          >
            <RefreshCw size={13} />
            <span>Change File</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Shared Active Job Progress Card
 */
export function BulkJobProgressCard({
  isValidating = false,
  isExecuting = false,
  activeJobId = null,
  jobProgress = {},
  jobCurrentBom = null,
  isCancelling = false,
  onCancelJob,
  validationLabel = 'Validating data in SAP',
  executionLabel = 'Creating BOMs in SAP',
  jobStatus = null,
  watchdogWarning = '',
  queuedReason = '',
  style = {}
}) {
  const [elapsedSec, setElapsedSec] = useState(0);

  const isQueued = jobStatus === 'QUEUED' || jobStatus === 'queued';
  const isFinalState = [
    'COMPLETED',
    'COMPLETED_WITH_ERRORS',
    'CANCELLED',
    'STOPPED_ON_CONNECTION_DROP',
    'FAILED',
    'INTERRUPTED'
  ].includes(jobStatus);

  useEffect(() => {
    if ((!isValidating && !isExecuting) || isFinalState) return;
    const startMs = jobProgress.startedAt ? new Date(jobProgress.startedAt).getTime() : Date.now();
    const update = () => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isValidating, isExecuting, isFinalState, jobProgress.startedAt]);

  if (!isValidating && !isExecuting) return null;

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const rawPercent = typeof jobProgress.percent === 'number'
    ? jobProgress.percent
    : (jobProgress.totalSteps > 0
        ? Math.round((jobProgress.completedSteps / jobProgress.totalSteps) * 100)
        : (jobProgress.total > 0 ? Math.round((jobProgress.current / jobProgress.total) * 100) : 0));

  const displayPercent = isQueued
    ? 100
    : isFinalState
    ? 100
    : Math.min(99, Math.max(3, rawPercent));

  const titleText = isQueued
    ? 'Waiting for other jobs to finish...'
    : isValidating
    ? `${validationLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`
    : `${executionLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`;

  const stepLabel = jobProgress.currentStep || (
    jobCurrentBom
      ? `Current BOM: ${jobCurrentBom.material || jobCurrentBom.sourceMaterial || ''} / Plant ${
          jobCurrentBom.plant || ''
        }${jobCurrentBom.alternativeBom ? ` (Alt ${jobCurrentBom.alternativeBom})` : ''}`
      : 'Connecting to SAP...'
  );

  return (
    <div
      className="rx-card rx-bulk-progress-card sap-card"
      style={{
        padding: '16px 20px',
        marginBottom: 16,
        width: '100%',
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        borderLeft: isQueued ? '4px solid var(--color-blue-400, #6699B8)' : '4px solid var(--color-blue-600, #02579A)',
        borderTop: '1px solid var(--color-border, #D9E2EC)',
        borderRight: '1px solid var(--color-border, #D9E2EC)',
        borderBottom: '1px solid var(--color-border, #D9E2EC)',
        borderRadius: 'var(--radius-lg, 12px)',
        backgroundColor: 'var(--color-surface, #FFFFFF)',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isFinalState && (
            <Loader2
              size={18}
              className="sap-spin"
              style={{ color: isQueued ? 'var(--color-blue-400, #6699B8)' : 'var(--color-blue-600, #02579A)' }}
            />
          )}
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-14, 14px)', color: 'var(--color-navy-900, #00204E)' }}>
            {titleText}
          </span>
          <span
            className="rx-elapsed-ticker"
            style={{
              fontSize: 'var(--font-size-12, 12px)',
              color: 'var(--color-text-secondary, #4A5F77)',
              fontFamily: 'var(--font-family-mono, monospace)',
              backgroundColor: 'var(--color-blue-50, #EEF4F9)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm, 4px)'
            }}
          >
            Elapsed: {formatElapsed(elapsedSec)}
          </span>
        </div>
        {activeJobId && onCancelJob && !isFinalState && (
          <button
            type="button"
            onClick={onCancelJob}
            disabled={isCancelling}
            className="rx-btn rx-btn-secondary rx-btn-sm"
            style={{
              height: 'var(--size-button-sm-height, 32px)',
              padding: '0 12px',
              borderRadius: 'var(--radius-md, 8px)'
            }}
          >
            {isCancelling ? 'Stopping after current BOM...' : 'Cancel'}
          </button>
        )}
      </div>

      {/* Progress bar with percentage and step label */}
      <div
        style={{
          width: '100%',
          height: 8,
          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 10
        }}
      >
        <div
          className="rx-progress-bar-fill"
          style={{
            width: isQueued ? '100%' : `${displayPercent}%`,
            height: '100%',
            backgroundColor: isQueued ? 'var(--color-blue-400, #6699B8)' : 'var(--color-blue-600, #02579A)',
            transition: 'width 0.4s ease-out',
            opacity: isQueued ? 0.35 : 1
          }}
        />
      </div>

      {/* Status Info & Counts */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 'var(--font-size-12, 12px)',
          color: 'var(--color-text-secondary, #4A5F77)',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        <span>
          {isQueued
            ? (queuedReason || 'Waiting for other jobs to finish before processing your batch.')
            : stepLabel}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {jobProgress.successCount > 0 && (
            <span style={{ color: 'var(--color-success, #15803D)', fontWeight: 600 }}>
              {isValidating ? 'Ready' : 'Created'}: {jobProgress.successCount}
            </span>
          )}
          {jobProgress.failedCount > 0 && (
            <span style={{ color: 'var(--color-danger, #B42318)', fontWeight: 600 }}>
              Failed: {jobProgress.failedCount}
            </span>
          )}
          {jobProgress.skippedCount > 0 && (
            <span style={{ color: 'var(--color-text-secondary, #4A5F77)', fontWeight: 600 }}>
              Skipped: {jobProgress.skippedCount}
            </span>
          )}
          {jobProgress.notProcessedCount > 0 && (
            <span style={{ color: 'var(--color-blue-600, #02579A)', fontWeight: 600 }}>
              Not Processed: {jobProgress.notProcessedCount}
            </span>
          )}
        </div>
      </div>

      {/* Watchdog Warning */}
      {watchdogWarning && (
        <div
          className="rx-watchdog-warning"
          style={{
            marginTop: 10,
            paddingTop: 8,
            borderTop: '1px dashed var(--color-border, #D9E2EC)',
            fontSize: 'var(--font-size-12, 12px)',
            color: 'var(--color-text-secondary, #4A5F77)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontWeight: 500
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--color-warning, #d97706)' }} />
          <span>{watchdogWarning}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Shared Background Job Polling Hook
 */
export function useBulkBomJobPolling() {
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJobType, setActiveJobType] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [queuedReason, setQueuedReason] = useState('');
  const [watchdogWarning, setWatchdogWarning] = useState('');
  const [jobError, setJobError] = useState('');
  const lastProgressRef = useRef({ processed: 0, lastChangedAt: Date.now(), startedAt: Date.now() });
  const [jobCurrentBom, setJobCurrentBom] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [jobProgress, setJobProgress] = useState({
    current: 0,
    total: 0,
    percent: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    notProcessedCount: 0
  });

  const pollIntervalRef = useRef(null);

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const resetJobState = useCallback(() => {
    clearPolling();
    setActiveJobId(null);
    setActiveJobType(null);
    setJobStatus(null);
    setQueuedReason('');
    setWatchdogWarning('');
    setJobError('');
    setJobCurrentBom(null);
    setIsCancelling(false);
    setJobProgress({
      current: 0,
      total: 0,
      percent: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      notProcessedCount: 0
    });
  }, [clearPolling]);

  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  const startJobPolling = useCallback(
    (jobId, type, onFinish, onUpdate) => {
      clearPolling();
      setActiveJobId(jobId);
      setActiveJobType(type);
      setJobStatus('RUNNING');
      setQueuedReason('');
      setWatchdogWarning('');
      setJobError('');
      setIsCancelling(false);
      lastProgressRef.current = { processed: 0, lastChangedAt: Date.now(), startedAt: Date.now() };

      pollIntervalRef.current = setInterval(async () => {
        try {
          const now = Date.now();
          // 10-minute timeout watchdog
          if (now - lastProgressRef.current.startedAt >= 600000) {
            clearPolling();
            setActiveJobId(null);
            setIsCancelling(false);
            setWatchdogWarning('');
            setJobError('Operation timed out after 10 minutes. Please check your SAP connection or retry.');
            if (onFinish) {
              onFinish({ status: 'TIMEOUT', error: 'Operation timed out after 10 minutes.' }, type);
            }
            return;
          }

          let data;
          try {
            data = await getBomJob(jobId);
          } catch (apiErr) {
            const status = apiErr.response?.status;
            const elapsed = now - (lastProgressRef.current?.startedAt || now);
            // Tolerate 404 for up to 10 seconds before declaring job not found
            if ((status === 404 || apiErr.message?.includes('not found')) && elapsed >= 10000) {
              clearPolling();
              setActiveJobId(null);
              setIsCancelling(false);
              setWatchdogWarning('');
              setJobError('Job not found. The job may have expired or been removed.');
              if (onFinish) {
                onFinish({ status: 'NOT_FOUND', error: 'Job not found.' }, type);
              }
              return;
            }
            if (status === 404) {
              // Retry on next tick during 10s grace period
              return;
            }
            console.warn('Job polling warning:', apiErr.message);
            return;
          }

          if (!data || !data.success || !data.job) {
            const elapsed = now - (lastProgressRef.current?.startedAt || now);
            if (elapsed >= 10000) {
              clearPolling();
              setActiveJobId(null);
              setIsCancelling(false);
              setWatchdogWarning('');
              setJobError('Job not found. The job may have expired or been removed.');
              if (onFinish) {
                onFinish({ status: 'NOT_FOUND', error: 'Job not found.' }, type);
              }
              return;
            }
            return;
          }

          const job = data.job;
          setJobStatus(job.status);
          if (job.queuedReason) {
            setQueuedReason(job.queuedReason);
          }

          // 90-second watchdog warning
          if (job.status === 'RUNNING') {
            if (job.processed !== lastProgressRef.current.processed) {
              lastProgressRef.current.processed = job.processed;
              lastProgressRef.current.lastChangedAt = now;
              setWatchdogWarning('');
            } else if (now - lastProgressRef.current.lastChangedAt >= 90000) {
              setWatchdogWarning('This is taking longer than expected');
            }
          }

          const rawPct = typeof job.progress_percent === 'number'
            ? job.progress_percent
            : (job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0);
          setJobProgress((prev) => ({
            current: job.processed,
            total: job.total,
            percent: Math.max(prev?.percent || 0, rawPct),
            currentStep: job.current_step,
            completedSteps: job.completed_steps ?? job.processed,
            totalSteps: job.total_steps ?? job.total,
            startedAt: job.startedAt || job.createdAt || lastProgressRef.current.startedAt,
            successCount: job.successCount,
            failedCount: job.failedCount,
            skippedCount: job.skippedCount || 0,
            notProcessedCount: job.notProcessedCount || 0
          }));

          if (job.currentBom) {
            setJobCurrentBom(job.currentBom);
          }

          if (onUpdate) {
            onUpdate(job);
          }

          const isFinished = [
            'COMPLETED',
            'COMPLETED_WITH_ERRORS',
            'CANCELLED',
            'STOPPED_ON_CONNECTION_DROP',
            'FAILED',
            'INTERRUPTED'
          ].includes(job.status);

          if (isFinished) {
            clearPolling();
            setActiveJobId(null);
            setIsCancelling(false);
            setWatchdogWarning('');
            if (job.status === 'INTERRUPTED') {
              setJobError(job.message || 'The job was interrupted. Please upload again.');
            } else if (job.status === 'FAILED') {
              setJobError(job.error || job.message || 'Job failed during execution.');
            }
            if (onFinish) {
              onFinish(job, type);
            }
          }
        } catch (err) {
          console.warn('Job polling warning:', err.message);
        }
      }, 1000);
    },
    [clearPolling]
  );

  const handleCancelJob = useCallback(async () => {
    if (!activeJobId || isCancelling) return;
    setIsCancelling(true);
    try {
      await cancelBomJob(activeJobId);
    } catch (err) {
      console.warn('Job cancel request error:', err.message);
    }
  }, [activeJobId, isCancelling]);

  return {
    activeJobId,
    activeJobType,
    jobStatus,
    queuedReason,
    watchdogWarning,
    jobError,
    jobProgress,
    jobCurrentBom,
    isCancelling,
    startJobPolling,
    handleCancelJob,
    resetJobState,
    setJobProgress
  };
}

/**
 * Normalizes validation status into one of: 'ready', 'error', 'skipped', 'not_validated'
 */
export function normalizeBomStatus(bom) {
  if (!bom) return 'not_validated';
  const statusStr = String(bom.status || '').trim().toLowerCase();

  if (
    statusStr === 'failed' ||
    statusStr === 'error' ||
    statusStr === 'invalid' ||
    (Array.isArray(bom.errors) && bom.errors.length > 0) ||
    (Array.isArray(bom.problems) && bom.problems.length > 0)
  ) {
    return 'error';
  }
  if (
    statusStr === 'ready' ||
    statusStr === 'valid' ||
    statusStr === 'success'
  ) {
    return 'ready';
  }
  if (
    statusStr.includes('skipped') ||
    statusStr.includes('exist') ||
    statusStr === 'not_processed' ||
    statusStr === 'warning'
  ) {
    return 'skipped';
  }
  if (statusStr === 'pending' || !statusStr) {
    return 'not_validated';
  }
  return 'not_validated';
}

/**
 * Single source of truth for BOM counts across All, Ready, Errors, and Skipped.
 */
export function getBomStatusCounts(boms = [], hasValidated = true) {
  let ready = 0;
  let errors = 0;
  let skipped = 0;
  let notValidated = 0;

  (boms || []).forEach((b) => {
    if (!hasValidated) {
      notValidated++;
      return;
    }
    const s = normalizeBomStatus(b);
    if (s === 'ready') ready++;
    else if (s === 'error') errors++;
    else if (s === 'skipped') skipped++;
    else notValidated++;
  });

  return {
    all: (boms || []).length,
    ready,
    errors,
    skipped,
    notValidated
  };
}

/**
 * Filter BOMs by normalized status tab and search term together.
 */
export function filterBoms(boms = [], { statusFilter = 'all', searchTerm = '' } = {}) {
  const term = String(searchTerm || '').trim().toLowerCase();

  return (boms || []).filter((bom) => {
    const norm = normalizeBomStatus(bom);
    if (statusFilter === 'ready' && norm !== 'ready') return false;
    if (statusFilter === 'errors' && norm !== 'error') return false;
    if (statusFilter === 'skipped' && norm !== 'skipped') return false;

    if (term) {
      const matchMat = (bom.material || bom.sourceMaterial || '').toLowerCase().includes(term);
      const matchPlant = (bom.plant || bom.sourcePlant || bom.targetPlant || '').toLowerCase().includes(term);
      const matchTgtMat = (bom.targetMaterial || '').toLowerCase().includes(term);
      const matchComp = Array.isArray(bom.components) && bom.components.some((c) =>
        (c.component || '').toLowerCase().includes(term)
      );
      if (!matchMat && !matchPlant && !matchTgtMat && !matchComp) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Safely merges validation outcomes into original parsed BOMs without overwriting parsed fields or dropping component rows.
 */
export function mergeValidationIntoBoms(originalBoms = [], validationResults = []) {
  if (!Array.isArray(originalBoms) || originalBoms.length === 0) return originalBoms || [];
  if (!Array.isArray(validationResults) || validationResults.length === 0) return originalBoms;

  const byBomKey = new Map();
  validationResults.forEach((res, idx) => {
    const mat = String(res.material || '').trim().toUpperCase();
    const plant = String(res.plant || '').trim();
    const usage = String(res.bomUsage || '1').trim();
    const alt = String(parseInt(res.alternativeBom, 10) || res.alternativeBom || '01').trim();
    const fullKey = `${mat}|${plant}|${usage}|${alt}`;
    if (!byBomKey.has(fullKey)) {
      byBomKey.set(fullKey, res);
    }
  });

  return originalBoms.map((origBom, idx) => {
    const mat = String(origBom.material || '').trim().toUpperCase();
    const plant = String(origBom.plant || '').trim();
    const usage = String(origBom.bomUsage || '1').trim();
    const alt = String(parseInt(origBom.alternativeBom, 10) || origBom.alternativeBom || '01').trim();
    const fullKey = `${mat}|${plant}|${usage}|${alt}`;
    const result = byBomKey.get(fullKey) || validationResults[idx] || {};

    const rawStatus = result.status || origBom.status || 'Pending';
    const reason = result.reason || result.message || origBom.reason || '';

    const errorsList = [];
    const addClean = (raw) => {
      if (!raw) return;
      const text = typeof raw === 'string' ? raw : (raw.message || JSON.stringify(raw));
      if (!text || typeof text !== 'string') return;
      if (text.includes(' | ')) {
        text.split(/\s*\|\s*/).forEach(addClean);
        return;
      }
      if (!errorsList.includes(text)) errorsList.push(text);
    };

    const isErrorStatus = ['failed', 'error', 'invalid'].includes(String(rawStatus).trim().toLowerCase());

    if (Array.isArray(result.errors)) {
      result.errors.forEach(addClean);
    }
    if (isErrorStatus) {
      if (result.reason) {
        addClean(result.reason);
      }
      if (result.message && result.message !== result.reason) {
        addClean(result.message);
      }
    }
    if (Array.isArray(origBom.errors) && isErrorStatus) {
      origBom.errors.forEach(addClean);
    }

    const origComponents = Array.isArray(origBom.components) ? origBom.components : [];
    const resComponents = Array.isArray(result.components) ? result.components : [];

    const mergedComponents = origComponents.map((comp, cIdx) => {
      const matchComp = resComponents.find((rc) =>
        (rc.component && comp.component && String(rc.component).trim().toUpperCase() === String(comp.component).trim().toUpperCase()) ||
        (rc.itemNo && comp.itemNo && rc.itemNo === comp.itemNo) ||
        (rc.rowNum && comp.rowNum && rc.rowNum === comp.rowNum)
      ) || resComponents[cIdx];

      if (matchComp) {
        return {
          ...comp,
          unit: matchComp.unit || comp.unit || '',
          status: matchComp.status || comp.status,
          error: matchComp.error || comp.error,
          errors: matchComp.errors || comp.errors,
          warning: matchComp.warning || comp.warning,
          warnings: matchComp.warnings || comp.warnings
        };
      }
      return comp;
    });

    return {
      ...origBom,
      sequenceNum: origBom.sequenceNum,
      material: origBom.material,
      plant: origBom.plant,
      bomUsage: origBom.bomUsage,
      alternativeBom: origBom.alternativeBom,
      validFrom: origBom.validFrom,
      validFromSap: origBom.validFromSap,
      baseQty: origBom.baseQty,
      baseUnit: result.baseUnit || origBom.baseUnit || '',
      bomStatus: origBom.bomStatus,
      altText: origBom.altText,
      status: rawStatus,
      reason: reason,
      message: result.message || origBom.message || reason,
      errors: errorsList,
      warnings: result.warnings || origBom.warnings || [],
      problems: result.problems || origBom.problems,
      retryable: result.retryable !== undefined ? result.retryable : origBom.retryable,
      components: mergedComponents.length > 0 ? mergedComponents : origComponents
    };
  });
}

/**
 * Extracts and deduplicates error and warning messages from any bulk BOM object
 * (supports both Create BOM and Copy BOM schemas).
 */
export function getBomMessages(bom) {
  if (!bom) return { errors: [], warnings: [], total: 0, all: [] };
  const errorList = [];
  const warningList = [];
  const seen = new Set();

  const addMsg = (raw, isWarning = false) => {
    if (!raw) return;
    const text = typeof raw === 'string' ? raw : (raw.text || raw.message || JSON.stringify(raw));
    if (!text || typeof text !== 'string') return;
    if (text.includes(' | ')) {
      text.split(/\s*\|\s*/).forEach((sub) => addMsg(sub, isWarning));
      return;
    }
    const cleaned = cleanDiagnosticMessage(text);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      if (isWarning) warningList.push(cleaned);
      else errorList.push(cleaned);
    }
  };

  const addError = (msg) => addMsg(msg, false);
  const addWarning = (msg) => addMsg(msg, true);

  // 1. Process individual errors and warnings from bom
  if (Array.isArray(bom.errors)) {
    bom.errors.forEach(addError);
  }
  if (Array.isArray(bom.warnings)) {
    bom.warnings.forEach(addWarning);
  }

  // 2. Process problems (commonly used in Bulk Copy)
  if (Array.isArray(bom.problems)) {
    bom.problems.forEach((p) => {
      if (typeof p === 'string') addError(p);
      else if (p && (p.text || p.message)) {
        const isWarn = p.type === 'warning' || p.severity === 'warning' || p.isWarning;
        if (isWarn) addWarning(p.text || p.message);
        else addError(p.text || p.message);
      }
    });
  }

  // 3. Process component level errors and warnings
  if (Array.isArray(bom.components)) {
    bom.components.forEach((c) => {
      if (Array.isArray(c.errors)) c.errors.forEach(addError);
      if (c.error) addError(c.error);
      if (Array.isArray(c.warnings)) c.warnings.forEach(addWarning);
      if (c.warning) addWarning(c.warning);
    });
  }

  // 4. Process reason / message (split if joined, deduplicated against seen)
  const isSkipped = normalizeBomStatus(bom) === 'skipped';
  const isError = normalizeBomStatus(bom) === 'error';
  if (bom.reason) {
    if (isSkipped) addWarning(bom.reason);
    else if (isError) addError(bom.reason);
  }
  if (bom.message && bom.message !== bom.reason) {
    if (isSkipped) addWarning(bom.message);
    else if (isError) addError(bom.message);
  }

  const all = [
    ...errorList.map((text) => ({ text, type: 'error' })),
    ...warningList.map((text) => ({ text, type: 'warning' }))
  ];

  return {
    errors: errorList,
    warnings: warningList,
    total: all.length,
    all
  };
}

/**
 * Shared message row rendered beneath a failed BOM row in preview tables.
 * Spans across table columns, lists errors first (red) then warnings (amber),
 * collapses by default to 3 items with an accessible toggle button.
 */
export function BulkBomMessageRow({
  messages,
  bomKey,
  isExpanded = false,
  onToggleExpand,
  colSpan = 12
}) {
  if (!messages || messages.total === 0) return null;

  return (
    <tr className="bom-messages-row" key={`bom-${bomKey}-messages`}>
      <td
        colSpan={colSpan}
        style={{
          whiteSpace: 'normal',
          padding: '6px 16px',
          backgroundColor: 'var(--sap-surface-subtle, #f8fafc)',
          borderTop: '1px dashed var(--sap-border-subtle, #e2e8f0)',
          borderBottom: '2px solid var(--sap-border, #cbd5e1)',
          fontSize: 12,
          lineHeight: 1.45
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(isExpanded ? messages.all : messages.all.slice(0, 3)).map((item, mIdx) => (
            <div
              key={mIdx}
              className={`bom-msg-item bom-msg-${item.type}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
                {item.type === 'error' ? (
                  <AlertCircle size={13} style={{ color: 'var(--sap-error, var(--color-danger, #b42318))' }} />
                ) : item.type === 'warning' ? (
                  <AlertTriangle size={13} style={{ color: 'var(--color-warning, #d97706)' }} />
                ) : (
                  <Info size={13} style={{ color: 'var(--sap-text-muted, #7a8ca3)' }} />
                )}
              </span>
              <span
                style={{
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  color: item.type === 'info' ? 'var(--sap-text-muted, #64748b)' : 'var(--sap-text-dark, #0f172a)'
                }}
              >
                {item.text}
              </span>
            </div>
          ))}
          {messages.all.length > 3 && (
            <div style={{ marginTop: 2 }}>
              <button
                type="button"
                className="toggle-messages-btn"
                aria-expanded={isExpanded}
                onClick={() => onToggleExpand && onToggleExpand(bomKey)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #0070f2)',
                  cursor: 'pointer',
                  padding: '2px 0',
                  fontFamily: 'inherit',
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: 'underline'
                }}
              >
                {isExpanded ? 'Show less' : `Show ${messages.all.length - 3} more`}
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

/**
 * Shared status badge for Bulk BOM preview tables.
 * Renders only the status badge (Ready, Failed, Skipped, Not validated).
 */
export function BulkBomResultBadge({ status, hasValidated = true }) {
  const normStatus = normalizeBomStatus(typeof status === 'string' ? { status } : status);

  if (!hasValidated || normStatus === 'not_validated') {
    return (
      <span
        className="sap-badge sap-badge-neutral"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap'
        }}
      >
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-text-muted, #7A8CA3)' }} />
        <span>Not validated</span>
      </span>
    );
  }
  if (normStatus === 'ready') {
    return (
      <span
        className="sap-badge sap-badge-success"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap'
        }}
      >
        <CheckCircle2 size={13} style={{ color: 'var(--color-success, #15803D)' }} />
        <span>Ready</span>
      </span>
    );
  }
  if (normStatus === 'error') {
    return (
      <span
        className="sap-badge sap-badge-danger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
          backgroundColor: 'var(--color-danger-bg, #FEF3F2)',
          color: 'var(--color-danger, #B42318)',
          border: '1px solid var(--color-danger-border, #FECDCA)'
        }}
      >
        <AlertCircle size={13} />
        <span>Failed</span>
      </span>
    );
  }
  if (normStatus === 'skipped') {
    return (
      <span
        className="sap-badge sap-badge-neutral"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
          color: 'var(--color-text-secondary, #4A5F77)',
          border: '1px solid var(--color-border, #D9E2EC)'
        }}
      >
        <MinusCircle size={13} style={{ color: 'var(--color-text-secondary, #4A5F77)' }} />
        <span>Skipped</span>
      </span>
    );
  }
  return null;
}

/**
 * Normalizes execution row status to 'CREATED' | 'FAILED' | 'SKIPPED'.
 * Ensures no row ever displays an unexecuted state (e.g., 'Ready') in the final Execution Details table.
 */
export function normalizeExecutionStatus(row) {
  if (!row) return 'FAILED';
  const status = String(row.status || '').toUpperCase();
  const rawMsg = Array.isArray(row.messages)
    ? row.messages.join(' ')
    : String(row.message || row.reason || '');
  const msg = rawMsg.toLowerCase();
  const hasErrors = Boolean(
    (row.errors && row.errors.length > 0) ||
    (row.problems && row.problems.length > 0) ||
    (row.discrepancies && row.discrepancies.length > 0) ||
    row.error ||
    row.failed === true ||
    row.success === false
  );

  // 1. Explicit Skipped status always takes precedence
  if (
    status === 'SKIPPED' ||
    status.includes('SKIP') ||
    status === 'ALREADY EXISTS - SKIPPED' ||
    status === 'NOT_PROCESSED'
  ) {
    return 'SKIPPED';
  }

  // 2. Explicit or implicit failure
  if (
    status === 'FAILED' ||
    status === 'ERROR' ||
    status === 'INVALID' ||
    hasErrors ||
    msg.includes('rejected') ||
    msg.includes('could not') ||
    msg.includes('dropped') ||
    (msg.includes('failed') && !msg.includes('failed earlier in this group')) ||
    (msg.includes('error') && !msg.includes('in this group has errors'))
  ) {
    return 'FAILED';
  }

  // 3. Fallback Skipped if message mentions skipped, already exists, or group blocked/failed
  if (
    msg.includes('already exists') ||
    msg.includes('skipped') ||
    msg.includes('failed earlier in this group') ||
    msg.includes('in this group has errors')
  ) {
    return 'SKIPPED';
  }

  // 4. Succeeded / Created
  if (
    status === 'SUCCESS' ||
    status === 'CREATED' ||
    status === 'READY' ||
    status === 'VALID' ||
    row.success === true ||
    row.bomNumber
  ) {
    return 'CREATED';
  }

  return 'FAILED';
}

/**
 * Resolves BOM groups based on explicit sequenceNum and/or component hierarchy.
 */
export function resolveBomGroups(boms = []) {
  if (!Array.isArray(boms) || boms.length === 0) return [];

  const parentIdx = boms.map((_, i) => i);
  const find = (i) => {
    let root = i;
    while (root !== parentIdx[root]) root = parentIdx[root];
    let curr = i;
    while (curr !== root) {
      const next = parentIdx[curr];
      parentIdx[curr] = root;
      curr = next;
    }
    return root;
  };
  const union = (i, j) => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parentIdx[rootI] = rootJ;
  };

  // 1. Group by explicit sequenceNum if present
  const seqMap = new Map();
  boms.forEach((bom, idx) => {
    const rawSeq = bom.sequenceNum !== undefined && bom.sequenceNum !== null ? String(bom.sequenceNum).trim() : '';
    if (rawSeq) {
      if (seqMap.has(rawSeq)) {
        union(idx, seqMap.get(rawSeq));
      } else {
        seqMap.set(rawSeq, idx);
      }
    }
  });

  // 2. Connect BOMs by component hierarchy
  boms.forEach((bomA, idxA) => {
    const matA = (bomA.material || '').trim().toUpperCase();
    const plantA = (bomA.plant || '').trim();
    (bomA.components || []).forEach((c) => {
      const compMat = (c.component || '').trim().toUpperCase();
      if (!compMat) return;
      boms.forEach((bomB, idxB) => {
        if (idxA === idxB) return;
        const matB = (bomB.material || '').trim().toUpperCase();
        const plantB = (bomB.plant || '').trim();
        if (matB === compMat && (!plantA || !plantB || plantA === plantB)) {
          union(idxA, idxB);
        }
      });
    });
  });

  const groupsMap = new Map();
  boms.forEach((bom, idx) => {
    const root = find(idx);
    if (!groupsMap.has(root)) groupsMap.set(root, []);
    groupsMap.get(root).push(bom);
  });

  const groups = [];
  groupsMap.forEach((groupBoms) => {
    if (groupBoms.length === 1) {
      groups.push({
        parent: groupBoms[0],
        children: [],
        members: groupBoms,
        orderedBoms: [groupBoms[0]]
      });
      return;
    }

    const usedAsComponent = new Set();
    groupBoms.forEach((p) => {
      (p.components || []).forEach((c) => {
        const cMat = (c.component || '').trim().toUpperCase();
        groupBoms.forEach((child) => {
          if ((child.material || '').trim().toUpperCase() === cMat) {
            usedAsComponent.add(child);
          }
        });
      });
    });

    const parents = groupBoms.filter((b) => !usedAsComponent.has(b));
    const children = groupBoms.filter((b) => usedAsComponent.has(b));

    const topParent = parents[0] || groupBoms[0];
    const subBoms = children.length > 0 ? children : groupBoms.slice(1);

    const orderedBoms = [];
    const visited = new Set();

    const visit = (b) => {
      if (visited.has(b)) return;
      visited.add(b);
      (b.components || []).forEach((c) => {
        const cMat = (c.component || '').trim().toUpperCase();
        const sub = groupBoms.find((other) => (other.material || '').trim().toUpperCase() === cMat);
        if (sub && sub !== b) {
          visit(sub);
        }
      });
      orderedBoms.push(b);
    };

    subBoms.forEach(visit);
    parents.forEach(visit);
    groupBoms.forEach(visit);

    groups.push({
      parent: topParent,
      children: subBoms,
      members: groupBoms,
      orderedBoms
    });
  });

  return groups;
}

/**
 * Shared badge for Execution Details table.
 * Created = Green, Failed = Red, Skipped = Amber
 */
export function BulkExecutionResultBadge({ status }) {
  const norm = typeof status === 'string' ? status.toUpperCase() : 'FAILED';

  if (norm === 'CREATED' || norm === 'SUCCESS') {
    return (
      <span
        className="sap-badge sap-badge-success"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap'
        }}
      >
        <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
        <span>Created</span>
      </span>
    );
  }

  if (norm === 'SKIPPED') {
    return (
      <span
        className="sap-badge sap-badge-neutral"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          padding: '3px 8px',
          whiteSpace: 'nowrap',
          backgroundColor: 'var(--color-blue-50, #EEF4F9)',
          color: 'var(--color-text-secondary, #4A5F77)',
          border: '1px solid var(--color-border, #D9E2EC)'
        }}
      >
        <MinusCircle size={13} style={{ color: 'var(--color-text-secondary, #4A5F77)' }} />
        <span>Skipped</span>
      </span>
    );
  }

  return (
    <span
      className="sap-badge sap-badge-danger"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 11,
        padding: '3px 8px',
        whiteSpace: 'nowrap',
        backgroundColor: 'var(--color-danger-bg)',
        color: 'var(--color-danger)',
        border: '1px solid var(--color-danger-border)'
      }}
    >
      <AlertCircle size={13} />
      <span>Failed</span>
    </span>
  );
}

/**
 * Extracts normalized itemized messages for an execution row.
 * Primary errors are ordered first, followed by technical cascade messages (e.g. consistency check, no instance),
 * then warnings and neutral information.
 */
export function getExecutionRowMessages(row) {
  const primaryErrors = [];
  const followOnInfo = [];
  const warnings = [];
  const otherInfo = [];
  const seen = new Set();

  const isFollowOnTechnical = (text) =>
    /consistency check when creating bom item|no instance of object type bomgroup/i.test(text);

  const addMsg = (text, defaultType = 'error') => {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);

    if (isFollowOnTechnical(clean)) {
      followOnInfo.push({ text: clean, type: 'info' });
      return;
    }

    if (defaultType === 'warning') {
      warnings.push({ text: clean, type: 'warning' });
    } else if (defaultType === 'info') {
      otherInfo.push({ text: clean, type: 'info' });
    } else {
      primaryErrors.push({ text: clean, type: 'error' });
    }
  };

  if (Array.isArray(row?.errors) && row.errors.length > 0) {
    for (const e of row.errors) addMsg(e, 'error');
  }

  if (Array.isArray(row?.problems) && row.problems.length > 0) {
    for (const p of row.problems) addMsg(p, 'error');
  }

  if (Array.isArray(row?.discrepancies) && row.discrepancies.length > 0) {
    for (const d of row.discrepancies) addMsg(`Discrepancy: ${d}`, 'warning');
  }

  if (Array.isArray(row?.warnings) && row.warnings.length > 0) {
    for (const w of row.warnings) addMsg(w, 'warning');
  }

  const isRowFailed = ['failed', 'invalid', 'error'].includes(String(row?.status || '').trim().toLowerCase());

  if (Array.isArray(row?.messages) && row.messages.length > 0) {
    for (const m of row.messages) {
      const isErr = isRowFailed || /error|fail|invalid|reject|missing|could not|already exists|not supported|unsupported|not maintained|not extended|not found|exceeds/i.test(m);
      addMsg(m, isErr ? 'error' : 'info');
    }
  }

  const rawMsg = row?.message || row?.reason || '';
  if (rawMsg) {
    const parts = String(rawMsg).split(/\s*\|\s*|\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      const isErr = isRowFailed || /error|fail|invalid|reject|missing|could not|already exists|not supported|unsupported|not maintained|not extended|not found|exceeds/i.test(p);
      addMsg(p, isErr ? 'error' : 'info');
    }
  }

  const list = [...primaryErrors, ...followOnInfo, ...warnings, ...otherInfo];

  if (list.length === 0) {
    const status = normalizeExecutionStatus(row);
    if (status === 'CREATED') {
      list.push({ text: 'BOM created and verified in SAP.', type: 'info' });
    } else if (status === 'SKIPPED') {
      list.push({ text: 'BOM already exists in plant; skipped.', type: 'warning' });
    } else {
      list.push({ text: 'BOM creation failed.', type: 'error' });
    }
  }

  return list;
}
