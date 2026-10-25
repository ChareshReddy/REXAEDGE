import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
  FileCheck,
  ArrowLeft,
  ChevronLeft,
  Loader2
} from 'lucide-react';
import {
  batchValidateBoms,
  batchCopyBoms,
  downloadBomTemplate,
  startBomJob,
  getBomJob,
  cancelBomJob,
  getActiveBomJob
} from '../services/api';
import BulkUploadPanel from './BulkUploadPanel';
import activityTracker from '../services/activityTracker';
import BlockedReasonsList from './BlockedReasonsList';
import {
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard
} from './BulkBomShared';

/**
 * Normalizes headers from Excel spreadsheet into recognized internal keys.
 */
function normalizeRowKeys(rawRow) {
  const normalized = {};

  for (const [key, value] of Object.entries(rawRow)) {
    const k = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

    // Source Material
    if (k.includes('srcmat') || k.includes('sourcemat') || (k.includes('source') && k.includes('mat')) || k === 'matnr') {
      normalized.sourceMaterial = String(value || '').trim().toUpperCase();
    }
    // Source Plant
    else if (k.includes('srcplant') || k.includes('sourceplant') || (k.includes('source') && k.includes('plant')) || (k.includes('source') && k.includes('werks'))) {
      normalized.sourcePlant = String(value || '').trim().toUpperCase();
    }
    // Source Usage
    else if (k.includes('srcuse') || k.includes('srcusage') || (k.includes('source') && k.includes('use')) || (k.includes('source') && k.includes('usage')) || (k.includes('source') && k.includes('stlan'))) {
      normalized.sourceUsage = String(value || '1').trim();
    }
    // Source Alternative
    else if (k.includes('srcalt') || k.includes('sourcealt') || (k.includes('source') && k.includes('alt')) || (k.includes('source') && k.includes('stlal'))) {
      normalized.sourceAltBom = String(value || '1').trim();
    }
    // Target Material
    else if (k.includes('tgtmat') || k.includes('targetmat') || (k.includes('target') && k.includes('mat'))) {
      normalized.targetMaterial = String(value || '').trim().toUpperCase();
    }
    // Target Plant
    else if (k.includes('tgtplant') || k.includes('targetplant') || (k.includes('target') && k.includes('plant')) || (k.includes('target') && k.includes('werks'))) {
      normalized.targetPlant = String(value || '').trim().toUpperCase();
    }
    // Target Usage
    else if (k.includes('tgtuse') || k.includes('tgtusage') || (k.includes('target') && k.includes('use')) || (k.includes('target') && k.includes('usage')) || (k.includes('target') && k.includes('stlan'))) {
      normalized.targetUsage = String(value || '1').trim();
    }
    // Target Alternative
    else if (k.includes('tgtalt') || k.includes('targetalt') || (k.includes('target') && k.includes('alt')) || (k.includes('target') && k.includes('stlal'))) {
      normalized.targetAltBom = String(value || '').trim();
    }
  }

  // Fallbacks: if target material is missing, default to source material
  if (!normalized.targetMaterial && normalized.sourceMaterial) {
    normalized.targetMaterial = normalized.sourceMaterial;
  }
  if (!normalized.sourceUsage) normalized.sourceUsage = '1';
  if (!normalized.targetUsage) normalized.targetUsage = '1';
  if (!normalized.sourceAltBom) normalized.sourceAltBom = '1';

  return normalized;
}

