import React from 'react';
import Modal from './Modal';
import { ShieldCheck, Loader2 } from 'lucide-react';

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

  const readyDotColor = readyCount > 0 ? 'var(--color-success, #15803D)' : 'var(--sap-text-muted, #7A8CA3)';
  const skippedDotColor = skippedCount > 0 ? 'var(--color-info, #02579A)' : 'var(--sap-text-muted, #7A8CA3)';
  const invalidDotColor = invalidCount > 0 ? 'var(--color-danger, #B42318)' : 'var(--sap-text-muted, #7A8CA3)';

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isExecuting) onClose();
      }}
      closeOnEscape={!isExecuting}
      title={modalTitle}
      maxWidth={480}
      width="min(480px, calc(100vw - 32px))"
      padding="20px"
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
      <div data-testid="bulk-confirm-modal-content">
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 13,
            color: 'var(--sap-text-body, #334155)',
            lineHeight: 1.5
          }}
        >
          You are about to {isCopy ? 'copy' : 'create'} {readyCount} BOM(s) in SAP from file:
        </p>

        {/* File line */}
        <div
          data-testid="bulk-confirm-file-line"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '0 0 16px',
            minWidth: 0,
            fontSize: 13,
            lineHeight: 1.4
          }}
        >
          <span style={{ color: 'var(--sap-text-muted, #7A8CA3)', flexShrink: 0 }}>File</span>
          <span
            data-testid="bulk-confirm-file-name"
            title={fileName}
            style={{
              fontWeight: 600,
              color: 'var(--sap-text-dark, #0F172A)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0
            }}
          >
            {fileName}
          </span>
        </div>

        {/* Summary Table */}
        <div
          className="bulk-confirm-table-container rx-confirm-table-container"
          data-testid="bulk-confirm-table-container"
          style={{
            border: '1px solid var(--table-header-border, #DDE6F0)',
            borderRadius: 4,
            overflow: 'hidden',
            background: 'var(--sap-card-bg, #ffffff)',
            marginBottom: 12
          }}
        >
          <table
            className="rx-confirm-table rx-bulk-confirm-table"
            data-testid="bulk-confirm-summary-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed'
            }}
          >
            <thead>
              <tr
                style={{
                  background: 'var(--table-header-bg, #EDF2F9)',
                  borderBottom: '1px solid var(--table-header-border, #DDE6F0)',
                  height: 36
                }}
              >
                <th
                  style={{
                    padding: '0 12px',
                    textAlign: 'left',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--table-header-text, #0B2D57)',
                    lineHeight: '36px',
                    height: 36,
                    boxSizing: 'border-box'
                  }}
                >
                  Status
                </th>
                <th
                  style={{
                    padding: '0 12px',
                    textAlign: 'right',
                    width: 80,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--table-header-text, #0B2D57)',
                    lineHeight: '36px',
                    height: 36,
                    boxSizing: 'border-box'
                  }}
                >
                  BOMs
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Row 1: Ready */}
              <tr
                data-testid="bulk-confirm-row-ready"
                style={{
                  height: 36,
                  borderBottom: '1px solid var(--table-header-border, #DDE6F0)',
                  boxSizing: 'border-box'
                }}
              >
                <td style={{ padding: '0 12px', height: 36, verticalAlign: 'middle', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      data-testid="bulk-confirm-dot-ready"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: readyDotColor,
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                      {isCopy ? 'Ready to copy' : 'Ready to create'}
                    </span>
                  </div>
                </td>
                <td
                  data-testid="bulk-confirm-ready-count"
                  style={{
                    padding: '0 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--table-header-text, #0B2D57)',
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    height: 36,
                    verticalAlign: 'middle',
                    boxSizing: 'border-box'
                  }}
                >
                  {readyCount}
                </td>
              </tr>

              {/* Row 2: Skipped */}
              <tr
                data-testid="bulk-confirm-row-skipped"
                style={{
                  height: 36,
                  borderBottom: '1px solid var(--table-header-border, #DDE6F0)',
                  boxSizing: 'border-box'
                }}
              >
                <td style={{ padding: '0 12px', height: 36, verticalAlign: 'middle', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      data-testid="bulk-confirm-dot-skipped"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: skippedDotColor,
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                      {isCopy ? 'Skipped' : 'Skipped (existing)'}
                    </span>
                  </div>
                </td>
                <td
                  data-testid="bulk-confirm-skipped-count"
                  style={{
                    padding: '0 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--table-header-text, #0B2D57)',
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    height: 36,
                    verticalAlign: 'middle',
                    boxSizing: 'border-box'
                  }}
                >
                  {skippedCount}
                </td>
              </tr>

              {/* Row 3: Invalid */}
              <tr
                data-testid="bulk-confirm-row-invalid"
                style={{
                  height: 36,
                  boxSizing: 'border-box'
                }}
              >
                <td style={{ padding: '0 12px', height: 36, verticalAlign: 'middle', boxSizing: 'border-box' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      data-testid="bulk-confirm-dot-invalid"
                      style={{
                        display: 'inline-block',
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: invalidDotColor,
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                      Invalid (will not run)
                    </span>
                  </div>
                </td>
                <td
                  data-testid="bulk-confirm-invalid-count"
                  style={{
                    padding: '0 12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: 'var(--table-header-text, #0B2D57)',
                    fontSize: 13,
                    fontVariantNumeric: 'tabular-nums',
                    height: 36,
                    verticalAlign: 'middle',
                    boxSizing: 'border-box'
                  }}
                >
                  {invalidCount}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footnote */}
        <p
          data-testid="bulk-confirm-footnote"
          style={{
            margin: '0',
            fontSize: 13,
            color: 'var(--sap-text-muted, #7A8CA3)',
            lineHeight: 1.4
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
