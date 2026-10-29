import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  Check,
  X,
  Clock,
  Edit3,
  UserPlus,
  Trash2,
  ArrowRight,
  RefreshCw,
  Copy,
  Layers,
  Info
} from 'lucide-react';
import activityTracker from '../services/activityTracker';
import BlockedReasonsList from './BlockedReasonsList';

export default function ConfirmationCard({
  action,
  onConfirm,
  onCancel,
  status = 'pending' // 'pending' | 'executing' | 'confirmed' | 'cancelled' | 'expired' | 'failed'
}) {
  const { actionId, type, preview, expiresAt, riskLevel, requiresReason, systemKey } = action;

  const targetSystem = systemKey || preview?.systemKey || 'DEV';
  const isLevel3 = (riskLevel && riskLevel >= 3) || (preview?.riskLevel >= 3) || requiresReason || preview?.requiresReason || ['release_po', 'post_fi_doc', 'change_master_data'].includes(type);
  const isProd = targetSystem === 'PROD';

  const [reason, setReason] = useState(() => action.reason || preview?.reason || '');
  const [prodConfirmation, setProdConfirmation] = useState('');
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [isActionTriggered, setIsActionTriggered] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(() => {
    if (!expiresAt) return 300;
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  });

  const timerRef = useRef(null);

  const isDone = status === 'confirmed' || status === 'cancelled';
  const isFailed = status === 'failed';
  const isExecuting = status === 'executing' || (isActionTriggered && !isDone && !isFailed);
  const isExpired = (!isExecuting && !isDone && !isFailed && secondsRemaining <= 0) || status === 'expired';

  // Synchronously stop and clear countdown timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // TTL Countdown Timer: runs ONLY while waiting for user confirmation
  useEffect(() => {
    const shouldRunTimer = status === 'pending' && !isActionTriggered && !isExecuting && !isDone && !isFailed && !isExpired;

    if (!shouldRunTimer) {
      stopTimer();
      return;
    }

    // Always clear existing interval before creating a new one to prevent duplicates
    stopTimer();

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) {
        stopTimer();
      }
    }, 1000);

    return () => {
      stopTimer();
    };
  }, [expiresAt, status, isActionTriggered, isExecuting, isDone, isFailed, isExpired, stopTimer]);

  // Track pending confirmation and executing operation for logout warning
  useEffect(() => {
    const isPending = status === 'pending' && !isActionTriggered && !isExecuting && !isDone && !isFailed && !isExpired;
    const cardKey = `card_${actionId || 'pending'}`;
    activityTracker.setConfirmation(cardKey, isPending);
    activityTracker.setOperation(cardKey, isExecuting);

    return () => {
      activityTracker.setConfirmation(cardKey, false);
      activityTracker.setOperation(cardKey, false);
    };
  }, [actionId, status, isExecuting, isActionTriggered, isDone, isFailed, isExpired]);

  const handleConfirmClick = () => {
    setIsActionTriggered(true);
    stopTimer();
    onConfirm(actionId, {
      reason: reason.trim(),
      prodConfirmation: prodConfirmation.trim(),
      systemKey: targetSystem
    });
  };

  const handleCancelClick = () => {
    setIsActionTriggered(true);
    stopTimer();
    onCancel(actionId);
  };

  // Dynamic entity naming
  const entityLabel = preview?.entityLabel || 'Record';
  const recordId = preview?.recordId || preview?.businessPartnerId || '';
  const recordName = preview?.recordName || preview?.businessPartnerName || '';

  const formatTime = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getCardHeader = () => {
    if (type === 'copy_bom') {
      return {
        title: `Copy BOM Confirmation Required`,
        icon: <Copy size={16} color="var(--sap-primary)" />,
        accentClass: 'sap-confirm-card-info'
      };
    }
    if (type === 'delete_bom') {
      return {
        title: `Delete BOM Confirmation Required`,
        icon: <Trash2 size={16} color="var(--sap-error)" />,
        accentClass: 'sap-confirm-card-danger'
      };
    }
    if (type === 'delete') {
      return {
        title: `Delete ${entityLabel} Confirmation Required`,
        icon: <Trash2 size={16} color="var(--sap-error)" />,
        accentClass: 'sap-confirm-card-danger'
      };
    }
    if (type === 'create') {
      return {
        title: `New ${entityLabel} Proposal`,
        icon: <UserPlus size={16} color="var(--sap-primary)" />,
        accentClass: 'sap-confirm-card-info'
      };
    }
    if (type === 'retry') {
      return {
        title: `Retry Background Job Confirmation`,
        icon: <RefreshCw size={16} color="var(--sap-warning)" />,
        accentClass: 'sap-confirm-card-warning'
      };
    }
    if (type === 'reprocess') {
      return {
        title: `Reprocess IDoc Confirmation`,
        icon: <RefreshCw size={16} color="var(--sap-primary)" />,
        accentClass: 'sap-confirm-card-info'
      };
    }
    if (type === 'retrigger') {
      return {
        title: `Retrigger Interface Confirmation`,
        icon: <RefreshCw size={16} color="var(--sap-success)" />,
        accentClass: 'sap-confirm-card-info'
      };
    }
    if (type === 'release_po') {
      return {
        title: `Release Purchase Order Confirmation (Level 3 - ${targetSystem})`,
        icon: <AlertTriangle size={16} color="var(--sap-warning)" />,
        accentClass: 'sap-confirm-card-warning'
      };
    }
    if (type === 'post_fi_doc') {
      return {
        title: `Post Financial Document (Level 3 Critical - ${targetSystem})`,
        icon: <AlertOctagon size={16} color="var(--sap-error)" />,
        accentClass: 'sap-confirm-card-danger'
      };
    }
    if (type === 'change_master_data') {
      return {
        title: `Master Data Modification (Level 3 - ${targetSystem})`,
        icon: <AlertTriangle size={16} color="var(--sap-warning)" />,
        accentClass: 'sap-confirm-card-warning'
      };
    }
    return {
      title: `Update ${entityLabel} Proposal`,
      icon: <Edit3 size={16} color="var(--sap-primary)" />,
      accentClass: 'sap-confirm-card-info'
    };
  };

  const headerInfo = getCardHeader();

  return (
    <div className={`sap-confirm-card ${headerInfo.accentClass}`}>
      {/* Card Header */}
      <div className="sap-confirm-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerInfo.icon}
          <span className="sap-confirm-title">{headerInfo.title}</span>
        </div>

        {/* Status / Expiration Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {status === 'confirmed' && (
            <span className="sap-badge sap-badge-success">
              <Check size={12} /> Executed
            </span>
          )}
          {status === 'cancelled' && (
            <span className="sap-badge sap-badge-neutral">
              <X size={12} /> Cancelled
            </span>
          )}
          {isFailed && (
            <span className="sap-badge sap-badge-danger">
              <AlertOctagon size={12} /> Failed
            </span>
          )}
          {isExecuting && (
            <span className="sap-badge sap-badge-running" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="sap-spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              <span>Executing...</span>
            </span>
          )}
          {isExpired && !isDone && !isExecuting && !isFailed && (
            <span className="sap-badge sap-badge-danger">
              <Clock size={12} /> Expired
            </span>
          )}
          {status === 'pending' && !isActionTriggered && !isExecuting && !isDone && !isFailed && !isExpired && (
            <span className="sap-badge sap-badge-timer" title="Action expires if unconfirmed">
              <Clock size={12} /> Expires in {formatTime(secondsRemaining)}
            </span>
          )}
        </div>
      </div>

      {/* Proposal Body */}
      <div className="sap-confirm-body">
        {/* CASE 1: UPDATE PROPOSAL (DIFF TABLE) */}
        {type === 'update' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target Record: <strong>{entityLabel} #{recordId}</strong>{' '}
              {recordName && <span>({recordName})</span>}
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current Value</th>
                    <th style={{ width: '28px', textAlign: 'center' }}></th>
                    <th>Proposed New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changedFields?.map((cf, idx) => {
                    const oldVal = cf.current !== undefined && cf.current !== null && String(cf.current).trim() !== ''
                      ? cf.current
                      : (cf.currentValue !== undefined && cf.currentValue !== null && String(cf.currentValue).trim() !== '' ? cf.currentValue : '');
                    const newVal = cf.proposed !== undefined && cf.proposed !== null && String(cf.proposed).trim() !== ''
                      ? cf.proposed
                      : (cf.proposedValue !== undefined && cf.proposedValue !== null && String(cf.proposedValue).trim() !== '' ? cf.proposedValue : '');

                    const formatVal = (val) => {
                      if (val === undefined || val === null || String(val).trim() === '') return '—';
                      if (cf.field === 'Category') {
                        if (val === '1') return '1 (Person)';
                        if (val === '2') return '2 (Organization)';
                      }
                      return String(val);
                    };

                    return (
                      <tr key={idx}>
                        <td className="sap-diff-field-name">{cf.field}</td>
                        <td className="sap-diff-old-val">{formatVal(oldVal)}</td>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                          <ArrowRight size={14} />
                        </td>
                        <td className="sap-diff-new-val">{formatVal(newVal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 2: CREATE PROPOSAL (FIELDS LIST) */}
        {type === 'create' && (
          <div>
            <div className="sap-confirm-partner-meta">
              A new {entityLabel} record will be created:
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Specified Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview.fields || {}).map(([key, val], idx) => (
                    <tr key={idx}>
                      <td className="sap-diff-field-name">{key}</td>
                      <td className="sap-diff-new-val">
                        {key === 'Category'
                          ? val === '1'
                            ? '1 (Person)'
                            : '2 (Organization)'
                          : String(val)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 2B: COPY BOM PROPOSAL */}
        {type === 'copy_bom' && (
          <div>
            <div className="sap-confirm-partner-meta" style={{ fontWeight: 600, fontSize: '13px', marginBottom: 12, color: 'var(--sap-text)' }}>
              {preview?.summary || `Copy BOM: ${preview?.sourceMaterial} (Plant ${preview?.sourcePlant}) → ${preview?.targetMaterial} (Plant ${preview?.targetPlant})`}
            </div>

            {(preview?.blocked || preview?.canCopy === false) && (
              <BlockedReasonsList
                problems={preview?.problems || preview?.rawErrors || preview?.message}
                totalBoms={preview?.totalBomsSimulated || preview?.totalBoms}
                message={preview?.message || preview?.blockReason}
              />
            )}

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>Parameter</th>
                    <th style={{ width: '36%' }}>Source (Reference BOM)</th>
                    <th style={{ width: '36%' }}>Target (New BOM)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Material</td>
                    <td style={{ color: 'var(--sap-text-muted)' }}>{preview?.sourceMaterial}</td>
                    <td>
                      {preview?.sourceMaterial !== preview?.targetMaterial ? (
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--sap-radius)', background: 'var(--sap-success-bg)', color: 'var(--sap-success-text)', fontWeight: 600 }}>
                          {preview?.targetMaterial}
                        </span>
                      ) : (
                        <strong style={{ color: 'var(--sap-text)' }}>{preview?.targetMaterial}</strong>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Plant</td>
                    <td style={{ color: 'var(--sap-text-muted)' }}>{preview?.sourcePlant}</td>
                    <td>
                      {preview?.sourcePlant !== preview?.targetPlant ? (
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--sap-radius)', background: 'var(--sap-success-bg)', color: 'var(--sap-success-text)', fontWeight: 600 }}>
                          {preview?.targetPlant}
                        </span>
                      ) : (
                        <strong style={{ color: 'var(--sap-text)' }}>{preview?.targetPlant}</strong>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">BOM Usage</td>
                    <td style={{ color: 'var(--sap-text-muted)' }}>{preview?.sourceUsage || '1'}</td>
                    <td>
                      {preview?.sourceUsage !== preview?.targetUsage ? (
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--sap-radius)', background: 'var(--sap-success-bg)', color: 'var(--sap-success-text)', fontWeight: 600 }}>
                          {preview?.targetUsage || '1'}
                        </span>
                      ) : (
                        <strong style={{ color: 'var(--sap-text)' }}>{preview?.targetUsage || '1'}</strong>
                      )}
                    </td>
                  </tr>
                  {(preview?.sourceAltBom || preview?.targetAltBom) && (
                    <tr>
                      <td className="sap-diff-field-name">Alternative BOM</td>
                      <td style={{ color: 'var(--sap-text-muted)' }}>{preview?.sourceAltBom || 'Default'}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 'var(--sap-radius)', background: 'var(--sap-primary-light)', color: 'var(--sap-primary)', fontWeight: 600, fontSize: '11px' }}>
                          {preview?.targetAltBom || 'Auto-select'}
                        </span>
                      </td>
                    </tr>
                  )}
                  {preview?.validFrom && (
                    <tr>
                      <td className="sap-diff-field-name">Valid From</td>
                      <td style={{ color: 'var(--sap-text-muted)' }}>-</td>
                      <td style={{ color: 'var(--sap-text)', fontWeight: 600 }}>{preview?.validFrom}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{
              marginTop: 12,
              padding: '10px 14px',
              background: 'var(--sap-bg)',
              border: '1px solid var(--sap-border)',
              borderRadius: 'var(--sap-radius)',
              fontSize: '12px',
              color: 'var(--sap-text-muted)',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}>
              <Info size={16} color="var(--sap-primary)" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                The complete BOM hierarchy will be copied and structurally verified. Any sub-BOMs will be preserved, and existing BOMs in the target plant will not be overwritten (created under the next available alternative).
              </span>
            </div>
          </div>
        )}

        {/* CASE 3: DELETE PROPOSAL (DANGER WARNING + RECORD SUMMARY) */}
        {type === 'delete' && (
          <div>
            <div className="sap-confirm-danger-banner">
              <AlertOctagon size={20} color="var(--sap-error)" style={{ flexShrink: 0 }} />
              <div>
                <strong>Warning: Permanent Deletion of {entityLabel}</strong>
                <p style={{ fontSize: '12px', marginTop: 2 }}>
                  Deleting this {entityLabel.toLowerCase()} will permanently remove the record.
                </p>
              </div>
            </div>

            <div className="sap-confirm-delete-preview">
              <div>
                <span className="sap-label">{entityLabel} ID:</span>{' '}
                <strong>#{recordId}</strong>
              </div>
              {recordName && (
                <div>
                  <span className="sap-label">Name:</span>{' '}
                  <strong>{recordName}</strong>
                </div>
              )}
              {preview.city && (
                <div>
                  <span className="sap-label">Location:</span>{' '}
                  <span>{preview.city}, {preview.country || '—'}</span>
                </div>
              )}
            </div>

            {/* Extra safety guard checkbox for deletes */}
            {!isDone && !isExpired && (
              <div className="sap-delete-checkbox-container">
                <label className="sap-delete-checkbox-label">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                    disabled={isExecuting}
                  />
                  <span>I understand that this action cannot be undone.</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* CASE 3B: DELETE BOM PROPOSAL (ZBOM_COPY) */}
        {type === 'delete_bom' && (
          <div>
            <div className="sap-confirm-danger-banner">
              <AlertOctagon size={20} color="var(--sap-error)" style={{ flexShrink: 0 }} />
              <div>
                <strong>Warning: Permanent Deletion of Bill of Materials</strong>
                <p style={{ fontSize: '12px', marginTop: 2 }}>
                  You are about to delete BOM: Material: <strong>{preview?.material}</strong>, Plant: <strong>{preview?.plant}</strong>, Alternative BOM: <strong>{preview?.alternativeBom}</strong>, BOM Usage: <strong>{preview?.bomUsage || '1'}</strong>. This will permanently delete the selected BOM. Do you want to proceed?
                </p>
              </div>
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Delete BOM Parameters" style={{ marginTop: 10 }}>
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Material</td>
                    <td className="sap-diff-new-val"><strong>{preview?.material}</strong></td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Plant</td>
                    <td className="sap-diff-new-val"><strong>{preview?.plant}</strong></td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Alternative BOM</td>
                    <td className="sap-diff-new-val"><strong>{preview?.alternativeBom}</strong></td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">BOM Usage</td>
                    <td className="sap-diff-new-val"><strong>{preview?.bomUsage || '1'}</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 10, fontSize: '12px', color: 'var(--sap-text-muted)' }}>
              ℹ️ Executed directly in SAP. BOM operations are verified and committed in your SAP system.
            </div>

            {/* Extra safety guard checkbox for deletes */}
            {!isDone && !isExpired && (
              <div className="sap-delete-checkbox-container" style={{ marginTop: 12 }}>
                <label className="sap-delete-checkbox-label">
                  <input
                    type="checkbox"
                    checked={deleteAcknowledged}
                    onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                    disabled={isExecuting}
                  />
                  <span>I understand that this action cannot be undone and will permanently delete this BOM in SAP.</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* CASE 4: RETRY BACKGROUND JOB PROPOSAL */}
        {type === 'retry' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target Background Job: <strong>{preview.jobName || recordName || 'Background Job'}</strong>{' '}
              <span className="sap-code-pill" style={{ marginLeft: 6 }}>#{recordId || preview.jobId}</span>
            </div>

            {/* Diagnostic Summary Box */}
            <div style={{
              background: 'var(--sap-bg)',
              border: '1px solid var(--sap-border)',
              borderRadius: 'var(--sap-radius)',
              padding: '12px 14px',
              marginBottom: 12,
              fontSize: '12.5px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--sap-text)' }}>
                  Diagnosis: {preview.diagnosis?.category || 'Recoverable Transient Failure'}
                </span>
                <span className="sap-badge sap-badge-timer" style={{ fontSize: '11px' }}>
                  Risk Level {preview.diagnosis?.riskLevel || 2}: Low Risk (Operator Required)
                </span>
              </div>

              {preview.diagnosis?.matchedMessage && (
                <div style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11.5px',
                  background: 'var(--sap-error-bg)',
                  color: 'var(--sap-error-text)',
                  padding: '6px 10px',
                  borderRadius: 'var(--sap-radius)',
                  marginBottom: 8,
                  wordBreak: 'break-word'
                }}>
                  {preview.diagnosis.matchedMessage}
                </div>
              )}

              <p style={{ margin: 0, color: 'var(--sap-text-muted)', fontSize: '12px', lineHeight: 1.4 }}>
                <strong>Runbook Evaluation:</strong> {preview.diagnosis?.description || 'Automated error classification determined this failure is transient and safe to retry.'}
              </p>
            </div>

            {/* Status Transition Table */}
            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Current Value</th>
                    <th style={{ width: '28px', textAlign: 'center' }}></th>
                    <th>Post-Execution State</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Status</td>
                    <td className="sap-diff-old-val">
                      <span className="sap-badge sap-badge-danger">{preview.currentStatus || 'CANCELLED'}</span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                      <ArrowRight size={14} />
                    </td>
                    <td className="sap-diff-new-val">
                      <span className="sap-badge sap-badge-success">FINISHED</span>
                    </td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Retry Count</td>
                    <td className="sap-diff-old-val">{preview.currentRetryCount ?? 0}</td>
                    <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                      <ArrowRight size={14} />
                    </td>
                    <td className="sap-diff-new-val">{preview.proposedRetryCount ?? (preview.currentRetryCount ?? 0) + 1}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 5: REPROCESS IDOC PROPOSAL */}
        {type === 'reprocess' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target IDoc: <strong>{preview.idocType || 'IDoc'} #{recordId || preview.idocNumber}</strong>{' '}
              {preview.partner && <span>(Partner: {preview.partner})</span>}
              {preview.direction && <span className="sap-badge sap-badge-org" style={{ marginLeft: 6, fontSize: '11px' }}>{preview.direction}</span>}
            </div>

            {/* Diagnostic Summary Box */}
            <div style={{
              background: 'var(--sap-bg)',
              border: '1px solid var(--sap-border)',
              borderRadius: 'var(--sap-radius)',
              padding: '12px 14px',
              marginBottom: 12,
              fontSize: '12.5px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--sap-text)' }}>
                  Diagnosis: {preview.diagnosis?.category || 'Recoverable Transient Failure'}
                </span>
                <span className="sap-badge sap-badge-timer" style={{ fontSize: '11px' }}>
                  Risk Level {preview.diagnosis?.riskLevel || 2}: Low Risk (Operator Required)
                </span>
              </div>

              {preview.diagnosis?.matchedMessage && (
                <div style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11.5px',
                  background: 'var(--sap-error-bg)',
                  color: 'var(--sap-error-text)',
                  padding: '6px 10px',
                  borderRadius: 'var(--sap-radius)',
                  marginBottom: 8,
                  wordBreak: 'break-word'
                }}>
                  {preview.diagnosis.matchedMessage}
                </div>
              )}

              <p style={{ margin: 0, color: 'var(--sap-text-muted)', fontSize: '12px', lineHeight: 1.4 }}>
                <strong>Runbook Evaluation:</strong> {preview.diagnosis?.description || 'Automated error classification determined this IDoc failure is transient and safe to reprocess.'}
              </p>
            </div>

            {/* Status Transition Table */}
            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Current Value</th>
                    <th style={{ width: '28px', textAlign: 'center' }}></th>
                    <th>Post-Execution State</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Status</td>
                    <td className="sap-diff-old-val">
                      <span className="sap-badge sap-badge-danger">{preview.currentStatus || '51-Error'}</span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                      <ArrowRight size={14} />
                    </td>
                    <td className="sap-diff-new-val">
                      <span className="sap-badge sap-badge-success">{preview.proposedStatus || '53-Successful'}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 6: RETRIGGER INTERFACE PROPOSAL */}
        {type === 'retrigger' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target Interface: <strong>{preview.interfaceName || 'Interface'}</strong>{' '}
              <span className="sap-code-pill" style={{ marginLeft: 6 }}>#{recordId || preview.interfaceId}</span>
              {preview.sourceSystem && preview.targetSystem && (
                <span style={{ marginLeft: 8, fontSize: '12px', color: 'var(--sap-text-muted)' }}>
                  ({preview.sourceSystem} &rarr; {preview.targetSystem})
                </span>
              )}
            </div>

            {/* Diagnostic Summary Box */}
            <div style={{
              background: 'var(--sap-bg)',
              border: '1px solid var(--sap-border)',
              borderRadius: 'var(--sap-radius)',
              padding: '12px 14px',
              marginBottom: 12,
              fontSize: '12.5px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--sap-text)' }}>
                  Diagnosis: {preview.diagnosis?.category || 'Recoverable Transient Failure'}
                </span>
                <span className="sap-badge sap-badge-timer" style={{ fontSize: '11px' }}>
                  Risk Level {preview.diagnosis?.riskLevel || 2}: Low Risk (Operator Required)
                </span>
              </div>

              {(preview.diagnosis?.matchedMessage || preview.failureReason) && (
                <div style={{
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: '11.5px',
                  background: 'var(--sap-error-bg)',
                  color: 'var(--sap-error-text)',
                  padding: '6px 10px',
                  borderRadius: 'var(--sap-radius)',
                  marginBottom: 8,
                  wordBreak: 'break-word'
                }}>
                  {preview.diagnosis?.matchedMessage || preview.failureReason}
                </div>
              )}

              <p style={{ margin: 0, color: 'var(--sap-text-muted)', fontSize: '12px', lineHeight: 1.4 }}>
                <strong>Runbook Evaluation:</strong> {preview.diagnosis?.description || 'Automated error classification determined this interface flow failure is transient and safe to retrigger.'}
              </p>
            </div>

            {/* Status Transition Table */}
            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Current Value</th>
                    <th style={{ width: '28px', textAlign: 'center' }}></th>
                    <th>Post-Execution State</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Status</td>
                    <td className="sap-diff-old-val">
                      <span className="sap-badge sap-badge-danger">{preview.currentStatus || 'FAILED'}</span>
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                      <ArrowRight size={14} />
                    </td>
                    <td className="sap-diff-new-val">
                      <span className="sap-badge sap-badge-success">{preview.proposedStatus || 'SUCCESS'}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 7: RELEASE PURCHASE ORDER PROPOSAL (LEVEL 3) */}
        {type === 'release_po' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target Purchase Order: <strong>#{preview.poNumber || recordId}</strong>{' '}
              {preview.vendorName && <span>(Vendor: {preview.vendorName})</span>}
              <span className="sap-badge sap-badge-timer" style={{ marginLeft: 6, fontSize: '11px' }}>
                Risk Level 3: Sensitive Action
              </span>
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Action Parameters" style={{ marginTop: 8 }}>
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="sap-diff-field-name">Target Environment</td>
                    <td className="sap-diff-new-val"><strong>{targetSystem}</strong></td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Total PO Value</td>
                    <td className="sap-diff-new-val">
                      {preview.currency || 'USD'} {Number(preview.totalAmount || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Purchasing Org / CoCode</td>
                    <td className="sap-diff-new-val">{preview.purchasingOrg || '1000'} / {preview.companyCode || '1000'}</td>
                  </tr>
                  <tr>
                    <td className="sap-diff-field-name">Release Status Transition</td>
                    <td className="sap-diff-new-val">
                      <span className="sap-badge sap-badge-danger">01 (In Release)</span>
                      {' '}&rarr;{' '}
                      <span className="sap-badge sap-badge-success">02 (Released)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 8: POST FINANCIAL DOCUMENT PROPOSAL (LEVEL 3) */}
        {type === 'post_fi_doc' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Target Company Code: <strong>{preview.companyCode || '1000'}</strong> ({preview.currency || 'USD'})
              <span className="sap-badge sap-badge-danger" style={{ marginLeft: 6, fontSize: '11px' }}>
                Risk Level 3: Highest Operational Scrutiny
              </span>
            </div>

            <div style={{ fontSize: '12px', margin: '6px 0', color: 'var(--sap-text-muted)' }}>
              Header: <strong>{preview.headerText || 'General Ledger Posting'}</strong> | Doc Type: <strong>{preview.documentType || 'SA'}</strong> | Environment: <strong>{targetSystem}</strong>
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>G/L Account</th>
                    <th>D/C</th>
                    <th>Amount</th>
                    <th>Item Text</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="sap-diff-field-name">{it.glAccount}</td>
                      <td>
                        <span className={`sap-badge ${['S', 'D'].includes(String(it.debitCredit).toUpperCase()) ? 'sap-badge-info' : 'sap-badge-warning'}`}>
                          {['S', 'D'].includes(String(it.debitCredit).toUpperCase()) ? 'Debit (S)' : 'Credit (H)'}
                        </span>
                      </td>
                      <td className="sap-diff-new-val">{Number(it.amount).toFixed(2)}</td>
                      <td>{it.itemText || '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--sap-bg)', fontWeight: 600 }}>
                    <td colSpan={2}>Debit / Credit Totals:</td>
                    <td colSpan={2}>
                      Debit: {Number(preview.totalDebit || 0).toFixed(2)} | Credit: {Number(preview.totalCredit || 0).toFixed(2)}
                      {preview.isBalanced === false && (
                        <span style={{ color: 'var(--sap-error)', marginLeft: 8 }}>(Unbalanced!)</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* CASE 9: MASTER DATA MODIFICATION PROPOSAL (LEVEL 3) */}
        {type === 'change_master_data' && (
          <div>
            <div className="sap-confirm-partner-meta">
              Master Data Entity: <strong>{entityLabel} #{recordId}</strong>{' '}
              {recordName && <span>({recordName})</span>}
              <span className="sap-badge sap-badge-timer" style={{ marginLeft: 6, fontSize: '11px' }}>
                Risk Level 3: Sensitive Action ({targetSystem})
              </span>
            </div>

            <div className="sap-diff-table-wrapper" tabIndex={0} role="region" aria-label="Proposal Diff Table">
              <table className="sap-diff-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Current Value</th>
                    <th style={{ width: '28px', textAlign: 'center' }}></th>
                    <th>Proposed Value</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changedFields?.map((cf, idx) => (
                    <tr key={idx}>
                      <td className="sap-diff-field-name">{cf.fieldLabel || cf.field}</td>
                      <td className="sap-diff-old-val">{String(cf.current ?? '—')}</td>
                      <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                        <ArrowRight size={14} />
                      </td>
                      <td className="sap-diff-new-val">{String(cf.proposed ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Mandatory Reason for Level 3 Actions */}
        {isLevel3 && !isDone && !isExpired && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--sap-warning-bg)', border: '1px solid var(--sap-warning-border)', borderRadius: 'var(--sap-radius)' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--sap-warning-text)', marginBottom: 4 }}>
              Mandatory Reason for Change (Business Justification):
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isExecuting}
              placeholder="Provide business justification (e.g. Approved by Procurement Lead, RFC-2024-8891)..."
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12px',
                border: '1px solid var(--sap-warning)',
                borderRadius: 'var(--sap-radius)',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}

        {/* PROD Double-Confirmation Safeguard */}
        {isProd && isLevel3 && !isDone && !isExpired && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--sap-error-bg)', border: '1px solid var(--sap-error-border)', borderRadius: 'var(--sap-radius)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <AlertTriangle size={14} color="var(--sap-error)" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--sap-error-text)' }}>
                PRODUCTION SAFEGUARD: Type "CONFIRM" to authorize
              </span>
            </div>
            <input
              type="text"
              value={prodConfirmation}
              onChange={(e) => setProdConfirmation(e.target.value)}
              disabled={isExecuting}
              placeholder='Type "CONFIRM" in capital letters'
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '12.5px',
                fontWeight: 600,
                fontFamily: 'monospace',
                border: prodConfirmation === 'CONFIRM' ? '1.5px solid var(--sap-success)' : '1.5px solid var(--sap-error)',
                borderRadius: 'var(--sap-radius)',
                boxSizing: 'border-box'
              }}
            />
          </div>
        )}
      </div>

      {/* Card Actions Footer */}
      {!isDone && !isExpired && !isFailed && (
        <div className="sap-confirm-footer sap-toolbar" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            className="sap-button sap-btn sap-btn-secondary"
            onClick={handleCancelClick}
            disabled={isExecuting}
            style={{ fontSize: '13px', padding: '6px 14px' }}
          >
            <X size={14} />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            className={`sap-button sap-btn ${type === 'delete' || type === 'delete_bom' || type === 'post_fi_doc' ? 'destructive sap-button-danger sap-btn-danger' : 'sap-btn-primary'}`}
            onClick={handleConfirmClick}
            disabled={
              isExecuting ||
              ((type === 'delete' || type === 'delete_bom') && !deleteAcknowledged) ||
              (isLevel3 && type !== 'delete_bom' && !reason.trim()) ||
              (isProd && isLevel3 && prodConfirmation.trim() !== 'CONFIRM') ||
              Boolean(preview?.blocked || preview?.canCopy === false)
            }
            style={{ fontSize: '13px', padding: '6px 18px', gap: 6 }}
          >
            {isExecuting ? (
              <>
                <span className="sap-spinner" style={{ width: 14, height: 14 }} />
                <span>Executing...</span>
              </>
            ) : (
              <>
                {type === 'delete' || type === 'delete_bom' || type === 'post_fi_doc' ? (
                  <Trash2 size={14} />
                ) : type === 'retry' || type === 'reprocess' || type === 'retrigger' ? (
                  <RefreshCw size={14} />
                ) : (
                  <Check size={14} />
                )}
                <span>
                  {type === 'delete_bom'
                    ? 'Confirm Delete BOM'
                    : type === 'delete'
                    ? 'Confirm Delete'
                    : type === 'create'
                    ? 'Confirm Creation'
                    : type === 'copy_bom'
                    ? 'Confirm Copy BOM'
                    : type === 'retry'
                    ? 'Confirm Job Retry'
                    : type === 'reprocess'
                    ? 'Confirm Reprocess'
                    : type === 'retrigger'
                    ? 'Confirm Retrigger'
                    : type === 'release_po'
                    ? 'Authorize PO Release'
                    : type === 'post_fi_doc'
                    ? 'Authorize Financial Post'
                    : type === 'change_master_data'
                    ? 'Authorize Master Data Change'
                    : 'Confirm Update'}
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {isDone && (
        <div className="sap-confirm-footer" style={{ justifyContent: 'flex-start', color: 'var(--sap-text-muted)', fontSize: '12px' }}>
          {status === 'confirmed'
            ? '✓ This action has been verified and executed.'
            : '✕ This proposal was cancelled by the user.'}
        </div>
      )}

      {isExpired && !isDone && !isFailed && (
        <div className="sap-confirm-footer" style={{ color: 'var(--sap-error)', fontSize: '12px' }}>
          ⚠️ This proposal expired after 5 minutes of inactivity. Please issue a new request.
        </div>
      )}

      {isFailed && (
        <div className="sap-confirm-footer" style={{ color: 'var(--sap-error)', fontSize: '12px' }}>
          ⚠️ Execution failed.
        </div>
      )}
    </div>
  );
}
