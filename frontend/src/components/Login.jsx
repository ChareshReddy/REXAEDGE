import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, Check } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { loginUser } from '../services/api';
import rexaEdgeLogo from '../assets/rexaedge_logo.png';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      {/* =====================================================================
          LEFT PANEL (~50% width): Flat Solid Dark Navy, Wireframe Window Illustration
         ===================================================================== */}
      <div className="sap-login-left-panel">
        <div className="sap-login-left-pattern" aria-hidden="true" />

        {/* Top-left: RexaEdge Brand Logo in white rounded container */}
        <div className="sap-login-brand-top">
          <div className="sap-brand-logo-container" title="RexaEdge">
            <img src={rexaEdgeLogo} alt="RexaEdge" className="sap-brand-logo-img" />
          </div>
        </div>

        {/* Center: Wireframe Window Illustration & Headline */}
        <div className="sap-login-hero-content">
          <div className="sap-login-window-wrapper" aria-hidden="true">
            <div className="sap-login-window-backdrop" />
            <div className="sap-login-window-illustration">
              <div className="sap-login-window-header">
                <div className="sap-login-window-dots">
                  <span className="sap-login-window-dot" />
                  <span className="sap-login-window-dot" />
                  <span className="sap-login-window-dot" />
                </div>
                <div className="sap-login-window-bar" />
              </div>

              <div className="sap-login-window-grid">
                {/* Active solid white card with checkmark badge */}
                <div className="sap-login-card-active">
                  <div className="sap-login-card-check-circle">
                    <Check size={13} strokeWidth={3} />
                  </div>
                  <div className="sap-login-card-bars">
                    <div className="sap-login-card-bar-dark" />
                    <div className="sap-login-card-bar-subtle" />
                  </div>
                </div>

                {/* 3 dashed wireframe cards */}
                <div className="sap-login-card-dashed">
                  <div className="sap-login-card-bar-wire-top" />
                  <div className="sap-login-card-bar-wire-sub" />
                </div>
                <div className="sap-login-card-dashed">
                  <div className="sap-login-card-bar-wire-top" />
                  <div className="sap-login-card-bar-wire-sub" />
                </div>
                <div className="sap-login-card-dashed">
                  <div className="sap-login-card-bar-wire-top" />
                  <div className="sap-login-card-bar-wire-sub" />
                </div>
              </div>
            </div>
          </div>

          <h1 className="sap-login-hero-heading">SAP modules, one portal.</h1>
          <p className="sap-login-hero-subline">
            Work in the SAP modules your administrator has enabled for you, with access set per module and per feature.
          </p>
        </div>

        {/* Bottom balance spacer */}
        <div style={{ height: 44 }} aria-hidden="true" />
      </div>

      {/* =====================================================================
          RIGHT PANEL (~50% width): White Background, Direct Form, Centered Column
         ===================================================================== */}
      <div className="sap-login-right-panel">
        {/* Mobile-only logo (< 900px viewport) */}
        <div className="sap-login-mobile-logo">
          <div className="sap-brand-logo-container" title="RexaEdge">
            <img src={rexaEdgeLogo} alt="RexaEdge" className="sap-brand-logo-img" />
          </div>
        </div>

        <div className="sap-login-canvas">
          <div className="sap-login-lock-circle">
            <Lock size={18} color="#ffffff" strokeWidth={2.2} />
          </div>

          <div className="sap-login-header-direct">
            <h2>Welcome to RexaEdge</h2>
            <p>Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="sap-login-body-direct">
            {errorMessage && (
              <div className="sap-alert sap-alert-error" role="alert">
                <AlertCircle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>{errorMessage}</div>
              </div>
            )}

            <div className="sap-form-group">
              <label className="sap-form-label" htmlFor="sap-email">
                Email address
              </label>
              <div className="sap-input-group">
                <span
                  className="sap-input-icon-left"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--sap-text-muted)',
                    pointerEvents: 'none'
                  }}
                >
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
              <PasswordInput
                id="sap-password"
                name="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
                required
                leftIcon={<Lock size={15} />}
              />
            </div>

            <button
              type="submit"
              className="sap-btn-navy-login"
              disabled={isLoading}
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

            <p className="sap-login-admin-note">
              Accounts are created and managed by your administrators.
            </p>
          </form>
        </div>

        {/* Footer centered at bottom of right panel */}
        <footer className="sap-login-footer">
          © {new Date().getFullYear()} RexaEdge · a product of Next IT Point
        </footer>
      </div>
    </div>
  );
}
