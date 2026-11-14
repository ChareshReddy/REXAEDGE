import React, { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, RefreshCw, X, AlertCircle } from 'lucide-react';

/**
 * Enterprise Two-Column Bulk Upload Card
 * - Left (2/3): Dashed drop zone (2px dashed blue-200, blue-50 bg, radius-lg 12px, min-height 260px)
 *   States: hover, drag-over (blue-600 border, blue-100 bg), file selected (name, size, remove), error.
 * - Right (1/3): "Before you upload" panel with Download template button, required columns,
 *   supported file formats, real row limits, and tips. Collapses below 1024px.
 * - Bottom action row: "Continue" primary button (disabled until valid file selected).
 */
export default function BulkUploadCard({
  acceptedFormats = '.xlsx,.xls,.tsv,.txt',
  supportedFormatsText = 'Supports Excel (.xlsx, .xls) and tab-delimited files',
  fileName = '',
  file = null,
  onFile,
  onClearFile,
  onDownloadTemplate,
  templateButtonText = 'Download template',
  columns = [],
  rowLimitText = '',
  tipText = '',
  error = null,
  isLocked = false,
  onContinue,
  continueButtonText = 'Continue',
  className = '',
  style = {}
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (isLocked) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (isLocked) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (isLocked) return;
    setIsDragging(false);
    if (e.dataTransfer?.files?.[0]) {
      if (onFile) onFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e) => {
    if (isLocked) return;
    if (e.target.files?.[0]) {
      if (onFile) onFile(e.target.files[0]);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (onClearFile) onClearFile();
  };

  const formatFileSize = (bytes) => {
    if (!bytes || typeof bytes !== 'number') return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const activeFileName = file?.name || fileName;
  const activeFileSize = file?.size ? formatFileSize(file.size) : '';
  const hasFile = Boolean(activeFileName);

  return (
    <div
      className={`rx-bulk-upload-card ${className}`.trim()}
      style={{
        width: '100%',
        backgroundColor: 'var(--color-surface, #FFFFFF)',
        border: '1px solid var(--color-border, #D9E2EC)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: 24,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        ...style
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        disabled={isLocked}
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {/* 2-Column Responsive Body */}
      <div
        className="rx-bulk-upload-columns"
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 24,
          width: '100%',
          alignItems: 'stretch'
        }}
      >
        {/* Left Column (2/3): Dashed Drop Zone */}
        <div
          className={`rx-bulk-dropzone ${isDragging ? 'is-dragging' : ''} ${hasFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={isLocked ? undefined : () => fileInputRef.current?.click()}
          style={{
            flex: '2 1 480px',
            minHeight: 260,
            border: isDragging
              ? '2px dashed var(--color-blue-600, #02579A)'
              : error
              ? '2px dashed var(--color-danger, #B42318)'
              : '2px dashed var(--color-blue-200, #B3CDE0)',
            backgroundColor: isDragging
              ? 'var(--color-blue-100, #DCE8F1)'
              : 'var(--color-blue-50, #EEF4F9)',
            borderRadius: 'var(--radius-lg, 12px)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            textAlign: 'center',
            cursor: isLocked ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast, 150ms ease)',
            opacity: isLocked ? 0.6 : 1
          }}
        >
          {hasFile ? (
            /* State: File Selected */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                maxWidth: 420
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-blue-200, #B3CDE0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-blue-600, #02579A)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <FileSpreadsheet size={24} />
              </div>

              <div>
                <div
                  style={{
                    fontSize: 'var(--font-size-15, 15px)',
                    fontWeight: 600,
                    color: 'var(--color-navy-900, #00204E)',
                    wordBreak: 'break-all'
                  }}
                >
                  {activeFileName}
                </div>
                {activeFileSize && (
                  <div
                    style={{
                      fontSize: 'var(--font-size-12, 12px)',
                      color: 'var(--color-text-secondary, #4A5F77)',
                      marginTop: 2
                    }}
                  >
                    {activeFileSize}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="rx-btn rx-btn-secondary rx-btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLocked}
                  style={{
                    height: 'var(--size-button-sm-height, 32px)',
                    padding: '0 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--font-size-13, 13px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Change file</span>
                </button>
                <button
                  type="button"
                  className="rx-btn rx-btn-secondary rx-btn-sm"
                  onClick={handleClear}
                  disabled={isLocked}
                  style={{
                    height: 'var(--size-button-sm-height, 32px)',
                    padding: '0 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--font-size-13, 13px)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <X size={13} />
                  <span>Remove</span>
                </button>
              </div>
            </div>
          ) : (
            /* State: Default / Dropzone */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                maxWidth: 420
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-blue-200, #B3CDE0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-blue-600, #02579A)',
                  boxShadow: 'var(--shadow-sm)',
                  marginBottom: 14
                }}
              >
                <Upload size={24} />
              </div>

              <div
                style={{
                  fontSize: 'var(--font-size-15, 15px)',
                  fontWeight: 600,
                  color: 'var(--color-navy-900, #00204E)',
                  marginBottom: 6
                }}
              >
                Drag and drop your file here, or browse
              </div>

              <div
                style={{
                  fontSize: 'var(--font-size-12, 12px)',
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 16
                }}
              >
                {supportedFormatsText}
              </div>

              <button
                type="button"
                className="rx-btn rx-btn-secondary rx-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={isLocked}
                style={{
                  height: 'var(--size-button-sm-height, 32px)',
                  padding: '0 16px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 'var(--font-size-13, 13px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Upload size={16} style={{ display: 'block', lineHeight: 1 }} />
                <span>Browse files</span>
              </button>
            </div>
          )}

          {/* Inline Error display if parse error occurs */}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '8px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                backgroundColor: 'var(--color-danger-bg, #FEF3F2)',
                border: '1px solid var(--color-danger-border, #FECDCA)',
                color: 'var(--color-danger, #B42318)',
                fontSize: 'var(--font-size-12, 12px)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: '90%'
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Right Column (1/3): Before You Upload Panel */}
        <aside
          className="rx-bulk-info-panel"
          style={{
            flex: '1 1 280px',
            backgroundColor: 'var(--color-surface-subtle, #F8FAFC)',
            border: '1px solid var(--color-border, #D9E2EC)',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 20,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-14, 14px)',
              fontWeight: 600,
              color: 'var(--color-navy-900, #00204E)'
            }}
          >
            Before you upload
          </div>

          {/* Download Template Button */}
          {onDownloadTemplate && (
            <button
              type="button"
              className="rx-btn rx-btn-secondary rx-btn-sm"
              onClick={onDownloadTemplate}
              disabled={isLocked}
              style={{
                height: 'var(--size-button-sm-height, 32px)',
                padding: '0 14px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--font-size-13, 13px)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%'
              }}
            >
              <Download size={16} style={{ display: 'block', lineHeight: 1 }} />
              <span>{templateButtonText}</span>
            </button>
          )}

          {/* Required Columns Guide */}
          {columns.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 'var(--font-size-12, 12px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 8
                }}
              >
                Required columns (* required):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {columns.map((col, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full, 9999px)',
                      backgroundColor: col.required
                        ? 'var(--color-blue-50, #EEF4F9)'
                        : 'var(--color-surface, #FFFFFF)',
                      color: col.required
                        ? 'var(--color-blue-600, #02579A)'
                        : 'var(--color-text-secondary, #4A5F77)',
                      border: col.required
                        ? '1px solid var(--color-blue-200, #B3CDE0)'
                        : '1px solid var(--color-border, #D9E2EC)',
                      fontWeight: col.required ? 600 : 400
                    }}
                  >
                    {col.required && (
                      <span style={{ color: 'var(--color-danger, #B42318)', fontWeight: 700 }}>*</span>
                    )}
                    <span>{col.label}</span>
                    {col.default && (
                      <span style={{ color: 'var(--color-text-muted, #7A8CA3)', fontSize: '10px' }}>
                        ({col.default})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Real Row Limits from Code */}
          {rowLimitText && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle, #E2E8F0)', paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-12, 12px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 4
                }}
              >
                Batch limit:
              </div>
              <div style={{ fontSize: 'var(--font-size-12, 12px)', color: 'var(--color-text, #0F2742)', lineHeight: 1.4 }}>
                {rowLimitText}
              </div>
            </div>
          )}

          {/* Short Tip */}
          {tipText && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle, #E2E8F0)', paddingTop: 12 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-12, 12px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 4
                }}
              >
                Helpful tip:
              </div>
              <div style={{ fontSize: 'var(--font-size-12, 12px)', color: 'var(--color-text-secondary, #4A5F77)', lineHeight: 1.4 }}>
                {tipText}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Primary Action Row at Bottom */}
      <div
        className="rx-bulk-upload-actions"
        style={{
          borderTop: '1px solid var(--color-border, #D9E2EC)',
          paddingTop: 16,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          width: '100%'
        }}
      >
        <button
          type="button"
          className="rx-btn rx-btn-primary"
          onClick={onContinue}
          disabled={!hasFile || isLocked}
          style={{
            height: 'var(--size-button-height, 40px)',
            padding: '0 24px',
            borderRadius: 'var(--radius-md, 8px)',
            fontWeight: 600,
            fontSize: 'var(--font-size-14, 14px)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <span>{continueButtonText}</span>
        </button>
      </div>
    </div>
  );
}
