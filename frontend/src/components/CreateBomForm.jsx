import React, { useState, useEffect } from 'react';
import {
  Copy,
  AlertCircle,
  ArrowRight,
  X,
  Calendar,
  Layers,
  Factory,
  Hash,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2
} from 'lucide-react';
import { validateSourceBom } from '../services/api';
import ValueHelpInput from './ValueHelpInput';
import { FormSection, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { useToast } from '../context/ToastContext';
import { FIELD_RULES, validateField, sanitizeValidFromInput } from '@shared/fieldRules.js';

function getTodayFormatted() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(today.getDate())}.${pad(today.getMonth() + 1)}.${today.getFullYear()}`;
}

export default function CreateBomForm({
  onSubmit,
  onCancel,
  initialValues = {},
  hideHeader = false,
  hideFormActions = false,
  isSubmitting = false,
  formId = 'copy-bom-form',
  onValuesChange,
  style = {}
}) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    sourceMaterial: initialValues.sourceMaterial || initialValues.material || '',
    sourcePlant: initialValues.sourcePlant || '',
    sourceUsage: initialValues.sourceUsage || '1',
    sourceAltBom: initialValues.sourceAltBom || '',
    targetMaterial: initialValues.targetMaterial || initialValues.material || '',
    targetPlant: initialValues.targetPlant || '',
    targetUsage: initialValues.targetUsage || '1',
    targetAltBom: initialValues.targetAltBom || '',
    validFrom: initialValues.validFrom !== undefined ? initialValues.validFrom : getTodayFormatted()
  });

  useEffect(() => {
    if (onValuesChange) {
      onValuesChange(formData);
    }
  }, [formData, onValuesChange]);

  const [validationError, setValidationError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const userInteractedRef = React.useRef({});

  const handleUserInteraction = (field) => {
    userInteractedRef.current[field] = true;
  };

  // Source BOM SAP validation states
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const handleChange = (field, value) => {
    userInteractedRef.current[field] = true;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const finalVal = field === 'validFrom' ? sanitizeValidFromInput(value) : value;
    setFormData((prev) => ({ ...prev, [field]: finalVal }));
    if (validationError) setValidationError('');
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
    }

    // If user edits any SOURCE field after validation, clear old validation result
    if (['sourceMaterial', 'sourcePlant', 'sourceUsage', 'sourceAltBom'].includes(field)) {
      setIsValidated(false);
      setValidationResult(null);
    }
  };

  const handleBlur = (field, ruleKey, isRequired) => {
    if (!userInteractedRef.current[field]) return;
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = formData[field];
    const res = validateField(ruleKey, val, isRequired);
    if (!res.valid) {
      setFieldErrors((prev) => ({ ...prev, [field]: res.error }));
    } else {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleValidateSource = async () => {
    setValidationError('');
    setTouched((prev) => ({ ...prev, sourceMaterial: true, sourcePlant: true, sourceUsage: true, sourceAltBom: true }));
    const errors = {};
    const missing = [];

    const srcMatRes = validateField('material', formData.sourceMaterial, true);
    if (!srcMatRes.valid) {
      errors.sourceMaterial = srcMatRes.error;
      missing.push(!formData.sourceMaterial.trim() ? 'Source: Material is required' : `Source: ${srcMatRes.error}`);
    }
    const srcPlantRes = validateField('plant', formData.sourcePlant, true);
    if (!srcPlantRes.valid) {
      errors.sourcePlant = srcPlantRes.error;
      missing.push(!formData.sourcePlant.trim() ? 'Source: Plant is required' : `Source: ${srcPlantRes.error}`);
    }
    const srcUsageRes = validateField('bomUsage', formData.sourceUsage, true);
    if (!srcUsageRes.valid) {
      errors.sourceUsage = srcUsageRes.error;
      missing.push(!formData.sourceUsage.trim() ? 'Source: BOM usage is required' : `Source: ${srcUsageRes.error}`);
    }
    const srcAltRes = validateField('alternativeBom', formData.sourceAltBom, false);
    if (!srcAltRes.valid) {
      errors.sourceAltBom = srcAltRes.error;
      missing.push(`Source: ${srcAltRes.error}`);
    }

    if (missing.length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      const msg = 'Please enter valid Source Material, Plant, and BOM Usage to validate.';
      setValidationError(msg);
      toast.error(msg, { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'srcMaterial',
        sourcePlant: 'srcPlant',
        sourceUsage: 'srcUsage',
        sourceAltBom: 'sourceAltBom'
      };
      const firstInvalid = ['sourceMaterial', 'sourcePlant', 'sourceUsage', 'sourceAltBom'].find((f) => errors[f]);
      if (firstInvalid && fieldIdMap[firstInvalid]) {
        document.getElementById(fieldIdMap[firstInvalid])?.focus();
      }
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const res = await validateSourceBom({
        material: formData.sourceMaterial.trim(),
        plant: formData.sourcePlant.trim(),
        bomUsage: formData.sourceUsage.trim() || '1',
        alternativeBom: formData.sourceAltBom.trim()
      });

      setValidationResult(res);
      if (res.success) {
        setIsValidated(true);
        setValidationError('');
      } else {
        setIsValidated(false);
        const msg = res.message || 'Source BOM validation failed.';
        setValidationError(msg);
        toast.error(msg);
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Error communicating with SAP validation service.';
      setValidationResult({
        success: false,
        errorCode: 'SAP_VALIDATION_ERROR',
        message: msg
      });
      setIsValidated(false);
      setValidationError(msg);
      toast.error(msg);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTouched({
      sourceMaterial: true, sourcePlant: true, sourceUsage: true, sourceAltBom: true,
      targetMaterial: true, targetPlant: true, targetUsage: true, targetAltBom: true, validFrom: true
    });

    const errors = {};
    const missing = [];

    const srcMatRes = validateField('material', formData.sourceMaterial, true);
    if (!srcMatRes.valid) {
      errors.sourceMaterial = srcMatRes.error;
      missing.push(!formData.sourceMaterial.trim() ? 'Source: Material is required' : `Source: ${srcMatRes.error}`);
    }
    const srcPlantRes = validateField('plant', formData.sourcePlant, true);
    if (!srcPlantRes.valid) {
      errors.sourcePlant = srcPlantRes.error;
      missing.push(!formData.sourcePlant.trim() ? 'Source: Plant is required' : `Source: ${srcPlantRes.error}`);
    }
    const srcUsageRes = validateField('bomUsage', formData.sourceUsage, true);
    if (!srcUsageRes.valid) {
      errors.sourceUsage = srcUsageRes.error;
      missing.push(!formData.sourceUsage.trim() ? 'Source: BOM usage is required' : `Source: ${srcUsageRes.error}`);
    }
    const srcAltRes = validateField('alternativeBom', formData.sourceAltBom, false);
    if (!srcAltRes.valid) {
      errors.sourceAltBom = srcAltRes.error;
      missing.push(`Source: ${srcAltRes.error}`);
    }

    const tgtMatRes = validateField('material', formData.targetMaterial, true);
    if (!tgtMatRes.valid) {
      errors.targetMaterial = tgtMatRes.error;
      missing.push(!formData.targetMaterial.trim() ? 'Target: Material is required' : `Target: ${tgtMatRes.error}`);
    }
    const tgtPlantRes = validateField('plant', formData.targetPlant, true);
    if (!tgtPlantRes.valid) {
      errors.targetPlant = tgtPlantRes.error;
      missing.push(!formData.targetPlant.trim() ? 'Target: Plant is required' : `Target: ${tgtPlantRes.error}`);
    }
    const tgtUsageRes = validateField('bomUsage', formData.targetUsage, true);
    if (!tgtUsageRes.valid) {
      errors.targetUsage = tgtUsageRes.error;
      missing.push(!formData.targetUsage.trim() ? 'Target: BOM usage is required' : `Target: ${tgtUsageRes.error}`);
    }
    const tgtAltRes = validateField('alternativeBom', formData.targetAltBom, false);
    if (!tgtAltRes.valid) {
      errors.targetAltBom = tgtAltRes.error;
      missing.push(`Target: ${tgtAltRes.error}`);
    }
    const vfRes = validateField('validFrom', formData.validFrom, false);
    if (!vfRes.valid) {
      errors.validFrom = vfRes.error;
      missing.push(vfRes.error);
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      setValidationError('Please correct errors before proceeding.');
      toast.error('Please fill in valid required fields', { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'srcMaterial',
        sourcePlant: 'srcPlant',
        sourceUsage: 'srcUsage',
        sourceAltBom: 'sourceAltBom',
        targetMaterial: 'targetMaterial',
        targetPlant: 'targetPlant',
        targetUsage: 'targetUsage',
        targetAltBom: 'targetAltBom',
        validFrom: 'validFrom'
      };
      const firstInvalid = ['sourceMaterial', 'sourcePlant', 'sourceUsage', 'sourceAltBom', 'targetMaterial', 'targetPlant', 'targetUsage', 'targetAltBom', 'validFrom'].find((f) => errors[f]);
      if (firstInvalid && fieldIdMap[firstInvalid]) {
        document.getElementById(fieldIdMap[firstInvalid])?.focus();
      }
      return;
    }

    const srcMat = formData.sourceMaterial.trim().toUpperCase();
    const srcPlant = formData.sourcePlant.trim().toUpperCase();
    const srcUsage = formData.sourceUsage.trim();
    const srcAlt = formData.sourceAltBom.trim();

    const tgtMat = formData.targetMaterial.trim().toUpperCase();
    const tgtPlant = formData.targetPlant.trim().toUpperCase();
    const tgtUsage = formData.targetUsage.trim();
    const tgtAlt = formData.targetAltBom.trim();

    // Enforce Rule 7: Source and target BOM cannot be identical
    const sameAlt = (!srcAlt && !tgtAlt) || (srcAlt === tgtAlt);
    if (
      srcMat === tgtMat &&
      srcPlant === tgtPlant &&
      srcUsage === tgtUsage &&
      sameAlt
    ) {
      const msg = 'Source and target BOM are the same. A BOM cannot be copied onto itself.';
      setValidationError(msg);
      toast.error(msg);
      return;
    }

    setValidationError('');
    setFieldErrors({});

    onSubmit({
      sourceMaterial: srcMat,
      sourcePlant: srcPlant,
      sourceUsage: srcUsage,
      sourceAltBom: srcAlt,
      targetMaterial: tgtMat,
      targetPlant: tgtPlant,
      targetUsage: tgtUsage,
      targetAltBom: tgtAlt,
      validFrom: formData.validFrom ? formData.validFrom.trim() : ''
    });
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto" style={style}>
      {!hideHeader && (
        <div className="flex items-center gap-3 pb-4 mb-5 border-b border-[var(--color-border)]">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] flex items-center justify-center text-[var(--color-blue-600)]">
            <Copy size={18} />
          </div>
          <div>
            <h4 className="text-base font-semibold text-[var(--color-navy-900)]">Copy Single BOM</h4>
            <p className="text-xs text-[var(--color-text-secondary)]">Copy a BOM to another plant, with automatic alternative numbers and sub-assemblies.</p>
          </div>
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-[1fr_auto_1fr] items-stretch gap-5">
          {/* SOURCE / REFERENCE BOM SECTION */}
          <FormSection
            title="Reference BOM"
            description="Select the existing bill of materials to copy from"
            badge={
              <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-[var(--color-blue-50)] text-[var(--color-blue-600)] border border-[var(--color-blue-200)]">
                Source
              </span>
            }
            accentTop="3px solid var(--color-blue-600)"
            className="w-full h-full flex flex-col"
            bodyClassName="flex flex-col flex-1 gap-4"
          >
            <FieldWrapper
              label="Material"
              htmlFor="sourceMaterial"
              required
              error={(touched.sourceMaterial || isSubmitted) ? fieldErrors.sourceMaterial || null : null}
            >
              <ValueHelpInput
                id="sourceMaterial"
                kind="material"
                plant={formData.sourcePlant}
                placeholder="Ex. A1BH0214C"
                maxLength={FIELD_RULES.material.maxLength}
                value={formData.sourceMaterial}
                onChange={(e) => handleChange('sourceMaterial', e.target.value)}
                onBlur={() => handleBlur('sourceMaterial', 'material', true)}
                onSelect={(val, full) => {
                  handleChange('sourceMaterial', val);
                  if (full?.stlal) {
                    handleChange('sourceAltBom', full.stlal);
                  }
                  if (full?.werks && !formData.sourcePlant) {
                    handleChange('sourcePlant', full.werks);
                  }
                }}
                hasError={Boolean((touched.sourceMaterial || isSubmitted) && fieldErrors.sourceMaterial)} onPointerDown={() => handleUserInteraction('sourceMaterial')} onKeyDown={() => handleUserInteraction('sourceMaterial')}
                aria-label="Source Material"
              />
            </FieldWrapper>

            <FieldWrapper
              label="Plant"
              htmlFor="sourcePlant"
              required
              error={(touched.sourcePlant || isSubmitted) ? fieldErrors.sourcePlant || null : null}
            >
              <ValueHelpInput
                id="sourcePlant"
                kind="plant"
                material={formData.sourceMaterial}
                placeholder="Ex. 1001"
                maxLength={FIELD_RULES.plant.maxLength}
                value={formData.sourcePlant}
                onChange={(e) => handleChange('sourcePlant', e.target.value)}
                onBlur={() => handleBlur('sourcePlant', 'plant', true)}
                hasError={Boolean((touched.sourcePlant || isSubmitted) && fieldErrors.sourcePlant)} onPointerDown={() => handleUserInteraction('sourcePlant')} onKeyDown={() => handleUserInteraction('sourcePlant')}
                aria-label="Source Plant"
              />
            </FieldWrapper>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper
                label="BOM usage"
                htmlFor="sourceUsage"
                required
                error={(touched.sourceUsage || isSubmitted) ? fieldErrors.sourceUsage || null : null}
              >
                <ValueHelpInput
                  id="sourceUsage"
                  kind="bomUsage"
                  placeholder="1"
                  maxLength={FIELD_RULES.bomUsage.maxLength}
                  value={formData.sourceUsage}
                  onChange={(e) => handleChange('sourceUsage', e.target.value)}
                  onBlur={() => handleBlur('sourceUsage', 'bomUsage', true)}
                  hasError={Boolean((touched.sourceUsage || isSubmitted) && fieldErrors.sourceUsage)} onPointerDown={() => handleUserInteraction('sourceUsage')} onKeyDown={() => handleUserInteraction('sourceUsage')}
                  aria-label="Source BOM Usage"
                />
              </FieldWrapper>

              <FieldWrapper
                label="Alternative BOM"
                htmlFor="sourceAltBom"
                hint="Optional"
                error={(touched.sourceAltBom || isSubmitted) ? fieldErrors.sourceAltBom || null : null}
              >
                <input
                  id="sourceAltBom"
                  type="text"
                  placeholder="Ex. 1"
                  maxLength={FIELD_RULES.alternativeBom.maxLength}
                  value={formData.sourceAltBom}
                  onChange={(e) => handleChange('sourceAltBom', e.target.value)}
                  onBlur={() => handleBlur('sourceAltBom', 'alternativeBom', false)}
                  className={`rx-input rx-input-mono ${fieldErrors.sourceAltBom ? 'rx-input-error' : ''}`}
                />
              </FieldWrapper>
            </div>

            {/* Validation Action Button & Status at bottom of Source card */}
            <div className="mt-auto pt-2 flex flex-col gap-3">
              <div className="sap-val-action-row">
                <button
                  type="button"
                  onClick={handleValidateSource}
                  disabled={isValidating}
                  className={`rx-btn w-full justify-center gap-1.5 text-xs h-8 ${isValidated ? 'rx-btn-secondary text-[var(--color-success)]' : 'rx-btn-secondary'}`}
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={14} className="sap-spin" />
                      <span>Validating BOM in SAP...</span>
                    </>
                  ) : isValidated ? (
                    <>
                      <CheckCircle2 size={14} style={{ color: 'var(--sap-success)' }} />
                      <span>BOM Validated ✓</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={14} />
                      <span>Validate BOM (Optional)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Validation Status / Result Card */}
              {isValidating && (
                <div className="sap-source-val-card sap-val-loading p-3 rounded-[var(--radius-md)] bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] flex items-center gap-2 text-xs">
                  <Loader2 size={15} className="sap-spin text-[var(--color-blue-600)]" />
                  <span>Validating SAP master records for reference BOM...</span>
                </div>
              )}

              {validationResult && !isValidating && (
                <div className={`sap-source-val-card ${validationResult.success ? 'sap-val-success' : 'sap-val-error'} p-3 rounded-[var(--radius-md)] border text-xs`}>
                  <div className="sap-val-card-header flex items-center gap-2 mb-2 font-semibold">
                    {validationResult.success ? (
                      <>
                        <CheckCircle2 size={15} style={{ color: 'var(--sap-success)', flexShrink: 0 }} />
                        <span className="sap-val-card-title text-[var(--color-success)]">Source BOM Validated</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={15} style={{ color: 'var(--sap-error)', flexShrink: 0 }} />
                        <span className="sap-val-card-title text-[var(--color-danger)]">
                          Validation Failed {validationResult.errorCode ? `(${validationResult.errorCode})` : ''}
                        </span>
                      </>
                    )}
                  </div>

                  {validationResult.success ? (
                    <div className="sap-val-checklist flex flex-col gap-1 text-[var(--color-text)]">
                      <div className="sap-val-item flex items-center gap-1.5">
                        <span className="sap-val-check text-[var(--color-success)]">✓</span>
                        <span>Material <strong>{formData.sourceMaterial.trim().toUpperCase()}</strong> found</span>
                      </div>
                      <div className="sap-val-item flex items-center gap-1.5">
                        <span className="sap-val-check text-[var(--color-success)]">✓</span>
                        <span>Plant <strong>{formData.sourcePlant.trim().toUpperCase()}</strong> validated</span>
                      </div>
                      <div className="sap-val-item flex items-center gap-1.5">
                        <span className="sap-val-check text-[var(--color-success)]">✓</span>
                        <span>BOM Usage <strong>{formData.sourceUsage.trim()}</strong> found</span>
                      </div>
                      {formData.sourceAltBom.trim() && (
                        <div className="sap-val-item flex items-center gap-1.5">
                          <span className="sap-val-check text-[var(--color-success)]">✓</span>
                          <span>Alternative BOM <strong>{formData.sourceAltBom.trim()}</strong> exists</span>
                        </div>
                      )}
                      {validationResult.componentCount !== undefined && (
                        <div className="sap-val-item flex items-center gap-1.5">
                          <span className="sap-val-check text-[var(--color-success)]">✓</span>
                          <span><strong>{validationResult.componentCount}</strong> components found</span>
                        </div>
                      )}

                      {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                        <div className="sap-val-alts-container mt-2">
                          <span className="sap-val-alts-label font-medium">Available Alternative BOMs:</span>
                          <div className="sap-val-alts-chips flex flex-wrap gap-1.5 mt-1">
                            {validationResult.availableAlternatives.map((alt) => (
                              <button
                                type="button"
                                key={alt}
                                onClick={() => handleChange('sourceAltBom', alt)}
                                className={`sap-alt-chip px-2 py-0.5 rounded text-xs border ${formData.sourceAltBom === alt ? 'selected bg-[var(--color-blue-600)] text-white border-[var(--color-blue-600)]' : 'bg-[var(--color-surface)] text-[var(--color-text)] border-[var(--color-border)]'}`}
                                title={`Select Alternative BOM ${alt}`}
                              >
                                Alt {alt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="sap-val-error-content text-[var(--color-danger)]">
                      <p className="sap-val-error-message">{validationResult.message}</p>
                      {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                        <div className="sap-val-alts-container mt-2">
                          <span className="sap-val-alts-label font-medium text-[var(--color-text)]">Available Alternative BOMs in SAP:</span>
                          <div className="sap-val-alts-chips flex flex-wrap gap-1.5 mt-1">
                            {validationResult.availableAlternatives.map((alt) => (
                              <button
                                type="button"
                                key={alt}
                                onClick={() => handleChange('sourceAltBom', alt)}
                                className="sap-alt-chip px-2 py-0.5 rounded text-xs border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]"
                                title={`Select Alternative BOM ${alt}`}
                              >
                                Alt {alt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </FormSection>

          {/* Visual Connector Arrow */}
          <div className="hidden min-[1100px]:flex flex-col items-center justify-center self-center my-auto p-2" aria-hidden="true">
            <div className="w-10 h-10 rounded-full bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] flex items-center justify-center text-[var(--color-blue-600)] shadow-sm">
              <ArrowRight size={18} strokeWidth={2} />
            </div>
          </div>

          {/* TARGET BOM SECTION */}
          <FormSection
            title="New BOM Destination"
            description="Target material and plant configuration"
            badge={
              <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-[var(--color-blue-50)] text-[var(--color-blue-600)] border border-[var(--color-blue-200)]">
                Target
              </span>
            }
            accentTop="3px solid var(--color-blue-600)"
            className="w-full h-full flex flex-col"
            bodyClassName="flex flex-col flex-1 gap-4"
          >
            <FieldWrapper
              label="Material"
              htmlFor="targetMaterial"
              required
              error={(touched.targetMaterial || isSubmitted) ? fieldErrors.targetMaterial || null : null}
            >
              <ValueHelpInput
                id="targetMaterial"
                kind="material"
                plant={formData.targetPlant}
                placeholder="Ex. A1BH0214C"
                maxLength={FIELD_RULES.material.maxLength}
                value={formData.targetMaterial}
                onChange={(e) => handleChange('targetMaterial', e.target.value)}
                onBlur={() => handleBlur('targetMaterial', 'material', true)}
                onSelect={(val, full) => {
                  handleChange('targetMaterial', val);
                  if (full?.stlal) {
                    handleChange('targetAltBom', full.stlal);
                  }
                  if (full?.werks && !formData.targetPlant) {
                    handleChange('targetPlant', full.werks);
                  }
                }}
                hasError={Boolean((touched.targetMaterial || isSubmitted) && fieldErrors.targetMaterial)} onPointerDown={() => handleUserInteraction('targetMaterial')} onKeyDown={() => handleUserInteraction('targetMaterial')}
                aria-label="Target Material"
              />
            </FieldWrapper>

            <FieldWrapper
              label="Plant"
              htmlFor="targetPlant"
              required
              error={(touched.targetPlant || isSubmitted) ? fieldErrors.targetPlant || null : null}
            >
              <ValueHelpInput
                id="targetPlant"
                kind="plant"
                material={formData.targetMaterial}
                placeholder="Ex. 1012"
                maxLength={FIELD_RULES.plant.maxLength}
                value={formData.targetPlant}
                onChange={(e) => handleChange('targetPlant', e.target.value)}
                onBlur={() => handleBlur('targetPlant', 'plant', true)}
                hasError={Boolean((touched.targetPlant || isSubmitted) && fieldErrors.targetPlant)} onPointerDown={() => handleUserInteraction('targetPlant')} onKeyDown={() => handleUserInteraction('targetPlant')}
                aria-label="Target Plant"
              />
            </FieldWrapper>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldWrapper
                label="BOM usage"
                htmlFor="targetUsage"
                required
                error={(touched.targetUsage || isSubmitted) ? fieldErrors.targetUsage || null : null}
              >
                <ValueHelpInput
                  id="targetUsage"
                  kind="bomUsage"
                  placeholder="1"
                  maxLength={FIELD_RULES.bomUsage.maxLength}
                  value={formData.targetUsage}
                  onChange={(e) => handleChange('targetUsage', e.target.value)}
                  onBlur={() => handleBlur('targetUsage', 'bomUsage', true)}
                  hasError={Boolean((touched.targetUsage || isSubmitted) && fieldErrors.targetUsage)} onPointerDown={() => handleUserInteraction('targetUsage')} onKeyDown={() => handleUserInteraction('targetUsage')}
                  aria-label="Target BOM Usage"
                />
              </FieldWrapper>

              <FieldWrapper
                label="Alternative BOM"
                htmlFor="targetAltBom"
                hint="Optional"
                error={(touched.targetAltBom || isSubmitted) ? fieldErrors.targetAltBom || null : null}
              >
                <input
                  id="targetAltBom"
                  type="text"
                  placeholder="Ex. 1"
                  maxLength={FIELD_RULES.alternativeBom.maxLength}
                  value={formData.targetAltBom}
                  onChange={(e) => handleChange('targetAltBom', e.target.value)}
                  onBlur={() => handleBlur('targetAltBom', 'alternativeBom', false)}
                  className={`rx-input rx-input-mono ${fieldErrors.targetAltBom ? 'rx-input-error' : ''}`}
                />
              </FieldWrapper>
            </div>

            <FieldWrapper
              label="Valid From"
              htmlFor="validFrom"
              hint="Optional, format DD.MM.YYYY"
              error={(touched.validFrom || isSubmitted) ? fieldErrors.validFrom || null : null}
            >
              <input
                id="validFrom"
                type="text"
                placeholder="DD.MM.YYYY"
                value={formData.validFrom}
                onChange={(e) => handleChange('validFrom', e.target.value)}
                onKeyDown={(e) => {
                  if (!/[\d.]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Home', 'End'].includes(e.key) && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                  }
                }}
                onBlur={() => handleBlur('validFrom', 'validFrom', false)}
                className={`rx-input ${fieldErrors.validFrom ? 'rx-input-error' : ''}`}
              />
            </FieldWrapper>
          </FormSection>
        </div>

        {!hideFormActions && (
          <FormActions
            className="sap-card-action-row"
            left={
              <button
                type="button"
                className="rx-btn rx-btn-secondary"
                onClick={onCancel}
                
              >
                <X size={14} />
                <span>Cancel</span>
              </button>
            }
            right={
              <button
                type="submit"
                className="rx-btn rx-btn-primary"
                title="Proceed to Copy BOM proposal"
                disabled={isSubmitting}
                
              >
                <span>Proceed</span>
                <ArrowRight size={14} />
              </button>
            }
          />
        )}
      </form>
    </div>);
}
