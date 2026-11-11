import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Layers,
  Factory,
  Hash,
  X
} from 'lucide-react';
import { validateSourceBom } from '../services/api';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';
import FioriPageHeader from './FioriPageHeader';
import ValueHelpInput from './ValueHelpInput';
import { FormSection, FormGrid, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { Input } from './ui/input';
import { PageContainer } from './layout';
import { FIELD_RULES, validateField } from '@shared/fieldRules.js';
import { checkFieldExistence } from '../services/fieldValidationService';

export default function ValidateBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateBom,
  onNavigateProducts,
  onNavigateHome
}) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    material: '',
    plant: '',
    bomUsage: '1',
    alternativeBom: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const userInteractedRef = React.useRef({});
  const validationSeqRef = React.useRef({});

  const handleUserInteraction = (field) => {
    userInteractedRef.current[field] = true;
  };

  useEffect(() => {
    setTouched({});
    setFieldErrors({});
    setIsSubmitted(false);
    userInteractedRef.current = {};
    validationSeqRef.current = {};
  }, [systemKey]);

  useEffect(() => {
    const handleServerChanged = () => {
      setTouched({});
      setFieldErrors({});
      setIsSubmitted(false);
      userInteractedRef.current = {};
      validationSeqRef.current = {};
    };
    window.addEventListener('sap-server-changed', handleServerChanged);
    return () => window.removeEventListener('sap-server-changed', handleServerChanged);
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, _setErrorMsg] = useState('');
  const setErrorMsg = (msg, err = null) => {
    _setErrorMsg(typeof msg === 'string' ? msg : '');
    if (err) {
      const info = extractErrorInfo(err, typeof msg === 'string' ? msg : 'Error communicating with SAP validation service.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } else if (msg) {
      const info = extractErrorInfo(msg);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    }
  };

  useEffect(() => {
    activityTracker.setOperation('validate_bom', isLoading);
    return () => {
      activityTracker.setOperation('validate_bom', false);
    };
  }, [isLoading]);

  const handleBlur = async (field, ruleKey, isRequired) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = formData[field];
    const res = validateField(ruleKey, val, isRequired);
    if (!res.valid) {
      setFieldErrors((prev) => ({ ...prev, [field]: res.error }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: false }));

    if (val && val.trim() && (ruleKey === 'material' || ruleKey === 'plant')) {
      const curVal = val.trim();
      validationSeqRef.current[field] = (validationSeqRef.current[field] || 0) + 1;
      const seq = validationSeqRef.current[field];
      const existRes = await checkFieldExistence({
        kind: ruleKey,
        value: curVal,
        plant: formData.plant,
        serverId: systemKey
      });
      if (validationSeqRef.current[field] !== seq || formData[field]?.trim() !== curVal) return;
      if (!existRes.valid && existRes.error) {
        setFieldErrors((prev) => ({ ...prev, [field]: existRes.error }));
      }
    }
  };

  const handleValidate = async (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTouched({ material: true, plant: true, bomUsage: true, alternativeBom: true });
    const errors = {};
    const missing = [];

    const matRes = validateField('material', formData.material, true);
    if (!matRes.valid) {
      errors.material = matRes.error;
      missing.push(!formData.material.trim() ? 'Material number is required' : matRes.error);
    }
    const plantRes = validateField('plant', formData.plant, true);
    if (!plantRes.valid) {
      errors.plant = plantRes.error;
      missing.push(!formData.plant.trim() ? 'Plant code is required' : plantRes.error);
    }
    const usageRes = validateField('bomUsage', formData.bomUsage, false);
    if (!usageRes.valid) {
      errors.bomUsage = usageRes.error;
      missing.push(usageRes.error);
    }
    const altRes = validateField('alternativeBom', formData.alternativeBom, false);
    if (!altRes.valid) {
      errors.alternativeBom = altRes.error;
      missing.push(altRes.error);
    }

    // Check existence if format passed
    if (!errors.material && formData.material.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'material',
        value: formData.material.trim(),
        plant: formData.plant,
        serverId: systemKey
      });
      if (!existRes.valid && existRes.error) {
        errors.material = existRes.error;
        missing.push(existRes.error);
      }
    }
    if (!errors.plant && formData.plant.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'plant',
        value: formData.plant.trim(),
        serverId: systemKey
      });
      if (!existRes.valid && existRes.error) {
        errors.plant = existRes.error;
        missing.push(existRes.error);
      }
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      toast.error('Please fill in valid required fields', { messages: missing });
      if (errors.material) document.getElementById('valMaterial')?.focus();
      else if (errors.plant) document.getElementById('valPlant')?.focus();
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    setErrorMsg('');
    setResult(null);

    try {
      const res = await validateSourceBom({
        material: formData.material.trim().toUpperCase(),
        plant: formData.plant.trim().toUpperCase(),
        bomUsage: formData.bomUsage.trim() || '1',
        alternativeBom: formData.alternativeBom.trim() || undefined
      });
      setResult(res);
      if (!res.success) {
        setErrorMsg(res.message || 'BOM validation returned errors.');
      }
    } catch (err) {
      console.error('BOM validation error:', err);
      const text = err.response?.data?.message || err.message || 'Error communicating with SAP validation service.';
      setErrorMsg(text, err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      material: '',
      plant: '',
      bomUsage: '1',
      alternativeBom: ''
    });
    setFieldErrors({});
    setTouched({});
    setIsSubmitted(false);
    userInteractedRef.current = {};
    validationSeqRef.current = {};
    setResult(null);
    setErrorMsg('');
  };

  return (
    <div className="fiori-app-view-root sap-page-viewport">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <FioriPageHeader
        title="Validate BOM"
        subtitle="Check that a material and its BOM are ready in SAP before you create or copy."
        onBack={onBack}
        backTitle="Back to Bill of Materials"
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('validate_bom', { onNavigateHome, onNavigateProducts, onNavigateBom: onNavigateBom || onBack, onBack }, { isLocked: isLoading })}
      />

      <PageContainer>
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
              {/* Validation Parameters Card */}
              <FormSection
                title="BOM Validation Parameters"
                description="Specify material, plant and BOM usage to check BOM status in SAP"
                className="mb-4"
              >
                <form onSubmit={handleValidate}>
                  <FormGrid cols={4}>
                    <FieldWrapper
                      label="Material Number"
                      htmlFor="valMaterial"
                      required
                      error={(touched.material || isSubmitted) ? fieldErrors.material || null : null}
                    >
                      <ValueHelpInput
                        id="valMaterial"
                        kind="material"
                        plant={formData.plant}
                        placeholder="Ex. 100001"
                        maxLength={FIELD_RULES.material.maxLength}
                        value={formData.material}
                        onChange={(e) => {
                          setFormData((p) => ({ ...p, material: e.target.value }));
                          if (fieldErrors.material) setFieldErrors((p) => ({ ...p, material: false }));
                        }}
                        onBlur={() => handleBlur('material', 'material', true)}
                        onSelect={(val, full) => {
                          setFormData((p) => ({
                            ...p,
                            material: val,
                            ...(full?.stlal ? { alternativeBom: full.stlal } : {}),
                            ...(full?.werks && !p.plant ? { plant: full.werks } : {})
                          }));
                          if (fieldErrors.material) setFieldErrors((p) => ({ ...p, material: false }));
                        }}
                        hasError={Boolean((touched.material || isSubmitted) && fieldErrors.material)} onPointerDown={() => handleUserInteraction('material')} onKeyDown={() => handleUserInteraction('material')}
                        aria-label="Validate Material"
                      />
                    </FieldWrapper>

                    <FieldWrapper
                      label="Plant Code"
                      htmlFor="valPlant"
                      required
                      error={(touched.plant || isSubmitted) ? fieldErrors.plant || null : null}
                    >
                      <ValueHelpInput
                        id="valPlant"
                        kind="plant"
                        material={formData.material}
                        placeholder="Ex. 1000"
                        maxLength={FIELD_RULES.plant.maxLength}
                        value={formData.plant}
                        onChange={(e) => {
                          setFormData((p) => ({ ...p, plant: e.target.value }));
                          if (fieldErrors.plant) setFieldErrors((p) => ({ ...p, plant: false }));
                        }}
                        onBlur={() => handleBlur('plant', 'plant', true)}
                        hasError={Boolean((touched.plant || isSubmitted) && fieldErrors.plant)} onPointerDown={() => handleUserInteraction('plant')} onKeyDown={() => handleUserInteraction('plant')}
                        aria-label="Validate Plant"
                      />
                    </FieldWrapper>

                    <FieldWrapper
                      label="BOM Usage"
                      htmlFor="valUsage"
                      error={(touched.bomUsage || isSubmitted) ? fieldErrors.bomUsage || null : null}
                    >
                      <ValueHelpInput
                        id="valUsage"
                        kind="bomUsage"
                        placeholder="1 (Production)"
                        maxLength={FIELD_RULES.bomUsage.maxLength}
                        value={formData.bomUsage}
                        onChange={(e) => setFormData((p) => ({ ...p, bomUsage: e.target.value }))}
                        onBlur={() => handleBlur('bomUsage', 'bomUsage', false)}
                        hasError={Boolean((touched.bomUsage || isSubmitted) && fieldErrors.bomUsage)} onPointerDown={() => handleUserInteraction('bomUsage')} onKeyDown={() => handleUserInteraction('bomUsage')}
                        aria-label="Validate BOM Usage"
                      />
                    </FieldWrapper>

                    <FieldWrapper
                      label="Alternative BOM"
                      htmlFor="valAlternativeBom"
                      error={(touched.alternativeBom || isSubmitted) ? fieldErrors.alternativeBom || null : null}
                    >
                      <Input
                        id="valAlternativeBom"
                        type="text"
                        placeholder="Ex. 01"
                        maxLength={FIELD_RULES.alternativeBom.maxLength}
                        value={formData.alternativeBom}
                        onChange={(e) => setFormData((p) => ({ ...p, alternativeBom: e.target.value }))}
                        onBlur={() => handleBlur('alternativeBom', 'alternativeBom', false)}
                        hasError={Boolean((touched.alternativeBom || isSubmitted) && fieldErrors.alternativeBom)} onPointerDown={() => handleUserInteraction('alternativeBom')} onKeyDown={() => handleUserInteraction('alternativeBom')}
                        isMono
                      />
                    </FieldWrapper>
                  </FormGrid>

                  <FormActions
                    className="sap-card-action-row mt-4 pt-3 border-t border-[var(--color-border-subtle)]"
                    left={
                      <button
                        type="button"
                        className="rx-btn rx-btn-secondary"
                        onClick={handleReset}
                      >
                        <X size={14} />
                        <span>Clear</span>
                      </button>
                    }
                    right={
                      <button
                        type="submit"
                        className="rx-btn rx-btn-primary"
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <span className="sap-spinner" style={{ width: 14, height: 14 }} />
                            <span>Validating in SAP...</span>
                          </>
                        ) : (
                          <>
                            <Search size={14} />
                            <span>Validate in SAP</span>
                          </>
                        )}
                      </button>
                    }
                  />
                </form>
              </FormSection>

              {/* Validation Result Box */}
              {result && result.success && (
                <div
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-xl, 12px)',
                    backgroundColor: result.bomExists ? 'var(--sap-success-bg, #f0fdf4)' : 'var(--sap-warning-bg, #fffbeb)',
                    border: `1px solid ${result.bomExists ? 'var(--sap-success-border, #bbf7d0)' : 'var(--sap-warning-border, #D9E2EC)'}`,
                    boxShadow: 'var(--sap-shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {result.bomExists ? (
                      <CheckCircle2 size={18} color="var(--sap-success, #16a34a)" />
                    ) : (
                      <AlertTriangle size={18} color="var(--sap-warning, #d97706)" />
                    )}
                    <strong style={{ fontSize: '14px', color: result.bomExists ? 'var(--sap-success-text, #166534)' : 'var(--sap-warning-text, #00204E)' }}>
                      {result.bomExists ? 'BOM Exists in SAP' : 'No BOM Found'}
                    </strong>
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--sap-text)', marginBottom: 12 }}>{result.message}</p>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, fontSize: '12px', background: '#ffffff', padding: '12px 16px', borderRadius: 'var(--radius-md, 8px)', border: '1px solid var(--sap-border-subtle, #e2e8f0)' }}>
                    <div>Material: <strong>{result.material || formData.material}</strong></div>
                    <div>Plant: <strong>{result.plant || formData.plant}</strong></div>
                    <div>Components: <strong>{result.componentCount || 0}</strong></div>
                    <div>Alternatives: <strong>{(result.availableAlternatives || []).join(', ') || '01'}</strong></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </PageContainer>
    </div>
  );
}
