import React, { useState, useEffect } from 'react';
import { Key, Check, Loader2 } from 'lucide-react';
import Modal from './Modal';
import PasswordInput from './PasswordInput';
import Notification from './Notification';
import { FieldWrapper } from './ui/FieldWrapper';
import { checkPasswordRules } from '../utils/passwordPolicy';
import { adminSetUserPassword, changeUserPassword } from '../services/api';

/**
 * Shared Password Management Modal for both Admin (Set Password) and User (Change Password) flows.
 *
 * Rules:
 * 1. Full-bleed tinted header spanning full modal width with aligned Key icon badge.
 * 2. Title: "Set New Password", subtitle: "Account: <email>" on one line (truncated with tooltip).
 * 3. Consistent token-based field spacing (FieldWrapper, red star beside label, normal UI font).
 * 4. Live checklist of requirements (length, uppercase, lowercase, number). Updates as user types.
 * 5. Confirm password match state displayed under confirm field only after user types in it.
 * 6. Sticky footer: Cancel and Set Password right-aligned, disabled until valid, Enter to submit, Escape to close.
 * 7. Closes ONLY through explicit Cancel / close button or Escape; backdrop click does nothing.
 */
export default function PasswordModal({
  isOpen,
  onClose,
  mode = 'user', // 'admin' | 'user'
  targetUser = null, // { id, email } required when mode === 'admin'
  onSuccess = () => {}
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, _setErrorMessage] = useState('');
  const setErrorMessage = (msg) => {
    _setErrorMessage(msg || '');
  };

  // Clear fields whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setConfirmTouched(false);
      setErrorMessage('');
      setIsLoading(false);
    } else {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setConfirmTouched(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  // Evaluate password rules on newPassword
  const { results: ruleResults, allPassed: rulesPassed } = checkPasswordRules(newPassword);

  const passwordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);
  const isDifferentFromCurrent = mode === 'user' ? Boolean(newPassword && newPassword !== currentPassword) : true;
  const currentPasswordProvided = mode === 'user' ? Boolean(currentPassword.trim()) : true;

  const isFormValid = rulesPassed && passwordsMatch && isDifferentFromCurrent && currentPasswordProvided;

  // Confirm password mismatch error: only show after user has typed into confirm field
  const showMismatchError = Boolean(confirmTouched && confirmPassword && newPassword !== confirmPassword);
  const confirmError = showMismatchError ? 'Passwords do not match' : null;

  const handleClose = () => {
    if (isLoading) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setConfirmTouched(false);
    setErrorMessage('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || isLoading) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (mode === 'admin') {
        if (!targetUser?.id) {
          throw new Error('Target user is not specified.');
        }
        const res = await adminSetUserPassword(targetUser.id, newPassword, confirmPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setConfirmTouched(false);
        onSuccess(res.message || `Password updated successfully for ${targetUser.email}`);
        onClose();
      } else {
        const res = await changeUserPassword(currentPassword, newPassword, confirmPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setConfirmTouched(false);
        onSuccess(res.message || 'Password changed successfully.');
        onClose();
      }
    } catch (err) {
      const serverMsg = err.response?.data?.error || err.message || 'Failed to update password.';
      setErrorMessage(serverMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle = mode === 'admin' ? 'Set New Password' : 'Change Password';
  const modalSubtitle = mode === 'admin'
    ? `Account: ${targetUser?.email || 'selected user'}`
    : 'Update your account password with enterprise security requirements';

  const submitLabel = mode === 'admin' ? 'Set Password' : 'Change Password';
  const submittingLabel = mode === 'admin' ? 'Setting Password...' : 'Changing Password...';

  const footerContent = (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', width: '100%' }}>
      <button
        type="button"
        className="sap-button"
        onClick={handleClose}
        disabled={isLoading}
        style={{
          height: 32,
          padding: '0 16px',
          fontSize: 'var(--sap-size-button)',
          fontWeight: 500
        }}
      >
        Cancel
      </button>
      <button
        type="submit"
        form="password-modal-form"
        className="sap-button primary"
        disabled={!isFormValid || isLoading}
        style={{
          height: 32,
          padding: '0 18px',
          fontSize: 'var(--sap-size-button)',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        {isLoading ? (
          <>
            <Loader2 size={14} className="sap-spin" />
            <span>{submittingLabel}</span>
          </>
        ) : (
          <span>{submitLabel}</span>
        )}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={Key}
      iconColor="var(--color-blue-600, #02579A)"
      isLoading={isLoading}
      maxWidth={500}
      width="100%"
      closeOnEscape={true}
      footer={footerContent}
    >
      <form id="password-modal-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errorMessage && (
          <Notification
            placement="popup"
            type="error"
            message={errorMessage}
            onClose={() => setErrorMessage('')}
          />
        )}

        {/* User mode only: Current Password */}
        {mode === 'user' && (
          <FieldWrapper
            label="Current Password"
            htmlFor="sap-current-pwd"
            required
          >
            <PasswordInput
              id="sap-current-pwd"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
              required
              autoFocus
              leftIcon={<Key size={16} />}
              className="rx-input"
              style={{ height: 38, fontFamily: 'var(--font-sans)' }}
            />
          </FieldWrapper>
        )}

        {/* New Password */}
        <FieldWrapper
          label="New Password"
          htmlFor="sap-new-pwd"
          required
        >
          <PasswordInput
            id="sap-new-pwd"
            placeholder="Enter new password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isLoading}
            autoComplete="new-password"
            required
            autoFocus={mode === 'admin'}
            leftIcon={<Key size={16} />}
            className="rx-input"
            style={{ height: 38, fontFamily: 'var(--font-sans)' }}
          />
        </FieldWrapper>

        {/* Confirm Password */}
        <FieldWrapper
          label="Confirm Password"
          htmlFor="sap-confirm-pwd"
          required
          error={confirmError}
        >
          <PasswordInput
            id="sap-confirm-pwd"
            placeholder="Re-enter new password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setConfirmTouched(true);
            }}
            disabled={isLoading}
            autoComplete="new-password"
            required
            leftIcon={<Key size={16} />}
            className={`rx-input ${confirmError ? 'rx-input-error' : ''}`}
            style={{ height: 38, fontFamily: 'var(--font-sans)' }}
          />
        </FieldWrapper>

        {/* Password Requirements Checklist (Live, updating as user types) */}
        <div
          className="sap-password-rules-box"
          style={{
            background: 'var(--color-blue-50, #EEF4F9)',
            border: '1px solid var(--color-blue-200, #B3CDE0)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '12px 14px'
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--color-navy-900, #00204E)',
              fontSize: 12,
              marginBottom: 8
            }}
          >
            Password Requirements:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ruleResults.map((r) => {
              const isMet = r.passed;
              return (
                <div
                  key={r.id}
                  data-testid={`pwd-rule-${r.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 12,
                    color: isMet ? 'var(--color-navy-900, #00204E)' : 'var(--color-text-muted, #7A8CA3)',
                    transition: 'color var(--transition-fast, 150ms ease)'
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: isMet ? 'rgba(16, 126, 62, 0.15)' : 'var(--color-blue-100, #D9E2EC)',
                      border: isMet ? '1px solid var(--color-success, #107e3e)' : '1px solid var(--color-border, #CBD5E1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: 'all var(--transition-fast, 150ms ease)'
                    }}
                  >
                    {isMet ? (
                      <Check size={10} strokeWidth={3} color="var(--color-success, #107e3e)" />
                    ) : (
                      <span
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          background: 'var(--color-text-muted, #7A8CA3)'
                        }}
                      />
                    )}
                  </div>
                  <span style={{ fontWeight: isMet ? 500 : 400 }}>{r.label}</span>
                </div>
              );
            })}

            {/* User mode only: Must differ from current password */}
            {mode === 'user' && newPassword && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: isDifferentFromCurrent ? 'var(--color-navy-900, #00204E)' : 'var(--color-danger, #B00020)'
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: isDifferentFromCurrent ? 'rgba(16, 126, 62, 0.15)' : 'rgba(176, 0, 32, 0.15)',
                    border: isDifferentFromCurrent ? '1px solid var(--color-success, #107e3e)' : '1px solid var(--color-danger, #B00020)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {isDifferentFromCurrent ? (
                    <Check size={10} strokeWidth={3} color="var(--color-success, #107e3e)" />
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-danger, #B00020)' }}>!</span>
                  )}
                </div>
                <span style={{ fontWeight: isDifferentFromCurrent ? 500 : 400 }}>New password differs from current</span>
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
