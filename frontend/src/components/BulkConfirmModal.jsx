import React from 'react';
import Modal from './Modal';
import { FileSpreadsheet, ShieldCheck, Loader2 } from 'lucide-react';

/**
 * BulkConfirmModal
 * Shared confirmation popup for Bulk BOM Creation and Bulk BOM Copy.
 * Matches design system tokens and AGENTS.md guidelines.
 */
export default function BulkConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  mode = 'create',
  title,
  fileName = 'BOM_Data.xlsx',
  readyCount = 0,
  skippedCount = 0,
  invalidCount = 0,
  isExecuting = false,
  jobProgress = null,
  isProd = false,
  confirmText = '',
  setConfirmText,
  businessReason = '',
  setBusinessReason
}) {
  const isCopy = mode === 'copy';
  const modalTitle = title || (isCopy ? 'Confirm Bulk BOM Copy' : 'Confirm Bulk BOM Creation');

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isExecuting) onClose();
      }}
      closeOnEscape={!isExecuting}
      title={modalTitle}
      maxWidth={520}
      width="min(520px, calc(100vw - 32px))"
      style={{ maxHeight: '90vh' }}
      cardClassName="rx-bulk-confirm-modal"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
          <button
            type="button"
            className="sap-button"
            disabled={isExecuting}
            onClick={() => {
              if (!isExecuting) onClose();
            }}
            style={{ height: 32, padding: '0 16px', fontSize: 'var(--sap-size-button)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sap-button primary"
            disabled={isExecuting || readyCount === 0 || (isProd && confirmText !== 'CONFIRM')}
            onClick={onConfirm}
            style={{ height: 32, padding: '0 18px', fontSize: 'var(--sap-size-button)' }}
          >
            {isExecuting ? (
              <>
                <Loader2 size={16} className="sap-spin" />
                <span>
                  {jobProgress?.total > 0
                    ? `${isCopy ? 'Copying' : 'Creating'} ${jobProgress.current} of ${jobProgress.total}...`
                    : isCopy
                    ? 'Copying in SAP...'
                    : 'Creating in SAP...'}
                </span>
              </>
            ) : isCopy ? (
              `Confirm & Copy (${readyCount})`
            ) : (
              `Confirm & Create (${readyCount})`
            )}
          </button>
        </div>
      }
    >
      <style>{`
        @media (max-width: 480px) {
          .bulk-confirm-tiles-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      <div style={{ padding: '4px 0' }} data-testid="bulk-confirm-modal-content">
        <p
          style={{
            margin: '0 0 10px',
            fontSize: 13.5,
            color: 'var(--sap-text-dark, #0F172A)',
            lineHeight: 1.5
          }}
        >
          You are about to {isCopy ? 'copy' : 'create'} <strong>{readyCount}</strong> BOM(s) in SAP from file:
        </p>

        {/* File chip on its own line */}
        <div style={{ marginBottom: 16 }}>
          <div
            className="bulk-confirm-file-chip"
            data-testid="bulk-confirm-file-chip"
            title={fileName}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: '100%',
              padding: '6px 12px',
              backgroundColor: 'var(--color-blue-100, #EAF1FB)',
              border: '1px solid var(--color-blue-200, #B3CDE0)',
              borderRadius: 'var(--radius-md, 8px)',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 600,
              fontSize: 13,
              color: 'var(--sap-primary, #0B2D57)',
              boxSizing: 'border-box'
            }}
          >
            <FileSpreadsheet size={16} style={{ flexShrink: 0, color: 'var(--sap-primary, #0B2D57)' }} />
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {fileName}
            </span>
          </div>
        </div>

        {/* Three equal summary tiles in one row */}
        <div
          className="bulk-confirm-tiles-grid"
          data-testid="bulk-confirm-tiles-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 14
          }}
        >
          {/* Tile 1: Ready */}
          <div
            data-testid="bulk-confirm-tile-ready"
            style={{
              backgroundColor: 'var(--color-success-bg, #ECFDF3)',
              border: '1px solid var(--color-success-border, #A6F4C5)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--color-success, #15803D)', fontWeight: 500 }}>
              {isCopy ? 'Ready to copy' : 'Ready to create'}
            </div>
            <div
              data-testid="bulk-confirm-ready-count"
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--color-success, #15803D)',
                lineHeight: 1.2
              }}
            >
              {readyCount}
            </div>
          </div>

          {/* Tile 2: Skipped */}
          <div
            data-testid="bulk-confirm-tile-skipped"
            style={{
              backgroundColor: 'var(--color-info-bg, #EEF4F9)',
              border: '1px solid var(--color-info-border, #B3CDE0)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--color-info, #02579A)', fontWeight: 500 }}>
              {isCopy ? 'Skipped' : 'Skipped (existing)'}
            </div>
            <div
              data-testid="bulk-confirm-skipped-count"
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--color-info, #02579A)',
                lineHeight: 1.2
              }}
            >
              {skippedCount}
            </div>
          </div>

          {/* Tile 3: Invalid */}
          <div
            data-testid="bulk-confirm-tile-invalid"
            style={{
              backgroundColor:
                invalidCount > 0 ? 'var(--color-danger-bg, #FEF3F2)' : 'var(--sap-surface-subtle, #F8FAFC)',
              border: `1px solid ${
                invalidCount > 0 ? 'var(--color-danger-border, #FECDCA)' : 'var(--sap-border-color, #E2E8F0)'
              }`,
              borderRadius: 'var(--radius-md, 8px)',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: invalidCount > 0 ? 'var(--color-danger, #B42318)' : 'var(--sap-text-muted, #64748B)',
                fontWeight: 500
              }}
            >
              Invalid (will not run)
            </div>
            <div
              data-testid="bulk-confirm-invalid-count"
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: invalidCount > 0 ? 'var(--color-danger, #B42318)' : 'var(--sap-text-muted, #64748B)',
                lineHeight: 1.2
              }}
            >
              {invalidCount}
            </div>
          </div>
        </div>

        {/* Muted footnote */}
        <p
          data-testid="bulk-confirm-footnote"
          style={{
            margin: '0 0 12px',
            fontSize: 12.5,
            color: 'var(--sap-text-muted, #64748B)',
            lineHeight: 1.5
          }}
        >
          {isCopy ? 'Only Ready BOMs are copied.' : 'Only Ready BOMs are sent to SAP.'}
        </p>

        {/* Prod safeguard */}
        {isProd && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'var(--color-danger-bg, #FEF3F2)',
              border: '1px solid var(--color-danger-border, #FECDCA)',
              marginTop: 16
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--color-danger, #B42318)',
                fontWeight: 700,
                marginBottom: 8
              }}
            >
              <ShieldCheck size={18} />
              <span>Production System Protection</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="sap-form-label" style={{ fontSize: 12 }}>
                Type <strong>CONFIRM</strong> to proceed:
              </label>
              <input
                type="text"
                className="sap-form-input"
                placeholder="CONFIRM"
                disabled={isExecuting}
                value={confirmText}
                onChange={(e) => setConfirmText?.(e.target.value)}
              />
            </div>
            <div>
              <label className="sap-form-label" style={{ fontSize: 12 }}>
                Business Reason*:
              </label>
              <input
                type="text"
                className="sap-form-input"
                placeholder="Ex. Approved Engineering Change ECO-1049"
                disabled={isExecuting}
                value={businessReason}
                onChange={(e) => setBusinessReason?.(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
