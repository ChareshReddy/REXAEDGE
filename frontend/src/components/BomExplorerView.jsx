import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Search,
  Layers,
  Factory,
  Hash,
  Filter,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  GitBranch,
  RefreshCw,
  Clock,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { readBom, explodeBomHierarchy } from '../services/api';
import activityTracker from '../services/activityTracker';

/**
 * Trims leading zeros only on purely numeric material numbers.
 * Alphanumeric ones remain unchanged.
 */
export function formatMaterialNumber(mat) {
  if (!mat) return '';
  const s = String(mat).trim();
  if (/^\d+$/.test(s)) {
    const trimmed = s.replace(/^0+/, '');
    return trimmed.length > 0 ? trimmed : '0';
  }
  return s;
}

export default function BomExplorerView({ systemKey = 'DEV', onBack, onNavigateHome }) {
  const [searchParams, setSearchParams] = useState({
    material: '',
    plant: '',
    bomUsage: '1',
    alternativeBom: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [bomData, setBomData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState('items'); // 'items' | 'hierarchy'
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });

  useEffect(() => {
    activityTracker.setOperation('bom_explorer', isLoading);
    return () => {
      activityTracker.setOperation('bom_explorer', false);
    };
  }, [isLoading]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();

    if (!searchParams.material.trim() || !searchParams.plant.trim()) {
      setErrorMessage('Please enter both Material and Plant to inspect the BOM.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setBomData(null);

    const payload = {
      material: searchParams.material.trim().toUpperCase(),
      plant: searchParams.plant.trim().toUpperCase(),
      bomUsage: searchParams.bomUsage.trim() || '1',
      alternativeBom: searchParams.alternativeBom.trim() || undefined
    };

    try {
      let res;
      if (viewMode === 'hierarchy') {
        res = await explodeBomHierarchy(payload);
      } else {
        res = await readBom(payload);
      }

      if (!res.success) {
        setErrorMessage(res.message || 'BOM not found in SAP for given parameters.');
      } else if (!res.bomExists && res.bomExists !== undefined) {
        setErrorMessage(`No BOM exists for Material ${payload.material} in Plant ${payload.plant} (Usage ${payload.bomUsage}).`);
      } else {
        setBomData(res);
      }
    } catch (err) {
      console.error('Error querying BOM in SAP:', err);
      const text = err.response?.data?.message || err.message || 'Error communicating with SAP RFC service.';
      setErrorMessage(text);
    } finally {
      setIsLoading(false);
    }
  };

  const components = useMemo(() => {
    return bomData?.components || bomData?.items || [];
  }, [bomData]);

  const isMultiLevel = useMemo(() => {
    return viewMode === 'hierarchy' || components.some((c) => c.level && c.level > 1);
  }, [viewMode, components]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown size={11} style={{ opacity: 0.35, marginLeft: 4 }} />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={11} color="var(--sap-primary)" style={{ marginLeft: 4 }} />
    ) : (
      <ArrowDown size={11} color="var(--sap-primary)" style={{ marginLeft: 4 }} />
    );
  };

  const filteredComponents = useMemo(() => {
    let list = components;
    if (filterText) {
      const term = filterText.toLowerCase();
      list = list.filter((item) => {
        const mat = (item.component || item.material || item.IDNRK || '').toLowerCase();
        const rawMat = (item.rawComponent || '').toLowerCase();
        const desc = (item.description || item.OJTXP || item.MAKTX || '').toLowerCase();
        const itemNo = String(item.itemNo || item.item || item.POSNR || '').toLowerCase();
        const cat = (item.itemCategory || item.POSTP || '').toLowerCase();
        const unit = (item.unit || item.MEINS || '').toLowerCase();
        const qty = String(item.quantity !== undefined && item.quantity !== null ? item.quantity : '').toLowerCase();
        const validFrom = String(item.validFrom || item.DATUV || '').toLowerCase();
        const level = String(item.level || '').toLowerCase();
        return (
          mat.includes(term) ||
          rawMat.includes(term) ||
          desc.includes(term) ||
          itemNo.includes(term) ||
          cat.includes(term) ||
          unit.includes(term) ||
          qty.includes(term) ||
          validFrom.includes(term) ||
          level.includes(term)
        );
      });
    }

    if (sortConfig.key) {
      list = [...list].sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === 'component') {
          aVal = formatMaterialNumber(a.component || a.material || a.IDNRK || '');
          bVal = formatMaterialNumber(b.component || b.material || b.IDNRK || '');
        } else if (sortConfig.key === 'description') {
          aVal = a.description || a.OJTXP || a.MAKTX || '';
          bVal = b.description || b.OJTXP || b.MAKTX || '';
        } else if (sortConfig.key === 'quantity') {
          aVal = Number(a.quantity || a.MENGE || 0);
          bVal = Number(b.quantity || b.MENGE || 0);
        } else if (sortConfig.key === 'itemNo') {
          aVal = Number(a.itemNo || a.item || a.POSNR || 0);
          bVal = Number(b.itemNo || b.item || b.POSNR || 0);
        } else if (sortConfig.key === 'level') {
          aVal = Number(a.level || 1);
          bVal = Number(b.level || 1);
        } else if (sortConfig.key === 'validFrom') {
          aVal = String(a.validFrom || a.DATUV || '');
          bVal = String(b.validFrom || b.DATUV || '');
        } else if (sortConfig.key === 'hasSubBom') {
          aVal = a.hasSubBom ? 1 : 0;
          bVal = b.hasSubBom ? 1 : 0;
        }

        if (typeof aVal === 'string') {
          const comp = aVal.localeCompare(String(bVal));
          return sortConfig.direction === 'asc' ? comp : -comp;
        } else {
          const comp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return sortConfig.direction === 'asc' ? comp : -comp;
        }
      });
    }

    return list;
  }, [components, filterText, sortConfig]);

  return (
    <div className="fiori-app-view-root">
      {/* Full-width Fiori Horizon Header (Identical to Homepage / Operations Header) */}
      <div className="fiori-ph">
        <div className="fiori-bc">
          <button type="button" className="fiori-bc-link" onClick={onNavigateHome || onBack}>
            Home
          </button>
          <span className="fiori-bc-sep">›</span>
          <button type="button" className="fiori-bc-link" onClick={onBack}>
            Bill of Materials
          </button>
          <span className="fiori-bc-sep">›</span>
          <span className="fiori-bc-current">BOM Hierarchy Explorer</span>
          <span className="sap-view-system-pill" style={{ marginLeft: 6 }}>{systemKey}</span>
        </div>
        <div className="fiori-ph-title-row">
          <button
            type="button"
            className="fiori-ph-back"
            onClick={onBack}
            title="Back to Bill of Materials"
            aria-label="Back to Bill of Materials"
          >
            <ChevronLeft size={16} />
          </button>
          <h1 className="fiori-ph-title">BOM Hierarchy Explorer (CS03)</h1>
        </div>
        <p className="fiori-ph-subtitle">
          View a material's BOM components and structure.
        </p>
      </div>

      <div className="fiori-view-body wide">
        {/* Error Notice */}
        {errorMessage && (
          <div className="sap-alert sap-alert-error" style={{ maxWidth: 680, width: '100%', margin: '0 auto 14px' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>{errorMessage}</div>
          </div>
        )}

        {/* Small Compact Search Card (2 rows x 2 columns) */}
        <div className="sap-structured-form-card" style={{ maxWidth: 680, width: '100%', margin: '0 auto 16px' }}>
          <form onSubmit={handleSearch}>
            <div className="sap-form-grid" style={{ gridTemplateColumns: '1fr 1fr', padding: '14px 16px', gap: '10px 14px' }}>
            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Material Number <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Layers size={13} className="input-icon" />
                <input
                  type="text"
                  className="sap-form-input"
                  placeholder="e.g. 100001"
                  value={searchParams.material}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, material: e.target.value }))}
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Plant Code <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Factory size={13} className="input-icon" />
                <input
                  type="text"
                  className="sap-form-input"
                  placeholder="e.g. 1000"
                  value={searchParams.plant}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, plant: e.target.value }))}
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                BOM Usage
              </label>
              <div className="sap-form-input-wrapper">
                <Hash size={13} className="input-icon" />
                <input
                  type="text"
                  className="sap-form-input"
                  placeholder="1 (Production)"
                  value={searchParams.bomUsage}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, bomUsage: e.target.value }))}
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Alternative BOM
              </label>
              <div className="sap-form-input-wrapper">
                <Hash size={13} className="input-icon" />
                <input
                  type="text"
                  className="sap-form-input"
                  placeholder="e.g. 01 (optional)"
                  value={searchParams.alternativeBom}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, alternativeBom: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid var(--sap-border-subtle)', background: 'var(--sap-surface-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className={`sap-btn ${viewMode === 'items' ? 'sap-btn-secondary active-mode' : 'sap-btn-ghost'}`}
                onClick={() => setViewMode('items')}
                style={{ height: 28, fontSize: '11px', padding: '0 8px' }}
              >
                <span>Single Level Items</span>
              </button>
              <button
                type="button"
                className={`sap-btn ${viewMode === 'hierarchy' ? 'sap-btn-secondary active-mode' : 'sap-btn-ghost'}`}
                onClick={() => setViewMode('hierarchy')}
                style={{ height: 28, fontSize: '11px', padding: '0 8px' }}
              >
                <FolderTree size={13} />
                <span>Multi-Level Hierarchy</span>
              </button>
            </div>

            <button
              type="submit"
              className="sap-btn sap-btn-primary"
              disabled={isLoading}
              style={{ height: 28, fontSize: '11.5px', padding: '0 12px' }}
            >
              {isLoading ? (
                <>
                  <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                  <span>Reading from SAP...</span>
                </>
              ) : (
                <>
                  <Search size={13} />
                  <span>Read BOM via RFC</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* BOM Data View */}
      {bomData && (
        <div className="sap-bom-explorer-results" style={{ width: '100%', maxWidth: 1100, margin: '0 auto 20px', paddingBottom: 0 }}>
          {/* Header Metadata Card */}
          <div className="sap-result-meta-grid" style={{ marginBottom: 16 }}>
            <div className="sap-result-meta-item">
              <span className="sap-result-meta-label">BOM Number (STLNR)</span>
              <strong className="sap-result-meta-val">{bomData.header?.bomNumber || bomData.header?.stlnr || '-'}</strong>
            </div>
            <div className="sap-result-meta-item">
              <span className="sap-result-meta-label">Alternative (STLAL)</span>
              <span className="sap-badge sap-badge-primary" style={{ fontSize: '13px', padding: '3px 8px' }}>
                {bomData.header?.alternative || bomData.header?.stlal || '01'}
              </span>
            </div>
            <div className="sap-result-meta-item">
              <span className="sap-result-meta-label">Base Quantity</span>
              <strong className="sap-result-meta-val">
                {bomData.header?.baseQty || '1'} {bomData.header?.baseUnit || 'ST'}
              </strong>
            </div>
            <div className="sap-result-meta-item">
              <span className="sap-result-meta-label">Total Components</span>
              <strong className="sap-result-meta-val" style={{ color: 'var(--sap-primary)' }}>
                {components.length}
              </strong>
            </div>
          </div>

          {/* Components Table with In-Table Filter */}
          <div className="sap-table-card" style={{ height: 'auto', flex: 'none', marginBottom: 20 }}>
            <div className="sap-table-toolbar" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--sap-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} color="var(--sap-primary)" />
                <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Components List</h4>
                <span className="sap-badge sap-badge-neutral">{filteredComponents.length} items</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Filter components..."
                  className="sap-form-input"
                  style={{ width: 220, height: 32, fontSize: '12px' }}
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
            </div>

            <div className="sap-table-container" tabIndex={0} role="region" aria-label="BOM Components Table">
              {filteredComponents.length > 0 ? (
                <table className="sap-table">
                  <thead>
                    <tr>
                      {isMultiLevel && (
                        <th onClick={() => handleSort('level')} style={{ cursor: 'pointer', userSelect: 'none', width: 68 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                            Level {renderSortIcon('level')}
                          </span>
                        </th>
                      )}
                      <th onClick={() => handleSort('itemNo')} style={{ cursor: 'pointer', userSelect: 'none', width: 75 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Item {renderSortIcon('itemNo')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('component')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Component Material {renderSortIcon('component')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('description')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Description {renderSortIcon('description')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('quantity')} style={{ cursor: 'pointer', userSelect: 'none', width: 95 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Quantity {renderSortIcon('quantity')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('unit')} style={{ cursor: 'pointer', userSelect: 'none', width: 75 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Unit {renderSortIcon('unit')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('itemCategory')} style={{ cursor: 'pointer', userSelect: 'none', width: 85 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Category {renderSortIcon('itemCategory')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('validFrom')} style={{ cursor: 'pointer', userSelect: 'none', width: 115 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Valid From {renderSortIcon('validFrom')}
                        </span>
                      </th>
                      <th onClick={() => handleSort('hasSubBom')} style={{ cursor: 'pointer', userSelect: 'none', width: 95 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                          Sub-BOM {renderSortIcon('hasSubBom')}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComponents.map((item, idx) => {
                      const hasSubBom = Boolean(item.hasSubBom || item.subBomExists || item.isSubAssembly);
                      const displayMat = formatMaterialNumber(item.component || item.IDNRK || item.material || '-');
                      const indentLevel = item.level && item.level > 1 ? item.level - 1 : 0;

                      return (
                        <tr key={idx}>
                          {isMultiLevel && (
                            <td>
                              <span className="sap-badge sap-badge-neutral" style={{ fontSize: '11px', fontWeight: 600 }}>
                                L{item.level || 1}
                              </span>
                            </td>
                          )}
                          <td>{item.itemNo || item.item || item.POSNR || (idx + 1) * 10}</td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: indentLevel * 20 }}>
                              {indentLevel > 0 && (
                                <span style={{ color: 'var(--sap-text-muted)', marginRight: 6, fontFamily: 'monospace', fontWeight: 600 }}>
                                  └──
                                </span>
                              )}
                              <strong>{displayMat}</strong>
                            </div>
                          </td>
                          <td>{item.description || '-'}</td>
                          <td>{item.quantity !== undefined && item.quantity !== null && item.quantity !== '' ? item.quantity : '-'}</td>
                          <td>{item.unit || item.MEINS || '-'}</td>
                          <td>{item.itemCategory || item.POSTP || 'L'}</td>
                          <td>{item.validFrom || item.DATUV || '-'}</td>
                          <td>
                            {hasSubBom ? (
                              <span className="sap-badge sap-badge-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                <GitBranch size={11} />
                                <span>Sub-BOM</span>
                              </span>
                            ) : (
                              <span style={{ color: 'var(--sap-text-muted)', fontSize: '12px' }}>-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--sap-text-muted)' }}>
                  <p>No components match your search filter.</p>
                </div>
              )}
            </div>

            {/* Table Footer Bar - Closes table card cleanly at bottom */}
            <div className="sap-table-footer-bar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>
                  Showing <strong>{filteredComponents.length}</strong> of <strong>{components.length}</strong> components
                </span>
                {filterText && (
                  <span style={{ fontSize: '11px', color: 'var(--sap-primary)', fontWeight: 600 }}>
                    (Filtered)
                  </span>
                )}
              </div>
              {filterText && (
                <button
                  type="button"
                  className="sap-btn sap-btn-ghost"
                  onClick={() => setFilterText('')}
                  style={{ height: 24, fontSize: '11px', padding: '0 8px' }}
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
