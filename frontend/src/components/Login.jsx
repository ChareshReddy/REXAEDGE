import React, { useState, useEffect, useRef } from 'react';
import { Lock, Mail, AlertCircle, X } from 'lucide-react';
import PasswordInput from './PasswordInput';
import { loginUser, warmupAuth } from '../services/api';
import { useToast, NotificationPlacementProvider } from '../context/ToastContext';
import rexaEdgeLogo from '../assets/rexaedge_logo.png';
import sapSignInHero from '../assets/sap_signin_hero.jpg';

export default function Login({
  onLoginSuccess }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const slowNoticeTimerRef = useRef(null);
  const [errorMessage, _setErrorMessage] = useState('');

  useEffect(() => {
    // Fire-and-forget warm-up request on mount; ignore every outcome with no UI change
    warmupAuth();
    return () => {
      if (slowNoticeTimerRef.current) {
        clearTimeout(slowNoticeTimerRef.current);
      }
    };
  }, []);
  const setErrorMessage = (msg) => {
    _setErrorMessage(msg || '');
  };

  const clearErrors = () => {
    if (errorMessage) _setErrorMessage('');
    toast.clearAll();
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    clearErrors();
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    clearErrors();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setIsLoading(true);
    setShowSlowNotice(false);
    if (slowNoticeTimerRef.current) {
      clearTimeout(slowNoticeTimerRef.current);
    }
    slowNoticeTimerRef.current = setTimeout(() => {
      setShowSlowNotice(true);
    }, 4000);

    try {
      const result = await loginUser(cleanEmail, password);
      // Immediately clear raw password from component state
      setPassword('');
      if (result.success && result.user) {
        toast.clearAll();
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
      } else if (
        err.response?.status === 500 &&
        (typeof err.response?.data === 'string' ||
         err.response?.headers?.['content-type']?.includes('text/plain') ||
         err.isProxyPlainTextError)
      ) {
        setErrorMessage("Can't reach the sign-in service. Please try again.");
      } else {
        setErrorMessage(
          err.response?.data?.error ||
          "Can't reach the sign-in service right now. Please try again."
        );
      }
    } finally {
      if (slowNoticeTimerRef.current) {
        clearTimeout(slowNoticeTimerRef.current);
        slowNoticeTimerRef.current = null;
      }
      setIsLoading(false);
      setShowSlowNotice(false);
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
        <NotificationPlacementProvider placement="inline">
          {/* Absolutely positioned error message above RexaEdge logo (zero layout shift) */}
          {errorMessage ? (
            <div
              className="sap-login-panel-error"
              role="alert"
              aria-live="assertive"
            >
              <div
                className="sap-login-error-alert"
                title={errorMessage}
              >
                <div className="sap-login-error-icon-wrap" aria-hidden="true">
                  <AlertCircle size={18} className="sap-login-error-icon" />
                </div>
                <div className="sap-login-error-content">
                  <div className="sap-login-error-title">Sign in notice</div>
                  <div className="sap-login-error-text">
                    {errorMessage}
                  </div>
                </div>
                <button
                  type="button"
                  className="sap-login-error-close"
                  onClick={clearErrors}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : null}

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
                      onChange={handleEmailChange}
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
                    onChange={handlePasswordChange}
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
        </NotificationPlacementProvider>

        {/* Footer centered at bottom of right panel */}
        <footer className="sap-login-footer">
          <strong>© {new Date().getFullYear()} RexaEdge · a Product of Next IT Point</strong>
        </footer>
      </div>
    </div>
  );
}
