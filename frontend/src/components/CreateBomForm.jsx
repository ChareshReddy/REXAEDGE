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
import { useToast } from '../context/ToastContext';

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

  // Source BOM SAP validation states
  const [isValidating, setIsValidating] = useState(false);
  const [isValidated, setIsValidated] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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

  const handleValidateSource = async () => {
    setValidationError('');
    const errors = {};
    const missing = [];

    if (!String(formData.sourceMaterial || '').trim()) {
      errors.sourceMaterial = true;
      missing.push('Source: Material is required');
    }
    if (!String(formData.sourcePlant || '').trim()) {
      errors.sourcePlant = true;
      missing.push('Source: Plant is required');
    }
    if (!String(formData.sourceUsage || '').trim()) {
      errors.sourceUsage = true;
      missing.push('Source: BOM usage is required');
    }

    if (missing.length > 0) {
      setFieldErrors((prev) => ({ ...prev, ...errors }));
      const msg = 'Please enter Source Material, Plant, and BOM Usage to validate.';
      setValidationError(msg);
      toast.error(msg, { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'srcMaterial',
        sourcePlant: 'srcPlant',
        sourceUsage: 'srcUsage'
      };
      const firstInvalid = ['sourceMaterial', 'sourcePlant', 'sourceUsage'].find((f) => errors[f]);
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

    // Validation is optional: Proceed is enabled even if isValidated is false.
    // The backend performs strict source validation during Create BOM proposal.

    const errors = {};
    const missing = [];

    // ONLY Material, Plant, and BOM Usage are mandatory for Source and Target
    if (!String(formData.sourceMaterial || '').trim()) {
      errors.sourceMaterial = true;
      missing.push('Source: Material is required');
    }
    if (!String(formData.sourcePlant || '').trim()) {
      errors.sourcePlant = true;
      missing.push('Source: Plant is required');
    }
    if (!String(formData.sourceUsage || '').trim()) {
      errors.sourceUsage = true;
      missing.push('Source: BOM usage is required');
    }
    if (!String(formData.targetMaterial || '').trim()) {
      errors.targetMaterial = true;
      missing.push('Target: Material is required');
    }
    if (!String(formData.targetPlant || '').trim()) {
      errors.targetPlant = true;
      missing.push('Target: Plant is required');
    }
    if (!String(formData.targetUsage || '').trim()) {
      errors.targetUsage = true;
      missing.push('Target: BOM usage is required');
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      setValidationError('Please fill in the required fields.');
      toast.error('Please fill in the required fields', { messages: missing });

      const fieldIdMap = {
        sourceMaterial: 'srcMaterial',
        sourcePlant: 'srcPlant',
        sourceUsage: 'srcUsage',
        targetMaterial: 'targetMaterial',
        targetPlant: 'targetPlant',
        targetUsage: 'targetUsage'
      };
      const firstInvalid = ['sourceMaterial', 'sourcePlant', 'sourceUsage', 'targetMaterial', 'targetPlant', 'targetUsage'].find((f) => errors[f]);
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
    <div className="sap-structured-form-card sap-full-width" style={{ width: '100%', margin: '0 auto', ...style }}>
      {!hideHeader && (
        <div className="sap-form-header">
          <div className="sap-form-header-title">
            <div className="sap-form-header-icon copy-icon">
              <Copy size={18} />
            </div>
            <div>
              <h4>Copy Single BOM</h4>
              <p>Copy a BOM to another plant, with automatic alternative numbers and sub-assemblies.</p>
            </div>
          </div>
        </div>
      )}

      

      <form id={formId} onSubmit={handleSubmit}>
        <div className="sap-form-dual-columns-grid">
          {/* SOURCE / REFERENCE BOM SECTION */}
          <div className="sap-form-section sap-form-section-source">
            <div className="sap-form-section-badge source-badge">
              <span className="badge-pill">Source</span>
              <span className="badge-title">Reference BOM</span>
            </div>

            <div className="sap-form-group">
              <label htmlFor="sourceMaterial">
                Material <span className="required-star">*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Layers size={14} className="input-icon" />
                <ValueHelpInput
                  id="sourceMaterial"
                  kind="material"
                  plant={formData.sourcePlant}
                  placeholder="e.g. A1BH0214C"
                  value={formData.sourceMaterial}
                  onChange={(e) => handleChange('sourceMaterial', e.target.value)}
                  onSelect={(val, full) => {
                    handleChange('sourceMaterial', val);
                    if (full?.stlal) {
                      handleChange('sourceAltBom', full.stlal);
                    }
                    if (full?.werks && !formData.sourcePlant) {
                      handleChange('sourcePlant', full.werks);
                    }
                  }}
                  className={`sap-form-input ${fieldErrors.sourceMaterial ? 'input-error' : ''}`}
                  style={{ paddingLeft: 32 }}
                  aria-label="Source Material"
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label htmlFor="sourcePlant">
                Plant <span className="required-star">*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Factory size={14} className="input-icon" />
                <ValueHelpInput
                  id="sourcePlant"
                  kind="plant"
                  material={formData.sourceMaterial}
                  placeholder="e.g. 1001"
                  maxLength={4}
                  value={formData.sourcePlant}
                  onChange={(e) => handleChange('sourcePlant', e.target.value)}
                  className={`sap-form-input ${fieldErrors.sourcePlant ? 'input-error' : ''}`}
                  style={{ paddingLeft: 32 }}
                  aria-label="Source Plant"
                />
              </div>
            </div>

            <div className="sap-form-row">
              <div className="sap-form-group sap-form-col">
                <label htmlFor="sourceUsage">
                  BOM Usage <span className="required-star">*</span>
                </label>
                <div className="sap-form-input-wrapper">
                  <Hash size={14} className="input-icon" />
                  <ValueHelpInput
                    id="sourceUsage"
                    kind="bomUsage"
                    placeholder="1"
                    maxLength={1}
                    value={formData.sourceUsage}
                    onChange={(e) => handleChange('sourceUsage', e.target.value)}
                    className={`sap-form-input ${fieldErrors.sourceUsage ? 'input-error' : ''}`}
                    style={{ paddingLeft: 32 }}
                    aria-label="Source BOM Usage"
                  />
                </div>
              </div>

              <div className="sap-form-group sap-form-col">
                <label htmlFor="sourceAltBom">
                  Alternative BOM
                </label>
                <div className="sap-form-input-wrapper">
                  <Hash size={14} className="input-icon" />
                  <input
                    id="sourceAltBom"
                    type="text"
                    placeholder="Optional (e.g. 1)"
                    value={formData.sourceAltBom}
                    onChange={(e) => handleChange('sourceAltBom', e.target.value)}
                    className="sap-form-input"
                  />
                </div>
              </div>
            </div>

            {/* Validation Action Button */}
            <div className="sap-val-action-row" style={{ marginTop: '6px', marginBottom: '4px' }}>
              <button
                type="button"
                onClick={handleValidateSource}
                disabled={isValidating}
                className={`sap-btn ${isValidated ? 'sap-btn-validated' : 'sap-btn-secondary sap-btn-validate'}`}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  height: '26px',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: isValidating ? 'wait' : 'pointer'
                }}
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
              <div className="sap-source-val-card sap-val-loading">
                <Loader2 size={15} className="sap-spin" style={{ color: 'var(--sap-primary)' }} />
                <span>Validating SAP master records for reference BOM...</span>
              </div>
            )}

            {validationResult && !isValidating && (
              <div className={`sap-source-val-card ${validationResult.success ? 'sap-val-success' : 'sap-val-error'}`}>
                <div className="sap-val-card-header">
                  {validationResult.success ? (
                    <>
                      <CheckCircle2 size={15} style={{ color: 'var(--sap-success)', flexShrink: 0 }} />
                      <span className="sap-val-card-title">Source BOM Validated</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={15} style={{ color: 'var(--sap-error)', flexShrink: 0 }} />
                      <span className="sap-val-card-title">
                        Validation Failed {validationResult.errorCode ? `(${validationResult.errorCode})` : ''}
                      </span>
                    </>
                  )}
                </div>

                {validationResult.success ? (
                  <div className="sap-val-checklist">
                    <div className="sap-val-item">
                      <span className="sap-val-check">✓</span>
                      <span>Material <strong>{formData.sourceMaterial.trim().toUpperCase()}</strong> found</span>
                    </div>
                    <div className="sap-val-item">
                      <span className="sap-val-check">✓</span>
                      <span>Plant <strong>{formData.sourcePlant.trim().toUpperCase()}</strong> validated</span>
                    </div>
                    <div className="sap-val-item">
                      <span className="sap-val-check">✓</span>
                      <span>BOM Usage <strong>{formData.sourceUsage.trim()}</strong> found</span>
                    </div>
                    {formData.sourceAltBom.trim() && (
                      <div className="sap-val-item">
                        <span className="sap-val-check">✓</span>
                        <span>Alternative BOM <strong>{formData.sourceAltBom.trim()}</strong> exists</span>
                      </div>
                    )}
                    {validationResult.componentCount !== undefined && (
                      <div className="sap-val-item">
                        <span className="sap-val-check">✓</span>
                        <span><strong>{validationResult.componentCount}</strong> components found</span>
                      </div>
                    )}

                    {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                      <div className="sap-val-alts-container">
                        <span className="sap-val-alts-label">Available Alternative BOMs:</span>
                        <div className="sap-val-alts-chips">
                          {validationResult.availableAlternatives.map((alt) => (
                            <button
                              type="button"
                              key={alt}
                              onClick={() => handleChange('sourceAltBom', alt)}
                              className={`sap-alt-chip ${formData.sourceAltBom === alt ? 'selected' : ''}`}
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
                  <div className="sap-val-error-content">
                    <p className="sap-val-error-message">{validationResult.message}</p>
                    {Array.isArray(validationResult.availableAlternatives) && validationResult.availableAlternatives.length > 0 && (
                      <div className="sap-val-alts-container">
                        <span className="sap-val-alts-label">Available Alternative BOMs in SAP:</span>
                        <div className="sap-val-alts-chips">
                          {validationResult.availableAlternatives.map((alt) => (
                            <button
                              type="button"
                              key={alt}
                              onClick={() => handleChange('sourceAltBom', alt)}
                              className="sap-alt-chip"
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

          {/* Visual Connector Arrow */}
          <div className="sap-form-dual-connector" aria-hidden="true">
            <div className="sap-form-dual-connector-line" />
            <div className="sap-form-dual-connector-badge">
              <ArrowRight size={16} />
            </div>
            <div className="sap-form-dual-connector-line" />
          </div>

          {/* TARGET BOM SECTION */}
          <div className="sap-form-section sap-form-section-target">
            <div className="sap-form-section-badge target-badge">
              <span className="badge-pill">Target</span>
              <span className="badge-title">New BOM Destination</span>
            </div>

            <div className="sap-form-group">
              <label htmlFor="targetMaterial">
                Material <span className="required-star">*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Layers size={14} className="input-icon" />
                <ValueHelpInput
                  id="targetMaterial"
                  kind="material"
                  plant={formData.targetPlant}
                  placeholder="e.g. A1BH0214C"
                  value={formData.targetMaterial}
                  onChange={(e) => handleChange('targetMaterial', e.target.value)}
                  onSelect={(val, full) => {
                    handleChange('targetMaterial', val);
                    if (full?.stlal) {
                      handleChange('targetAltBom', full.stlal);
                    }
                    if (full?.werks && !formData.targetPlant) {
                      handleChange('targetPlant', full.werks);
                    }
                  }}
                  className={`sap-form-input ${fieldErrors.targetMaterial ? 'input-error' : ''}`}
                  style={{ paddingLeft: 32 }}
                  aria-label="Target Material"
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label htmlFor="targetPlant">
                Plant <span className="required-star">*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Factory size={14} className="input-icon" />
                <ValueHelpInput
                  id="targetPlant"
                  kind="plant"
                  material={formData.targetMaterial}
                  placeholder="e.g. 1012"
                  maxLength={4}
                  value={formData.targetPlant}
                  onChange={(e) => handleChange('targetPlant', e.target.value)}
                  className={`sap-form-input ${fieldErrors.targetPlant ? 'input-error' : ''}`}
                  style={{ paddingLeft: 32 }}
                  aria-label="Target Plant"
                />
              </div>
            </div>

            <div className="sap-form-row">
              <div className="sap-form-group sap-form-col">
                <label htmlFor="targetUsage">
                  BOM Usage <span className="required-star">*</span>
                </label>
                <div className="sap-form-input-wrapper">
                  <Hash size={14} className="input-icon" />
                  <ValueHelpInput
                    id="targetUsage"
                    kind="bomUsage"
                    placeholder="1"
                    maxLength={1}
                    value={formData.targetUsage}
                    onChange={(e) => handleChange('targetUsage', e.target.value)}
                    className={`sap-form-input ${fieldErrors.targetUsage ? 'input-error' : ''}`}
                    style={{ paddingLeft: 32 }}
                    aria-label="Target BOM Usage"
                  />
                </div>
              </div>

              <div className="sap-form-group sap-form-col">
                <label htmlFor="targetAltBom">
                  Alternative BOM
                </label>
                <div className="sap-form-input-wrapper">
                  <Hash size={14} className="input-icon" />
                  <input
                    id="targetAltBom"
                    type="text"
                    placeholder="Optional (e.g. 1)"
                    value={formData.targetAltBom}
                    onChange={(e) => handleChange('targetAltBom', e.target.value)}
                    className="sap-form-input"
                  />
                </div>
              </div>
            </div>

            <div className="sap-form-group">
              <label htmlFor="validFrom">
                Valid From
              </label>
              <div className="sap-form-input-wrapper">
                <Calendar size={14} className="input-icon" />
                <input
                  id="validFrom"
                  type="text"
                  placeholder="Optional (DD.MM.YYYY)"
                  value={formData.validFrom}
                  onChange={(e) => handleChange('validFrom', e.target.value)}
                  className="sap-form-input"
                />
              </div>
            </div>
          </div>
        </div>

        {!hideFormActions && (
          <div className="sap-form-actions">
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={onCancel}
              style={{ height: 28, fontSize: '11.5px', padding: '0 12px' }}
            >
              <X size={13} />
              <span>Cancel</span>
            </button>

            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              title="Proceed to Copy BOM proposal"
              style={{ height: 28, fontSize: '11.5px', padding: '0 12px' }}
            >
              <span>Proceed</span>
              <ArrowRight size={13} />
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
