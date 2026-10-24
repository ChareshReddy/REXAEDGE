import React, { useState, useEffect } from 'react';
import {
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ChevronLeft,
  ArrowLeft
} from 'lucide-react';
import DeleteBomForm from './DeleteBomForm';
import ConfirmationCard from './ConfirmationCard';
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

  const handleFormSubmit = async (formData) => {
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
        { actionType: 'delete_bom', deleteBomParams: formData }
      );

      if (response.error) {
        setErrorMessage(response.reply || response.error || 'Failed to generate Delete BOM proposal.');
      } else if (response.proposedAction) {
        setProposedAction(response.proposedAction);
        setActionStatus('pending');
      } else {
        setErrorMessage(response.reply || 'Unexpected response from SAP.');
      }
    } catch (err) {
      console.error('Error proposing Delete BOM:', err);
      const text = err.response?.data?.reply || err.response?.data?.error || err.message || 'Unable to submit Delete BOM request.';
      setErrorMessage(text);
    } finally {
      setIsSubmitting(false);
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
      <div className="fiori-ph">
        <div className="fiori-bc">
          <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
            Home
          </button>
          <span className="fiori-bc-sep">›</span>
          <button type="button" className="fiori-bc-link" onClick={onBack}>
            Bill of Materials
          </button>
          <span className="fiori-bc-sep">›</span>
          <span className="fiori-bc-current">Delete Material BOM</span>
          <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>{systemKey}</span>
        </div>
        <div className="fiori-ph-title-row">
          <button
            type="button"
            className="fiori-ph-back"
            onClick={onBack}
            title="Back to Bill of Materials"
            aria-label="Back to Bill of Materials"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="fiori-ph-title">Delete Material BOM (CS02)</h1>
        </div>
        <p className="fiori-ph-subtitle">
          Safely archive or delete specific BOM alternatives in SAP without GUI popups. Strict human confirmation gates prevent accidental data loss.
        </p>
      </div>

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
              <div className="sap-loading-card" style={{ maxWidth: 680, width: '100%', margin: '0 auto' }}>
                <span className="sap-spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
                <h4>Verifying BOM Existence in SAP...</h4>
                <p>Checking material and plant records prior to deletion proposal.</p>
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
              <div className="sap-result-actions">
                <button
                  type="button"
                  className="sap-btn sap-btn-secondary"
                  onClick={onBack}
                  style={{ height: 28, fontSize: '11px', padding: '0 12px' }}
                >
                  <ArrowLeft size={13} />
                  <span>Return to Launchpad</span>
                </button>
                <button
                  type="button"
                  className="sap-btn sap-btn-primary"
                  onClick={handleReset}
                  style={{ height: 28, fontSize: '11px', padding: '0 12px' }}
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
