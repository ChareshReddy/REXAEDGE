import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { changeUserPassword } from '../services/api';

export default function ForcePasswordChange({ user, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    if (!currentPassword) {
      return 'Please enter your current temporary password.';
    }
    if (!newPassword) {
      return 'Please enter a new password.';
    }
    if (newPassword.length < 12) {
      return 'New password must be at least 12 characters long.';
    }
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasDigit = /[0-9]/.test(newPassword);
    if (!hasLetter || !hasDigit) {
      return 'New password must contain at least one letter and one number.';
    }
    if (newPassword === currentPassword) {
      return 'New password must be different from your current temporary password.';
    }
    if (newPassword !== confirmPassword) {
      return 'New password and confirmation do not match.';
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsLoading(true);
    try {
      const result = await changeUserPassword(currentPassword, newPassword, confirmPassword);
      if (result?.success || result?.message) {
        window.scrollTo(0, 0);
        if (typeof onSuccess === 'function') {
          onSuccess({ must_change_password: false });
        }
      } else {
        setError(result?.error || 'Failed to update password. Please check your credentials.');
      }
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to update password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="rx-force-password-viewport"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--color-surface-subtle, #F7FAFC)',
        padding: 'var(--spacing-md, 16px)'
      }}
    >
      <div
        className="rx-force-password-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: 'var(--color-surface, #FFFFFF)',
          borderRadius: 'var(--radius-lg, 8px)',
          border: '1px solid var(--color-border, #E2E8F0)',
          boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0, 32, 78, 0.08))',
          padding: 'var(--spacing-xl, 32px)'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-lg, 24px)' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-blue-100, #DCE8F1)',
              color: 'var(--color-navy-900, #00204E)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--spacing-md, 16px)'
            }}
          >
            <Lock size={24} />
          </div>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--color-text, #0F172A)',
              margin: '0 0 var(--spacing-xs, 4px) 0'
            }}
          >
            Set a New Password
          </h1>
          <p
            style={{
              fontSize: '13px',
              color: 'var(--color-text-muted, #64748B)',
              margin: 0,
              lineHeight: 1.5
            }}
          >
            Your account requires a new password before you can continue to RexaEdge.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              backgroundColor: 'var(--color-danger-bg, #FEF2F2)',
              border: '1px solid var(--color-danger-border, #FCA5A5)',
              borderRadius: 'var(--radius-md, 6px)',
              padding: '10px 12px',
              marginBottom: 'var(--spacing-md, 16px)',
              color: 'var(--color-danger, #B42318)',
              fontSize: '13px',
              lineHeight: 1.4
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Current Temporary Password */}
          <div style={{ marginBottom: 'var(--spacing-md, 16px)' }}>
            <label
              htmlFor="force-current-password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text, #0F172A)',
                marginBottom: '6px'
              }}
            >
              Current (Temporary) Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="force-current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter temporary password"
                required
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  color: 'var(--color-text, #0F172A)',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted, #64748B)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div style={{ marginBottom: 'var(--spacing-md, 16px)' }}>
            <label
              htmlFor="force-new-password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text, #0F172A)',
                marginBottom: '6px'
              }}
            >
              New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="force-new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                required
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  color: 'var(--color-text, #0F172A)',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted, #64748B)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-muted, #64748B)',
                marginTop: '4px',
                lineHeight: 1.3
              }}
            >
              Must be at least 12 characters with at least one letter and one number.
            </div>
          </div>

          {/* Confirm New Password */}
          <div style={{ marginBottom: 'var(--spacing-lg, 24px)' }}>
            <label
              htmlFor="force-confirm-password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text, #0F172A)',
                marginBottom: '6px'
              }}
            >
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="force-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  color: 'var(--color-text, #0F172A)',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted, #64748B)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: 600,
              backgroundColor: 'var(--color-navy-900, #00204E)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 'var(--radius-md, 6px)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              transition: 'background-color 0.15s ease'
            }}
          >
            {isLoading ? 'Setting password...' : 'Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
