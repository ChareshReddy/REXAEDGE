import React, { useState } from 'react';
import {
  ShieldCheck,
  Search,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Factory,
  Hash
} from 'lucide-react';
import { validateSourceBom } from '../services/api';
import Modal from './Modal';

export default function ValidateBomModal({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    material: '',
    plant: '',
    bomUsage: '1',
    alternativeBom: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Validate Material BOM"
      subtitle="Pre-flight verification in SAP via RFC"
      icon={ShieldCheck}
      iconColor="var(--sap-warning)"
      iconBadgeBg="var(--sap-warning-bg)"
      iconBadgeBorder="var(--sap-warning-border)"
      isLoading={isLoading}
      maxWidth={460}
      padding="16px 20px"
    >
      <div style={{ minHeight: 'auto' }}>
        <form onSubmit={handleValidate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="sap-form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '8px 10px', padding: '10px 12px', marginBottom: 0 }}>
            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Material <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
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
                Plant <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
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
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                BOM Usage
              </label>
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
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Alt BOM (optional)
              </label>
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

          <button
            type="submit"
            className="sap-btn sap-btn-primary"
            disabled={isLoading}
            style={{ marginTop: 2, height: 30, fontSize: '11.5px', justifyContent: 'center' }}
          >
            {isLoading ? (
              <>
                <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                <span>Checking in SAP...</span>
              </>
            ) : (
              <>
                <Search size={13} />
                <span>Validate in SAP</span>
              </>
            )}
          </button>
        </form>

        {/* Error Message */}
        {errorMsg && (
          <div className="sap-form-alert sap-form-alert-error" style={{ marginTop: 10, marginBottom: 0 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '11.5px' }}>{errorMsg}</span>
          </div>
        )}

        {/* Validation Result Box */}
        {result && result.success && (
          <div
            style={{
              marginTop: 10,
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: result.bomExists ? 'var(--sap-success-bg)' : 'var(--sap-warning-bg)',
              border: `1px solid ${result.bomExists ? 'var(--sap-success-border)' : 'var(--sap-warning-border)'}`
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {result.bomExists ? (
                <CheckCircle2 size={15} color="var(--sap-success)" />
              ) : (
                <AlertTriangle size={15} color="var(--sap-warning)" />
              )}
              <strong style={{ fontSize: '12px', color: result.bomExists ? 'var(--sap-success-text)' : 'var(--sap-warning-text)' }}>
                {result.bomExists ? 'BOM Exists in SAP' : 'No BOM Found'}
              </strong>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--sap-text)', marginBottom: 6 }}>{result.message}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: '11px' }}>
              <div>Material: <strong>{result.material || formData.material}</strong></div>
              <div>Plant: <strong>{result.plant || formData.plant}</strong></div>
              <div>Components: <strong>{result.componentCount || 0}</strong></div>
              <div>Alternatives: <strong>{(result.availableAlternatives || []).join(', ') || '01'}</strong></div>
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--sap-border-subtle)', paddingTop: 10 }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={onClose}
            disabled={isLoading}
            style={{ height: 28, fontSize: '11.5px', padding: '0 12px' }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
