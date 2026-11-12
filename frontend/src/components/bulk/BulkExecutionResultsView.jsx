import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  MinusCircle,
  Info,
  Download,
  RefreshCw
} from 'lucide-react';
import { FormSection } from '../ui/form-layout';
import {
  BulkExecutionResultBadge,
  getExecutionRowMessages,
  normalizeExecutionStatus,
  renderMessageContent
} from '../BulkBomShared';

/**
 * Shared Step 3 (Results Page) Component for Bulk Create BOM and Bulk Copy BOM.
 * Provides identical visual hierarchy, spacing tokens, banner styling,
 * summary stat cards, table card, and bottom action buttons.
 */
export function BulkExecutionResultsView({
  mode = 'create', // 'create' | 'copy'
  report = {},
  rows = [],
  onBack,
  onReset,
  onRetryFailedRows,
  onExportResults,
  renderMessageContent: customRenderMsg
}) {
  const [expandedRows, setExpandedRows] = useState(() => new Set());

  const toggleRowExpand = (rowKey) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const renderMsgContent = customRenderMsg || renderMessageContent;

  const displayRows = rows && rows.length > 0 ? rows : (report?.results || []);
  const totalEntries = report?.totalProcessed || displayRows.length;

  const isCreatedOrCopied = (r) => {
    const s = normalizeExecutionStatus(r);
    return s === 'CREATED' || s === 'COPIED' || s === 'SUCCESS';
  };
  const isFailed = (r) => {
    const s = normalizeExecutionStatus(r);
    return s === 'FAILED' || ['failed', 'invalid', 'error'].includes(String(r?.status || '').trim().toLowerCase());
  };
  const isSkipped = (r) => {
    const s = normalizeExecutionStatus(r);
    return s === 'SKIPPED' || s === 'NOT_PROCESSED' || s === 'NOT_ATTEMPTED';
  };

  const successCount =
    report?.bomsCreated ??
    report?.successCount ??
    displayRows.filter(isCreatedOrCopied).length;

  const failedCount =
    report?.failedCount ??
    displayRows.filter(isFailed).length;

  const skippedCount =
    report?.skippedCount ??
    displayRows.filter(isSkipped).length;

  const totalComponents =
    report?.componentsCreated ??
    displayRows.reduce((acc, r) => acc + (r?.componentsCount || r?.componentCount || 0), 0);

  // Banner configuration
  let bannerBg = 'var(--color-success-bg, #ECFDF3)';
  let bannerBorder = 'var(--color-success-border, #A6F4C5)';
  let bannerColor = 'var(--color-success, #15803D)';
  let bannerTitle = mode === 'copy' ? 'Batch Copy Completed Successfully' : 'Batch Creation Completed Successfully';
  let bannerSummary = mode === 'copy'
    ? `Successfully copied ${successCount} BOM(s) across ${totalEntries} total entries.`
    : `Created ${successCount} BOM(s) and ${totalComponents} component(s) across ${totalEntries} total entries.`;
  let bannerIcon = <CheckCircle2 size={24} style={{ color: 'var(--color-success, #15803D)', flexShrink: 0 }} />;

  if (failedCount > 0) {
    if (successCount === 0) {
      // Red failure banner
      bannerBg = 'var(--color-danger-bg, #FEF3F2)';
      bannerBorder = 'var(--color-danger-border, #FECDCA)';
      bannerColor = 'var(--color-danger, #B42318)';
      bannerIcon = <AlertCircle size={24} style={{ color: 'var(--color-danger, #B42318)', flexShrink: 0 }} />;
    } else {
      // Amber partial banner
      bannerBg = 'var(--color-warning-bg, #FFFBEB)';
      bannerBorder = 'var(--color-warning-border, #FDE68A)';
      bannerColor = 'var(--color-warning, #D97706)';
      bannerIcon = <AlertTriangle size={24} style={{ color: 'var(--color-warning, #D97706)', flexShrink: 0 }} />;
    }
    bannerTitle = mode === 'copy' ? 'Batch Copy Completed with Issues' : 'Batch Creation Completed with Issues';
    bannerSummary = mode === 'copy'
      ? `Copied ${successCount} BOM(s); ${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''} out of ${totalEntries} total entries.`
      : `Created ${successCount} BOM(s); ${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''} out of ${totalEntries} total entries.`;
  } else if (skippedCount > 0) {
    // Blue info / skipped banner
    bannerBg = 'var(--color-info-bg, #EEF4F9)';
    bannerBorder = 'var(--color-info-border, #B3CDE0)';
    bannerColor = 'var(--color-blue-600, #02579A)';
    bannerTitle = mode === 'copy' ? 'Batch Copy Completed with Skipped Rows' : 'Batch Creation Completed with Skipped Rows';
    bannerSummary = mode === 'copy'
      ? `Copied ${successCount} BOM(s); ${skippedCount} were skipped out of ${totalEntries} total entries.`
      : `Created ${successCount} BOM(s); ${skippedCount} were skipped out of ${totalEntries} total entries.`;
    bannerIcon = <Info size={24} style={{ color: 'var(--color-blue-600, #02579A)', flexShrink: 0 }} />;
  }

  const renderMessageCell = (row, rowKey, normStatus) => {
    const messages = getExecutionRowMessages(row);
    const isExpanded = expandedRows.has(rowKey);
    const visibleMessages = isExpanded ? messages : messages.slice(0, 2);
    const hiddenCount = messages.length - 2;

    return (
      <div className="bulk-execution-msg-container" style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
        {visibleMessages.map((m, mIdx) => {
          const severity = m.severity || m.type || 'info';
          return (
            <div
              key={mIdx}
              className={`bulk-execution-msg-item bulk-execution-msg-${severity}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm, 6px)',
                borderLeft: severity === 'error' ? '3px solid var(--color-danger, #B42318)' : 'none',
                backgroundColor:
                  severity === 'error'
                    ? 'var(--color-danger-bg, #FEF3F2)'
                    : severity === 'warning'
                    ? 'var(--color-warning-bg, #FFFBEB)'
                    : severity === 'skipped'
                    ? 'var(--color-blue-50, #EEF4F9)'
                    : 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                lineHeight: 1.45
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
                {severity === 'error' ? (
                  <AlertCircle size={13} style={{ color: 'var(--color-danger, #B42318)' }} />
                ) : severity === 'warning' ? (
                  <AlertTriangle size={13} style={{ color: 'var(--color-warning, #D97706)' }} />
                ) : severity === 'skipped' ? (
                  <MinusCircle size={13} style={{ color: 'var(--color-blue-700, #034375)' }} />
                ) : normStatus === 'CREATED' || normStatus === 'COPIED' || normStatus === 'SUCCESS' ? (
                  <CheckCircle2 size={13} style={{ color: 'var(--color-success, #15803D)' }} />
                ) : (
                  <Info size={13} style={{ color: 'var(--color-text-muted, #7A8CA3)' }} />
                )}
              </span>
              <span
                className="bulk-execution-msg-text"
                style={{
                  flex: 1,
                  wordBreak: 'break-word',
                  overflowWrap: 'anywhere',
                  fontFamily: 'var(--font-sans)',
                  color:
                    severity === 'error'
                      ? 'var(--color-danger, #B42318)'
                      : severity === 'warning'
                      ? 'var(--color-text, #0F2742)'
                      : severity === 'skipped'
                      ? 'var(--color-blue-700, #034375)'
                      : 'var(--color-text-secondary, #4A5F77)'
                }}
              >
                {renderMsgContent(m.text)}
              </span>
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => toggleRowExpand(rowKey)}
            className="sap-link"
            style={{
              alignSelf: 'flex-start',
              marginTop: 2,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--color-primary, var(--sap-brand, #02579A))',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            {isExpanded ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        )}

        {row.bomNumber && (
          <span
            className="bom-num-tag"
            style={{
              display: 'inline-block',
              marginTop: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--color-blue-700, #034375)'
            }}
          >
            SAP BOM: {row.bomNumber}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className="rx-bulk-results-view w-full"
      data-testid="bulk-execution-results"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        gap: 'var(--space-24, 24px)',
        paddingBottom: 'var(--space-24, 24px)'
      }}
    >
      {/* 1. Result Banner */}
      <div
        className="rx-results-banner"
        data-testid="results-banner"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 20px',
          borderRadius: 'var(--radius-lg, 12px)',
          background: bannerBg,
          border: `1px solid ${bannerBorder}`,
          color: bannerColor,
          boxSizing: 'border-box'
        }}
      >
        {bannerIcon}
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'inherit' }}>{bannerTitle}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text, #0F2742)' }}>
            {bannerSummary}
          </p>
        </div>
      </div>

      {/* 2. Four Summary Cards */}
      <div
        className="rx-results-summary-cards"
        data-testid="results-summary-cards"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 'var(--space-16, 16px)'
        }}
      >
        <div className="sap-card rx-stat-card" data-testid="stat-card-success" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #7A8CA3)', marginBottom: 4 }}>
            {mode === 'copy' ? 'Copied' : 'BOMs Created'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-success, #15803D)' }}>
            {successCount}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-components" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #7A8CA3)', marginBottom: 4 }}>
            Total Components
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-blue-600, #02579A)' }}>
            {totalComponents}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-skipped" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #7A8CA3)', marginBottom: 4 }}>
            Skipped
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-secondary, #4A5F77)' }}>
            {skippedCount}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-failed" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #7A8CA3)', marginBottom: 4 }}>
            Failed
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-danger, #B42318)' }}>
            {failedCount}
          </div>
        </div>
      </div>

      {/* 3. Execution Details Card */}
      <FormSection
        title={`Execution Details (${displayRows.length})`}
        description="Batch processing results and itemized execution status"
        tintedHeader
        actions={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {failedCount > 0 && onRetryFailedRows && (
              <button
                type="button"
                className="sap-button sap-btn sap-btn-secondary"
                onClick={onRetryFailedRows}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px' }}
              >
                <RefreshCw size={15} />
                <span>Retry Failed Rows ({failedCount})</span>
              </button>
            )}
            {onExportResults && (
              <button
                type="button"
                className="sap-button sap-btn sap-btn-secondary"
                onClick={onExportResults}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '6px 14px' }}
              >
                <Download size={15} />
                <span>Export Results</span>
              </button>
            )}
          </div>
        }
        className="rx-results-card !mb-0"
      >
        <div
          className="sap-table-container fiori-table-wrapper"
          data-testid="execution-details-table-container"
          style={{ maxHeight: 420, overflowX: 'hidden', width: '100%' }}
        >
          <table
            className="sap-table"
            data-testid="execution-details-table"
            style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 13 }}
          >
            {mode === 'copy' ? (
              <>
                <colgroup>
                  <col style={{ width: 50 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 65 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>#</th>
                    <th style={{ width: 220 }}>Source BOM</th>
                    <th style={{ width: 220 }}>Target BOM</th>
                    <th style={{ width: 65, textAlign: 'center' }}>Items</th>
                    <th style={{ width: 105, textAlign: 'center' }}>Status</th>
                    <th style={{ width: 'auto' }}>Message / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const rowKey = String(row.id || row.sequenceNum || idx);
                    const normStatus = normalizeExecutionStatus(row);

                    return (
                      <tr key={rowKey} data-testid={`execution-row-${idx}`}>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted, #7A8CA3)', verticalAlign: 'top', paddingTop: 10, fontWeight: 600, fontSize: 11 }}>
                          {idx + 1}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                          <div className="bom-identity-cell" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="mat-pill font-semibold" style={{ wordBreak: 'break-all' }}>{row.sourceMaterial}</span>
                            <span className="sub-detail" style={{ fontSize: 11, color: 'var(--color-text-secondary, #4A5F77)' }}>
                              Plant: <strong>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong>
                            </span>
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                          <div className="bom-identity-cell" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="mat-pill font-semibold" style={{ wordBreak: 'break-all' }}>{row.targetMaterial}</span>
                            <span className="sub-detail" style={{ fontSize: 11, color: 'var(--color-text-secondary, #4A5F77)' }}>
                              Plant: <strong>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--color-blue-600, #02579A)' }}>{row.targetAltBom}</strong>
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>
                          {row.componentCount !== undefined && row.componentCount > 0 ? (
                            <span
                              className="comp-count-badge"
                              style={{
                                display: 'inline-block',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-sm, 6px)',
                                background: 'var(--color-blue-50, #EEF4F9)',
                                color: 'var(--color-blue-700, #034375)',
                                fontSize: 11,
                                fontWeight: 600
                              }}
                            >
                              {row.componentCount}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted, #7A8CA3)' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }}>
                          <BulkExecutionResultBadge status={normStatus} mode="copy" subStatus={row.subStatus} message={row.message} />
                        </td>
                        <td
                          className="bulk-execution-msg-cell"
                          style={{
                            verticalAlign: 'top',
                            paddingTop: 8,
                            paddingBottom: 8,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere'
                          }}
                        >
                          {renderMessageCell(row, rowKey, normStatus)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            ) : (
              <>
                <colgroup>
                  <col style={{ width: 50 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 55 }} />
                  <col style={{ width: 50 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 105 }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>Seq</th>
                    <th style={{ width: 140 }}>Material</th>
                    <th style={{ width: 70 }}>Plant</th>
                    <th style={{ width: 55, textAlign: 'center' }}>Usage</th>
                    <th style={{ width: 50, textAlign: 'center' }}>Alt</th>
                    <th style={{ width: 120 }}>BOM Number</th>
                    <th style={{ width: 105, textAlign: 'center' }}>Status</th>
                    <th style={{ width: 'auto' }}>Message / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const rowKey = String(row.sequenceNum || row.id || idx);
                    const normStatus = normalizeExecutionStatus(row);

                    return (
                      <tr key={rowKey} data-testid={`execution-row-${idx}`}>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted, #7A8CA3)', verticalAlign: 'top', paddingTop: 10 }}>
                          {row.sequenceNum || idx + 1}
                        </td>
                        <td style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 10, wordBreak: 'break-all' }}>
                          {row.material}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>{row.plant}</td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>{row.bomUsage}</td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>{row.alternativeBom}</td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10, fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }}>
                          {row.bomNumber || '-'}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }}>
                          <BulkExecutionResultBadge status={normStatus} mode="create" subStatus={row.subStatus} message={row.message} />
                        </td>
                        <td
                          className="bulk-execution-msg-cell"
                          style={{
                            verticalAlign: 'top',
                            paddingTop: 8,
                            paddingBottom: 8,
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere'
                          }}
                        >
                          {renderMessageCell(row, rowKey, normStatus)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            )}
          </table>
        </div>
      </FormSection>

      {/* 4. Action Buttons Row */}
      <div
        className="rx-results-action-buttons"
        data-testid="results-action-buttons"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-12, 12px)'
        }}
      >
        <button
          type="button"
          className="sap-button primary"
          onClick={onBack}
          style={{
            height: 'var(--size-button-height, 40px)',
            padding: '0 20px',
            fontSize: 'var(--font-size-13, 13px)',
            borderRadius: 'var(--radius-md, 8px)'
          }}
        >
          Return to Launchpad
        </button>
        <button
          type="button"
          className="sap-button"
          onClick={onReset}
          style={{
            height: 'var(--size-button-height, 40px)',
            padding: '0 20px',
            fontSize: 'var(--font-size-13, 13px)',
            borderRadius: 'var(--radius-md, 8px)'
          }}
        >
          Upload Another File
        </button>
      </div>
    </div>
  );
}

export default BulkExecutionResultsView;
