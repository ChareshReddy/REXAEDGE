import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { loginUser, warmupAuth } from '../services/api';
import { useToast } from '../context/ToastContext';
import rexaedgeLogo from '../assets/rexaedge_logo.png';
import HeroIllustration from './HeroIllustration';
import './Login.css';

export default function Login({ onLoginSuccess }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [slowNotice, setSlowNotice] = useState('');
  const usernameInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  useEffect(() => {
    warmupAuth();
    if (usernameInputRef.current) {
      usernameInputRef.current.focus();
    }
  }, []);

  const clearErrors = () => {
    if (errorMessage) setErrorMessage('');
    if (slowNotice) setSlowNotice('');
    if (toast?.clearAll) toast.clearAll();
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
    const slowTimer = setTimeout(() => {
      setSlowNotice('Connecting to the sign-in service...');
    }, 4000);

    try {
      const result = await loginUser(cleanUser, password);
      setPassword('');
      if (result.success && result.user) {
        if (toast?.clearAll) toast.clearAll();
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setPassword('');
      if (err.response?.status === 429) {
        setErrorMessage(
          err.response?.data?.error ||
          'Too many failed attempts. Please wait 15 minutes before retrying.'
        );
      } else {
        setErrorMessage(
          err.response?.data?.error ||
          "Can't reach the sign-in service right now. Please try again."
        );
      }
    } finally {
      clearTimeout(slowTimer);
      setSlowNotice('');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ================= LEFT BRAND PANEL (55%) ================= */}
      <section className="lg-brand-panel" aria-label="Brand Overview">
        {/* Glows and Geometric Pattern Overlay */}
        <div className="lg-radial-glow-1" aria-hidden="true" />
        <div className="lg-radial-glow-2" aria-hidden="true" />
        <div className="lg-geometric-overlay" aria-hidden="true" />

        <div className="lg-brand-top">
          <div className="lg-logo-badge">
            <img
              src={rexaedgeLogo}
              alt="RexaEdge"
              className="lg-logo-img"
            />
          </div>
        </div>

        <div className="lg-brand-content">
          <div className="lg-heading-block">
            <h1 className="lg-headline">SAP operations hub</h1>
            <div className="lg-tagline">Automate. Integrate. Execute.</div>
            <p className="lg-description">
              Unified enterprise gateway for streamlined SAP workflows and intelligent master data management.
            </p>
          </div>

          {/* Hero Illustration: Laptop on glowing platform with 5 floating glass tiles */}
          <HeroIllustration />
        </div>

        <div className="lg-brand-footer">
          RexaEdge a product of - Next IT Point
        </div>
      </section>

      {/* ================= RIGHT FORM PANEL (45%) ================= */}
      <main className="lg-form-panel">
        <div className="lg-card-wrapper">
          {/* Absolutely positioned error overlay above the card (0px layout shift) */}
          {errorMessage && (
            <div className="lg-error-overlay" role="alert">
              <AlertCircle size={16} strokeWidth={2} className="lg-error-icon" aria-hidden="true" />
              <span className="lg-error-text">{errorMessage}</span>
            </div>
          )}
          {slowNotice && !errorMessage && (
            <div className="lg-error-overlay lg-slow-notice" role="status">
              <Loader2 size={16} strokeWidth={2} className="lg-spinner" aria-hidden="true" />
              <span className="lg-error-text">{slowNotice}</span>
            </div>
          )}

          <div className="lg-card">
            <div className="lg-card-header">
              <div className="lg-icon-tile" aria-hidden="true">
                <ShieldCheck size={22} strokeWidth={2} />
              </div>
              <h2 className="lg-card-title">Welcome back</h2>
              <p className="lg-card-subtitle">
                Sign in to access your SAP operations
              </p>
            </div>

            <form onSubmit={handleSubmit} className="lg-form" noValidate>
              {/* Email field */}
              <div className="lg-field-group">
                <label htmlFor="login-email" className="lg-label">
                  Email address
                </label>
                <div className="lg-input-wrap">
                  <Mail size={16} strokeWidth={1.75} className="lg-input-icon" aria-hidden="true" />
                  <input
                    id="login-email"
                    ref={usernameInputRef}
                    type="email"
                    value={username}
                    onChange={handleEmailChange}
                    placeholder="Ex. user@nextitpoint.com"
                    autoComplete="username"
                    inputMode="email"
                    required
                    disabled={isLoading}
                    className="lg-input"
                  />
                </div>
              </div>

              {/* Password field */}
              <div className="lg-field-group">
                <label htmlFor="login-password" className="lg-label">
                  Password
                </label>
                <div className="lg-input-wrap">
                  <Lock size={16} strokeWidth={1.75} className="lg-input-icon" aria-hidden="true" />
                  <input
                    id="login-password"
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={handlePasswordChange}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    disabled={isLoading}
                    className="lg-input lg-input-password"
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    disabled={isLoading}
                    className="lg-toggle-eye"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={0}
                  >
                    {showPassword ? (
                      <EyeOff size={16} strokeWidth={1.75} />
                    ) : (
                      <Eye size={16} strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="lg-submit-btn"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} strokeWidth={2} className="lg-spinner" aria-hidden="true" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span className="lg-btn-text">Sign in</span>
                    <ArrowRight size={18} strokeWidth={2} className="lg-btn-icon" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="lg-footer-copy">
            © 2026 RexaEdge. All rights reserved.
          </div>
        </div>
      </main>
    </div>
  );
}
