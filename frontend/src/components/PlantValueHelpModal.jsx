import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { getPlants } from '../services/api';

export default function PlantValueHelpModal({
  isOpen,
  initialValue = '',
  material = '',
  onSelect,
  onClose
}) {
  const [searchTerm, setSearchTerm] = useState(initialValue || '');
  const [allPlants, setAllPlants] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef(null);
  const tableContainerRef = useRef(null);
  const modalDialogRef = useRef(null);
  const rowRefs = useRef([]);
  const abortControllerRef = useRef(null);

  // Sync initial query when opened and lock body scroll
  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialValue || '');
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
  }, [isOpen, initialValue]);

  // Load plants list once
  useEffect(() => {
    if (!isOpen) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    getPlants({ material: material || undefined }, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = res?.data || [];
        setAllPlants(list);
        setSelectedIndex(list.length > 0 ? 0 : -1);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[PlantValueHelp] Load error:', err.message);
        setError(err.response?.data?.error || err.message || 'Failed to load plants from SAP');
        setAllPlants([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, material]);

  // Client-side filtering across Werks, Name1, and Ort01
  const filteredPlants = useMemo(() => {
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return allPlants;

    return allPlants.filter((p) => {
      const werks = (p.werks || '').toLowerCase();
      const name = (p.name1 || '').toLowerCase();
      const city = (p.ort01 || '').toLowerCase();
      return werks.includes(q) || name.includes(q) || city.includes(q);
    });
  }, [allPlants, searchTerm]);

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
      if (filteredPlants.length > 0) {
        const next = Math.min(selectedIndex + 1, filteredPlants.length - 1);
        setSelectedIndex(next);
        rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredPlants.length > 0) {
        const prev = Math.max(selectedIndex - 1, 0);
        setSelectedIndex(prev);
        rowRefs.current[prev]?.scrollIntoView({ block: 'nearest' });
      }
      return;
    }

    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < filteredPlants.length) {
        e.preventDefault();
        const sel = filteredPlants[selectedIndex];
        onSelect(sel.werks, sel);
      }
    }
  };

  if (!isOpen) return null;

  const countDisplay = filteredPlants.length;
  const modalTitle = countDisplay > 0 ? `Plant (${countDisplay} entries)` : 'Plant';

  return createPortal(
    <div
      className="sap-f4-portal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-f4-title"
    >
      <div
        ref={modalDialogRef}
        className="sap-f4-modal-dialog plant"
      >
        {/* Header */}
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
            <h3 id="plant-f4-title" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
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

        {/* Search Bar Row: Full width, search button on same row */}
        <div className="sap-f4-search-area">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSelectedIndex(0);
            }}
            className="sap-f4-search-row"
          >
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <Search
                size={15}
                color="#64748b"
                style={{ position: 'absolute', left: 10, pointerEvents: 'none' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search plant code, name, or city… (e.g. 1001 or Delhi)"
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
                    setSelectedIndex(0);
                    searchInputRef.current?.focus();
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
            >
              <Search size={14} />
              <span>Search</span>
            </button>
          </form>
        </div>

        {/* Table Content: Only body scrolls */}
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
              <span style={{ fontSize: 13, fontWeight: 500 }}>Loading SAP plants from T001W…</span>
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
            </div>
          ) : filteredPlants.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--sap-text-muted)'
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>
                No matching plants found.
              </p>
            </div>
          ) : (
            <table className="sap-f4-table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Plnt</th>
                  <th>Name 1</th>
                  <th style={{ width: 220 }}>City / Location</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlants.map((p, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <tr
                      key={`${p.werks}-${idx}`}
                      ref={(el) => (rowRefs.current[idx] = el)}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => setSelectedIndex(idx)}
                      onDoubleClick={() => onSelect(p.werks, p)}
                    >
                      <td style={{ width: 90, fontFamily: 'monospace', fontWeight: 700, color: '#0a6ed1' }}>
                        {p.werks}
                        {p.isExtended && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 9.5,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe'
                            }}
                          >
                            Maintained
                          </span>
                        )}
                      </td>
                      <td title={p.name1 || ''} style={{ color: '#1e293b', fontWeight: 500 }}>
                        {p.name1 || '-'}
                      </td>
                      <td title={p.ort01 || ''} style={{ width: 220, color: '#64748b' }}>
                        {p.ort01 || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="sap-f4-footer">
          <div className="sap-f4-footer-preview">
            {selectedIndex >= 0 && filteredPlants[selectedIndex] ? (
              <span title={`${filteredPlants[selectedIndex].werks} - ${filteredPlants[selectedIndex].name1 || ''}`}>
                Selected: <strong style={{ color: '#1e293b' }}>{filteredPlants[selectedIndex].werks}</strong>
                {filteredPlants[selectedIndex].name1 ? ` - ${filteredPlants[selectedIndex].name1}` : ''}
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
              disabled={selectedIndex < 0 || !filteredPlants[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && filteredPlants[selectedIndex]) {
                  const sel = filteredPlants[selectedIndex];
                  onSelect(sel.werks, sel);
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
