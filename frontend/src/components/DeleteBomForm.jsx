import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, ArrowRight, X } from 'lucide-react';
import ValueHelpInput from './ValueHelpInput';
import { FormSection, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { Alert, AlertTitle, AlertDescription } from './ui/alert';
import { useToast } from '../context/ToastContext';
import { FIELD_RULES, validateField } from '@shared/fieldRules.js';

export default function DeleteBomForm({
  onSubmit,
  onCancel,
  initialValues = {},
  hideHeader = false,
  hideFormActions = false,
  isSubmitting = false,
  formId = 'delete-bom-form',
  onValuesChange,
  style = {}
}) {
  const toast = useToast();
  const [formData, setFormData] = useState({
    material: initialValues.material || '',
    plant: initialValues.plant || '',
    alternativeBom: initialValues.alternativeBom || '',
    bomUsage: initialValues.bomUsage || '1'
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

  const handleChange = (field, value) => {
    userInteractedRef.current[field] = true;
    setTouched((prev) => ({ ...prev, [field]: true }));
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationError) setValidationError('');
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setTouched({ material: true, plant: true, alternativeBom: true, bomUsage: true });

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
    const altRes = validateField('alternativeBom', formData.alternativeBom, true);
    if (!altRes.valid) {
      errors.alternativeBom = altRes.error;
      missing.push(!formData.alternativeBom.trim() ? 'Alternative BOM is required' : altRes.error);
    }
    const usageRes = validateField('bomUsage', formData.bomUsage, true);
    if (!usageRes.valid) {
      errors.bomUsage = usageRes.error;
      missing.push(!formData.bomUsage.trim() ? 'BOM usage is required' : usageRes.error);
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      setValidationError('Please fill in valid required fields to proceed.');
      toast.error('Please fill in the required fields', { messages: missing });

      const fieldIdMap = {
        material: 'delMaterial',
        plant: 'delPlant',
        alternativeBom: 'delAlternativeBom',
        bomUsage: 'delBomUsage'
      };
      const firstInvalid = ['material', 'plant', 'alternativeBom', 'bomUsage'].find((f) => errors[f]);
      if (firstInvalid && fieldIdMap[firstInvalid]) {
        document.getElementById(fieldIdMap[firstInvalid])?.focus();
      }
      return;
    }

    const material = formData.material.trim().toUpperCase();
    const plant = formData.plant.trim().toUpperCase();
    const alternativeBom = formData.alternativeBom.trim();
    const bomUsage = formData.bomUsage.trim();

    setValidationError('');
    setFieldErrors({});

    onSubmit({
      material,
      plant,
      alternativeBom,
      bomUsage
    });
  };

  return (
    <div className="w-full max-w-[1440px] mx-auto text-left" style={style}>
      {/* Amber Warning Alert */}
      <Alert variant="warning" className="mb-4">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <div className="flex flex-col">
          <AlertTitle>Destructive operation</AlertTitle>
          <AlertDescription>
            Deleting a BOM removes component linkages in the specified plant. A safety confirmation check is required prior to execution.
          </AlertDescription>
        </div>
      </Alert>

      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-6">
        <FormSection
          title="Delete Bill of Materials"
          description="Specify the material, plant, alternative and usage to delete"
          className="w-full"
        >
          <div className="grid grid-cols-1 min-[600px]:grid-cols-2 min-[900px]:grid-cols-3 xl:grid-cols-4 gap-4">
            <FieldWrapper
              label="Material"
              htmlFor="delMaterial"
              required
              error={(touched.material || isSubmitted) ? fieldErrors.material || null : null}
            >
              <ValueHelpInput
                id="delMaterial"
                kind="material"
                plant={formData.plant}
                placeholder="Ex. A1BH0214C"
                maxLength={FIELD_RULES.material.maxLength}
                value={formData.material}
                onChange={(e) => handleChange('material', e.target.value)}
                onBlur={() => handleBlur('material', 'material', true)}
                onSelect={(val, full) => {
                  handleChange('material', val);
                  if (full?.stlal) {
                    handleChange('alternativeBom', full.stlal.replace(/^0+/, '') || full.stlal);
                  }
                  if (full?.werks && !formData.plant) {
                    handleChange('plant', full.werks);
                  }
                }}
                hasError={Boolean((touched.material || isSubmitted) && fieldErrors.material)} onPointerDown={() => handleUserInteraction('material')} onKeyDown={() => handleUserInteraction('material')}
                autoFocus
              />
            </FieldWrapper>

            <FieldWrapper
              label="Plant"
              htmlFor="delPlant"
              required
              error={(touched.plant || isSubmitted) ? fieldErrors.plant || null : null}
            >
              <ValueHelpInput
                id="delPlant"
                kind="plant"
                material={formData.material}
                placeholder="Ex. 1001"
                maxLength={FIELD_RULES.plant.maxLength}
                value={formData.plant}
                onChange={(e) => handleChange('plant', e.target.value)}
                onBlur={() => handleBlur('plant', 'plant', true)}
                hasError={Boolean((touched.plant || isSubmitted) && fieldErrors.plant)} onPointerDown={() => handleUserInteraction('plant')} onKeyDown={() => handleUserInteraction('plant')}
              />
            </FieldWrapper>

            <FieldWrapper
              label="Alternative BOM"
              htmlFor="delAlternativeBom"
              required
              error={(touched.alternativeBom || isSubmitted) ? fieldErrors.alternativeBom || null : null}
            >
              <input
                id="delAlternativeBom"
                type="text"
                placeholder="Ex. 1"
                maxLength={FIELD_RULES.alternativeBom.maxLength}
                value={formData.alternativeBom}
                onChange={(e) => handleChange('alternativeBom', e.target.value)}
                onBlur={() => handleBlur('alternativeBom', 'alternativeBom', true)}
                className={`rx-input rx-input-mono ${fieldErrors.alternativeBom ? 'rx-input-error' : ''}`}
              />
            </FieldWrapper>

            <FieldWrapper
              label="BOM usage"
              htmlFor="delBomUsage"
              required
              error={(touched.bomUsage || isSubmitted) ? fieldErrors.bomUsage || null : null}
            >
              <ValueHelpInput
                id="delBomUsage"
                kind="bomUsage"
                placeholder="1"
                maxLength={FIELD_RULES.bomUsage.maxLength}
                value={formData.bomUsage}
                onChange={(e) => handleChange('bomUsage', e.target.value)}
                onBlur={() => handleBlur('bomUsage', 'bomUsage', true)}
                hasError={Boolean((touched.bomUsage || isSubmitted) && fieldErrors.bomUsage)} onPointerDown={() => handleUserInteraction('bomUsage')} onKeyDown={() => handleUserInteraction('bomUsage')}
                aria-label="Delete BOM Usage"
              />
            </FieldWrapper>
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
                  disabled={isSubmitting}
                >
                  <span>Proceed to confirmation</span>
                  <ArrowRight size={14} />
                </button>
              }
            />
          )}
        </FormSection>
      </form>
    </div>
  );
}
