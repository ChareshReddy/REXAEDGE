import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import React, { useState, useEffect } from 'react';
import {
  PlusSquare,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  ArrowLeft,
  ChevronLeft,
  ShieldCheck,
  Eye,
  Loader2,
  Calendar,
  Layers,
  Factory,
  Hash,
  AlertCircle
} from 'lucide-react';
import Modal from './Modal';
import FioriPageHeader from './FioriPageHeader';
import ValueHelpInput from './ValueHelpInput';
import Tooltip from './Tooltip';
import { BOM_FIELD_TOOLTIPS } from '../constants/sapFieldHelp';
import { preflightCreateBoms, createSingleBom } from '../services/api';
import activityTracker from '../services/activityTracker';

function getTodayFormatted() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()}`;
}

export default function CreateBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom, initialMaterial, initialPlant }) {
  const [headerData, setHeaderData] = useState({
    material: initialMaterial || '',
    plant: initialPlant || '',
    bomUsage: '1',
    alternativeBom: '01',
    validFrom: getTodayFormatted(),
    baseQty: '1',
    bomStatus: '01',
    altText: ''
  });
  const [components, setComponents] = useState([
    {
      id: 1,
      component: '',
      quantity: '1',
      itemCategory: 'L',
      storageLocation: '',
      referenceNumber: '',
      costingRelevancy: true,
      engineering: true
    }
  ]);

  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [preflightPassed, setPreflightPassed] = useState(false);
  const [preflightData, setPreflightData] = useState(null);

  // Confirmation modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [businessReason, setBusinessReason] = useState('');

  // Execution & result state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);

  const isProd = systemKey === 'PROD';
  const isLocked = isValidating || isExecuting;

  useEffect(() => {
    activityTracker.setOperation('create_bom', isValidating || isExecuting);
    return () => activityTracker.setOperation('create_bom', false);
  }, [isValidating, isExecuting]);

  const handleHeaderChange = (field, value) => {
    if (isLocked) return;
    setHeaderData((prev) => ({ ...prev, [field]: value }));
    setPreflightPassed(false);
    setPreflightData(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  const handleComponentChange = (id, field, value) => {
    if (isLocked) return;
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
    setPreflightPassed(false);
    setPreflightData(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  const handleAddComponent = () => {
    if (isLocked) return;
    const nextId = components.length > 0 ? Math.max(...components.map((c) => c.id)) + 1 : 1;
    setComponents((prev) => [
      ...prev,
      {
        id: nextId,
        component: '',
        quantity: '1',
        itemCategory: 'L',
        storageLocation: '',
        referenceNumber: '',
        costingRelevancy: true,
        engineering: true
      }
    ]);
    setPreflightPassed(false);
    setPreflightData(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  const handleRemoveComponent = (id) => {
    if (isLocked || components.length <= 1) return;
    setComponents((prev) => prev.filter((c) => c.id !== id));
    setPreflightPassed(false);
    setPreflightData(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  // Pre-flight validation
  const handleValidate = async () => {
    if (isLocked) return;
    const errors = [];
    if (!headerData.material.trim()) errors.push('Header Material is required.');
    if (!headerData.plant.trim()) errors.push('Plant is required.');
    if (!headerData.bomUsage.trim()) errors.push('BOM Usage is required.');
    if (!headerData.alternativeBom.trim()) errors.push('Alternative BOM is required.');
    if (!headerData.validFrom.trim()) errors.push('Valid From date is required.');
    if (!headerData.baseQty || parseFloat(headerData.baseQty) <= 0) errors.push('Base quantity must be greater than 0.');
    if (!headerData.bomStatus.trim()) errors.push('BOM Status is required.');

    components.forEach((c, idx) => {
      const rowNum = idx + 1;
      if (!c.component.trim()) errors.push(`Component #${rowNum}: Component material is required.`);
      if (!c.quantity || parseFloat(c.quantity) <= 0) errors.push(`Component #${rowNum}: Quantity must be greater than 0.`);
      if (!c.storageLocation.trim()) errors.push(`Component #${rowNum}: Storage Location is required.`);
      if (c.referenceNumber && c.referenceNumber.length > 40) {
        errors.push(`Component #${rowNum}: Reference Number exceeds 40 characters (${c.referenceNumber.length}); cannot truncate.`);
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      setPreflightPassed(false);
      return;
    }

    setIsValidating(true);
    setValidationErrors([]);

    const bomPayload = {
      sequenceNum: '1',
      material: headerData.material.trim().toUpperCase(),
      plant: headerData.plant.trim().toUpperCase(),
      bomUsage: headerData.bomUsage.trim(),
      alternativeBom: headerData.alternativeBom.trim().padStart(2, '0'),
      validFrom: headerData.validFrom.trim(),
      baseQty: headerData.baseQty.trim(),
      bomStatus: headerData.bomStatus.trim().padStart(2, '0'),
      altText: headerData.altText.trim(),
      components: components.map((c, idx) => ({
        itemNo: String((idx + 1) * 10).padStart(4, '0'),
        component: c.component.trim().toUpperCase(),
        quantity: c.quantity.trim(),
        itemCategory: c.itemCategory.trim() || 'L',
        storageLocation: c.storageLocation.trim().toUpperCase(),
        referenceNumber: c.referenceNumber.trim(),
        costingRelevancy: c.costingRelevancy ? 'X' : '',
        engineering: c.engineering ? 'X' : ''
      }))
    };

    try {
      const res = await preflightCreateBoms({ bom: bomPayload });
      if (res.success && res.boms && res.boms.length > 0) {
        const validatedBom = res.boms[0];
        setPreflightData(validatedBom);

        if (validatedBom.status === 'Ready') {
          setPreflightPassed(true);
          setValidationErrors([]);
          setValidationWarnings(validatedBom.warnings || []);
        } else if (validatedBom.status === 'Already exists - skipped') {
          setPreflightPassed(false);
          setValidationErrors([validatedBom.reason || 'BOM already exists in this plant. Overwriting is strictly prohibited.']);
          setValidationWarnings(validatedBom.warnings || []);
        } else {
          setPreflightPassed(false);
          setValidationErrors(validatedBom.errors?.length > 0 ? validatedBom.errors : [validatedBom.reason || 'Pre-flight validation failed.']);
          setValidationWarnings(validatedBom.warnings || []);
        }
      } else {
        setPreflightPassed(false);
        setValidationErrors([res.message || 'Validation service did not return validation status.']);
        setValidationWarnings([]);
      }
    } catch (err) {
      setPreflightPassed(false);
      setValidationErrors([err.response?.data?.message || err.message || 'Error communicating with validation service.']);
    } finally {
      setIsValidating(false);
    }
  };

  const handleOpenConfirm = () => {
    if (isLocked || !preflightPassed || !preflightData) return;
    setConfirmText('');
    setBusinessReason('');
    setIsConfirmModalOpen(true);
  };

  const handleExecuteCreate = async () => {
    if (isLocked) return;
    if (!preflightPassed || !preflightData) {
      alert('Master data must be validated before creating the BOM.');
      return;
    }
    if (isProd) {
      if (confirmText !== 'CONFIRM') {
        alert('Please type CONFIRM in uppercase to proceed in Production.');
        return;
      }
      if (!businessReason.trim()) {
        alert('Please provide a valid business reason for Production creation.');
        return;
      }
    }

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const res = await createSingleBom({
        bom: preflightData,
        confirmText: isProd ? confirmText : undefined,
        reason: isProd ? businessReason : undefined
      });
      setExecutionResult(res);
      setIsConfirmModalOpen(false);
    } catch (err) {
      setExecutionResult({
        success: false,
        status: 'FAILED',
        message: err.response?.data?.message || err.message || 'BOM creation failed.'
      });
      setIsConfirmModalOpen(false);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleReset = () => {
    setHeaderData({
      material: '',
      plant: '',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: getTodayFormatted(),
      baseQty: '1',
      bomStatus: '01',
      altText: ''
    });
    setComponents([
      {
        id: 1,
        component: '',
        quantity: '1',
        itemCategory: 'L',
        storageLocation: '',
        referenceNumber: '',
        costingRelevancy: true,
        engineering: true
      }
    ]);
    setValidationErrors([]);
    setPreflightPassed(false);
    setPreflightData(null);
    setExecutionResult(null);
    setShowDiscrepancies(false);
  };

  return (
    <div className="fiori-launchpad-root">
      {/* Page Header */}
      <FioriPageHeader
        title="Create Single BOM"
        subtitle="Create a new Bill of Materials header and component list"
        onBack={onBack}
        isLocked={isLocked}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('create_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked })}
      />

      <div className="fiori-body" style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 60 }}>
        {/* RESULT SCREEN */}
        {executionResult ? (
          <div>
            {/* Banner */}
            {executionResult.status === 'SUCCESS' ? (
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
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Created Successfully</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Created Alternative {executionResult.alternativeBom || headerData.alternativeBom} for {headerData.material}: {components.length} component(s) verified in SAP.
                  </p>
                </div>
              </div>
            ) : executionResult.status === 'PARTIAL' ? (
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
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    BOM created with {executionResult.discrepancies?.length || 0} difference(s) from SAP master
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowDiscrepancies(!showDiscrepancies)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'var(--sap-primary)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: 4,
                      textDecoration: 'underline'
                    }}
                  >
                    {showDiscrepancies ? 'Hide details' : 'View details'}
                  </button>
                  {showDiscrepancies && (
                    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--sap-text-dark)' }}>
                      {(executionResult.discrepancies || []).map((d, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>{d}</li>
                      ))}
                    </ul>
                  )}
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
                  background: 'var(--sap-error-bg)',
                  border: '1px solid var(--sap-error-border)',
                  color: 'var(--sap-error)',
                  marginBottom: 24
                }}
              >
                <XCircle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Creation Failed</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    {executionResult.message || 'The SAP system rejected the BOM creation request.'}
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
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                  {executionResult.success ? 1 : 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Total Components</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                  {executionResult.success ? components.length : 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Alternative Created</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-primary)' }}>
                  {executionResult.alternativeBom || headerData.alternativeBom}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Verification Status</div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    marginTop: 6,
                    color: executionResult.status === 'SUCCESS' ? 'var(--sap-success)' : executionResult.status === 'PARTIAL' ? 'var(--sap-warning)' : 'var(--sap-error)'
                  }}
                >
                  {executionResult.status === 'SUCCESS' ? '100% Verified' : executionResult.status === 'PARTIAL' ? 'Partial' : 'Failed'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="sap-btn sap-btn-primary"
                onClick={onBack}
                style={{ padding: '9px 20px' }}
              >
                Return to Launchpad
              </button>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={handleReset}
                style={{ padding: '9px 20px' }}
              >
                Create Another BOM
              </button>
            </div>
          </div>
        ) : (
          /* FORM VIEW */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* In-Progress Execution Banner */}
            {isExecuting && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--sap-surface-subtle)',
                  border: '1px solid var(--sap-primary)',
                  color: 'var(--sap-text-dark)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <Loader2 size={24} className="sap-spin" style={{ color: 'var(--sap-primary)' }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--sap-text-dark)' }}>
                    Creating BOM in SAP...
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginTop: 2 }}>
                    Writing header and component records, and executing strict read-back verification. Please wait.
                  </div>
                </div>
              </div>
            )}

            {/* Validation Alerts */}
            {validationErrors.length > 0 && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--sap-error-bg)',
                  border: '1px solid var(--sap-error-border)',
                  color: 'var(--sap-error)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                  <AlertCircle size={18} />
                  <span>Validation Notice</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {preflightPassed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--sap-success-bg)',
                    border: '1px solid var(--sap-success-border)',
                    color: 'var(--sap-success)',
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>Pre-flight passed! Material master data, units, and SAP simulation verified.</span>
                </div>
                {validationWarnings.length > 0 && (
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--sap-warning-bg)',
                      border: '1px solid var(--sap-warning-border)',
                      color: 'var(--sap-warning)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 4 }}>
                      <AlertTriangle size={18} />
                      <span>Validation Warnings ({validationWarnings.length})</span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--sap-text-dark)' }}>
                      {validationWarnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Header Data Card */}
            <div className="sap-card" style={{ padding: 20 }}>
              <h3 className="sap-section-header">
                BOM Header Data
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.material}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Material*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.material}>
                    <ValueHelpInput
                      kind="material"
                      plant={headerData.plant}
                      placeholder="e.g. A1BH0214C"
                      disabled={isLocked}
                      value={headerData.material}
                      onChange={(e) => handleHeaderChange('material', e.target.value)}
                      onSelect={(val, full) => {
                        handleHeaderChange('material', val);
                        if (full?.stlal) {
                          handleHeaderChange('alternativeBom', full.stlal);
                        }
                        if (full?.werks && !headerData.plant) {
                          handleHeaderChange('plant', full.werks);
                        }
                      }}
                      aria-label="Header Material"
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.plant}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Plant*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.plant}>
                    <ValueHelpInput
                      kind="plant"
                      material={headerData.material}
                      placeholder="e.g. 1010"
                      maxLength={4}
                      disabled={isLocked}
                      value={headerData.plant}
                      onChange={(e) => handleHeaderChange('plant', e.target.value)}
                      aria-label="Header Plant"
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.bomUsage}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>BOM Usage*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.bomUsage}>
                    <input
                      type="text"
                      className="sap-input sap-form-input"
                      placeholder="1"
                      maxLength={1}
                      disabled={isLocked}
                      value={headerData.bomUsage}
                      onChange={(e) => handleHeaderChange('bomUsage', e.target.value)}
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.alternativeBom}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Alternative BOM*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.alternativeBom}>
                    <input
                      type="text"
                      className="sap-input sap-form-input"
                      placeholder="01"
                      maxLength={2}
                      disabled={isLocked}
                      value={headerData.alternativeBom}
                      onChange={(e) => handleHeaderChange('alternativeBom', e.target.value)}
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.validFrom}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Valid From*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.validFrom}>
                    <input
                      type="text"
                      className="sap-input sap-form-input"
                      placeholder="DD.MM.YYYY"
                      disabled={isLocked}
                      value={headerData.validFrom}
                      onChange={(e) => handleHeaderChange('validFrom', e.target.value)}
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.baseQty}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Base Quantity*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.baseQty}>
                    <input
                      type="number"
                      step="any"
                      className="sap-input sap-form-input"
                      placeholder="1"
                      disabled={isLocked}
                      value={headerData.baseQty}
                      onChange={(e) => handleHeaderChange('baseQty', e.target.value)}
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.bomStatus}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>BOM Status*</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.bomStatus}>
                    <input
                      type="text"
                      className="sap-input sap-form-input"
                      placeholder="01"
                      maxLength={2}
                      disabled={isLocked}
                      value={headerData.bomStatus}
                      onChange={(e) => handleHeaderChange('bomStatus', e.target.value)}
                    />
                  </Tooltip>
                </div>

                <div>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.altText}>
                    <label className="sap-label sap-form-label" style={{ cursor: 'help' }}>Alternative Text</label>
                  </Tooltip>
                  <Tooltip text={BOM_FIELD_TOOLTIPS.altText}>
                    <input
                      type="text"
                      className="sap-input sap-form-input"
                      placeholder="Description / Text"
                      maxLength={40}
                      disabled={isLocked}
                      value={headerData.altText}
                      onChange={(e) => handleHeaderChange('altText', e.target.value)}
                    />
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Components Card */}
            <div className="sap-card" style={{ padding: 20 }}>
              <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="sap-section-header" style={{ margin: 0 }}>
                  Component Items ({components.length})
                </h3>
                <button
                  type="button"
                  className="sap-button sap-btn-primary sap-btn-add-component"
                  disabled={isLocked}
                  onClick={handleAddComponent}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '7px 16px',
                    borderRadius: 'var(--sap-radius, 6px)',
                    background: 'var(--sap-primary, #0a6ed1)',
                    color: '#ffffff',
                    border: '1px solid var(--sap-primary, #0a6ed1)',
                    boxShadow: '0 2px 4px rgba(10, 110, 209, 0.25)',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Plus size={15} strokeWidth={2.4} />
                  <span>Add Component</span>
                </button>
              </div>

              <div className="sap-table-container fiori-table-wrapper" style={{ maxHeight: 420 }}>
                <table className="sap-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 50, textAlign: 'center' }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.itemNo}>
                          <span style={{ cursor: 'help' }}>#</span>
                        </Tooltip>
                      </th>
                      <th style={{ minWidth: 160 }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.component}>
                          <span style={{ cursor: 'help' }}>Component*</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 100 }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.quantity}>
                          <span style={{ cursor: 'help' }}>Quantity*</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 85 }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.itemCategory}>
                          <span style={{ cursor: 'help' }}>Item Cat</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 120 }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.storageLocation}>
                          <span style={{ cursor: 'help' }}>Storage Loc*</span>
                        </Tooltip>
                      </th>
                      <th style={{ minWidth: 160 }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.referenceNumber}>
                          <span style={{ cursor: 'help' }}>Reference Number</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 110, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.costingRelevancy}>
                          <span style={{ cursor: 'help' }}>Costing Rel</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 95, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.engineering}>
                          <span style={{ cursor: 'help' }}>Eng Rel</span>
                        </Tooltip>
                      </th>
                      <th style={{ width: 75, textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.action}>
                          <span style={{ cursor: 'help' }}>Action</span>
                        </Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((comp, idx) => {
                      return (
                        <tr key={comp.id}>
                          <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.itemNo}>
                              <span>{String((idx + 1) * 10).padStart(4, '0')}</span>
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.component}>
                              <ValueHelpInput
                                kind="material"
                                plant={headerData.plant}
                                placeholder="Component"
                                disabled={isLocked}
                                value={comp.component}
                                onChange={(e) => handleComponentChange(comp.id, 'component', e.target.value)}
                                style={{ padding: '6px 8px', fontSize: 12 }}
                                aria-label={`Component ${idx + 1}`}
                              />
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.quantity}>
                              <input
                                type="number"
                                step="any"
                                className="sap-form-input"
                                placeholder="Qty"
                                disabled={isLocked}
                                value={comp.quantity}
                                onChange={(e) => handleComponentChange(comp.id, 'quantity', e.target.value)}
                                style={{ padding: '6px 8px', fontSize: 12 }}
                                aria-label={`Quantity ${idx + 1}`}
                              />
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.itemCategory}>
                              <input
                                type="text"
                                className="sap-form-input"
                                maxLength={1}
                                placeholder="L"
                                disabled={isLocked}
                                value={comp.itemCategory}
                                onChange={(e) => handleComponentChange(comp.id, 'itemCategory', e.target.value)}
                                style={{ padding: '6px 8px', fontSize: 12, textAlign: 'center' }}
                                aria-label={`Item Category ${idx + 1}`}
                              />
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.storageLocation}>
                              <ValueHelpInput
                                kind="storageLocation"
                                plant={headerData.plant}
                                placeholder="SLoc"
                                disabled={isLocked}
                                value={comp.storageLocation}
                                onChange={(e) => handleComponentChange(comp.id, 'storageLocation', e.target.value)}
                                onSelect={(sloc, record) => {
                                  handleComponentChange(comp.id, 'storageLocation', sloc);
                                  if (!headerData.plant && record?.werks) {
                                    setHeaderData((prev) => ({ ...prev, plant: record.werks }));
                                  }
                                }}
                                maxLength={4}
                                style={{ padding: '6px 8px', fontSize: 12 }}
                                aria-label={`Storage Location ${idx + 1}`}
                              />
                            </Tooltip>
                          </td>
                          <td>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.referenceNumber}>
                              <input
                                type="text"
                                className="sap-form-input"
                                maxLength={40}
                                placeholder="Max 40 chars"
                                disabled={isLocked}
                                value={comp.referenceNumber}
                                onChange={(e) => handleComponentChange(comp.id, 'referenceNumber', e.target.value)}
                                style={{ padding: '6px 8px', fontSize: 12 }}
                                aria-label={`Reference Number ${idx + 1}`}
                              />
                            </Tooltip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.costingRelevancy}>
                              <input
                                type="checkbox"
                                disabled={isLocked}
                                checked={comp.costingRelevancy}
                                onChange={(e) => handleComponentChange(comp.id, 'costingRelevancy', e.target.checked)}
                                aria-label={`Costing Relevancy ${idx + 1}`}
                                style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                              />
                            </Tooltip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.engineering}>
                              <input
                                type="checkbox"
                                disabled={isLocked}
                                checked={comp.engineering}
                                onChange={(e) => handleComponentChange(comp.id, 'engineering', e.target.checked)}
                                aria-label={`Engineering Relevancy ${idx + 1}`}
                                style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                              />
                            </Tooltip>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <Tooltip text={BOM_FIELD_TOOLTIPS.removeComponent} disabled={isLocked || components.length <= 1}>
                              <button
                                type="button"
                                disabled={isLocked || components.length <= 1}
                                onClick={() => handleRemoveComponent(comp.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: (isLocked || components.length <= 1) ? 'not-allowed' : 'pointer',
                                  color: (isLocked || components.length <= 1) ? 'var(--sap-border, #cbd5e1)' : 'var(--sap-text-muted, #64748b)',
                                  padding: 4,
                                  transition: 'color 0.15s ease'
                                }}
                                aria-label={`Remove component ${idx + 1}`}
                              >
                                <Trash2 size={16} />
                              </button>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="sap-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <button
                type="button"
                className="sap-button"
                disabled={isLocked}
                onClick={handleValidate}
                style={{ height: 30, padding: '0 18px', fontSize: 'var(--sap-size-button)' }}
              >
                {isValidating ? (
                  <>
                    <Loader2 size={16} className="sap-spin" />
                    <span>Validating...</span>
                  </>
                ) : (
                  <span>Validate Master Data</span>
                )}
              </button>

              <button
                type="button"
                className="sap-button primary"
                disabled={!preflightPassed || isLocked}
                onClick={handleOpenConfirm}
                style={{ height: 30, padding: '0 24px', fontSize: 'var(--sap-size-button)' }}
              >
                {isExecuting ? (
                  <>
                    <Loader2 size={16} className="sap-spin" />
                    <span>Creating BOM in SAP...</span>
                  </>
                ) : (
                  <span>Preview & Create BOM</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CONFIRMATION MODAL */}
        <Modal
          isOpen={isConfirmModalOpen}
          onClose={() => {
            if (!isExecuting) setIsConfirmModalOpen(false);
          }}
          title="Confirm BOM Creation"
        >
          <div style={{ padding: 4 }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--sap-text-dark)' }}>
              You are about to create a new Bill of Materials in SAP:
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
              <div><strong>Material:</strong> {headerData.material}</div>
              <div><strong>Plant:</strong> {headerData.plant}</div>
              <div><strong>BOM Usage:</strong> {headerData.bomUsage}</div>
              <div><strong>Alternative:</strong> {headerData.alternativeBom}</div>
              <div><strong>Valid From:</strong> {headerData.validFrom}</div>
              <div><strong>Base Quantity:</strong> {headerData.baseQty}</div>
              <div><strong>Components Count:</strong> {components.length}</div>
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
                onClick={handleExecuteCreate}
                style={{ height: 30, padding: '0 18px', fontSize: 'var(--sap-size-button)' }}
              >
                {isExecuting ? (
                  <>
                    <Loader2 size={16} className="sap-spin" />
                    <span>Creating BOM in SAP...</span>
                  </>
                ) : (
                  'Confirm & Create'
                )}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
