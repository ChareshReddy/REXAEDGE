import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileEdit,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Trash2,
  Undo2,
  ArrowLeft,
  ChevronLeft,
  Eye,
  Loader2,
  Layers,
  Factory,
  Hash,
  AlertCircle,
  RefreshCw,
  Search,
  Check
} from 'lucide-react';
import Modal from './Modal';
import FioriPageHeader from './FioriPageHeader';
import ValueHelpInput from './ValueHelpInput';
import Tooltip from './Tooltip';
import { Button } from './ui/button';
import { FormSection, FormGrid, FormActions } from './ui/form-layout';
import { FieldWrapper } from './ui/FieldWrapper';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { PageContainer } from './layout';
import { readBom, changeBom } from '../services/api';
import activityTracker from '../services/activityTracker';
import { useToast } from '../context/ToastContext';
import { extractErrorInfo } from '../utils/friendlyError';
import { getBreadcrumbTrail } from '@shared/breadcrumbs.js';
import { FIELD_RULES } from '@shared/fieldRules.js';

export default function ChangeBomView({
  systemKey = 'DEV',
  onBack,
  onNavigateHome,
  onNavigateProducts,
  onNavigateBom,
  initialMaterial = '',
  initialPlant = ''
}) {
  const toast = useToast();

  // 1. Initial Load Search State
  const [searchParams, setSearchParams] = useState({
    material: initialMaterial || '',
    plant: initialPlant || '',
    bomUsage: '1',
    alternativeBom: '01',
    changeNo: '',
    validFrom: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoadingBom, setIsLoadingBom] = useState(false);

  // 2. Loaded BOM state and Original snapshot for diffing
  const [isLoaded, setIsLoaded] = useState(false);
  const [originalSnapshot, setOriginalSnapshot] = useState(null);

  // 3. Editable Header State
  const [headerData, setHeaderData] = useState({
    baseQty: '1',
    baseUnit: 'EA',
    bomStatus: '01',
    headerText: '',
    validFrom: '',
    changeNo: ''
  });

  // 4. Editable Components State
  const [components, setComponents] = useState([]);

  // 5. Review Modal & Save State
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // Clear errors when SAP server changes
  useEffect(() => {
    const handleServerChanged = () => {
      setFieldErrors({});
      setTouched({});
    };
    window.addEventListener('sap-server-changed', handleServerChanged);
    return () => window.removeEventListener('sap-server-changed', handleServerChanged);
  }, []);

  // Validation for initial load
  const validateSearch = () => {
    const errors = {};
    if (!searchParams.material || !String(searchParams.material).trim()) {
      errors.material = 'Material number is required.';
    }
    if (!searchParams.plant || !String(searchParams.plant).trim()) {
      errors.plant = 'Plant code is required.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Load existing BOM from SAP
  const handleLoadBom = async () => {
    setTouched({ material: true, plant: true });
    if (!validateSearch()) return;

    setIsLoadingBom(true);
    activityTracker.setOperation('change_bom_load', true);

    try {
      const res = await readBom({
        material: searchParams.material.trim(),
        plant: searchParams.plant.trim(),
        bomUsage: searchParams.bomUsage || '1',
        alternativeBom: searchParams.alternativeBom || '01'
      });

      if (!res.success) {
        throw new Error(res.message || 'Failed to read BOM from SAP.');
      }

      const rawItems = res.components || [];
      const loadedHeader = {
        baseQty: String(res.baseQty || res.header?.baseQty || '1'),
        baseUnit: res.baseUnit || res.header?.baseUnit || 'EA',
        bomStatus: String(res.bomStatus || res.header?.bomStatus || '01'),
        headerText: res.headerText || res.altText || res.header?.headerText || '',
        validFrom: res.validFrom || res.header?.validFrom || searchParams.validFrom || '',
        changeNo: res.changeNo || res.header?.changeNo || searchParams.changeNo || ''
      };

      const mappedItems = rawItems.map((item, idx) => ({
        id: `loaded-${idx + 1}`,
        item: item.item || item.itemNo || String((idx + 1) * 10).padStart(4, '0'),
        itemNode: item.itemNode || String(idx + 1).padStart(8, '0'),
        component: item.component || '',
        description: item.description || '',
        quantity: String(item.quantity !== undefined ? item.quantity : 1),
        unit: item.unit || 'EA',
        itemCategory: item.itemCategory || 'L',
        storageLocation: item.storageLocation || '',
        itemText: item.itemText || '',
        isNew: false,
        isDeleted: false
      }));

      setHeaderData(loadedHeader);
      setComponents(mappedItems);
      setOriginalSnapshot({
        header: { ...loadedHeader },
        items: mappedItems.map((it) => ({ ...it }))
      });
      setIsLoaded(true);
      toast.success(`BOM ${searchParams.material} loaded successfully.`);
    } catch (err) {
      const info = extractErrorInfo(err, 'Failed to load BOM.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } finally {
      setIsLoadingBom(false);
      activityTracker.setOperation('change_bom_load', false);
    }
  };

  // Reset to load a different BOM
  const handleResetToSearch = () => {
    setIsLoaded(false);
    setOriginalSnapshot(null);
    setComponents([]);
    setExecutionResult(null);
    setIsReviewOpen(false);
  };

  // Add a new component row
  const handleAddComponent = () => {
    const existingPosnrs = components
      .map((c) => parseInt(c.item, 10))
      .filter((n) => !isNaN(n));
    const nextPosnr = existingPosnrs.length > 0 ? Math.max(...existingPosnrs) + 10 : 10;

    const newItem = {
      id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      item: String(nextPosnr).padStart(4, '0'),
      itemNode: null, // New items don't have itemNode yet
      component: '',
      description: '',
      quantity: '1',
      unit: 'EA',
      itemCategory: 'L', // Decision: Default to L, not editable
      storageLocation: '',
      itemText: '',
      isNew: true,
      isDeleted: false
    };

    setComponents((prev) => [...prev, newItem]);
  };

  // Update item field
  const handleItemChange = (id, field, value) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  // Mark item for deletion or delete unpersisted new item
  const handleDeleteItem = (id) => {
    setComponents((prev) => {
      const target = prev.find((c) => c.id === id);
      if (!target) return prev;
      if (target.isNew) {
        return prev.filter((c) => c.id !== id);
      }
      return prev.map((c) => (c.id === id ? { ...c, isDeleted: true } : c));
    });
  };

  // Undo deletion of an existing item
  const handleUndoDelete = (id) => {
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isDeleted: false } : c))
    );
  };

  // Calculate Differences between current working state and original snapshot
  const diff = useMemo(() => {
    if (!originalSnapshot) {
      return { hasChanges: false, headerChanges: {}, modifiedItems: [], addedItems: [], deletedItems: [] };
    }

    const headerChanges = {};
    if (headerData.baseQty.trim() !== originalSnapshot.header.baseQty.trim()) {
      headerChanges.baseQty = { old: originalSnapshot.header.baseQty, new: headerData.baseQty };
    }
    if (headerData.bomStatus.trim() !== originalSnapshot.header.bomStatus.trim()) {
      headerChanges.bomStatus = { old: originalSnapshot.header.bomStatus, new: headerData.bomStatus };
    }
    if (headerData.headerText.trim() !== originalSnapshot.header.headerText.trim()) {
      headerChanges.headerText = { old: originalSnapshot.header.headerText, new: headerData.headerText };
    }

    const addedItems = [];
    const modifiedItems = [];
    const deletedItems = [];

    for (const comp of components) {
      if (comp.isNew) {
        if (comp.component && comp.component.trim()) {
          addedItems.push(comp);
        }
      } else {
        const orig = originalSnapshot.items.find((it) => it.id === comp.id || it.itemNode === comp.itemNode);
        if (comp.isDeleted) {
          deletedItems.push(comp);
        } else if (orig) {
          const changes = {};
          if (String(comp.quantity).trim() !== String(orig.quantity).trim()) {
            changes.quantity = { old: orig.quantity, new: comp.quantity };
          }
          if (String(comp.unit || '').trim() !== String(orig.unit || '').trim()) {
            changes.unit = { old: orig.unit, new: comp.unit };
          }
          if (String(comp.storageLocation || '').trim() !== String(orig.storageLocation || '').trim()) {
            changes.storageLocation = { old: orig.storageLocation, new: comp.storageLocation };
          }
          if (String(comp.itemText || '').trim() !== String(orig.itemText || '').trim()) {
            changes.itemText = { old: orig.itemText, new: comp.itemText };
          }
          if (Object.keys(changes).length > 0) {
            modifiedItems.push({ ...comp, changes });
          }
        }
      }
    }

    const hasChanges =
      Object.keys(headerChanges).length > 0 ||
      modifiedItems.length > 0 ||
      addedItems.length > 0 ||
      deletedItems.length > 0;

    return {
      hasChanges,
      headerChanges,
      modifiedItems,
      addedItems,
      deletedItems
    };
  }, [originalSnapshot, headerData, components]);

  // Execute Save Changes to SAP
  const handleConfirmSave = async () => {
    if (!diff.hasChanges) return;

    // Pre-flight check: validate added/modified quantities > 0
    for (const itm of [...diff.addedItems, ...diff.modifiedItems]) {
      const q = parseFloat(itm.quantity);
      if (isNaN(q) || q <= 0) {
        toast.error(`Invalid quantity for component ${itm.component || itm.item}: must be greater than 0.`);
        return;
      }
    }

    setIsSaving(true);
    activityTracker.setOperation('change_bom_save', true);

    try {
      // Build RFC Change payload
      const payloadHeader = {};
      if (diff.headerChanges.baseQty) payloadHeader.baseQty = headerData.baseQty;
      if (diff.headerChanges.bomStatus) payloadHeader.bomStatus = headerData.bomStatus;
      if (diff.headerChanges.headerText) payloadHeader.headerText = headerData.headerText;

      const payloadItems = [];

      // Modifications
      for (const m of diff.modifiedItems) {
        payloadItems.push({
          changeType: 'CHANGE',
          itemNode: m.itemNode,
          item: m.item,
          component: m.component,
          quantity: parseFloat(m.quantity),
          unit: m.unit,
          storageLocation: m.storageLocation,
          itemText: m.itemText
        });
      }

      // Additions
      for (const a of diff.addedItems) {
        payloadItems.push({
          changeType: 'ADD',
          item: a.item,
          component: a.component.trim(),
          quantity: parseFloat(a.quantity),
          unit: a.unit || 'EA',
          itemCategory: 'L',
          storageLocation: a.storageLocation,
          itemText: a.itemText
        });
      }

      // Deletions
      for (const d of diff.deletedItems) {
        payloadItems.push({
          changeType: 'DELETE',
          itemNode: d.itemNode,
          item: d.item,
          component: d.component
        });
      }

      const res = await changeBom({
        material: searchParams.material.trim(),
        plant: searchParams.plant.trim(),
        bomUsage: searchParams.bomUsage || '1',
        alternativeBom: searchParams.alternativeBom || '01',
        changeNo: searchParams.changeNo || undefined,
        validFrom: searchParams.validFrom || undefined,
        header: Object.keys(payloadHeader).length > 0 ? payloadHeader : undefined,
        items: payloadItems
      });

      setIsReviewOpen(false);
      setExecutionResult({
        success: res.success,
        status: res.verified ? 'SUCCESS' : (res.code === 'WRITE_OUTCOME_UNKNOWN' ? 'UNKNOWN' : 'PARTIAL'),
        summary: res.summary || {
          headerChanged: Object.keys(diff.headerChanges).length > 0,
          itemsModified: diff.modifiedItems.length,
          itemsAdded: diff.addedItems.length,
          itemsDeleted: diff.deletedItems.length,
          totalComponentsAfter: res.components?.length || 0
        },
        components: res.components || [],
        message: res.message || 'BOM changed successfully in SAP.'
      });
      toast.success('BOM changes saved and verified successfully.');
    } catch (err) {
      const info = extractErrorInfo(err, 'Failed to save BOM changes.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } finally {
      setIsSaving(false);
      activityTracker.setOperation('change_bom_save', false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <FioriPageHeader
        title="Change Bill of Materials"
        subtitle="Modify existing BOM header and components in SAP (CS02)"
        icon={FileEdit}
        breadcrumbs={getBreadcrumbTrail('change_bom', { onNavigateHome, onNavigateProducts, onNavigateBom: onNavigateBom || onBack, onBack })}
      />

      <PageContainer style={{ marginTop: 24, paddingBottom: 24 }}>
        {/* RESULT SCREEN */}
        {executionResult ? (
          <div>
            {/* Result Banner */}
            {executionResult.status === 'SUCCESS' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg, 8px)',
                  background: 'var(--sap-success-bg, #F0FDF4)',
                  border: '1px solid var(--sap-success-border, #BBF7D0)',
                  color: 'var(--sap-success, #16A34A)',
                  marginBottom: 24
                }}
              >
                <CheckCircle2 size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Changed Successfully</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                    Material {searchParams.material} (Plant {searchParams.plant}, Alt {searchParams.alternativeBom}): Changes written and verified in SAP.
                  </p>
                </div>
              </div>
            ) : executionResult.status === 'UNKNOWN' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg, 8px)',
                  background: 'var(--sap-warning-bg, #FFFBEB)',
                  border: '1px solid var(--sap-warning-border, #FDE68A)',
                  color: 'var(--sap-warning, #D97706)',
                  marginBottom: 24
                }}
              >
                <AlertTriangle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Write Outcome Unknown</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                    {executionResult.message || 'Operation timed out during write. Please use Display BOM to verify whether changes took effect before retrying.'}
                  </p>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '16px 20px',
                  borderRadius: 'var(--radius-lg, 8px)',
                  background: 'var(--sap-error-bg, #FEF2F2)',
                  border: '1px solid var(--sap-error-border, #FECACA)',
                  color: 'var(--sap-error, #DC2626)',
                  marginBottom: 24
                }}
              >
                <XCircle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Change Failed</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark, #0F172A)' }}>
                    {executionResult.message || 'The SAP system rejected the BOM change request.'}
                  </p>
                </div>
              </div>
            )}

            {/* Summary KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 16,
                marginBottom: 28
              }}
            >
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #64748B)', marginBottom: 4 }}>Header Changed</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-text-dark, #0F172A)' }}>
                  {executionResult.summary?.headerChanged ? 'Yes' : 'No'}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #64748B)', marginBottom: 4 }}>Items Modified</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary, #0284C7)' }}>
                  {executionResult.summary?.itemsModified || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #64748B)', marginBottom: 4 }}>Items Added</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-success, #16A34A)' }}>
                  {executionResult.summary?.itemsAdded || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #64748B)', marginBottom: 4 }}>Items Deleted</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-error, #DC2626)' }}>
                  {executionResult.summary?.itemsDeleted || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted, #64748B)', marginBottom: 4 }}>Total Components</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-text-dark, #0F172A)' }}>
                  {executionResult.summary?.totalComponentsAfter || executionResult.components?.length || 0}
                </div>
              </div>
            </div>

            {/* Verified Components Table */}
            {executionResult.components && executionResult.components.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-[var(--color-navy-900)] mb-2">Verified BOM Components in SAP</h4>
                <div className="sap-table-container fiori-table-wrapper rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  <table className="sap-table w-full border-collapse text-[13px]" style={{ width: '100%', tableLayout: 'fixed' }}>
                    <thead>
                      <tr className="bg-[var(--table-header-bg)] border-b border-[var(--color-border)] h-[44px]">
                        <th style={{ width: '10%', textAlign: 'center' }}>Item</th>
                        <th style={{ width: '30%', textAlign: 'left' }}>Component</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Quantity</th>
                        <th style={{ width: '10%', textAlign: 'center' }}>Unit</th>
                        <th style={{ width: '15%', textAlign: 'left' }}>SLoc</th>
                        <th style={{ width: '20%', textAlign: 'left' }}>Item Text</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionResult.components.map((c, i) => (
                        <tr key={i} className="border-b border-[var(--color-border-subtle)] h-[40px]">
                          <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }}>{c.item || c.itemNo}</td>
                          <td className="font-mono font-medium">{c.component}</td>
                          <td style={{ textAlign: 'right' }}>{c.quantity}</td>
                          <td style={{ textAlign: 'center' }}>{c.unit}</td>
                          <td>{c.storageLocation || '—'}</td>
                          <td className="truncate">{c.itemText || c.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="sap-btn sap-btn-primary"
                onClick={handleResetToSearch}
                style={{ padding: '9px 20px' }}
              >
                Change Another BOM
              </button>
              <button
                type="button"
                className="sap-btn sap-btn-secondary"
                onClick={onBack}
                style={{ padding: '9px 20px' }}
              >
                Return to Launchpad
              </button>
            </div>
          </div>
        ) : !isLoaded ? (
          /* STEP 1: LOAD FORM */
          <FormSection
            title="Select BOM to Change"
            description="Enter the Material, Plant, and Alternative to fetch current BOM details from SAP."
            icon={Search}
          >
            <FormGrid cols={4}>
              <FieldWrapper
                label="Material Number"
                htmlFor="chgMaterial"
                required
                error={touched.material ? fieldErrors.material || null : null}
              >
                <ValueHelpInput
                  id="chgMaterial"
                  kind="material"
                  plant={searchParams.plant}
                  placeholder="Ex. MAT-CHG-001"
                  maxLength={FIELD_RULES.material.maxLength}
                  value={searchParams.material}
                  onChange={(e) => {
                    setSearchParams((prev) => ({ ...prev, material: e.target.value }));
                    if (fieldErrors.material) setFieldErrors((prev) => ({ ...prev, material: null }));
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, material: true }))}
                  onSelect={(val, full) => {
                    setSearchParams((prev) => ({
                      ...prev,
                      material: val,
                      ...(full?.stlal ? { alternativeBom: full.stlal } : {}),
                      ...(full?.werks && !prev.plant ? { plant: full.werks } : {})
                    }));
                    if (fieldErrors.material) setFieldErrors((prev) => ({ ...prev, material: null }));
                  }}
                  hasError={Boolean(touched.material && fieldErrors.material)}
                  aria-label="Change BOM Material"
                />
              </FieldWrapper>

              <FieldWrapper
                label="Plant Code"
                htmlFor="chgPlant"
                required
                error={touched.plant ? fieldErrors.plant || null : null}
              >
                <ValueHelpInput
                  id="chgPlant"
                  kind="plant"
                  material={searchParams.material}
                  placeholder="Ex. 1000"
                  maxLength={FIELD_RULES.plant.maxLength}
                  value={searchParams.plant}
                  onChange={(e) => {
                    setSearchParams((prev) => ({ ...prev, plant: e.target.value }));
                    if (fieldErrors.plant) setFieldErrors((prev) => ({ ...prev, plant: null }));
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, plant: true }))}
                  hasError={Boolean(touched.plant && fieldErrors.plant)}
                  aria-label="Change BOM Plant"
                />
              </FieldWrapper>

              <FieldWrapper
                label="BOM Usage"
                htmlFor="chgUsage"
              >
                <ValueHelpInput
                  id="chgUsage"
                  kind="bomUsage"
                  placeholder="1 (Production)"
                  maxLength={FIELD_RULES.bomUsage.maxLength}
                  value={searchParams.bomUsage}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, bomUsage: e.target.value }))}
                  aria-label="Change BOM Usage"
                />
              </FieldWrapper>

              <FieldWrapper
                label="Alternative BOM"
                htmlFor="chgAlt"
              >
                <Input
                  id="chgAlt"
                  type="text"
                  placeholder="Ex. 01"
                  maxLength={FIELD_RULES.alternativeBom.maxLength}
                  value={searchParams.alternativeBom}
                  onChange={(e) => setSearchParams((prev) => ({ ...prev, alternativeBom: e.target.value }))}
                  isMono
                  aria-label="Change BOM Alternative"
                />
              </FieldWrapper>
            </FormGrid>

            {/* Optional Change Master Fields */}
            <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
              <span className="text-xs font-semibold text-[var(--sap-text-muted)] uppercase tracking-wider block mb-2">
                Engineering Change Management (Optional)
              </span>
              <FormGrid cols={2}>
                <FieldWrapper label="Change Number" htmlFor="chgChangeNo">
                  <Input
                    id="chgChangeNo"
                    type="text"
                    placeholder="Ex. ECM-2026-001 (Optional)"
                    value={searchParams.changeNo}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, changeNo: e.target.value }))}
                    isMono
                  />
                </FieldWrapper>
                <FieldWrapper label="Valid-From Date" htmlFor="chgValidFrom">
                  <Input
                    id="chgValidFrom"
                    type="text"
                    placeholder="DD.MM.YYYY (Optional)"
                    value={searchParams.validFrom}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, validFrom: e.target.value }))}
                    isMono
                  />
                </FieldWrapper>
              </FormGrid>
            </div>

            <FormActions
              className="mt-6 pt-4 border-t border-[var(--color-border-subtle)]"
              right={
                <Button
                  id="btn-load-bom"
                  type="button"
                  onClick={handleLoadBom}
                  disabled={isLoadingBom}
                  style={{
                    backgroundColor: 'var(--color-navy-900, #00204E)',
                    color: '#FFFFFF',
                    padding: '8px 24px'
                  }}
                >
                  {isLoadingBom ? (
                    <>
                      <Loader2 size={16} className="animate-spin mr-2 inline" />
                      Loading from SAP...
                    </>
                  ) : (
                    <>
                      <Search size={16} className="mr-2 inline" />
                      Load BOM
                    </>
                  )}
                </Button>
              }
            />
          </FormSection>
        ) : (
          /* STEP 2: EDIT BOM */
          <div className="flex flex-col gap-6">
            {/* Target BOM Context Bar */}
            <div
              className="sap-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                background: 'var(--color-blue-50, #EEF4F9)',
                border: '1px solid var(--color-border, #CBD5E1)',
                borderRadius: 'var(--radius-md, 6px)'
              }}
            >
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-[var(--sap-text-muted)] mr-2 font-medium">Material:</span>
                  <span className="font-mono font-bold text-[var(--color-navy-900)] text-base">{searchParams.material}</span>
                </div>
                <div>
                  <span className="text-[var(--sap-text-muted)] mr-2 font-medium">Plant:</span>
                  <span className="font-semibold text-[var(--color-navy-900)]">{searchParams.plant}</span>
                </div>
                <div>
                  <span className="text-[var(--sap-text-muted)] mr-2 font-medium">Usage:</span>
                  <span className="font-semibold">{searchParams.bomUsage}</span>
                </div>
                <div>
                  <span className="text-[var(--sap-text-muted)] mr-2 font-medium">Alternative:</span>
                  <span className="font-mono font-semibold">{searchParams.alternativeBom}</span>
                </div>
              </div>
              <button
                type="button"
                className="sap-btn sap-btn-secondary text-xs"
                onClick={handleResetToSearch}
                style={{ padding: '6px 14px' }}
              >
                Switch BOM
              </button>
            </div>

            {/* Header Data Section */}
            <FormSection
              title="BOM Header Data"
              description="Header fields permitted to be modified in SAP."
              icon={Layers}
            >
              <FormGrid cols={3}>
                <FieldWrapper label="Base Quantity" htmlFor="hdrBaseQty" required>
                  <div className="flex gap-2">
                    <Input
                      id="hdrBaseQty"
                      type="number"
                      step="any"
                      min="0.001"
                      value={headerData.baseQty}
                      onChange={(e) => setHeaderData((prev) => ({ ...prev, baseQty: e.target.value }))}
                      style={{ flex: 2 }}
                    />
                    <Input
                      id="hdrBaseUnit"
                      type="text"
                      disabled
                      value={headerData.baseUnit}
                      style={{ flex: 1, backgroundColor: 'var(--color-surface-subtle, #F8FAFC)' }}
                    />
                  </div>
                </FieldWrapper>

                <FieldWrapper label="BOM Status" htmlFor="hdrBomStatus" required>
                  <select
                    id="hdrBomStatus"
                    className="rx-input h-[38px]"
                    value={headerData.bomStatus}
                    onChange={(e) => setHeaderData((prev) => ({ ...prev, bomStatus: e.target.value }))}
                  >
                    <option value="01">01 - Active</option>
                    <option value="02">02 - Inactive</option>
                  </select>
                </FieldWrapper>

                <FieldWrapper label="Header Text" htmlFor="hdrText">
                  <Input
                    id="hdrText"
                    type="text"
                    placeholder="Enter header description..."
                    value={headerData.headerText}
                    onChange={(e) => setHeaderData((prev) => ({ ...prev, headerText: e.target.value }))}
                  />
                </FieldWrapper>
              </FormGrid>
            </FormSection>

            {/* Editable Components Section */}
            <FormSection
              title="BOM Components"
              description="Modify quantities, units, and storage locations. Mark items for deletion or add new components."
              icon={Plus}
              actions={
                <Button
                  id="btn-add-component"
                  type="button"
                  onClick={handleAddComponent}
                  style={{
                    backgroundColor: 'var(--color-navy-900, #00204E)',
                    color: '#FFFFFF',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '6px 14px'
                  }}
                >
                  <Plus size={16} strokeWidth={2.4} />
                  <span>Add Component</span>
                </Button>
              }
            >
              <div className="sap-table-container fiori-table-wrapper rounded-[var(--radius-md)] border border-[var(--color-border)] rx-components-table-container">
                <table className="sap-table w-full border-collapse text-[13px] rx-components-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '10%' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-[var(--table-header-bg)] border-b border-[var(--color-border)] h-[48px]">
                      <th style={{ textAlign: 'center', padding: '0 8px' }}>Item</th>
                      <th style={{ textAlign: 'left', padding: '0 8px' }}>Component</th>
                      <th style={{ textAlign: 'left', padding: '0 8px' }}>Quantity</th>
                      <th style={{ textAlign: 'left', padding: '0 8px' }}>Unit</th>
                      <th style={{ textAlign: 'center', padding: '0 8px' }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '0 8px' }}>Storage Loc</th>
                      <th style={{ textAlign: 'left', padding: '0 8px' }}>Item Text</th>
                      <th style={{ textAlign: 'center', padding: '0 8px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {components.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-[var(--color-text-secondary)]">
                          No components found. Click "Add Component" above.
                        </td>
                      </tr>
                    ) : (
                      components.map((comp, idx) => {
                        const isDeleted = comp.isDeleted;
                        const rowStyle = isDeleted
                          ? {
                              textDecoration: 'line-through',
                              opacity: 0.6,
                              backgroundColor: 'var(--color-danger-50, #FEF2F2)'
                            }
                          : {};

                        return (
                          <tr
                            key={comp.id}
                            className={`border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-blue-50)] h-[46px] ${isDeleted ? 'opacity-60 bg-red-50/50' : ''}`}
                            style={rowStyle}
                          >
                            {/* Item POSNR */}
                            <td style={{ textAlign: 'center', color: 'var(--sap-text-muted)' }} className="px-2 py-1.5 font-mono">
                              {comp.item}
                            </td>

                            {/* Component Material */}
                            <td className="px-2 py-1.5">
                              {comp.isNew ? (
                                <ValueHelpInput
                                  id={`comp_mat_${comp.id}`}
                                  kind="material"
                                  plant={searchParams.plant}
                                  placeholder="Component material"
                                  maxLength={FIELD_RULES.component.maxLength}
                                  isTable={true}
                                  value={comp.component}
                                  onChange={(e) => handleItemChange(comp.id, 'component', e.target.value)}
                                  aria-label={`Component ${idx + 1}`}
                                />
                              ) : (
                                <div className="flex flex-col">
                                  <span className="font-mono font-medium text-[var(--color-navy-900)]">
                                    {comp.component}
                                  </span>
                                  {comp.description && (
                                    <span className="text-xs text-[var(--sap-text-muted)] truncate">
                                      {comp.description}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Quantity */}
                            <td className="px-2 py-1.5">
                              <input
                                type="number"
                                step="any"
                                min="0.001"
                                className="rx-input rx-input-table"
                                disabled={isDeleted}
                                value={comp.quantity}
                                onChange={(e) => handleItemChange(comp.id, 'quantity', e.target.value)}
                                aria-label={`Quantity for ${comp.component || comp.item}`}
                              />
                            </td>

                            {/* Unit */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                className="rx-input rx-input-table uppercase text-center"
                                maxLength={3}
                                disabled={isDeleted}
                                value={comp.unit}
                                onChange={(e) => handleItemChange(comp.id, 'unit', e.target.value)}
                                aria-label={`Unit for ${comp.component || comp.item}`}
                              />
                            </td>

                            {/* Category (Read-only L) */}
                            <td className="px-2 py-1.5 text-center">
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--color-blue-100,#DBEAFE)] text-[var(--color-primary,#0284C7)]">
                                {comp.itemCategory}
                              </span>
                            </td>

                            {/* Storage Location */}
                            <td className="px-2 py-1.5">
                              <ValueHelpInput
                                kind="storageLocation"
                                plant={searchParams.plant}
                                placeholder="SLoc"
                                isTable={true}
                                disabled={isDeleted}
                                value={comp.storageLocation}
                                onChange={(e) => handleItemChange(comp.id, 'storageLocation', e.target.value)}
                                onSelect={(sloc) => handleItemChange(comp.id, 'storageLocation', sloc)}
                                aria-label={`Storage location for ${comp.component || comp.item}`}
                              />
                            </td>

                            {/* Item Text */}
                            <td className="px-2 py-1.5">
                              <input
                                type="text"
                                className="rx-input rx-input-table"
                                placeholder="Notes..."
                                disabled={isDeleted}
                                value={comp.itemText}
                                onChange={(e) => handleItemChange(comp.id, 'itemText', e.target.value)}
                                aria-label={`Item text for ${comp.component || comp.item}`}
                              />
                            </td>

                            {/* Actions (Delete / Undo) */}
                            <td className="px-2 py-1.5 text-center">
                              {isDeleted ? (
                                <button
                                  type="button"
                                  className="rx-btn rx-btn-sm rx-btn-secondary inline-flex items-center gap-1 text-xs"
                                  onClick={() => handleUndoDelete(comp.id)}
                                  title="Undo deletion"
                                >
                                  <Undo2 size={13} />
                                  <span>Undo</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] transition-colors rounded"
                                  onClick={() => handleDeleteItem(comp.id)}
                                  title={comp.isNew ? 'Remove component' : 'Mark for deletion'}
                                  aria-label={`Delete component ${comp.component || comp.item}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </FormSection>

            {/* Bottom Actions Bar */}
            <div
              className="flex items-center justify-between p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)]"
            >
              <div className="text-xs text-[var(--sap-text-muted)]">
                {diff.hasChanges ? (
                  <span className="text-[var(--color-primary)] font-medium">
                    Changes pending: {[
                      Object.keys(diff.headerChanges).length > 0 ? 'Header' : null,
                      diff.modifiedItems.length > 0 ? `${diff.modifiedItems.length} modified` : null,
                      diff.addedItems.length > 0 ? `${diff.addedItems.length} added` : null,
                      diff.deletedItems.length > 0 ? `${diff.deletedItems.length} deleted` : null
                    ].filter(Boolean).join(', ')}
                  </span>
                ) : (
                  <span>No changes detected. Save is disabled until modifications are made.</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="sap-btn sap-btn-secondary"
                  onClick={onBack}
                >
                  Cancel
                </button>
                <Button
                  id="btn-review-changes"
                  type="button"
                  disabled={!diff.hasChanges || isSaving}
                  onClick={() => setIsReviewOpen(true)}
                  style={{
                    backgroundColor: diff.hasChanges ? 'var(--color-navy-900, #00204E)' : 'var(--color-gray-300, #CBD5E1)',
                    color: '#FFFFFF',
                    padding: '8px 24px',
                    fontWeight: 600,
                    cursor: diff.hasChanges ? 'pointer' : 'not-allowed'
                  }}
                >
                  Review Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </PageContainer>

      {/* REVIEW CHANGES MODAL (Modal rule: never closes on backdrop click) */}
      <Modal
        isOpen={isReviewOpen}
        onClose={() => !isSaving && setIsReviewOpen(false)}
        title="Review BOM Changes"
        subtitle={`Verify the differences before applying them to SAP for material ${searchParams.material}.`}
        icon={FileEdit}
        maxWidth={640}
        isLoading={isSaving}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <button
              type="button"
              className="sap-btn sap-btn-secondary"
              disabled={isSaving}
              onClick={() => setIsReviewOpen(false)}
            >
              Back to Edit
            </button>
            <Button
              id="btn-confirm-save-bom"
              type="button"
              disabled={isSaving}
              onClick={handleConfirmSave}
              style={{
                backgroundColor: 'var(--color-navy-900, #00204E)',
                color: '#FFFFFF',
                padding: '8px 20px'
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2 inline" />
                  Saving to SAP...
                </>
              ) : (
                'Confirm & Save'
              )}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 text-sm">
          {/* Header Changes */}
          {Object.keys(diff.headerChanges).length > 0 && (
            <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3 bg-[var(--color-surface-subtle,#F8FAFC)]">
              <span className="text-xs font-bold text-[var(--color-navy-900)] block mb-2 uppercase tracking-wide">
                Header Modifications
              </span>
              <div className="flex flex-col gap-1 text-xs">
                {diff.headerChanges.baseQty && (
                  <div className="flex justify-between py-1 border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--sap-text-muted)] font-medium">Base Quantity:</span>
                    <span>
                      <s className="text-[var(--color-danger)] mr-2">{diff.headerChanges.baseQty.old}</s>
                      <span className="font-bold text-[var(--sap-success)]">{diff.headerChanges.baseQty.new}</span>
                    </span>
                  </div>
                )}
                {diff.headerChanges.bomStatus && (
                  <div className="flex justify-between py-1 border-b border-[var(--color-border-subtle)]">
                    <span className="text-[var(--sap-text-muted)] font-medium">BOM Status:</span>
                    <span>
                      <s className="text-[var(--color-danger)] mr-2">{diff.headerChanges.bomStatus.old}</s>
                      <span className="font-bold text-[var(--sap-success)]">{diff.headerChanges.bomStatus.new}</span>
                    </span>
                  </div>
                )}
                {diff.headerChanges.headerText && (
                  <div className="flex justify-between py-1">
                    <span className="text-[var(--sap-text-muted)] font-medium">Header Text:</span>
                    <span>
                      <s className="text-[var(--color-danger)] mr-2">{diff.headerChanges.headerText.old || '(empty)'}</s>
                      <span className="font-bold text-[var(--sap-success)]">{diff.headerChanges.headerText.new}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Changed Items */}
          {diff.modifiedItems.length > 0 && (
            <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3">
              <span className="text-xs font-bold text-[var(--color-primary)] block mb-2 uppercase tracking-wide">
                Changed Components ({diff.modifiedItems.length})
              </span>
              <div className="flex flex-col gap-2">
                {diff.modifiedItems.map((m, idx) => (
                  <div key={idx} className="p-2 rounded bg-[var(--color-blue-50,#EEF4F9)] text-xs">
                    <div className="flex justify-between font-medium text-[var(--color-navy-900)] mb-1">
                      <span>Item {m.item}: {m.component}</span>
                      <span className="text-[var(--sap-text-muted)] font-mono text-[11px]">{m.itemNode}</span>
                    </div>
                    {Object.entries(m.changes).map(([fKey, chg]) => (
                      <div key={fKey} className="flex justify-between text-[11px] text-[var(--sap-text-dark)]">
                        <span className="capitalize">{fKey}:</span>
                        <span>
                          <s className="text-[var(--color-danger)] mr-2">{chg.old || '—'}</s>
                          <span className="font-bold text-[var(--sap-success)]">{chg.new || '—'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Added Items */}
          {diff.addedItems.length > 0 && (
            <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3">
              <span className="text-xs font-bold text-[var(--sap-success)] block mb-2 uppercase tracking-wide">
                Added Components ({diff.addedItems.length})
              </span>
              <div className="flex flex-col gap-2">
                {diff.addedItems.map((a, idx) => (
                  <div key={idx} className="p-2 rounded bg-green-50/60 border border-green-200 text-xs flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[var(--color-navy-900)]">{a.component}</span>
                      <span className="text-[var(--sap-text-muted)]">Qty: {a.quantity} {a.unit}</span>
                      {a.storageLocation && <span className="text-[var(--sap-text-muted)]">({a.storageLocation})</span>}
                    </div>
                    <Badge variant="outline" className="text-green-700 bg-green-100 border-green-300">
                      New (Cat {a.itemCategory})
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deleted Items */}
          {diff.deletedItems.length > 0 && (
            <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] p-3">
              <span className="text-xs font-bold text-[var(--color-danger)] block mb-2 uppercase tracking-wide">
                Deleted Components ({diff.deletedItems.length})
              </span>
              <div className="flex flex-col gap-2">
                {diff.deletedItems.map((d, idx) => (
                  <div key={idx} className="p-2 rounded bg-red-50/60 border border-red-200 text-xs flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-[var(--color-navy-900)] line-through">{d.component}</span>
                      <span className="text-[var(--sap-text-muted)]">Item {d.item} (Qty: {d.quantity} {d.unit})</span>
                    </div>
                    <Badge variant="outline" className="text-red-700 bg-red-100 border-red-300">
                      Marked for Deletion
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
