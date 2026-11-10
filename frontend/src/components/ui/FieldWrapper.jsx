import React from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Enterprise Field Wrapper component
 * Renders consistent label above field (13px semibold, 6px gap), required asterisk,
 * hint text below (muted 12px), and error/warning alerts with icons.
 */
export function FieldWrapper({
  label,
  htmlFor,
  required = false,
  hint = null,
  error = null,
  warning = null,
  children,
  className = ''
}) {
  return (
    <div className={cn('rx-field-wrapper flex flex-col gap-1.5 w-full', className)}>
      {label && (
        <label htmlFor={htmlFor} className="rx-field-label text-[13px] font-semibold text-[var(--color-navy-900)] flex items-center gap-1">
          <span>{label}</span>
          {required && <span className="rx-field-required text-[var(--color-danger)] font-bold" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {hint && !error && !warning && (
        <div className="rx-field-hint text-xs text-[var(--color-text-secondary)] mt-0.5">{hint}</div>
      )}
      {warning && !error && (
        <div className="rx-field-warning text-xs text-[var(--color-warning)] flex items-center gap-1 mt-0.5" role="status">
          <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span>{warning}</span>
        </div>
      )}
      {error && (
        <div className="rx-field-error text-xs text-[var(--color-danger)] flex items-center gap-1 mt-0.5" role="alert">
          <AlertCircle size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export default FieldWrapper;