export default function BulkBomView({ systemKey = 'DEV', onBack, onNavigateHome, onNavigateBom }) {
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [parseError, setParseError] = useState('');

  // Validation phase state
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState(null);

  // Execution phase state
  const [isExecuting, setIsExecuting] = useState(false);
  const [skipErrors, setSkipErrors] = useState(true);
  const [copyHierarchy, setCopyHierarchy] = useState(true);
  const [executionReport, setExecutionReport] = useState(null);
  const [activeStep, setActiveStep] = useState(1); // 1: Upload, 2: Validate, 3: Execute/Results

  // Background Job States
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
    notProcessedCount: 0
  });
  const pollIntervalRef = useRef(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    activityTracker.setOperation('bulk_bom', isValidating || isExecuting);
    return () => {
      activityTracker.setOperation('bulk_bom', false);
    };
  }, [isValidating, isExecuting]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  const startJobPolling = (jobId, type) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setActiveJobId(jobId);
    setActiveJobType(type);

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
          successCount: job.successCount || 0,
          failedCount: job.failedCount || 0,
          notProcessedCount: job.notProcessedCount || 0
        });
        setJobCurrentBom(job.currentBom);

        const isFinished = [
          'COMPLETED',
          'COMPLETED_WITH_ERRORS',
          'CANCELLED',
          'STOPPED_ON_CONNECTION_DROP',
          'FAILED',
          'INTERRUPTED'
        ].includes(job.status);

        if (isFinished) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setActiveJobId(null);
          setIsCancelling(false);

          if (type === 'copy_validate') {
            setIsValidating(false);
            if (job.status === 'STOPPED_ON_CONNECTION_DROP') {
              setParseError(`Validation stopped: SAP connection dropped. (${job.error || 'Network drop'})`);
            } else if (job.status === 'FAILED') {
              setParseError(job.error || 'Validation failed in SAP.');
            } else {
              setValidationReport({
                success: true,
                totalItems: job.total,
                validCount: job.successCount,
                failedCount: job.failedCount,
                results: job.results
              });
              setActiveStep(2);

              const resMap = new Map((job.results || []).map((r) => [r.id, r]));
              setParsedRows((prev) =>
                prev.map((row) => {
                  const match = resMap.get(row.id);
                  if (match) {
                    return {
                      ...row,
                      targetAltBom: match.targetAltBom || row.targetAltBom,
                      sourceAltBom: match.sourceAltBom || row.sourceAltBom,
                      status: match.status,
                      message: match.message,
                      componentCount: match.componentCount || 0
                    };
                  }
                  return row;
                })
              );
            }
          } else if (type === 'copy_bulk') {
            setIsExecuting(false);
            setExecutionReport({
              success: job.status === 'COMPLETED',
              status: job.status,
              message:
                job.error ||
                (job.status === 'CANCELLED'
                  ? 'Batch copy cancelled by user.'
                  : job.status === 'STOPPED_ON_CONNECTION_DROP'
                  ? 'Batch copy stopped: SAP connection dropped. Remaining rows marked not processed.'
                  : 'Batch copy completed.'),
              totalProcessed: job.total,
              successCount: job.successCount,
              failedCount: job.failedCount,
              notProcessedCount: job.notProcessedCount || 0,
              results: job.results || []
            });

            const resMap = new Map((job.results || []).map((r) => [r.id, r]));
            setParsedRows((prev) =>
              prev.map((row) => {
                const match = resMap.get(row.id);
                if (match) {
                  return {
                    ...row,
                    targetAltBom: match.targetAltBom || row.targetAltBom,
                    sourceAltBom: match.sourceAltBom || row.sourceAltBom,
                    status: match.status === 'SUCCESS' ? 'SUCCESS' : match.status === 'NOT_PROCESSED' ? 'NOT_PROCESSED' : 'FAILED',
                    message: match.message,
                    bomNumber: match.bomNumber || '',
                    totalLevels: match.totalLevels || 1,
                    totalBoms: match.totalBoms || 1
                  };
                }
                return row;
              })
            );
          }
        }
      } catch (err) {
        console.warn('Job polling warning:', err.message);
      }
    }, 2000);
  };

  // Reconnect on mount if an active job is already in flight
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        const res = await getActiveBomJob();
        if (!isMounted || !res.success || !res.hasActiveJob || !res.job) return;
        const job = res.job;
        if (job.type === 'copy_validate') {
          setIsValidating(true);
          startJobPolling(job.jobId, 'copy_validate');
        } else if (job.type === 'copy_bulk') {
          setIsExecuting(true);
          setActiveStep(3);
          startJobPolling(job.jobId, 'copy_bulk');
        }
      } catch (err) {
        console.warn('Could not check active BOM job:', err.message);
      }
    };
    checkActiveJob();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCancelJob = async () => {
    if (!activeJobId || isCancelling) return;
    setIsCancelling(true);
    try {
      await cancelBomJob(activeJobId);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to cancel job');
      setIsCancelling(false);
    }
  };

  const resetAll = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setFile(null);
    setParsedRows([]);
    setParseError('');
    setValidationReport(null);
    setIsExecuting(false);
    setActiveJobId(null);
    setJobCurrentBom(null);
    setIsCancelling(false);
    setExecutionReport(null);
    setActiveStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (fileObj) => {
    setParseError('');
    setValidationReport(null);
    setExecutionReport(null);

    if (!fileObj) return;

    const validExts = ['.xlsx', '.xls', '.csv'];
    const lowerName = fileObj.name.toLowerCase();
    const isValidExt = validExts.some((ext) => lowerName.endsWith(ext));

    if (!isValidExt) {
      setParseError('Please upload an Excel file (.xlsx, .xls) or CSV file.');
      return;
    }

    setFile(fileObj);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          setParseError('The uploaded workbook contains no sheets.');
          return;
        }

        const sheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setParseError('The Excel sheet contains no data rows.');
          return;
        }

        const normalized = rawJson
          .map((row, index) => {
            const norm = normalizeRowKeys(row);
            return {
              id: index + 1,
              ...norm,
              status: 'PENDING',
              message: 'Not validated yet'
            };
          })
          .filter((r) => r.sourceMaterial || r.sourcePlant || r.targetPlant || r.targetAltBom);

        if (normalized.length === 0) {
          setParseError('Could not recognize any valid BOM columns. Please use the sample template.');
          return;
        }

        // BOM Cap check (500 limit)
        if (normalized.length > 500) {
          setParseError(
            `Uploaded file contains ${normalized.length} BOM copy rows, which exceeds the maximum limit of 500 BOMs. Please split into smaller batches.`
          );
          return;
        }

        setParsedRows(normalized);
        setActiveStep(1);
      } catch (err) {
        console.error('Failed to parse Excel file:', err);
        setParseError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(fileObj);
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadBomTemplate();
    } catch (err) {
      console.warn('Backend template download failed, generating client-side fallback:', err.message);
      const sample = [
        {
          'Source Material': 'A1BH0214C',
          'Source Plant': '1012',
          'Source BOM Usage': '1',
          'Source Alternative': '1',
          'Target Material': 'A1BH0214C',
          'Target Plant': '1001',
          'Target BOM Usage': '1',
          'Target Alternative': '12'
        },
        {
          'Source Material': 'A1BH0214C',
          'Source Plant': '1012',
          'Source BOM Usage': '1',
          'Source Alternative': '2',
          'Target Material': 'A1BH0214C',
          'Target Plant': '1001',
          'Target BOM Usage': '1',
          'Target Alternative': '13'
        }
      ];
      const ws = XLSX.utils.json_to_sheet(sample);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'BOM_Template');
      XLSX.writeFile(wb, 'BOM_Copy_Template.xlsx');
    }
  };

  const handleValidateWithSap = async () => {
    if (parsedRows.length === 0) return;
    setIsValidating(true);
    setParseError('');

    try {
      const res = await startBomJob({
        type: 'copy_validate',
        items: parsedRows
      });

      if (res.success && res.jobId) {
        setJobProgress({
          current: 0,
          total: res.total,
          percent: 0,
          successCount: 0,
          failedCount: 0,
          notProcessedCount: 0
        });
        startJobPolling(res.jobId, 'copy_validate');
      } else {
        setParseError(res.message || 'Failed to start validation job.');
        setIsValidating(false);
      }
    } catch (err) {
      console.error('Validation error:', err);
      setParseError(err.response?.data?.message || err.message || 'Validation failed.');
      setIsValidating(false);
    }
  };

  const handleExecuteBatchCopy = async () => {
    const executableRows = parsedRows.filter((r) => r.status === 'VALID' || r.status === 'WARNING');
    if (executableRows.length === 0) {
      alert('No valid rows available to execute.');
      return;
    }

    const hasWarnings = parsedRows.some((r) => r.status === 'WARNING');
    const warningNotice = hasWarnings
      ? '\n\n⚠️ Note: Some rows have WARNINGS (target alternative may already exist and conflict).'
      : '';

    const confirmMsg = `Are you sure you want to copy ${executableRows.length} Bill of Materials in SAP?${warningNotice}\n\nOperation will be executed sequentially via high-speed SAP RFC.`;
    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsExecuting(true);
    setActiveStep(3);
    setExecutionReport(null);

    try {
      const res = await startBomJob({
        type: 'copy_bulk',
        items: executableRows,
        copyHierarchy,
        skipErrors
      });

      if (res.success && res.jobId) {
        setJobProgress({
          current: 0,
          total: res.total,
          percent: 0,
          successCount: 0,
          failedCount: 0,
          notProcessedCount: 0
        });
        startJobPolling(res.jobId, 'copy_bulk');
      } else {
        setParseError(res.message || 'Failed to start copy job.');
        setIsExecuting(false);
      }
    } catch (err) {
      console.error('Execution error:', err);
      setParseError(err.response?.data?.message || err.message || 'Execution failed.');
      setIsExecuting(false);
    }
  };

  const handleExportResults = () => {
    if (parsedRows.length === 0) return;

    const exportData = parsedRows.map((r, i) => ({
      'Row #': i + 1,
      'Source Material': r.sourceMaterial,
      'Source Plant': r.sourcePlant,
      'Source Usage': r.sourceUsage,
      'Source Alt BOM': r.sourceAltBom,
      'Target Material': r.targetMaterial,
      'Target Plant': r.targetPlant,
      'Target Usage': r.targetUsage,
      'Target Alt BOM': r.targetAltBom,
      'Components': r.componentCount || '-',
      'Hierarchy Levels': r.totalLevels || 1,
      'Total BOMs Created': r.totalBoms || 1,
      'Execution Status': r.status,
      'SAP BOM Number': r.bomNumber || '-',
      'SAP Message': r.message
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 16 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 45 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Batch_Copy_Results');
    const timestamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `SAP_BOM_Batch_Copy_Report_${timestamp}.xlsx`);
  };

  const validCount = parsedRows.filter((r) => r.status === 'VALID' || r.status === 'SUCCESS').length;
  const warningCount = parsedRows.filter((r) => r.status === 'WARNING').length;
  const errorCount = parsedRows.filter((r) => r.status === 'ERROR' || r.status === 'FAILED').length;

  return (
    <div className="fiori-app-view-root">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <div className="fiori-ph">
        <div className="fiori-bc">
          <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
            Home
          </button>
          <span className="fiori-bc-sep">›</span>
          <button type="button" className="fiori-bc-link" onClick={onNavigateBom || onBack}>
            Bill of Materials
          </button>
          <span className="fiori-bc-sep">›</span>
          <button type="button" className="fiori-bc-link" onClick={onBack}>
            Copy BOM
          </button>
          <span className="fiori-bc-sep">›</span>
          <span className="fiori-bc-current">Copy Bulk BOM</span>
          <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>{systemKey}</span>
        </div>
        <div className="fiori-ph-title-row">
          <button
            type="button"
            className="fiori-ph-back"
            onClick={onBack}
            title="Back to Copy BOM"
            aria-label="Back to Copy BOM"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="fiori-ph-title">Copy Bulk BOM</h1>
        </div>
        <p className="fiori-ph-subtitle">
          Mass upload spreadsheet (.xlsx, .csv) to validate and duplicate multiple BOMs across plants sequentially via SAP RFC.
        </p>
      </div>

      <div className="fiori-view-body wide">
        {/* Workflow Steps Indicator */}
        <BulkWorkflowSteps activeStep={activeStep} />

        {/* Error Notification */}
        {parseError && parsedRows.length > 0 && (
          <div className="sap-form-alert sap-form-alert-error" style={{ maxWidth: 1100, width: '100%', margin: '0 auto 14px' }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{parseError}</span>
          </div>
        )}

        {/* Main Content Workspace Card */}
        <div className="sap-structured-form-card" style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: parsedRows.length === 0 ? '20px 24px' : '12px 16px' }}>
          {parsedRows.length === 0 ? (
            <BulkUploadPanel
              title="Upload Spreadsheet"
              helperText="Mass upload spreadsheet (.xlsx, .xls, .csv) to validate and duplicate multiple BOMs across plants sequentially via SAP RFC."
              acceptedFormats=".xlsx, .xls, .csv"
              supportedFormatsText="Supports .xlsx, .xls, and .csv with Source & Target BOM columns"
              fileName={file?.name || ''}
              onFile={processFile}
              loading={isValidating}
              loadingText="Validating with SAP master records..."
              disabled={isExecuting || isValidating}
              templateAction={{
                label: 'Download Template',
                onClick: handleDownloadTemplate,
                disabled: isExecuting
              }}
              error={parseError}
              onClear={resetAll}
            >
              {/* Template Helper Card */}
              <div className="sap-template-guide-card" style={{ marginTop: 8 }}>
                <h5>Required Excel Columns:</h5>
                <div className="sap-columns-pill-grid">
                  <span className="col-pill required">Source Material</span>
                  <span className="col-pill required">Source Plant</span>
                  <span className="col-pill optional">Source BOM Usage (def: 1)</span>
                  <span className="col-pill required">Source Alternative</span>
                  <span className="col-pill optional">Target Material (def: Source)</span>
                  <span className="col-pill required">Target Plant</span>
                  <span className="col-pill optional">Target BOM Usage (def: 1)</span>
                  <span className="col-pill required">Target Alternative</span>
                </div>
              </div>
            </BulkUploadPanel>
          ) : (
            <div className="sap-bulk-table-view">
              {/* ACTIVE BACKGROUND JOB PROGRESS CARD */}
              <BulkJobProgressCard
                isValidating={isValidating}
                isExecuting={isExecuting}
                activeJobId={activeJobId}
                jobProgress={jobProgress}
                jobCurrentBom={jobCurrentBom}
                isCancelling={isCancelling}
                onCancelJob={handleCancelJob}
                validationLabel="Validating Copy Rows"
                executionLabel="Executing Batch Copy"
              />

              {/* File Info Bar */}
              <BulkFileInfoBar
                fileName={file?.name || ''}
                countText={`${parsedRows.length} rows`}
                isLocked={isExecuting || isValidating}
                onDownloadTemplate={handleDownloadTemplate}
                onChangeFile={resetAll}
              />

              {/* Summary Counter Badges */}
              {validationReport && (
                <div className="sap-bulk-status-summary">
                  <div className="status-stat valid">
                    <CheckCircle2 size={14} />
                    <span>{validCount} Ready</span>
                  </div>
                  <div className="status-stat warning">
                    <AlertTriangle size={14} />
                    <span>{warningCount} Warnings</span>
                  </div>
                  <div className="status-stat error">
                    <XCircle size={14} />
                    <span>{errorCount} Errors</span>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: '11px', color: 'var(--sap-success-text)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', background: 'var(--sap-success-bg)', border: '1px solid var(--sap-success-border)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                      <input
                        type="checkbox"
                        checked={copyHierarchy}
                        onChange={(e) => setCopyHierarchy(e.target.checked)}
                        disabled={isExecuting}
                      />
                      <span>Copy Full Hierarchy</span>
                    </label>
                    <label style={{ fontSize: '11px', color: 'var(--sap-text-muted)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={skipErrors}
                        onChange={(e) => setSkipErrors(e.target.checked)}
                        disabled={isExecuting}
                      />
                      Skip errors
                    </label>
                  </div>
                </div>
              )}

              {isValidating && (
                <div style={{
                  padding: '16px 20px',
                  background: 'var(--sap-surface-hover)',
                  border: '1px solid var(--sap-border)',
                  borderRadius: 'var(--sap-radius)',
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="sap-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13.5px', color: 'var(--sap-text)' }}>
                        Checking {parsedRows.length} BOM{parsedRows.length === 1 ? '' : 's'} in SAP...
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--sap-text-muted)' }}>
                        Running multi-level simulation via SAP RFC TESTRUN across all levels.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sap-btn sap-btn-ghost sap-btn-sm"
                    onClick={onBack || resetAll}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <ChevronLeft size={13} />
                    <span>Back</span>
                  </button>
                </div>
              )}

              {/* Grid Table */}
              <div className="sap-bulk-grid-container" tabIndex={0} role="region" aria-label="Bulk BOM Items Table">
                <table className="sap-bulk-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Source BOM</th>
                      <th>Target BOM</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Items</th>
                      <th style={{ width: 100 }}>Status</th>
                      <th>Diagnostic / RFC Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row, idx) => {
                      const isRowValid = row.status === 'VALID' || row.status === 'SUCCESS';
                      const isRowWarn = row.status === 'WARNING';
                      const isRowError = row.status === 'ERROR' || row.status === 'FAILED';

                      return (
                        <tr key={row.id || idx} className={`row-status-${row.status.toLowerCase()}`}>
                          <td style={{ fontWeight: 600, color: 'var(--sap-text-muted)', fontSize: '11px' }}>{idx + 1}</td>
                          <td>
                            <div className="bom-identity-cell">
                              <span className="mat-pill">{row.sourceMaterial}</span>
                              <span className="sub-detail">Plant: <strong>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong></span>
                            </div>
                          </td>
                          <td>
                            <div className="bom-identity-cell">
                              <span className="mat-pill">{row.targetMaterial}</span>
                              <span className="sub-detail">Plant: <strong>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--sap-primary)' }}>{row.targetAltBom}</strong></span>
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {row.componentCount !== undefined && row.componentCount > 0 ? (
                              <span className="comp-count-badge">{row.componentCount}</span>
                            ) : (
                              <span style={{ color: 'var(--sap-text-subtle)' }}>-</span>
                            )}
                          </td>
                          <td>
                            <span className={`sap-status-chip chip-${row.status.toLowerCase()}`}>
                              {isRowValid && <CheckCircle2 size={11} />}
                              {isRowWarn && <AlertTriangle size={11} />}
                              {isRowError && <XCircle size={11} />}
                              {row.status === 'PENDING' && 'Not validated'}
                              {row.status === 'VALID' && 'Ready'}
                              {row.status === 'WARNING' && 'Warning'}
                              {row.status === 'ERROR' && 'Error'}
                              {row.status === 'SUCCESS' && 'Copied'}
                              {row.status === 'FAILED' && 'Failed'}
                            </span>
                          </td>
                          <td>
                            <div className="message-cell">
                              {isRowError && (row.problems?.length > 0 || (row.message && row.message.startsWith('Cannot copy:'))) ? (
                                <BlockedReasonsList
                                  problems={row.problems || row.message}
                                  totalBoms={row.totalBomsSimulated}
                                  message={row.message}
                                  compact={true}
                                />
                              ) : (
                                <span className="cell-msg-text">{row.message}</span>
                              )}
                              {row.bomNumber && (
                                <span className="bom-num-tag">SAP BOM: {row.bomNumber}</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div className="sap-bulk-modal-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {executionReport && (
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={handleExportResults}
                style={{ height: 28, fontSize: '11px', padding: '0 10px' }}
              >
                <Download size={13} />
                <span>Export Report (.xlsx)</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={onBack}
              disabled={isExecuting}
              style={{ height: 28, fontSize: '11px', padding: '0 10px' }}
            >
              Launchpad
            </button>

            {parsedRows.length > 0 && !executionReport && (
              <>
                <button
                  type="button"
                  className="sap-btn sap-btn-secondary"
                  onClick={handleValidateWithSap}
                  disabled={isValidating || isExecuting}
                  style={{ height: 28, fontSize: '11px', padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  {isValidating ? (
                    <>
                      <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                      <span>Validating with SAP...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={13} />
                      <span>{validationReport ? 'Re-validate' : 'Validate with SAP'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="sap-btn sap-btn-primary execute-batch-copy-btn"
                  onClick={handleExecuteBatchCopy}
                  disabled={!validationReport || isExecuting || (validCount === 0 && warningCount === 0)}
                  style={{ height: 28, fontSize: '11px', padding: '0 12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                >
                  {isExecuting ? (
                    <>
                      <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                      <span>Executing Sequential RFC Copy...</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} />
                      <span>Execute Batch Copy ({validationReport ? validCount + warningCount : 0})</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
