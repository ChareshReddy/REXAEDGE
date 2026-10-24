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

export default function ValidateBomView({ systemKey = 'DEV', onBack, onNavigateHome }) {
  const [formData, setFormData] = useState({
    material: '',
    plant: '',
    bomUsage: '1',
    alternativeBom: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    activityTracker.setOperation('validate_bom', isLoading);
    return () => {
      activityTracker.setOperation('validate_bom', false);
    };
  }, [isLoading]);

  const handleValidate = async (e) => {
    e.preventDefault();
    if (!formData.material.trim() || !formData.plant.trim()) {
      setErrorMsg('Please enter both Material and Plant to validate.');
      return;
    }

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
      setErrorMsg(text);
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
    setResult(null);
    setErrorMsg('');
  };

  return (
    <div className="fiori-app-view-root">
      {/* Full-Width SAP Fiori Horizon Page Header */}
      <div className="fiori-ph">
        <div className="fiori-bc">
          <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
            Home
          </button>
          <span className="fiori-bc-sep">›</span>
          <button type="button" className="fiori-bc-link" onClick={onBack}>
            Bill of Materials
          </button>
          <span className="fiori-bc-sep">›</span>
          <span className="fiori-bc-current">Validate Material BOM</span>
          <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>{systemKey}</span>
        </div>
        <div className="fiori-ph-title-row">
          <button
            type="button"
            className="fiori-ph-back"
            onClick={onBack}
            title="Back to Bill of Materials"
            aria-label="Back to Bill of Materials"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="fiori-ph-title">Validate Material BOM (PRE-CHECK)</h1>
        </div>
        <p className="fiori-ph-subtitle">
          Pre-flight verification in SAP via RFC. Checks MAST, STAS, and STPO table records before production planning or copying.
        </p>
      </div>

      <div className="fiori-view-body">
        {/* Error Notice */}
        {errorMsg && (
          <div className="sap-alert sap-alert-error" style={{ maxWidth: 680, width: '100%', margin: '0 auto 14px' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* Small Compact Validation Card (2 rows x 2 columns) */}
        <div className="sap-structured-form-card" style={{ maxWidth: 680, width: '100%', margin: '0 auto 16px' }}>
          <form onSubmit={handleValidate}>
            <div className="sap-form-grid" style={{ gridTemplateColumns: '1fr 1fr', padding: '14px 16px', gap: '10px 14px' }}>
              <div className="sap-form-group">
                <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                  Material Number <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
                </label>
                <div className="sap-form-input-wrapper">
                  <Layers size={13} className="input-icon" />
                  <input
                    type="text"
                    className="sap-form-input"
                    placeholder="e.g. 100001"
                    value={formData.material}
                    onChange={(e) => setFormData((p) => ({ ...p, material: e.target.value }))}
                    autoFocus
                  />
                </div>
              </div>

              <div className="sap-form-group">
                <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                  Plant Code <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
                </label>
                <div className="sap-form-input-wrapper">
                  <Factory size={13} className="input-icon" />
                  <input
                    type="text"
                    className="sap-form-input"
                    placeholder="e.g. 1000"
                    value={formData.plant}
                    onChange={(e) => setFormData((p) => ({ ...p, plant: e.target.value }))}
                  />
                </div>
              </div>

              <div className="sap-form-group">
                <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>BOM Usage</label>
                <div className="sap-form-input-wrapper">
                  <Hash size={13} className="input-icon" />
                  <input
                    type="text"
                    className="sap-form-input"
                    placeholder="1 (Production)"
                    value={formData.bomUsage}
                    onChange={(e) => setFormData((p) => ({ ...p, bomUsage: e.target.value }))}
                  />
                </div>
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
              </div>
            </div>

            <div className="sap-form-actions" style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--sap-border-subtle)' }}>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={handleReset}
                style={{ height: 28, fontSize: '11px', padding: '0 12px' }}
              >
                <X size={12} />
                <span>Clear</span>
              </button>
              <button
                type="submit"
                className="sap-btn sap-btn-primary"
                disabled={isLoading}
                style={{ height: 28, fontSize: '11px', padding: '0 14px' }}
              >
                {isLoading ? (
                  <>
                    <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                    <span>Validating in SAP...</span>
                  </>
                ) : (
                  <>
                    <Search size={13} />
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
              maxWidth: 680,
              width: '100%',
              margin: '0 auto',
              padding: '12px 14px',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: result.bomExists ? 'var(--sap-success-bg)' : 'var(--sap-warning-bg)',
              border: `1px solid ${result.bomExists ? 'var(--sap-success-border)' : 'var(--sap-warning-border)'}`,
              boxShadow: 'var(--sap-shadow-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {result.bomExists ? (
                <CheckCircle2 size={16} color="var(--sap-success)" />
              ) : (
                <AlertTriangle size={16} color="var(--sap-warning)" />
              )}
              <strong style={{ fontSize: '13px', color: result.bomExists ? 'var(--sap-success-text)' : 'var(--sap-warning-text)' }}>
                {result.bomExists ? 'BOM Exists in SAP' : 'No BOM Found'}
              </strong>
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--sap-text)', marginBottom: 10 }}>{result.message}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, fontSize: '11px', background: 'var(--sap-card-bg)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--sap-border-subtle)' }}>
              <div>Material: <strong>{result.material || formData.material}</strong></div>
              <div>Plant: <strong>{result.plant || formData.plant}</strong></div>
              <div>Components: <strong>{result.componentCount || 0}</strong></div>
              <div>Alternatives: <strong>{(result.availableAlternatives || []).join(', ') || '01'}</strong></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
