import React, { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import './ui.css';

/**
 * Enterprise ValueHelpInput component with embedded F4 trigger button inside the field
 * Focus ring wraps the whole field container.
 * Form height: 40px, Table height: 32px.
 * F4 button: 28px inside forms, 24px in tables, separated by a 1px vertical divider.
 */
export const ValueHelpInput = forwardRef(function ValueHelpInput(
  {
    value = '',
    onChange,
    onOpenValueHelp,
    placeholder = '',
    disabled = false,
    readOnly = false,
    hasError = false,
    hasWarning = false,
    isTable = false,
    isMono = true,
    isUppercase = false,
    buttonTitle = 'Open value help (F4)',
    className = '',
    containerClassName = '',
    ...props
  },
  ref
) {
  const isInactive = disabled || readOnly;

  return (
    <div
      className={cn(
        'rx-value-help-container flex items-center w-full transition-colors',
        isTable && 'rx-value-help-table',
        hasError && 'rx-value-help-error',
        hasWarning && 'rx-value-help-warning',
        isInactive && 'rx-disabled',
        containerClassName
      )}
    >
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          'rx-value-help-input flex-1 min-w-0 bg-transparent outline-none border-none shadow-none',
          isMono && 'rx-input-mono font-mono',
          isUppercase && 'rx-input-uppercase uppercase',
          className
        )}
        {...props}
      />
      <div className="rx-value-help-divider" aria-hidden="true" />
      <button
        type="button"
        onClick={onOpenValueHelp}
        disabled={isInactive}
        title={buttonTitle}
        aria-label={buttonTitle}
        tabIndex={isInactive ? -1 : 0}
        className={cn(
          'rx-value-help-btn shrink-0 inline-flex items-center justify-center transition-colors',
          isTable && 'rx-value-help-table'
        )}
      >
        <Search size={isTable ? 13 : 15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
});

export default ValueHelpInput;
