import React, { useState, useRef } from 'react';
import { Upload, Download, Loader2, RefreshCw, XCircle } from 'lucide-react';

/**
 * Shared presentational component for Bulk Upload screens (Bulk Create BOM, Bulk Copy BOM).
 * Contains no business logic: purely manages presentation, drag-and-drop hover state,
 * and delegates file selection, template downloads, and clearing to caller callbacks.
 */
export default function BulkUploadPanel({
  title = 'Upload Spreadsheet',
  helperText,
  acceptedFormats = '.xlsx,.xls,.tsv,.txt',
  supportedFormatsText,
  fileName = '',
  onFile,
  loading = false,
  loadingText = 'Validating data with SAP master records...',
  disabled = false,
  templateAction,
  onDownloadTemplate,
  templateButtonText = 'Download Template',
  onClear,
  clearHandler,
  onClearFile,
  error,
  parseError,
  inputRef,
  columns = [],
  children,
  className = '',
  containerStyle = {},
  style = {}
}) {
  const [isDragging, setIsDragging] = useState(false);
  const localInputRef = useRef(null);
  const fileInputRef = inputRef || localInputRef;

  const activeError = error || parseError;
  const activeClear = onClear || clearHandler || onClearFile;

  const resolvedTemplateAction =
    templateAction ||
    (onDownloadTemplate
      ? {
          label: templateButtonText,
          onClick: onDownloadTemplate,
          disabled
        }
      : null);

  const handleDragOver = (e) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (onFile) {
        onFile(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFileInputChange = (e) => {
    if (disabled) return;
    if (e.target.files && e.target.files.length > 0) {
      if (onFile) {
        onFile(e.target.files[0]);
      }
    }
  };

  const handleClearClick = (e) => {
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (activeClear) {
      activeClear();
    }
  };

  const isTemplateDisabled =
    disabled || (resolvedTemplateAction && typeof resolvedTemplateAction === 'object' && resolvedTemplateAction.disabled);

  const handleTemplateClick = (e) => {
    e.stopPropagation();
    if (isTemplateDisabled) return;
    if (typeof resolvedTemplateAction === 'function') {
      resolvedTemplateAction(e);
    } else if (resolvedTemplateAction && typeof resolvedTemplateAction.onClick === 'function') {
      resolvedTemplateAction.onClick(e);
    }
  };

  const templateLabel =
    (resolvedTemplateAction && typeof resolvedTemplateAction === 'object' && resolvedTemplateAction.label) ||
    templateButtonText ||
    'Download Template';

  return (
    <div
      className={`bulk-upload-panel ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 750,
        margin: '0 auto',
        width: '100%',
        ...containerStyle,
        ...style
      }}
    >
      {/* Upload Header: Title, Subtitle, and Right-Aligned Download Template Button */}
      {(title || helperText || resolvedTemplateAction) && (
        <div
          className="bulk-upload-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ flex: '1 1 260px', minWidth: 240 }}>
            {title && (
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                {title}
              </h3>
            )}
            {helperText && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-muted)', lineHeight: 1.4 }}>
                {helperText}
              </p>
            )}
          </div>

          {resolvedTemplateAction && (
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              disabled={isTemplateDisabled}
              onClick={isTemplateDisabled ? undefined : handleTemplateClick}
              title={templateLabel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                fontWeight: 600,
                padding: '7px 14px',
                flexShrink: 0
              }}
            >
              <Download size={14} />
              <span>{templateLabel}</span>
            </button>
          )}
        </div>
      )}

      {/* Drop Zone */}
      <div
        className={`sap-card bulk-upload-dropzone ${isDragging && !disabled ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={disabled ? undefined : () => fileInputRef.current?.click()}
        style={{
          border: isDragging && !disabled ? '2px dashed var(--sap-primary)' : '2px dashed var(--sap-border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '40px 20px',
          textAlign: 'center',
          background: isDragging && !disabled ? 'var(--sap-surface-subtle)' : 'var(--sap-card-bg)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.7 : 1,
          transition: 'border-color 0.15s ease, background-color 0.15s ease'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={acceptedFormats}
          disabled={disabled}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
        />

        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 'var(--radius-full)',
            background: 'var(--sap-surface-empty)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--sap-primary)'
          }}
        >
          <Upload size={26} />
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--sap-text-dark)', marginBottom: 6 }}>
          {fileName ? fileName : 'Click to browse or drag and drop your file here'}
        </div>

        <div style={{ fontSize: 12, color: 'var(--sap-text-muted)' }}>
          {supportedFormatsText ||
            (acceptedFormats
              ? `Supports ${acceptedFormats}`
              : 'Supports tab-separated text saved as .XLS, or Excel .xlsx / .xls')}
        </div>

        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 16,
              color: 'var(--sap-primary)',
              fontSize: 13
            }}
          >
            <Loader2 size={16} className="sap-spin" />
            <span>{loadingText}</span>
          </div>
        )}

        {fileName && activeClear && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              disabled={disabled || loading}
              onClick={handleClearClick}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                padding: '6px 14px'
              }}
            >
              <RefreshCw size={13} />
              <span>Clear & Upload Another</span>
            </button>
          </div>
        )}
      </div>

      {/* Parse / Validation Error Alert */}
      {activeError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--sap-error-bg)',
            border: '1px solid var(--sap-error-border)',
            color: 'var(--sap-error)',
            fontSize: 13
          }}
        >
          <XCircle size={18} style={{ flexShrink: 0 }} />
          <span>{activeError}</span>
        </div>
      )}



      {children}
    </div>
  );
}
