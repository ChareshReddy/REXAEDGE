import React, { useState, useMemo, useRef } from 'react';
import {
  ArrowRight,
  Layers,
  Package,
  Route,
  ShoppingCart,
  Factory
} from 'lucide-react';
import { MODULE_REGISTRY } from '@shared/modules.js';
import { formatDisplayName } from '../utils/textFormatters';
import './HomePage.css';

const ICON_MAP = {
  Layers,
  Package,
  Route,
  ShoppingCart,
  Factory
};

// Flag to control category filter chips above the module cards
const SHOW_MODULE_FILTERS = true;

export default function HomePage({
  onExploreProducts,
  onOpenBom,
  onNavigateHome,
  user,
  sapSession,
  selectedServer,
  enabledModules = ['bom']
}) {
  const handleOpenModule = (mod) => {
    if (mod.key === 'bom' || mod.status === 'available') {
      if (onOpenBom) {
        onOpenBom();
      } else if (onExploreProducts) {
        onExploreProducts();
      }
    }
  };

  const [selectedCategory, setSelectedCategory] = useState('All');
  const tabRefs = useRef([]);

  // Dynamically derive unique categories and their total module counts from MODULE_REGISTRY
  // Order: All, then categories in the order they appear in the registry
  const { categories, categoryCounts } = useMemo(() => {
    const counts = { All: MODULE_REGISTRY.length };
    const cats = ['All'];

    MODULE_REGISTRY.forEach((m) => {
      if (m.group) {
        if (!counts[m.group]) {
          counts[m.group] = 0;
          cats.push(m.group);
        }
        counts[m.group] += 1;
      }
    });

    const validCats = cats.filter((cat) => counts[cat] > 0);
    return { categories: validCats, categoryCounts: counts };
  }, []);

  // Separate into available and coming-soon lists based on current filter
  const { availableModules, comingSoonModules, totalCount } = useMemo(() => {
    let list = MODULE_REGISTRY;
    if (selectedCategory !== 'All') {
      list = list.filter((m) => m.group === selectedCategory);
    }
    const avail = [];
    const soon = [];
    list.forEach((m) => {
      if (m.status === 'available' || m.key === 'bom') {
        avail.push(m);
      } else {
        soon.push(m);
      }
    });
    return {
      availableModules: avail,
      comingSoonModules: soon,
      totalCount: list.length
    };
  }, [selectedCategory]);

  // Keyboard navigation for tablist
  const handleKeyDown = (e, index) => {
    let targetIndex = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      targetIndex = (index + 1) % categories.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      targetIndex = (index - 1 + categories.length) % categories.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIndex = categories.length - 1;
    }
    if (targetIndex >= 0) {
      tabRefs.current[targetIndex]?.focus();
      setSelectedCategory(categories[targetIndex]);
    }
  };

  const serverName = selectedServer?.name || 'DEV';
  const rawDisplayName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');
  const displayName = formatDisplayName(rawDisplayName);
  const isConnected = Boolean(sapSession?.connected ?? true);
  const statusLabel = isConnected ? 'Online' : 'Offline';

  return (
    <div className="rexa-home-page">
      {/* 1. HERO BAND (Full content width, 16px radius, navy-to-blue gradient, subtle pattern) */}
      <section className="rx-home-hero rx-home-welcome-strip" aria-label="Welcome and System Status">
        <div className="rx-hero-pattern-overlay" aria-hidden="true" />
        <div className="rx-hero-content">
          <div className="rx-hero-text">
            <h1 className="rx-hero-title rx-welcome-title">
              Welcome back, {displayName}
            </h1>
            <p className="rx-hero-subtitle rx-welcome-subtitle">
              Connected to {serverName}
            </p>
          </div>
          <div
            className="rx-hero-status-pill"
            role="status"
            aria-label={`Server status: ${statusLabel}`}
          >
            <span
              className={`rx-hero-status-dot ${isConnected ? 'rx-dot-online' : 'rx-dot-offline'}`}
              aria-hidden="true"
            />
            <span className="rx-hero-status-text">{statusLabel}</span>
          </div>
        </div>
      </section>

      {/* 2. CATEGORY FILTER CHIPS (Directly below hero with 20px spacing) */}
      {SHOW_MODULE_FILTERS && (
        <section className="rx-home-filter-strip" aria-label="Module category filter">
          <div
            className="rx-category-chips"
            role="tablist"
            aria-label="Filter modules by category"
          >
            {categories.map((cat, idx) => {
              const isSelected = selectedCategory === cat;
              const count = categoryCounts[cat] || 0;
              return (
                <button
                  key={cat}
                  ref={(el) => (tabRefs.current[idx] = el)}
                  type="button"
                  role="tab"
                  id={`rx-category-tab-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-selected={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  className={`rx-chip-btn ${isSelected ? 'rx-chip-active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                >
                  <span className="rx-chip-label">{cat}</span>
                  <span className="rx-chip-count" aria-hidden="true">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Accessible Live Region */}
          <div className="rx-sr-only" role="status" aria-live="polite" aria-atomic="true">
            Showing {totalCount} {totalCount === 1 ? 'module' : 'modules'}
          </div>
        </section>
      )}

      {/* 3. MODULE SECTIONS: Available Modules & Coming Soon */}
      <div className="rx-home-sections">
        {/* Available Modules Section */}
        {availableModules.length > 0 && (
          <section className="rx-modules-section rx-available-section" aria-labelledby="rx-heading-available">
            <h2 id="rx-heading-available" className="rx-home-section-title">
              Available modules <span className="rx-home-section-count">({availableModules.length})</span>
            </h2>
            <div className="rx-modules-grid">
              {availableModules.map((mod) => {
                const Icon = (mod.iconName && ICON_MAP[mod.iconName]) || Layers;

                return (
                  <div
                    key={mod.key}
                    className="rx-module-card rx-card-available"
                    onClick={() => handleOpenModule(mod)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenModule(mod);
                      }
                    }}
                    aria-label={`${mod.label}: Available module`}
                  >
                    <div className="rx-card-top-content">
                      <div className="rx-card-top-row">
                        <div className="rx-icon-badge" aria-hidden="true">
                          <Icon size={24} strokeWidth={1.75} />
                        </div>
                      </div>

                      {mod.group && (
                        <div className="rx-module-group-tag">{mod.group}</div>
                      )}
                      <h3 className="rx-module-title">{mod.label}</h3>
                      <p className="rx-module-desc">{mod.desc}</p>
                    </div>

                    <div className="rx-card-bottom-row">
                      <span className="rx-open-link" aria-hidden="true">
                        <span>Open operations</span>
                        <ArrowRight size={14} strokeWidth={2} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Coming Soon Section */}
        {comingSoonModules.length > 0 && (
          <section className="rx-modules-section rx-coming-soon-section" aria-labelledby="rx-heading-coming-soon">
            <h2 id="rx-heading-coming-soon" className="rx-home-section-title">
              Coming soon <span className="rx-home-section-count">({comingSoonModules.length})</span>
            </h2>
            <div className="rx-modules-grid">
              {comingSoonModules.map((mod) => {
                const Icon = (mod.iconName && ICON_MAP[mod.iconName]) || Layers;

                return (
                  <div
                    key={mod.key}
                    className="rx-module-card rx-card-coming-soon"
                    role="article"
                    tabIndex={-1}
                    aria-label={`${mod.label}: Coming soon`}
                  >
                    <div className="rx-card-top-content">
                      <div className="rx-card-top-row">
                        <div className="rx-icon-badge" aria-hidden="true">
                          <Icon size={20} strokeWidth={1.75} />
                        </div>
                        <span className="rx-sr-only">Coming soon</span>
                      </div>

                      {mod.group && (
                        <div className="rx-module-group-tag">{mod.group}</div>
                      )}
                      <h3 className="rx-module-title">{mod.label}</h3>
                      <p className="rx-module-desc">{mod.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
