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
import { PageContainer } from './layout';

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

  const handleValidate = async (e) => {
    e.preventDefault();
    const errors = {};
    const missing = [];

    if (!formData.material.trim()) {
      errors.material = true;
      missing.push('Material number is required');
    }
    if (!formData.plant.trim()) {
      errors.plant = true;
      missing.push('Plant code is required');
    }

    if (missing.length > 0) {
      setFieldErrors(errors);
      toast.error('Please fill in the required fields', { messages: missing });
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
              <div className="sap-structured-form-card sap-full-width" style={{ width: '100%' }}>
                <form id="validate-bom-form" onSubmit={handleValidate}>
                  <div
                    className="sap-form-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      padding: '16px 20px',
                      gap: '14px 18px'
                    }}
                  >
                    <div className="sap-form-group">
                      <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                        Material Number <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
                      </label>
                      <div className="sap-form-input-wrapper">
                        <Layers size={13} className="input-icon" />
                        <ValueHelpInput
                          id="valMaterial"
                          kind="material"
                          plant={formData.plant}
                          placeholder="e.g. 100001"
                          value={formData.material}
                          onChange={(e) => {
                            setFormData((p) => ({ ...p, material: e.target.value }));
                            if (fieldErrors.material) setFieldErrors((p) => ({ ...p, material: false }));
                          }}
                          onSelect={(val, full) => {
                            setFormData((p) => ({
                              ...p,
                              material: val,
                              ...(full?.stlal ? { alternativeBom: full.stlal } : {}),
                              ...(full?.werks && !p.plant ? { plant: full.werks } : {})
                            }));
                            if (fieldErrors.material) setFieldErrors((p) => ({ ...p, material: false }));
                          }}
                          className={`sap-form-input ${fieldErrors.material ? 'input-error' : ''}`}
                          style={{ paddingLeft: 30 }}
                          aria-label="Validate Material"
                          autoFocus
                        />
                      </div>
                      <div className="sap-field-error-msg">{fieldErrors.material ? 'Material number is required' : ''}</div>
                    </div>

                    <div className="sap-form-group">
                      <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                        Plant Code <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
                      </label>
                      <div className="sap-form-input-wrapper">
                        <Factory size={13} className="input-icon" />
                        <ValueHelpInput
                          id="valPlant"
                          kind="plant"
                          material={formData.material}
                          placeholder="e.g. 1000"
                          maxLength={4}
                          value={formData.plant}
                          onChange={(e) => {
                            setFormData((p) => ({ ...p, plant: e.target.value }));
                            if (fieldErrors.plant) setFieldErrors((p) => ({ ...p, plant: false }));
                          }}
                          className={`sap-form-input ${fieldErrors.plant ? 'input-error' : ''}`}
                          style={{ paddingLeft: 30 }}
                          aria-label="Validate Plant"
                        />
                      </div>
                      <div className="sap-field-error-msg">{fieldErrors.plant ? 'Plant code is required' : ''}</div>
                    </div>

                    <div className="sap-form-group">
                      <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>BOM Usage</label>
                      <div className="sap-form-input-wrapper">
                        <Hash size={13} className="input-icon" />
                        <ValueHelpInput
                          kind="bomUsage"
                          placeholder="1 (Production)"
                          maxLength={1}
                          value={formData.bomUsage}
                          onChange={(e) => setFormData((p) => ({ ...p, bomUsage: e.target.value }))}
                          style={{ paddingLeft: 30 }}
                          aria-label="Validate BOM Usage"
                        />
                      </div>
                      <div className="sap-field-error-msg"></div>
                    </div>

                    <div className="sap-form-group">
                      <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>Alternative BOM (optional)</label>
                      <div className="sap-form-input-wrapper">
                        <Hash size={13} className="input-icon" />
                        <input
                          type="text"
                          className="sap-form-input"
                          placeholder="e.g. 01"
                          value={formData.alternativeBom}
                          onChange={(e) => setFormData((p) => ({ ...p, alternativeBom: e.target.value }))}
                        />
                      </div>
                      <div className="sap-field-error-msg"></div>
                    </div>
                  </div>

                  {/* Form Action Row inside card */}
                  <div className="sap-card-action-row">
                    <button
                      type="button"
                      className="sap-btn sap-btn-secondary"
                      onClick={handleReset}
                      style={{ height: 32, padding: '0 16px', fontSize: 13 }}
                    >
                      <X size={14} />
                      <span>Clear</span>
                    </button>

                    <button
                      type="submit"
                      className="sap-btn sap-btn-primary"
                      disabled={isLoading}
                      style={{ height: 32, padding: '0 18px', fontSize: 13 }}
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
                  </div>
                </form>
              </div>

              {/* Validation Result Box */}
              {result && result.success && (
                <div
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    borderRadius: 'var(--radius-xl, 12px)',
                    backgroundColor: result.bomExists ? 'var(--sap-success-bg, #f0fdf4)' : 'var(--sap-warning-bg, #fffbeb)',
                    border: `1px solid ${result.bomExists ? 'var(--sap-success-border, #bbf7d0)' : 'var(--sap-warning-border, #fed7aa)'}`,
                    boxShadow: 'var(--sap-shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {result.bomExists ? (
                      <CheckCircle2 size={18} color="var(--sap-success, #16a34a)" />
                    ) : (
                      <AlertTriangle size={18} color="var(--sap-warning, #d97706)" />
                    )}
                    <strong style={{ fontSize: '14px', color: result.bomExists ? 'var(--sap-success-text, #166534)' : 'var(--sap-warning-text, #9a3412)' }}>
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
