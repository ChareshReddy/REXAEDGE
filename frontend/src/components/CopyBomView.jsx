import SingleBulkSwitch from './layout/SingleBulkSwitch';
import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  ArrowRight,
  X
} from 'lucide-react';
import { PageContainer } from './layout';
import CreateBomForm from './CreateBomForm';
import ConfirmationCard from './ConfirmationCard';
import FioriPageHeader from './FioriPageHeader';
import { sendChatMessage, confirmChatAction, cancelChatAction, verifyCopiedBom } from '../services/api';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';

export default function CopyBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom, initialMaterial, initialPlant }) {
  const toast = useToast();
  const [proposedAction, setProposedAction] = useState(null);
  const [actionStatus, setActionStatus] = useState('pending'); // 'pending' | 'executing' | 'confirmed' | 'cancelled' | 'failed'
  const [executionResult, setExecutionResult] = useState(null);
  const [errorMessage, _setErrorMessage] = useState('');
  const setErrorMessage = (msg, err = null) => {
    _setErrorMessage(typeof msg === 'string' ? msg : '');
    if (err) {
      const info = extractErrorInfo(err, typeof msg === 'string' ? msg : 'Failed to execute Copy BOM action.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } else if (msg) {
      const info = extractErrorInfo(msg);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedForm, setLastSubmittedForm] = useState(null);

  // Background Verification State
  const [isReadingBack, setIsReadingBack] = useState(false);
  const [verifiedData, setVerifiedData] = useState(null);
  const [readBackError, setReadBackError] = useState('');
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);
  const [verifyElapsed, setVerifyElapsed] = useState(0);
  const verifyTimerRef = useRef(null);

  const formatElapsed = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const startVerifyTimer = () => {
    if (verifyTimerRef.current) clearInterval(verifyTimerRef.current);
    setVerifyElapsed(0);
    const startTime = Date.now();
    verifyTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setVerifyElapsed(elapsed);
    }, 1000);
  };

  const stopVerifyTimer = () => {
    if (verifyTimerRef.current) {
      clearInterval(verifyTimerRef.current);
      verifyTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopVerifyTimer();
  }, []);

  const triggerVerification = async (formDetails, targetAlt) => {
    setIsReadingBack(true);
    setReadBackError('');
    startVerifyTimer();

    // 60-second client-side timeout limit
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Verification timed out after 60 seconds.')), 60000);
    });

    try {
      const verifyPromise = verifyCopiedBom({
        sourceMaterial: formDetails?.sourceMaterial,
        sourcePlant: formDetails?.sourcePlant,
        sourceUsage: formDetails?.sourceUsage || '1',
        sourceAlternative: formDetails?.sourceAltBom || '1',
        targetMaterial: formDetails?.targetMaterial,
        targetPlant: formDetails?.targetPlant,
        targetUsage: formDetails?.targetUsage || '1',
        targetAlternative: targetAlt
      });

      const verifyResult = await Promise.race([verifyPromise, timeoutPromise]);

      if (verifyResult && (verifyResult.verification || verifyResult.status === 'SUCCESS' || verifyResult.status === 'PARTIAL' || verifyResult.bomsCreated !== undefined)) {
        setVerifiedData(verifyResult);
        setReadBackError('');
      } else if (verifyResult?.message) {
        setReadBackError(verifyResult.message);
      }
    } catch (readErr) {
      console.error('[CopyBomView] Read-back failed:', readErr);
      setReadBackError(
        readErr.response?.data?.message || readErr.message || 'Unable to read back target hierarchy from SAP.'
      );
    } finally {
      stopVerifyTimer();
      setIsReadingBack(false);
    }
  };

  const handleVerifyAgain = () => {
    if (!lastSubmittedForm) return;
    const resolvedAlt =
      verifiedData?.rootAlternative ||
      executionResult?.alternativeBom ||
      executionResult?.createdAlternative ||
      lastSubmittedForm?.targetAltBom ||
      '01';
    triggerVerification(lastSubmittedForm, resolvedAlt);
  };

  useEffect(() => {
    activityTracker.setOperation('copy_bom', isSubmitting || actionStatus === 'executing');
    return () => activityTracker.setOperation('copy_bom', false);
  }, [isSubmitting, actionStatus]);

  useEffect(() => {
    const isPending = Boolean(proposedAction && actionStatus === 'pending');
    activityTracker.setConfirmation('copy_bom', isPending);
    return () => activityTracker.setConfirmation('copy_bom', false);
  }, [proposedAction, actionStatus]);

  const abortControllerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleCancelChecking = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSubmitting(false);
    setErrorMessage('');
  };

  const handleFormSubmit = async (formData) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMessage('');
    setExecutionResult(null);
    setProposedAction(null);
    setVerifiedData(null);
    setReadBackError('');
    setShowDiscrepancies(false);
    setIsSubmitting(true);
    setLastSubmittedForm(formData);

    const tgtAltText = formData.targetAltBom ? `, Alt ${formData.targetAltBom}` : '';
    const srcAltText = formData.sourceAltBom ? `, Alt ${formData.sourceAltBom}` : '';
    const summaryText = `Create new BOM for ${formData.targetMaterial} in plant ${formData.targetPlant} (Usage ${formData.targetUsage}${tgtAltText}) by copying from reference BOM ${formData.sourceMaterial} in plant ${formData.sourcePlant} (Usage ${formData.sourceUsage}${srcAltText})`;

    try {
      const response = await sendChatMessage(
        summaryText,
        [],
        systemKey,
        { actionType: 'copy_bom', copyBomParams: formData },
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      if (response.error) {
        setErrorMessage(response.reply || response.error || 'Failed to generate Copy BOM proposal.');
      } else if (response.proposedAction) {
        setProposedAction(response.proposedAction);
        setActionStatus('pending');
      } else {
        setErrorMessage(response.reply || 'Unexpected response from SAP.');
      }
    } catch (err) {
      if (controller.signal.aborted || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
        return; // Cancelled by user - do not show error toast
      }
      console.error('Error proposing Copy BOM:', err);
      const text = err.response?.data?.reply || err.response?.data?.error || err.message || 'Unable to submit Copy BOM request.';
      setErrorMessage(text, err);
    } finally {
      if (!controller.signal.aborted) {
        setIsSubmitting(false);
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleConfirmAction = async (actionId, options = {}) => {
    setActionStatus('executing');
    setErrorMessage('');
    setVerifiedData(null);
    setReadBackError('');
    setShowDiscrepancies(false);

    try {
      const response = await confirmChatAction(actionId, {
        ...options,
        systemKey
      });

      if (response.error) {
        setActionStatus('failed');
        setErrorMessage(response.reply || response.error || 'Copy BOM execution failed.');
      } else {
        setActionStatus('confirmed');
        setExecutionResult(response);

        // Read back created hierarchy directly from SAP database in background & verify
        const resolvedAlt =
          response.createdAlternative ||
          response.targetAlternative ||
          response.actionResult?.createdAlternative ||
          response.actionExecuted?.alternative ||
          lastSubmittedForm?.targetAltBom ||
          '01';

        await triggerVerification(lastSubmittedForm, resolvedAlt);
      }
    } catch (err) {
      console.error('Error confirming Copy BOM:', err);
      setActionStatus('failed');
      const text = err.response?.data?.reply || err.response?.data?.error || err.message || 'Failed to execute Copy BOM action.';
      setErrorMessage(text, err);
    }
  };

  const handleCancelAction = async (actionId) => {
    try {
      await cancelChatAction(actionId);
    } catch {
      // Ignore cancel network error
    }
    setProposedAction(null);
    setActionStatus('cancelled');
    setLastSubmittedForm(null);
  };

  const handleReset = () => {
    setProposedAction(null);
    setActionStatus('pending');
    setExecutionResult(null);
    setVerifiedData(null);
    setReadBackError('');
    setIsReadingBack(false);
    setShowDiscrepancies(false);
    setErrorMessage('');
    setLastSubmittedForm(null);
  };

  // Immediate values from executionResult
  const immediateComps = executionResult?.totalComponents !== undefined
    ? executionResult.totalComponents
    : (Array.isArray(executionResult?.hierarchy) && executionResult.hierarchy.length > 0
        ? executionResult.hierarchy.reduce((sum, h) => sum + (h.componentCount || 0), 0)
        : null);

  const immediateLevels = executionResult?.totalLevels !== undefined
    ? executionResult.totalLevels
    : null;

  // Consistent single source of truth for all counts across banner and cards
  const bomsCount = verifiedData?.bomsCreated ?? (executionResult?.totalBoms || executionResult?.copiedCount || executionResult?.data?.length || 1);
  const compsCount = verifiedData ? verifiedData.totalComponents : immediateComps;
  const levelsCount = verifiedData ? verifiedData.totalLevels : immediateLevels;

  const rootAlt =
    verifiedData?.rootAlternative ||
    executionResult?.alternativeBom ||
    executionResult?.createdAlternative ||
    executionResult?.executedAction?.alternative ||
    lastSubmittedForm?.targetAltBom ||
    '01';

  const targetMat =
    lastSubmittedForm?.targetMaterial ||
    executionResult?.executedAction?.recordId ||
    'BOM';

  // Differences evaluation
  const differences = verifiedData?.verification?.differences || [];
  const hasDifferences = verifiedData ? (differences.length > 0 || verifiedData.status === 'PARTIAL' || verifiedData.status === 'FAILED') : false;
  const diffCount = differences.length;

  // Plain text banner subtitle
  let bannerSubtitle = null;
  if (isReadingBack) {
    bannerSubtitle = 'Verifying copied hierarchy...';
  } else if (readBackError && !verifiedData) {
    bannerSubtitle = 'Copy completed. Verification could not finish.';
  } else if (hasDifferences) {
    bannerSubtitle = `Created Alternative ${rootAlt} for ${targetMat}: ${bomsCount} BOMs across ${levelsCount || 1} levels.`;
  } else {
    bannerSubtitle = null;
  }

  return (
    <div className="fiori-app-view-root sap-page-viewport">
      {/* Full-width Fiori Horizon Header */}
      <FioriPageHeader
        title="Copy Single BOM"
        extraTitleContent={<SingleBulkSwitch operation="copy" mode="single" />}
        subtitle="Copy a BOM to another plant, with automatic alternative numbers and sub-assemblies."
        onBack={onBack}
        backTitle="Back to Copy BOM"
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('copy_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack })}
      />

      <PageContainer>
        <div style={{ marginTop: 20 }}>
          {/* Step 1: Form View (when no proposal is pending and not yet confirmed) */}
          {!proposedAction && !executionResult && (
            <div className="sap-form-view-section" style={{ width: '100%' }}>
              {isSubmitting ? (
                <div
                  className="sap-loading-card"
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    padding: '36px 20px',
                    borderRadius: 'var(--sap-radius)',
                    border: '1px solid var(--sap-border)'
                  }}
                >
                  <Loader2 size={36} className="sap-spin" style={{ color: 'var(--sap-primary, #0a6ed1)', marginBottom: 14 }} />
                  <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--sap-text)', margin: '0 0 6px' }}>
                    Validating BOMs in SAP...
                  </h4>
                  <p style={{ fontSize: '12.5px', color: 'var(--sap-text-muted)', maxWidth: 480, margin: '0 auto' }}>
                    Simulating multi-level BOM creation in the target plant to verify all components and plants before execution.
                  </p>
                  <button
                    type="button"
                    className="sap-button"
                    onClick={handleCancelChecking}
                    style={{ height: 30, padding: '0 16px', fontSize: 'var(--sap-size-button)', marginTop: 20 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <CreateBomForm
                  formId="copy-bom-form"
                  onSubmit={handleFormSubmit}
                  onCancel={onBack}
                  initialValues={lastSubmittedForm || (initialMaterial ? { sourceMaterial: initialMaterial, sourcePlant: initialPlant || '' } : {})}
                  hideHeader={true}
                  hideFormActions={false}
                  isSubmitting={isSubmitting}
                  style={{ width: '100%' }}
                />
              )}
            </div>
          )}

          {/* Step 2: Confirmation Proposal Gate */}
          {proposedAction && !executionResult && (
            <div className="sap-proposal-view-section" style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}>
              <div className="sap-proposal-header-card">
                <ShieldCheck size={20} color="var(--sap-primary)" style={{ flexShrink: 0 }} />
                <div>
                  <h4>Human Confirmation Gate: Verify BOM Copy Proposal</h4>
                  <p>Review the source and target parameters below. Confirming will execute the copy in SAP.</p>
                </div>
              </div>

              <ConfirmationCard
                action={proposedAction}
                status={actionStatus}
                onConfirm={handleConfirmAction}
                onCancel={handleCancelAction}
              />
            </div>
          )}

          {/* Step 3: Success / Warning Execution Result Card */}
          {executionResult && (
            <div className="sap-result-view-section" style={{ maxWidth: 960, width: '100%', margin: '0 auto' }}>
              <div
                className="sap-result-success-card"
                style={
                  hasDifferences
                    ? { borderColor: 'var(--sap-warning-border, #D9E2EC)', backgroundColor: '#ffffff' }
                    : {}
                }
              >
                {/* Result Banner: Icon, Title, and One Line of Plain Text */}
                <div className="sap-result-success-header" style={{ alignItems: 'flex-start' }}>
                  <div className="sap-result-success-icon" style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
                    {hasDifferences ? (
                      <AlertTriangle size={24} color="var(--sap-warning, #d97706)" />
                    ) : (
                      <CheckCircle2 size={24} color="var(--sap-success, #16a34a)" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <h3
                        className="sap-result-success-title"
                        style={{
                          margin: 0,
                          color: hasDifferences ? 'var(--sap-warning-text, #00204E)' : 'var(--sap-success-text, #166534)'
                        }}
                      >
                        {hasDifferences
                          ? `BOM copied with ${diffCount} difference${diffCount === 1 ? '' : 's'} from the source`
                          : 'BOM Copied Successfully'}
                      </h3>
                      {hasDifferences && (
                        <button
                          type="button"
                          onClick={() => setShowDiscrepancies((prev) => !prev)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--sap-primary, #0070f2)',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            padding: 0,
                            textDecoration: 'underline'
                          }}
                        >
                          {showDiscrepancies ? 'Hide details' : 'View details'}
                        </button>
                      )}
                    </div>
                    {bannerSubtitle && (
                      <p className="sap-result-success-message" style={{ marginTop: 4, marginBottom: 0 }}>
                        {bannerSubtitle}
                      </p>
                    )}
                  </div>
                </div>

                {/* Collapsed by default discrepancy list */}
                {hasDifferences && showDiscrepancies && differences.length > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '12px 16px',
                      borderRadius: 6,
                      backgroundColor: '#fffbeb',
                      border: '1px solid #D9E2EC'
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#00204E', marginBottom: 6 }}>
                      Discrepancies from source BOM ({differences.length}):
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '11.5px', color: 'var(--sap-text-dark, #1e293b)', lineHeight: 1.5 }}>
                      {differences.map((diff, idx) => (
                        <li key={idx} style={{ marginBottom: 3 }}>
                          {diff}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 4 Summary Cards */}
                <div className="sap-result-meta-grid" style={{ marginTop: 16, marginBottom: 20 }}>
                  <div className="sap-result-meta-item">
                    <span className="sap-result-meta-label">BOMs Created</span>
                    <strong className="sap-result-meta-val" style={{ color: 'var(--sap-primary)' }}>
                      {bomsCount}
                    </strong>
                  </div>
                  <div className="sap-result-meta-item">
                    <span className="sap-result-meta-label">Total Components Copied</span>
                    {compsCount !== null && compsCount !== undefined ? (
                      <strong className="sap-result-meta-val" style={{ color: 'var(--sap-text-dark)' }}>
                        {compsCount}
                      </strong>
                    ) : isReadingBack ? (
                      <span
                        className="sap-verifying-indicator"
                        data-testid="verifying-components"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '13px',
                          color: 'var(--color-blue-600, #02579A)',
                          fontWeight: 500
                        }}
                      >
                        <Loader2 size={14} className="sap-spin" />
                        <span>Verifying... ({formatElapsed(verifyElapsed)})</span>
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ color: 'var(--color-danger, #B42318)', fontSize: '13px', fontWeight: 600 }}>
                          Not verified
                        </span>
                        <button
                          type="button"
                          className="sap-button sap-btn sap-btn-secondary"
                          onClick={handleVerifyAgain}
                          style={{ fontSize: '11px', padding: '2px 8px', width: 'fit-content', height: 'auto' }}
                        >
                          Verify again
                        </button>
                        {readBackError && (
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary, #475569)', lineHeight: 1.2 }}>
                            {readBackError}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="sap-result-meta-item">
                    <span className="sap-result-meta-label">Levels</span>
                    {levelsCount !== null && levelsCount !== undefined ? (
                      <strong className="sap-result-meta-val">
                        {levelsCount}
                      </strong>
                    ) : isReadingBack ? (
                      <span
                        className="sap-verifying-indicator"
                        data-testid="verifying-levels"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '13px',
                          color: 'var(--color-blue-600, #02579A)',
                          fontWeight: 500
                        }}
                      >
                        <Loader2 size={14} className="sap-spin" />
                        <span>Verifying...</span>
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ color: 'var(--color-danger, #B42318)', fontSize: '13px', fontWeight: 600 }}>
                          Not verified
                        </span>
                        <button
                          type="button"
                          className="sap-button sap-btn sap-btn-secondary"
                          onClick={handleVerifyAgain}
                          style={{ fontSize: '11px', padding: '2px 8px', width: 'fit-content', height: 'auto' }}
                        >
                          Verify again
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="sap-result-meta-item">
                    <span className="sap-result-meta-label">Root Alternative</span>
                    <span className="sap-badge sap-badge-primary" style={{ fontSize: '12px', padding: '2px 8px', width: 'fit-content', fontWeight: 700 }}>
                      {rootAlt}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="sap-result-actions sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    type="button"
                    className="sap-button"
                    onClick={onBack}
                    style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 14px' }}
                  >
                    <ArrowLeft size={13} />
                    <span>Return to Launchpad</span>
                  </button>
                  <button
                    type="button"
                    className="sap-button primary"
                    onClick={handleReset}
                    style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
                  >
                    <Copy size={13} />
                    <span>Copy Another BOM</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </div>
  );
}
