import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import FioriPageHeader from './FioriPageHeader';
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
  getActiveBomJob,
  getPlants
} from '../services/api';
import BulkUploadPanel from './BulkUploadPanel';
import activityTracker from '../services/activityTracker';
import BlockedReasonsList, { cleanDiagnosticMessage } from './BlockedReasonsList';
import {
  BulkWorkflowSteps,
  BulkFileInfoBar,
  BulkJobProgressCard,
  COPY_BULK_COLUMNS
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
  const [file, setFile] = useState(
    initialParsedRows.length > 0 || initialExecutionReport || initialIsValidating
      ? { name: 'Batch_BOM_Copy.xlsx' }
      : null
  );
  const [parsedRows, setParsedRows] = useState(
    initialExecutionReport?.results || initialParsedRows
  );
  const [parseError, setParseError] = useState('');

  // Validation phase state
  const [isValidating, setIsValidating] = useState(initialIsValidating);
  const [validationReport, setValidationReport] = useState(initialValidationReport);

  // Execution phase state
  const [isExecuting, setIsExecuting] = useState(false);
  const [skipErrors, setSkipErrors] = useState(true);
  const [copyHierarchy, setCopyHierarchy] = useState(true);
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
              prev.map((row) => {
                const match = resMap.get(row.id);
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
          'Description': 'Plant code where the source BOM is located (e.g. 1012)'
        },
        {
          'Column Name': 'Target Plant',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Plant code where the new BOM will be copied (e.g. 1001)'
        },
        {
          'Column Name': 'Target Alternative',
          'Required / Optional': 'Required',
          'Default Value': 'None',
          'Description': 'Target alternative number (e.g. 02, 12)'
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
    if (parsedRows.length === 0) return;
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
      alert('No valid rows available to execute.');
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

  const validCount = parsedRows.filter((r) => r.status === 'VALID' || r.status === 'SUCCESS').length;
  const warningCount = parsedRows.filter((r) => r.status === 'WARNING').length;
  const errorCount = parsedRows.filter((r) => r.status === 'ERROR' || r.status === 'FAILED').length;

  return (
    <div className="fiori-launchpad-root">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <FioriPageHeader
        title="Copy Bulk BOM"
        subtitle="Upload a spreadsheet to copy multiple BOMs across plants with automatic alternative numbers."
        onBack={onBack}
        backTitle={isExecuting ? 'Operation in progress' : 'Back to Copy BOM'}
        isLocked={isExecuting}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('bulk_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked: isExecuting })}
      />

      <div className="fiori-body" style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
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
            <div className="sap-card" style={{ padding: 20 }}>
              <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h3 className="sap-section-header" style={{ margin: 0 }}>
                    Execution Results
                  </h3>
                  <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginTop: 2 }}>
                    Execution report for {parsedRows.length} BOM(s)
                  </div>
                </div>
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

              {/* Grid Table */}
              <div className="sap-bulk-grid-container sap-table-container" tabIndex={0} role="region" aria-label="Execution Results Table">
                <table className="sap-table sap-bulk-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th>Source BOM</th>
                      <th>Target BOM</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Items</th>
                      <th style={{ width: 100 }}>Status</th>
                      <th>Diagnostic Message</th>
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
                  style={{ height: 30, padding: '0 20px', fontSize: 'var(--sap-size-button)' }}
                >
                  Return to Launchpad
                </button>
                <button
                  type="button"
                  className="sap-button"
                  onClick={resetAll}
                  style={{ height: 30, padding: '0 20px', fontSize: 'var(--sap-size-button)' }}
                >
                  Upload Another File
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* UPLOAD (STEP 1) OR PREVIEW (STEP 2) */
          <div style={{ display: 'flex', flexDirection: 'column', gap: parsedRows.length > 0 ? 16 : 24 }}>
            {parsedRows.length === 0 ? (
              /* Step 1: Upload Panel (Clean, 750px centered, no boxed card) */
              <BulkUploadPanel
                title="Upload Spreadsheet"
                helperText="Upload a spreadsheet to copy multiple Bills of Materials in SAP."
                acceptedFormats=".xlsx, .xls, .csv"
                supportedFormatsText="Supports .xlsx, .xls, and .csv with Source & Target BOM columns"
                fileName={file?.name || ''}
                onFile={processFile}
                loading={isValidating}
                loadingText="Validating your data in SAP..."
                disabled={isExecuting || isValidating}
                templateAction={{
                  label: 'Download Template',
                  onClick: handleDownloadTemplate,
                  disabled: isExecuting
                }}
                error={parseError}
                onClear={resetAll}
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

                {/* File Info Bar */}
                <BulkFileInfoBar
                  fileName={file?.name || ''}
                  countText={`${parsedRows.length} BOM${parsedRows.length === 1 ? '' : 's'}`}
                  isLocked={isExecuting || isValidating}
                  onDownloadTemplate={handleDownloadTemplate}
                  onChangeFile={resetAll}
                />

                {/* Error Alert */}
                {parseError && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md, 6px)',
                      background: 'var(--sap-error-bg, #fef2f2)',
                      border: '1px solid var(--sap-error-border, #fecaca)',
                      color: 'var(--sap-error, #dc2626)',
                      fontSize: 13
                    }}
                  >
                    <XCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{parseError}</span>
                  </div>
                )}

                {/* PRE-FLIGHT PREVIEW TABLE CARD */}
                <div className="sap-card" style={{ padding: 20 }}>
                  {/* Header & Controls */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                        Data Preview
                      </h3>
                      <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginTop: 2 }}>
                        {parsedRows.length} BOM(s) found across spreadsheet
                      </div>
                    </div>

                    {/* Options */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <label style={{ fontSize: '12px', color: 'var(--sap-text-body)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={copyHierarchy}
                          onChange={(e) => setCopyHierarchy(e.target.checked)}
                          disabled={isExecuting}
                        />
                        <span>Copy Full Hierarchy</span>
                      </label>
                      <label style={{ fontSize: '12px', color: 'var(--sap-text-muted)', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
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
                          <th>Diagnostic Message</th>
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
                      {!validationReport ? (
                        <span className="sap-badge sap-badge-neutral" style={{ fontSize: 12, padding: '4px 10px' }}>
                          Not validated ({parsedRows.length} BOM{parsedRows.length === 1 ? '' : 's'})
                        </span>
                      ) : (
                        <>
                          <span className="sap-badge sap-badge-success" style={{ fontSize: 12, padding: '4px 10px' }}>
                            Ready: {validCount}
                          </span>
                          {warningCount > 0 && (
                            <span className="sap-badge sap-badge-warning" style={{ fontSize: 12, padding: '4px 10px' }}>
                              Warnings: {warningCount}
                            </span>
                          )}
                          <span className="sap-badge sap-badge-danger" style={{ fontSize: 12, padding: '4px 10px' }}>
                            Errors: {errorCount}
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
                        style={{ height: 30, padding: '0 16px', fontSize: 'var(--sap-size-button)' }}
                      >
                        Clear & Upload Another
                      </button>

                      <button
                        type="button"
                        className="sap-button validate-with-sap-btn"
                        onClick={handleValidateWithSap}
                        disabled={isValidating || isExecuting || parsedRows.length === 0}
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
                          height: 30,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0 24px',
                          fontSize: 'var(--sap-size-button)'
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
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
