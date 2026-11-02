import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { useToast } from '../context/ToastContext';
import activityTracker from '../services/activityTracker';
import FioriPageHeader from './FioriPageHeader';
import ValueHelpInput from './ValueHelpInput';
import TableLoadingState from './TableLoadingState';
import { extractErrorInfo } from '../utils/friendlyError';
import { PageContainer } from './layout';

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

/**
 * Formats alternative numbers by stripping leading zeros for display ("Alt 1", "Alt 2").
 */
export function formatAlternativeLabel(alt) {
  if (alt === undefined || alt === null || alt === '') return 'Alt 1';
  const s = String(alt).trim();
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) {
    return `Alt ${num}`;
  }
  const stripped = s.replace(/^0+/, '');
  return `Alt ${stripped || s}`;
}

/**
 * Formats alternative number for loading sentence (e.g. "02" -> "2").
 */
export function formatAltNumber(alt) {
  if (alt === undefined || alt === null || alt === '') return '1';
  const s = String(alt).trim();
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) {
    return String(num);
  }
  const stripped = s.replace(/^0+/, '');
  return stripped || s;
}

export default function BomExplorerView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom, initialMaterial, initialPlant }) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useState({
    material: initialMaterial || '',
    plant: initialPlant || '',
    bomUsage: '1',
    alternativeBom: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null); // 'search' | 'mode' | 'alternative' | null
  const [loadingMessage, setLoadingMessage] = useState('');
  const [pendingAlternative, setPendingAlternative] = useState(null);
  const [bomData, setBomData] = useState(null);
  const [errorMessage, _setErrorMessage] = useState('');
  const setErrorMessage = (msg, err = null) => {
    _setErrorMessage(msg);
    if (err) {
      const info = extractErrorInfo(err, typeof msg === 'string' ? msg : 'Error communicating with SAP service.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } else if (msg) {
      const info = extractErrorInfo(msg);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    }
  };
  const [filterText, setFilterText] = useState('');
  const [viewMode, setViewMode] = useState('items'); // 'items' | 'hierarchy'
  const [sortConfig, setSortConfig] = useState({ key: '', direction: 'asc' });
  const lastRequestIdRef = useRef(0);
  const lastSuccessfulBomDataRef = useRef(null);
  const lastSuccessfulAltRef = useRef('01');
  const lastSuccessfulModeRef = useRef('items');

  useEffect(() => {
    activityTracker.setOperation('bom_explorer', isLoading);
    return () => {
      activityTracker.setOperation('bom_explorer', false);
    };
  }, [isLoading]);

  const handleSearch = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isLoading) return;

    if (!searchParams.material.trim() || !searchParams.plant.trim()) {
      setErrorMessage('Please enter both Material and Plant to inspect the BOM.');
      return;
    }

    setLoadingType('search');
    setLoadingMessage('Loading BOM...');
    setIsLoading(true);
    setErrorMessage('');
    setFilterText('');
    setPendingAlternative(null);

    const targetAlt = searchParams.alternativeBom.trim();

    const payload = {
      material: searchParams.material.trim().toUpperCase(),
      plant: searchParams.plant.trim().toUpperCase(),
      bomUsage: searchParams.bomUsage.trim() || '1',
      alternativeBom: targetAlt || undefined
    };

    const currentReqId = ++lastRequestIdRef.current;

    try {
      let res;
      if (viewMode === 'hierarchy') {
        res = await explodeBomHierarchy(payload);
      } else {
        res = await readBom(payload);
      }

      // Ignore stale responses if a newer request was dispatched
      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }

      if (!res.success) {
        setErrorMessage(res.message || 'BOM not found in SAP for given parameters.');
        setBomData(null);
        lastSuccessfulBomDataRef.current = null;
      } else if (!res.bomExists && res.bomExists !== undefined) {
        setErrorMessage(res.message || `No BOM exists for Material ${payload.material} in Plant ${payload.plant}.`);
        setBomData(null);
        lastSuccessfulBomDataRef.current = null;
      } else {
        setBomData(res);
        lastSuccessfulBomDataRef.current = res;
        const currentAlt = res.alternativeBom || res.header?.alternative || res.header?.stlal || targetAlt || '01';
        lastSuccessfulAltRef.current = currentAlt;
        lastSuccessfulModeRef.current = viewMode;
      }
    } catch (err) {
      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }
      console.error('Error querying BOM in SAP:', err);
      const text = err.response?.data?.message || err.message || 'Error communicating with SAP service.';
      setErrorMessage(text, err);
      setBomData(null);
      lastSuccessfulBomDataRef.current = null;
    } finally {
      if (currentReqId === lastRequestIdRef.current) {
        setIsLoading(false);
        setLoadingType(null);
        setLoadingMessage('');
      }
    }
  };

  const handleModeClick = async (newMode) => {
    if (viewMode === newMode || isLoading) return;

    // If no BOM data is loaded yet, just update mode selection
    if (!bomData) {
      setViewMode(newMode);
      return;
    }

    const currentAlt = pendingAlternative || bomData.alternativeBom || bomData.header?.alternative || bomData.header?.stlal || searchParams.alternativeBom || '01';

    const msg = newMode === 'hierarchy' ? 'Loading multi-level hierarchy...' : 'Loading single-level items...';
    setLoadingType('mode');
    setLoadingMessage(msg);
    setIsLoading(true);

    const payload = {
      material: searchParams.material.trim().toUpperCase(),
      plant: searchParams.plant.trim().toUpperCase(),
      bomUsage: searchParams.bomUsage.trim() || '1',
      alternativeBom: currentAlt ? String(currentAlt).trim() : undefined
    };

    const currentReqId = ++lastRequestIdRef.current;

    try {
      let res;
      if (newMode === 'hierarchy') {
        res = await explodeBomHierarchy(payload);
      } else {
        res = await readBom(payload);
      }

      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }

      if (!res.success || (res.bomExists === false)) {
        const text = res.message || `Failed to load ${newMode === 'hierarchy' ? 'hierarchy' : 'items'} view.`;
        setErrorMessage(text, res);
        // Restore previous BOM data and keep previous mode
        setBomData(lastSuccessfulBomDataRef.current);
      } else {
        // Success: switch mode and update data
        setViewMode(newMode);
        lastSuccessfulModeRef.current = newMode;
        setBomData(res);
        lastSuccessfulBomDataRef.current = res;
      }
    } catch (err) {
      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }
      console.error('Error switching BOM view mode:', err);
      const text = err.response?.data?.message || err.message || 'Error communicating with SAP service.';
      setErrorMessage(text, err);
      // Restore previous BOM data and keep previous mode
      setBomData(lastSuccessfulBomDataRef.current);
    } finally {
      if (currentReqId === lastRequestIdRef.current) {
        setIsLoading(false);
        setLoadingType(null);
        setLoadingMessage('');
      }
    }
  };

  const handleSwitchAlternative = async (newAlt) => {
    if (isLoading) return;

    const cleanAlt = String(newAlt).trim();
    const currentAlt = bomData?.alternativeBom || bomData?.header?.alternative || bomData?.header?.stlal || '01';
    if (String(currentAlt).padStart(2, '0') === String(cleanAlt).padStart(2, '0')) {
      return;
    }

    const altDisplayNum = formatAltNumber(cleanAlt);
    setLoadingType('alternative');
    setLoadingMessage(`Loading alternative ${altDisplayNum}...`);
    setIsLoading(true);
    setPendingAlternative(cleanAlt);

    const payload = {
      material: searchParams.material.trim().toUpperCase(),
      plant: searchParams.plant.trim().toUpperCase(),
      bomUsage: searchParams.bomUsage.trim() || '1',
      alternativeBom: cleanAlt
    };

    const currentReqId = ++lastRequestIdRef.current;

    try {
      let res;
      if (viewMode === 'hierarchy') {
        res = await explodeBomHierarchy(payload);
      } else {
        res = await readBom(payload);
      }

      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }

      if (!res.success || (res.bomExists === false)) {
        const text = res.message || `No BOM exists for Alternative ${cleanAlt}.`;
        setErrorMessage(text, res);
        // Rollback to previous alternative and restore previous table
        setPendingAlternative(null);
        setBomData(lastSuccessfulBomDataRef.current);
        setSearchParams((prev) => ({ ...prev, alternativeBom: String(lastSuccessfulAltRef.current) }));
      } else {
        // Success
        setBomData(res);
        lastSuccessfulBomDataRef.current = res;
        lastSuccessfulAltRef.current = cleanAlt;
        setPendingAlternative(null);
        setSearchParams((prev) => ({ ...prev, alternativeBom: cleanAlt }));
      }
    } catch (err) {
      if (currentReqId !== lastRequestIdRef.current) {
        return;
      }
      console.error('Error switching alternative BOM:', err);
      const text = err.response?.data?.message || err.message || 'Error communicating with SAP service.';
      setErrorMessage(text, err);
      // Rollback to previous alternative and restore previous table
      setPendingAlternative(null);
      setBomData(lastSuccessfulBomDataRef.current);
      setSearchParams((prev) => ({ ...prev, alternativeBom: String(lastSuccessfulAltRef.current) }));
    } finally {
      if (currentReqId === lastRequestIdRef.current) {
        setIsLoading(false);
        setLoadingType(null);
        setLoadingMessage('');
      }
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
    <div className="fiori-app-view-root sap-page-viewport">
      {/* Full-width Fiori Horizon Header (Identical to Homepage / Operations Header) */}
      <FioriPageHeader
        title="Display BOM"
        subtitle="View a material's BOM components and structure."
        onBack={onBack}
        backTitle="Back to Bill of Materials"
        systemKey={systemKey}
        breadcrumbs={getBreadcrumbTrail('bom_explorer', { onNavigateHome, onNavigateProducts, onNavigateBom: onNavigateBom || onBack, onBack })}
      />

      <PageContainer>
        <div style={{ marginTop: 20 }}>
          {/* Small Compact Search Card */}
          <div className="sap-structured-form-card sap-full-width" style={{ width: '100%', margin: '0 auto 16px' }}>
            <form onSubmit={handleSearch}>
              <div className="sap-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', padding: '16px 20px', gap: '14px 18px' }}>
            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Material Number <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Layers size={13} className="input-icon" />
                <ValueHelpInput
                  kind="material"
                  plant={searchParams.plant}
                  placeholder="e.g. 100001"
                  value={searchParams.material}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, material: e.target.value }))}
                  onSelect={(val, full) => {
                    setSearchParams((prev) => ({
                      ...prev,
                      material: val,
                      ...(full?.stlal ? { alternativeBom: full.stlal } : {}),
                      ...(full?.werks && !prev.plant ? { plant: full.werks } : {})
                    }));
                  }}
                  style={{ paddingLeft: 30 }}
                  aria-label="Display BOM Material"
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                Plant Code <span className="sap-required-star" style={{ color: 'var(--sap-error)' }}>*</span>
              </label>
              <div className="sap-form-input-wrapper">
                <Factory size={13} className="input-icon" />
                <ValueHelpInput
                  kind="plant"
                  material={searchParams.material}
                  placeholder="e.g. 1000"
                  maxLength={4}
                  value={searchParams.plant}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, plant: e.target.value }))}
                  style={{ paddingLeft: 30 }}
                  aria-label="Display BOM Plant"
                />
              </div>
            </div>

            <div className="sap-form-group">
              <label className="sap-form-label" style={{ fontSize: '11px', marginBottom: 2 }}>
                BOM Usage
              </label>
              <div className="sap-form-input-wrapper">
                <Hash size={13} className="input-icon" />
                <ValueHelpInput
                  kind="bomUsage"
                  placeholder="1 (Production)"
                  maxLength={1}
                  value={searchParams.bomUsage}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, bomUsage: e.target.value }))}
                  style={{ paddingLeft: 30 }}
                  aria-label="Display BOM Usage"
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

          <div className="sap-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderTop: '1px solid var(--sap-border-color)', background: 'var(--sap-workspace-bg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className={`sap-btn ${viewMode === 'items' ? 'sap-btn-primary' : 'sap-btn-secondary'}`}
                onClick={() => handleModeClick('items')}
                disabled={isLoading}
                style={{
                  height: 32,
                  fontSize: 12,
                  padding: '0 14px',
                  fontWeight: 600,
                  background: viewMode === 'items' ? 'var(--sap-primary, #EA580C)' : '#ffffff',
                  color: viewMode === 'items' ? '#ffffff' : 'var(--sap-text-primary, #0f172a)',
                  border: `1px solid ${viewMode === 'items' ? 'var(--sap-primary, #EA580C)' : 'var(--sap-border-color, #e2d8d8)'}`,
                  borderRadius: 'var(--sap-radius-sm, 6px)',
                  boxShadow: viewMode === 'items' ? '0 1px 2px rgba(234, 88, 12, 0.25)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer'
                }}
              >
                <span>Single Level Items</span>
              </button>
              <button
                type="button"
                className={`sap-btn ${viewMode === 'hierarchy' ? 'sap-btn-primary' : 'sap-btn-secondary'}`}
                onClick={() => handleModeClick('hierarchy')}
                disabled={isLoading}
                style={{
                  height: 32,
                  fontSize: 12,
                  padding: '0 14px',
                  fontWeight: 600,
                  background: viewMode === 'hierarchy' ? 'var(--sap-primary, #EA580C)' : '#ffffff',
                  color: viewMode === 'hierarchy' ? '#ffffff' : 'var(--sap-text-primary, #0f172a)',
                  border: `1px solid ${viewMode === 'hierarchy' ? 'var(--sap-primary, #EA580C)' : 'var(--sap-border-color, #e2d8d8)'}`,
                  borderRadius: 'var(--sap-radius-sm, 6px)',
                  boxShadow: viewMode === 'hierarchy' ? '0 1px 2px rgba(234, 88, 12, 0.25)' : '0 1px 2px rgba(0, 0, 0, 0.03)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  opacity: isLoading ? 0.7 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer'
                }}
              >
                <FolderTree size={13} />
                <span>Multi-Level Hierarchy</span>
              </button>
            </div>

            <button
              type="submit"
              className="sap-button primary"
              disabled={isLoading}
              style={{
                height: 30,
                fontSize: 'var(--sap-size-button)',
                padding: '0 16px',
                opacity: isLoading ? 0.7 : 1,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading && loadingType === 'search' ? (
                <>
                  <span className="sap-spinner" style={{ width: 12, height: 12 }} />
                  <span>Loading BOM...</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Display BOM</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Loading state for full search */}
      {isLoading && loadingType === 'search' && (
        <div style={{ width: '100%', margin: '0 auto 20px' }}>
          <TableLoadingState message={loadingMessage || 'Loading BOM...'} minHeight={380} />
        </div>
      )}

      {/* BOM Data View */}
      {(!isLoading || loadingType !== 'search') && bomData && (() => {
        const currentAlternative = pendingAlternative || bomData.alternativeBom || bomData.header?.alternative || bomData.header?.stlal || '01';
        const availableAlternatives = bomData.availableAlternatives || bomData.allAlternatives || bomData.header?.availableAlternatives || [];

        return (
          <div className="sap-bom-explorer-results" style={{ width: '100%', margin: '0 auto 20px', paddingBottom: 0 }}>
            {/* Header Metadata Card */}
            <div className="sap-result-meta-grid" style={{ marginBottom: 16 }}>
              <div className="sap-result-meta-item">
                <span className="sap-result-meta-label" style={{ fontSize: '11px', marginBottom: 2 }}>BOM Number (STLNR)</span>
                <strong className="sap-result-meta-val">{bomData.header?.bomNumber || bomData.header?.stlnr || '-'}</strong>
              </div>
              <div className="sap-result-meta-item">
                <span className="sap-result-meta-label" style={{ fontSize: '11px', marginBottom: 2 }}>Alternative (STLAL)</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {availableAlternatives.length > 1 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <select
                        id="alt-bom-select"
                        value={String(currentAlternative).padStart(2, '0')}
                        onChange={(e) => handleSwitchAlternative(e.target.value)}
                        disabled={isLoading}
                        className="sap-form-input sap-input"
                        style={{
                          height: 30,
                          fontSize: '12px',
                          padding: '2px 8px',
                          width: 110,
                          minWidth: 100,
                          maxWidth: 120,
                          maxHeight: 200,
                          borderRadius: 'var(--sap-radius-sm, 6px)',
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          fontWeight: 600,
                          color: 'var(--sap-primary, #EA580C)',
                          border: '1px solid var(--sap-border-color, #e2d8d8)',
                          background: isLoading ? 'var(--sap-field-disabled-bg, #f8fafc)' : '#ffffff',
                          opacity: isLoading ? 0.7 : 1,
                          boxSizing: 'border-box'
                        }}
                        aria-label="Select Alternative BOM"
                      >
                        {availableAlternatives.map((alt) => {
                          const altStr = String(alt).padStart(2, '0');
                          return (
                            <option key={alt} value={altStr}>
                              {formatAlternativeLabel(alt)}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  ) : (
                    <span className="sap-badge sap-badge-primary" style={{ fontSize: '12px', padding: '3px 8px', alignSelf: 'flex-start', fontWeight: 600 }}>
                      {formatAlternativeLabel(currentAlternative)}
                    </span>
                  )}
                </div>
              </div>
              <div className="sap-result-meta-item">
                <span className="sap-result-meta-label" style={{ fontSize: '11px', marginBottom: 2 }}>Base Quantity</span>
                <strong className="sap-result-meta-val">
                  {isLoading ? '-' : `${bomData.header?.baseQty || '1'} ${bomData.header?.baseUnit || 'ST'}`}
                </strong>
              </div>
              <div className="sap-result-meta-item">
                <span className="sap-result-meta-label" style={{ fontSize: '11px', marginBottom: 2 }}>Total Components</span>
                <strong className="sap-result-meta-val" style={{ color: 'var(--sap-primary)' }}>
                  {isLoading ? '-' : components.length}
                </strong>
              </div>
            </div>

            {/* When alternative or mode is loading, render TableLoadingState in place of the table */}
            {isLoading ? (
              <TableLoadingState message={loadingMessage} minHeight={380} />
            ) : (
              /* Components Table with In-Table Filter */
              <div className="sap-table-card" style={{ height: 'auto', flex: 'none', marginBottom: 20 }}>
            <div className="sap-table-toolbar" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--sap-border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={16} color="var(--sap-primary)" />
                <h4 style={{ fontSize: '14px', fontWeight: 600 }}>Components List</h4>
                <span className="sap-badge sap-badge-neutral">{filteredComponents.length} items</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b', pointerEvents: 'none', display: 'flex', alignItems: 'center', zIndex: 2 }}>
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  placeholder="Filter components..."
                  className="sap-form-input sap-table-search-input"
                  style={{ width: 220, height: 32, fontSize: '12px', paddingLeft: 34, paddingRight: 10 }}
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
            </div>

            <div className="sap-table-container sap-card-table-scroll" tabIndex={0} role="region" aria-label="BOM Components Table">
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
                      <th
                        onClick={() => handleSort('component')}
                        style={{
                          cursor: 'pointer',
                          userSelect: 'none',
                          ...(isMultiLevel ? { minWidth: 260 } : { width: 190 })
                        }}
                      >
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
                          <td
                            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}
                            title={item.description || ''}
                          >
                            {item.description || '-'}
                          </td>
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
        )}
      </div>
    );
  })()}
        </div>
      </PageContainer>
    </div>
  );
}
