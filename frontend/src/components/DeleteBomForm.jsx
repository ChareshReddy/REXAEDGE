import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, ArrowRight, X, Layers, Factory, Hash } from 'lucide-react';
import ValueHelpInput from './ValueHelpInput';
import { useToast } from '../context/ToastContext';

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

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (validationError) setValidationError('');
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: false }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const errors = {};
    const missing = [];

    if (!String(formData.material || '').trim()) {
      errors.material = true;
      missing.push('Material number is required');
    }
    if (!String(formData.plant || '').trim()) {
      errors.plant = true;
      missing.push('Plant code is required');
    }
    if (!String(formData.alternativeBom || '').trim()) {
      errors.alternativeBom = true;
      missing.push('Alternative BOM is required');
    }
    if (!String(formData.bomUsage || '').trim()) {
      errors.bomUsage = true;
      missing.push('BOM usage is required');
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      setValidationError('Please fill in the required fields to proceed.');
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
    <div className="sap-structured-form-card delete-card sap-full-width" style={{ width: '100%', margin: '0 auto', marginBottom: 16, ...style }}>
      {!hideHeader && (
        <div className="sap-form-header sap-section-header">
          <div className="sap-form-header-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trash2 size={16} />
            <h4 style={{ margin: 0, fontSize: 16 }}>Delete BOM</h4>
          </div>
        </div>
      )}

      <div className="sap-form-alert sap-form-alert-warning" style={{ margin: hideHeader ? '4px 0 12px' : '8px 14px 12px', padding: '10px 14px', background: '#FFF8F2', border: '1px solid #FED7AA', borderRadius: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#B45309' }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span><strong>Destructive Operation:</strong> Deleting a BOM removes component linkages in the specified plant. A safety confirmation check is required prior to execution.</span>
        </div>
      </div>

      

      <form id={formId} onSubmit={handleSubmit}>
        <div className="sap-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', padding: hideHeader ? '8px 4px 14px' : '14px 16px', gap: '14px 18px' }}>
          <div className="sap-form-group">
            <label htmlFor="delMaterial" className="sap-label">
              Material Number <span className="required-star">*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <ValueHelpInput
                id="delMaterial"
                kind="material"
                plant={formData.plant}
                placeholder="e.g. A1BH0214C"
                value={formData.material}
                onChange={(e) => handleChange('material', e.target.value)}
                onSelect={(val, full) => {
                  handleChange('material', val);
                  if (full?.stlal) {
                    handleChange('alternativeBom', full.stlal.replace(/^0+/, '') || full.stlal);
                  }
                  if (full?.werks && !formData.plant) {
                    handleChange('plant', full.werks);
                  }
                }}
                className={`sap-input sap-form-input ${fieldErrors.material ? 'input-error' : ''}`}
                autoFocus
              />
            </div>
            <div className="sap-field-error-msg">{fieldErrors.material ? 'Material number is required' : ''}</div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delPlant" className="sap-label">
              Plant Code <span className="required-star">*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <ValueHelpInput
                id="delPlant"
                kind="plant"
                material={formData.material}
                placeholder="e.g. 1001"
                value={formData.plant}
                onChange={(e) => handleChange('plant', e.target.value)}
                className={`sap-input sap-form-input ${fieldErrors.plant ? 'input-error' : ''}`}
              />
            </div>
            <div className="sap-field-error-msg">{fieldErrors.plant ? 'Plant code is required' : ''}</div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delAlternativeBom" className="sap-label">
              Alternative BOM <span className="required-star">*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <input
                id="delAlternativeBom"
                type="text"
                placeholder="e.g. 1"
                value={formData.alternativeBom}
                onChange={(e) => handleChange('alternativeBom', e.target.value)}
                className={`sap-input sap-form-input ${fieldErrors.alternativeBom ? 'input-error' : ''}`}
              />
            </div>
            <div className="sap-field-error-msg">{fieldErrors.alternativeBom ? 'Alternative BOM is required' : ''}</div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delBomUsage" className="sap-label">
              BOM Usage <span className="required-star">*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <ValueHelpInput
                id="delBomUsage"
                kind="bomUsage"
                placeholder="1"
                maxLength={1}
                value={formData.bomUsage}
                onChange={(e) => handleChange('bomUsage', e.target.value)}
                className={`sap-input sap-form-input ${fieldErrors.bomUsage ? 'input-error' : ''}`}
                aria-label="Delete BOM Usage"
              />
            </div>
            <div className="sap-field-error-msg">{fieldErrors.bomUsage ? 'BOM Usage is required' : ''}</div>
          </div>
        </div>

        {!hideFormActions && (
          <div className="sap-card-action-row">
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={onCancel}
              style={{ height: 32, fontSize: 13, padding: '0 16px' }}
            >
              <X size={14} />
              <span>Cancel</span>
            </button>

            <button
              type="submit"
              className="sap-btn destructive sap-button-danger"
              disabled={isSubmitting}
              style={{ height: 32, fontSize: 13, padding: '0 18px' }}
            >
              <span>Proceed to Confirmation</span>
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
