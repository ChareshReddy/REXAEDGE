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
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';
import { useToast } from '../context/ToastContext';
import { FIELD_RULES, validateField, sanitizeValidFromInput } from '@shared/fieldRules.js';
import { checkFieldExistence, getActiveServerId } from '../services/fieldValidationService';

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
  style = {},
  systemKey
}) {
  const currentServerId = systemKey || getActiveServerId();
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
  const validationSeqRef = React.useRef({});

  const handleUserInteraction = (field) => {
    userInteractedRef.current[field] = true;
  };

  useEffect(() => {
    setFieldErrors({});
    setTouched({});
    setIsSubmitted(false);
    userInteractedRef.current = {};
    validationSeqRef.current = {};
  }, [currentServerId]);

  useEffect(() => {
    const handleServerChanged = () => {
      setFieldErrors({});
      setTouched({});
      setIsSubmitted(false);
      userInteractedRef.current = {};
      validationSeqRef.current = {};
    };
    window.addEventListener('sap-server-changed', handleServerChanged);
    return () => window.removeEventListener('sap-server-changed', handleServerChanged);
  }, []);

  // Source BOM SAP validation states
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const handleChange = (field, value) => {
    userInteractedRef.current[field] = true;
    validationSeqRef.current[field] = (validationSeqRef.current[field] || 0) + 1;
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
      const plant = field.startsWith('source') ? formData.sourcePlant : formData.targetPlant;
      const existRes = await checkFieldExistence({
        kind: ruleKey,
        value: curVal,
        plant,
        serverId: currentServerId
      });
      if (validationSeqRef.current[field] !== seq || formData[field]?.trim() !== curVal) return;
      if (!existRes.valid && existRes.error) {
        setFieldErrors((prev) => ({ ...prev, [field]: existRes.error }));
      }
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

    // Check existence if format passed
    if (!errors.sourceMaterial && formData.sourceMaterial.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'material',
        value: formData.sourceMaterial.trim(),
        plant: formData.sourcePlant,
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.sourceMaterial = existRes.error;
        missing.push(`Source: ${existRes.error}`);
      }
    }
    if (!errors.sourcePlant && formData.sourcePlant.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'plant',
        value: formData.sourcePlant.trim(),
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.sourcePlant = existRes.error;
        missing.push(`Source: ${existRes.error}`);
      }
    }

    if (missing.length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      const msg = 'Please enter valid Source Material, Plant, and BOM Usage to validate.';
      setValidationError(msg);
      toast.error(msg, { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'sourceMaterial',
        sourcePlant: 'sourcePlant',
        sourceUsage: 'sourceUsage',
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

  const handleSubmit = async (e) => {
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

    // Check existence if format passed
    if (!errors.sourceMaterial && formData.sourceMaterial.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'material',
        value: formData.sourceMaterial.trim(),
        plant: formData.sourcePlant,
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.sourceMaterial = existRes.error;
        missing.push(`Source: ${existRes.error}`);
      }
    }
    if (!errors.sourcePlant && formData.sourcePlant.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'plant',
        value: formData.sourcePlant.trim(),
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.sourcePlant = existRes.error;
        missing.push(`Source: ${existRes.error}`);
      }
    }
    if (!errors.targetMaterial && formData.targetMaterial.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'material',
        value: formData.targetMaterial.trim(),
        plant: formData.targetPlant,
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.targetMaterial = existRes.error;
        missing.push(`Target: ${existRes.error}`);
      }
    }
    if (!errors.targetPlant && formData.targetPlant.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'plant',
        value: formData.targetPlant.trim(),
        serverId: currentServerId
      });
      if (!existRes.valid && existRes.error) {
        errors.targetPlant = existRes.error;
        missing.push(`Target: ${existRes.error}`);
      }
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      setValidationError('Please correct errors before proceeding.');
      toast.error('Please fill in valid required fields', { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'sourceMaterial',
        sourcePlant: 'sourcePlant',
        sourceUsage: 'sourceUsage',
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

      <form id={formId} onSubmit={handleSubmit} className="rx-copy-bom-form flex flex-col gap-6">
        <div className="grid grid-cols-1 min-[1100px]:grid-cols-[1fr_auto_1fr] items-stretch gap-5">
          {/* SOURCE / REFERENCE BOM SECTION */}
          <FormSection
            title="Reference BOM"
            badge={
              <Badge
                variant="outline"
                className="rx-copy-card-badge font-semibold text-xs px-2.5 py-0.5 rounded-[var(--radius-badge,4px)] bg-[var(--color-blue-50)] text-[var(--color-blue-700)] border-[var(--color-blue-200)] shadow-none shrink-0"
              >
                Source
              </Badge>
            }
            className="w-full h-full flex flex-col"
            bodyClassName="flex flex-col rx-copy-card-body"
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

            <div className="grid grid-cols-2 gap-4">
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

            {/* Row 4: Validation Action Button (aligns horizontally on the same baseline with Valid From) */}
            <div className="rx-field-wrapper flex flex-col gap-1.5 w-full">
              <div className="rx-field-label text-[13px] font-semibold flex items-center gap-1 invisible select-none" aria-hidden="true">
                <span>Valid From</span>
              </div>
              <div className="flex items-center justify-end w-full" style={{ height: 'var(--size-form-input-height, 40px)' }}>
                <button
                  type="button"
                  id="validateSourceBomBtn"
                  onClick={handleValidateSource}
                  disabled={isValidating}
                  className={cn(
                    "rx-btn rx-btn-sm rx-btn-validate justify-center text-xs w-auto shrink-0",
                    isValidated && "is-validated"
                  )}
                  style={{
                    height: 'var(--size-button-sm-height, 32px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                {isValidating ? (
                  <>
                    <Loader2 size={16} className="sap-spin text-[var(--color-blue-600)]" style={{ display: 'block', lineHeight: 1 }} />
                    <span>Validating BOM in SAP...</span>
                  </>
                ) : isValidated ? (
                  <>
                    <CheckCircle2 size={16} className="text-[var(--color-success)]" style={{ display: 'block', lineHeight: 1 }} />
                    <span>BOM Validated</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} className="text-[var(--color-blue-600)]" style={{ display: 'block', lineHeight: 1 }} />
                    <span>Validate BOM</span>
                  </>
                )}
              </button>
              </div>
              <div className="rx-field-hint text-xs mt-0.5 invisible select-none" aria-hidden="true">
                &nbsp;
              </div>
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
            badge={
              <Badge
                variant="outline"
                className="rx-copy-card-badge font-semibold text-xs px-2.5 py-0.5 rounded-[var(--radius-badge,4px)] bg-[var(--color-blue-50)] text-[var(--color-blue-700)] border-[var(--color-blue-200)] shadow-none shrink-0"
              >
                Target
              </Badge>
            }
            className="w-full h-full flex flex-col"
            bodyClassName="flex flex-col rx-copy-card-body"
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

            <div className="grid grid-cols-2 gap-4">
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
              hint="Format DD.MM.YYYY"
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

        {/* Validation Status / Result Strip (full width below both cards) */}
        {isValidating && (
          <div
            id="copyBomValidationStrip"
            className="rx-copy-bom-result-strip rx-copy-bom-result-loading flex items-center gap-2.5 p-3 rounded-[var(--radius-md)] bg-[var(--color-blue-50)] border border-[var(--color-blue-200)] text-xs text-[var(--color-text-secondary)] w-full"
            role="status"
          >
            <Loader2 size={16} className="sap-spin text-[var(--color-blue-600)] shrink-0" />
            <span className="font-medium">Validating SAP master records for reference BOM...</span>
          </div>
        )}

        {validationResult && !isValidating && (
          <div
            id="copyBomValidationStrip"
            className={cn(
              "rx-copy-bom-result-strip w-full p-3 rounded-[var(--radius-md)] border text-xs",
              validationResult.success
                ? "rx-copy-bom-result-success bg-[var(--color-success-bg)] border-[var(--color-success-border)] text-[var(--color-text)]"
                : "rx-copy-bom-result-error bg-[var(--color-danger-bg)] border-[var(--color-danger-border)] text-[var(--color-danger)]"
            )}
            role={validationResult.success ? "status" : "alert"}
          >
            {validationResult.success ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <div className="flex items-center gap-1.5 shrink-0">
                    <CheckCircle2 size={16} className="text-[var(--color-success)] shrink-0" />
                    <span className="font-semibold text-xs text-[var(--color-success)]">
                      Source BOM validated
                    </span>
                  </div>
                  <span className="text-[var(--color-border)] hidden sm:inline" aria-hidden="true">|</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-success)] font-bold">✓</span>
                    <span>Material <strong>{formData.sourceMaterial.trim().toUpperCase()}</strong> found</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-success)] font-bold">✓</span>
                    <span>Plant <strong>{formData.sourcePlant.trim().toUpperCase()}</strong> validated</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[var(--color-success)] font-bold">✓</span>
                    <span>BOM usage <strong>{formData.sourceUsage.trim()}</strong> found</span>
                  </div>
                  {validationResult.componentCount !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--color-success)] font-bold">✓</span>
                      <span><strong>{validationResult.componentCount}</strong> components found</span>
                    </div>
                  )}
                </div>

                {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-[var(--color-success-border)]/60 text-xs">
                    <span className="font-medium text-[var(--color-text-secondary)]">Available alternative BOMs:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {validationResult.availableAlternatives.slice(0, 8).map((alt) => (
                        <button
                          type="button"
                          key={alt}
                          onClick={() => handleChange('sourceAltBom', alt)}
                          className={cn(
                            "rx-alt-chip px-2 py-0.5 rounded text-xs border font-mono transition-colors",
                            formData.sourceAltBom === alt && "is-selected"
                          )}
                          title={`Select Alternative BOM ${alt}`}
                        >
                          Alt {alt}
                        </button>
                      ))}
                      {validationResult.availableAlternatives.length > 8 && (
                        <span
                          className="rx-alt-more-badge text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-blue-100)] text-[var(--color-blue-700)] border border-[var(--color-blue-200)]"
                          title={`${validationResult.availableAlternatives.length - 8} more alternative BOMs available`}
                        >
                          +{validationResult.availableAlternatives.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 font-semibold">
                  <XCircle size={16} className="text-[var(--color-danger)] shrink-0" />
                  <span className="font-semibold text-xs text-[var(--color-danger)]">
                    Validation Failed {validationResult.errorCode ? `(${validationResult.errorCode})` : ''}
                  </span>
                </div>
                <p className="sap-val-error-message text-xs text-[var(--color-danger)]">
                  {validationResult.message}
                </p>
                {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 pt-1 border-t border-[var(--color-danger-border)]/60 text-[var(--color-text)]">
                    <span className="font-medium text-[var(--color-text-secondary)]">Available Alternative BOMs in SAP:</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {validationResult.availableAlternatives.slice(0, 8).map((alt) => (
                        <button
                          type="button"
                          key={alt}
                          onClick={() => handleChange('sourceAltBom', alt)}
                          className={cn(
                            "rx-alt-chip px-2 py-0.5 rounded text-xs border font-mono transition-colors",
                            formData.sourceAltBom === alt && "is-selected"
                          )}
                          title={`Select Alternative BOM ${alt}`}
                        >
                          Alt {alt}
                        </button>
                      ))}
                      {validationResult.availableAlternatives.length > 8 && (
                        <span className="rx-alt-more-badge text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-blue-100)] text-[var(--color-blue-700)] border border-[var(--color-blue-200)]">
                          +{validationResult.availableAlternatives.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!hideFormActions && (
          <FormActions
            className="sap-card-action-row"
            left={
              <button
                type="button"
                className="rx-btn rx-btn-secondary"
                onClick={() => {
                  setFieldErrors({});
                  setTouched({});
                  setIsSubmitted(false);
                  userInteractedRef.current = {};
                  validationSeqRef.current = {};
                  if (onCancel) onCancel();
                }}
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
