import React, { useState, useEffect, useRef } from 'react';
import { Server, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Eye, EyeOff } from 'lucide-react';
import Modal from './ui/Modal';
import { createMyServer, updateMyServer, testServerConnection } from '../services/api';

export default function AddServerModal({
  isOpen,
  onClose,
  onSuccess,
  serverToEdit = null,
  isOnboarding = false
}) {
  const [name, setName] = useState('');
  const [ashost, setAshost] = useState('');
  const [sysnr, setSysnr] = useState('00');
  const [client, setClient] = useState('100');
  const [saprouter, setSaprouter] = useState('');
  const [sapUsername, setSapUsername] = useState('');
  const [sapPassword, setSapPassword] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | { success: true, message: string } | { success: false, message: string }
  const [testedSnapshot, setTestedSnapshot] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const nameInputRef = useRef(null);

  useEffect(() => {
    if (serverToEdit) {
      setName(serverToEdit.name || '');
      setAshost(serverToEdit.ashost || '');
      setSysnr(serverToEdit.sysnr || '00');
      setClient(serverToEdit.client || '100');
      setSaprouter(serverToEdit.saprouter || '');
      setSapUsername(serverToEdit.sap_username || '');
      setSapPassword(''); // Leave blank to keep existing
      setIsDefault(Boolean(serverToEdit.is_default));
    } else {
      setName('');
      setAshost('');
      setSysnr('00');
      setClient('100');
      setSaprouter('');
      setSapUsername('');
      setSapPassword('');
      setIsDefault(isOnboarding); // Onboarding defaults to true
    }
    setTestStatus(null);
    setTestedSnapshot(null);
    setError('');
    setTouched({});
    setIsSubmitted(false);

    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [serverToEdit, isOpen, isOnboarding]);

  const handleConnectionParamChange = (setter, fieldName) => (e) => {
    setter(e.target.value);
    setTestedSnapshot(null);
    if (testStatus) setTestStatus(null);
    if (touched[fieldName]) {
      setTouched((prev) => ({ ...prev, [fieldName]: true }));
    }
  };

  const isTestPassedForCurrentValues = Boolean(
    testedSnapshot &&
    testedSnapshot.ashost === ashost.trim() &&
    testedSnapshot.sysnr === (sysnr.trim() || '00') &&
    testedSnapshot.client === (client.trim() || '100') &&
    testedSnapshot.sapUsername === sapUsername.trim() &&
    testedSnapshot.sapPassword === sapPassword
  );

  const fieldErrors = {
    name: !name.trim() ? 'Server name is required.' : null,
    ashost: !ashost.trim() ? 'Host / IP address is required.' : null,
    sysnr: !sysnr.trim() ? 'System number is required.' : null,
    client: !client.trim() ? 'Client number is required.' : null,
    sapUsername: !sapUsername.trim() ? 'SAP username is required.' : null,
    sapPassword: (!serverToEdit && !sapPassword) ? 'SAP password is required.' : null
  };

  const handleTestConnection = async () => {
    setError('');
    setTestStatus(null);

    if (!ashost.trim()) {
      setTouched((prev) => ({ ...prev, ashost: true }));
      setError('Host / IP address is required for connection testing.');
      return;
    }
    if (!serverToEdit && !sapPassword) {
      setTouched((prev) => ({ ...prev, sapPassword: true }));
      setError('SAP password is required to test connection.');
      return;
    }

    setIsTesting(true);
    try {
      const payload = {
        ashost: ashost.trim(),
        sysnr: sysnr.trim() || '00',
        client: client.trim() || '100',
        saprouter: saprouter.trim() || undefined,
        sap_username: sapUsername.trim(),
        sap_password: sapPassword || undefined
      };

      const result = await testServerConnection(payload, serverToEdit?.id || null);
      if (result?.success) {
        const allowlistType = result.type || result.environment || 'Sandbox';
        setTestStatus({
          success: true,
          message: `Connection successful (${result.responseTimeMs || 0} ms) - Type: ${allowlistType}`
        });
        setTestedSnapshot({
          ashost: ashost.trim(),
          sysnr: sysnr.trim() || '00',
          client: client.trim() || '100',
          sapUsername: sapUsername.trim(),
          sapPassword: sapPassword
        });
      } else {
        setTestedSnapshot(null);
        setTestStatus({
          success: false,
          message: result?.error || result?.message || 'Connection test failed.'
        });
      }
    } catch (err) {
      setTestedSnapshot(null);
      setTestStatus({
        success: false,
        message: err?.response?.data?.error || err.message || 'Connection test failed.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitted(true);
    setError('');

    const hasAnyFieldError = Object.values(fieldErrors).some(Boolean);
    if (hasAnyFieldError) {
      return;
    }

    // Require successful test connection before adding a new server
    if (!serverToEdit && !isTestPassedForCurrentValues) {
      setError('Please test the connection first before adding this server.');
      return;
    }

    setIsSaving(true);
    try {
      const serverData = {
        name: name.trim(),
        ashost: ashost.trim(),
        sysnr: sysnr.trim(),
        client: client.trim(),
        saprouter: saprouter.trim() || undefined,
        sap_username: sapUsername.trim(),
        is_default: Boolean(isDefault)
      };

      if (sapPassword) {
        serverData.sap_password = sapPassword;
      }

      let savedServer;
      if (serverToEdit?.id) {
        savedServer = await updateMyServer(serverToEdit.id, serverData);
      } else {
        savedServer = await createMyServer(serverData);
      }

      if (typeof onSuccess === 'function') {
        onSuccess(savedServer);
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to save server.');
    } finally {
      setIsSaving(false);
    }
  };

  const modalTitle = isOnboarding
    ? 'Add your SAP server'
    : (serverToEdit ? 'Edit SAP Server' : 'Add SAP Server');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      maxWidth="560px"
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || isSaving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: 500,
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: 'var(--radius-md, 6px)',
                color: 'var(--color-text, #0F172A)',
                cursor: isTesting ? 'not-allowed' : 'pointer'
              }}
            >
              <RefreshCw size={14} className={isTesting ? 'animate-spin' : ''} />
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-border, #CBD5E1)',
                  borderRadius: 'var(--radius-md, 6px)',
                  color: 'var(--color-text-muted, #64748B)',
                  cursor: isSaving ? 'not-allowed' : 'pointer'
                }}
              >
                {isOnboarding ? 'Later' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving || (!serverToEdit && !isTestPassedForCurrentValues)}
                style={{
                  padding: '8px 18px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: 'var(--color-navy-900, #00204E)',
                  border: 'none',
                  borderRadius: 'var(--radius-md, 6px)',
                  color: '#FFFFFF',
                  cursor: (isSaving || (!serverToEdit && !isTestPassedForCurrentValues)) ? 'not-allowed' : 'pointer',
                  opacity: (isSaving || (!serverToEdit && !isTestPassedForCurrentValues)) ? 0.5 : 1
                }}
              >
                {isSaving ? 'Saving...' : (serverToEdit ? 'Save Changes' : 'Add Server')}
              </button>
            </div>
          </div>
          {!serverToEdit && !isTestPassedForCurrentValues && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)', textAlign: 'right', marginTop: '2px' }}>
              Test the connection first
            </div>
          )}
        </div>
      }
    >
      <div style={{ padding: '4px 0' }}>
        {/* Banner: Encrypted Credentials Note */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            backgroundColor: 'var(--color-blue-100, #DCE8F1)',
            border: '1px solid var(--color-blue-300, #98B5CE)',
            borderRadius: 'var(--radius-md, 6px)',
            padding: '10px 12px',
            marginBottom: '16px',
            color: 'var(--color-navy-900, #00204E)',
            fontSize: '12px',
            lineHeight: 1.4
          }}
        >
          <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--color-blue-600, #1D4ED8)' }} />
          <span>
            Your SAP password is encrypted and is never shown in the app.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--color-danger-bg, #FEF2F2)',
              border: '1px solid var(--color-danger-border, #FCA5A5)',
              borderRadius: 'var(--radius-md, 6px)',
              padding: '8px 12px',
              marginBottom: '14px',
              color: 'var(--color-danger, #B42318)',
              fontSize: '13px'
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {testStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: testStatus.success ? 'var(--color-success-bg, #F0FDF4)' : 'var(--color-danger-bg, #FEF2F2)',
              border: `1px solid ${testStatus.success ? 'var(--color-success-border, #86EFAC)' : 'var(--color-danger-border, #FCA5A5)'}`,
              borderRadius: 'var(--radius-md, 6px)',
              padding: '8px 12px',
              marginBottom: '14px',
              color: testStatus.success ? 'var(--color-success, #166534)' : 'var(--color-danger, #B42318)',
              fontSize: '13px'
            }}
          >
            {testStatus.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{testStatus.message}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Server Name */}
          <div>
            <label
              htmlFor="server-name"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
            >
              Server Name *
            </label>
            <input
              ref={nameInputRef}
              id="server-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (touched.name) setTouched((prev) => ({ ...prev, name: true }));
              }}
              onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
              placeholder="e.g. Production SAP Core or Sandbox"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--radius-md, 6px)',
                border: (touched.name || isSubmitted) && fieldErrors.name ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                boxSizing: 'border-box'
              }}
            />
            {(touched.name || isSubmitted) && fieldErrors.name && (
              <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          {/* Host / IP */}
          <div>
            <label
              htmlFor="server-ashost"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
            >
              Application Server / Host / IP *
            </label>
            <input
              id="server-ashost"
              type="text"
              value={ashost}
              onChange={handleConnectionParamChange(setAshost, 'ashost')}
              onBlur={() => setTouched((prev) => ({ ...prev, ashost: true }))}
              placeholder="e.g. 10.0.1.50 or sap.company.com"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--radius-md, 6px)',
                border: (touched.ashost || isSubmitted) && fieldErrors.ashost ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                boxSizing: 'border-box'
              }}
            />
            {(touched.ashost || isSubmitted) && fieldErrors.ashost ? (
              <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                {fieldErrors.ashost}
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748B)' }}>
                Must match an approved corporate allowlist pattern.
              </span>
            )}
          </div>

          {/* System Number and Client */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label
                htmlFor="server-sysnr"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
              >
                System Number (sysnr) *
              </label>
              <input
                id="server-sysnr"
                type="text"
                maxLength={2}
                value={sysnr}
                onChange={handleConnectionParamChange(setSysnr, 'sysnr')}
                onBlur={() => setTouched((prev) => ({ ...prev, sysnr: true }))}
                placeholder="00"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: (touched.sysnr || isSubmitted) && fieldErrors.sysnr ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  boxSizing: 'border-box'
                }}
              />
              {(touched.sysnr || isSubmitted) && fieldErrors.sysnr && (
                <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                  {fieldErrors.sysnr}
                </span>
              )}
            </div>
            <div>
              <label
                htmlFor="server-client"
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
              >
                Client *
              </label>
              <input
                id="server-client"
                type="text"
                maxLength={3}
                value={client}
                onChange={handleConnectionParamChange(setClient, 'client')}
                onBlur={() => setTouched((prev) => ({ ...prev, client: true }))}
                placeholder="100"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: (touched.client || isSubmitted) && fieldErrors.client ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  boxSizing: 'border-box'
                }}
              />
              {(touched.client || isSubmitted) && fieldErrors.client && (
                <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                  {fieldErrors.client}
                </span>
              )}
            </div>
          </div>

          {/* SAP Router */}
          <div>
            <label
              htmlFor="server-saprouter"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
            >
              SAP Router
            </label>
            <input
              id="server-saprouter"
              type="text"
              value={saprouter}
              onChange={handleConnectionParamChange(setSaprouter, 'saprouter')}
              placeholder="e.g. /H/router.company.com/S/3299/H/"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--radius-md, 6px)',
                border: '1px solid var(--color-border, #CBD5E1)',
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* SAP Username */}
          <div>
            <label
              htmlFor="server-username"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
            >
              SAP Username *
            </label>
            <input
              id="server-username"
              type="text"
              value={sapUsername}
              onChange={handleConnectionParamChange(setSapUsername, 'sapUsername')}
              onBlur={() => setTouched((prev) => ({ ...prev, sapUsername: true }))}
              placeholder="e.g. BATCH_USER"
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: 'var(--radius-md, 6px)',
                border: (touched.sapUsername || isSubmitted) && fieldErrors.sapUsername ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                backgroundColor: 'var(--color-surface, #FFFFFF)',
                boxSizing: 'border-box'
              }}
            />
            {(touched.sapUsername || isSubmitted) && fieldErrors.sapUsername && (
              <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                {fieldErrors.sapUsername}
              </span>
            )}
          </div>

          {/* SAP Password */}
          <div>
            <label
              htmlFor="server-password"
              style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text, #0F172A)', marginBottom: '4px' }}
            >
              SAP Password {serverToEdit ? '(Leave blank to keep existing)' : '*'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="server-password"
                type={showPassword ? 'text' : 'password'}
                value={sapPassword}
                onChange={handleConnectionParamChange(setSapPassword, 'sapPassword')}
                onBlur={() => setTouched((prev) => ({ ...prev, sapPassword: true }))}
                placeholder={serverToEdit ? '••••••••' : 'Enter SAP password'}
                style={{
                  width: '100%',
                  padding: '8px 36px 8px 12px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: (!serverToEdit && (touched.sapPassword || isSubmitted) && fieldErrors.sapPassword) ? '1px solid var(--color-danger, #B42318)' : '1px solid var(--color-border, #CBD5E1)',
                  backgroundColor: 'var(--color-surface, #FFFFFF)',
                  boxSizing: 'border-box'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted, #64748B)',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {!serverToEdit && (touched.sapPassword || isSubmitted) && fieldErrors.sapPassword && (
              <span style={{ fontSize: '11px', color: 'var(--color-danger, #B42318)', marginTop: '2px', display: 'block' }}>
                {fieldErrors.sapPassword}
              </span>
            )}
          </div>

          {/* Set as Default */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <input
              id="server-default"
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            <label
              htmlFor="server-default"
              style={{ fontSize: '13px', color: 'var(--color-text, #0F172A)', cursor: 'pointer' }}
            >
              Set as my default server for new tabs and sessions
            </label>
          </div>
        </form>
      </div>
    </Modal>
  );
}
