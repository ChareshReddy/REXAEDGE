import React, { useState } from 'react';
import {
  LayoutGrid,
  ArrowRight,
  Zap,
  TrendingUp,
  ShieldCheck,
  Users,
  Settings,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import heroLaptopBg from '../assets/hero_laptop_bg.webp';
import nitpBuildingImg from '../assets/about_nitp_building.webp';
import rexaEdgeFullColourLogo from '../assets/rexaedge_full_colour.png';
import './HomePage.css';

export default function HomePage({
  onExploreProducts,
  onNavigateHome
}) {
  const [isAboutHighlighted, setIsAboutHighlighted] = useState(false);

  const handleScrollToAbout = () => {
    setIsAboutHighlighted(true);
    setTimeout(() => setIsAboutHighlighted(false), 1500);

    // Only scroll if page is in scrolling fallback mode (e.g. mobile or viewport height < 760px)
    if (typeof window !== 'undefined' && (window.innerHeight < 760 || window.innerWidth < 1024)) {
      const el = document.getElementById('about-row');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="rexa-home-page">
      {/* 1. HERO SECTION (about 62 to 65% of the height, two columns) */}
      <section className="rexa-hero-section">
        <div className="rexa-hero-container">
          {/* Hero Left Content Column (vertically centered) */}
          <div className="rexa-hero-content-col">
            <div className="rexa-hero-eyebrow">
              <span>Smart</span>
              <span className="rexa-hero-eyebrow-dot">•</span>
              <span>Secure</span>
              <span className="rexa-hero-eyebrow-dot">•</span>
              <span>Scalable</span>
            </div>

            <h1 className="rexa-hero-heading">
              The AI edge <span className="rexa-hero-orange-text">for your ERP</span>
            </h1>

            <p className="rexa-hero-paragraph">
              Automate SAP bill of materials and master data work with built-in validation, fewer manual errors and a clear record of every action.
            </p>

            <div className="rexa-hero-actions">
              <button
                type="button"
                className="rexa-btn-hero-primary"
                onClick={onExploreProducts}
                title="Explore Products"
                aria-label="Explore Products"
              >
                <LayoutGrid size={16} />
                <span>Explore products</span>
                <ArrowRight size={15} className="rexa-btn-arrow" />
              </button>

              <button
                type="button"
                className="rexa-btn-hero-secondary rexa-hero-secondary-link"
                onClick={handleScrollToAbout}
                title="About us"
                aria-label="About us"
              >
                <span>About us</span>
              </button>
            </div>

            {/* Integrated 3 Value Points as a compact vertical list with 24px gap */}
            <div className="rexa-hero-values rexa-value-strip">
              <div className="rexa-hero-value-item">
                <div className="rexa-hero-value-icon-wrap" aria-hidden="true">
                  <Zap size={14} />
                </div>
                <div className="rexa-hero-value-text">
                  <span className="rexa-hero-value-title">Automate SAP processes</span>
                  <span className="rexa-hero-value-sep"> - </span>
                  <span className="rexa-hero-value-desc">Create, copy and validate BOMs without manual SAP screens.</span>
                </div>
              </div>

              <div className="rexa-hero-value-item">
                <div className="rexa-hero-value-icon-wrap" aria-hidden="true">
                  <TrendingUp size={14} />
                </div>
                <div className="rexa-hero-value-text">
                  <span className="rexa-hero-value-title">Improve efficiency</span>
                  <span className="rexa-hero-value-sep"> - </span>
                  <span className="rexa-hero-value-desc">Fewer manual errors and faster engineering changes.</span>
                </div>
              </div>

              <div className="rexa-hero-value-item">
                <div className="rexa-hero-value-icon-wrap" aria-hidden="true">
                  <ShieldCheck size={14} />
                </div>
                <div className="rexa-hero-value-text">
                  <span className="rexa-hero-value-title">Reliable and secure</span>
                  <span className="rexa-hero-value-sep"> - </span>
                  <span className="rexa-hero-value-desc">Live RFC connection, role-based access and encrypted credentials.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hero Right Image: filling hero height in rounded frame */}
          <div className="rexa-hero-image-col">
            <div className="rexa-hero-image-glow" aria-hidden="true" />
            <div className="rexa-hero-laptop-frame">
              <img
                src={heroLaptopBg}
                alt="RexaEdge SAP automation interface"
                className="rexa-hero-laptop-img"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. ABOUT BAND (about 24 to 26% of height: ONE unified card with 2 equal columns) */}
      <section className="rexa-about-section rexa-about-band" id="about-row">
        <div className="rexa-about-container">
          <div className={`rexa-about-unified-card ${isAboutHighlighted ? 'highlighted' : ''}`}>
            {/* Column 1: About Next IT Point */}
            <div className="rexa-about-col">
              <div className="rexa-about-col-content">
                <div className="rexa-about-eyebrow">Company</div>
                <h2 className="rexa-about-heading">About Next IT Point</h2>
                <p className="rexa-about-desc">
                  Next IT Point Intellectual Services Pvt. Ltd. is a technology solutions company delivering IT services, consulting and digital transformation, helping businesses run their operations on technology, cloud and data.
                </p>

                <div className="rexa-about-tags">
                  <span className="rexa-about-tag">
                    <Users size={12} aria-hidden="true" />
                    <span>Expert team</span>
                  </span>
                  <span className="rexa-about-tag">
                    <Settings size={12} aria-hidden="true" />
                    <span>Innovative solutions</span>
                  </span>
                  <span className="rexa-about-tag">
                    <CheckCircle2 size={12} aria-hidden="true" />
                    <span>Trusted partner</span>
                  </span>
                </div>
              </div>

              <div className="rexa-about-thumb-wrap">
                <img
                  src={nitpBuildingImg}
                  alt="Next IT Point Headquarters"
                  className="rexa-about-thumb-img"
                  loading="lazy"
                />
              </div>
            </div>

            {/* Vertical Divider */}
            <div className="rexa-about-col-divider" aria-hidden="true" />

            {/* Column 2: About RexaEdge */}
            <div className="rexa-about-col">
              <div className="rexa-about-col-content">
                <div className="rexa-about-eyebrow">Platform</div>
                <h2 className="rexa-about-heading">About RexaEdge</h2>
                <p className="rexa-about-desc">
                  RexaEdge is an AI-powered SAP automation platform that simplifies and speeds up manufacturing and supply chain processes, with accuracy and control built in.
                </p>

                <div className="rexa-about-tags">
                  <span className="rexa-about-tag">
                    <Zap size={12} aria-hidden="true" />
                    <span>Automation</span>
                  </span>
                  <span className="rexa-about-tag">
                    <TrendingUp size={12} aria-hidden="true" />
                    <span>Efficiency</span>
                  </span>
                  <span className="rexa-about-tag">
                    <Sparkles size={12} aria-hidden="true" />
                    <span>Scalability</span>
                  </span>
                </div>
              </div>

              <div className="rexa-about-thumb-wrap rexa-about-logo-tile">
                <img
                  src={rexaEdgeFullColourLogo}
                  alt="RexaEdge Platform Logo"
                  className="rexa-about-logo-img"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FOOTER (One slim line, about 44px, reserved first) */}
      <footer className="rexa-footer">
        <div className="rexa-footer-inner">
          <div className="rexa-footer-left">
            <span className="rexa-footer-product-text">
              A product of Next IT Point Intellectual Services Pvt. Ltd.
            </span>
          </div>

          <div className="rexa-footer-right">
            <span className="rexa-footer-copy-text">
              © 2026 RexaEdge. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
