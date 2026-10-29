import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ChevronLeft,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import DeleteBomForm from './DeleteBomForm';
import ConfirmationCard from './ConfirmationCard';
import FioriPageHeader from './FioriPageHeader';
import { sendChatMessage, confirmChatAction, cancelChatAction } from '../services/api';
import activityTracker from '../services/activityTracker';

export default function DeleteBomView({ systemKey = 'DEV', onBack, onNavigateHome }) {
  const [proposedAction, setProposedAction] = useState(null);
  const [actionStatus, setActionStatus] = useState('pending');
  const [executionResult, setExecutionResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmittedForm, setLastSubmittedForm] = useState(null);

  useEffect(() => {
    activityTracker.setOperation('delete_bom', isSubmitting || actionStatus === 'executing');
    return () => activityTracker.setOperation('delete_bom', false);
  }, [isSubmitting, actionStatus]);

  useEffect(() => {
    const isPending = Boolean(proposedAction && actionStatus === 'pending');
    activityTracker.setConfirmation('delete_bom', isPending);
    return () => activityTracker.setConfirmation('delete_bom', false);
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
    setIsSubmitting(true);
    setLastSubmittedForm(formData);

    const summaryText = `Delete BOM for Material ${formData.material} in plant ${formData.plant} (Alternative BOM ${formData.alternativeBom}, Usage ${formData.bomUsage})`;

    try {
      const response = await sendChatMessage(
        summaryText,
        [],
        systemKey,
        { actionType: 'delete_bom', deleteBomParams: formData },
        { signal: controller.signal }
      );

      if (response.error) {
        setErrorMessage(response.reply || response.error || 'Failed to generate Delete BOM proposal.');
      } else if (response.proposedAction) {
        setProposedAction(response.proposedAction);
        setActionStatus('pending');
      } else {
        setErrorMessage(response.reply || 'Unexpected response from SAP.');
      }
      if (controller.signal.aborted) return;
    } catch (err) {
      if (controller.signal.aborted || err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError') {
        return;
      }
      console.error('Error proposing Delete BOM:', err);
      const text = err.response?.data?.reply || err.response?.data?.error || err.message || 'Unable to submit Delete BOM request.';
      setErrorMessage(text);
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

    try {
      const response = await confirmChatAction(actionId, {
        ...options,
        systemKey
      });

      if (response.error) {
        setActionStatus('failed');
        setErrorMessage(response.reply || response.error || 'Delete BOM execution failed.');
      } else {
        setActionStatus('confirmed');
        setExecutionResult(response);
      }
    } catch (err) {
      console.error('Error confirming Delete BOM:', err);
      setActionStatus('failed');
      const text = err.response?.data?.reply || err.response?.data?.error || err.message || 'Failed to execute Delete BOM action.';
      setErrorMessage(text);
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
    setErrorMessage('');
    setLastSubmittedForm(null);
  };

  return (
    <div className="fiori-app-view-root">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <FioriPageHeader
        title="Delete BOM"
        subtitle="Safely delete specific BOM alternatives in SAP with confirmation."
        onBack={onBack}
        backTitle="Back to Bill of Materials"
        systemKey={systemKey}
        breadcrumbs={[
          { label: 'Home', onClick: onNavigateHome || onBack },
          { label: 'Bill of Materials', onClick: onBack },
          { label: 'Delete BOM' }
        ]}
      />

      <div className="fiori-view-body">
        {/* Error Notice */}
        {errorMessage && (
          <div className="sap-alert sap-alert-error" style={{ maxWidth: 680, width: '100%', margin: '0 auto 14px' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Step 1: Form View */}
        {!proposedAction && !executionResult && (
          <div className="sap-form-view-section" style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
            {isSubmitting ? (
              <div
                className="sap-loading-card"
                style={{
                  maxWidth: 680,
                  width: '100%',
                  margin: '0 auto',
                  textAlign: 'center',
                  padding: '24px 20px',
                  borderRadius: 'var(--sap-radius)',
                  border: '1px solid var(--sap-border)'
                }}
              >
                <Loader2 size={36} className="sap-spin" style={{ color: 'var(--sap-primary, #0a6ed1)', marginBottom: 14 }} />
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--sap-text)', margin: '0 0 6px' }}>
                  Verifying BOM Existence in SAP...
                </h4>
                <p style={{ fontSize: '12.5px', color: 'var(--sap-text-muted)', maxWidth: 480, margin: '0 auto' }}>
                  Validating material and plant records prior to deletion proposal.
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
              <DeleteBomForm
                onSubmit={handleFormSubmit}
                onCancel={onBack}
                initialValues={lastSubmittedForm || {}}
                hideHeader={true}
                style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}
              />
            )}
          </div>
        )}

        {/* Step 2: Confirmation Proposal Gate */}
        {proposedAction && !executionResult && (
          <div className="sap-proposal-view-section" style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
            <div className="sap-proposal-header-card danger">
              <ShieldCheck size={20} color="var(--sap-error)" />
              <div>
                <h4>Safety Gate: Confirm Permanent BOM Deletion</h4>
                <p>Deleting a BOM removes the alternative from SAP master records. Review carefully before confirming.</p>
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

        {/* Step 3: Success Execution Result Card */}
        {executionResult && (
          <div className="sap-result-view-section" style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
            <div className="sap-result-success-card">
              <div className="sap-result-success-header">
                <div className="sap-result-success-icon">
                  <CheckCircle2 size={32} color="var(--sap-success)" />
                </div>
                <div>
                  <h3 className="sap-result-success-title">BOM Deleted Successfully</h3>
                  <p className="sap-result-success-message">{executionResult.reply}</p>
                </div>
              </div>

              {/* Result Meta Cards */}
              <div className="sap-result-meta-grid">
                <div className="sap-result-meta-item">
                  <span className="sap-result-meta-label">Material</span>
                  <strong className="sap-result-meta-val">{lastSubmittedForm?.material || '-'}</strong>
                </div>
                <div className="sap-result-meta-item">
                  <span className="sap-result-meta-label">Plant</span>
                  <strong className="sap-result-meta-val">{lastSubmittedForm?.plant || '-'}</strong>
                </div>
                <div className="sap-result-meta-item">
                  <span className="sap-result-meta-label">Alternative Deleted</span>
                  <span className="sap-badge sap-badge-danger" style={{ fontSize: '13px', padding: '3px 8px' }}>
                    {lastSubmittedForm?.alternativeBom || '01'}
                  </span>
                </div>
                <div className="sap-result-meta-item">
                  <span className="sap-result-meta-label">Status</span>
                  <span className="sap-badge sap-badge-success" style={{ fontSize: '13px', padding: '3px 8px' }}>
                    DELETED
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
                  className="sap-button destructive"
                  onClick={handleReset}
                  style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 16px' }}
                >
                  <Trash2 size={13} />
                  <span>Delete Another BOM</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
