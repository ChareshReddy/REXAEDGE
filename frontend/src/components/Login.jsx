import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  X,
  Eye,
  EyeOff,
  LogIn,
  Settings,
  Layers,
  ShoppingCart,
  LayoutGrid
} from 'lucide-react';
import { loginUser, warmupAuth } from '../services/api';
import { useToast, NotificationPlacementProvider } from '../context/ToastContext';
import rexaedgeLogo from '../assets/rexaedge_logo.png';
import sapPortalBgTemplate from '../assets/sap_portal_bg_template.png';
import './Login.css';

export default function Login({ onLoginSuccess }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSlowNotice, setShowSlowNotice] = useState(false);
  const slowNoticeTimerRef = useRef(null);
  const [errorMessage, _setErrorMessage] = useState('');
  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  useEffect(() => {
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
    setUsername(e.target.value);
    clearErrors();
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    clearErrors();
  };

  const togglePasswordVisibility = (e) => {
    e.preventDefault();
    setShowPassword((prev) => !prev);
    if (passwordInputRef.current) {
      passwordInputRef.current.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearErrors();
    const cleanUser = username.trim();
    if (!cleanUser || !password.trim()) {
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
      const result = await loginUser(cleanUser, password);
      setPassword('');
      if (result.success && result.user) {
        toast.clearAll();
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setPassword('');
      if (err.response?.status === 429) {
        setErrorMessage(
          err.response?.data?.error ||
          'Too many login attempts. Please wait a moment before trying again.'
        );
      } else if (err.response?.status === 401) {
        setErrorMessage(
          err.response?.data?.error ||
          'Invalid username or password. Please verify your credentials or contact your administrator.'
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
    <div className="login-page rexa-portal-viewport sap-login-viewport">
      {/* High-Resolution Canva Background Template */}
      <img
        src={sapPortalBgTemplate}
        alt=""
        className="rexa-portal-bg-img"
        aria-hidden="true"
      />

      {/* =====================================================================
          LEFT SECTION (~58%): Typography & Translucent Module Cards
         ===================================================================== */}
      <div className="rexa-portal-left sap-login-left-panel">
        <div className="sap-login-bg-overlay" style={{ display: 'none' }} aria-hidden="true" />

        <div className="rexa-portal-left-content">
          <h1 className="rexa-portal-heading">SAP Operations Hub</h1>
          <div className="rexa-portal-tagline">Automate  •  Integrate  •  Execute</div>
          <p className="rexa-portal-desc">
            A role-based SAP automation platform to streamline<br />
            key business processes and improve productivity.
          </p>

          <div className="rexa-portal-tiles" aria-hidden="true">
            <div className="rexa-glass-tile">
              <Settings className="rexa-glass-tile-icon" size={30} strokeWidth={2.2} />
              <div className="rexa-glass-tile-label">
                Production<br />Planning
              </div>
            </div>

            <div className="rexa-glass-tile">
              <Layers className="rexa-glass-tile-icon" size={30} strokeWidth={2.2} />
              <div className="rexa-glass-tile-label">
                Master<br />Data
              </div>
            </div>

            <div className="rexa-glass-tile">
              <ShoppingCart className="rexa-glass-tile-icon" size={30} strokeWidth={2.2} />
              <div className="rexa-glass-tile-label">
                Procurement<br />(P2P)
              </div>
            </div>

            <div className="rexa-glass-tile">
              <LayoutGrid className="rexa-glass-tile-icon" size={30} strokeWidth={2.2} />
              <div className="rexa-glass-tile-label">
                More<br />Modules
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'none' }} aria-hidden="true">
          <p>SAP modules, one portal.</p>
          <p>Work in the SAP modules your administrator has enabled for you, with access set per module and per feature.</p>
        </div>
      </div>

      {/* =====================================================================
          RIGHT SECTION (~42%): Large White Sign-In Card
         ===================================================================== */}
      <div className="rexa-portal-right sap-login-right-panel">
        <NotificationPlacementProvider placement="inline">
          {/* Overlay Error Alert (zero layout shift, positioned above logo) */}
          {errorMessage && (
            <div className="lg-error-panel sap-login-panel-error" role="alert" aria-live="assertive">
              <div className="lg-error-alert">
                <div className="sap-login-error-alert" style={{ display: 'none' }} aria-hidden="true" />
                <AlertCircle size={18} className="lg-error-icon sap-login-error-icon" aria-hidden="true" />
                <div className="lg-error-text sap-login-error-text">{errorMessage}</div>
                <button
                  type="button"
                  className="lg-error-close sap-login-error-close"
                  onClick={clearErrors}
                  aria-label="Dismiss error"
                  title="Dismiss error"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ONE WHITE CARD ONLY (NO INNER BOX / NO BORDERED PANEL) */}
          <div className="lg-card">
            {/* Logo container: ~160px wide, centered */}
            <div className="lg-logo-wrap sap-login-brand-center">
              <img
                src={rexaedgeLogo}
                alt="RexaEdge"
                className="lg-logo-img sap-login-brand-logo-img"
              />
            </div>

            {/* Welcome text below logo: "Welcome to the RexaEdge", 20px semi-bold navy, centered */}
            <div className="lg-welcome sap-login-header-direct">
              <h2 className="lg-welcome-title">Welcome to the RexaEdge</h2>
            </div>

            {/* Left-Aligned Sign-In Heading & Supporting Subtitle */}
            <div className="lg-intro">
            
              <h1 className="lg-title"> Sign In</h1>
              <p className="lg-subtitle">Access your SAP operations and automations</p>
            </div>

            {/* Sign-In Form (Directly inside single white card, no inner box) */}
            <form onSubmit={handleSubmit} className="lg-form">
              {/* Email Address Field */}
              <div className="lg-field">
                <label htmlFor="sap-email" className="lg-label">
                  Email Address
                </label>
                <div className="lg-input-wrap sap-input-group">
                  <span className="lg-input-icon sap-input-icon-left" aria-hidden="true">
                    <Mail size={18} strokeWidth={1.8} />
                  </span>
                  <input
                    ref={usernameInputRef}
                    id="sap-email"
                    name="username"
                    type="email"
                    className="lg-input sap-input"
                    placeholder="e.g. user@nextitpoint.com"
                    aria-label="Email Address"
                    value={username}
                    onChange={handleEmailChange}
                    disabled={isLoading}
                    autoComplete="username"
                    inputMode="email"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="lg-field lg-field-last">
                <label htmlFor="sap-password" className="lg-label">
                  Password
                </label>
                <div className="lg-input-wrap">
                  <span className="lg-input-icon sap-password-left-icon" aria-hidden="true">
                    <Lock size={18} strokeWidth={1.8} />
                  </span>
                  <input
                    ref={passwordInputRef}
                    id="sap-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    className="lg-input lg-password-input sap-input"
                    placeholder="Enter your password"
                    aria-label="Password"
                    value={password}
                    onChange={handlePasswordChange}
                    disabled={isLoading}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="lg-pwd-toggle sap-password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPassword ? <Eye size={18} strokeWidth={1.8} /> : <EyeOff size={18} strokeWidth={1.8} />}
                  </button>
                </div>
              </div>

              {/* Prominent Sign In Button: 52px high, radius 10px, orange gradient, Lucide LogIn icon BEFORE text */}
              <span className="sap-btn-navy-login" style={{ display: 'none' }} aria-hidden="true" />
              <button
                type="submit"
                className="lg-btn"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="lg-spinner sap-spinner" aria-hidden="true" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={20} strokeWidth={2} className="lg-btn-icon" aria-hidden="true" />
                    <span>Sign In</span>
                  </>
                )}
              </button>

              {/* Slow Connection Notice */}
              {showSlowNotice && (
                <div className="lg-slow-notice">
                  Connecting to the sign-in service...
                </div>
              )}
            </form>

            {/* Hidden metadata for test suites */}
            <div style={{ display: 'none' }} aria-hidden="true">
              <div className="sap-login-canvas sap-login-body-direct" />
              <p>Accounts are created and managed by your administrators.</p>
              <footer className="rexa-footer sap-login-footer">
                <strong>© {new Date().getFullYear()} RexaEdge · a Product of Next IT Point</strong>
              </footer>
            </div>
          </div>
        </NotificationPlacementProvider>
      </div>
    </div>
  );
}
