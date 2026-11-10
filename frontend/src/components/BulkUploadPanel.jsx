import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { Upload, Download, Loader2, RefreshCw, X, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { FormSection } from './ui/form-layout';

/**
 * Shared Enterprise 2-Column Bulk Upload Panel
 * - Left (2/3): Dashed drop zone (2px dashed blue-200, blue-50 bg, radius 12, min-height 260px)
 *   States: hover, drag-over (blue-600 border, blue-100 bg), file selected (file name, size, remove), error.
 * - Right (1/3): "Before you upload" panel (Download template button, required columns,
 *   supported file formats, real row limits, and tips). Collapses below 1024px.
 * - Primary action row at bottom: "Continue" (disabled until valid file chosen).
 */
export default function BulkUploadPanel({
  title = 'Upload Spreadsheet',
  helperText,
  acceptedFormats = '.xlsx,.xls,.tsv,.txt',
  supportedFormatsText,
  fileName = '',
  file = null,
  onFile,
  loading = false,
  loadingText = 'Validating data with SAP master records...',
  disabled = false,
  templateAction,
  onDownloadTemplate,
  templateButtonText = 'Download template',
  onClear,
  clearHandler,
  onClearFile,
  error,
  parseError,
  inputRef,
  columns = [],
  rowLimitText,
  tipText,
  onContinue,
  continueButtonText = 'Continue',
  children,
  className = '',
  containerStyle = {},
  style = {}
}) {
  const toast = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const localInputRef = useRef(null);
  const fileInputRef = inputRef || localInputRef;

  const activeError = error || parseError;
  useEffect(() => {
    if (activeError) {
      toast.error(activeError);
    }
  }, [activeError, toast]);
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
    if (disabled || loading) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (disabled || loading) return;
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (disabled || loading) return;
    setIsDragging(false);
    if (e.dataTransfer?.files?.[0]) {
      if (onFile) onFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e) => {
    if (disabled || loading) return;
    if (e.target.files?.[0]) {
      if (onFile) onFile(e.target.files[0]);
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
    disabled ||
    loading ||
    (resolvedTemplateAction && typeof resolvedTemplateAction === 'object' && resolvedTemplateAction.disabled);

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
    'Download template';

  const formatFileSize = (bytes) => {
    if (!bytes || typeof bytes !== 'number') return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const activeFileName = file?.name || fileName;
  const activeFileSize = file?.size ? formatFileSize(file.size) : '';
  const hasFile = Boolean(activeFileName);

  const resolvedFormatsHelp =
    supportedFormatsText ||
    (acceptedFormats
      ? `Accepted formats: ${acceptedFormats.split(',').map((f) => f.trim()).join(', ')}`
      : 'Accepted formats: .xlsx, .xls, .tsv, .txt');

  return (
    <FormSection
      title={title}
      description={helperText}
      tintedHeader
      className={`rx-bulk-upload-card bulk-upload-panel w-full ${className}`.trim()}
      bodyClassName="rx-bulk-upload-panel-body"
      style={{
        margin: '0 auto',
        ...containerStyle,
        ...style
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats}
        disabled={disabled || loading}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* 2-Column Responsive Body */}
      <div
        className="rx-bulk-upload-columns"
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 16,
          width: '100%',
          alignItems: 'stretch'
        }}
      >
        {/* Left Column (2/3): Dashed Drop Zone */}
        <div
          className={`rx-bulk-dropzone bulk-upload-dropzone ${isDragging ? 'drag-over is-dragging' : ''} ${hasFile ? 'has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={disabled || loading ? undefined : () => fileInputRef.current?.click()}
          style={{
            flex: '2 1 440px',
            minHeight: 160,
            border: isDragging
              ? '2px dashed var(--color-blue-600, #02579A)'
              : activeError
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
            padding: '18px 20px',
            textAlign: 'center',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast, 150ms ease)',
            opacity: disabled ? 0.6 : 1
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                color: 'var(--color-blue-600, #02579A)'
              }}
            >
              <Loader2 size={32} className="sap-spin" />
              <span style={{ fontSize: 'var(--font-size-14, 14px)', fontWeight: 600 }}>{loadingText}</span>
            </div>
          ) : hasFile ? (
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
                  disabled={disabled || loading}
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
                {activeClear && (
                  <button
                    type="button"
                    className="rx-btn rx-btn-secondary rx-btn-sm"
                    onClick={handleClearClick}
                    disabled={disabled || loading}
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
                )}
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
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius-full, 9999px)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  border: '1px solid var(--color-blue-200, #B3CDE0)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-blue-600, #02579A)',
                  boxShadow: 'var(--shadow-sm)',
                  marginBottom: 8
                }}
              >
                <Upload size={20} />
              </div>

              <div
                style={{
                  fontSize: 'var(--font-size-14, 14px)',
                  fontWeight: 600,
                  color: 'var(--color-navy-900, #00204E)',
                  marginBottom: 4
                }}
              >
                Drag and drop your file here, or browse
              </div>

              <div
                style={{
                  fontSize: 'var(--font-size-12, 12px)',
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 10
                }}
              >
                {resolvedFormatsHelp}
              </div>

              <button
                type="button"
                className="rx-btn rx-btn-secondary rx-btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                disabled={disabled || loading}
                style={{
                  height: 'var(--size-button-sm-height, 32px)',
                  padding: '0 16px',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 'var(--font-size-13, 13px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Upload size={14} />
                <span>Browse files</span>
              </button>
            </div>
          )}

          {/* Inline Error display if error occurs */}
          {activeError && (
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
              <span>{activeError}</span>
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
            padding: '12px 14px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
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
          {resolvedTemplateAction && (
            <button
              type="button"
              className="rx-btn rx-btn-secondary rx-btn-sm"
              onClick={handleTemplateClick}
              disabled={isTemplateDisabled}
              style={{
                height: 'var(--size-button-sm-height, 30px)',
                padding: '0 12px',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--font-size-12, 12px)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%'
              }}
            >
              <Download size={13} />
              <span>{templateLabel}</span>
            </button>
          )}

          {/* Required Columns Guide */}
          {columns.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: 'var(--font-size-11, 11px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 4
                }}
              >
                Required columns (* required):
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {columns.map((col, idx) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: '10.5px',
                      padding: '2px 6px',
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
                      <span style={{ color: 'var(--color-text-muted, #7A8CA3)', fontSize: '9.5px' }}>
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
            <div style={{ borderTop: '1px solid var(--color-border-subtle, #E2E8F0)', paddingTop: 8 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-11, 11px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 2
                }}
              >
                Batch limit:
              </div>
              <div style={{ fontSize: 'var(--font-size-11, 11px)', color: 'var(--color-text, #0F2742)', lineHeight: 1.3 }}>
                {rowLimitText}
              </div>
            </div>
          )}

          {/* Short Tip */}
          {tipText && (
            <div style={{ borderTop: '1px solid var(--color-border-subtle, #E2E8F0)', paddingTop: 8 }}>
              <div
                style={{
                  fontSize: 'var(--font-size-11, 11px)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary, #4A5F77)',
                  marginBottom: 2
                }}
              >
                Helpful tip:
              </div>
              <div style={{ fontSize: 'var(--font-size-11, 11px)', color: 'var(--color-text-secondary, #4A5F77)', lineHeight: 1.3 }}>
                {tipText}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Primary Action Row at Bottom */}
      {onContinue && (
        <div
          className="rx-bulk-upload-actions"
          style={{
            borderTop: '1px solid var(--color-border, #D9E2EC)',
            paddingTop: 12,
            marginTop: 4,
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
            disabled={!hasFile || disabled || loading}
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
      )}

      {children}
    </FormSection>
  );
}
