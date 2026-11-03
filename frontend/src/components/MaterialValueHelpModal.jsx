import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { searchMaterials } from '../services/api';
import { lockScroll } from '../utils/scrollLock';
import { useDraggableModal } from '../hooks/useDraggableModal';
import F4PopupOverlay from './F4PopupOverlay';
import TableLoadingState from './TableLoadingState';
import F4ErrorState from './F4ErrorState';
import { extractErrorInfo } from '../utils/friendlyError';

export default function MaterialValueHelpModal({
  isOpen,
  initialValue = '',
  initialMaterials = null,
  searchMetadata = null,
  onBackToRestrict = null,
  onSelect,
  onClose
}) {
  const [searchTerm, setSearchTerm] = useState(initialValue || '');
  const [materials, setMaterials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
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
  const retryTimerRef = useRef(null);
  const requestIdRef = useRef(0);

  const selectedIndexRef = useRef(0);
  const materialsRef = useRef([]);

  const { dialogStyle, headerProps } = useDraggableModal({
    isOpen,
    dialogRef: modalDialogRef,
    defaultTopRatio: 0.12
  });
  const lastSearchedTermRef = useRef(initialValue || '');

  // Keep refs in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => {
    materialsRef.current = materials;
  }, [materials]);

  // Sync initial search query, lock body scroll, and clean up timers/aborts on open/close
  useEffect(() => {
    if (isOpen) {
      setSearchTerm((initialValue || '').toUpperCase());
      setSelectedIndex(0);
      selectedIndexRef.current = 0;
      lastSearchedTermRef.current = (initialValue || '').trim().toUpperCase();
      setIsRetrying(false);

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
    } else {
      // Abort in-flight requests and clear pending debounce or auto-retry timers
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
      setIsRetrying(false);
    }
  }, [isOpen, initialValue]);

  // Clean up all timers and in-flight controller on component unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  // Main fetch function - cancels previous request, ignores stale responses, auto-retries once on busy
  const fetchMaterials = useCallback(
    async (query, mode = 'auto', isRetry = false) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      // Cancel previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const currentReqId = ++requestIdRef.current;

      setIsLoading(true);
      setError(null);
      if (!isRetry) {
        setIsRetrying(false);
      }
      lastSearchedTermRef.current = (query || '').trim();

      const isQueryEmpty = !query || !query.trim();
      setIsEmptySearch(isQueryEmpty);

      try {
        const fetchLimit = isQueryEmpty ? 100 : 500;
        const res = await searchMaterials(
          {
            query: query.trim(),
            limit: fetchLimit,
            mode: mode === 'prefix' ? 'prefix' : undefined
          },
          { signal: controller.signal }
        );

        // Ignore cancelled requests or stale superseded responses
        if (controller.signal.aborted || currentReqId !== requestIdRef.current) return;

        const list = res?.data || [];
        setMaterials(list);
        materialsRef.current = list;
        setIsCapped(list.length >= 500);
        const newIdx = list.length > 0 ? 0 : -1;
        setSelectedIndex(newIdx);
        selectedIndexRef.current = newIdx;
        setIsRetrying(false);
        setIsLoading(false);
      } catch (err) {
        // Ignore aborted requests or stale responses
        if (controller.signal.aborted || currentReqId !== requestIdRef.current) return;

        const isBusy =
          err.response?.status === 503 ||
          (err.message && err.message.toLowerCase().includes('busy')) ||
          (err.response?.data?.error && String(err.response.data.error).toLowerCase().includes('busy'));

        // If server is busy and we have not auto-retried yet, auto-retry once after 1.5 seconds
        if (isBusy && !isRetry) {
          setIsRetrying(true);
          retryTimerRef.current = setTimeout(() => {
            if (currentReqId === requestIdRef.current) {
              fetchMaterials(query, mode, true);
            }
          }, 1500);
          return;
        }

        setIsRetrying(false);
        setIsLoading(false);
        console.warn('[MaterialValueHelp] Fetch error:', err.message);
        setError(extractErrorInfo(err, 'Failed to load materials from SAP'));
        setMaterials([]);
        materialsRef.current = [];
        setSelectedIndex(-1);
        selectedIndexRef.current = -1;
      }
    },
    []
  );

  // Initial load when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialMaterials && Array.isArray(initialMaterials)) {
        setMaterials(initialMaterials);
        materialsRef.current = initialMaterials;
        setIsCapped(Boolean(searchMetadata?.limitReached || initialMaterials.length >= 500));
        setIsEmptySearch(false);
        const newIdx = initialMaterials.length > 0 ? 0 : -1;
        setSelectedIndex(newIdx);
        selectedIndexRef.current = newIdx;
        setIsLoading(false);
      } else {
        const q = initialValue || '';
        const isCleanPrefix = /^[A-Za-z0-9_-]+$/.test(q.trim());
        fetchMaterials(q, isCleanPrefix ? 'prefix' : 'auto');
      }
    }
  }, [isOpen, initialValue, initialMaterials, searchMetadata, fetchMaterials]);

  // Handle live typeahead search with ~300ms debounce
  const handleInputChange = (e) => {
    const val = (e.target.value || '').toUpperCase();
    setSearchTerm(val);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      setIsRetrying(false);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchMaterials(val, 'auto');
    }, 300);
  };

  // Explicit form submit (Enter / click Search button)
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    fetchMaterials(searchTerm, 'auto');
  };

  // Move highlighted row by delta (+1, -1, +8, -8, etc.) and scroll into view
  const moveSelection = useCallback((delta) => {
    const list = materialsRef.current;
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
          moveSelection(-materialsRef.current.length);
        }
        return;
      }

      if (e.key === 'End') {
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          moveSelection(materialsRef.current.length);
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        const currentTerm = (searchTerm || '').trim();
        const lastExecuted = (lastSearchedTermRef.current || '').trim();

        // If search text changed since last executed search, execute search
        if (currentTerm !== lastExecuted) {
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          fetchMaterials(searchTerm, 'auto');
          return;
        }

        // Otherwise select highlighted row
        const idx = selectedIndexRef.current;
        const list = materialsRef.current;
        if (idx >= 0 && idx < list.length) {
          const selected = list[idx];
          if (selected) {
            onSelect(selected.matnr, selected);
          }
        }
      }
    },
    [isOpen, moveSelection, onClose, searchTerm, fetchMaterials, onSelect]
  );

  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener('keydown', handleDocumentKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleDocumentKeyDown, true);
    };
  }, [isOpen, handleDocumentKeyDown]);

  if (!isOpen) return null;

  const isTabB = searchMetadata?.tab === 'B' || searchMetadata?.tabCode === 'B';
  const countDisplay = materials.length;
  const modalTitle = isTabB
    ? (countDisplay > 0 ? `Material Number ${countDisplay} Entries` : 'Material Number')
    : (countDisplay > 0 ? `Material Number (${countDisplay} entries)` : 'Material Number');

  const tabBCriteria = isTabB && searchMetadata?.fields ? [
    { label: 'Material description', value: searchMetadata.fields.MAKTG },
    { label: 'Plant', value: searchMetadata.fields.WERKS },
    { label: 'BOM Usage', value: searchMetadata.fields.STLAN },
    { label: 'Material', value: searchMetadata.fields.MATNR }
  ].filter(c => c.value && String(c.value).trim()) : [];

  return createPortal(
    <F4PopupOverlay
      className="sap-f4-portal-overlay"
      ariaLabelledBy="material-f4-title"
    >
      <div
        ref={modalDialogRef}
        tabIndex={-1}
        className="sap-f4-modal-dialog material"
        style={{
          ...dialogStyle,
          width: 'fit-content',
          minWidth: 'min(560px, 92vw)',
          maxWidth: '92vw',
          outline: 'none',
          maxHeight: '82vh'
        }}
      >
        {/* Header: Title & Close Button (Draggable) */}
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
            <h3 id="material-f4-title" style={{ margin: 0, fontSize: 'var(--sap-size-section-header)', fontWeight: 700, color: 'var(--sap-popup-header-title, #0f2744)' }}>
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

        {/* Top Search Bar & Filters */}
        <div className="sap-f4-search-area">
          {/* Main search bar */}
          {searchMetadata && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFF7ED', border: '1px solid #FFEDD5', borderRadius: 4, padding: '4px 10px', marginBottom: 6, fontSize: 12, color: '#0f2744' }}>
              <span>Filtered by <strong>{searchMetadata.tabName || searchMetadata.tab}</strong>: {searchMetadata.count} matches found{searchMetadata.limitReached ? ' (limit reached)' : ''}</span>
              {onBackToRestrict && (
                <button type="button" onClick={onBackToRestrict} className="sap-button" style={{ padding: '2px 8px', fontSize: 11, background: '#ffffff', border: '1px solid #FDBA74', color: '#0f2744' }}>
                  <ArrowLeft size={11} style={{ marginRight: 4 }} /> Change Filter
                </button>
              )}
            </div>
          )}

          {/* Tab B SAP Criteria Header Block */}
          {isTabB && tabBCriteria.length > 0 && (
            <div
              className="sap-f4-criteria-block"
              style={{
                background: 'var(--sap-surface-elevated, #f8fafc)',
                border: '1px solid var(--sap-border-color, #e2e8f0)',
                borderRadius: 4,
                padding: '6px 12px',
                marginBottom: 6,
                fontSize: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px 24px'
              }}
            >
              {tabBCriteria.map((c) => (
                <div key={c.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--sap-text-secondary, #64748b)', fontWeight: 500 }}>
                    {c.label}:
                  </span>
                  <strong style={{ color: 'var(--sap-text-primary, #0f172a)' }}>
                    {c.value}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleSearchSubmit} className="sap-f4-search-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                position: 'relative',
                flex: 1,
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <Search
                size={14}
                color="var(--sap-text-secondary)"
                style={{ position: 'absolute', left: 8, pointerEvents: 'none' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                className="sap-input"
                placeholder="Search material number or description… (Enter to search)"
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
                    searchInputRef.current?.focus();
                    fetchMaterials('', 'auto');
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
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 size={14} className="sap-spin" color="#ffffff" style={{ stroke: '#ffffff' }} />
              ) : (
                <Search size={14} color="#ffffff" style={{ stroke: '#ffffff' }} />
              )}
              <span style={{ color: '#ffffff' }}>Search</span>
            </button>
          </form>
        </div>

       

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
            <TableLoadingState
              borderless
              minHeight={280}
              message={
                isRetrying
                  ? 'SAP server is busy. Retrying in a moment…'
                  : 'Searching SAP materials…'
              }
            />
          ) : error ? (
            <F4ErrorState
              error={error}
              onRetry={() => fetchMaterials(searchTerm, 'auto')}
            />
          ) : materials.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--sap-text-muted)'
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--sap-text-primary, #1e293b)' }}>
                {searchMetadata?.filterSummary
                  ? `No materials found for ${searchMetadata.filterSummary}`
                  : 'No matching materials found in SAP.'}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sap-text-secondary, #64748b)' }}>
                Try modifying your search criteria or clearing active filters.
              </p>
            </div>
          ) : (
            <table className="sap-table sap-f4-table" style={{ width: '100%', tableLayout: 'auto', borderCollapse: 'collapse' }}>
              <colgroup>
                {isTabB ? (
                  <>
                    <col style={{ width: 160, minWidth: 160 }} />
                    <col style={{ width: 80, minWidth: 80 }} />
                    <col style={{ width: 80, minWidth: 80 }} />
                  </>
                ) : (
                  <>
                    <col style={{ width: 150, minWidth: 150 }} />
                    <col style={{ minWidth: 260 }} />
                    <col style={{ width: 75, minWidth: 75 }} />
                    <col style={{ width: 65, minWidth: 65 }} />
                  </>
                )}
              </colgroup>
             
<thead>
  <tr
    style={{
      background: '#FFF7ED',
      borderBottom: '1px solid #FFEDD5'
    }}
  >
    {isTabB ? (
      <>
        <th
          className="sap-f4-sticky-col"
          style={{
            width: 160,
            minWidth: 160,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            position: 'sticky',
            left: 0,
            top: 0,
            zIndex: 4,
            background: '#FFF7ED'
          }}
        >
          Material
        </th>

        <th
          style={{
            width: 80,
            minWidth: 80,
            textAlign: 'center',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap'
          }}
        >
          AltBOM
        </th>

        <th
          style={{
            width: 80,
            minWidth: 80,
            textAlign: 'center',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap'
          }}
        >
          Language
        </th>
      </>
    ) : (
      <>
        <th
          className="sap-f4-sticky-col"
          style={{
            width: 150,
            minWidth: 150,
            textAlign: 'left',
            whiteSpace: 'nowrap',
            position: 'sticky',
            left: 0,
            top: 0,
            zIndex: 4,
            background: '#FFF7ED'
          }}
        >
          Material
        </th>

        <th
          style={{
            minWidth: 260,
            textAlign: 'left',
            whiteSpace: 'nowrap'
          }}
        >
          Description
        </th>

        <th
          style={{
            width: 75,
            minWidth: 75,
            textAlign: 'center',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap'
          }}
        >
          Type
        </th>

        <th
          style={{
            width: 65,
            minWidth: 65,
            textAlign: 'center',
            verticalAlign: 'middle',
            whiteSpace: 'nowrap'
          }}
        >
          Language
        </th>
      </>
    )}
  </tr>
</thead>

              <tbody>
                {materials.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const rowBg = isSelected ? '#FFEDD5' : idx % 2 === 1 ? '#fafbfc' : '#ffffff';

                  if (isTabB) {
                    return (
                      <tr
                        key={`${item.matnr}-${item.stlal || idx}-${idx}`}
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
                        onDoubleClick={() => onSelect(item.matnr, item)}
                      >
                        <td
                          className="sap-f4-sticky-col"
                          style={{
                            width: 160,
                            minWidth: 160,
                            fontFamily: 'var(--sap-font-mono)',
                            fontWeight: 600,
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            backgroundColor: rowBg
                          }}
                        >
                          <span style={{ verticalAlign: 'middle' }}>{item.matnr}</span>
                        </td>
                        <td style={{ width: 80, minWidth: 80, textAlign: 'center', fontFamily: 'var(--sap-font-mono)', fontWeight: 600 }}>
                          {item.stlal || '01'}
                        </td>
                        <td style={{ width: 80, minWidth: 80, textAlign: 'center', color: 'var(--sap-text-secondary)' }}>
                          {item.spras || 'E'}
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={`${item.matnr}-${idx}`}
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
                      onDoubleClick={() => onSelect(item.matnr, item)}
                    >
                      <td
                        className="sap-f4-sticky-col"
                        style={{
                          width: 150,
                          minWidth: 150,
                          fontFamily: 'var(--sap-font-mono)',
                          fontWeight: 600,
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: rowBg
                        }}
                      >
                        <span style={{ verticalAlign: 'middle' }}>{item.matnr}</span>
                        {item.hasBom && (
                          <span
                            className="sap-type-badge"
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              background: '#E2F3E5',
                              color: '#1B6A2A',
                              borderColor: '#A8DDB5'
                            }}
                          >
                            BOM
                          </span>
                        )}
                      </td>
                      <td
                        className="sap-f4-col-text"
                        title={item.maktx || ''}
                        style={{
                          minWidth: 260,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflow: 'visible',
                          lineHeight: 1.4
                        }}
                      >
                        {item.maktx || <span style={{ color: 'var(--sap-text-secondary)', fontStyle: 'italic' }}>(no text)</span>}
                      </td>
                      <td style={{ width: 75, minWidth: 75, textAlign: 'center' }}>
                        <span className="sap-type-badge">
                          {item.mtart || '-'}
                        </span>
                      </td>
                      <td style={{ width: 65, minWidth: 65, textAlign: 'center', color: 'var(--sap-text-secondary)' }}>
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
        <div className="sap-f4-footer" style={{ borderTop: '1px solid #FFEDD5', background: '#FFF7ED' }}>
          <div className="sap-f4-footer-preview" style={{ color: 'var(--sap-text-secondary)', fontSize: 13 }}>
            {selectedIndex >= 0 && materials[selectedIndex] ? (
              <span title={`${materials[selectedIndex].matnr}${isTabB && materials[selectedIndex].stlal ? ` Alt ${materials[selectedIndex].stlal}` : ''}${materials[selectedIndex].maktx ? ` - ${materials[selectedIndex].maktx}` : ''}`}>
                Selected: <strong style={{ color: 'var(--sap-text-primary)' }}>{materials[selectedIndex].matnr}</strong>
                {isTabB && materials[selectedIndex].stlal ? ` (Alt ${materials[selectedIndex].stlal})` : ''}
                {materials[selectedIndex].maktx ? ` - ${materials[selectedIndex].maktx}` : ''}
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
              disabled={selectedIndex < 0 || !materials[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && materials[selectedIndex]) {
                  const sel = materials[selectedIndex];
                  onSelect(sel.matnr, sel);
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
