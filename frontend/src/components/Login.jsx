import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertCircle, ShieldCheck } from 'lucide-react';
import { loginUser } from '../services/api';
import nextItPointLogo from '../assets/next_it_point_logo.png';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const result = await loginUser(cleanEmail, password);
      // Immediately clear raw password from component state
      setPassword('');
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setPassword(''); // Never preserve failed password in state
      if (err.response?.status === 429) {
        setErrorMessage(
          err.response?.data?.error ||
          'Too many login attempts. Please wait a moment before trying again.'
        );
      } else if (err.response?.status === 401) {
        setErrorMessage(
          err.response?.data?.error ||
          'Invalid email or password. Please verify your credentials or contact your administrator.'
        );
      } else {
        setErrorMessage(
          err.response?.data?.error ||
          'Connection to authentication service failed. Please check network connectivity.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sap-login-viewport">
      {/* Top Shell Header with Next IT Point Brand Logo (Identical to Dashboard) */}
      <header className="sap-shell-header">
        <div className="sap-brand">
          <div className="sap-brand-logo-container">
            <img src={nextItPointLogo} alt="Next IT Point Logo" className="sap-brand-logo-img" />
          </div>
          <span className="sap-brand-divider">|</span>
          <span className="sap-brand-title">SAP AI Operations Assistant</span>
        </div>
      </header>

      {/* Main Login Canvas Body */}
      <div className="sap-login-canvas">
        <div className="sap-login-card">
          <div className="sap-login-header">
            <div className="sap-login-icon-box">
              <ShieldCheck size={24} color="var(--sap-primary)" />
            </div>
            <div>
              <h2>SAP Enterprise Portal</h2>
              <p>Sign in with your Next IT Point credentials</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="sap-login-body">
            {errorMessage && (
              <div className="sap-alert sap-alert-error" role="alert">
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{errorMessage}</div>
              </div>
            )}

            <div className="sap-form-group">
              <label className="sap-form-label" htmlFor="sap-email">
                Email Address
              </label>
              <div className="sap-input-group">
                <span className="sap-input-icon-left" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sap-text-muted)', pointerEvents: 'none' }}>
                  <Mail size={15} />
                </span>
                <input
                  id="sap-email"
                  type="email"
                  className="sap-input"
                  style={{ paddingLeft: 36 }}
                  placeholder="e.g. user@nextitpoint.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  autoFocus
                  required
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" htmlFor="sap-password">
                Password
              </label>
              <div className="sap-input-group">
                <span className="sap-input-icon-left" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sap-text-muted)', pointerEvents: 'none' }}>
                  <Lock size={15} />
                </span>
                <input
                  id="sap-password"
                  type={showPassword ? 'text' : 'password'}
                  className="sap-input"
                  style={{ paddingLeft: 36, paddingRight: 40 }}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="sap-input-addon-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              disabled={isLoading}
              style={{ width: '100%', height: 38, fontSize: 13, marginTop: 4, fontWeight: 600 }}
            >
              {isLoading ? (
                <>
                  <span className="sap-spinner" style={{ width: 14, height: 14 }} />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <Lock size={15} />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <div style={{
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--sap-text-subtle)',
              marginTop: 6,
              lineHeight: 1.45
            }}>
              Protected by Supabase Auth with per-server role permissions.
              <br />
              Accounts are provisioned and managed by administrators.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
