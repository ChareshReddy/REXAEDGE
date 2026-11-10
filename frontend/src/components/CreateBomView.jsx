import SingleBulkSwitch from './layout/SingleBulkSwitch';
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
import { FormSection, FormGrid, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { BOM_FIELD_TOOLTIPS } from '../constants/sapFieldHelp';
import { preflightCreateBoms, createSingleBom } from '../services/api';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';
import { PageContainer } from './layout';
import { FIELD_RULES, validateField, sanitizeValidFromInput, sanitizeBaseQuantityInput, DEFAULT_BASE_UOM, isValidQuantity } from '@shared/fieldRules.js';

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
  const toast = useToast();
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
  const [headerErrors, setHeaderErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const userInteractedRef = React.useRef({});

  const handleUserInteraction = (field) => {
    userInteractedRef.current[field] = true;
  };

  useEffect(() => {
    setHeaderErrors({});
    setTouched({});
    setIsSubmitted(false);
    userInteractedRef.current = {};
  }, [systemKey]);
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
  const isMaterialValid = Boolean(headerData.material && headerData.material.trim().length >= 8 && headerData.material.trim().length <= 19);

  useEffect(() => {
    activityTracker.setOperation('create_bom', isValidating || isExecuting);
    return () => activityTracker.setOperation('create_bom', false);
  }, [isValidating, isExecuting]);

  const handleHeaderChange = (field, value) => {
    if (isLocked) return;
    userInteractedRef.current[field] = true;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const finalVal = field === 'validFrom' ? sanitizeValidFromInput(value) : field === 'baseQty' ? sanitizeBaseQuantityInput(value) : value;
    setHeaderData((prev) => ({ ...prev, [field]: finalVal }));
    if (headerErrors[field]) {
      setHeaderErrors((prev) => ({ ...prev, [field]: false }));
    }
    setPreflightPassed(false);
    setPreflightData(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  };

  const handleHeaderBlur = (field) => {
    if (isLocked) return;
    if (!userInteractedRef.current[field]) return;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = headerData[field];
    const isRequired = ['material', 'plant', 'bomUsage', 'alternativeBom', 'validFrom', 'baseQty', 'bomStatus'].includes(field);
    const res = validateField(field, val, isRequired);
    if (!res.valid) {
      setHeaderErrors((prev) => ({ ...prev, [field]: res.error }));
    } else {
      setHeaderErrors((prev) => ({ ...prev, [field]: false }));
    }
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
    const hErrors = {};

    // Material
    const matRes = validateField('material', headerData.material, true);
    if (!matRes.valid) {
      errors.push(!headerData.material.trim() ? 'Header Material is required.' : matRes.error);
      hErrors.material = !headerData.material.trim() ? 'Material is required' : matRes.error;
    }
    // Plant
    const plantRes = validateField('plant', headerData.plant, true);
    if (!plantRes.valid) {
      errors.push(!headerData.plant.trim() ? 'Plant is required.' : plantRes.error);
      hErrors.plant = !headerData.plant.trim() ? 'Plant is required' : plantRes.error;
    }
    // BOM Usage
    const usageRes = validateField('bomUsage', headerData.bomUsage, true);
    if (!usageRes.valid) {
      errors.push(!headerData.bomUsage.trim() ? 'BOM Usage is required.' : usageRes.error);
      hErrors.bomUsage = !headerData.bomUsage.trim() ? 'BOM Usage is required' : usageRes.error;
    }
    // Alternative BOM
    const altRes = validateField('alternativeBom', headerData.alternativeBom, true);
    if (!altRes.valid) {
      errors.push(!headerData.alternativeBom.trim() ? 'Alternative BOM is required.' : altRes.error);
      hErrors.alternativeBom = !headerData.alternativeBom.trim() ? 'Alternative BOM is required' : altRes.error;
    }
    // Valid From
    const vfRes = validateField('validFrom', headerData.validFrom, true);
    if (!vfRes.valid) {
      errors.push(!headerData.validFrom.trim() ? 'Valid From date is required.' : vfRes.error);
      hErrors.validFrom = !headerData.validFrom.trim() ? 'Valid From date is required' : vfRes.error;
    }
    // Base Qty
    const bqRes = validateField('baseQty', headerData.baseQty, true);
    if (!bqRes.valid) {
      errors.push(bqRes.error);
      hErrors.baseQty = bqRes.error;
    }
    // BOM Status
    const bsRes = validateField('bomStatus', headerData.bomStatus, true);
    if (!bsRes.valid) {
      errors.push(!headerData.bomStatus.trim() ? 'BOM Status is required.' : bsRes.error);
      hErrors.bomStatus = !headerData.bomStatus.trim() ? 'BOM Status is required' : bsRes.error;
    }
    // Alt Text (optional)
    const altTextRes = validateField('altText', headerData.altText, false);
    if (!altTextRes.valid) {
      errors.push(altTextRes.error);
      hErrors.altText = altTextRes.error;
    }

    components.forEach((c, idx) => {
      const rowNum = idx + 1;
      const compRes = validateField('component', c.component, true);
      if (!compRes.valid) {
        errors.push(!c.component.trim() ? `Component #${rowNum}: Component material is required.` : `Component #${rowNum}: ${compRes.error}`);
      }
      const qtyRes = validateField('quantity', c.quantity, true);
      if (!qtyRes.valid) {
        errors.push(`Component #${rowNum}: ${qtyRes.error}`);
      }
      if (!c.storageLocation.trim()) {
        errors.push(`Component #${rowNum}: Storage Location is required.`);
      } else {
        const slocRes = validateField('storageLocation', c.storageLocation, false);
        if (!slocRes.valid) errors.push(`Component #${rowNum}: ${slocRes.error}`);
      }
      if (c.referenceNumber && c.referenceNumber.length > 40) {
        errors.push(`Component #${rowNum}: Reference Number exceeds 40 characters (${c.referenceNumber.length}); cannot truncate.`);
      }
    });

    if (errors.length > 0) {
      setHeaderErrors(hErrors);
      setValidationErrors(errors);
      setPreflightPassed(false);
      toast.validation(errors, 'Validation notice');

      const headerFieldMap = {
        material: 'createBomMaterial',
        plant: 'createBomPlant',
        bomUsage: 'createBomUsage',
        alternativeBom: 'createBomAlt',
        validFrom: 'createBomValidFrom',
        baseQty: 'createBomBaseQty',
        bomStatus: 'createBomStatus'
      };
      const firstInvalidHeader = ['material', 'plant', 'bomUsage', 'alternativeBom', 'validFrom', 'baseQty', 'bomStatus'].find((f) => hErrors[f]);
      if (firstInvalidHeader && headerFieldMap[firstInvalidHeader]) {
        document.getElementById(headerFieldMap[firstInvalidHeader])?.focus();
      }
      return;
    }

    setHeaderErrors({});
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
          toast.success('Pre-flight passed. Material master data, units, and SAP simulation verified.');
          if (validatedBom.warnings?.length > 0) {
            toast.warning(validatedBom.warnings.join('\n'), { title: 'Validation warnings' });
          }
        } else if (validatedBom.status === 'Already exists - skipped') {
          const errList = [validatedBom.reason || 'BOM already exists in this plant. Overwriting is strictly prohibited.'];
          setPreflightPassed(false);
          setValidationErrors(errList);
          setValidationWarnings(validatedBom.warnings || []);
          toast.validation(errList, 'Validation notice');
        } else {
          const errList = validatedBom.errors?.length > 0 ? validatedBom.errors : [validatedBom.reason || 'Pre-flight validation failed.'];
          setPreflightPassed(false);
          setValidationErrors(errList);
          setValidationWarnings(validatedBom.warnings || []);
          toast.validation(errList, 'Validation notice');
        }
      } else {
        const errList = [res.message || 'Validation service did not return validation status.'];
        setPreflightPassed(false);
        setValidationErrors(errList);
        setValidationWarnings([]);
        toast.validation(errList, 'Validation notice');
      }
    } catch (err) {
      const info = extractErrorInfo(err, 'Error communicating with validation service.');
      setPreflightPassed(false);
      setValidationErrors([info.message]);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
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
      toast.warning('Master data must be validated before creating the BOM.', { title: 'Validation notice' });
      return;
    }
    if (isProd) {
      if (confirmText !== 'CONFIRM') {
        toast.warning('Please type CONFIRM in uppercase to proceed in Production.', { title: 'Validation notice' });
        return;
      }
      if (!businessReason.trim()) {
        toast.warning('Please provide a valid business reason for Production creation.', { title: 'Validation notice' });
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
      if (res.success) {
        toast.success(`BOM created successfully in SAP! Material: ${headerData.material}, Plant: ${headerData.plant}`);
      }
    } catch (err) {
      const info = extractErrorInfo(err, 'BOM creation failed.');
      setExecutionResult({
        success: false,
        status: 'FAILED',
        message: info.message
      });
      setIsConfirmModalOpen(false);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
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
        extraTitleContent={<SingleBulkSwitch operation="create" mode="single" />}
        subtitle="Create a new Bill of Materials header and component list"
        onBack={onBack}
        isLocked={isLocked}
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('create_bom', { onNavigateHome, onNavigateProducts, onNavigateBom, onBack }, { isLocked })}
      />

      <PageContainer style={{ marginTop: 24, paddingBottom: 24 }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, width: '100%' }}>
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

            {/* Header Data Card */}
            <FormSection
              title="BOM Header Data"
              description="Material and plant specification for single-level BOM"
              tintedHeader
            >
              <FormGrid>
                <FieldWrapper
                  label="Material"
                  htmlFor="createBomMaterial"
                  required
                  error={(touched.material || isSubmitted) ? headerErrors.material || null : null}
                >
                  <ValueHelpInput
                    id="createBomMaterial"
                    kind="material"
                    plant={headerData.plant}
                    placeholder="Ex. A1BH0214C"
                    maxLength={FIELD_RULES.material.maxLength}
                    disabled={isLocked}
                    value={headerData.material}
                    onChange={(e) => handleHeaderChange('material', e.target.value)}
                    onBlur={() => handleHeaderBlur('material')}
                    onSelect={(val, full) => {
                      handleHeaderChange('material', val);
                      if (full?.stlal) {
                        handleHeaderChange('alternativeBom', full.stlal);
                      }
                      if (full?.werks && !headerData.plant) {
                        handleHeaderChange('plant', full.werks);
                      }
                    }}
                    hasError={Boolean((touched.material || isSubmitted) && headerErrors.material)} onPointerDown={() => handleUserInteraction('material')} onKeyDown={() => handleUserInteraction('material')}
                    aria-label="Header Material"
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Plant"
                  htmlFor="createBomPlant"
                  required
                  error={(touched.plant || isSubmitted) ? headerErrors.plant || null : null}
                >
                  <ValueHelpInput
                    id="createBomPlant"
                    kind="plant"
                    material={headerData.material}
                    placeholder="Ex. 1010"
                    maxLength={FIELD_RULES.plant.maxLength}
                    disabled={isLocked}
                    value={headerData.plant}
                    onChange={(e) => handleHeaderChange('plant', e.target.value)}
                    onBlur={() => handleHeaderBlur('plant')}
                    hasError={Boolean((touched.plant || isSubmitted) && headerErrors.plant)} onPointerDown={() => handleUserInteraction('plant')} onKeyDown={() => handleUserInteraction('plant')}
                    aria-label="Header Plant"
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="BOM Usage"
                  htmlFor="createBomUsage"
                  required
                  error={(touched.bomUsage || isSubmitted) ? headerErrors.bomUsage || null : null}
                >
                  <ValueHelpInput
                    id="createBomUsage"
                    kind="bomUsage"
                    placeholder="1"
                    maxLength={FIELD_RULES.bomUsage.maxLength}
                    disabled={isLocked}
                    value={headerData.bomUsage}
                    onChange={(e) => handleHeaderChange('bomUsage', e.target.value)}
                    onBlur={() => handleHeaderBlur('bomUsage')}
                    hasError={Boolean((touched.bomUsage || isSubmitted) && headerErrors.bomUsage)} onPointerDown={() => handleUserInteraction('bomUsage')} onKeyDown={() => handleUserInteraction('bomUsage')}
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Alternative BOM"
                  htmlFor="createBomAlt"
                  required
                  error={(touched.alternativeBom || isSubmitted) ? headerErrors.alternativeBom || null : null}
                >
                  <input
                    id="createBomAlt"
                    type="text"
                    className={`rx-input rx-input-mono ${headerErrors.alternativeBom ? 'rx-input-error' : ''}`}
                    placeholder="01"
                    maxLength={FIELD_RULES.alternativeBom.maxLength}
                    disabled={isLocked}
                    value={headerData.alternativeBom}
                    onChange={(e) => handleHeaderChange('alternativeBom', e.target.value)}
                    onBlur={() => handleHeaderBlur('alternativeBom')}
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Valid From"
                  htmlFor="createBomValidFrom"
                  required
                  error={(touched.validFrom || isSubmitted) ? headerErrors.validFrom || null : null}
                >
                  <input
                    id="createBomValidFrom"
                    type="text"
                    className={`rx-input ${headerErrors.validFrom ? 'rx-input-error' : ''}`}
                    placeholder="DD.MM.YYYY"
                    disabled={isLocked}
                    value={headerData.validFrom}
                    onChange={(e) => handleHeaderChange('validFrom', e.target.value)}
                    onKeyDown={(e) => {
                      if (!/[\d.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                      }
                    }}
                    onBlur={() => handleHeaderBlur('validFrom')}
                  />
                </FieldWrapper>

                {/* Base Quantity and UOM side by side in the Base Quantity cell */}
                <div className="flex gap-3 w-full items-start">
                  <div style={{ flex: '0 0 calc(55% - 6px)', width: 'calc(55% - 6px)', minWidth: 0 }}>
                    <FieldWrapper
                      label="Base Quantity"
                      htmlFor="createBomBaseQty"
                      required
                      error={(touched.baseQty || isSubmitted) ? headerErrors.baseQty || null : null}
                    >
                      <input
                        id="createBomBaseQty"
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
                        className={`rx-input ${headerErrors.baseQty ? 'rx-input-error' : ''}`}
                        placeholder="1"
                        disabled={isLocked}
                        value={headerData.baseQty}
                        onChange={(e) => handleHeaderChange('baseQty', e.target.value)}
                        onKeyDown={(e) => {
                          if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'].includes(e.key) || e.ctrlKey || e.metaKey) {
                            return;
                          }
                          if (!/^\d$/.test(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onPaste={(e) => {
                          e.preventDefault();
                          const text = e.clipboardData ? e.clipboardData.getData('text') : '';
                          const sanitized = sanitizeBaseQuantityInput(text);
                          handleHeaderChange('baseQty', sanitized);
                        }}
                        onBlur={() => handleHeaderBlur('baseQty')}
                        style={{ height: 40 }}
                      />
                    </FieldWrapper>
                  </div>
                  <div style={{ flex: '0 0 calc(45% - 6px)', width: 'calc(45% - 6px)', minWidth: 0 }}>
                    <FieldWrapper
                      label="UOM"
                      htmlFor="createBomUom"
                    >
                      <input
                        id="createBomUom"
                        type="text"
                        readOnly
                        tabIndex={-1}
                        aria-readonly="true"
                        aria-label="Base Unit of Measure"
                        className="rx-input rx-input-readonly"
                        value={isMaterialValid ? DEFAULT_BASE_UOM : ''}
                        placeholder=""
                        style={{
                          height: 40,
                          backgroundColor: 'var(--color-blue-50)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)',
                          cursor: 'default'
                        }}
                      />
                    </FieldWrapper>
                  </div>
                </div>

                <FieldWrapper
                  label="BOM Status"
                  htmlFor="createBomStatus"
                  required
                  error={(touched.bomStatus || isSubmitted) ? headerErrors.bomStatus || null : null}
                >
                  <input
                    id="createBomStatus"
                    type="text"
                    className={`rx-input rx-input-mono ${headerErrors.bomStatus ? 'rx-input-error' : ''}`}
                    placeholder="01"
                    maxLength={FIELD_RULES.bomStatus.maxLength}
                    disabled={isLocked}
                    value={headerData.bomStatus}
                    onChange={(e) => handleHeaderChange('bomStatus', e.target.value)}
                    onBlur={() => handleHeaderBlur('bomStatus')}
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Alternative Text"
                  htmlFor="createBomAltText"
                  hint="Optional description (up to 40 characters)"
                  error={headerErrors.altText || null}
                  className="md:col-span-2 xl:col-span-2"
                >
                  <input
                    id="createBomAltText"
                    type="text"
                    className={`rx-input ${headerErrors.altText ? 'rx-input-error' : ''}`}
                    placeholder=""
                    maxLength={FIELD_RULES.altText.maxLength}
                    disabled={isLocked}
                    value={headerData.altText}
                    onChange={(e) => handleHeaderChange('altText', e.target.value)}
                    onBlur={() => handleHeaderBlur('altText')}
                    aria-label="Alternative Text"
                  />
                </FieldWrapper>
              </FormGrid>
            </FormSection>

            {/* Components Card */}
            <FormSection
              title={`Component Items (${components.length})`}
              description="Components and item quantities for this bill of materials"
              tintedHeader
              actions={
                <button
                  type="button"
                  className="sap-button sap-btn-primary sap-btn-add-component rx-btn rx-btn-primary rx-btn-sm"
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
              }
            >
              <div className="sap-table-container fiori-table-wrapper rounded-[var(--radius-md)] border border-[var(--color-border)] rx-components-table-container" style={{ maxHeight: 420, minHeight: 0, height: 'auto' }}>
                <table className="sap-table w-full border-collapse text-[13px] rx-components-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '16%' }} />
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '6%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[var(--color-blue-200)] border-b border-[var(--color-border)] min-h-[56px] h-[56px] sticky top-0 z-10">
                      <th style={{ textAlign: 'center', height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.itemNo || 'Item number'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.itemNo || 'Item number'}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>Itm no.</span>
                        </Tooltip>
                      </th>
                      <th style={{ height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] text-left sticky top-0 z-10" aria-label="Component, required">
                        <Tooltip text={BOM_FIELD_TOOLTIPS.component}>
                          <span className="rx-header-label-group" style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span className="rx-header-label-text">Component</span>
                            <span className="text-[var(--color-danger)] font-bold rx-header-star" style={{ marginLeft: 3, lineHeight: 1 }} aria-hidden="true">*</span>
                          </span>
                        </Tooltip>
                      </th>
                      <th style={{ height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] text-left sticky top-0 z-10" aria-label="Quantity, required">
                        <Tooltip text={BOM_FIELD_TOOLTIPS.quantity}>
                          <span className="rx-header-label-group" style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                            <span className="rx-header-label-text">Quantity</span>
                            <span className="text-[var(--color-danger)] font-bold rx-header-star" style={{ marginLeft: 3, lineHeight: 1 }} aria-hidden="true">*</span>
                          </span>
                        </Tooltip>
                      </th>
                      <th style={{ height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] text-left sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.itemCategory || 'Item category'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.itemCategory}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>Item <br />category</span>
                        </Tooltip>
                      </th>
                      <th style={{ height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] text-left sticky top-0 z-10" aria-label="Storage location, required">
                        <Tooltip text={BOM_FIELD_TOOLTIPS.storageLocation}>
                          <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <span>Storage</span>
                            <span className="rx-header-label-group" style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                              <span className="rx-header-label-text">location</span>
                              <span className="text-[var(--color-danger)] font-bold rx-header-star" style={{ marginLeft: 3, lineHeight: 1 }} aria-hidden="true">*</span>
                            </span>
                          </span>
                        </Tooltip>
                      </th>
                      <th style={{ height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] text-left sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.referenceNumber || 'Reference number'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.referenceNumber}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip' }}>Reference number</span>
                        </Tooltip>
                      </th>
                      <th style={{ textAlign: 'center', height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.costingRelevancy || 'Costing relevant'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.costingRelevancy}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', textAlign: 'center' }}>Costing <br />relevant</span>
                        </Tooltip>
                      </th>
                      <th style={{ textAlign: 'center', height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.engineering || 'Engineering relevant'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.engineering}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', textAlign: 'center' }}>Engineering <br />relevant</span>
                        </Tooltip>
                      </th>
                      <th style={{ textAlign: 'center', height: 56, minHeight: 56, verticalAlign: 'middle', lineHeight: 1.25, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', backgroundColor: 'var(--color-blue-200)' }} className="px-2 font-semibold text-[var(--color-navy-900)] sticky top-0 z-10" aria-label={BOM_FIELD_TOOLTIPS.action || 'Action'}>
                        <Tooltip text={BOM_FIELD_TOOLTIPS.action}>
                          <span style={{ display: 'inline-block', whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', textAlign: 'center' }}>Action</span>
                        </Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((comp, idx) => {
                      return (
                        <tr key={comp.id} className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-blue-50)] h-[44px]">
                          <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }} className="px-2 py-1.5">
                            <span>{String((idx + 1) * 10).padStart(4, '0')}</span>
                          </td>
                          <td className="px-2 py-1.5">
                            <ValueHelpInput
                              kind="material"
                              plant={headerData.plant}
                              placeholder=""
                              maxLength={FIELD_RULES.component.maxLength}
                              disabled={isLocked}
                              isTable={true}
                              value={comp.component}
                              onChange={(e) => handleComponentChange(comp.id, 'component', e.target.value)}
                              aria-label={`Component ${idx + 1}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              step="any"
                              className="rx-input rx-input-table"
                              placeholder="Qty"
                              disabled={isLocked}
                              value={comp.quantity}
                              onChange={(e) => handleComponentChange(comp.id, 'quantity', e.target.value)}
                              aria-label={`Quantity ${idx + 1}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              className="rx-input rx-input-table text-center"
                              maxLength={FIELD_RULES.itemCategory.maxLength}
                              placeholder="L"
                              disabled={isLocked}
                              value={comp.itemCategory}
                              onChange={(e) => handleComponentChange(comp.id, 'itemCategory', e.target.value)}
                              aria-label={`Item Category ${idx + 1}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <ValueHelpInput
                              kind="storageLocation"
                              plant={headerData.plant}
                              placeholder=""
                              disabled={isLocked}
                              isTable={true}
                              value={comp.storageLocation}
                              onChange={(e) => handleComponentChange(comp.id, 'storageLocation', e.target.value)}
                              onSelect={(sloc, record) => {
                                handleComponentChange(comp.id, 'storageLocation', sloc);
                                if (!headerData.plant && record?.werks) {
                                  setHeaderData((prev) => ({ ...prev, plant: record.werks }));
                                }
                              }}
                              maxLength={FIELD_RULES.storageLocation.maxLength}
                              aria-label={`Storage location ${idx + 1}`}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              className="rx-input rx-input-table"
                              maxLength={40}
                              placeholder="Max 40 chars"
                              disabled={isLocked}
                              value={comp.referenceNumber}
                              onChange={(e) => handleComponentChange(comp.id, 'referenceNumber', e.target.value)}
                              aria-label={`Reference Number ${idx + 1}`}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }} className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              disabled={isLocked}
                              checked={comp.costingRelevancy}
                              onChange={(e) => handleComponentChange(comp.id, 'costingRelevancy', e.target.checked)}
                              aria-label={`Costing Relevancy ${idx + 1}`}
                              style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }} className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              disabled={isLocked}
                              checked={comp.engineering}
                              onChange={(e) => handleComponentChange(comp.id, 'engineering', e.target.checked)}
                              aria-label={`Engineering Relevancy ${idx + 1}`}
                              style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }} className="px-2 py-1.5">
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
                          </td>
                        </tr>
                      );
                    })}
                    {components.length === 0 && (
                      <tr>
                        <td colSpan={9} className="sap-table-empty-row p-6 text-center text-[var(--color-text-secondary)]">
                          Add a component to get started
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Form Action Row at bottom of Components Card */}
              <FormActions
                className="sap-card-action-row"
                left={
                  <button
                    type="button"
                    className="rx-btn rx-btn-secondary"
                    disabled={isLocked}
                    onClick={() => {
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
                      setComponents([{
                        id: 1,
                        component: '',
                        quantity: '1',
                        itemCategory: 'L',
                        storageLocation: '',
                        referenceNumber: '',
                        costingRelevancy: true,
                        engineering: true
                      }]);
                      setPreflightPassed(false);
                      setPreflightData(null);
                      setValidationErrors([]);
                      setValidationWarnings([]);
                      setHeaderErrors({});
                    }}
                    
                  >
                    <span>Reset</span>
                  </button>
                }
                right={
                  <>
                    <button
                      type="button"
                      className="rx-btn rx-btn-secondary"
                      disabled={isLocked}
                      onClick={handleValidate}
                      
                    >
                      {isValidating ? (
                        <>
                          <Loader2 size={15} className="sap-spin" />
                          <span>Validating...</span>
                        </>
                      ) : (
                        <span>Validate Master Data</span>
                      )}
                    </button>

                    <button
                      type="button"
                      className="rx-btn rx-btn-primary"
                      disabled={!preflightPassed || isLocked}
                      onClick={handleOpenConfirm}
                      
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 size={15} className="sap-spin" />
                          <span>Creating BOM in SAP...</span>
                        </>
                      ) : (
                        <span>Preview & Create BOM</span>
                      )}
                    </button>
                  </>
                }
              />
            </FormSection>
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
      </PageContainer>
    </div>
  );
}
