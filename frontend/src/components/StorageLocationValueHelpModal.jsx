import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { getStorageLocations } from '../services/api';
import { lockScroll } from '../utils/scrollLock';
import { useDraggableModal } from '../hooks/useDraggableModal';
import F4PopupOverlay from './F4PopupOverlay';
import TableLoadingState from './TableLoadingState';
import F4ErrorState from './F4ErrorState';
import { extractErrorInfo } from '../utils/friendlyError';

/**
 * SAP-style F4 Value Help popup for Storage Locations (table T001L).
 * Columns: Plnt (WERKS), SLoc (LGORT), Description (LGOBE).
 * Title: "Storage Location <N> Entries"
 */
export default function StorageLocationValueHelpModal({
  isOpen,
  initialValue = '',
  plant = '',
  onSelect,
  onClose
}) {
  const [searchTerm, setSearchTerm] = useState(initialValue || '');
  const [allLocations, setAllLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCapped, setIsCapped] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef(null);
  const tableContainerRef = useRef(null);
  const modalDialogRef = useRef(null);
  const rowRefs = useRef([]);
  const abortControllerRef = useRef(null);

  const selectedIndexRef = useRef(0);
  const filteredLocationsRef = useRef([]);

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

  // Load storage locations from SAP T001L via API
  useEffect(() => {
    if (!isOpen) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    getStorageLocations(
      { plant: plant ? plant.trim().toUpperCase() : undefined },
      { signal: controller.signal }
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = res?.data || [];
        setAllLocations(list);
        setIsCapped(Boolean(res?.limitReached));
        const newIdx = list.length > 0 ? 0 : -1;
        setSelectedIndex(newIdx);
        selectedIndexRef.current = newIdx;
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[StorageLocationValueHelp] Load error:', err.message);
        setError(extractErrorInfo(err, 'Failed to load storage locations from SAP'));
        setAllLocations([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen, plant]);

  // Client-side filtering across Werks, SLoc (LGORT), and Description (LGOBE)
  const filteredLocations = useMemo(() => {
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return allLocations;

    const tokens = q.split(/\s+/).filter(Boolean);
    return allLocations.filter((item) => {
      const werks = (item.werks || '').toLowerCase();
      const lgort = (item.lgort || '').toLowerCase();
      const lgobe = (item.lgobe || '').toLowerCase();
      return tokens.every((tok) => werks.includes(tok) || lgort.includes(tok) || lgobe.includes(tok));
    });
  }, [allLocations, searchTerm]);

  useEffect(() => {
    filteredLocationsRef.current = filteredLocations;
  }, [filteredLocations]);

  // Move highlighted row by delta (+1, -1, +8, -8) and scroll into view
  const moveSelection = useCallback((delta) => {
    const list = filteredLocationsRef.current;
    if (!list || list.length === 0) return;
    const current = selectedIndexRef.current >= 0 ? selectedIndexRef.current : 0;
    const next = Math.max(0, Math.min(current + delta, list.length - 1));
    setSelectedIndex(next);
    selectedIndexRef.current = next;
    rowRefs.current[next]?.scrollIntoView({ block: 'nearest' });
  }, []);

  // Keyboard navigation capturing
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

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const list = filteredLocationsRef.current;
        const curIdx = selectedIndexRef.current;
        if (list && curIdx >= 0 && curIdx < list.length) {
          const sel = list[curIdx];
          onSelect(sel.lgort, sel);
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1);
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1);
        return;
      }

      if (e.key === 'PageDown') {
        e.preventDefault();
        moveSelection(8);
        return;
      }

      if (e.key === 'PageUp') {
        e.preventDefault();
        moveSelection(-8);
        return;
      }

      if (e.key === 'Home' && !isInput) {
        e.preventDefault();
        setSelectedIndex(0);
        selectedIndexRef.current = 0;
        rowRefs.current[0]?.scrollIntoView({ block: 'nearest' });
        return;
      }

      if (e.key === 'End' && !isInput) {
        e.preventDefault();
        const list = filteredLocationsRef.current;
        const lastIdx = Math.max(0, list.length - 1);
        setSelectedIndex(lastIdx);
        selectedIndexRef.current = lastIdx;
        rowRefs.current[lastIdx]?.scrollIntoView({ block: 'nearest' });
      }
    },
    [isOpen, onClose, onSelect, moveSelection]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [isOpen, handleDocumentKeyDown]);

  if (!isOpen) return null;

  const countDisplay = filteredLocations.length;
  // Title: "Storage Location <N> Entries"
  const modalTitle = countDisplay > 0 ? `Storage Location ${countDisplay} Entries` : 'Storage Location';

  return createPortal(
    <F4PopupOverlay
      className="sap-f4-portal-overlay"
      ariaLabelledBy="storage-location-f4-title"
    >
      <div
        ref={modalDialogRef}
        tabIndex={-1}
        className="sap-f4-modal-dialog storage-location"
        style={{
          ...dialogStyle,
          width: 'fit-content',
          minWidth: 'min(540px, 92vw)',
          maxWidth: '92vw',
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
              className="sap-f4-header-badge"
              style={{
                background: 'var(--sap-popup-header-badge-bg, #EA580C)',
                color: 'var(--sap-popup-header-badge-text, #ffffff)',
                padding: '2px 8px',
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                border: 'none',
                lineHeight: 1.4
              }}
            >
              F4
            </span>
            <h3 id="storage-location-f4-title" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--sap-popup-header-title, #0f2744)' }}>
              {modalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sap-f4-header-close sap-modal-close-btn sap-button"
            title="Cancel (Esc)"
            aria-label="Cancel (Esc)"
            data-no-drag="true"
            style={{
              width: 36,
              height: 36,
              minWidth: 36,
              minHeight: 36,
              padding: 0,
              cursor: 'pointer'
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
                placeholder={plant ? `Filter SLoc in plant ${plant}…` : 'Filter Plnt, SLoc or Description…'}
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
              className="sap-button primary sap-f4-search-btn"
              style={{
                height: 30,
                padding: '0 14px',
                fontSize: 'var(--sap-size-button)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                color: '#ffffff'
              }}
            >
              <Search size={14} color="#ffffff" style={{ stroke: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>Search</span>
            </button>
          </form>
        </div>

        {/* Row Cap Notice (500 limit) */}
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
            <span>There are more than 500 entries. Filter by plant or refine search for faster results.</span>
          </div>
        )}

        {/* Table Content: Only body scrolls */}
        <div ref={tableContainerRef} className="sap-f4-table-container">
          {isLoading ? (
            <TableLoadingState
              borderless
              minHeight={260}
              message="Loading storage locations from SAP…"
            />
          ) : error ? (
            <F4ErrorState
              error={error}
              onRetry={() => {
                setError(null);
                setIsLoading(true);
                getStorageLocations({ plant: plant || undefined })
                  .then((res) => {
                    const list = Array.isArray(res) ? res : res.data || [];
                    setAllLocations(list);
                  })
                  .catch((err) => setError(extractErrorInfo(err, 'Failed to load storage locations from SAP')))
                  .finally(() => setIsLoading(false));
              }}
            />
          ) : filteredLocations.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--sap-text-muted)'
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>
                No matching storage locations found{plant ? ` for plant ${plant}` : ''}.
              </p>
            </div>
          ) : (
            <table className="sap-table sap-f4-table" style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
              <colgroup>
                <col style={{ width: 68, minWidth: 68 }} />
                <col style={{ width: 72, minWidth: 72 }} />
                <col style={{ minWidth: 260 }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FFF7ED', borderBottom: '1px solid #FFEDD5' }}>
                  <th className="sap-f4-sticky-col" style={{ width: 68, minWidth: 68, whiteSpace: 'nowrap', position: 'sticky', left: 0, top: 0, zIndex: 4, background: '#FFF7ED' }}>Plnt</th>
                  <th style={{ width: 72, minWidth: 72, whiteSpace: 'nowrap' }}>SLoc</th>
                  <th style={{ whiteSpace: 'nowrap', minWidth: 260 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const rowBg = isSelected ? '#FFEDD5' : idx % 2 === 1 ? '#fafbfc' : '#ffffff';
                  return (
                    <tr
                      key={`${item.werks}-${item.lgort}-${idx}`}
                      ref={(el) => (rowRefs.current[idx] = el)}
                      className={isSelected ? 'selected' : ''}
                      style={{
                        cursor: 'pointer',
                        background: rowBg,
                        borderBottom: '1px solid #f1f5f9'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedIndex(idx);
                        selectedIndexRef.current = idx;
                        modalDialogRef.current?.focus();
                      }}
                      onDoubleClick={() => onSelect(item.lgort, item)}
                    >
                      <td
                        className="sap-f4-sticky-col"
                        style={{
                          width: 68,
                          minWidth: 68,
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: '#475569',
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: rowBg
                        }}
                      >
                        {item.werks}
                      </td>
                      <td style={{ width: 72, minWidth: 72, fontFamily: 'monospace', fontWeight: 700, color: isSelected ? '#C2410C' : '#0a6ed1' }}>
                        {item.lgort}
                      </td>
                      <td
                        className="sap-f4-col-text"
                        title={item.lgobe || ''}
                        style={{
                          color: '#1e293b',
                          fontWeight: 500,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflow: 'visible',
                          lineHeight: 1.4,
                          minWidth: 260
                        }}
                      >
                        {item.lgobe || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="sap-f4-footer" style={{ borderTop: '1px solid #FFEDD5', background: '#FFF7ED' }}>
          <div className="sap-f4-footer-preview" style={{ color: 'var(--sap-text-secondary)', fontSize: 13 }}>
            {selectedIndex >= 0 && filteredLocations[selectedIndex] ? (
              <span title={`${filteredLocations[selectedIndex].werks} / ${filteredLocations[selectedIndex].lgort} - ${filteredLocations[selectedIndex].lgobe || ''}`}>
                Selected: <strong style={{ color: 'var(--sap-text-primary)' }}>{filteredLocations[selectedIndex].lgort}</strong>
                {filteredLocations[selectedIndex].lgobe ? ` - ${filteredLocations[selectedIndex].lgobe}` : ''}
                <span style={{ marginLeft: 6, color: '#64748b', fontSize: 12 }}>
                  (Plnt: {filteredLocations[selectedIndex].werks})
                </span>
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
              <span>Cancel</span>
            </button>
            <button
              type="button"
              className="sap-button primary"
              disabled={selectedIndex < 0 || !filteredLocations[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && filteredLocations[selectedIndex]) {
                  const sel = filteredLocations[selectedIndex];
                  onSelect(sel.lgort, sel);
                }
              }}
              style={{
                height: 30,
                fontSize: 'var(--sap-size-button)',
                padding: '0 16px'
              }}
            >
              <Check size={14} style={{ marginRight: 4 }} />
              <span>Select</span>
            </button>
          </div>
        </div>
      </div>
    </F4PopupOverlay>,
    document.body
  );
}
