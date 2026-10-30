import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { getBomJob, cancelBomJob } from '../services/api';

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
    <div className="sap-bulk-columns-guide" style={{ marginTop: 14, ...style }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--sap-text-muted, #64748b)',
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--sap-text-subtle, #94a3b8)' }}>
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
              fontSize: 11.5,
              padding: '3px 9px',
              borderRadius: 'var(--radius-full, 9999px)',
              background: col.required ? 'var(--sap-badge-bg, rgba(0, 112, 242, 0.08))' : 'var(--sap-surface-subtle, #f1f5f9)',
              color: col.required ? 'var(--sap-primary, #0070f2)' : 'var(--sap-text-muted, #475569)',
              border: col.required ? '1px solid rgba(0, 112, 242, 0.25)' : '1px solid var(--sap-border-subtle, #e2e8f0)',
              fontWeight: col.required ? 600 : 500
            }}
          >
            {col.required && <span style={{ color: 'var(--sap-error-text, #b45309)', fontWeight: 700 }}>*</span>}
            <span>{col.label}</span>
            {col.default && (
              <span style={{ fontSize: 10.5, color: 'var(--sap-text-subtle, #64748b)', opacity: 0.85 }}>
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
 * 1. Shared 3-Step Workflow Indicator
 * Step 1: Upload file
 * Step 2: Validate data
 * Step 3: Create BOMs (for create) / Copy BOMs (for copy)
 */
export function BulkWorkflowSteps({ activeStep = 1, style = {}, maxWidth, mode = 'create', type }) {
  const resolvedMaxWidth = maxWidth !== undefined ? maxWidth : (activeStep === 1 ? 750 : 1100);
  const isCopy = (mode === 'copy' || type === 'copy');
  const step3Label = isCopy ? 'Copy BOMs' : 'Create BOMs';
  return (
    <div
      className="sap-bulk-steps-bar"
      style={{
        maxWidth: resolvedMaxWidth,
        width: '100%',
        margin: '0 auto 16px',
        borderRadius: 8,
        border: '1px solid var(--sap-border, #e2e8f0)',
        transition: 'max-width 0.2s ease',
        ...style
      }}
    >
      <div className={`sap-bulk-step ${activeStep >= 1 ? 'active' : ''}`}>
        <span className="step-num">1</span>
        <span>Upload file</span>
      </div>
      <div className="step-arrow">
        <ArrowRight size={12} />
      </div>
      <div className={`sap-bulk-step ${activeStep >= 2 ? 'active' : ''}`}>
        <span className="step-num">2</span>
        <span>Validate data</span>
      </div>
      <div className="step-arrow">
        <ArrowRight size={12} />
      </div>
      <div className={`sap-bulk-step ${activeStep >= 3 ? 'active' : ''}`}>
        <span className="step-num">3</span>
        <span>{step3Label}</span>
      </div>
    </div>
  );
}

/**
 * 2. Shared Slim File Info Bar (shown after upload, replacing big upload box)
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
      className="sap-bulk-file-info-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'var(--sap-surface-subtle, #f8fafc)',
        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
        borderRadius: 'var(--radius-lg, 8px)',
        fontSize: 13,
        ...style
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <FileSpreadsheet size={16} color="var(--sap-primary, #0070f2)" style={{ flexShrink: 0 }} />
        <span
          style={{
            fontWeight: 600,
            color: 'var(--sap-text-dark, #1e293b)',
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
            <span style={{ color: 'var(--sap-text-muted, #64748b)' }}>·</span>
            <span style={{ color: 'var(--sap-text-muted, #64748b)', whiteSpace: 'nowrap' }}>
              {countText}
            </span>
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onDownloadTemplate && (
          <button
            type="button"
            className="sap-btn sap-btn-ghost sap-btn-sm"
            onClick={onDownloadTemplate}
            disabled={isLocked}
            title="Download Template"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '4px 10px',
              cursor: isLocked ? 'not-allowed' : 'pointer',
              opacity: isLocked ? 0.6 : 1
            }}
          >
            <Download size={13} />
            <span>Template</span>
          </button>
        )}

        {!isLocked && onChangeFile && (
          <button
            type="button"
            className="sap-btn sap-btn-ghost sap-btn-sm"
            onClick={onChangeFile}
            title="Change File"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              padding: '4px 10px'
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
 * 3. Shared Active Job Progress Card
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
  style = {}
}) {
  if (!isValidating && !isExecuting) return null;

  const titleText = isValidating
    ? `${validationLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`
    : `${executionLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`;

  return (
    <div
      className="sap-card"
      style={{
        padding: '16px 20px',
        marginBottom: 16,
        borderLeft: '4px solid var(--sap-primary, #0070f2)',
        background: '#f8fafc',
        ...style
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Loader2 size={18} className="sap-spin" style={{ color: 'var(--sap-primary, #0070f2)' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--sap-text-dark)' }}>
            {titleText}
          </span>
        </div>
        {activeJobId && onCancelJob && (
          <button
            type="button"
            onClick={onCancelJob}
            disabled={isCancelling}
            className="sap-btn"
            style={{
              borderColor: 'var(--sap-border, rgba(0, 0, 0, 0.12))',
              color: 'var(--sap-text, #1e293b)',
              background: '#fff',
              fontSize: 12,
              padding: '4px 12px'
            }}
          >
            {isCancelling ? 'Stopping after current BOM...' : 'Cancel'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          height: 8,
          background: '#e2e8f0',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 8
        }}
      >
        <div
          style={{
            width: `${Math.max(2, jobProgress.percent || 0)}%`,
            height: '100%',
            background: 'var(--sap-primary, #0070f2)',
            transition: 'width 0.3s ease'
          }}
        />
      </div>

      {/* Status Info & Counts */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: 'var(--sap-text-muted)',
          flexWrap: 'wrap',
          gap: 8
        }}
      >
        <span>
          {jobCurrentBom
            ? `Current BOM: ${jobCurrentBom.material || jobCurrentBom.sourceMaterial || ''} / Plant ${
                jobCurrentBom.plant || ''
              }${jobCurrentBom.alternativeBom ? ` (Alt ${jobCurrentBom.alternativeBom})` : ''}`
            : 'Connecting to SAP...'}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {jobProgress.successCount > 0 && (
            <span style={{ color: '#16a34a', fontWeight: 600 }}>
              {isValidating ? 'Ready' : 'Created'}: {jobProgress.successCount}
            </span>
          )}
          {jobProgress.failedCount > 0 && (
            <span style={{ color: 'var(--sap-error-text, #b45309)', fontWeight: 600 }}>
              Failed: {jobProgress.failedCount}
            </span>
          )}
          {jobProgress.skippedCount > 0 && (
            <span style={{ color: '#ca8a04', fontWeight: 600 }}>
              Skipped: {jobProgress.skippedCount}
            </span>
          )}
          {jobProgress.notProcessedCount > 0 && (
            <span style={{ color: '#f97316', fontWeight: 600 }}>
              Not Processed: {jobProgress.notProcessedCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 4. Shared Background Job Polling Hook
 */
export function useBulkBomJobPolling() {
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJobType, setActiveJobType] = useState(null);
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
      setIsCancelling(false);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const data = await getBomJob(jobId);
          if (!data.success || !data.job) return;
          const job = data.job;

          const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
          setJobProgress({
            current: job.processed,
            total: job.total,
            percent: pct,
            successCount: job.successCount,
            failedCount: job.failedCount,
            skippedCount: job.skippedCount || 0,
            notProcessedCount: job.notProcessedCount || 0
          });

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
            if (onFinish) {
              onFinish(job, type);
            }
          }
        } catch (err) {
          console.warn('Job polling warning:', err.message);
        }
      }, 2000);
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
    jobProgress,
    jobCurrentBom,
    isCancelling,
    startJobPolling,
    handleCancelJob,
    resetJobState,
    setJobProgress
  };
}
