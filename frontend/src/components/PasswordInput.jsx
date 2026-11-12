import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Shared accessible PasswordInput component with an integrated Eye / Eye-off visibility toggle.
 *
 * Requirements:
 * 1. Self-contained masked/revealed toggle button inside the field at the right.
 * 2. Always visible (focused or unfocused), Tab-focusable, Enter/Space toggles.
 * 3. aria-label="Show password" / "Hide password" and aria-pressed.
 * 4. type="button" prevents accidental form submission.
 * 5. onMouseDown preventDefault prevents blurring the input when clicked with mouse.
 * 6. Keeps focus and cursor inside the input field.
 * 7. Browser native reveal/clear buttons hidden via CSS.
 */
const PasswordInput = forwardRef(function PasswordInput(
  {
    id,
    name,
    value = '',
    onChange,
    placeholder = 'Enter password',
    disabled = false,
    required = false,
    autoComplete = 'current-password',
    autoFocus = false,
    minLength,
    maxLength,
    className = 'sap-input',
    style = {},
    inputStyle = {},
    containerStyle = {},
    leftIcon = null,
    size = 16,
    onBlur,
    onFocus,
    onKeyDown,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref
) {
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => inputRef.current);

  const handleToggle = (e) => {
    e.preventDefault();
    const wasFocused = document.activeElement === inputRef.current;
    const start = inputRef.current?.selectionStart;
    const end = inputRef.current?.selectionEnd;

    setShowPassword((prev) => !prev);

    if (wasFocused && inputRef.current) {
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          if (start !== null && end !== null && typeof inputRef.current.setSelectionRange === 'function') {
            try {
              inputRef.current.setSelectionRange(start, end);
            } catch (_) {}
          }
        }
      });
    }
  };

  return (
    <div
      className="sap-password-input-wrapper"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '100%',
        boxSizing: 'border-box',
        ...containerStyle
      }}
    >
      {leftIcon && (
        <span
          className="sap-password-left-icon"
          style={{
            position: 'absolute',
            left: 12,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--color-text-muted, #7A8CA3)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2
          }}
        >
          {leftIcon}
        </span>
      )}

      <input
        ref={inputRef}
        id={id}
        name={name}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        minLength={minLength}
        maxLength={maxLength}
        onBlur={onBlur}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={`${className || 'sap-input'} ${leftIcon ? 'sap-input-with-icon' : ''}`.trim()}
        style={{
          width: '100%',
          height: style.height || inputStyle.height || 'var(--size-form-input-height, 36px)',
          paddingLeft: leftIcon ? 40 : 10,
          paddingRight: 40,
          boxSizing: 'border-box',
          ...style,
          ...inputStyle
        }}
        {...rest}
      />

      <button
        type="button"
        className="sap-password-toggle-btn"
        onClick={handleToggle}
        onMouseDown={(e) => {
          // Prevent the click from stealing focus from the input
          e.preventDefault();
        }}
        disabled={disabled}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        tabIndex={disabled ? -1 : 0}
        title={showPassword ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 26,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: 2,
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--sap-text-secondary)',
          zIndex: 2
        }}
      >
        {showPassword ? <EyeOff size={size} /> : <Eye size={size} />}
      </button>
    </div>
  );
});

export default PasswordInput;
