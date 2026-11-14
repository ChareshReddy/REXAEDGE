import SingleBulkSwitch from './layout/SingleBulkSwitch';
import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import FioriPageHeader from './FioriPageHeader';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  Play,
  RefreshCw,
  Search,
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
  getActiveBomJob,
  getPlants
} from '../services/api';
import BulkUploadPanel from './BulkUploadPanel';
import { SearchInput } from './ui/search-input';
import { FormSection } from './ui/form-layout';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';
import {
  BulkFlowContainer,
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard,
  COPY_BULK_COLUMNS,
  BulkStatTiles,
  BulkDataPreviewSection,
  normalizeBomStatus,
  getBomStatusCounts,
  filterBoms,
  getBomMessages,
  BulkBomMessageRow,
  BulkBomResultBadge,
  BulkExecutionResultBadge,
  BulkExecutionResultsView
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

export default function BulkBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom,
  initialParsedRows = [],
  initialValidationReport = null,
  initialExecutionReport = null,
  initialIsValidating = false,
  initialJobProgress = null,
  initialActiveJobId = null
}) {
  const toast = useToast();
  const [file, setFile] = useState(
    initialParsedRows.length > 0 || initialExecutionReport || initialIsValidating
      ? { name: 'Batch_BOM_Copy.xlsx' }
      : null
  );
  const [parsedRows, setParsedRows] = useState(
    initialExecutionReport?.results || initialParsedRows
  );
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

  // Validation phase state
  const [isValidating, setIsValidating] = useState(initialIsValidating);
  const [validationReport, setValidationReport] = useState(initialValidationReport);

  // Execution phase state
  const [isExecuting, setIsExecuting] = useState(false);
  const [skipErrors] = useState(true);
  const [copyHierarchy] = useState(true);
  const [expandedMessageBoms, setExpandedMessageBoms] = useState(() => new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const toggleMessageExpand = (key) => {
    setExpandedMessageBoms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  const [executionReport, setExecutionReport] = useState(initialExecutionReport);
  const [activeStep, setActiveStep] = useState(
    initialExecutionReport ? 3 : (initialParsedRows.length > 0 || initialIsValidating) ? 2 : 1
  ); // 1: Upload, 2: Validate, 3: Execute/Results

  // Background Job States
  const [activeJobId, setActiveJobId] = useState(initialActiveJobId);
  const [activeJobType, setActiveJobType] = useState(initialActiveJobId ? 'copy_validate' : null);
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
      notProcessedCount: 0
    }
  );
  const pollIntervalRef = useRef(null);
  const validationAbortControllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (validationAbortControllerRef.current) {
        validationAbortControllerRef.current.abort();
      }
    };
  }, []);

  const fileInputRef = useRef(null);

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

  const updateJobUrl = (jobId) => {
    try {
      if (jobId) {
        sessionStorage.setItem('rexa_copy_bulk_job_id', jobId);
        const url = new URL(window.location.href);
        url.searchParams.set('jobId', jobId);
        window.history.replaceState({}, '', url);
      } else {
        sessionStorage.removeItem('rexa_copy_bulk_job_id');
        const url = new URL(window.location.href);
        url.searchParams.delete('jobId');
        window.history.replaceState({}, '', url);
      }
    } catch (_) {}
  };

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
                prev.map((row, idx) => {
                  const match = resMap.get(row.id) || (job.results && job.results[idx]);
                  if (match) {
                    return {
                      ...row,
                      targetAltBom: match.targetAltBom || row.targetAltBom,
                      sourceAltBom: match.sourceAltBom || row.sourceAltBom,
                      status: match.status,
                      message: match.message,
                      messageType: match.messageType,
                      warnings: match.warnings || row.warnings || [],
                      errors: match.errors || row.errors || [],
                      problems: match.problems || match.rawErrors,
                      totalBomsSimulated: match.totalBomsSimulated || match.totalBoms,
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

            const resMap = new Map((job.results || []).map((r, i) => [r.id ?? r.sequenceNum ?? (i + 1), r]));
            setParsedRows((prev) =>
              prev.map((row, idx) => {
                const match = resMap.get(row.id ?? (idx + 1));
                if (match) {
                  return {
                    ...row,
                    targetAltBom: match.targetAltBom || row.targetAltBom,
                    sourceAltBom: match.sourceAltBom || row.sourceAltBom,
                    status: match.status === 'SUCCESS' ? 'SUCCESS' : match.status === 'SKIPPED' ? 'SKIPPED' : match.status === 'NOT_PROCESSED' ? 'NOT_PROCESSED' : 'FAILED',
                    message: match.message,
                    problems: match.problems || match.rawErrors,
                    errors: match.errors || row.errors,
                    componentCount: match.componentCount !== undefined ? match.componentCount : row.componentCount,
                    totalBomsSimulated: match.totalBomsSimulated || match.totalBoms,
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
    }, 1000);
  };

  // Reconnect on mount if an active job is already in flight
  useEffect(() => {
    let isMounted = true;
    const checkActiveJob = async () => {
      try {
        let savedJobId = null;
        try {
          const urlParams = new URLSearchParams(window.location.search);
          savedJobId = urlParams.get('jobId') || sessionStorage.getItem('rexa_copy_bulk_job_id');
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
              if (job.type === 'copy_validate') {
                setIsValidating(true);
                startJobPolling(job.jobId, 'copy_validate');
                return;
              } else if (job.type === 'copy_bulk') {
                setIsExecuting(true);
                setActiveStep(3);
                startJobPolling(job.jobId, 'copy_bulk');
                return;
              }
            }
          }
        }

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
      toast.error(err.response?.data?.message || err.message || 'Failed to cancel job');
      setIsCancelling(false);
    }
  };

  const resetAll = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    updateJobUrl(null);
    setFile(null);
    setParsedRows([]);
    setExpandedMessageBoms(new Set());
    setParseError('');
    setStatusFilter('all');
    setSearchTerm('');
    setValidationReport(null);
    setIsExecuting(false);
    setActiveJobId(null);
    setJobCurrentBom(null);
    setIsCancelling(false);
    setExecutionReport(null);
    setActiveStep(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRetryFailedRows = async () => {
    const failedRows = parsedRows.filter((r) => r.status === 'ERROR' || r.status === 'FAILED');
    if (failedRows.length === 0) return;

    setParsedRows(failedRows);
    setExecutionReport(null);
    setIsExecuting(true);
    setActiveStep(3);
    setJobProgress({
      current: 0,
      total: failedRows.length,
      percent: 0,
      successCount: 0,
      failedCount: 0,
      notProcessedCount: 0
    });

    try {
      const res = await startBomJob({
        type: 'copy_bulk',
        items: failedRows,
        copyHierarchy: true,
        skipErrors: true
      });
      if (res.success && res.jobId) {
        startJobPolling(res.jobId, 'copy_bulk');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to retry failed rows');
      setIsExecuting(false);
    }
  };

  const processFile = (fileObj) => {
    setParseError('');
    setStatusFilter('all');
    setSearchTerm('');
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

        // Validate presence of required columns in the sheet headers
        const sampleRow = rawJson[0] || {};
        const recognizedFields = new Set();
        Object.keys(sampleRow).forEach((key) => {
          const k = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
          if (k.includes('srcmat') || k.includes('sourcemat') || (k.includes('source') && k.includes('mat')) || k === 'matnr') {
            recognizedFields.add('sourceMaterial');
          } else if (k.includes('srcplant') || k.includes('sourceplant') || (k.includes('source') && k.includes('plant')) || (k.includes('source') && k.includes('werks'))) {
            recognizedFields.add('sourcePlant');
          } else if (k.includes('tgtplant') || k.includes('targetplant') || (k.includes('target') && k.includes('plant')) || (k.includes('target') && k.includes('werks'))) {
            recognizedFields.add('targetPlant');
          } else if (k.includes('tgtalt') || k.includes('targetalt') || (k.includes('target') && k.includes('alt')) || (k.includes('target') && k.includes('stlal'))) {
            recognizedFields.add('targetAltBom');
          }
        });

        if (recognizedFields.size === 0) {
          setParseError('Could not recognize any valid BOM columns. Please use the sample template.');
          return;
        }

        const missingRequired = [];
        if (!recognizedFields.has('sourceMaterial')) missingRequired.push('Source Material');
        if (!recognizedFields.has('sourcePlant')) missingRequired.push('Source Plant');
        if (!recognizedFields.has('targetPlant')) missingRequired.push('Target Plant');
        if (!recognizedFields.has('targetAltBom')) missingRequired.push('Target Alternative');

        if (missingRequired.length > 0) {
          setParseError(`Missing required column${missingRequired.length > 1 ? 's' : ''}: ${missingRequired.join(', ')}. Please verify your spreadsheet headers.`);
          return;
        }

        const normalized = rawJson
          .map((row, index) => {
            const norm = normalizeRowKeys(row);
            return {
              id: index + 1,
              ...norm,
              status: 'PENDING',
              message: ''
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
      XLSX.utils.book_append_sheet(wb, ws, 'BOM_Copy_Template');

      const instructionsData = [
        {
          'Column Name': 'Source Material',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Material number of the existing source BOM in SAP'
        },
        {
          'Column Name': 'Source Plant',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Plant code where the source BOM is located (Ex. 1012)'
        },
        {
          'Column Name': 'Target Plant',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Plant code where the new BOM will be copied (Ex. 1001)'
        },
        {
          'Column Name': 'Target Alternative',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Target alternative number (Ex. 02, 12)'
        },
        {
          'Column Name': 'Source BOM Usage',
          'Required / Optional': 'Optional',
          'Default Value': '1',
          'Description': 'Source BOM usage code (defaults to 1 = Production)'
        },
        {
          'Column Name': 'Source Alternative',
          'Required / Optional': 'Optional',
          'Default Value': '1',
          'Description': 'Source alternative number (defaults to 1 or lowest alternative)'
        },
        {
          'Column Name': 'Target Material',
          'Required / Optional': 'Optional',
          'Default Value': 'Source Material',
          'Description': 'Target material number (defaults to Source Material if empty)'
        },
        {
          'Column Name': 'Target BOM Usage',
          'Required / Optional': 'Optional',
          'Default Value': '1',
          'Description': 'Target BOM usage code (defaults to 1 = Production)'
        }
      ];
      const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
      instructionsWs['!cols'] = [
        { wch: 22 },
        { wch: 22 },
        { wch: 20 },
        { wch: 60 }
      ];
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

      XLSX.writeFile(wb, 'BOM_Copy_Template.xlsx');
    }
  };

  const handleCancelValidation = () => {
    if (validationAbortControllerRef.current) {
      validationAbortControllerRef.current.abort();
      validationAbortControllerRef.current = null;
    }
    if (activeJobId) {
      cancelBomJob(activeJobId).catch(() => {});
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsValidating(false);
    setActiveJobId(null);
    setParseError('');
  };

  const handleValidateWithSap = async () => {
    if (parsedRows.length === 0) {
      toast.warning('Please upload a spreadsheet first.', { title: 'Validation notice' });
      return;
    }
    if (validationAbortControllerRef.current) {
      validationAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    validationAbortControllerRef.current = controller;

    setIsValidating(true);
    setParseError('');

    try {
      const res = await startBomJob(
        {
          type: 'copy_validate',
          items: parsedRows
        },
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (res.success && res.jobId) {
        setJobProgress({
          current: 0,
          total: res.total,
          percent: 0,
          successCount: 0,
          failedCount: 0,
          notProcessedCount: 0
        });
        startJobPolling(res.jobId, 'copy_validate', res.status || 'RUNNING', res.queuedReason || '');
      } else {
        setParseError(res.message || 'Failed to start validation job.');
        setIsValidating(false);
      }
    } catch (err) {
      if (controller.signal.aborted || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
        return; // Cancelled by user - do not show error
      }
      console.error('Validation error:', err);
      const errMsg = err.response?.data?.message || err.message || 'Validation failed.';
      setParseError(errMsg);
      if (err.response?.status === 413 || err.response?.data?.code === 'PAYLOAD_TOO_LARGE') {
        toast.error(errMsg, { title: 'Upload error' });
      }
      setIsValidating(false);
    } finally {
      if (validationAbortControllerRef.current === controller) {
        validationAbortControllerRef.current = null;
      }
    }
  };

  const handleExecuteBatchCopy = async () => {
    const executableRows = parsedRows.filter((r) => {
      const norm = normalizeBomStatus(r);
      return norm === 'ready' || norm === 'skipped' || r.status === 'VALID' || r.status === 'WARNING';
    });
    if (executableRows.length === 0) {
      toast.warning('No valid rows available to execute.', { title: 'Validation notice' });
      return;
    }

    const hasWarnings = parsedRows.some((r) => r.status === 'WARNING');
    const warningNotice = hasWarnings
      ? '\n\n⚠️ Note: Some rows have WARNINGS (target alternative may already exist and conflict).'
      : '';

    const confirmMsg = `Are you sure you want to copy ${executableRows.length} Bill of Materials in SAP?${warningNotice}\n\nOperation will copy ${executableRows.length} BOM(s) in SAP.`;
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
      const errMsg = err.response?.data?.message || err.message || 'Execution failed.';
      setParseError(errMsg);
      if (err.response?.status === 413 || err.response?.data?.code === 'PAYLOAD_TOO_LARGE') {
        toast.error(errMsg, { title: 'Upload error' });
      }
      setIsExecuting(false);
    }
  };

  const handleExportResults = () => {
    if (parsedRows.length === 0) return;

    const exportData = parsedRows.map((r, i) => {
      const messages = getBomMessages(r);
      const noteText = (messages.info && messages.info.length > 0)
        ? messages.info.join(' | ')
        : (r.notes ? String(r.notes) : '');

      return {
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
        'Notes': noteText || '-',
        'SAP Message': r.message
      };
    });

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

  const hasValidated = Boolean(validationReport);
  const statusCounts = useMemo(() => getBomStatusCounts(parsedRows, hasValidated), [parsedRows, hasValidated]);
  const validCount = statusCounts.ready;
  const warningCount = statusCounts.skipped;
  const errorCount = statusCounts.errors;

  const filteredRows = useMemo(
    () => filterBoms(parsedRows, { statusFilter, searchTerm }),
    [parsedRows, statusFilter, searchTerm]
  );

  return (
    <div className="fiori-launchpad-root">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <FioriPageHeader
        title="Copy Bulk BOM"
        extraTitleContent={<SingleBulkSwitch operation="copy" mode="bulk" />}
        subtitle="Upload a excel file to copy multiple BOMs across plants."
        onBack={onBack}
        backTitle={isExecuting ? 'Operation in progress' : 'Back to Copy BOM'}
        isLocked={isExecuting}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('bulk_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked: isExecuting })}
      />

      <BulkFlowContainer>
        {/* Workflow Steps Indicator */}
        <BulkWorkflowSteps activeStep={activeStep} type="copy" />

        {/* RESULTS SCREEN (STEP 3) */}
        {executionReport ? (
          <BulkExecutionResultsView
            mode="copy"
            report={executionReport}
            rows={parsedRows}
            onBack={onBack}
            onReset={resetAll}
            onRetryFailedRows={handleRetryFailedRows}
            onExportResults={handleExportResults}
          />
        ) : (
          /* UPLOAD (STEP 1) OR PREVIEW (STEP 2) */
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%', alignItems: 'flex-start', gap: parsedRows.length > 0 ? 16 : 24 }}>
            {activeStep === 1 || parsedRows.length === 0 ? (
              /* Step 1: Upload Panel */
              <BulkUploadPanel
                title="Upload Spreadsheet"
                helperText="Upload a spreadsheet to copy multiple Bills of Materials in SAP."
                acceptedFormats=".xlsx, .xls, .csv"
                supportedFormatsText="Supports .xlsx, .xls, and .csv with Source & Target BOM columns"
                fileName={file?.name || ''}
                file={file}
                onFile={processFile}
                loading={isValidating}
                loadingText="Validating your data in SAP..."
                disabled={isExecuting || isValidating}
                templateAction={{
                  label: 'Download template',
                  onClick: handleDownloadTemplate,
                  disabled: isExecuting
                }}
                columns={COPY_BULK_COLUMNS}
                rowLimitText="Maximum 100 BOM copy rows per batch."
                tipText="Source BOMs must exist in SAP. Target alternative should be numeric (Ex. 02, 12)."
                error={parseError}
                onClear={resetAll}
                onContinue={() => {
                  if (parsedRows.length > 0) {
                    setActiveStep(2);
                  }
                }}
              />
            ) : (
              /* Step 2: Validation Preview */
              <>
                {/* Background Job Progress Card */}
                <BulkJobProgressCard
                  isValidating={isValidating}
                  isExecuting={isExecuting}
                  activeJobId={activeJobId}
                  jobProgress={jobProgress}
                  jobCurrentBom={jobCurrentBom}
                  isCancelling={isCancelling}
                  onCancelJob={handleCancelJob}
                  validationLabel="Validating data in SAP"
                  executionLabel="Copying BOMs in SAP"
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
                      onClick={resetAll}
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
                {hasValidated && !isValidating && validationReport && (
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
                    onFilterChange={(filter) => setStatusFilter(filter)}
                  />
                )}

                {/* PRE-FLIGHT PREVIEW TABLE CARD */}
                <BulkDataPreviewSection
                  title="Data Preview"
                  subtitle={`${parsedRows.length} BOM(s) found across spreadsheet`}
                  fileName={file?.name}
                  showingCount={filteredRows.length}
                  totalCount={parsedRows.length}
                  searchTerm={searchTerm}
                  onSearchChange={(e) => setSearchTerm(e.target.value)}
                  onSearchClear={() => setSearchTerm('')}
                  className="w-full"
                >

                  {/* Grid Table */}
                  <div
                    className="sap-bulk-grid-container sap-table-container fiori-table-wrapper sap-card-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Bulk BOM Items Table"
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
                    <table className="sap-bulk-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <colgroup>
                        <col style={{ width: '5%' }} />
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '35%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '16%', minWidth: 'var(--table-col-status-min-width, 140px)' }} />
                      </colgroup>
                      <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                        <tr style={{ backgroundColor: 'var(--table-header-bg)' }}>
                          <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                          <th style={{ width: '35%' }}>Source BOM</th>
                          <th style={{ width: '35%' }}>Target BOM</th>
                          <th style={{ width: '9%', textAlign: 'center' }}>Items</th>
                          <th className="col-result" style={{ width: '16%', minWidth: 'var(--table-col-status-min-width, 140px)', textAlign: 'center' }}>Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-secondary, #4A5F77)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '13px', fontWeight: 500 }}>No rows match this filter.</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusFilter('all');
                                    setSearchTerm('');
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
                          filteredRows.map((row, idx) => {
                          const normStatus = normalizeBomStatus(row);
                          const bomKey = row.id != null ? String(row.id) : `${row.sourceMaterial || ''}_${row.sourcePlant || ''}_${row.targetMaterial || ''}_${row.targetPlant || ''}_${idx}`;
                          const messages = getBomMessages(row);
                          const isMessagesExpanded = expandedMessageBoms.has(bomKey);

                          return (
                            <React.Fragment key={bomKey}>
                              <tr className={`row-status-${normStatus}`}>
                                <td style={{ fontWeight: 600, color: 'var(--sap-text-muted)', fontSize: '11px', textAlign: 'center' }}>{idx + 1}</td>
                                <td>
                                  <div className="bom-identity-cell" style={{ maxWidth: 320 }}>
                                    <span
                                      className="mat-pill"
                                      title={row.sourceMaterial}
                                      style={{
                                        maxWidth: '20ch',
                                        fontFamily: 'monospace, monospace',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-block'
                                      }}
                                    >
                                      {row.sourceMaterial}
                                    </span>
                                    <span className="sub-detail" style={{ whiteSpace: 'nowrap' }}>Plant: <strong title={plantMap[row.sourcePlant] || row.sourcePlant}>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong></span>
                                  </div>
                                </td>
                                <td>
                                  <div className="bom-identity-cell" style={{ maxWidth: 320 }}>
                                    <span
                                      className="mat-pill"
                                      title={row.targetMaterial}
                                      style={{
                                        maxWidth: '20ch',
                                        fontFamily: 'monospace, monospace',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-block'
                                      }}
                                    >
                                      {row.targetMaterial}
                                    </span>
                                    <span className="sub-detail" style={{ whiteSpace: 'nowrap' }}>Plant: <strong title={plantMap[row.targetPlant] || row.targetPlant}>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--sap-primary)' }}>{row.targetAltBom}</strong></span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  {row.componentCount !== undefined && row.componentCount > 0 ? (
                                    <span className="comp-count-badge">{row.componentCount}</span>
                                  ) : (
                                    <span style={{ color: 'var(--sap-text-subtle)' }}>-</span>
                                  )}
                                </td>
                                <td
                                  className="col-result col-result-cell"
                                  title={messages.info && messages.info.length > 0 ? messages.info.join('\n') : undefined}
                                  style={{
                                    textAlign: 'center',
                                    padding: '6px 8px',
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
                              <BulkBomMessageRow
                                messages={messages}
                                bomKey={bomKey}
                                isExpanded={isMessagesExpanded}
                                onToggleExpand={toggleMessageExpand}
                                colSpan={5}
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
                      {!validationReport ? (
                        <span className="sap-badge sap-badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Not validated ({statusCounts.all} BOM{statusCounts.all === 1 ? '' : 's'})
                        </span>
                      ) : (
                        <>
                          <span className="sap-badge sap-badge-success" style={{ fontSize: 12, padding: '4px 10px' }}>
                            Ready: {statusCounts.ready}
                          </span>
                          {statusCounts.skipped > 0 && (
                            <span className="sap-badge sap-badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                              Skipped: {statusCounts.skipped}
                            </span>
                          )}
                          <span className="sap-badge sap-badge-danger" style={{ fontSize: 12, padding: '4px 10px' }}>
                            Errors: {statusCounts.errors}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Actions: Secondary on left, Primary on right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button
                        type="button"
                        className="sap-button"
                        disabled={isExecuting || isValidating}
                        onClick={resetAll}
                        style={{ height: 'var(--size-button-height, 40px)', padding: '0 18px', fontSize: 'var(--font-size-13, 13px)', borderRadius: 'var(--radius-md, 8px)' }}
                      >
                        Clear & Upload Another
                      </button>

                      <button
                        type="button"
                        className="sap-button validate-with-sap-btn"
                        onClick={handleValidateWithSap}
                        disabled={isValidating || isExecuting || parsedRows.length === 0}
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
                            <span>{validationReport ? 'Re-validate data' : 'Validate data'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        className="sap-button primary execute-batch-copy-btn"
                        disabled={!validationReport || isExecuting || (validCount === 0 && warningCount === 0)}
                        onClick={handleExecuteBatchCopy}
                        style={{
                          height: 'var(--size-button-height, 40px)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 24px',
                          fontSize: 'var(--font-size-13, 13px)',
                          borderRadius: 'var(--radius-md, 8px)',
                          fontWeight: 600
                        }}
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 size={16} className="sap-spin" />
                            <span>
                              {jobProgress.total > 0
                                ? `Copying ${jobProgress.current} of ${jobProgress.total}...`
                                : 'Copying in SAP...'}
                            </span>
                          </>
                        ) : (
                          <span>Copy BOMs ({validationReport ? validCount + warningCount : 0})</span>
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
    </div>
  );
}
