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
import BlockedReasonsList, { cleanDiagnosticMessage } from './BlockedReasonsList';
import {
  BulkFlowContainer,
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard,
  COPY_BULK_COLUMNS,
  BulkStatTiles,
  normalizeBomStatus,
  getBomStatusCounts,
  filterBoms
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
  const [skipErrors, setSkipErrors] = useState(true);
  const [copyHierarchy, setCopyHierarchy] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [executionReport, setExecutionReport] = useState(initialExecutionReport);
  const [activeStep, setActiveStep] = useState(
    initialExecutionReport ? 3 : (initialParsedRows.length > 0 || initialIsValidating) ? 2 : 1
  ); // 1: Upload, 2: Validate, 3: Execute/Results

  // Background Job States
  const [activeJobId, setActiveJobId] = useState(initialActiveJobId);
  const [activeJobType, setActiveJobType] = useState(initialActiveJobId ? 'copy_validate' : null);
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

  const startJobPolling = (jobId, type) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setActiveJobId(jobId);
    setActiveJobType(type);
    updateJobUrl(jobId);

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
          updateJobUrl(null);

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

            const resMap = new Map((job.results || []).map((r) => [r.id, r]));
            setParsedRows((prev) =>
              prev.map((row, idx) => {
                const match = resMap.get(row.id) || (job.results && job.results[idx]);
                if (match) {
                  return {
                    ...row,
                    targetAltBom: match.targetAltBom || row.targetAltBom,
                    sourceAltBom: match.sourceAltBom || row.sourceAltBom,
                    status: match.status === 'SUCCESS' ? 'SUCCESS' : match.status === 'NOT_PROCESSED' ? 'NOT_PROCESSED' : 'FAILED',
                    message: match.message,
                    problems: match.problems || match.rawErrors,
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
    }, 3000);
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
        startJobPolling(res.jobId, 'copy_validate');
      } else {
        setParseError(res.message || 'Failed to start validation job.');
        setIsValidating(false);
      }
    } catch (err) {
      if (controller.signal.aborted || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
        return; // Cancelled by user - do not show error
      }
      console.error('Validation error:', err);
      setParseError(err.response?.data?.message || err.message || 'Validation failed.');
      setIsValidating(false);
    } finally {
      if (validationAbortControllerRef.current === controller) {
        validationAbortControllerRef.current = null;
      }
    }
  };

  const handleExecuteBatchCopy = async () => {
    const executableRows = parsedRows.filter((r) => r.status === 'VALID' || r.status === 'WARNING');
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
          <div>
            {/* Success / Partial Banner */}
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
                  marginBottom: 20
                }}
              >
                <CheckCircle2 size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Copy Completed Successfully</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Successfully copied {executionReport.successCount ?? executionReport.copiedCount ?? 0} BOM(s) across {executionReport.totalProcessed ?? executionReport.total ?? parsedRows.length} total entries.
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
                  marginBottom: 20
                }}
              >
                <AlertTriangle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Copy Completed with Issues</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Copied {executionReport.successCount ?? executionReport.copiedCount ?? 0} BOM(s); {executionReport.failedCount ?? 0} failed out of {executionReport.totalProcessed ?? executionReport.total ?? parsedRows.length} total.
                  </p>
                </div>
              </div>
            )}

            {/* Results Table Card */}
            <FormSection
              title="Execution Results"
              description={`Execution report for ${parsedRows.length} BOM(s)`}
              actions={
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {(executionReport.failedCount > 0 || parsedRows.some((r) => r.status === 'ERROR' || r.status === 'FAILED')) && (
                    <button
                      type="button"
                      className="sap-button sap-btn sap-btn-secondary"
                      onClick={handleRetryFailedRows}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                    >
                      <RefreshCw size={14} />
                      <span>Retry Failed Rows</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="sap-button sap-btn sap-btn-secondary"
                    onClick={handleExportResults}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                  >
                    <Download size={14} />
                    <span>Export Report (.xlsx)</span>
                  </button>
                </div>
              }
              className="mb-6"
            >

              {/* Grid Table */}
              <div className="sap-bulk-grid-container sap-table-container sap-card-table-scroll" tabIndex={0} role="region" aria-label="Execution Results Table">
                <table className="sap-table sap-bulk-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <colgroup>
                    <col style={{ width: '4%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '30%' }} />
                  </colgroup>
                  <thead>
                        <tr>
                          <th style={{ width: '4%' }}>#</th>
                          <th style={{ width: '24%' }}>Source BOM</th>
                          <th style={{ width: '24%' }}>Target BOM</th>
                          <th style={{ width: '6%', textAlign: 'center' }}>Items</th>
                          <th style={{ width: '12%' }}>Status</th>
                          <th style={{ width: '30%' }}>Diagnostic Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row, idx) => {
                      const isRowValid = row.status === 'VALID' || row.status === 'SUCCESS';
                      const isRowWarn = row.status === 'WARNING';
                      const isRowError = row.status === 'ERROR' || row.status === 'FAILED';

                      return (
                        <tr key={row.id || idx} className={`row-status-${row.status.toLowerCase()}`}>
                          <td style={{ fontWeight: 600, color: 'var(--sap-text-muted)', fontSize: '11px' }}>{idx + 1}</td>
                          <td>
                            <div className="bom-identity-cell">
                              <span className="mat-pill">{row.sourceMaterial}</span>
                              <span className="sub-detail">Plant: <strong title={plantMap[row.sourcePlant] || row.sourcePlant}>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong></span>
                            </div>
                          </td>
                          <td>
                            <div className="bom-identity-cell">
                              <span className="mat-pill">{row.targetMaterial}</span>
                              <span className="sub-detail">Plant: <strong title={plantMap[row.targetPlant] || row.targetPlant}>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--sap-primary)' }}>{row.targetAltBom}</strong></span>
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
                              {row.status === 'SUCCESS' && 'Copied'}
                              {row.status === 'FAILED' && 'Failed'}
                              {row.status === 'NOT_PROCESSED' && 'Skipped'}
                            </span>
                          </td>
                          <td>
                            <div className="message-cell">
                              {isRowError ? (
                                <BlockedReasonsList
                                  problems={row.problems || row.message}
                                  totalBoms={row.totalBomsSimulated}
                                  message={row.message}
                                />
                              ) : isRowValid ? (
                                <span className="cell-msg-text cell-msg-valid" style={{ color: 'var(--sap-success, #059669)', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                                  <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                                  <span>{cleanDiagnosticMessage(row.message) || 'Ready to copy.'}</span>
                                </span>
                              ) : (
                                <span className="cell-msg-text">{cleanDiagnosticMessage(row.message)}</span>
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

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button
                  type="button"
                  className="sap-button primary"
                  onClick={onBack}
                  style={{ height: 'var(--size-button-height, 40px)', padding: '0 20px', fontSize: 'var(--font-size-13, 13px)', borderRadius: 'var(--radius-md, 8px)' }}
                >
                  Return to Launchpad
                </button>
                <button
                  type="button"
                  className="sap-button"
                  onClick={resetAll}
                  style={{ height: 'var(--size-button-height, 40px)', padding: '0 20px', fontSize: 'var(--font-size-13, 13px)', borderRadius: 'var(--radius-md, 8px)' }}
                >
                  Upload Another File
                </button>
              </div>
            </FormSection>
          </div>
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
                rowLimitText="Maximum 500 BOM copy rows per batch."
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
                />

                {/* Summary Stat Tiles - Shown only after validation completes (step 2 onward) */}
                {hasValidated && activeStep > 1 && (
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
                    style={{ marginBottom: 16 }}
                  />
                )}

                {/* PRE-FLIGHT PREVIEW TABLE CARD */}
                <FormSection
                  title="Data Preview"
                  description={`${parsedRows.length} BOM(s) found across spreadsheet`}
                  tintedHeader
                  className="w-full"
                >
                  {/* Controls Toolbar: Search left, Tabs center, Options/Count right */}
                  <div className="sap-toolbar rx-table-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    {/* Left: Search Bar */}
                    <div style={{ flex: '0 0 auto' }}>
                      <SearchInput
                        placeholder="Search material or plant..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onClear={() => setSearchTerm('')}
                        isTable
                        wrapperStyle={{ width: 220 }}
                      />
                    </div>

                    {/* Center: Filter Tabs */}
                    <div style={{ flex: '1 1 auto', display: 'flex', justifyContent: 'center' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px',
                          backgroundColor: 'var(--color-blue-200)',
                          borderRadius: 'var(--radius-md, 8px)',
                          border: '1px solid var(--color-border, #D9E2EC)'
                        }}
                      >
                        {[
                          { id: 'all', label: `All (${statusCounts.all})` },
                          { id: 'ready', label: `Ready (${statusCounts.ready})` },
                          { id: 'errors', label: `Errors (${statusCounts.errors})` },
                          { id: 'skipped', label: `Skipped (${statusCounts.skipped})` }
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setStatusFilter(f.id)}
                            style={{
                              height: 26,
                              padding: '0 10px',
                              borderRadius: 'var(--radius-sm, 6px)',
                              border: 'none',
                              fontSize: '11.5px',
                              fontWeight: statusFilter === f.id ? 600 : 500,
                              backgroundColor: statusFilter === f.id ? 'var(--color-surface, #FFFFFF)' : 'transparent',
                              color: statusFilter === f.id ? 'var(--color-blue-600, #02579A)' : 'var(--color-text-secondary, #4A5F77)',
                              boxShadow: statusFilter === f.id ? 'var(--shadow-sm)' : 'none',
                              cursor: 'pointer',
                              transition: 'all var(--transition-fast, 150ms ease)'
                            }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Right side controls: File Badge & Hierarchy Options */}
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 'var(--font-size-12, 12px)', color: 'var(--color-text-secondary, #4A5F77)' }}>
                        Showing {filteredRows.length} of {parsedRows.length}
                      </span>

                      {file?.name && (
                        <span
                          className="sap-file-badge"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            backgroundColor: 'var(--color-surface-subtle, #F8FAFC)',
                            border: '1px solid var(--color-border, #D9E2EC)',
                            borderRadius: 'var(--radius-sm, 6px)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--color-navy-900, #00204E)'
                          }}
                          title={file.name}
                        >
                          <FileSpreadsheet size={14} color="var(--color-blue-600, #02579A)" style={{ flexShrink: 0 }} />
                          <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </span>
                        </span>
                      )}

                      {/* Options */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <label style={{ fontSize: '12px', color: 'var(--color-text, #0F2742)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={copyHierarchy}
                            onChange={(e) => setCopyHierarchy(e.target.checked)}
                            disabled={isExecuting}
                          />
                          <span>Copy Full Hierarchy</span>
                        </label>
                        <label style={{ fontSize: '12px', color: 'var(--color-text-secondary, #4A5F77)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={skipErrors}
                            onChange={(e) => setSkipErrors(e.target.checked)}
                            disabled={isExecuting}
                          />
                          <span>Skip errors</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Grid Table */}
                  <div className="sap-bulk-grid-container sap-card-table-scroll" tabIndex={0} role="region" aria-label="Bulk BOM Items Table">
                    <table className="sap-bulk-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                      <colgroup>
                        <col style={{ width: '4%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '24%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '30%' }} />
                      </colgroup>
                      <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                        <tr style={{ backgroundColor: 'var(--color-blue-200)' }}>
                          <th style={{ width: 36 }}>#</th>
                          <th>Source BOM</th>
                          <th>Target BOM</th>
                          <th style={{ width: 80, textAlign: 'center' }}>Items</th>
                          <th style={{ width: 100 }}>Status</th>
                          <th>Diagnostic Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.map((row, idx) => {
                          const normStatus = normalizeBomStatus(row);
                          const isRowValid = normStatus === 'ready';
                          const isRowWarn = normStatus === 'skipped';
                          const isRowError = normStatus === 'error';

                          return (
                            <tr key={row.id || idx} className={`row-status-${normStatus}`}>
                              <td style={{ fontWeight: 600, color: 'var(--sap-text-muted)', fontSize: '11px' }}>{idx + 1}</td>
                              <td>
                                <div className="bom-identity-cell">
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
                                  <span className="sub-detail">Plant: <strong title={plantMap[row.sourcePlant] || row.sourcePlant}>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong></span>
                                </div>
                              </td>
                              <td>
                                <div className="bom-identity-cell">
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
                                  <span className="sub-detail">Plant: <strong title={plantMap[row.targetPlant] || row.targetPlant}>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--sap-primary)' }}>{row.targetAltBom}</strong></span>
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
                                <span className={`sap-status-chip chip-${normStatus}`}>
                                  {isRowValid && <CheckCircle2 size={11} />}
                                  {isRowWarn && <AlertTriangle size={11} />}
                                  {isRowError && <AlertCircle size={11} />}
                                  {normStatus === 'not_validated' && 'Not validated'}
                                  {normStatus === 'ready' && 'Ready'}
                                  {normStatus === 'skipped' && 'Skipped'}
                                  {normStatus === 'error' && 'Failed'}
                                </span>
                              </td>
                              <td>
                                <div className="message-cell">
                                  {isRowError ? (
                                    <BlockedReasonsList
                                      problems={row.problems || row.message}
                                      totalBoms={row.totalBomsSimulated}
                                      message={row.message}
                                    />
                                  ) : isRowValid ? (
                                    <span className="cell-msg-text cell-msg-valid" style={{ color: 'var(--sap-success, #059669)', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                                      <CheckCircle2 size={12} style={{ flexShrink: 0 }} />
                                      <span>{cleanDiagnosticMessage(row.message) || 'Ready to copy.'}</span>
                                    </span>
                                  ) : (
                                    <span className="cell-msg-text">{cleanDiagnosticMessage(row.message)}</span>
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
                            <span className="sap-badge sap-badge-warning" style={{ fontSize: 12, padding: '4px 10px' }}>
                              Skipped: {statusCounts.skipped}
                            </span>
                          )}
                          <span className="sap-badge sap-badge-warning" style={{ fontSize: 12, padding: '4px 10px' }}>
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
                </FormSection>
              </>
            )}
          </div>
        )}
      </BulkFlowContainer>
    </div>
  );
}
