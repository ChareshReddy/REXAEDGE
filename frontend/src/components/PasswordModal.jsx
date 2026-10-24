import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Key, Check, AlertCircle, Loader2 } from 'lucide-react';
import Modal from './Modal';
import { checkPasswordRules } from '../utils/passwordPolicy';
import { adminSetUserPassword, changeUserPassword } from '../services/api';

/**
 * Shared Password Management Modal for both Admin (Set Password) and User (Change Password) flows.
 *
 * Rules:
 * 1. Admin mode: 2 fields (New password, Confirm password).
 * 2. User mode: 3 fields (Current password, New password, Confirm new password).
 * 3. Eye/EyeOff toggles on each password input.
 * 4. Password policy rules checklist (10+ chars, uppercase, lowercase, number, match).
 * 5. Save button disabled until all criteria pass.
 * 6. Closes ONLY through Cancel or X buttons.
 * 7. Spinner and disabled fields while saving.
 * 8. Never stores or logs passwords. Clears memory on modal close.
 * 9. Shared size class: .sap-password-modal-card (440px wide, max-width calc(100vw - 32px), 20px padding).
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

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Clear fields whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setErrorMessage('');
      setIsLoading(false);
    } else {
      // Clear sensitive fields immediately on unmount/close
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage('');
    }
  }, [isOpen]);

  // Evaluate password rules on newPassword
  const { results: ruleResults, allPassed: rulesPassed } = checkPasswordRules(newPassword);

  const passwordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);
  const isDifferentFromCurrent = mode === 'user' ? Boolean(newPassword && newPassword !== currentPassword) : true;
  const currentPasswordProvided = mode === 'user' ? Boolean(currentPassword.trim()) : true;

  const isFormValid = rulesPassed && passwordsMatch && isDifferentFromCurrent && currentPasswordProvided;

  const handleClose = () => {
    if (isLoading) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
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
        // Wipe inputs
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onSuccess(res.message || `Password updated successfully for ${targetUser.email}`);
        onClose();
      } else {
        const res = await changeUserPassword(currentPassword, newPassword, confirmPassword);
        // Wipe inputs
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onSuccess(res.message || 'Password changed successfully.');
        onClose();
      }
    } catch (err) {
      // Never store or display submitted passwords in error state
      const serverMsg = err.response?.data?.error || err.message || 'Failed to update password.';
      setErrorMessage(serverMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const modalTitle = mode === 'admin' ? 'Set New Password' : 'Change Password';
  const modalSubtitle = mode === 'admin'
    ? `Set an account password for ${targetUser?.email || 'selected user'}`
    : 'Update your account password with enterprise security requirements';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={Key}
      iconColor="var(--sap-primary, #0a6ed1)"
      isLoading={isLoading}
      maxWidth={480}
      width="100%"
      cardClassName="sap-password-modal-card"
    >
      <form onSubmit={handleSubmit} className="sap-modal-form">
        <div className="sap-modal-body" style={{ gap: 12 }}>
          {errorMessage && (
            <div className="sap-alert sap-alert-error" role="alert" style={{ marginBottom: 2 }}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ wordBreak: 'break-word', fontSize: 12.5 }}>{errorMessage}</div>
            </div>
          )}

          {/* User mode only: Current Password */}
          {mode === 'user' && (
            <div className="sap-form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label
                className="sap-form-label"
                htmlFor="sap-current-pwd"
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sap-text-dark, #1e293b)', margin: 0 }}
              >
                Current Password <span style={{ color: 'var(--sap-error, #b00)' }}>*</span>
              </label>
              <div className="sap-input-group" style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: 14,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--sap-text-muted, #64748b)',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Key size={17} />
                </span>
                <input
                  id="sap-current-pwd"
                  type={showCurrentPassword ? 'text' : 'password'}
                  className="sap-input sap-password-input"
                  style={{ paddingLeft: 42, paddingRight: 44, height: 40, fontSize: 13, boxSizing: 'border-box' }}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  className="sap-input-addon-btn"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={isLoading}
                  aria-label={showCurrentPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                  style={{
                    position: 'absolute',
                    right: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    height: 32,
                    width: 32,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    color: 'var(--sap-text-muted, #64748b)',
                    cursor: 'pointer'
                  }}
                >
                  {showCurrentPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div className="sap-form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              className="sap-form-label"
              htmlFor="sap-new-pwd"
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sap-text-dark, #1e293b)', margin: 0 }}
            >
              New Password <span style={{ color: 'var(--sap-error, #b00)' }}>*</span>
            </label>
            <div className="sap-input-group" style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--sap-text-muted, #64748b)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Key size={17} />
              </span>
              <input
                id="sap-new-pwd"
                type={showNewPassword ? 'text' : 'password'}
                className="sap-input sap-password-input"
                style={{ paddingLeft: 42, paddingRight: 44, height: 40, fontSize: 13, boxSizing: 'border-box' }}
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
                required
                autoFocus={mode === 'admin'}
              />
              <button
                type="button"
                className="sap-input-addon-btn"
                onClick={() => setShowNewPassword(!showNewPassword)}
                disabled={isLoading}
                aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 32,
                  width: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: 'var(--sap-text-muted, #64748b)',
                  cursor: 'pointer'
                }}
              >
                {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="sap-form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label
              className="sap-form-label"
              htmlFor="sap-confirm-pwd"
              style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sap-text-dark, #1e293b)', margin: 0 }}
            >
              Confirm Password <span style={{ color: 'var(--sap-error, #b00)' }}>*</span>
            </label>
            <div className="sap-input-group" style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute',
                  left: 14,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--sap-text-muted, #64748b)',
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <Key size={17} />
              </span>
              <input
                id="sap-confirm-pwd"
                type={showConfirmPassword ? 'text' : 'password'}
                className="sap-input sap-password-input"
                style={{ paddingLeft: 42, paddingRight: 44, height: 40, fontSize: 13, boxSizing: 'border-box' }}
                placeholder="Re-enter new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                className="sap-input-addon-btn"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isLoading}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 32,
                  width: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: 'var(--sap-text-muted, #64748b)',
                  cursor: 'pointer'
                }}
              >
                {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Password Requirements Checklist */}
          <div
            className="sap-password-rules-box"
            style={{
              background: 'var(--sap-surface-subtle, #f8fafc)',
              border: '1px solid var(--sap-border-subtle, #e2e8f0)',
              borderRadius: 'var(--radius-md, 6px)',
              padding: '10px 12px',
              marginTop: 4
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--sap-text-dark, #1e293b)', fontSize: 12, marginBottom: 5 }}>
              Password Requirements:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {ruleResults.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 12,
                    color: r.passed ? 'var(--sap-success, #107e3e)' : 'var(--sap-text-muted, #64748b)'
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: r.passed ? 'rgba(16, 126, 62, 0.15)' : 'rgba(0,0,0,0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {r.passed ? <Check size={10} color="var(--sap-success, #107e3e)" /> : '•'}
                  </div>
                  <span>{r.label}</span>
                </div>
              ))}

              {/* Passwords Match Check */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  fontSize: 12,
                  color: passwordsMatch ? 'var(--sap-success, #107e3e)' : 'var(--sap-text-muted, #64748b)'
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: passwordsMatch ? 'rgba(16, 126, 62, 0.15)' : 'rgba(0,0,0,0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 700,
                    flexShrink: 0
                  }}
                >
                  {passwordsMatch ? <Check size={10} color="var(--sap-success, #107e3e)" /> : '•'}
                </div>
                <span>Passwords match</span>
              </div>

              {/* User mode: Must differ from current password */}
              {mode === 'user' && newPassword && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    fontSize: 12,
                    color: isDifferentFromCurrent ? 'var(--sap-success, #107e3e)' : 'var(--sap-error, #b00)'
                  }}
                >
                  <div
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: isDifferentFromCurrent ? 'rgba(16, 126, 62, 0.15)' : 'rgba(187, 0, 0, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                      flexShrink: 0
                    }}
                  >
                    {isDifferentFromCurrent ? (
                      <Check size={10} color="var(--sap-success, #107e3e)" />
                    ) : (
                      '!'
                    )}
                  </div>
                  <span>New password differs from current</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Action Buttons: fixed footer with divider, right-aligned, normal size */}
        <div className="sap-modal-footer" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="sap-btn sap-btn-secondary"
            onClick={handleClose}
            disabled={isLoading}
            style={{
              height: 38,
              padding: '0 16px',
              fontSize: 13.5,
              fontWeight: 500,
              minWidth: 'auto'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="sap-btn sap-btn-primary"
            disabled={!isFormValid || isLoading}
            style={{
              height: 38,
              padding: '0 18px',
              fontSize: 13.5,
              fontWeight: 600,
              minWidth: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={14} className="sap-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save</span>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
