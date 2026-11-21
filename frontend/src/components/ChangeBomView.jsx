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
import { DataTable } from './ui/DataTable';
import { formatMaterialNumber } from './BomExplorerView';
import { PageContainer } from './layout';
import { readBom, changeBom, getBomAlternatives } from '../services/api';
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
  initialPlant = '',
  initialAlternative = ''
}) {
  const toast = useToast();

  // 1. Initial Load Search State
  const [searchParams, setSearchParams] = useState({
    material: initialMaterial || '',
    plant: initialPlant || '',
    bomUsage: '1',
    alternativeBom: initialAlternative || '',
    changeNo: '',
    validFrom: ''
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isLoadingBom, setIsLoadingBom] = useState(false);

  // Alternative Selection Modal State
  const [isAlternativeModalOpen, setIsAlternativeModalOpen] = useState(false);
  const [alternativeList, setAlternativeList] = useState([]);
  const [selectedAlternative, setSelectedAlternative] = useState(null);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false);
  const [alternativeLookupError, setAlternativeLookupError] = useState(null);

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

  // Helper to populate loaded BOM into form state
  const applyLoadedBom = (res, chosenAlt) => {
    const rawItems = res.components || [];
    const effAlt = chosenAlt || res.alternativeBom || res.alternative || res.header?.alternative || '01';
    setSearchParams((prev) => ({
      ...prev,
      alternativeBom: effAlt
    }));

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
    toast.success(`BOM ${searchParams.material.toUpperCase()} loaded successfully.`);
  };

  // Confirm alternative from selection popup
  const handleConfirmAlternative = async (chosenAlt) => {
    const targetAlt = chosenAlt || selectedAlternative;
    setIsAlternativeModalOpen(false);
    const found = alternativeList.find((a) => a.alternative === targetAlt);

    if (found?.fullData?.components) {
      applyLoadedBom(found.fullData, targetAlt);
      return;
    }

    setIsLoadingBom(true);
    activityTracker.setOperation('change_bom_load', true);
    try {
      const res = await readBom({
        material: searchParams.material.trim(),
        plant: searchParams.plant.trim(),
        bomUsage: searchParams.bomUsage || '1',
        alternativeBom: targetAlt
      });
      if (!res.success) {
        throw new Error(res.message || 'Failed to read BOM from SAP.');
      }
      applyLoadedBom(res, targetAlt);
    } catch (err) {
      const info = extractErrorInfo(err, 'Failed to load BOM.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } finally {
      setIsLoadingBom(false);
      activityTracker.setOperation('change_bom_load', false);
    }
  };

  // Keyboard navigation for Alternative BOM selection popup
  const handleAlternativeKeyDown = (e) => {
    if (!alternativeList || alternativeList.length === 0) return;
    const currentIndex = alternativeList.findIndex((a) => a.alternative === selectedAlternative);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < alternativeList.length - 1 ? currentIndex + 1 : 0;
      setSelectedAlternative(alternativeList[nextIndex].alternative);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : alternativeList.length - 1;
      setSelectedAlternative(alternativeList[prevIndex].alternative);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedAlternative) {
        handleConfirmAlternative(selectedAlternative);
      }
    }
  };

  // Load existing BOM from SAP
  const handleLoadBom = async () => {
    setTouched({ material: true, plant: true });
    if (!validateSearch()) return;

    setIsLoadingBom(true);
    activityTracker.setOperation('change_bom_load', true);

    const typedAlt = searchParams.alternativeBom ? searchParams.alternativeBom.trim() : '';

    try {
      if (typedAlt) {
        // User explicitly typed an alternative: open directly without popup
        const res = await readBom({
          material: searchParams.material.trim(),
          plant: searchParams.plant.trim(),
          bomUsage: searchParams.bomUsage || '1',
          alternativeBom: typedAlt
        });

        if (!res.success) {
          throw new Error(res.message || 'Failed to read BOM from SAP.');
        }

        applyLoadedBom(res, typedAlt);
      } else {
        // Alternative BOM field is empty: lightweight lookup of alternatives (MAST + STKO, no STAS/STPO)
        setIsLoadingAlternatives(true);
        const altLookup = await getBomAlternatives({
          material: searchParams.material.trim(),
          plant: searchParams.plant.trim(),
          bomUsage: searchParams.bomUsage || '1'
        });

        if (!altLookup.success || altLookup.bomExists === false) {
          throw new Error(altLookup.message || `No BOM exists for material ${searchParams.material.toUpperCase()} in plant ${searchParams.plant}.`);
        }

        const rawAlts = altLookup.alternatives || [];
        if (rawAlts.length === 0) {
          throw new Error(`No BOM exists for material ${searchParams.material.toUpperCase()} in plant ${searchParams.plant}.`);
        }

        if (rawAlts.length === 1) {
          // Exactly one alternative exists: read components and open directly
          const singleAlt = rawAlts[0].alternative || rawAlts[0].STLAL || '01';
          const singleRes = await readBom({
            material: searchParams.material.trim(),
            plant: searchParams.plant.trim(),
            bomUsage: searchParams.bomUsage || '1',
            alternativeBom: singleAlt
          });

          if (!singleRes.success) {
            throw new Error(singleRes.message || 'Failed to read BOM from SAP.');
          }

          applyLoadedBom(singleRes, singleAlt);
        } else {
          // Multiple alternatives exist: open selection popup (components not loaded yet!)
          const altDetails = rawAlts.map((a) => ({
            alternative: a.alternative || a.STLAL,
            bomStatus: String(a.bomStatus || a.status || a.STLST || '01'),
            baseQty: String(a.baseQty || a.BMENG || '1'),
            baseUnit: a.baseUnit || a.unit || a.BMEIN || 'EA',
            validFrom: a.validFrom || a.DATUV || '',
            headerText: a.headerText || a.description || a.BKTXT || '',
            fullData: null // Components are loaded only when user selects and opens this alternative
          }));
          setAlternativeList(altDetails);
          setSelectedAlternative(altDetails[0].alternative);
          setIsAlternativeModalOpen(true);
        }
      }
    } catch (err) {
      const info = extractErrorInfo(err, 'Failed to load BOM.');
      setAlternativeLookupError(info.message);
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } finally {
      setIsLoadingAlternatives(false);
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
  const pendingFocusNewRowIdRef = useRef(null);
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

    pendingFocusNewRowIdRef.current = newItem.id;
    setComponents((prev) => [...prev, newItem]);
  };

  // Scroll to new row and focus its first input when component added
  useEffect(() => {
    if (pendingFocusNewRowIdRef.current) {
      const targetId = pendingFocusNewRowIdRef.current;
      pendingFocusNewRowIdRef.current = null;
      setTimeout(() => {
        const rowEl = document.querySelector(`[data-component-row="${targetId}"]`);
        if (rowEl) {
          rowEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          const firstInput = rowEl.querySelector('input');
          if (firstInput) {
            firstInput.focus();
          }
        }
      }, 50);
    }
  }, [components]);

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

  // Grouped changes for Confirmation Modal
  const { modifiedChanges, addedChanges, deletedChanges } = useMemo(() => {
    const mod = [
      ...Object.entries(diff.headerChanges).map(([fKey, chg]) => ({
        id: `hdr-${fKey}`,
        item: 'Header',
        component: searchParams.material,
        field: fKey === 'baseQty' ? 'Base Quantity' : fKey === 'bomStatus' ? 'BOM Status' : fKey === 'headerText' ? 'Header Text' : fKey,
        oldValue: String(chg.old || '—'),
        newValue: String(chg.new || '—'),
        isDeleted: false
      })),
      ...diff.modifiedItems.flatMap((m) =>
        Object.entries(m.changes).map(([fKey, chg]) => ({
          id: `mod-${m.id || m.itemNode}-${fKey}`,
          item: m.item,
          component: m.component,
          field: fKey === 'quantity' ? 'Quantity' : fKey === 'unit' ? 'Unit' : fKey === 'storageLocation' ? 'Storage Location' : fKey === 'itemText' ? 'Item Text' : fKey,
          oldValue: String(chg.old ?? '—'),
          newValue: String(chg.new ?? '—'),
          isDeleted: false
        }))
      )
    ];

    const add = diff.addedItems.map((a, idx) => ({
      id: `add-${a.id || a.component || idx}`,
      item: a.item || 'New',
      component: a.component || '—',
      quantity: a.quantity !== undefined && a.quantity !== null && a.quantity !== '' ? a.quantity : '—',
      unit: a.unit || '—',
      itemCategory: a.itemCategory || 'L',
      storageLocation: a.storageLocation || '—',
      itemText: a.itemText || '—',
      isDeleted: false
    }));

    const del = diff.deletedItems.map((d, idx) => ({
      id: `del-${d.id || d.itemNode || idx}`,
      item: d.item || '—',
      component: d.component || '—',
      quantity: d.quantity !== undefined && d.quantity !== null && d.quantity !== '' ? d.quantity : '—',
      unit: d.unit || '—',
      isDeleted: true
    }));

    return { modifiedChanges: mod, addedChanges: add, deletedChanges: del };
  }, [diff, searchParams.material]);

  const changeColumns = useMemo(() => [
    {
      key: 'item',
      title: 'Item',
      width: '75px',
      align: 'center',
      isMono: true,
      render: (val) => <span className="font-mono text-xs text-[var(--sap-text-muted)]">{val}</span>
    },
    {
      key: 'component',
      title: 'Component',
      width: '160px',
      isMono: true,
      render: (val) => (
        <span className="font-mono text-xs font-medium text-[var(--color-navy-900)]">
          {formatMaterialNumber(val)}
        </span>
      )
    },
    {
      key: 'field',
      title: 'Field',
      width: '140px',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)]">{val}</span>
    },
    {
      key: 'oldValue',
      title: 'Old Value',
      render: (val, row) => (
        <span className={row.isDeleted ? 'text-xs text-[var(--color-danger)] line-through' : 'text-xs text-[var(--sap-text-muted)] line-through'}>
          {val}
        </span>
      )
    },
    {
      key: 'newValue',
      title: 'New Value',
      render: (val, row) => (
        <span className={row.isDeleted ? 'text-xs font-bold text-[var(--color-danger)]' : 'text-xs font-bold text-[var(--sap-success)]'}>
          {val}
        </span>
      )
    }
  ], []);

  const addedColumns = useMemo(() => [
    {
      key: 'item',
      title: 'Item',
      width: '65px',
      align: 'center',
      isMono: true,
      render: (val) => <span className="font-mono text-xs text-[var(--sap-text-muted)]">{val || '—'}</span>
    },
    {
      key: 'component',
      title: 'Component',
      width: '160px',
      isMono: true,
      render: (val) => (
        <span className="font-mono text-xs font-medium text-[var(--color-navy-900)]">
          {formatMaterialNumber(val) || '—'}
        </span>
      )
    },
    {
      key: 'quantity',
      title: 'Quantity',
      width: '80px',
      align: 'right',
      render: (val) => <span className="text-xs font-medium">{val !== undefined && val !== null && val !== '' ? val : '—'}</span>
    },
    {
      key: 'unit',
      title: 'Unit',
      width: '60px',
      align: 'center',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)]">{val || '—'}</span>
    },
    {
      key: 'itemCategory',
      title: 'Category',
      width: '70px',
      align: 'center',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)]">{val || '—'}</span>
    },
    {
      key: 'storageLocation',
      title: 'Storage Location',
      width: '120px',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)]">{val || '—'}</span>
    },
    {
      key: 'itemText',
      title: 'Item Text',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)] truncate">{val || '—'}</span>
    }
  ], []);

  const deletedColumns = useMemo(() => [
    {
      key: 'item',
      title: 'Item',
      width: '75px',
      align: 'center',
      isMono: true,
      render: (val) => <span className="font-mono text-xs text-[var(--sap-text-muted)]">{val || '—'}</span>
    },
    {
      key: 'component',
      title: 'Component',
      width: '170px',
      isMono: true,
      render: (val) => (
        <span className="font-mono text-xs font-medium text-[var(--color-navy-900)]">
          {formatMaterialNumber(val) || '—'}
        </span>
      )
    },
    {
      key: 'quantity',
      title: 'Quantity',
      width: '95px',
      align: 'right',
      render: (val) => <span className="text-xs">{val !== undefined && val !== null && val !== '' ? val : '—'}</span>
    },
    {
      key: 'unit',
      title: 'Unit',
      width: '75px',
      align: 'center',
      render: (val) => <span className="text-xs text-[var(--sap-text-dark)]">{val || '—'}</span>
    }
  ], []);

  const alternativeColumns = useMemo(() => [
    {
      key: 'alternative',
      title: 'Alternative',
      width: '90px',
      align: 'center',
      isMono: true,
      render: (val) => (
        <span className="font-mono text-xs font-semibold text-[var(--color-navy-900)]">
          {val}
        </span>
      )
    },
    {
      key: 'bomStatus',
      title: 'Status',
      width: '95px',
      align: 'left',
      render: (val, row) => {
        const statusMap = { '01': 'Active', '1': 'Active', '02': 'Inactive', '2': 'Inactive' };
        const text = row?.bomStatusText || statusMap[String(val || '').trim()] || '';
        return (
          <span className="text-xs text-[var(--color-text-primary)]">
            {val ? (text ? `${val} (${text})` : val) : '—'}
          </span>
        );
      }
    },
    {
      key: 'baseQty',
      title: 'Base Qty',
      width: '85px',
      align: 'right',
      render: (val) => <span className="font-mono text-xs text-[var(--color-text-primary)]">{val || '—'}</span>
    },
    {
      key: 'baseUnit',
      title: 'Unit',
      width: '65px',
      align: 'center',
      render: (val) => <span className="text-xs text-[var(--color-text-primary)]">{val || '—'}</span>
    },
    {
      key: 'validFrom',
      title: 'Valid From',
      width: '105px',
      align: 'center',
      isMono: true,
      render: (val) => <span className="font-mono text-xs text-[var(--color-text-muted)]">{val || '—'}</span>
    },
    {
      key: 'headerText',
      title: 'Description',
      render: (val) => (
        <span
          className="text-xs text-[var(--color-text-primary)] truncate block max-w-full"
          title={val || undefined}
        >
          {val || '—'}
        </span>
      )
    }
  ], []);

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

      if (!res.success) {
        setIsReviewOpen(false);
        const info = extractErrorInfo(res, 'Failed to save BOM changes.');
        toast.error(info.message, { title: info.title || 'Error', hint: info.hint, errorRef: info.errorRef });
        return;
      }

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
      setIsReviewOpen(false);
      const info = extractErrorInfo(err, 'Failed to save BOM changes.');
      toast.error(info.message, { title: info.title, hint: info.hint, errorRef: info.errorRef });
    } finally {
      setIsSaving(false);
      activityTracker.setOperation('change_bom_save', false);
    }
  };

  // Sort verified result components ascending by item number (0010, 0020, ...)
  const sortedVerifiedComponents = useMemo(() => {
    if (!executionResult?.components || !Array.isArray(executionResult.components)) return [];
    return [...executionResult.components].sort((a, b) => {
      const numA = parseInt(String(a.item || a.itemNo || a.POSNR || '0').replace(/\D/g, ''), 10) || 0;
      const numB = parseInt(String(b.item || b.itemNo || b.POSNR || '0').replace(/\D/g, ''), 10) || 0;
      if (numA !== numB) return numA - numB;
      const strA = String(a.item || a.itemNo || a.POSNR || '');
      const strB = String(b.item || b.itemNo || b.POSNR || '');
      return strA.localeCompare(strB);
    });
  }, [executionResult?.components]);

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
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--sap-success-bg)',
                  border: '1px solid var(--sap-success-border)',
                  color: 'var(--sap-success)',
                  marginBottom: 24
                }}
              >
                <CheckCircle2 size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Changed Successfully</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
                    Material {(searchParams.material || '').toUpperCase()} (Plant {searchParams.plant}, Alt {searchParams.alternativeBom}): Changes written and verified in SAP.
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
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--sap-warning-bg)',
                  border: '1px solid var(--sap-warning-border)',
                  color: 'var(--sap-warning)',
                  marginBottom: 24
                }}
              >
                <AlertTriangle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Write Outcome Unknown</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
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
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--sap-error-bg)',
                  border: '1px solid var(--sap-error-border)',
                  color: 'var(--sap-error)',
                  marginBottom: 24
                }}
              >
                <XCircle size={24} />
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>BOM Change Failed</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--sap-text-dark)' }}>
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
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Header Changed</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                  {executionResult.summary?.headerChanged ? 'Yes' : 'No'}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Items Modified</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary, var(--color-blue-600))' }}>
                  {executionResult.summary?.itemsModified || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Items Added</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-success)' }}>
                  {executionResult.summary?.itemsAdded || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Items Deleted</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-error)' }}>
                  {executionResult.summary?.itemsDeleted || 0}
                </div>
              </div>
              <div className="sap-card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--sap-text-muted)', marginBottom: 4 }}>Total Components</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--sap-text-dark)' }}>
                  {executionResult.summary?.totalComponentsAfter || executionResult.components?.length || 0}
                </div>
              </div>
            </div>

            {/* Verified Components Table */}
            {sortedVerifiedComponents.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-[var(--color-navy-900)]">
                    Verified BOM Components in SAP
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    {sortedVerifiedComponents.length} components
                  </Badge>
                </div>
                <div
                  className="sap-table-container sap-card-table-scroll"
                  tabIndex={0}
                  role="region"
                  aria-label="Verified BOM Components Table"
                  style={{
                    maxHeight: 380,
                    overflowY: 'auto',
                    overflowX: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <table
                    className="sap-table"
                    style={{
                      width: '100%',
                      tableLayout: 'fixed',
                      borderCollapse: 'separate',
                      borderSpacing: 0
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={{ width: '8%', textAlign: 'center', padding: '10px 14px' }}>Item</th>
                        <th style={{ width: '9%', textAlign: 'center', padding: '10px 14px' }}>Category</th>
                        <th style={{ width: '20%', textAlign: 'left', padding: '10px 14px' }}>Component</th>
                        <th style={{ width: '13%', textAlign: 'right', padding: '10px 14px' }}>Quantity</th>
                        <th style={{ width: '8%', textAlign: 'center', padding: '10px 14px' }}>Unit</th>
                        <th style={{ width: '14%', textAlign: 'left', padding: '10px 14px' }}>SLoc</th>
                        <th style={{ width: '28%', textAlign: 'left', padding: '10px 14px' }}>Item Text</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedVerifiedComponents.map((c, idx) => {
                        const displayMat = formatMaterialNumber(c.component || c.IDNRK || c.material || '-');
                        const itemCat = c.itemCategory || c.POSTP || c.category || 'L';
                        const itemNo = c.item || c.itemNo || c.POSNR || (idx + 1) * 10;
                        const sLoc = c.storageLocation || c.LGORT || '';
                        const text = c.itemText || c.description || '';
                        const hasQty = c.quantity !== undefined && c.quantity !== null && c.quantity !== '';
                        return (
                          <tr key={c.id || idx}>
                            <td
                              className="sap-col-code"
                              style={{
                                textAlign: 'center',
                                padding: '10px 14px',
                                fontFamily: 'var(--sap-font-mono)',
                                fontWeight: 'var(--font-weight-code)'
                              }}
                            >
                              {itemNo}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                              {itemCat}
                            </td>
                            <td style={{ textAlign: 'left', padding: '10px 14px' }}>
                              <span
                                className="sap-col-code"
                                style={{
                                  fontFamily: 'var(--sap-font-mono)',
                                  fontWeight: 'var(--font-weight-code)'
                                }}
                              >
                                {displayMat}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', padding: '10px 14px' }}>
                              {hasQty ? (
                                <span style={{ fontFamily: 'var(--sap-font-mono)' }}>{c.quantity}</span>
                              ) : (
                                <span className="text-[var(--color-text-muted)]">—</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', padding: '10px 14px' }}>
                              {c.unit || c.MEINS || <span className="text-[var(--color-text-muted)]">—</span>}
                            </td>
                            <td style={{ textAlign: 'left', padding: '10px 14px' }}>
                              {sLoc || <span className="text-[var(--color-text-muted)]">—</span>}
                            </td>
                            <td
                              style={{
                                textAlign: 'left',
                                padding: '10px 14px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={text || undefined}
                            >
                              {text || <span className="text-[var(--color-text-muted)]">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, marginTop: 24, paddingBottom: 24 }}>
              <Button
                type="button"
                variant="default"
                className="sap-btn sap-btn-primary"
                onClick={handleResetToSearch}
                style={{ padding: '9px 20px' }}
              >
                Change Another BOM
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="sap-btn sap-btn-secondary"
                onClick={onBack}
                style={{ padding: '9px 20px' }}
              >
                Return to Launchpad
              </Button>
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
                label="Material"
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
                label="Plant"
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

            {/* Engineering Change Management */}
            <div className="mt-4 pt-3 border-t border-[var(--color-border-subtle)]">
              <h4
                className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider block"
                style={{ marginTop: '16px', marginBottom: '16px' }}
              >
                Engineering change management
              </h4>
              <FormGrid cols={2}>
                <FieldWrapper label="Change Number" htmlFor="chgChangeNo">
                  <Input
                    id="chgChangeNo"
                    type="text"
                    placeholder="Ex. ECM-2026-001"
                    value={searchParams.changeNo}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, changeNo: e.target.value }))}
                    isMono
                  />
                </FieldWrapper>
                <FieldWrapper label="Valid-From Date" htmlFor="chgValidFrom">
                  <Input
                    id="chgValidFrom"
                    type="text"
                    placeholder="DD.MM.YYYY"
                    value={searchParams.validFrom}
                    onChange={(e) => setSearchParams((prev) => ({ ...prev, validFrom: e.target.value }))}
                    isMono
                  />
                </FieldWrapper>
              </FormGrid>
            </div>

            {alternativeLookupError && (
              <div
                id="alternative-lookup-error-banner"
                className="mt-4 p-3 bg-[var(--color-danger-bg)] border border-[var(--color-danger-border)] rounded-md flex items-center justify-between gap-3 text-xs text-[var(--color-danger)]"
                role="alert"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{alternativeLookupError}</span>
                </div>
                <Button
                  id="btn-retry-lookup"
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="sap-btn sap-btn-secondary text-xs h-7 px-3 shrink-0"
                  onClick={handleLoadBom}
                >
                  Retry
                </Button>
              </div>
            )}

            <FormActions
              className="mt-6 pt-4 border-t border-[var(--color-border-subtle)]"
              right={
                <Button
                  id="btn-load-bom"
                  type="button"
                  onClick={handleLoadBom}
                  disabled={isLoadingBom || isLoadingAlternatives}
                  style={{
                    backgroundColor: 'var(--color-navy-900)',
                    color: 'var(--color-text-inverse)',
                    padding: '8px 24px'
                  }}
                >
                  {isLoadingBom || isLoadingAlternatives ? (
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
                background: 'var(--color-blue-50)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)'
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
                      style={{ flex: 1, backgroundColor: 'var(--color-surface-subtle)' }}
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
                  variant="default"
                  onClick={handleAddComponent}
                  className="sap-btn sap-btn-primary"
                  style={{
                    backgroundColor: 'var(--color-navy-900)',
                    color: 'var(--color-text-inverse)',
                    border: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-md)'
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
                              backgroundColor: 'var(--color-danger-bg)'
                            }
                          : {};

                        return (
                          <tr
                            key={comp.id}
                            data-component-row={comp.id}
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
                              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[var(--color-blue-100)] text-[var(--color-primary,var(--color-blue-600))]">
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
                    backgroundColor: diff.hasChanges ? 'var(--color-navy-900)' : 'var(--color-border)',
                    color: 'var(--color-text-inverse)',
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
        subtitle={`Material: ${(formatMaterialNumber(searchParams.material) || '').toUpperCase()} | Plant: ${searchParams.plant} | Alternative BOM: ${searchParams.alternativeBom || '01'}`}
        icon={FileEdit}
        maxWidth={760}
        isLoading={isSaving}
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button
              id="btn-cancel-save-bom"
              type="button"
              variant="secondary"
              className="sap-btn sap-btn-secondary"
              disabled={isSaving}
              onClick={() => setIsReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              id="btn-confirm-save-bom"
              type="button"
              variant="default"
              disabled={isSaving}
              onClick={handleConfirmSave}
              style={{
                backgroundColor: 'var(--color-navy-900)',
                color: 'var(--color-text-inverse)',
                padding: '8px 20px'
              }}
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2 inline" />
                  Saving to SAP...
                </>
              ) : (
                'Confirm and Save'
              )}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          {/* Group: Modified */}
          {modifiedChanges.length > 0 && (
            <div className="flex flex-col">
              <div
                className="flex items-center gap-2"
                style={{
                  borderLeft: '3px solid var(--color-navy-900)',
                  paddingLeft: '10px',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  marginBottom: '8px',
                  borderBottom: '1px solid var(--color-border-subtle)'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-navy-900)' }}>
                  Modified Items
                </span>
                <span
                  style={{
                    backgroundColor: 'var(--color-info-bg)',
                    color: 'var(--color-info)',
                    border: '1px solid var(--color-info-border)',
                    height: '20px',
                    fontSize: '11px',
                    fontWeight: 500,
                    padding: '0 8px',
                    borderRadius: 'var(--radius-full)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {modifiedChanges.length}
                </span>
                <span className="sr-only">Changed Components ({modifiedChanges.length})</span>
              </div>
              <DataTable
                columns={changeColumns}
                data={modifiedChanges}
                keyField="id"
                className="max-h-[180px] overflow-y-auto border border-[var(--color-border)]"
              />
            </div>
          )}

          {/* Group: Added */}
          {addedChanges.length > 0 && (
            <div className="flex flex-col">
              <div
                className="flex items-center gap-2"
                style={{
                  borderLeft: '3px solid var(--color-navy-900)',
                  paddingLeft: '10px',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  marginBottom: '8px',
                  borderBottom: '1px solid var(--color-border-subtle)'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-navy-900)' }}>
                  Added Items
                </span>
                <span
                  style={{
                    backgroundColor: 'var(--color-success-bg)',
                    color: 'var(--color-success-strong)',
                    border: '1px solid var(--color-success-border)',
                    height: '20px',
                    fontSize: '11px',
                    fontWeight: 500,
                    padding: '0 8px',
                    borderRadius: 'var(--radius-full)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {addedChanges.length}
                </span>
                <span className="sr-only">Added Components ({addedChanges.length})</span>
              </div>
              <DataTable
                columns={addedColumns}
                data={addedChanges}
                keyField="id"
                className="max-h-[180px] overflow-y-auto border border-[var(--color-border)]"
              />
            </div>
          )}

          {/* Group: Deleted */}
          {deletedChanges.length > 0 && (
            <div className="flex flex-col">
              <div
                className="flex items-center gap-2"
                style={{
                  borderLeft: '3px solid var(--color-navy-900)',
                  paddingLeft: '10px',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  marginBottom: '8px',
                  borderBottom: '1px solid var(--color-border-subtle)'
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-navy-900)' }}>
                  Deleted Items
                </span>
                <span
                  style={{
                    backgroundColor: 'var(--color-danger-bg)',
                    color: 'var(--color-danger)',
                    border: '1px solid var(--color-danger-border)',
                    height: '20px',
                    fontSize: '11px',
                    fontWeight: 500,
                    padding: '0 8px',
                    borderRadius: 'var(--radius-full)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {deletedChanges.length}
                </span>
                <span className="sr-only">Deleted Components ({deletedChanges.length})</span>
              </div>
              <DataTable
                columns={deletedColumns}
                data={deletedChanges}
                keyField="id"
                className="max-h-[180px] overflow-y-auto border border-[var(--color-border)]"
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Alternative BOM Selection Modal */}
      <Modal
        isOpen={isAlternativeModalOpen}
        onClose={() => setIsAlternativeModalOpen(false)}
        title="Select Alternative BOM"
        subtitle={`Material ${searchParams.material.toUpperCase()} | Plant ${searchParams.plant} | BOM usage ${searchParams.bomUsage || '1'}`}
        maxWidth={760}
        cardClassName="max-w-[760px] w-full"
        footer={
          <div className="flex items-center justify-between w-full px-1">
            <span className="text-xs text-[var(--color-text-secondary)] font-medium">
              {alternativeList.length} {alternativeList.length === 1 ? 'alternative' : 'alternatives'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                id="btn-cancel-alt-selection"
                type="button"
                variant="secondary"
                className="sap-btn sap-btn-secondary"
                onClick={() => setIsAlternativeModalOpen(false)}
                style={{ padding: '6px 14px', height: '32px', fontSize: '13px' }}
              >
                Cancel
              </Button>
              <Button
                id="btn-open-selected-alt"
                type="button"
                variant="default"
                disabled={!selectedAlternative || isLoadingAlternatives}
                onClick={() => handleConfirmAlternative(selectedAlternative)}
                style={{
                  backgroundColor: 'var(--color-navy-900)',
                  color: 'var(--color-text-inverse)',
                  padding: '6px 16px',
                  height: '32px',
                  fontSize: '13px'
                }}
              >
                Open
              </Button>
            </div>
          </div>
        }
      >
        <div
          className="flex flex-col gap-2.5 outline-none"
          tabIndex={0}
          data-autofocus="true"
          onKeyDown={handleAlternativeKeyDown}
        >
          <p className="text-xs text-[var(--color-text-secondary)] m-0">
            Select an alternative to open for editing. Double click a row to open it.
          </p>
          <DataTable
            columns={alternativeColumns}
            data={alternativeList}
            keyField="alternative"
            selectedRowKey={selectedAlternative}
            onRowSelect={(row) => setSelectedAlternative(row.alternative)}
            onRowDoubleClick={(row) => handleConfirmAlternative(row.alternative)}
            isLoading={isLoadingAlternatives}
            error={alternativeLookupError}
            emptyMessage="No alternative BOMs found"
            className="max-h-[280px] overflow-y-auto border border-[var(--color-border)] rx-table-alt-selection"
          />
        </div>
      </Modal>
    </div>
  );
}
