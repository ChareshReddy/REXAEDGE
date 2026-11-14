import SingleBulkSwitch from './layout/SingleBulkSwitch';
import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import FioriPageHeader from './FioriPageHeader';
import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Search,
  ShieldCheck,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Loader2,
  FileSpreadsheet,
  Info,
  MinusCircle
} from 'lucide-react';
import Modal from './Modal';
import BulkUploadPanel from './BulkUploadPanel';
import {
  BulkFlowContainer,
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard,
  CREATE_BULK_COLUMNS,
  BulkStatTiles,
  BulkDataPreviewSection,
  normalizeBomStatus,
  getBomStatusCounts,
  filterBoms,
  mergeValidationIntoBoms,
  getBomMessages,
  BulkBomMessageRow,
  BulkBomResultBadge,
  BulkExecutionResultBadge,
  normalizeExecutionStatus,
  getExecutionRowMessages,
  resolveBomGroups,
  renderMessageContent,
  BulkExecutionResultsView
} from './BulkBomShared';
import { parseBomSpreadsheetClient } from '../utils/bomSpreadsheetParser';
import { SearchInput } from './ui/search-input';
import { FormSection } from './ui/form-layout';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [errorPopoverBom, setErrorPopoverBom] = useState(null);

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

  const [expandedResultRows, setExpandedResultRows] = useState(new Set());
  const toggleResultRowExpand = (key) => {
    setExpandedResultRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
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
  const [jobStatus, setJobStatus] = useState(null);
  const [queuedReason, setQueuedReason] = useState('');
  const [watchdogWarning, setWatchdogWarning] = useState('');
  const [jobError, setJobError] = useState('');
  const lastProgressRef = useRef({ processed: 0, lastChangedAt: Date.now(), startedAt: Date.now() });
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

  const updateJobUrl = (jobId) => {
    try {
      if (jobId) {
        sessionStorage.setItem('rexa_create_bulk_job_id', jobId);
        const url = new URL(window.location.href);
        url.searchParams.set('jobId', jobId);
        window.history.replaceState({}, '', url);
      } else {
        sessionStorage.removeItem('rexa_create_bulk_job_id');
        const url = new URL(window.location.href);
        url.searchParams.delete('jobId');
        window.history.replaceState({}, '', url);
      }
    } catch (_) {}
  };

  // Poll a running background job every 3 seconds
  const startJobPolling = (jobId, type, initialStatus = 'RUNNING', initialQueuedReason = '') => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setActiveJobId(jobId);
    setActiveJobType(type);
    updateJobUrl(jobId);
    setJobStatus(initialStatus);
    setQueuedReason(initialQueuedReason);
    setWatchdogWarning('');
    setJobError('');
    lastProgressRef.current = { processed: 0, lastChangedAt: Date.now(), startedAt: Date.now() };

    pollIntervalRef.current = setInterval(async () => {
      try {
        const now = Date.now();
        // 10-minute timeout watchdog
        if (now - lastProgressRef.current.startedAt >= 600000) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setActiveJobId(null);
          setJobStatus(null);
          setIsValidating(false);
          setIsExecuting(false);
          setIsCancelling(false);
          updateJobUrl(null);
          setWatchdogWarning('');
          setJobError('Operation timed out after 10 minutes. Please check your SAP connection or retry.');
          return;
        }

        let data;
        try {
          data = await getBomJob(jobId);
        } catch (apiErr) {
          const status = apiErr.response?.status;
          const elapsed = now - (lastProgressRef.current?.startedAt || now);
          if ((status === 404 || apiErr.message?.includes('not found')) && elapsed >= 10000) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setActiveJobId(null);
            setJobStatus(null);
            setIsValidating(false);
            setIsExecuting(false);
            setIsCancelling(false);
            updateJobUrl(null);
            setWatchdogWarning('');
            setJobError('Job not found. The job may have expired or been removed.');
            return;
          }
          if (status === 404) {
            // Grace period retry
            return;
          }
          console.warn('Job polling warning:', apiErr.message);
          return;
        }

        if (!data || !data.success || !data.job) {
          const elapsed = now - (lastProgressRef.current?.startedAt || now);
          if (elapsed >= 10000) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            setActiveJobId(null);
            setJobStatus(null);
            setIsValidating(false);
            setIsExecuting(false);
            setIsCancelling(false);
            updateJobUrl(null);
            setWatchdogWarning('');
            setJobError('Job not found. The job may have expired or been removed.');
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
          successCount: job.successCount || 0,
          failedCount: job.failedCount || 0,
          skippedCount: job.skippedCount || 0,
          notProcessedCount: job.notProcessedCount || 0
        }));
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
          setWatchdogWarning('');
          updateJobUrl(null);

          if (job.status === 'INTERRUPTED') {
            setIsValidating(false);
            setIsExecuting(false);
            setJobError('The job was interrupted. Please upload again.');
            return;
          }

          if (type === 'create_preflight') {
            setIsValidating(false);
            if (job.status === 'STOPPED_ON_CONNECTION_DROP') {
              setParseError(`Data validation stopped: SAP connection dropped. (${job.error || 'Network error'})`);
            } else if (job.status === 'FAILED') {
              setParseError(job.error || 'Data validation failed.');
            } else {
              const mergedBoms = mergeValidationIntoBoms(parsedBoms, job.results);
              setParsedBoms(mergedBoms);
              const counts = getBomStatusCounts(mergedBoms, true);
              setPreflightReport({
                success: true,
                totalBoms: mergedBoms.length,
                readyCount: counts.ready,
                skippedCount: counts.skipped,
                invalidCount: counts.errors,
                boms: mergedBoms
              });
              setActiveStep(2);
            }
          } else if (type === 'create_bulk') {
            setIsExecuting(false);
            setActiveStep(3);
            const rawResults = job.results || [];
            const bomsCreated = rawResults.filter((r) => normalizeExecutionStatus(r) === 'CREATED').length;
            const skippedCount = rawResults.filter((r) => normalizeExecutionStatus(r) === 'SKIPPED').length;
            const failedCount = rawResults.filter((r) => normalizeExecutionStatus(r) === 'FAILED').length;
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
              totalProcessed: rawResults.length,
              bomsCreated,
              componentsCreated: rawResults.reduce(
                (acc, r) => acc + (r.componentsCount || 0),
                0
              ),
              skippedCount,
              failedCount,
              notProcessedCount: job.notProcessedCount || 0,
              results: rawResults
            });
          }
        }
      } catch (pollErr) {
        console.warn('Job polling warning:', pollErr.message);
      }
    }, 1000);
  };

  // Reconnect to in-flight active job on page mount/reload
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        let savedJobId = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          savedJobId = urlParams.get('jobId') || sessionStorage.getItem('rexa_create_bulk_job_id');
        } catch (_) {}

        if (savedJobId) {
          const jobRes = await getBomJob(savedJobId);
          if (isMounted && jobRes && jobRes.success && jobRes.job) {
            const job = jobRes.job;
            const isFinished = [
              'COMPLETED',
              'COMPLETED_WITH_ERRORS',
              'CANCELLED',
              'STOPPED_ON_CONNECTION_DROP',
              'FAILED',
              'INTERRUPTED'
            ].includes(job.status);

            if (!isFinished) {
              if (job.type === 'create_preflight') {
                setIsValidating(true);
                startJobPolling(job.jobId, 'create_preflight');
                return;
              } else if (job.type === 'create_bulk') {
                setIsExecuting(true);
                setActiveStep(3);
                startJobPolling(job.jobId, 'create_bulk');
                return;
              }
            }
          }
        }

        const res = await getActiveBomJob();
        if (!isMounted || !res.success || !res.hasActiveJob || !res.job) return;
        const job = res.job;
        if (job.type === 'create_preflight') {
          setIsValidating(true);
          startJobPolling(job.jobId, 'create_preflight');
        } else if (job.type === 'create_bulk') {
          setIsExecuting(true);
          setActiveStep(3);
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
    updateJobUrl(null);
    setFile(null);
    setFileName('');
    setParsedBoms([]);
    setPreflightReport(null);
    setParseError('');
    setStatusFilter('all');
    setSearchTerm('');
    setExpandedMessageBoms(new Set());
    setExpandedResultRows(new Set());
    setCurrentPage(1);
    setIsExecuting(false);
    setActiveJobId(null);
    setJobCurrentBom(null);
    setIsCancelling(false);
    setExecutionReport(null);
    setActiveStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetryFailedRows = async () => {
    if (!executionReport || !executionReport.results) return;
    const failedResults = executionReport.results.filter(
      (r) => normalizeExecutionStatus(r) === 'FAILED'
    );
    if (failedResults.length === 0) return;

    const failedMats = new Set(failedResults.map((r) => String(r.material || '').trim().toUpperCase()));
    const failedSequenceNums = new Set(failedResults.map((r) => String(r.sequenceNum || r.id)));

    // Resolve groups from the original parsed BOMs (or execution inputs)
    const sourceBoms = parsedBoms.length > 0 ? parsedBoms : executionReport.results.map((r) => r.input || r);
    const groups = resolveBomGroups(sourceBoms);

    // Identify groups that had at least one failure
    const failedGroups = groups.filter((g) => {
      return g.members.some((m) => {
        const mat = String(m.material || '').trim().toUpperCase();
        const seq = String(m.sequenceNum || m.id);
        return failedMats.has(mat) || failedSequenceNums.has(seq);
      });
    });

    // Retry failed group as a whole: its failed and blocked rows together, excluding already-created rows
    const itemsToRetry = [];
    failedGroups.forEach((g) => {
      g.members.forEach((m) => {
        const mat = String(m.material || '').trim().toUpperCase();
        const execRow = executionReport.results.find((r) => String(r.material || '').trim().toUpperCase() === mat);
        const normStatus = execRow ? normalizeExecutionStatus(execRow) : 'FAILED';
        if (normStatus === 'FAILED' || normStatus === 'SKIPPED') {
          itemsToRetry.push({
            ...(m.input || m),
            status: 'Ready',
            errors: [],
            warnings: []
          });
        }
      });
    });

    if (itemsToRetry.length === 0) return;

    setExpandedResultRows(new Set());
    setParsedBoms(itemsToRetry);
    setExecutionReport(null);
    setActiveStep(3);
    setIsExecuting(true);
    setJobProgress({
      current: 0,
      total: itemsToRetry.length,
      percent: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      notProcessedCount: 0
    });

    try {
      const res = await startBomJob({
        type: 'create_bulk',
        items: itemsToRetry,
        options: { fileName: fileName || 'retry_failed_rows.xlsx' }
      });
      if (res.success && res.jobId) {
        startJobPolling(res.jobId, 'create_bulk', res.status || 'RUNNING', res.queuedReason || '');
      }
    } catch (err) {
      setParseError(err.message || 'Failed to retry failed rows.');
      setIsExecuting(false);
    }
  };

  const handleFileProcess = (fileObj) => {
    if (isLocked) return;
    setParseError('');
    setStatusFilter('all');
    setSearchTerm('');
    setCurrentPage(1);
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
        startJobPolling(res.jobId, 'create_preflight', res.status || 'RUNNING', res.queuedReason || '');
      } else {
        setParseError(res.message || 'Failed to start data validation job.');
        setIsValidating(false);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Error processing validation job.';
      setParseError(errMsg);
      if (err.response?.status === 413 || err.response?.data?.code === 'PAYLOAD_TOO_LARGE') {
        toast.error(errMsg, { title: 'Upload error' });
      }
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
        startJobPolling(res.jobId, 'create_bulk', res.status || 'RUNNING', res.queuedReason || '');
      } else {
        setParseError(res.message || 'Failed to start bulk creation job.');
        setIsExecuting(false);
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Failed to start bulk creation job.';
      setParseError(errMsg);
      if (err.response?.status === 413 || err.response?.data?.code === 'PAYLOAD_TOO_LARGE') {
        toast.error(errMsg, { title: 'Upload error' });
      }
      setIsExecuting(false);
    }
  };

  const handleExportResults = () => {
    if (!executionReport || !executionReport.results) return;

    const rows = executionReport.results.map((r) => {
      const rowMessages = getExecutionRowMessages(r);
      const noteText = (rowMessages.info && rowMessages.info.length > 0)
        ? rowMessages.info.join(' | ')
        : (Array.isArray(r.notes) ? r.notes.join(' | ') : (r.note || ''));

      return {
        'Sequence Num': r.sequenceNum,
        'Material': r.material,
        'Plant': r.plant,
        'Usage': r.bomUsage,
        'Alternative': r.alternativeBom,
        'Created BOM Number': r.bomNumber || '-',
        'Status': r.status,
        'Components Count': r.componentsCount || 0,
        'Notes': noteText || '-',
        'Message / Discrepancies': r.discrepancies?.length > 0
          ? r.discrepancies.join(' | ')
          : r.message
      };
    });

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

  const allBoms = preflightReport?.boms || parsedBoms || [];
  const hasValidated = Boolean(preflightReport);
  const statusCounts = useMemo(() => getBomStatusCounts(allBoms, hasValidated), [allBoms, hasValidated]);
  const readyCount = statusCounts.ready;
  const skippedCount = statusCounts.skipped;
  const invalidCount = statusCounts.errors;

  const totalComponentRows = allBoms.reduce((acc, b) => acc + (b.components?.length || 1), 0);
  const isPaginated = totalComponentRows > 300;
  const pageSize = 50;

  const filteredBoms = useMemo(
    () => filterBoms(allBoms, { statusFilter, searchTerm, hasValidated }),
    [allBoms, statusFilter, searchTerm, hasValidated]
  );

  const totalPages = isPaginated ? Math.ceil(filteredBoms.length / pageSize) : 1;
  const displayedBoms = isPaginated
    ? filteredBoms.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : filteredBoms;

  return (
    <div className="fiori-launchpad-root">
      {/* Page Header */}
      <FioriPageHeader
        title="Create Bulk BOM"
        extraTitleContent={<SingleBulkSwitch operation="create" mode="bulk" />}
        subtitle="Mass create Bills of Materials from an Excel or TSV spreadsheet"
        onBack={onBack}
        backTitle={isLocked ? 'Operation in progress' : 'Back to Create BOM'}
        isLocked={isLocked}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('bulk_create_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked })}
      />

      <BulkFlowContainer style={{ paddingTop: 8, paddingBottom: 24, gap: 14 }}>
        {/* Workflow Steps Indicator */}
        <BulkWorkflowSteps activeStep={activeStep} type="create" />
        {/* RESULTS SCREEN */}
        {executionReport ? (
          <BulkExecutionResultsView
            mode="create"
            report={executionReport}
            rows={executionReport.results || []}
            onBack={onBack}
            onReset={handleReset}
            onRetryFailedRows={handleRetryFailedRows}
            onExportResults={handleExportResults}
            renderMessageContent={renderMessageContent}
          />
        ) : (
          /* UPLOAD & PREVIEW VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'flex-start', gap: allBoms.length > 0 ? 16 : 24 }}>
            {activeStep === 1 || allBoms.length === 0 ? (
              /* Shared Bulk Upload Panel (shown in Step 1) */
              <BulkUploadPanel
                title="Upload Spreadsheet"
                helperText="Upload a spreadsheet to create multiple Bills of Materials in SAP."
                acceptedFormats=".xlsx,.xls,.tsv,.txt"
                supportedFormatsText="Accepted formats: .xlsx, .xls, .tsv, .txt"
                fileName={fileName}
                file={file}
                onFile={handleFileProcess}
                loading={isValidating}
                loadingText="Validating your data in SAP..."
                disabled={isLocked}
                templateAction={{
                  label: 'Download template',
                  onClick: handleDownloadTemplate,
                  disabled: isLocked
                }}
                columns={CREATE_BULK_COLUMNS}
                rowLimitText="Maximum 100 BOMs per job (batch)."
                tipText="Materials and components must exist in SAP. Plant codes must be 4 digits. Item category defaults to L (Stock)."
                error={parseError}
                onClear={handleReset}
                onContinue={() => {
                  if (allBoms.length > 0) {
                    setActiveStep(2);
                  }
                }}
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
                  jobStatus={jobStatus}
                  queuedReason={queuedReason}
                  watchdogWarning={watchdogWarning}
                />

                {/* Job Error or Interrupted Alert in Step 2 */}
                {jobStatus === 'INTERRUPTED' && (
                  <div
                    className="rx-alert rx-alert-danger sap-alert"
                    style={{
                      padding: '12px 16px',
                      marginBottom: 16,
                      borderRadius: 'var(--radius-md, 8px)',
                      backgroundColor: 'var(--color-danger-bg, #FEF3F2)',
                      border: '1px solid var(--color-danger-border, #FECDCA)',
                      color: 'var(--color-danger, #B42318)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertCircle size={18} style={{ flexShrink: 0, color: 'var(--color-danger, #B42318)' }} />
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>
                        The job was interrupted. Please upload again.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rx-btn rx-btn-secondary rx-btn-sm"
                      onClick={handleReset}
                      style={{
                        height: 'var(--size-button-sm-height, 32px)',
                        padding: '0 12px',
                        borderRadius: 'var(--radius-md, 8px)'
                      }}
                    >
                      Upload Again
                    </button>
                  </div>
                )}

                {jobError && (
                  <div
                    className="rx-alert rx-alert-danger sap-alert"
                    style={{
                      padding: '12px 16px',
                      marginBottom: 16,
                      borderRadius: 'var(--radius-md, 8px)',
                      backgroundColor: 'var(--color-danger-bg, #FEF3F2)',
                      border: '1px solid var(--color-danger-border, #FECDCA)',
                      color: 'var(--color-danger, #B42318)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertCircle size={18} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{jobError}</span>
                    </div>
                    <button
                      type="button"
                      className="rx-btn rx-btn-secondary rx-btn-sm"
                      onClick={() => setJobError('')}
                      style={{
                        height: 'var(--size-button-sm-height, 32px)',
                        padding: '0 12px',
                        borderRadius: 'var(--radius-md, 8px)'
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Summary Stat Tiles - Interactive Filter Strip (visible only after validation) */}
                {hasValidated && !isValidating && preflightReport && (
                  <BulkStatTiles
                    total={statusCounts.all}
                    valid={statusCounts.ready}
                    errors={statusCounts.errors}
                    warnings={statusCounts.skipped}
                    totalLabel="Total BOMs"
                    validLabel="Ready"
                    errorsLabel="Errors"
                    warningsLabel="Skipped"
                    activeFilter={statusFilter}
                    onFilterChange={(filter) => {
                      setStatusFilter(filter);
                      setCurrentPage(1);
                    }}
                  />
                )}

                {/* PRE-FLIGHT PREVIEW TABLE */}
                <BulkDataPreviewSection
                  title="Data Preview"
                  subtitle={`${allBoms.length} BOM(s) found across ${totalComponentRows} component row(s)`}
                  fileName={fileName}
                  showingCount={filteredBoms.length}
                  totalCount={allBoms.length}
                  searchTerm={searchTerm}
                  onSearchChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  onSearchClear={() => {
                    setSearchTerm('');
                    setCurrentPage(1);
                  }}
                  className="w-full"
                >
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
                  <div
                    className="sap-table-container fiori-table-wrapper sap-card-table-scroll"
                    style={{
                      width: '100%',
                      marginBottom: 0,
                      maxHeight: 480,
                      minHeight: 0,
                      height: 'auto',
                      overflowX: 'auto',
                      overflowY: 'auto',
                      border: '1px solid var(--color-border, #D9E2EC)',
                      borderRadius: 'var(--radius-md, 8px)',
                      boxSizing: 'border-box'
                    }}
                  >
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
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '22%', minWidth: 'var(--table-col-status-min-width, 140px)' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ whiteSpace: 'nowrap', backgroundColor: 'var(--table-header-bg)' }}>
                          <th className="col-seq" title="Sequence Number" style={{ width: '4%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Seq</th>
                          <th className="col-material" title="Material Number" style={{ width: '14%', textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' }}>Material</th>
                          <th className="col-plant" title="Plant" style={{ width: '5%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Plant</th>
                          <th className="col-usage col-usage-narrow narrow-usage" title="BOM Usage" style={{ width: '5%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>
                            Usage
                          </th>
                          <th className="col-alt" title="Alternative BOM" style={{ width: '4%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Alt</th>
                          <th className="col-valid-from" title="Valid From Date" style={{ width: '9%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Valid From</th>
                          <th className="col-base-qty" title="Base Quantity" style={{ width: '6%', textAlign: 'right', padding: '6px 6px', whiteSpace: 'nowrap' }}>Base Qty</th>
                          <th className="col-bom-status col-status" title="BOM Status" style={{ width: '5%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Status</th>
                          <th className="col-item-cat col-cat" title="Item Category" style={{ width: '4%', textAlign: 'center', padding: '6px 4px', whiteSpace: 'nowrap' }}>Cat</th>
                          <th className="col-component" title="Component Material" style={{ width: '16%', textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' }}>Component</th>
                          <th className="col-qty" title="Component Quantity" style={{ width: '6%', textAlign: 'right', padding: '6px 6px', whiteSpace: 'nowrap' }}>Qty</th>
                          <th className="col-result" title="Validation Result" style={{ width: '22%', minWidth: 'var(--table-col-status-min-width, 140px)', textAlign: 'center', padding: '6px 6px', whiteSpace: 'nowrap' }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBoms.length === 0 ? (
                          <tr>
                            <td colSpan={11} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-secondary, #4A5F77)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '13px', fontWeight: 500 }}>No rows match this filter.</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter('all');
                                    setSearchTerm('');
                                    setCurrentPage(1);
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: 0,
                                    color: 'var(--color-blue-600, #02579A)',
                                    textDecoration: 'underline',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 600
                                  }}
                                >
                                  Clear filter
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          displayedBoms.map((bom, bIdx) => {
                          const groupId = bom.groupKey || `${bom.material || ''}_${bom.plant || ''}_${bom.bomUsage || '1'}_${bom.alternativeBom || '01'}`;
                          const bomKey = bom.id != null ? String(bom.id) : `${groupId}_${bom.sequenceNum || ''}_${bIdx}`;
                          const compList = Array.isArray(bom.components) && bom.components.length > 0 ? bom.components : [{}];
                          const span = compList.length;
                          const normStatus = normalizeBomStatus(bom, hasValidated);
                          const messages = getBomMessages(bom);
                          const allErrors = messages.errors.length > 0
                            ? messages.errors
                            : (bom.reason ? [bom.reason] : (bom.message ? [bom.message] : []));
                          const primaryReason = allErrors[0] || bom.reason || bom.message || 'Validation failed';
                          const isMessagesExpanded = expandedMessageBoms.has(bomKey) || expandedMessageBoms.has(groupId);

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
                                          padding: '6px 4px',
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
                                          maxWidth: '20ch',
                                          padding: '6px 8px',
                                          fontWeight: 600,
                                          fontFamily: 'monospace, monospace',
                                          fontVariantNumeric: 'tabular-nums',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          textAlign: 'left'
                                        }}
                                      >
                                        <span className="bom-mat-code" title={bom.material} style={{ display: 'block', maxWidth: '20ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                          padding: '6px 4px',
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
                                          padding: '6px 4px',
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
                                          padding: '6px 4px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {bom.alternativeBom}
                                      </td>

                                      {/* 6. Valid From (must show fully, no ellipsis) */}
                                      <td
                                        rowSpan={span}
                                        className="col-valid-from"
                                        style={{
                                          textAlign: 'center',
                                          padding: '6px 4px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
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
                                          padding: '6px 6px',
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
                                          padding: '6px 4px',
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
                                          padding: '6px 4px',
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
                                          maxWidth: '20ch',
                                          padding: '6px 8px',
                                          fontFamily: 'monospace, monospace',
                                          fontVariantNumeric: 'tabular-nums',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          textAlign: 'left'
                                        }}
                                      >
                                        <span style={{ display: 'block', maxWidth: '20ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.component || ''}>
                                          {comp.component || '-'}
                                        </span>
                                      </td>

                                      {/* 11. Qty */}
                                      <td
                                        className="col-qty"
                                        style={{
                                          textAlign: 'right',
                                          fontVariantNumeric: 'tabular-nums',
                                          padding: '6px 6px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {comp.quantity ?? '-'}
                                      </td>

                                      {/* 12. Result Badge only */}
                                      <td
                                        rowSpan={span}
                                        className="col-result col-result-cell"
                                        title={messages.info && messages.info.length > 0 ? messages.info.join('\n') : undefined}
                                        style={{
                                          textAlign: 'center',
                                          padding: '6px 6px',
                                          border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                          background: '#ffffff',
                                          verticalAlign: 'middle',
                                          boxSizing: 'border-box',
                                          minWidth: 'var(--table-col-status-min-width, 140px)',
                                          overflow: 'visible',
                                          textOverflow: 'clip',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        <BulkBomResultBadge status={normStatus} hasValidated={hasValidated} />
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
                                        padding: '6px 4px',
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
                                        width: 170,
                                        maxWidth: '20ch',
                                        padding: '6px 8px',
                                        fontFamily: 'monospace, monospace',
                                        fontVariantNumeric: 'tabular-nums',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        border: '1px solid var(--sap-border-subtle, #e2e8f0)',
                                        background: '#ffffff',
                                        textAlign: 'left'
                                      }}
                                    >
                                      <span style={{ display: 'block', maxWidth: '20ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={comp.component || ''}>
                                        {comp.component || '-'}
                                      </span>
                                    </td>

                                    {/* 11. Qty */}
                                    <td
                                      className="col-qty"
                                      style={{
                                        textAlign: 'right',
                                        fontVariantNumeric: 'tabular-nums',
                                        padding: '6px 6px',
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
                              <BulkBomMessageRow
                                key={`bom-${bomKey}-messages`}
                                messages={messages}
                                bomKey={bomKey}
                                isExpanded={isMessagesExpanded}
                                onToggleExpand={toggleMessageExpand}
                                colSpan={12}
                              />
                            </React.Fragment>
                          );
                        }))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary & Action Controls Footer - in-card, non-sticky */}
                <div
                  className="bulk-preview-sticky-footer sap-card-action-row"
                  style={{
                    borderTop: '1px solid var(--sap-border, #D9E2EC)',
                    paddingTop: 16,
                    marginTop: 16,
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
                        Not validated ({statusCounts.all} BOM{statusCounts.all === 1 ? '' : 's'})
                      </span>
                    ) : (
                      <>
                        <span className="sap-badge sap-badge-success" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Ready: {statusCounts.ready}
                        </span>
                        <span className="sap-badge sap-badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Skipped (Existing): {statusCounts.skipped}
                        </span>
                        <span className="sap-badge sap-badge-danger" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Invalid: {statusCounts.errors}
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
                      style={{ height: 'var(--size-button-height, 40px)', padding: '0 18px', fontSize: 'var(--font-size-13, 13px)', borderRadius: 'var(--radius-md, 8px)' }}
                    >
                      Clear & Upload Another
                    </button>

                    <button
                      type="button"
                      className="sap-button validate-with-sap-btn"
                      onClick={handleValidateWithSap}
                      disabled={isLocked || allBoms.length === 0}
                      style={{
                        height: 'var(--size-button-height, 40px)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '0 20px',
                        fontSize: 'var(--font-size-13, 13px)',
                        borderRadius: 'var(--radius-md, 8px)'
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
                      style={{ height: 'var(--size-button-height, 40px)', padding: '0 24px', fontSize: 'var(--font-size-13, 13px)', borderRadius: 'var(--radius-md, 8px)', fontWeight: 600 }}
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
              </BulkDataPreviewSection>
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
                    placeholder="Ex. Approved Engineering Change ECO-1049"
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

        {/* Validation Errors Popover Modal */}
        {errorPopoverBom && (
          <Modal
            isOpen={Boolean(errorPopoverBom)}
            onClose={() => setErrorPopoverBom(null)}
            title={`Validation Issues · ${errorPopoverBom.material}`}
            subtitle={`Plant ${errorPopoverBom.plant || ''}${errorPopoverBom.bomUsage ? ` · Usage ${errorPopoverBom.bomUsage}` : ''}`}
            icon={AlertCircle}
            iconColor="var(--color-danger, #B42318)"
            maxWidth={520}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              {(errorPopoverBom.errors || []).map((err, i) => {
                const text = typeof err === 'string' ? err : `${err.field ? `${err.field}: ` : ''}${err.message || ''}`;
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '10px 12px',
                      backgroundColor: 'var(--color-danger-bg, #FEF3F2)',
                      border: '1px solid var(--color-danger-border, #FECDCA)',
                      borderRadius: 'var(--radius-md, 8px)',
                      fontSize: '12.5px',
                      color: 'var(--color-danger, #B42318)',
                      lineHeight: 1.4
                    }}
                  >
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ wordBreak: 'break-word' }}>{text}</span>
                  </div>
                );
              })}
            </div>
          </Modal>
        )}
    </div>
  );
}