import React, { useState } from 'react';
import { Trash2, AlertTriangle, ArrowRight, X, Layers, Factory, Hash } from 'lucide-react';

export default function DeleteBomForm({ onSubmit, onCancel, initialValues = {}, hideHeader = false, style = {} }) {
  const [formData, setFormData] = useState({
    material: initialValues.material || '',
    plant: initialValues.plant || '',
    alternativeBom: initialValues.alternativeBom || '',
    bomUsage: initialValues.bomUsage || '1'
  });

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
    const requiredFields = ['material', 'plant', 'alternativeBom', 'bomUsage'];

    requiredFields.forEach((field) => {
      if (!String(formData[field] || '').trim()) {
        errors[field] = true;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setValidationError('Please fill in all required fields to proceed.');
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
    <div className="sap-structured-form-card delete-card" style={{ maxWidth: 680, width: '100%', margin: '0 auto', marginBottom: 16, ...style }}>
      {!hideHeader && (
        <div className="sap-form-header">
          <div className="sap-form-header-title">
            <div className="sap-form-header-icon delete-icon">
              <Trash2 size={18} />
            </div>
            <div>
              <h4>Delete Material BOM (CS02)</h4>
              <p>Safely archive or delete specific BOM alternatives in SAP without GUI popups. Strict human confirmation gates prevent accidental data loss.</p>
            </div>
          </div>
        </div>
      )}

      <div className="sap-form-alert sap-form-alert-warning" style={{ margin: hideHeader ? '4px 0 12px' : '0 14px 12px' }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Destructive Operation:</strong> Deleting a BOM removes component linkages in the specified plant. A safety confirmation check is required prior to execution.
        </div>
      </div>

      {validationError && (
        <div className="sap-form-alert sap-form-alert-error" style={{ margin: hideHeader ? '0 0 12px' : '0 14px 12px' }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>{validationError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="sap-form-grid" style={{ gridTemplateColumns: '1fr 1fr', padding: hideHeader ? '4px 2px 10px' : '12px 14px', gap: '10px 14px' }}>
          <div className="sap-form-group">
            <label htmlFor="delMaterial" style={{ fontSize: '11px', marginBottom: 2 }}>
              Material Number <span className="required-star" style={{ color: 'var(--sap-error)' }}>*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <Layers size={13} className="input-icon" />
              <input
                id="delMaterial"
                type="text"
                placeholder="e.g. A1BH0214C"
                value={formData.material}
                onChange={(e) => handleChange('material', e.target.value)}
                className={`sap-form-input ${fieldErrors.material ? 'input-error' : ''}`}
                autoFocus
              />
            </div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delPlant" style={{ fontSize: '11px', marginBottom: 2 }}>
              Plant Code <span className="required-star" style={{ color: 'var(--sap-error)' }}>*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <Factory size={13} className="input-icon" />
              <input
                id="delPlant"
                type="text"
                placeholder="e.g. 1001"
                value={formData.plant}
                onChange={(e) => handleChange('plant', e.target.value)}
                className={`sap-form-input ${fieldErrors.plant ? 'input-error' : ''}`}
              />
            </div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delAlternativeBom" style={{ fontSize: '11px', marginBottom: 2 }}>
              Alternative BOM <span className="required-star" style={{ color: 'var(--sap-error)' }}>*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <Hash size={13} className="input-icon" />
              <input
                id="delAlternativeBom"
                type="text"
                placeholder="e.g. 1"
                value={formData.alternativeBom}
                onChange={(e) => handleChange('alternativeBom', e.target.value)}
                className={`sap-form-input ${fieldErrors.alternativeBom ? 'input-error' : ''}`}
              />
            </div>
          </div>

          <div className="sap-form-group">
            <label htmlFor="delBomUsage" style={{ fontSize: '11px', marginBottom: 2 }}>
              BOM Usage <span className="required-star" style={{ color: 'var(--sap-error)' }}>*</span>
            </label>
            <div className="sap-form-input-wrapper">
              <Hash size={13} className="input-icon" />
              <input
                id="delBomUsage"
                type="text"
                placeholder="1"
                value={formData.bomUsage}
                onChange={(e) => handleChange('bomUsage', e.target.value)}
                className={`sap-form-input ${fieldErrors.bomUsage ? 'input-error' : ''}`}
              />
            </div>
          </div>
        </div>

        <div className="sap-form-actions" style={{ padding: '8px 4px 6px', borderTop: '1px solid var(--sap-error-border)' }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={onCancel}
            style={{ height: 28, fontSize: '11px', padding: '0 12px' }}
          >
            <X size={12} />
            <span>Cancel</span>
          </button>

          <button
            type="submit"
            className="sap-btn sap-btn-danger"
            style={{ height: 28, fontSize: '11px', padding: '0 14px' }}
          >
            <span>Proceed</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </form>
    </div>
  );
}
