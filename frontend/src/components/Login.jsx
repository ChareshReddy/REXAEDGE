import React, { useState } from 'react';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { loginUser } from '../services/api';
import rexaEdgeLogo from '../assets/rexaedge_logo.png';
import sapSignInHero from '../assets/sap_signin_hero.jpg';

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
          "Can't reach the sign-in service right now. Please try again."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="sap-login-viewport">
      {/* =====================================================================
          LEFT PANEL (~50% width): SAP Image Background with Overlay & Text
         ===================================================================== */}
      <div
        className="sap-login-left-panel"
        style={{ backgroundImage: `url(${sapSignInHero})` }}
      >
        <div className="sap-login-bg-overlay" aria-hidden="true" />

        {/* Text overlay on top of the background */}
        <div className="sap-login-hero-content">
          <h1 className="sap-login-hero-heading">SAP modules, one portal.</h1>
          <p className="sap-login-hero-subline">
            Work in the SAP modules your administrator has enabled for you, with access set per module and per feature.
          </p>
        </div>
      </div>

      {/* =====================================================================
          RIGHT PANEL (~50% width): Form Card with Centered Logo & Border
         ===================================================================== */}
      <div className="sap-login-right-panel">
        <div className="sap-login-form-area">
          {/* Top-center: RexaEdge Brand Logo outside the form border */}
          <div className="sap-login-brand-center">
            <img src={rexaEdgeLogo} alt="RexaEdge" className="sap-login-brand-logo-img" />
          </div>

          <div className="sap-login-canvas">
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
                <div className="sap-input-group sap-input-icon-wrapper">
                  <span className="sap-input-icon-left" aria-hidden="true">
                    <Mail size={16} />
                  </span>
                  <input
                    id="sap-email"
                    type="email"
                    className="sap-input sap-input-with-icon"
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
                  leftIcon={<Lock size={16} />}
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
        </div>

        {/* Footer centered at bottom of right panel */}
        <footer className="sap-login-footer">
          <strong>© {new Date().getFullYear()} RexaEdge · a Product of Next IT Point</strong>
        </footer>
      </div>
    </div>
  );
}
