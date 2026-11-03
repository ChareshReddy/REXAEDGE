import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import FioriPageHeader from './FioriPageHeader';
import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  FilePlus,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Loader2,
  FileSpreadsheet
} from 'lucide-react';
import Modal from './Modal';
import BulkUploadPanel from './BulkUploadPanel';
import {
  BulkFlowContainer,
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard,
  CREATE_BULK_COLUMNS
} from './BulkBomShared';
import { parseBomSpreadsheetClient } from '../utils/bomSpreadsheetParser';
import { cleanDiagnosticMessage } from './BlockedReasonsList';
import {
  preflightCreateBoms,
  createBulkBoms,
  createSingleBom,
  downloadCreateBomTemplate,
  startBomJob,
  getBomJob,
  cancelBomJob,
  getActiveBomJob,
  getPlants
} from '../services/api';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';

export default function BulkCreateBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom,
  initialPreflightReport = null,
  initialExecutionReport = null,
  initialIsValidating = false,
  initialJobProgress = null,
  initialActiveJobId = null
}) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState(
    initialExecutionReport ? 'Sample_BOM_File.xlsx' : initialPreflightReport ? 'Sample_BOM_File.xlsx' : ''
  );
  const [fileBase64, setFileBase64] = useState('');
  const [parsedBoms, setParsedBoms] = useState(
    initialExecutionReport?.boms || initialPreflightReport?.boms || []
  );
  const [activeStep, setActiveStep] = useState(
    initialExecutionReport ? 3 : (initialPreflightReport || initialIsValidating) ? 2 : 1
  );

  // Pre-flight states
  const [isValidating, setIsValidating] = useState(initialIsValidating);
  const [preflightReport, setPreflightReport] = useState(initialPreflightReport);
  const [parseError, _setParseError] = useState('');
  const setParseError = (msg, err = null) => {
    _setParseError(typeof msg === 'string' ? msg : '');
    if (err) {
      const info = extractErrorInfo(err, typeof msg === 'string' ? msg : 'Error processing bulk BOM file.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } else if (msg) {
      const info = extractErrorInfo(msg);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    }
  };
  const [expandedMessageBoms, setExpandedMessageBoms] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  // Reset pagination & message expand when preflightReport changes
  useEffect(() => {
    setCurrentPage(1);
    setExpandedMessageBoms(new Set());
  }, [preflightReport]);

  const toggleMessageExpand = (bomKey) => {
    setExpandedMessageBoms((prev) => {
      const next = new Set(prev);
      if (next.has(bomKey)) {
        next.delete(bomKey);
      } else {
        next.add(bomKey);
      }
      return next;
    });
  };

  const getBomMessages = (bom) => {
    const errorList = [];
    const warningList = [];
    const seen = new Set();

    const addError = (msg) => {
      if (!msg || typeof msg !== 'string') return;
      const cleaned = cleanDiagnosticMessage(msg);
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        errorList.push(cleaned);
      }
    };

    const addWarning = (msg) => {
      if (!msg || typeof msg !== 'string') return;
      const cleaned = cleanDiagnosticMessage(msg);
      if (cleaned && !seen.has(cleaned)) {
        seen.add(cleaned);
        warningList.push(cleaned);
      }
    };

    if (bom.status === 'Invalid' && bom.reason) {
      addError(bom.reason);
    }
    if (Array.isArray(bom.errors)) {
      bom.errors.forEach(addError);
    }
    if (bom.status === 'Already exists - skipped' && bom.reason) {
      addWarning(bom.reason);
    }
    if (Array.isArray(bom.warnings)) {
      bom.warnings.forEach(addWarning);
    }

    if (Array.isArray(bom.components)) {
      bom.components.forEach((c) => {
        if (Array.isArray(c.errors)) c.errors.forEach(addError);
        if (typeof c.error === 'string') addError(c.error);
        if (Array.isArray(c.warnings)) c.warnings.forEach(addWarning);
        if (typeof c.warning === 'string') addWarning(c.warning);
      });
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
  };

  // Execution states
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [businessReason, setBusinessReason] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionReport, setExecutionReport] = useState(initialExecutionReport);

  // Background Job States
  const [activeJobId, setActiveJobId] = useState(initialActiveJobId);
  const [activeJobType, setActiveJobType] = useState(initialActiveJobId ? 'create_preflight' : null);
  const [jobCurrentBom, setJobCurrentBom] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [jobProgress, setJobProgress] = useState(
    initialJobProgress || {
      current: 0,
      total: 0,
      percent: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      notProcessedCount: 0
    }
  );
  const pollIntervalRef = useRef(null);

  const fileInputRef = useRef(null);
  const isProd = systemKey === 'PROD';
  const isLocked = isValidating || isExecuting;
  const showSlimHeader = Boolean(parsedBoms.length > 0 || preflightReport || isValidating || isExecuting);

  // Plant tooltips map: code -> "1001 · Plant name (City)"
  const [plantMap, setPlantMap] = useState({});
  useEffect(() => {
    getPlants().then((res) => {
      const map = {};
      (res?.data || []).forEach((p) => {
        map[p.werks] = `${p.werks} · ${p.name1}${p.ort01 ? ' (' + p.ort01 + ')' : ''}`;
      });
      setPlantMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    activityTracker.setOperation('bulk_create_bom', isValidating || isExecuting);
    return () => activityTracker.setOperation('bulk_create_bom', false);
  }, [isValidating, isExecuting]);

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Poll a running background job every 2 seconds
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
          skippedCount: job.skippedCount || 0,
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

          if (type === 'create_preflight') {
            setIsValidating(false);
            if (job.status === 'STOPPED_ON_CONNECTION_DROP') {
              setParseError(`Data validation stopped: SAP connection dropped. (${job.error || 'Network error'})`);
            } else if (job.status === 'FAILED') {
              setParseError(job.error || 'Data validation failed.');
            } else {
              setPreflightReport({
                success: true,
                totalBoms: job.results.length,
                readyCount: job.successCount,
                skippedCount: job.skippedCount,
                invalidCount: job.failedCount,
                boms: job.results
              });
              setActiveStep(2);
            }
          } else if (type === 'create_bulk') {
            setIsExecuting(false);
            setExecutionReport({
              success: job.status === 'COMPLETED',
              status: job.status,
              message:
                job.error ||
                (job.status === 'CANCELLED'
                  ? 'Execution cancelled by user.'
                  : job.status === 'STOPPED_ON_CONNECTION_DROP'
                  ? 'Execution stopped: SAP connection dropped. Remaining BOMs marked not processed.'
                  : 'Bulk BOM creation finished.'),
              totalProcessed: job.total,
              bomsCreated: job.successCount,
              componentsCreated: (job.results || []).reduce(
                (acc, r) => acc + (r.componentsCount || 0),
                0
              ),
              skippedCount: job.skippedCount,
              failedCount: job.failedCount,
              notProcessedCount: job.notProcessedCount || 0,
              results: job.results || []
            });
          }
        }
      } catch (pollErr) {
        console.warn('Job polling warning:', pollErr.message);
      }
    }, 2000);
  };

  // Reconnect to in-flight active job on page mount/reload
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        const res = await getActiveBomJob();
        if (!isMounted || !res.success || !res.hasActiveJob || !res.job) return;
        const job = res.job;
        if (job.type === 'create_preflight') {
          setIsValidating(true);
          startJobPolling(job.jobId, 'create_preflight');
        } else if (job.type === 'create_bulk') {
          setIsExecuting(true);
          startJobPolling(job.jobId, 'create_bulk');
        }
      } catch (err) {
        console.warn('Active job verification check:', err.message);
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
      alert(err.response?.data?.message || err.message || 'Failed to request job cancellation.');
      setIsCancelling(false);
    }
  };

  const handleReset = () => {
    if (isLocked) return;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setFile(null);
    setFileName('');
    setFileBase64('');
    setParsedBoms([]);
    setPreflightReport(null);
    setParseError('');
    setExpandedMessageBoms(new Set());
    setCurrentPage(1);
    setIsExecuting(false);
    setActiveJobId(null);
    setJobCurrentBom(null);
    setIsCancelling(false);
    setExecutionReport(null);
    setActiveStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileProcess = (fileObj) => {
    if (isLocked) return;
    setParseError('');
    setPreflightReport(null);
    setExecutionReport(null);
    setParsedBoms([]);
    setActiveStep(1);

    if (!fileObj) return;

    setFile(fileObj);
    setFileName(fileObj.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const res = parseBomSpreadsheetClient(buffer);
        if (!res.success) {
          setParseError(res.error);
          return;
        }

        setParsedBoms(res.boms);

        // Convert to base64 for background validation job when user clicks Validate
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        setFileBase64(btoa(binary));
      } catch (err) {
        console.error('Failed to parse file client-side:', err);
        setParseError(`Failed to parse file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(fileObj);
  };

  const handleValidateWithSap = async () => {
    if (parsedBoms.length === 0) {
      toast.warning('Please upload a spreadsheet first.', { title: 'Validation notice' });
      return;
    }
    if (isLocked) return;
    setIsValidating(true);
    setParseError('');

    try {
      const res = await startBomJob({
        type: 'create_preflight',
        fileContent: fileBase64 || null,
        boms: parsedBoms,
        fileName: file?.name || fileName
      });

      if (res.success && res.jobId) {
        setJobProgress({
          current: 0,
          total: res.total,
          percent: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          notProcessedCount: 0
        });
        startJobPolling(res.jobId, 'create_preflight');
      } else {
        setParseError(res.message || 'Failed to start data validation job.');
        setIsValidating(false);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || err.message || 'Error processing validation job.');
      setIsValidating(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (isLocked) return;
    try {
      await downloadCreateBomTemplate();
    } catch (err) {
      toast.error('Failed to download BOM template: ' + (err.message || 'network error'));
    }
  };

  const handleOpenConfirm = () => {
    if (isLocked || readyCount === 0) return;
    setConfirmText('');
    setBusinessReason('');
    setIsConfirmModalOpen(true);
  };

  const handleExecuteBatch = async () => {
    if (isLocked) return;
    if (isProd) {
      if (confirmText !== 'CONFIRM') {
        toast.warning('Please type CONFIRM in uppercase to proceed in Production.', { title: 'Validation notice' });
        return;
      }
      if (!businessReason.trim()) {
        toast.warning('Please provide a valid business reason for Production execution.', { title: 'Validation notice' });
        return;
      }
    }

    const allBoms = preflightReport?.boms || parsedBoms || [];
  const hasValidated = Boolean(preflightReport);
    const readyBoms = allBoms.filter((b) => b.status === 'Ready');
    if (readyBoms.length === 0) {
      toast.warning('No ready BOMs to create.', { title: 'Validation notice' });
      return;
    }

    setIsConfirmModalOpen(false);
    setIsExecuting(true);
    setActiveStep(3);
    setExecutionReport(null);

    try {
      const res = await startBomJob({
        type: 'create_bulk',
        boms: readyBoms,
        fileName,
        confirmText: isProd ? confirmText : undefined,
        reason: isProd ? businessReason : undefined
      });

      if (res.success && res.jobId) {
        setJobProgress({
          current: 0,
          total: res.total,
          percent: 0,
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
          notProcessedCount: 0
        });
        startJobPolling(res.jobId, 'create_bulk');
      } else {
        setParseError(res.message || 'Failed to start bulk creation job.');
        setIsExecuting(false);
      }
    } catch (err) {
      setParseError(err.response?.data?.message || err.message || 'Failed to start bulk creation job.');
      setIsExecuting(false);
    }
  };

  const handleExportResults = () => {
    if (!executionReport || !executionReport.results) return;

    const rows = executionReport.results.map((r) => ({
      'Sequence Num': r.sequenceNum,
      'Material': r.material,
      'Plant': r.plant,
      'Usage': r.bomUsage,
      'Alternative': r.alternativeBom,
      'Created BOM Number': r.bomNumber || '-',
      'Status': r.status,
      'Components Count': r.componentsCount || 0,
      'Message / Discrepancies': r.discrepancies?.length > 0
        ? r.discrepancies.join(' | ')
        : r.message
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 14 },
      { wch: 18 },
      { wch: 10 },
      { wch: 8 },
      { wch: 12 },
      { wch: 20 },
      { wch: 12 },
      { wch: 18 },
      { wch: 45 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Creation_Results');
    XLSX.writeFile(wb, `BOM_Creation_Results_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const readyCount = preflightReport?.readyCount || 0;
  const skippedCount = preflightReport?.skippedCount || 0;
  const invalidCount = preflightReport?.invalidCount || 0;

  const allBoms = preflightReport?.boms || parsedBoms || [];
  const hasValidated = Boolean(preflightReport);
  const totalComponentRows = allBoms.reduce((acc, b) => acc + (b.components?.length || 1), 0);
  const isPaginated = totalComponentRows > 300;
  const pageSize = 50;
  const totalPages = isPaginated ? Math.ceil(allBoms.length / pageSize) : 1;
  const displayedBoms = isPaginated
    ? allBoms.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : allBoms;

  return (
    <div className="fiori-launchpad-root">
      {/* Page Header */}
      <FioriPageHeader
        title="Create Bulk BOM"
        subtitle="Mass create Bills of Materials from an Excel or TSV spreadsheet"
        onBack={onBack}
        backTitle={isLocked ? 'Operation in progress' : 'Back to Create BOM'}
        isLocked={isLocked}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('bulk_create_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked })}
      />

      <BulkFlowContainer>
        {/* Workflow Steps Indicator */}
        <BulkWorkflowSteps activeStep={activeStep} type="create" />
        {/* RESULTS SCREEN */}
        {executionReport ? (
          <div>
            {/* Success / Partial / Failed Banner */}
            {executionReport.failedCount === 0 ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--sap-success-bg)',
                  border: '1px solid var(--sap-success-border)',
                  color: 'var(--sap-success)',
                  marginBottom: 24
                }}
              >
                <CheckCircle2 size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Batch Creation Completed Successfully</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Created {executionReport.bomsCreated} BOM(s) and {executionReport.componentsCreated} component(s) across {executionReport.totalProcessed} total entries.
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--sap-warning-bg)',
                  border: '1px solid var(--sap-warning-border)',
                  color: 'var(--sap-warning)',
                  marginBottom: 24
                }}
              >
                <AlertTriangle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Batch Creation Completed with Issues</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Created {executionReport.bomsCreated} BOM(s); {executionReport.failedCount} failed and {executionReport.skippedCount} were skipped.
                  </p>
                </div>
              </div>
            )}

            {/* Summary Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
                marginBottom: 28
              }}
            >
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>BOMs Created</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-success)' }}>
                  {executionReport.bomsCreated}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Total Components</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                  {executionReport.componentsCreated}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Skipped (Existing)</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-warning)' }}>
                  {executionReport.skippedCount}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Failed</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-error)' }}>
                  {executionReport.failedCount}
                </div>
              </div>
              {executionReport.notProcessedCount > 0 && (
                <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Not Processed</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#f97316' }}>
                    {executionReport.notProcessedCount}
                  </div>
                </div>
              )}
            </div>

            {/* Results Table */}
            <div className="sap-card" style={{ padding: 20, marginBottom: 24 }}>
              <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="sap-section-header" style={{ margin: 0 }}>
                  Execution Details ({executionReport.results?.length || 0})
                </h3>
                <button
                  type="button"
                  className="sap-button sap-btn sap-btn-secondary"
                  onClick={handleExportResults}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px' }}
                >
                  <Download size={15} />
                  <span>Export Results</span>
                </button>
              </div>

              <div className="sap-table-container fiori-table-wrapper" style={{ maxHeight: 380 }}>
                <table className="sap-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}>
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '30%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ width: 60, textAlign: 'center' }}>Seq</th>
                      <th style={{ minWidth: 140 }}>Material</th>
                      <th style={{ width: 80 }}>Plant</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Usage</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Alt</th>
                      <th style={{ minWidth: 140 }}>BOM Number</th>
                      <th style={{ width: 100, textAlign: 'center' }}>Status</th>
                      <th style={{ minWidth: 240 }}>Message / Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(executionReport.results || []).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>{row.sequenceNum}</td>
                        <td style={{ fontWeight: 600 }}>{row.material}</td>
                        <td>{row.plant}</td>
                        <td style={{ textAlign: 'center' }}>{row.bomUsage}</td>
                        <td style={{ textAlign: 'center' }}>{row.alternativeBom}</td>
                        <td>{row.bomNumber || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className={`sap-badge ${
                              row.status === 'SUCCESS'
                                ? 'sap-badge-success'
                                : row.status === 'PARTIAL'
                                ? 'sap-badge-warning'
                                : row.status === 'SKIPPED'
                                ? 'sap-badge-info'
                                : 'sap-badge-warning'
                            }`}
                          >
                            {row.status ? row.status.charAt(0).toUpperCase() + row.status.slice(1).toLowerCase() : ''}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {row.discrepancies?.length > 0 ? (
                            <span style={{ color: 'var(--sap-warning)' }}>
                              Discrepancies: {row.discrepancies.join(', ')}
                            </span>
                          ) : (
                            row.message
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="sap-button primary"
                onClick={onBack}
                style={{ height: 30, padding: '0 20px', fontSize: 'var(--sap-size-button)' }}
              >
                Return to Launchpad
              </button>
              <button
                type="button"
                className="sap-button"
                onClick={handleReset}
                style={{ height: 30, padding: '0 20px', fontSize: 'var(--sap-size-button)' }}
              >
                Upload Another File
              </button>
            </div>
          </div>
        ) : (
          /* UPLOAD & PREVIEW VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'flex-start', gap: allBoms.length > 0 ? 16 : 24 }}>
            {allBoms.length === 0 ? (
              /* Shared Bulk Upload Panel (shown before upload) */
              <BulkUploadPanel
                title="Upload Spreadsheet"
                helperText="Upload a spreadsheet to create multiple Bills of Materials in SAP."
                acceptedFormats=".xlsx,.xls,.tsv,.txt"
                supportedFormatsText="Supports tab-separated text saved as .XLS, or Excel .xlsx / .xls"
                fileName={fileName}
                onFile={handleFileProcess}
                loading={isValidating}
                loadingText="Validating your data in SAP..."
                disabled={isLocked}
                templateAction={{
                  label: 'Download Template',
                  onClick: handleDownloadTemplate,
                  disabled: isLocked
                }}
                error={parseError}
                onClear={handleReset}
              />
            ) : (
              <>
                {/* ACTIVE BACKGROUND JOB PROGRESS CARD */}
                <BulkJobProgressCard
                  isValidating={isValidating}
                  isExecuting={isExecuting}
                  activeJobId={activeJobId}
                  jobProgress={jobProgress}
                  jobCurrentBom={jobCurrentBom}
                  isCancelling={isCancelling}
                  onCancelJob={handleCancelJob}
                  validationLabel="Validating data in SAP"
                  executionLabel="Creating BOMs in SAP"
                />



                

                {/* PRE-FLIGHT PREVIEW TABLE */}
                <div className="sap-card" style={{ padding: 20 }}>
                  {/* Header & Controls */}
                  <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 className="sap-section-header" style={{ margin: 0 }}>
                        Data Preview
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginTop: 2 }}>
                        {allBoms.length} BOM(s) found across {totalComponentRows} component row(s)
                      </div>
                    </div>

                    {fileName && (
                      <span
                        className="sap-file-badge"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 12px',
                          background: 'var(--sap-surface-subtle, #f1f5f9)',
                          border: '1px solid var(--sap-border-subtle, #cbd5e1)',
                          borderRadius: '6px',
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: 'var(--sap-text-dark, #0f2744)'
                        }}
                        title={fileName}
                      >
                        <FileSpreadsheet size={15} color="var(--sap-primary, #0070f2)" style={{ flexShrink: 0 }} />
                        <span style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fileName}
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Pagination Controls if > 300 component rows */}
                  {isPaginated && totalPages > 1 && (
                    <div
                      className="bulk-preview-pagination"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 4px',
                        fontSize: 12.5,
                        color: 'var(--sap-text-muted)',
                        borderBottom: '1px solid var(--sap-border-subtle, #e2e8f0)',
                        marginBottom: 14
                      }}
                    >
                      <span>
                        Showing BOMs {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, allBoms.length)} of {allBoms.length} (Page {currentPage} of {totalPages})
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="sap-button pagination-prev-btn"
                          disabled={currentPage <= 1 || isLocked}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          style={{ height: 26, padding: '0 10px', fontSize: 12 }}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="sap-button pagination-next-btn"
                          disabled={currentPage >= totalPages || isLocked}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          style={{ height: 26, padding: '0 10px', fontSize: 12 }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Table: natural height, fits card width without horizontal scroll */}
                  <div className="sap-table-container fiori-table-wrapper sap-card-table-scroll" style={{ width: '100%', marginBottom: 0, maxHeight: 480, minHeight: 0, height: 'auto', overflowX: 'auto', overflowY: 'auto' }}>
                    <table
                      className="sap-table preflight-preview-table"
                      style={{
                        width: '100%',
                        tableLayout: 'fixed',
                        borderCollapse: 'collapse',
                        fontSize: 12.5
                      }}
                    >
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '21%' }} />
                        <col style={{ width: '4.5%' }} />
                        <col style={{ width: '4.5%' }} />
                        <col style={{ width: '3.5%' }} />
                        <col style={{ width: '7.5%' }} />
                        <col style={{ width: '6.5%' }} />
                        <col style={{ width: '4.5%' }} />
                        <col style={{ width: '3.5%' }} />
                        <col style={{ width: '21%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '14.5%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ whiteSpace: 'nowrap' }}>
                          <th className="col-seq" title="Sequence Number" style={{ width: '4%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>Seq</th>
                          <th className="col-material" title="Material Number" style={{ width: '21%', padding: '6px 6px', whiteSpace: 'nowrap' }}>Material</th>
                          <th className="col-plant" title="Plant" style={{ width: '4.5%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>Plant</th>
                          <th className="col-usage col-usage-narrow narrow-usage" title="BOM Usage" style={{ width: '4.5%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>
                            Usage
                          </th>
                          <th className="col-alt" title="Alternative BOM" style={{ width: '3.5%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>Alt</th>
                          <th className="col-valid-from" title="Valid From Date" style={{ width: '7.5%', textAlign: 'center', padding: '6px 3px', whiteSpace: 'nowrap' }}>Valid From</th>
                          <th className="col-base-qty" title="Base Quantity" style={{ width: '6.5%', textAlign: 'right', padding: '6px 3px', whiteSpace: 'nowrap' }}>Base Qty</th>
                          <th className="col-bom-status col-status" title="BOM Status" style={{ width: '4.5%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>Status</th>
                          <th className="col-item-cat col-cat" title="Item Category" style={{ width: '3.5%', textAlign: 'center', padding: '6px 2px', whiteSpace: 'nowrap' }}>Cat</th>
                          <th className="col-component" title="Component Material" style={{ width: '21%', padding: '6px 6px', whiteSpace: 'nowrap' }}>Component</th>
                          <th className="col-qty" title="Component Quantity" style={{ width: '5%', textAlign: 'right', padding: '6px 3px', whiteSpace: 'nowrap' }}>Qty</th>
                          <th className="col-result" title="Validation Result" style={{ width: '14.5%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedBoms.map((bom, bIdx) => {
                          const bomKey = bom.sequenceNum || String(bIdx);
                          const compList = Array.isArray(bom.components) && bom.components.length > 0 ? bom.components : [{}];
                          const span = compList.length;
                          const messages = getBomMessages(bom);
                          const isMessagesExpanded = expandedMessageBoms.has(bomKey);

                          return (
                            <React.Fragment key={`bom-group-${bomKey}`}>
                              {compList.map((comp, compIdx) => {
                                if (compIdx === 0) {
                                  return (
                                    <tr
                                      key={`bom-${bomKey}-comp-0`}
                                      className="bom-group-first-row component-row"
                                      style={{ borderTop: '2px solid var(--sap-border, #cbd5e1)' }}
                                    >
                                      {/* 1. Seq */}
                                      <td
                                        rowSpan={span}
                                        className="col-seq"
                                        style={{
                                          textAlign: 'center',
                                          color: 'var(--sap-text-muted)',
                                          fontWeight: 600,
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.sequenceNum}
                                      </td>

                                      {/* 2. Material */}
                                      <td
                                        rowSpan={span}
                                        className="col-material"
                                        title={bom.material}
                                        style={{
                                          padding: '5px 6px',
                                          fontWeight: 600,
                                          fontFamily: 'monospace, monospace',
                                          fontVariantNumeric: 'tabular-nums',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff'
                                        }}
                                      >
                                        <span className="bom-mat-code" title={bom.material} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {bom.material}
                                        </span>
                                      </td>

                                      {/* 3. Plant */}
                                      <td
                                        rowSpan={span}
                                        className="col-plant"
                                        title={plantMap[bom.plant] || bom.plant}
                                        style={{
                                          textAlign: 'center',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.plant}
                                      </td>

                                      {/* 4. Usage */}
                                      <td
                                        rowSpan={span}
                                        className="col-usage col-usage-narrow narrow-usage"
                                        style={{
                                          textAlign: 'center',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.bomUsage}
                                      </td>

                                      {/* 5. Alt */}
                                      <td
                                        rowSpan={span}
                                        className="col-alt"
                                        style={{
                                          textAlign: 'center',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.alternativeBom}
                                      </td>

                                      {/* 6. Valid From */}
                                      <td
                                        rowSpan={span}
                                        className="col-valid-from"
                                        style={{
                                          textAlign: 'center',
                                          padding: '5px 3px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis'
                                        }}
                                      >
                                        {bom.validFrom || '-'}
                                      </td>

                                      {/* 7. Base Qty */}
                                      <td
                                        rowSpan={span}
                                        className="col-base-qty"
                                        style={{
                                          textAlign: 'right',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 3px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.baseQty ?? 1}
                                      </td>

                                      {/* 8. Status */}
                                      <td
                                        rowSpan={span}
                                        className="col-bom-status col-status"
                                        style={{
                                          textAlign: 'center',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.bomStatus || '-'}
                                      </td>

                                      {/* 9. Item Cat */}
                                      <td
                                        className="col-item-cat col-cat"
                                        style={{
                                          textAlign: 'center',
                                          padding: '5px 2px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {comp.itemCat || comp.itemCategory || (comp.component ? 'L' : '-')}
                                      </td>

                                      {/* 10. Component */}
                                      <td
                                        className="col-component"
                                        title={comp.component || ''}
                                        style={{
                                          padding: '5px 6px',
                                          fontFamily: 'monospace, monospace',
                                          fontVariantNumeric: 'tabular-nums',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff'
                                        }}
                                      >
                                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.component || ''}>
                                          {comp.component || '-'}
                                        </span>
                                      </td>

                                      {/* 11. Qty */}
                                      <td
                                        className="col-qty"
                                        style={{
                                          textAlign: 'right',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '5px 3px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {comp.quantity ?? '-'}
                                      </td>

                                      {/* 12. Result Badge */}
                                      <td
                                        rowSpan={span}
                                        className="col-result"
                                        style={{
                                          textAlign: 'center',
                                          padding: '5px 4px',
                                          whiteSpace: 'nowrap',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff'
                                        }}
                                      >
                                        {!hasValidated ? (
                                          <span
                                            className="sap-badge sap-badge-neutral"
                                            style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}
                                          >
                                            Not validated
                                          </span>
                                        ) : (
                                          <span
                                            className={`sap-badge ${
                                              bom.status === 'Ready'
                                                ? 'sap-badge-success'
                                                : bom.status === 'Already exists - skipped' || bom.status === 'Already exists'
                                                ? 'sap-badge-warning'
                                                : 'sap-badge-warning'
                                            }`}
                                            style={{ fontSize: 11, padding: '3px 8px', whiteSpace: 'nowrap', display: 'inline-block' }}
                                          >
                                            {bom.status === 'Already exists - skipped' ? 'Already exists' : bom.status}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                }

                                return (
                                  <tr
                                    key={`bom-${bomKey}-comp-${compIdx}`}
                                    className="component-row"
                                  >
                                    {/* 9. Item Cat */}
                                    <td
                                      className="col-item-cat col-cat"
                                      style={{
                                        textAlign: 'center',
                                        padding: '5px 2px',
                                        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                        background: '#ffffff',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {comp.itemCat || comp.itemCategory || (comp.component ? 'L' : '-')}
                                    </td>

                                    {/* 10. Component */}
                                    <td
                                      className="col-component"
                                      title={comp.component || ''}
                                      style={{
                                        padding: '5px 6px',
                                        fontFamily: 'monospace, monospace',
                                        fontVariantNumeric: 'tabular-nums',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                        background: '#ffffff'
                                      }}
                                    >
                                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.component || ''}>
                                        {comp.component || '-'}
                                      </span>
                                    </td>

                                    {/* 11. Qty */}
                                    <td
                                      className="col-qty"
                                      style={{
                                        textAlign: 'right',
                                        fontVariantNumeric: 'tabular-nums',
                                        padding: '5px 3px',
                                        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                        background: '#ffffff',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {comp.quantity ?? '-'}
                                    </td>
                                  </tr>
                                );
                              })}

                              {/* Message Row if BOM has errors, warnings, or an existence note */}
                              {messages.total > 0 && (
                                <tr className="bom-messages-row" key={`bom-${bomKey}-messages`}>
                                  <td
                                    colSpan={12}
                                    style={{
                                      whiteSpace: 'normal',
                                      padding: '8px 16px',
                                      backgroundColor: 'var(--sap-surface-subtle, #f8fafc)',
                                      borderTop: '1px dashed var(--sap-border-subtle, #e2e8f0)',
                                      borderBottom: '2px solid var(--sap-border, #cbd5e1)',
                                      fontSize: 12,
                                      lineHeight: 1.45
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      {(isMessagesExpanded ? messages.all : messages.all.slice(0, 3)).map((item, mIdx) => (
                                        <div
                                          key={mIdx}
                                          className={`bom-msg-item bom-msg-${item.type}`}
                                          style={{
                                            color: item.type === 'error' ? 'var(--sap-error-text, #b45309)' : 'var(--sap-warning, #d97706)',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: 6
                                          }}
                                        >
                                          <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
                                            {item.type === 'error' ? (
                                              <AlertCircle size={13} style={{ color: 'var(--sap-error-text, #b45309)' }} />
                                            ) : (
                                              <AlertTriangle size={13} style={{ color: 'var(--sap-warning, #d97706)' }} />
                                            )}
                                          </span>
                                          <span style={{ wordBreak: 'break-word', color: 'var(--sap-text-dark, #0f172a)' }}>{item.text}</span>
                                        </div>
                                      ))}
                                      {messages.all.length > 3 && (
                                        <div style={{ marginTop: 2 }}>
                                          <button
                                            type="button"
                                            className="toggle-messages-btn"
                                            onClick={() => toggleMessageExpand(bomKey)}
                                            style={{
                                              background: 'none',
                                              border: 'none',
                                              color: 'var(--sap-link, #0070f2)',
                                              cursor: 'pointer',
                                              padding: '2px 0',
                                              fontSize: 11,
                                              fontWeight: 600,
                                              textDecoration: 'underline'
                                            }}
                                          >
                                            {isMessagesExpanded ? 'Show less' : `+${messages.all.length - 3} more`}
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Sticky Summary & Action Controls Footer */}
                <div
                  className="bulk-preview-sticky-footer"
                  style={{
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 10,
                    background: 'var(--sap-card-bg, #ffffff)',
                    borderTop: '1px solid var(--sap-border, #e2e8f0)',
                    boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)',
                    padding: '14px 20px',
                    margin: '20px -20px -20px -20px',
                    borderRadius: '0 0 var(--radius-lg, 8px) var(--radius-lg, 8px)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}
                >
                  {/* Summary counts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sap-text-dark)', marginRight: 4 }}>
                      Validation Summary:
                    </span>
                    {!hasValidated ? (
                      <span className="sap-badge sap-badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                        Not validated ({allBoms.length} BOM{allBoms.length === 1 ? '' : 's'})
                      </span>
                    ) : (
                      <>
                        <span className="sap-badge sap-badge-success" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Ready: {readyCount}
                        </span>
                        <span className="sap-badge sap-badge-warning" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Skipped (Existing): {skippedCount}
                        </span>
                        <span className="sap-badge sap-badge-warning" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Invalid: {invalidCount}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      type="button"
                      className="sap-button"
                      disabled={isLocked}
                      onClick={isLocked ? undefined : handleReset}
                      style={{ height: 30, padding: '0 16px', fontSize: 'var(--sap-size-button)' }}
                    >
                      Clear & Upload Another
                    </button>

                    <button
                      type="button"
                      className="sap-button validate-with-sap-btn"
                      onClick={handleValidateWithSap}
                      disabled={isLocked || allBoms.length === 0}
                      style={{
                        height: 30,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '0 18px',
                        fontSize: 'var(--sap-size-button)'
                      }}
                    >
                      {isValidating ? (
                        <>
                          <Loader2 size={15} className="sap-spin" />
                          <span>Validating your data in SAP...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={15} />
                          <span>{hasValidated ? 'Re-validate data' : 'Validate data'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      className="sap-button primary create-ready-boms-btn"
                      disabled={!hasValidated || readyCount === 0 || isLocked}
                      onClick={handleOpenConfirm}
                      style={{ height: 30, padding: '0 24px', fontSize: 'var(--sap-size-button)' }}
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 size={16} className="sap-spin" />
                          <span>
                            {jobProgress.total > 0
                              ? `Creating ${jobProgress.current} of ${jobProgress.total}...`
                              : 'Creating in SAP...'}
                          </span>
                        </>
                      ) : (
                        <span>Create BOMs ({readyCount})</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          </div>
        )}
      </BulkFlowContainer>

        {/* CONFIRMATION MODAL */}
        <Modal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            if (!isExecuting) setIsConfirmModalOpen(false);
          }}
          title="Confirm Bulk BOM Creation"
        >
          <div style={{ padding: 4 }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--sap-text-dark)' }}>
              You are about to create <strong>{readyCount}</strong> BOM(s) in SAP from file <strong>{fileName}</strong>:
            </p>

            <div
              style={{
                background: 'var(--sap-surface-subtle)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                marginBottom: 16,
                fontSize: 13,
                lineHeight: 1.6
              }}
            >
              <div><strong>Ready BOMs to Create:</strong> {readyCount}</div>
              <div><strong>Skipped (Existing):</strong> {skippedCount}</div>
              <div><strong>Invalid (Will Not Run):</strong> {invalidCount}</div>
            </div>

            {isProd && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--sap-error-bg)',
                  border: '1px solid var(--sap-error-border)',
                  marginBottom: 16
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sap-error)', fontWeight: 700, marginBottom: 8 }}>
                  <ShieldCheck size={18} />
                  <span>Production System Protection</span>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label className="sap-form-label" style={{ fontSize: 12 }}>
                    Type <strong>CONFIRM</strong> to proceed:
                  </label>
                  <input
                    type="text"
                    className="sap-form-input"
                    placeholder="CONFIRM"
                    disabled={isExecuting}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                  />
                </div>
                <div>
                  <label className="sap-form-label" style={{ fontSize: 12 }}>
                    Business Reason*:
                  </label>
                  <input
                    type="text"
                    className="sap-form-input"
                    placeholder="e.g. Approved Engineering Change ECO-1049"
                    disabled={isExecuting}
                    value={businessReason}
                    onChange={(e) => setBusinessReason(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="sap-button"
                disabled={isExecuting}
                onClick={() => {
                  if (!isExecuting) setIsConfirmModalOpen(false);
                }}
                style={{ height: 30, padding: '0 16px', fontSize: 'var(--sap-size-button)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="sap-button primary"
                disabled={isExecuting}
                onClick={handleExecuteBatch}
                style={{ height: 30, padding: '0 18px', fontSize: 'var(--sap-size-button)' }}
              >
                {isExecuting ? (
                  <>
                    <Loader2 size={16} className="sap-spin" />
                    <span>
                      {jobProgress.total > 0
                        ? `Creating ${jobProgress.current} of ${jobProgress.total}...`
                        : 'Creating in SAP...'}
                    </span>
                  </>
                ) : (
                  'Confirm & Create'
                )}
              </button>
            </div>
          </div>
        </Modal>
    </div>
  );
}