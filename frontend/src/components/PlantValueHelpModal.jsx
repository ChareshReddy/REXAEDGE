import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { getPlants } from '../services/api';
import { lockScroll } from '../utils/scrollLock';
import { useDraggableModal } from '../hooks/useDraggableModal';

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

  const selectedIndexRef = useRef(0);
  const filteredPlantsRef = useRef([]);

  const { dialogStyle, headerProps } = useDraggableModal({
    isOpen,
    dialogRef: modalDialogRef,
    defaultTopRatio: 0.12
  });

  // Keep refs in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Sync initial query when opened and lock body scroll
  useEffect(() => {
    if (isOpen) {
      setSearchTerm(initialValue || '');
      setSelectedIndex(0);
      selectedIndexRef.current = 0;

      const unlock = lockScroll();

      // Autofocus search input
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select?.();
      }, 40);

      return () => {
        unlock();
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
        const newIdx = list.length > 0 ? 0 : -1;
        setSelectedIndex(newIdx);
        selectedIndexRef.current = newIdx;
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

  useEffect(() => {
    filteredPlantsRef.current = filteredPlants;
  }, [filteredPlants]);

  // Move highlighted row by delta (+1, -1, +8, -8, etc.) and scroll into view
  const moveSelection = useCallback((delta) => {
    const list = filteredPlantsRef.current;
    if (!list || list.length === 0) return;
    const current = selectedIndexRef.current >= 0 ? selectedIndexRef.current : 0;
    const next = Math.max(0, Math.min(current + delta, list.length - 1));
    setSelectedIndex(next);
    selectedIndexRef.current = next;
    rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
  }, []);

  // Document-level keydown handler (capturing phase) to prevent scrolling page behind
  const handleDocumentKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;

      const isInput =
        document.activeElement &&
        (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA' ||
          document.activeElement.tagName === 'SELECT');

      // Focus trap
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
              if (document.activeElement === first || !dialog.contains(document.activeElement)) {
                e.preventDefault();
                last.focus();
              }
            } else {
              if (document.activeElement === last || !dialog.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
              }
            }
          }
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        moveSelection(1);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        moveSelection(-1);
        return;
      }

      if (e.key === 'PageDown') {
        e.preventDefault();
        e.stopPropagation();
        moveSelection(8);
        return;
      }

      if (e.key === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        moveSelection(-8);
        return;
      }

      if (e.key === 'Home') {
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          moveSelection(-filteredPlantsRef.current.length);
        }
        return;
      }

      if (e.key === 'End') {
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          moveSelection(filteredPlantsRef.current.length);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        const idx = selectedIndexRef.current;
        const list = filteredPlantsRef.current;
        if (idx >= 0 && idx < list.length) {
          const selected = list[idx];
          if (selected) {
            onSelect(selected.werks, selected);
          }
        }
      }
    },
    [isOpen, moveSelection, onClose, onSelect]
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [isOpen, handleDocumentKeyDown]);

  if (!isOpen) return null;

  const countDisplay = filteredPlants.length;
  const modalTitle = countDisplay > 0 ? `Plant (${countDisplay} entries)` : 'Plant';

  return createPortal(
    <div
      className="sap-f4-portal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-f4-title"
    >
      <div
        ref={modalDialogRef}
        tabIndex={-1}
        className="sap-f4-modal-dialog plant"
        style={{
          ...dialogStyle,
          outline: 'none',
          maxHeight: '82vh'
        }}
      >
        {/* Header (Draggable) */}
        <div
          className="sap-f4-header"
          {...headerProps}
          style={{
            ...headerProps.style,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
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
            className="sap-modal-close-btn sap-button"
            title="Cancel (Esc)"
            aria-label="Close dialog"
            data-no-drag="true"
            style={{
              height: 28,
              minHeight: 28,
              padding: '0 8px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={16} />
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
            style={{ display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <Search
                size={14}
                color="var(--sap-text-secondary)"
                style={{ position: 'absolute', left: 8, pointerEvents: 'none' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                }}
                className="sap-input"
                placeholder="Search plant code, name, or city… (e.g. 1001 or Delhi)"
                style={{
                  width: '100%',
                  height: 30,
                  padding: '0 28px 0 28px',
                  fontSize: 'var(--sap-size-input)',
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
                    right: 6,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--sap-text-secondary)',
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
              className="sap-button primary"
              style={{
                height: 30,
                padding: '0 14px',
                fontSize: 'var(--sap-size-button)',
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
              <span style={{ fontSize: 13, fontWeight: 500 }}>Loading SAP plants…</span>
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
            <table className="sap-table sap-f4-table">
              <colgroup>
                <col style={{ width: 80 }} />
                <col style={{ width: '45%' }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ width: 80, whiteSpace: 'nowrap' }}>Plnt</th>
                  <th style={{ width: '45%', whiteSpace: 'nowrap' }}>Name 1</th>
                  <th style={{ whiteSpace: 'nowrap' }}>City / Location</th>
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
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedIndex(idx);
                        selectedIndexRef.current = idx;
                        modalDialogRef.current?.focus();
                      }}
                      onDoubleClick={() => onSelect(p.werks, p)}
                    >
                      <td style={{ width: 80, fontFamily: 'monospace', fontWeight: 700, color: '#0a6ed1' }}>
                        <span style={{ verticalAlign: 'middle' }}>{p.werks}</span>
                        {p.isExtended && (
                          <span
                            title="Maintained in Plant"
                            style={{
                              marginLeft: 5,
                              fontSize: 9,
                              padding: '1px 4px',
                              borderRadius: 3,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              verticalAlign: 'middle'
                            }}
                          >
                            Ext
                          </span>
                        )}
                      </td>
                      <td
                        title={p.name1 || ''}
                        style={{
                          width: '45%',
                          color: '#1e293b',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {p.name1 || '-'}
                      </td>
                      <td
                        title={p.ort01 || ''}
                        style={{
                          color: '#64748b',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
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
        <div className="sap-f4-footer" style={{ borderTop: '1px solid var(--sap-border-color)', background: 'var(--sap-panel-bg)' }}>
          <div className="sap-f4-footer-preview" style={{ color: 'var(--sap-text-secondary)', fontSize: 13 }}>
            {selectedIndex >= 0 && filteredPlants[selectedIndex] ? (
              <span title={`${filteredPlants[selectedIndex].werks} - ${filteredPlants[selectedIndex].name1 || ''}`}>
                Selected: <strong style={{ color: 'var(--sap-text-primary)' }}>{filteredPlants[selectedIndex].werks}</strong>
                {filteredPlants[selectedIndex].name1 ? ` - ${filteredPlants[selectedIndex].name1}` : ''}
              </span>
            ) : (
              <span>Double-click or press Enter to select</span>
            )}
          </div>

          <div className="sap-f4-footer-actions" style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="sap-button"
              onClick={onClose}
              style={{ height: 30, fontSize: 'var(--sap-size-button)', padding: '0 14px' }}
            >
              <X size={14} style={{ marginRight: 4 }} />
              <span>Cancel (Esc)</span>
            </button>
            <button
              type="button"
              className="sap-button primary"
              disabled={selectedIndex < 0 || !filteredPlants[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && filteredPlants[selectedIndex]) {
                  const sel = filteredPlants[selectedIndex];
                  onSelect(sel.werks, sel);
                }
              }}
              style={{
                height: 30,
                fontSize: 'var(--sap-size-button)',
                padding: '0 16px'
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
