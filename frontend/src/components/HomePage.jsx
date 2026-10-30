import React, { useState } from 'react';
import {
  LayoutGrid,
  ArrowRight,
  Users,
  Settings,
  CheckCircle2,
  Zap,
  BarChart3,
  ShieldCheck,
  Building2,
  Mail,
  Phone,
  MapPin,
  X,
  Send,
  Cpu,
  Layers,
  Database,
  Check
} from 'lucide-react';
import heroLaptopBg from '../assets/hero_laptop_bg.webp';
import nitpBuildingImg from '../assets/about_nitp_building.webp';
import rexaLaptopImg from '../assets/about_rexa_laptop.webp';
import rexaedgeWhiteLogo from '../assets/rexaedge_white.png';
import './HomePage.css';

export default function HomePage({
  onExploreProducts,
  onNavigateHome,
  onOpenAbout,
  onOpenContact,
  user,
  sapSession,
  selectedServer
}) {
  const [activeModal, setActiveModal] = useState(null); // 'nitp' | 'rexaedge' | 'contact' | 'about_all'
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const handleOpenNitp = () => setActiveModal('nitp');
  const handleOpenRexa = () => setActiveModal('rexaedge');
  const handleOpenContact = () => {
    setContactSubmitted(false);
    setActiveModal('contact');
  };
  const handleOpenAboutAll = () => setActiveModal('about_all');
  const closeModal = () => setActiveModal(null);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    setContactSubmitted(true);
    setTimeout(() => {
      setContactSubmitted(false);
      setActiveModal(null);
      setContactForm({ name: '', email: '', message: '' });
    }, 2000);
  };

  return (
    <div className="rexa-home-page">
      {/* 1. HERO SECTION */}
      <section className="rexa-hero-section">
        {/* Background photo & gradient overlay */}
        <div className="rexa-hero-bg-wrapper">
          <img
            src={heroLaptopBg}
            alt=""
            className="rexa-hero-laptop-photo"
          />
          <div className="rexa-hero-fade-overlay" />
        </div>

        <div className="rexa-hero-container">
          {/* Hero Left Content */}
          <div className="rexa-hero-content-col">
            <div className="rexa-hero-eyebrow">
              SMART &nbsp;•&nbsp; SECURE &nbsp;•&nbsp; SCALABLE
            </div>

            <h1 className="rexa-hero-heading">
              The AI Edge<br />
              for <span className="rexa-hero-blue-text">Your ERP</span>
            </h1>

            <p className="rexa-hero-paragraph">
              RexaEdge empowers manufacturing and supply chain operations with
              intelligent SAP automation, built for efficiency and accuracy.
            </p>

            {/* Explore Products Card */}
            <div
              className="rexa-explore-card"
              onClick={onExploreProducts}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onExploreProducts();
                }
              }}
              title="Explore SAP Products"
            >
              <div className="rexa-explore-icon-tile">
                <LayoutGrid size={28} className="rexa-explore-grid-icon" />
              </div>

              <div className="rexa-explore-info">
                <div className="rexa-explore-title">Explore Products</div>
                <div className="rexa-explore-desc">
                  Access SAP modules like Bill of Materials, Routing, Production Orders and more.
                </div>
              </div>

              <div className="rexa-explore-arrow-btn">
                <ArrowRight size={18} />
              </div>
            </div>
          </div>

          {/* Hero Staggered Glass Chips */}
          <div className="rexa-hero-chips-col">
            <div className="rexa-glass-chip rexa-chip-1">
              <div className="rexa-chip-icon-wrap">
                <Settings size={22} />
              </div>
              <div className="rexa-chip-text">
                <span className="rexa-chip-line1">Automate</span>
                <span className="rexa-chip-line2">SAP Processes</span>
              </div>
            </div>

            <div className="rexa-glass-chip rexa-chip-2">
              <div className="rexa-chip-icon-wrap">
                <BarChart3 size={22} />
              </div>
              <div className="rexa-chip-text">
                <span className="rexa-chip-line1">Improve</span>
                <span className="rexa-chip-line2">Operational Efficiency</span>
              </div>
            </div>

            <div className="rexa-glass-chip rexa-chip-3">
              <div className="rexa-chip-icon-wrap">
                <ShieldCheck size={22} />
              </div>
              <div className="rexa-chip-text">
                <span className="rexa-chip-line1">Reliable</span>
                <span className="rexa-chip-line2">&amp; Secure</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. ABOUT CARDS SECTION */}
      <section className="rexa-about-section" id="about-section">
        <div className="rexa-about-grid">
          {/* Card 1: About Next IT Point */}
          <div className="rexa-about-card">
            <div className="rexa-about-card-body">
              <h2 className="rexa-about-heading">
                About <span className="rexa-about-blue-title">Next IT Point</span>
              </h2>

              <p className="rexa-about-desc">
                Next IT Point Intellectual Services Pvt. Ltd. is a technology solutions company focused on delivering innovative IT services, consulting, and digital transformation solutions. We help businesses optimize their operations through the power of technology, cloud, and data.
              </p>

              {/* 3 feature pills */}
              <div className="rexa-about-pills-row">
                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle blue">
                    <Users size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Expert Team</strong>
                    <span className="rexa-about-pill-sub">Skilled Professionals</span>
                  </div>
                </div>

                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle blue">
                    <Settings size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Innovative Solutions</strong>
                    <span className="rexa-about-pill-sub">Business Focused</span>
                  </div>
                </div>

                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle blue">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Trusted Partner</strong>
                    <span className="rexa-about-pill-sub">Client Success</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="rexa-about-learn-more"
                onClick={handleOpenNitp}
              >
                <span>Learn More</span>
                <ArrowRight size={15} />
              </button>
            </div>

            <div className="rexa-about-card-img-wrap">
              <img
                src={nitpBuildingImg}
                alt="Next IT Point Headquarters"
                className="rexa-about-card-img"
              />
            </div>
          </div>

          {/* Card 2: About RexaEdge */}
          <div className="rexa-about-card">
            <div className="rexa-about-card-body">
              <h2 className="rexa-about-heading">
                About <span className="rexa-about-blue-title">RexaEdge</span>
              </h2>

              <p className="rexa-about-desc">
                RexaEdge is an AI-powered SAP automation platform designed to simplify and accelerate manufacturing and supply chain processes. We enable businesses to achieve higher efficiency, accuracy, and productivity in their ERP operations.
              </p>

              {/* 3 feature pills */}
              <div className="rexa-about-pills-row">
                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle amber">
                    <Zap size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Automation</strong>
                    <span className="rexa-about-pill-sub">Faster Operations</span>
                  </div>
                </div>

                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle blue">
                    <BarChart3 size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Efficiency</strong>
                    <span className="rexa-about-pill-sub">Optimized Processes</span>
                  </div>
                </div>

                <div className="rexa-about-pill">
                  <div className="rexa-about-pill-circle blue">
                    <ShieldCheck size={16} />
                  </div>
                  <div className="rexa-about-pill-text">
                    <strong className="rexa-about-pill-heading">Scalability</strong>
                    <span className="rexa-about-pill-sub">Enterprise Ready</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="rexa-about-learn-more"
                onClick={handleOpenRexa}
              >
                <span>Learn More</span>
                <ArrowRight size={15} />
              </button>
            </div>

            <div className="rexa-about-card-img-wrap">
              <img
                src={rexaLaptopImg}
                alt="RexaEdge Enterprise System"
                className="rexa-about-card-img"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. FOOTER */}
      <footer className="rexa-footer">
        <div className="rexa-footer-inner">
          <div className="rexa-footer-logo-box">
            <img
              src={rexaedgeWhiteLogo}
              alt="RexaEdge - The AI Edge for Your ERP"
              className="rexa-footer-logo-img"
            />
          </div>

          <div className="rexa-footer-nav-box">
            <button
              type="button"
              className="rexa-footer-link active"
              onClick={onNavigateHome}
            >
              Home
            </button>
            <span className="rexa-footer-sep">|</span>
            <button
              type="button"
              className="rexa-footer-link"
              onClick={handleOpenAboutAll}
            >
              About Us
            </button>
            <span className="rexa-footer-sep">|</span>
            <button
              type="button"
              className="rexa-footer-link"
              onClick={handleOpenContact}
            >
              Contact
            </button>
          </div>

          <div className="rexa-footer-legal-box">
            <div className="rexa-footer-line1">
              © 2026 RexaEdge. All rights reserved.
            </div>
            <div className="rexa-footer-line2">
              A product of Next IT Point Intellectual Services Pvt. Ltd.
            </div>
          </div>
        </div>
      </footer>

      {/* MODAL: Next IT Point */}
      {activeModal === 'nitp' && (
        <div className="rexa-modal-backdrop" onClick={closeModal}>
          <div className="rexa-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="rexa-modal-header">
              <div className="rexa-modal-title-wrap">
                <Building2 size={22} className="rexa-modal-icon-blue" />
                <h3>About Next IT Point Intellectual Services</h3>
              </div>
              <button type="button" className="rexa-modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="rexa-modal-body">
              <div className="rexa-modal-banner">
                <img src={nitpBuildingImg} alt="Next IT Point" className="rexa-modal-banner-img" />
                <div>
                  <h4>Next IT Point Intellectual Services Pvt. Ltd.</h4>
                  <p>Enterprise Technology Solutions, Cloud &amp; Digital Transformation</p>
                </div>
              </div>
              <p className="rexa-modal-desc">
                Next IT Point Intellectual Services Pvt. Ltd. delivers cutting-edge digital transformation, SAP ERP integrations, and cloud infrastructure for manufacturing and supply chains.
              </p>
            </div>
            <div className="rexa-modal-footer">
              <button type="button" className="rexa-btn-secondary" onClick={closeModal}>Close</button>
              <button type="button" className="rexa-btn-primary" onClick={() => { closeModal(); handleOpenContact(); }}>
                <Mail size={15} />
                <span>Contact Next IT Point</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RexaEdge */}
      {activeModal === 'rexaedge' && (
        <div className="rexa-modal-backdrop" onClick={closeModal}>
          <div className="rexa-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="rexa-modal-header">
              <div className="rexa-modal-title-wrap">
                <Zap size={22} className="rexa-modal-icon-blue" />
                <h3>About RexaEdge AI SAP Automation</h3>
              </div>
              <button type="button" className="rexa-modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="rexa-modal-body">
              <div className="rexa-modal-banner">
                <img src={rexaLaptopImg} alt="RexaEdge" className="rexa-modal-banner-img" />
                <div>
                  <h4>RexaEdge Enterprise Platform</h4>
                  <p>The AI Edge for Your ERP — Certified SAP Connectivity</p>
                </div>
              </div>
              <p className="rexa-modal-desc">
                RexaEdge is an AI-powered SAP automation platform designed to simplify and accelerate manufacturing, engineering, and supply chain processes.
              </p>
            </div>
            <div className="rexa-modal-footer">
              <button type="button" className="rexa-btn-secondary" onClick={closeModal}>Close</button>
              <button type="button" className="rexa-btn-primary" onClick={() => { closeModal(); onExploreProducts(); }}>
                <LayoutGrid size={15} />
                <span>Explore Products</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: About Us (Combined) */}
      {activeModal === 'about_all' && (
        <div className="rexa-modal-backdrop" onClick={closeModal}>
          <div className="rexa-modal-dialog rexa-modal-dialog-large" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="rexa-modal-header">
              <div className="rexa-modal-title-wrap">
                <ShieldCheck size={22} className="rexa-modal-icon-blue" />
                <h3>About Next IT Point &amp; RexaEdge</h3>
              </div>
              <button type="button" className="rexa-modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="rexa-modal-body">
              <div className="rexa-about-split-row">
                <div className="rexa-about-split-card">
                  <img src={nitpBuildingImg} alt="Next IT Point" className="rexa-about-split-thumb" />
                  <h4>Next IT Point Intellectual Services</h4>
                  <p>Specializing in enterprise cloud architecture, IT consulting, and system integration.</p>
                </div>
                <div className="rexa-about-split-card">
                  <img src={rexaLaptopImg} alt="RexaEdge" className="rexa-about-split-thumb" />
                  <h4>RexaEdge ERP Automation</h4>
                  <p>AI-driven SAP operations with live RFC synchronization and enterprise safety guardrails.</p>
                </div>
              </div>
            </div>
            <div className="rexa-modal-footer">
              <button type="button" className="rexa-btn-secondary" onClick={closeModal}>Close</button>
              <button type="button" className="rexa-btn-primary" onClick={() => { closeModal(); handleOpenContact(); }}>
                <Mail size={15} />
                <span>Get in Touch</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Contact */}
      {activeModal === 'contact' && (
        <div className="rexa-modal-backdrop" onClick={closeModal}>
          <div className="rexa-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="rexa-modal-header">
              <div className="rexa-modal-title-wrap">
                <Mail size={22} className="rexa-modal-icon-blue" />
                <h3>Contact Next IT Point / RexaEdge</h3>
              </div>
              <button type="button" className="rexa-modal-close-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>
            <div className="rexa-modal-body">
              {contactSubmitted ? (
                <div className="rexa-contact-success">
                  <div className="rexa-success-check-circle"><Check size={32} /></div>
                  <h4>Thank you for reaching out!</h4>
                  <p>Your message has been sent to our enterprise solutions team.</p>
                </div>
              ) : (
                <div className="rexa-contact-layout">
                  <div className="rexa-contact-info-panel">
                    <h4>Direct Channels</h4>
                    <p>Contact our solution architects for demos, licensing, or custom SAP modules.</p>
                    <div className="rexa-contact-item">
                      <Mail size={16} className="rexa-contact-item-icon" />
                      <div>
                        <strong>Email Us</strong>
                        <span>support@nextitpoint.com</span>
                      </div>
                    </div>
                    <div className="rexa-contact-item">
                      <Phone size={16} className="rexa-contact-item-icon" />
                      <div>
                        <strong>Phone</strong>
                        <span>+91 98765 43210</span>
                      </div>
                    </div>
                    <div className="rexa-contact-item">
                      <MapPin size={16} className="rexa-contact-item-icon" />
                      <div>
                        <strong>Office</strong>
                        <span>Next IT Point Intellectual Services Pvt. Ltd.</span>
                      </div>
                    </div>
                  </div>

                  <form className="rexa-contact-form" onSubmit={handleContactSubmit}>
                    <div className="rexa-form-field">
                      <label htmlFor="ct-name">Full Name</label>
                      <input
                        id="ct-name"
                        type="text"
                        required
                        placeholder="John Doe"
                        value={contactForm.name}
                        onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      />
                    </div>
                    <div className="rexa-form-field">
                      <label htmlFor="ct-email">Corporate Email</label>
                      <input
                        id="ct-email"
                        type="email"
                        required
                        placeholder="john@company.com"
                        value={contactForm.email}
                        onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      />
                    </div>
                    <div className="rexa-form-field">
                      <label htmlFor="ct-msg">Message</label>
                      <textarea
                        id="ct-msg"
                        required
                        rows={3}
                        placeholder="Your inquiry..."
                        value={contactForm.message}
                        onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      />
                    </div>
                    <button type="submit" className="rexa-contact-submit-btn">
                      <Send size={15} />
                      <span>Send Inquiry</span>
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
