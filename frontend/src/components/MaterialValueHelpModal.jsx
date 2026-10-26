import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle, Filter } from 'lucide-react';
import { searchMaterials } from '../services/api';

const COMMON_MTARTS = [
  { value: '', label: 'All Types' },
  { value: 'FERT', label: 'FERT · Finished Product' },
  { value: 'HALB', label: 'HALB · Semi-Finished' },
  { value: 'ROH', label: 'ROH · Raw Material' },
  { value: 'HAWA', label: 'HAWA · Trading Goods' },
  { value: 'VERP', label: 'VERP · Packaging' }
];

export default function MaterialValueHelpModal({
  isOpen,
  initialValue = '',
  plant: initialPlant = '',
  onSelect,
  onClose
}) {
  const [searchTerm, setSearchTerm] = useState(initialValue || '');
  const [selectedPlant, setSelectedPlant] = useState(initialPlant || '');
  const [selectedMtart, setSelectedMtart] = useState('');
  const [hasBomOnly, setHasBomOnly] = useState(false);

  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isEmptySearch, setIsEmptySearch] = useState(false);
  const [isCapped, setIsCapped] = useState(false);

  const searchInputRef = useRef(null);
  const tableContainerRef = useRef(null);
  const modalDialogRef = useRef(null);
  const rowRefs = useRef([]);
  const abortControllerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Sync initial search query and lock body scroll without reflow
  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialValue || '');
      setSelectedPlant(initialPlant || '');
      setSelectedMtart('');
      setHasBomOnly(false);
      setSelectedIndex(0);

      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Autofocus search input
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
      }, 40);

      return () => {
        document.body.style.overflow = originalOverflow;
        clearTimeout(timer);
      };
    }
  }, [isOpen, initialValue, initialPlant]);

  // Main fetch function
  const fetchMaterials = useCallback(
    async (query, mode = 'auto') => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      const isQueryEmpty = !query || !query.trim();
      setIsEmptySearch(isQueryEmpty);

      try {
        const fetchLimit = isQueryEmpty ? 100 : 500;
        const res = await searchMaterials(
          {
            query: query.trim(),
            plant: selectedPlant.trim() || undefined,
            mtart: selectedMtart || undefined,
            checkBom: hasBomOnly,
            limit: fetchLimit,
            mode: mode === 'prefix' ? 'prefix' : undefined
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return;

        const list = res?.data || [];
        setMaterials(list);
        setIsCapped(list.length >= 500);
        setSelectedIndex(list.length > 0 ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('[MaterialValueHelp] Fetch error:', err.message);
        setError(err.response?.data?.error || err.message || 'Failed to load materials from SAP');
        setMaterials([]);
        setSelectedIndex(-1);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [selectedPlant, selectedMtart, hasBomOnly]
  );

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      const q = initialValue || '';
      const isCleanPrefix = /^[A-Za-z0-9_-]+$/.test(q.trim());
      fetchMaterials(q, isCleanPrefix ? 'prefix' : 'auto');
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen, initialValue, fetchMaterials]);

  // Handle live typeahead search with 250ms debounce
  const handleInputChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchMaterials(val, 'auto');
    }, 250);
  };

  // Explicit form submit (Enter / click Search button)
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchMaterials(searchTerm, 'auto');
  };

  // Keyboard navigation & Focus trap
  const handleKeyDown = (e) => {
    // Focus Trap
    if (e.key === 'Tab') {
      const dialog = modalDialogRef.current;
      if (dialog) {
        const focusable = dialog.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey) {
            if (document.activeElement === first) {
              e.preventDefault();
              last.focus();
              return;
            }
          } else {
            if (document.activeElement === last) {
              e.preventDefault();
              first.focus();
              return;
            }
          }
        }
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (materials.length > 0) {
        const next = Math.min(selectedIndex + 1, materials.length - 1);
        setSelectedIndex(next);
        rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (materials.length > 0) {
        const prev = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prev);
        rowRefs.current[prev]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (e.key === 'Enter') {
      // If search input is focused and user hasn't selected a specific row via arrow keys, submit search
      if (document.activeElement === searchInputRef.current && (selectedIndex < 0 || materials.length === 0)) {
        handleSearchSubmit(e);
        return;
      }
      // If a row is highlighted, select it
      if (selectedIndex >= 0 && selectedIndex < materials.length) {
        e.preventDefault();
        const selected = materials[selectedIndex];
        onSelect(selected.matnr, selected);
      }
    }
  };

  if (!isOpen) return null;

  const countDisplay = materials.length;
  const modalTitle = countDisplay > 0 ? `Material Number (${countDisplay} entries)` : 'Material Number';

  return createPortal(
    <div
      className="sap-f4-portal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="material-f4-title"
    >
      <div
        ref={modalDialogRef}
        className="sap-f4-modal-dialog material"
      >
        {/* Header: Title & Close Button */}
        <div className="sap-f4-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                background: 'rgba(255,255,255,0.14)',
                padding: '3px 7px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5
              }}
            >
              F4
            </span>
            <h3 id="material-f4-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
              {modalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sap-modal-close-btn"
            title="Cancel (Esc)"
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              padding: 4,
              borderRadius: 4
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Search Bar & Filters */}
        <div className="sap-f4-search-area">
          {/* Main search bar */}
          <form onSubmit={handleSearchSubmit} className="sap-f4-search-row">
            <div
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Search
                size={15}
                color="#64748b"
                style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                placeholder="Search material number or description… (Enter to search)"
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 32px 0 34px',
                  fontSize: 13,
                  border: '1px solid var(--sap-border-input, #cbd5e1)',
                  borderRadius: 6,
                  outline: 'none',
                  background: '#ffffff',
                  boxSizing: 'border-box'
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    searchInputRef.current?.focus();
                    fetchMaterials('', 'auto');
                  }}
                  style={{
                    position: 'absolute',
                    right: 8,
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 2
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              style={{
                height: 36,
                padding: '0 18px',
                fontSize: 12.5,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={14} className="sap-spin" /> : <Search size={14} />}
              <span>Search</span>
            </button>
          </form>

          {/* Compact Filter Row: Plant, MTART, Has BOM without wrapping */}
          <div className="sap-f4-filters-row">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <Filter size={12} color="#64748b" />
              <span style={{ fontWeight: 600 }}>Filters:</span>
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <label htmlFor="f4-plant-filter">Plant:</label>
              <input
                id="f4-plant-filter"
                type="text"
                placeholder="All (e.g. 1001)"
                maxLength={4}
                value={selectedPlant}
                onChange={(e) => setSelectedPlant(e.target.value.toUpperCase())}
                onBlur={() => fetchMaterials(searchTerm, 'auto')}
                style={{
                  width: 90,
                  height: 28,
                  padding: '0 8px',
                  fontSize: 12,
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  textTransform: 'uppercase'
                }}
              />
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <label htmlFor="f4-mtart-filter">Type:</label>
              <select
                id="f4-mtart-filter"
                value={selectedMtart}
                onChange={(e) => {
                  setSelectedMtart(e.target.value);
                  setTimeout(() => fetchMaterials(searchTerm, 'auto'), 0);
                }}
                style={{
                  height: 28,
                  padding: '0 8px',
                  fontSize: 12,
                  border: '1px solid #cbd5e1',
                  borderRadius: 4,
                  background: '#ffffff'
                }}
              >
                {COMMON_MTARTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                userSelect: 'none',
                flexShrink: 0
              }}
            >
              <input
                type="checkbox"
                checked={hasBomOnly}
                onChange={(e) => {
                  setHasBomOnly(e.target.checked);
                  setTimeout(() => fetchMaterials(searchTerm, 'auto'), 0);
                }}
                style={{ margin: 0 }}
              />
              <span>Has BOM</span>
            </label>
          </div>
        </div>

        {/* Notice Banner (Empty Search / Capping / Loading / Error) */}
        {isEmptySearch && !isLoading && materials.length > 0 && (
          <div
            style={{
              padding: '6px 20px',
              background: '#eff6ff',
              borderBottom: '1px solid #dbeafe',
              fontSize: 11.5,
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0
            }}
          >
            <span>Showing first 100 – refine your search</span>
          </div>
        )}

        {isCapped && !isLoading && (
          <div
            style={{
              padding: '6px 20px',
              background: '#fffbeb',
              borderBottom: '1px solid #fef3c7',
              fontSize: 11.5,
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexShrink: 0
            }}
          >
            <span>There are more than 500 entries. Narrow your search terms for faster results.</span>
          </div>
        )}

        {/* Table Content Area: Only body scrolls */}
        <div ref={tableContainerRef} className="sap-f4-table-container">
          {isLoading ? (
            <div
              style={{
                padding: '48px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: 'var(--sap-text-muted)'
              }}
            >
              <Loader2 size={32} className="sap-spin" color="var(--sap-primary, #0a6ed1)" />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Searching SAP materials…</span>
            </div>
          ) : error ? (
            <div
              style={{
                padding: '36px 24px',
                textAlign: 'center',
                color: 'var(--sap-error, #ef4444)'
              }}
            >
              <AlertCircle size={28} style={{ margin: '0 auto 8px', display: 'block' }} />
              <p style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 500 }}>{error}</p>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={() => fetchMaterials(searchTerm, 'auto')}
                style={{ fontSize: 12, padding: '4px 12px' }}
              >
                Retry
              </button>
            </div>
          ) : materials.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--sap-text-muted)'
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>
                No matching materials found in SAP.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Try modifying your search term or clearing the active filters.
              </p>
            </div>
          ) : (
            <table className="sap-f4-table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>Material</th>
                  <th>Material Description</th>
                  <th style={{ width: 100, textAlign: 'center' }}>Material Type</th>
                  <th style={{ width: 90, textAlign: 'center' }}>Language</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <tr
                      key={`${item.matnr}-${idx}`}
                      ref={(el) => (rowRefs.current[idx] = el)}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setSelectedIndex(idx)}
                      onDoubleClick={() => onSelect(item.matnr, item)}
                    >
                      <td style={{ width: 170, fontFamily: 'monospace', fontWeight: 600, color: '#0a6ed1' }}>
                        {item.matnr}
                        {item.hasBom && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9.5,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0'
                            }}
                          >
                            BOM
                          </span>
                        )}
                      </td>
                      <td title={item.maktx || ''} style={{ color: '#1e293b' }}>
                        {item.maktx || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>(no text)</span>}
                      </td>
                      <td style={{ width: 100, textAlign: 'center' }}>
                        <span
                          style={{
                            background: '#f1f5f9',
                            padding: '2px 6px',
                            borderRadius: 3,
                            fontSize: 11,
                            fontWeight: 500,
                            color: '#475569'
                          }}
                        >
                          {item.mtart || '-'}
                        </span>
                      </td>
                      <td style={{ width: 90, textAlign: 'center', color: '#64748b' }}>
                        {item.spras || 'E'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer: Selection Summary & Action Buttons */}
        <div className="sap-f4-footer">
          <div className="sap-f4-footer-preview">
            {selectedIndex >= 0 && materials[selectedIndex] ? (
              <span title={`${materials[selectedIndex].matnr} - ${materials[selectedIndex].maktx || ''}`}>
                Selected: <strong style={{ color: '#1e293b' }}>{materials[selectedIndex].matnr}</strong>
                {materials[selectedIndex].maktx ? ` - ${materials[selectedIndex].maktx}` : ''}
              </span>
            ) : (
              <span>Double-click or press Enter to select</span>
            )}
          </div>

          <div className="sap-f4-footer-actions">
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              onClick={onClose}
              style={{ height: 32, fontSize: 12, padding: '0 14px' }}
            >
              <X size={14} style={{ marginRight: 4 }} />
              <span>Cancel (Esc)</span>
            </button>
            <button
              type="button"
              className="sap-btn sap-btn-primary"
              disabled={selectedIndex < 0 || !materials[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && materials[selectedIndex]) {
                  const sel = materials[selectedIndex];
                  onSelect(sel.matnr, sel);
                }
              }}
              style={{
                height: 32,
                fontSize: 12,
                padding: '0 16px',
                background: '#16a34a',
                borderColor: '#15803d'
              }}
            >
              <Check size={14} style={{ marginRight: 4 }} />
              <span>Select (Enter)</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
