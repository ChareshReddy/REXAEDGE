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
  let bannerBg = 'var(--color-success-bg)';
  let bannerBorder = 'var(--color-success-border)';
  let bannerColor = 'var(--color-success)';
  let bannerTitle = mode === 'copy' ? 'Batch Copy Completed Successfully' : 'Batch Creation Completed Successfully';
  let bannerSummary = mode === 'copy'
    ? `Successfully copied ${successCount} BOM(s) across ${totalEntries} total entries.`
    : `Created ${successCount} BOM(s) and ${totalComponents} component(s) across ${totalEntries} total entries.`;
  let bannerIcon = <CheckCircle2 size={24} style={{ color: 'var(--color-success)', flexShrink: 0 }} />;

  if (failedCount > 0) {
    if (successCount === 0) {
      // Red failure banner
      bannerBg = 'var(--color-danger-bg)';
      bannerBorder = 'var(--color-danger-border)';
      bannerColor = 'var(--color-danger)';
      bannerIcon = <AlertCircle size={24} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />;
    } else {
      // Amber partial banner
      bannerBg = 'var(--color-warning-bg)';
      bannerBorder = 'var(--color-warning-border)';
      bannerColor = 'var(--color-warning)';
      bannerIcon = <AlertTriangle size={24} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />;
    }
    bannerTitle = mode === 'copy' ? 'Batch Copy Completed with Issues' : 'Batch Creation Completed with Issues';
    bannerSummary = mode === 'copy'
      ? `Copied ${successCount} BOM(s); ${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''} out of ${totalEntries} total entries.`
      : `Created ${successCount} BOM(s); ${failedCount} failed${skippedCount > 0 ? `, ${skippedCount} skipped` : ''} out of ${totalEntries} total entries.`;
  } else if (skippedCount > 0) {
    // Blue info / skipped banner
    bannerBg = 'var(--color-info-bg)';
    bannerBorder = 'var(--color-info-border)';
    bannerColor = 'var(--color-blue-600)';
    bannerTitle = mode === 'copy' ? 'Batch Copy Completed with Skipped Rows' : 'Batch Creation Completed with Skipped Rows';
    bannerSummary = mode === 'copy'
      ? `Copied ${successCount} BOM(s); ${skippedCount} were skipped out of ${totalEntries} total entries.`
      : `Created ${successCount} BOM(s); ${skippedCount} were skipped out of ${totalEntries} total entries.`;
    bannerIcon = <Info size={24} style={{ color: 'var(--color-blue-600)', flexShrink: 0 }} />;
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
                borderRadius: 'var(--radius-sm)',
                borderLeft: severity === 'error' ? '3px solid var(--color-danger)' : 'none',
                backgroundColor:
                  severity === 'error'
                    ? 'var(--color-danger-bg)'
                    : severity === 'warning'
                    ? 'var(--color-warning-bg)'
                    : severity === 'skipped'
                    ? 'var(--color-blue-50)'
                    : 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 12,
                lineHeight: 1.45
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}>
                {severity === 'error' ? (
                  <AlertCircle size={13} style={{ color: 'var(--color-danger)' }} />
                ) : severity === 'warning' ? (
                  <AlertTriangle size={13} style={{ color: 'var(--color-warning)' }} />
                ) : severity === 'skipped' ? (
                  <MinusCircle size={13} style={{ color: 'var(--color-blue-700)' }} />
                ) : normStatus === 'CREATED' || normStatus === 'COPIED' || normStatus === 'SUCCESS' ? (
                  <CheckCircle2 size={13} style={{ color: 'var(--color-success)' }} />
                ) : (
                  <Info size={13} style={{ color: 'var(--color-text-muted)' }} />
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
                      ? 'var(--color-danger)'
                      : severity === 'warning'
                      ? 'var(--color-text)'
                      : severity === 'skipped'
                      ? 'var(--color-blue-700)'
                      : 'var(--color-text-secondary)'
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
              color: 'var(--color-primary, var(--color-blue-600, var(--color-blue-600)))',
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
              fontFamily: 'var(--font-mono)',
              color: 'var(--color-blue-700)'
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
        gap: 'var(--space-24)',
        paddingBottom: 'var(--space-24)'
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
          borderRadius: 'var(--radius-lg)',
          background: bannerBg,
          border: `1px solid ${bannerBorder}`,
          color: bannerColor,
          boxSizing: 'border-box'
        }}
      >
        {bannerIcon}
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'inherit' }}>{bannerTitle}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text)' }}>
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
          gap: 'var(--space-16)'
        }}
      >
        <div className="sap-card rx-stat-card" data-testid="stat-card-success" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>
            {mode === 'copy' ? 'Copied' : 'BOMs Created'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sap-success)' }}>
            {successCount}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-components" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>
            Total Components
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-blue-600)' }}>
            {totalComponents}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-skipped" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>
            Skipped
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
            {skippedCount}
          </div>
        </div>

        <div className="sap-card rx-stat-card" data-testid="stat-card-failed" style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>
            Failed
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-danger)' }}>
            {failedCount}
          </div>
        </div>
      </div>

      {/* 3. Execution Details Card */}
      <FormSection
        title={`Execution Details (${displayRows.length})`}
        tintedHeader
        actions={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {failedCount > 0 && onRetryFailedRows && (
              <button
                type="button"
                className="sap-button sap-btn sap-btn-secondary"
                onClick={onRetryFailedRows}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  height: 32,
                  padding: '0 12px',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-navy-900)',
                  border: '1px solid var(--color-blue-400)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'none'
                }}
              >
                <RefreshCw size={16} style={{ display: 'block', lineHeight: 1 }} />
                <span>Retry Failed Rows ({failedCount})</span>
              </button>
            )}
            {onExportResults && (
              <button
                type="button"
                className="sap-button sap-btn sap-btn-secondary"
                onClick={onExportResults}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  height: 32,
                  padding: '0 12px',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-navy-900)',
                  border: '1px solid var(--color-blue-400)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'none'
                }}
              >
                <Download size={16} style={{ display: 'block', lineHeight: 1 }} />
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
                  <col style={{ width: 'var(--table-col-status-min-width)', minWidth: 140 }} />
                  <col style={{ width: 'auto' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>#</th>
                    <th style={{ width: 220 }}>Source BOM</th>
                    <th style={{ width: 220 }}>Target BOM</th>
                    <th style={{ width: 65, textAlign: 'center' }}>Items</th>
                    <th className="col-status" style={{ width: 'var(--table-col-status-min-width)', minWidth: 140, textAlign: 'center' }}>Status</th>
                    <th style={{ width: 'auto' }}>Message / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const rowKey = String(row.id || row.sequenceNum || idx);
                    const normStatus = normalizeExecutionStatus(row);

                    return (
                      <tr key={rowKey} data-testid={`execution-row-${idx}`}>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)', verticalAlign: 'top', paddingTop: 10, fontWeight: 600, fontSize: 11 }}>
                          {idx + 1}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                          <div className="bom-identity-cell" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="mat-pill font-semibold" style={{ wordBreak: 'break-all' }}>{row.sourceMaterial}</span>
                            <span className="sub-detail" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                              Plant: <strong>{row.sourcePlant}</strong> | Use: {row.sourceUsage} | Alt: <strong>{row.sourceAltBom}</strong>
                            </span>
                          </div>
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                          <div className="bom-identity-cell" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="mat-pill font-semibold" style={{ wordBreak: 'break-all' }}>{row.targetMaterial}</span>
                            <span className="sub-detail" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                              Plant: <strong>{row.targetPlant}</strong> | Use: {row.targetUsage} | Alt: <strong style={{ color: 'var(--color-blue-600)' }}>{row.targetAltBom}</strong>
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
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--color-blue-50)',
                                color: 'var(--color-blue-700)',
                                fontSize: 11,
                                fontWeight: 600
                              }}
                            >
                              {row.componentCount}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>-</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }} className="col-status">
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
                  <col style={{ width: 'var(--table-col-status-min-width)', minWidth: 140 }} />
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
                    <th className="col-status" style={{ width: 'var(--table-col-status-min-width)', minWidth: 140, textAlign: 'center' }}>Status</th>
                    <th style={{ width: 'auto' }}>Message / Details</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => {
                    const rowKey = String(row.sequenceNum || row.id || idx);
                    const normStatus = normalizeExecutionStatus(row);

                    return (
                      <tr key={rowKey} data-testid={`execution-row-${idx}`}>
                        <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)', verticalAlign: 'top', paddingTop: 10 }}>
                          {row.sequenceNum || idx + 1}
                        </td>
                        <td style={{ fontWeight: 600, verticalAlign: 'top', paddingTop: 10, wordBreak: 'break-all' }}>
                          {row.material}
                        </td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10 }}>{row.plant}</td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>{row.bomUsage}</td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>{row.alternativeBom}</td>
                        <td style={{ verticalAlign: 'top', paddingTop: 10, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          {row.bomNumber || '-'}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }} className="col-status">
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
          gap: 'var(--space-12)'
        }}
      >
        <button
          type="button"
          className="sap-button primary"
          onClick={onBack}
          style={{
            height: 'var(--size-button-height)',
            padding: '0 20px',
            fontSize: 'var(--font-size-13)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          Return to Launchpad
        </button>
        <button
          type="button"
          className="sap-button"
          onClick={onReset}
          style={{
            height: 'var(--size-button-height)',
            padding: '0 20px',
            fontSize: 'var(--font-size-13)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          Upload Another File
        </button>
      </div>
    </div>
  );
}

export default BulkExecutionResultsView;
