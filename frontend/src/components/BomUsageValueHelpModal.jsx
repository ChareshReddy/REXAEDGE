import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, Loader2, AlertCircle } from 'lucide-react';
import { getBomUsages } from '../services/api';
import { lockScroll } from '../utils/scrollLock';
import { useDraggableModal } from '../hooks/useDraggableModal';
import Tooltip from './Tooltip';
import F4PopupOverlay from './F4PopupOverlay';
import TableLoadingState from './TableLoadingState';
import F4ErrorState from './F4ErrorState';
import { extractErrorInfo } from '../utils/friendlyError';

/**
 * SAP-style F4 Value Help popup for BOM Usage (tables T416 and T416T).
 * Columns: Usage, Prod., Eng./Design, Plant Maint., Spare Part, Costing, Sales/Dist., BOM Usage Text.
 * Title: "BOM Usage <N> Entries"
 */
export default function BomUsageValueHelpModal({
  isOpen,
  initialValue = '',
  onSelect,
  onClose
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsages, setAllUsages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const searchInputRef = useRef(null);
  const tableContainerRef = useRef(null);
  const modalDialogRef = useRef(null);
  const rowRefs = useRef([]);
  const abortControllerRef = useRef(null);

  const selectedIndexRef = useRef(0);
  const filteredUsagesRef = useRef([]);

  const { dialogStyle, headerProps } = useDraggableModal({
    isOpen,
    dialogRef: modalDialogRef,
    defaultTopRatio: 0.12
  });

  // Keep refs in sync with state
  useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  // Load BOM usages on open
  useEffect(() => {
    if (!isOpen) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setSearchTerm('');

    const unlock = lockScroll();

    getBomUsages({}, { signal: controller.signal })
      .then((res) => {
        if (controller.signal.aborted) return;
        const list = res?.data || [];
        setAllUsages(list);

        // Highlight matching row of current value on open
        const cleanInitial = String(initialValue || '').trim().toUpperCase();
        let targetIdx = 0;
        if (cleanInitial) {
          const found = list.findIndex(
            (u) => (u.stlan || '').toUpperCase() === cleanInitial
          );
          if (found >= 0) targetIdx = found;
        }
        setSelectedIndex(targetIdx);
        selectedIndexRef.current = targetIdx;

        // Auto-scroll to selected row after table renders
        setTimeout(() => {
          if (rowRefs.current[targetIdx]) {
            rowRefs.current[targetIdx].scrollIntoView({ block: 'nearest' });
          }
        }, 60);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('[BomUsageValueHelp] Load error:', err.message);
        setError(extractErrorInfo(err, 'Failed to load BOM usages from SAP'));
        setAllUsages([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      unlock();
      controller.abort();
    };
  }, [isOpen, initialValue]);

  // Filter usages (if filter box is active or search term entered)
  const filteredUsages = useMemo(() => {
    if (!searchTerm.trim()) return allUsages;
    const term = searchTerm.trim().toUpperCase();
    return allUsages.filter((item) => {
      const matchStlan = (item.stlan || '').toUpperCase().includes(term);
      const matchText = (item.antxt || '').toUpperCase().includes(term);
      return matchStlan || matchText;
    });
  }, [allUsages, searchTerm]);

  useEffect(() => {
    filteredUsagesRef.current = filteredUsages;
  }, [filteredUsages]);

  // Focus modal container on open for keyboard navigation
  useEffect(() => {
    if (isOpen && !isLoading) {
      const timer = setTimeout(() => {
        if (allUsages.length > 20 && searchInputRef.current) {
          searchInputRef.current.focus();
        } else {
          modalDialogRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isLoading, allUsages.length]);

  const moveSelection = useCallback((delta) => {
    const list = filteredUsagesRef.current;
    if (list.length === 0) return;
    const current = selectedIndexRef.current;
    const next = Math.max(0, Math.min(list.length - 1, current + delta));
    setSelectedIndex(next);
    selectedIndexRef.current = next;

    if (rowRefs.current[next]) {
      rowRefs.current[next].scrollIntoView({ block: 'nearest' });
    }
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen) return;

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

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        const idx = selectedIndexRef.current;
        const list = filteredUsagesRef.current;
        if (idx >= 0 && idx < list.length) {
          const selected = list[idx];
          if (selected) {
            onSelect(selected.stlan, selected);
          }
        }
      }
    },
    [isOpen, moveSelection, onClose, onSelect]
  );

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const countDisplay = filteredUsages.length;
  const modalTitle = `BOM Usage ${countDisplay} Entries`;
  const showFilterBox = allUsages.length > 20;

  return createPortal(
    <F4PopupOverlay
      className="sap-modal-overlay sap-f4-overlay"
      role="presentation"
      ariaLabel={modalTitle}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '24px 16px',
        overflowY: 'auto'
      }}
    >
      <div
        ref={modalDialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        tabIndex={-1}
        className="sap-modal-dialog sap-f4-dialog sap-f4-modal-dialog bom-usage"
        style={{
          width: 'fit-content',
          minWidth: 'min(560px, 92vw)',
          maxWidth: '92vw',
          background: 'var(--sap-card-bg, #ffffff)',
          borderRadius: 8,
          boxShadow: '0 16px 36px rgba(234, 88, 12, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
          border: '1px solid #FDBA74',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '84vh',
          outline: 'none',
          boxSizing: 'border-box',
          overflow: 'hidden',
          ...dialogStyle
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title Bar - Draggable */}
        <div
          {...headerProps}
          className="sap-modal-header sap-f4-header"
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--sap-popup-header-border, #FED7AA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--sap-popup-header-bg, #FFEDD5)',
            borderTopLeftRadius: 'inherit',
            borderTopRightRadius: 'inherit',
            cursor: 'move',
            userSelect: 'none',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h3
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--sap-popup-header-title, #0f2744)'
              }}
            >
              {modalTitle}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel"
            title="Cancel"
            className="sap-modal-close sap-modal-close-btn sap-f4-header-close"
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

        {/* Filter Bar (Only if entries > 20) */}
        {showFilterBox && (
          <div
            style={{
              padding: '8px 16px',
              borderBottom: '1px solid var(--sap-border-color, #e2e8f0)',
              background: 'var(--sap-card-bg, #ffffff)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexShrink: 0
            }}
          >
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 8,
                  color: 'var(--sap-text-muted, #94a3b8)',
                  pointerEvents: 'none'
                }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedIndex(0);
                  selectedIndexRef.current = 0;
                }}
                placeholder="Filter by usage or description…"
                className="sap-input"
                style={{
                  width: '100%',
                  height: 30,
                  padding: '0 28px 0 28px',
                  fontSize: 'var(--sap-size-input, 13px)',
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
                    color: 'var(--sap-text-secondary, #64748b)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 2
                  }}
                  title="Clear filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Table Content */}
        <div
          ref={tableContainerRef}
          className="sap-f4-table-container"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'auto',
            minHeight: 180,
            maxHeight: '52vh'
          }}
        >
          {isLoading ? (
            <TableLoadingState
              borderless
              minHeight={260}
              message="Loading BOM usages from SAP…"
            />
          ) : error ? (
            <F4ErrorState
              error={error}
              onRetry={() => {
                setError(null);
                setIsLoading(true);
                getBomUsages()
                  .then((res) => {
                    const list = Array.isArray(res) ? res : res.data || [];
                    setAllUsages(list);
                  })
                  .catch((err) => setError(extractErrorInfo(err, 'Failed to load BOM usages from SAP')))
                  .finally(() => setIsLoading(false));
              }}
            />
          ) : filteredUsages.length === 0 ? (
            <div
              style={{
                padding: '48px 24px',
                textAlign: 'center',
                color: 'var(--sap-text-muted, #94a3b8)'
              }}
            >
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>
                No matching BOM usages found.
              </p>
            </div>
          ) : (
            <table
              className="sap-table sap-f4-table"
              style={{
                width: '100%',
                tableLayout: 'auto',
                borderCollapse: 'collapse',
                fontSize: 12.5,
                textAlign: 'left'
              }}
            >
              <colgroup>
                <col style={{ width: 70, minWidth: 70 }} />
                <col style={{ width: 65, minWidth: 65 }} />
                <col style={{ width: 90, minWidth: 90 }} />
                <col style={{ width: 90, minWidth: 90 }} />
                <col style={{ width: 75, minWidth: 75 }} />
                <col style={{ width: 65, minWidth: 65 }} />
                <col style={{ width: 80, minWidth: 80 }} />
                <col style={{ minWidth: 280 }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FFF7ED', borderBottom: '1px solid #FFEDD5' }}>
                  <th
                    className="sap-f4-sticky-col"
                    style={{
                      width: 70,
                      minWidth: 70,
                      maxWidth: 80,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      padding: '8px 8px',
                      position: 'sticky',
                      left: 0,
                      top: 0,
                      zIndex: 4,
                      backgroundColor: '#FFF7ED'
                    }}
                  >
                    <Tooltip text="BOM Usage">
                      <span>Usage</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 65, minWidth: 65, maxWidth: 85, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Production Indicator">
                      <span>Ind.</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 90, minWidth: 90, maxWidth: 100, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Engineering/Design">
                      <span>Eng./Design</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 90, minWidth: 90, maxWidth: 100, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Plant Maintenance">
                      <span>Plant Maint.</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 75, minWidth: 75, maxWidth: 85, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Spare Parts">
                      <span>Spare Part</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 65, minWidth: 65, maxWidth: 80, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Costing">
                      <span>Costing</span>
                    </Tooltip>
                  </th>
                  <th style={{ width: 80, minWidth: 80, maxWidth: 95, textAlign: 'center', whiteSpace: 'nowrap', padding: '8px 6px' }}>
                    <Tooltip text="Sales and Distribution">
                      <span>Sales/Dist.</span>
                    </Tooltip>
                  </th>
                  <th style={{ minWidth: 280, textAlign: 'left', whiteSpace: 'nowrap', padding: '8px 12px' }}>
                    <Tooltip text="BOM Usage Text">
                      <span>BOM Usage Text</span>
                    </Tooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsages.map((item, idx) => {
                  const isSelected = idx === selectedIndex;
                  const rowBg = isSelected ? '#FFEDD5' : idx % 2 === 1 ? '#fafbfc' : '#ffffff';
                  return (
                    <tr
                      key={`${item.stlan}-${idx}`}
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
                      onDoubleClick={() => onSelect(item.stlan, item)}
                    >
                      <td
                        className="sap-f4-sticky-col"
                        style={{
                          width: 70,
                          minWidth: 70,
                          maxWidth: 80,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 700,
                          color: isSelected ? '#C2410C' : '#0a6ed1',
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: rowBg,
                          padding: '6px'
                        }}
                      >
                        {item.stlan}
                      </td>
                      <td
                        style={{
                          width: 65,
                          minWidth: 65,
                          maxWidth: 85,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmpfe === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmpfe || '.'}
                      </td>
                      <td
                        style={{
                          width: 90,
                          minWidth: 90,
                          maxWidth: 100,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmpko === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmpko || '.'}
                      </td>
                      <td
                        style={{
                          width: 90,
                          minWidth: 90,
                          maxWidth: 100,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmpin === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmpin || '.'}
                      </td>
                      <td
                        style={{
                          width: 75,
                          minWidth: 75,
                          maxWidth: 85,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmper === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmper || '.'}
                      </td>
                      <td
                        style={{
                          width: 65,
                          minWidth: 65,
                          maxWidth: 80,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmpka === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmpka || '.'}
                      </td>
                      <td
                        style={{
                          width: 80,
                          minWidth: 80,
                          maxWidth: 95,
                          textAlign: 'center',
                          fontFamily: 'monospace',
                          fontWeight: 600,
                          color: item.pmprv === '+' ? '#166534' : '#475569',
                          padding: '6px'
                        }}
                      >
                        {item.pmprv || '.'}
                      </td>
                      <td
                        className="sap-f4-col-text"
                        style={{
                          minWidth: 280,
                          padding: '6px 12px',
                          color: '#1e293b',
                          fontWeight: 500,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflow: 'visible',
                          textOverflow: 'clip',
                          lineHeight: 1.4
                        }}
                        title={item.antxt || ''}
                      >
                        {item.antxt || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          className="sap-f4-footer"
          style={{
            padding: '10px 16px',
            borderTop: '1px solid #FFEDD5',
            background: 'var(--sap-modal-footer-bg, #FFF1E3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            borderBottomLeftRadius: 'inherit',
            borderBottomRightRadius: 'inherit',
            flexShrink: 0
          }}
        >
          <div
            className="sap-f4-footer-preview"
            style={{
              color: 'var(--sap-text-secondary, #64748b)',
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {selectedIndex >= 0 && filteredUsages[selectedIndex] ? (
              <span title={`${filteredUsages[selectedIndex].stlan} - ${filteredUsages[selectedIndex].antxt || ''}`}>
                Selected: <strong style={{ color: 'var(--sap-text-primary, #0f172a)' }}>{filteredUsages[selectedIndex].stlan}</strong>
                {filteredUsages[selectedIndex].antxt ? ` - ${filteredUsages[selectedIndex].antxt}` : ''}
              </span>
            ) : (
              <span>Double-click or press Enter to select</span>
            )}
          </div>

          <div className="sap-f4-footer-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="sap-button"
              onClick={onClose}
              style={{
                height: 30,
                fontSize: 'var(--sap-size-button, 13px)',
                padding: '0 14px',
                display: 'inline-flex',
                alignItems: 'center'
              }}
            >
              <X size={14} style={{ marginRight: 4 }} />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              className="sap-button primary"
              disabled={selectedIndex < 0 || !filteredUsages[selectedIndex]}
              onClick={() => {
                if (selectedIndex >= 0 && filteredUsages[selectedIndex]) {
                  const sel = filteredUsages[selectedIndex];
                  onSelect(sel.stlan, sel);
                }
              }}
              style={{
                height: 30,
                fontSize: 'var(--sap-size-button, 13px)',
                padding: '0 16px',
                display: 'inline-flex',
                alignItems: 'center'
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
