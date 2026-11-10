import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react';
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
  style = {}
}) {
  if (!isValidating && !isExecuting) return null;

  const titleText = isValidating
    ? `${validationLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`
    : `${executionLabel} (${jobProgress.current || 0} of ${jobProgress.total || '...'})...`;

  return (
    <div
      className="rx-card rx-bulk-progress-card sap-card"
      style={{
        padding: '16px 20px',
        marginBottom: 16,
        width: '100%',
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        borderLeft: '4px solid var(--color-blue-600, #02579A)',
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
          <Loader2 size={18} className="sap-spin" style={{ color: 'var(--color-blue-600, #02579A)' }} />
          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-14, 14px)', color: 'var(--color-navy-900, #00204E)' }}>
            {titleText}
          </span>
        </div>
        {activeJobId && onCancelJob && (
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

      {/* Progress bar */}
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
          style={{
            width: `${Math.max(2, jobProgress.percent || 0)}%`,
            height: '100%',
            backgroundColor: 'var(--color-blue-600, #02579A)',
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
          fontSize: 'var(--font-size-12, 12px)',
          color: 'var(--color-text-secondary, #4A5F77)',
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
            <span style={{ color: 'var(--color-warning, #B45309)', fontWeight: 600 }}>
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
    </div>
  );
}

/**
 * Shared Background Job Polling Hook
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
      }, 3000);
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
