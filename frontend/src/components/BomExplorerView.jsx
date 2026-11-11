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
import { FormSection, FormGrid, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { Input, SearchInput } from './ui/input';
import { Badge } from './ui/badge';
import TableLoadingState from './TableLoadingState';
import { extractErrorInfo } from '../utils/friendlyError';
import { PageContainer } from './layout';
import { FIELD_RULES, validateField } from '@shared/fieldRules.js';
import { checkFieldExistence } from '../services/fieldValidationService';

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
 * Formats alternative number for loading sentence (Ex. "02" -> "2").
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const userInteractedRef = React.useRef({});
  const validationSeqRef = React.useRef({});

  const handleUserInteraction = (field) => {
    userInteractedRef.current[field] = true;
  };

  useEffect(() => {
    setFieldErrors({});
    setTouched({});
    setIsSubmitted(false);
    userInteractedRef.current = {};
    validationSeqRef.current = {};
  }, [systemKey]);

  useEffect(() => {
    const handleServerChanged = () => {
      setFieldErrors({});
      setTouched({});
      setIsSubmitted(false);
      userInteractedRef.current = {};
      validationSeqRef.current = {};
    };
    window.addEventListener('sap-server-changed', handleServerChanged);
    return () => window.removeEventListener('sap-server-changed', handleServerChanged);
  }, []);

  const handleBlur = async (field, ruleKey, isRequired) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const val = searchParams[field];
    const res = validateField(ruleKey, val, isRequired);
    if (!res.valid) {
      setFieldErrors((prev) => ({ ...prev, [field]: res.error }));
      return;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: false }));

    if (val && val.trim() && (ruleKey === 'material' || ruleKey === 'plant')) {
      const curVal = val.trim();
      validationSeqRef.current[field] = (validationSeqRef.current[field] || 0) + 1;
      const seq = validationSeqRef.current[field];
      const existRes = await checkFieldExistence({
        kind: ruleKey,
        value: curVal,
        plant: searchParams.plant,
        serverId: systemKey
      });
      if (validationSeqRef.current[field] !== seq || searchParams[field]?.trim() !== curVal) return;
      if (!existRes.valid && existRes.error) {
        setFieldErrors((prev) => ({ ...prev, [field]: existRes.error }));
      }
    }
  };

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
    setIsSubmitted(true);
    setTouched({ material: true, plant: true, bomUsage: true, alternativeBom: true });
    if (isLoading) return;

    const errors = {};
    const matRes = validateField('material', searchParams.material, true);
    if (!matRes.valid) errors.material = matRes.error;
    const plantRes = validateField('plant', searchParams.plant, true);
    if (!plantRes.valid) errors.plant = plantRes.error;
    const usageRes = validateField('bomUsage', searchParams.bomUsage, false);
    if (!usageRes.valid) errors.bomUsage = usageRes.error;
    const altRes = validateField('alternativeBom', searchParams.alternativeBom, false);
    if (!altRes.valid) errors.alternativeBom = altRes.error;

    // Check existence if format passed
    if (!errors.material && searchParams.material.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'material',
        value: searchParams.material.trim(),
        plant: searchParams.plant,
        serverId: systemKey
      });
      if (!existRes.valid && existRes.error) {
        errors.material = existRes.error;
      }
    }
    if (!errors.plant && searchParams.plant.trim()) {
      const existRes = await checkFieldExistence({
        kind: 'plant',
        value: searchParams.plant.trim(),
        serverId: systemKey
      });
      if (!existRes.valid && existRes.error) {
        errors.plant = existRes.error;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      if (!searchParams.material.trim() || !searchParams.plant.trim()) {
        setErrorMessage('Please enter both Material and Plant to inspect the BOM.');
      } else {
        setErrorMessage(errors.material || errors.plant || matRes.error || plantRes.error || usageRes.error || altRes.error);
      }
      if (errors.material) document.getElementById('searchMaterial')?.focus();
      else if (errors.plant) document.getElementById('searchPlant')?.focus();
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
          <FormSection
            title="BOM Explorer Parameters"
            description="Material and plant specification for BOM explosion"
            className="mb-4"
          >
            <form onSubmit={handleSearch}>
              <FormGrid cols={4}>
                <FieldWrapper
                  label="Material Number"
                  htmlFor="expMaterial"
                  required
                  error={(touched.material || isSubmitted) ? fieldErrors.material || null : null}
                >
                  <ValueHelpInput
                    id="expMaterial"
                    kind="material"
                    plant={searchParams.plant}
                    placeholder="Ex. A1BH0214C or 100001"
                    maxLength={FIELD_RULES.material.maxLength}
                    value={searchParams.material}
                    onChange={(e) => {
                      setSearchParams((prev) => ({ ...prev, material: e.target.value }));
                      if (fieldErrors.material) setFieldErrors((prev) => ({ ...prev, material: false }));
                    }}
                    onBlur={() => handleBlur('material', 'material', true)}
                    onSelect={(val, full) => {
                      setSearchParams((prev) => ({
                        ...prev,
                        material: val,
                        ...(full?.stlal ? { alternativeBom: full.stlal } : {}),
                        ...(full?.werks && !prev.plant ? { plant: full.werks } : {})
                      }));
                      if (fieldErrors.material) setFieldErrors((prev) => ({ ...prev, material: false }));
                    }}
                    hasError={Boolean((touched.material || isSubmitted) && fieldErrors.material)} onPointerDown={() => handleUserInteraction('material')} onKeyDown={() => handleUserInteraction('material')}
                    aria-label="Display BOM Material"
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Plant Code"
                  htmlFor="expPlant"
                  required
                  error={(touched.plant || isSubmitted) ? fieldErrors.plant || null : null}
                >
                  <ValueHelpInput
                    id="expPlant"
                    kind="plant"
                    material={searchParams.material}
                    placeholder="Ex. 1010 or 1000"
                    maxLength={FIELD_RULES.plant.maxLength}
                    value={searchParams.plant}
                    onChange={(e) => {
                      setSearchParams((prev) => ({ ...prev, plant: e.target.value }));
                      if (fieldErrors.plant) setFieldErrors((prev) => ({ ...prev, plant: false }));
                    }}
                    onBlur={() => handleBlur('plant', 'plant', true)}
                    hasError={Boolean((touched.plant || isSubmitted) && fieldErrors.plant)} onPointerDown={() => handleUserInteraction('plant')} onKeyDown={() => handleUserInteraction('plant')}
                    aria-label="Display BOM Plant"
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="BOM Usage"
                  htmlFor="expUsage"
                  error={(touched.bomUsage || isSubmitted) ? fieldErrors.bomUsage || null : null}
                >
                  <ValueHelpInput
                    id="expUsage"
                    kind="bomUsage"
                    placeholder="1 (Production)"
                    maxLength={FIELD_RULES.bomUsage.maxLength}
                    value={searchParams.bomUsage}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, bomUsage: e.target.value }))}
                    onBlur={() => handleBlur('bomUsage', 'bomUsage', false)}
                    hasError={Boolean((touched.bomUsage || isSubmitted) && fieldErrors.bomUsage)} onPointerDown={() => handleUserInteraction('bomUsage')} onKeyDown={() => handleUserInteraction('bomUsage')}
                    aria-label="Display BOM Usage"
                  />
                </FieldWrapper>

                <FieldWrapper
                  label="Alternative BOM"
                  htmlFor="expAlternativeBom"
                  error={(touched.alternativeBom || isSubmitted) ? fieldErrors.alternativeBom || null : null}
                >
                  <Input
                    id="expAlternativeBom"
                    type="text"
                    placeholder="Ex. 01"
                    maxLength={FIELD_RULES.alternativeBom.maxLength}
                    value={searchParams.alternativeBom}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, alternativeBom: e.target.value }))}
                    onBlur={() => handleBlur('alternativeBom', 'alternativeBom', false)}
                    hasError={Boolean((touched.alternativeBom || isSubmitted) && fieldErrors.alternativeBom)} onPointerDown={() => handleUserInteraction('alternativeBom')} onKeyDown={() => handleUserInteraction('alternativeBom')}
                    isMono
                  />
                </FieldWrapper>
              </FormGrid>

              <FormActions
                className="mt-4 pt-3 border-t border-[var(--color-border-subtle)]"
                left={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={`rx-btn rx-btn-sm ${viewMode === 'items' ? 'rx-btn-primary' : 'rx-btn-secondary'}`}
                      onClick={() => handleModeClick('items')}
                      disabled={isLoading}
                    >
                      <span>Single Level Items</span>
                    </button>
                    <button
                      type="button"
                      className={`rx-btn rx-btn-sm ${viewMode === 'hierarchy' ? 'rx-btn-primary' : 'rx-btn-secondary'}`}
                      onClick={() => handleModeClick('hierarchy')}
                      disabled={isLoading}
                    >
                      <FolderTree size={14} />
                      <span>Multi-Level Hierarchy</span>
                    </button>
                  </div>
                }
                right={
                  <button
                    type="submit"
                    className="rx-btn rx-btn-primary"
                    disabled={isLoading}
                  >
                    {isLoading && loadingType === 'search' ? (
                      <>
                        <RefreshCw size={15} className="sap-spin" />
                        <span>Loading BOM...</span>
                      </>
                    ) : (
                      <>
                        <Search size={15} />
                        <span>Display BOM</span>
                      </>
                    )}
                  </button>
                }
              />
            </form>
          </FormSection>

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
                        className="rx-select"
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
                          color: 'var(--sap-primary, #02579A)',
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
              <FormSection
                title="Components List"
                description={`Showing ${filteredComponents.length} component item${filteredComponents.length === 1 ? '' : 's'}`}
                badge={<span className="sap-badge sap-badge-neutral">{filteredComponents.length} items</span>}
                actions={
                  <SearchInput
                    placeholder="Filter components..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    onClear={() => setFilterText('')}
                    isTable
                    wrapperStyle={{ width: 220 }}
                  />
                }
                className="sap-table-card mb-5"
                style={{ height: 'auto', flex: 'none' }}
              >
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
                          <td className="sap-col-code" style={{ fontFamily: 'var(--sap-font-mono, monospace)', fontWeight: 'var(--font-weight-code, 500)' }}>{item.itemNo || item.item || item.POSNR || (idx + 1) * 10}</td>
                          <td>
                            <div style={{ display: 'inline-flex', alignItems: 'center', paddingLeft: indentLevel * 20 }}>
                              {indentLevel > 0 && (
                                <span style={{ color: 'var(--sap-text-muted)', marginRight: 6, fontFamily: 'monospace', fontWeight: 400 }}>
                                  └──
                                </span>
                              )}
                              <span className="sap-col-code" style={{ fontFamily: 'var(--sap-font-mono, monospace)', fontWeight: 'var(--font-weight-code, 500)' }}>{displayMat}</span>
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
          </FormSection>
        )}
      </div>
    );
  })()}
        </div>
      </PageContainer>
    </div>
  );
}
