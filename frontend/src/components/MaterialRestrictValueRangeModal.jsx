import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  AlertCircle,
  Loader2,
  Info
} from 'lucide-react';
import { lockScroll } from '../utils/scrollLock';
import { searchMaterialsByOption } from '../services/api';
import { useDraggableModal } from '../hooks/useDraggableModal';
import ValueHelpInput from './ValueHelpInput';

export const ALL_SEARCH_OPTIONS = [
  {
    key: 'M',
    code: 'M',
    name: 'M: Material Number/Material Description',
    shortName: 'M: Material Number/Material Description',
    available: true,
    fields: [
      { id: 'MATNR', label: 'Material', placeholder: 'e.g. 1102* or 100-100', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'e.g. SOLAR* or PANEL', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'A',
    code: 'A',
    name: 'A: Material by Old Material Number',
    shortName: 'A: Material by Old Material Number',
    available: true,
    fields: [
      { id: 'BISMT', label: 'Old material number', placeholder: 'e.g. 1527279*', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'e.g. *BEARING*', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 }
    ]
  },
  {
    key: 'B',
    code: 'B',
    name: 'B: Materials that have a BOM',
    shortName: 'B: Materials that have a BOM',
    available: true,
    fields: [
      { id: 'MATNR', label: 'Material', placeholder: 'e.g. 100-*', maxLen: 18 },
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'STLAN', label: 'BOM Usage', placeholder: 'e.g. 1, 2, 3', maxLen: 1 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'C',
    code: 'C',
    name: 'C: Material Transferred from CAD System',
    shortName: 'C: CAD Transfer',
    available: true,
    fields: [
      { id: 'MATNR', label: 'Material', placeholder: 'e.g. CAD-*', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'E',
    code: 'E',
    name: 'E: Competitor Product',
    shortName: 'E: Competitor Product',
    available: true,
    fields: [
      { id: 'KUNNR', label: 'Competitor', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'F',
    code: 'F',
    name: 'F: Production Resources/Tools by Description/PRT Grouping',
    shortName: 'F: PRT',
    available: true,
    fields: [
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'FHM_FGRU1', label: 'PRT Grouping 1', placeholder: 'e.g. PRT1', maxLen: 4 },
      { id: 'FHM_FGRU2', label: 'PRT Grouping 2', placeholder: 'e.g. PRT2', maxLen: 4 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'H',
    code: 'H',
    name: 'H: Sales Material by General Product Hierarchy',
    shortName: 'H: Product Hierarchy',
    available: true,
    fields: [
      { id: 'PRDHA', label: 'Product Hierarchy', placeholder: 'e.g. PROD-*', maxLen: 18 },
      { id: 'VKORG', label: 'Sales Organization', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'VTWEG', label: 'Distribution Channel', placeholder: 'e.g. 10', maxLen: 2 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'I',
    code: 'I',
    name: "I: Supplier's Material Number",
    shortName: "I: Supplier's Mat. No.",
    available: true,
    fields: [
      { id: 'IDNLF', label: "Supplier's Material Number", placeholder: 'e.g. VEND-*', maxLen: 35 },
      { id: 'LIFNR', label: 'Vendor', placeholder: 'e.g. 0000451688', maxLen: 10 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'J',
    code: 'J',
    name: 'J: Material Category',
    shortName: 'J: Material Category',
    available: true,
    fields: [
      { id: 'ATTYP', label: 'Material Category', placeholder: 'e.g. 00, 01, 11', maxLen: 2 },
      { id: 'MATKL', label: 'Material Group', placeholder: 'Optional group', maxLen: 9 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'K',
    code: 'K',
    name: 'K: Materials for class',
    shortName: 'K: Class',
    available: false,
    unavailableReason: 'K: Materials for class is not available yet (SAP Error AD:559).'
  },
  {
    key: 'L',
    code: 'L',
    name: 'L: Material by Material Group',
    shortName: 'L: Material Group',
    available: true,
    fields: [
      { id: 'MATKL', label: 'Material Group', placeholder: 'e.g. F1SX or ELEC*', maxLen: 9 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'N',
    code: 'N',
    name: 'N: Material by EAN (International Article Number)',
    shortName: 'N: EAN',
    available: true,
    fields: [
      { id: 'EAN11', label: 'International Article Number (EAN)', placeholder: 'e.g. 8905*', maxLen: 18 },
      { id: 'MEINH', label: 'Unit of Measure', placeholder: 'e.g. ST or PAA', maxLen: 3 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'O',
    code: 'O',
    name: 'O: Materials by Several Classes',
    shortName: 'O: Several Classes',
    available: false,
    unavailableReason: 'O: Materials by Several Classes is not available yet (SAP Error AD:559).'
  },
  {
    key: 'P',
    code: 'P',
    name: 'P: Material by Product Hierarchy',
    shortName: 'P: Product Hierarchy',
    available: true,
    fields: [
      { id: 'PRDHA', label: 'Product Hierarchy', placeholder: 'e.g. PROD-*', maxLen: 18 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'R',
    code: 'R',
    name: 'R: Material by Task List',
    shortName: 'R: Task List',
    available: true,
    fields: [
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1009, 1000', maxLen: 4 },
      { id: 'PLNTY', label: 'Task List Type', placeholder: 'e.g. N', maxLen: 1 },
      { id: 'PLNNR', label: 'Key for Task List Group', placeholder: 'e.g. 09M06154', maxLen: 8 },
      { id: 'PLNAL', label: 'Group Counter', placeholder: 'e.g. 01', maxLen: 2 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'e.g. CUT COMP*', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'S',
    code: 'S',
    name: 'S: Sales Material by Description',
    shortName: 'S: Sales Material',
    available: true,
    fields: [
      { id: 'MAKTG', label: 'Material description', placeholder: 'e.g. CASUAL*', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 },
      { id: 'VKORG', label: 'Sales Organization', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'VTWEG', label: 'Distribution Channel', placeholder: 'e.g. 10', maxLen: 2 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 }
    ]
  },
  {
    key: 'T',
    code: 'T',
    name: 'T: Material by Material Type',
    shortName: 'T: Material Type',
    available: true,
    fields: [
      { id: 'MTART', label: 'Material Type', placeholder: 'e.g. ROH, FERT, HALB', maxLen: 4 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'V',
    code: 'V',
    name: 'V: Material by Supply Area',
    shortName: 'V: Supply Area',
    available: true,
    fields: [
      { id: 'PRVBE', label: 'Supply Area', placeholder: 'e.g. PV01', maxLen: 10 },
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material filter', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'W',
    code: 'W',
    name: 'W: Plant Material by Description',
    shortName: 'W: Plant Material',
    available: true,
    fields: [
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000, 1001', maxLen: 4 },
      { id: 'MATNR', label: 'Material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'FASHION',
    name: 'Material with Fashion Fields',
    shortName: 'Fashion Fields',
    available: true,
    fields: [
      { id: 'FSH_SEASON_YEAR', label: 'Season Year', placeholder: 'e.g. 2024', maxLen: 4 },
      { id: 'FSH_SEASON', label: 'Season', placeholder: 'e.g. SS01', maxLen: 4 },
      { id: 'FSH_COLLECTION', label: 'Collection', placeholder: 'Optional collection', maxLen: 10 },
      { id: 'FSH_THEME', label: 'Theme', placeholder: 'Optional theme', maxLen: 10 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'GENERIC',
    name: 'Variants of a Generic Material',
    shortName: 'Generic Variants',
    available: true,
    fields: [
      { id: 'SATNR', label: 'Generic material', placeholder: 'e.g. XA1FL0464L', maxLen: 18 },
      { id: 'MATNR', label: 'Variant material', placeholder: 'Optional variant', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'MATKL', label: 'Material Group', placeholder: 'Optional group', maxLen: 9 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'SEGMENTATION',
    name: 'Material with Segmentation',
    shortName: 'Segmentation',
    available: true,
    fields: [
      { id: 'SGT_CSGR', label: 'Segmentation Structure', placeholder: 'e.g. ZRFL', maxLen: 4 },
      { id: 'SGT_COVSA', label: 'Segmentation Strategy', placeholder: 'e.g. ZRFL01', maxLen: 8 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material', maxLen: 18 },
      { id: 'MAKTG', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'MATLIST',
    name: 'Search Help for Material List',
    shortName: 'Material List',
    available: false,
    unavailableReason: 'MATLIST: Search Help for Material List is not available yet (SAP Error DA:131).'
  },
  {
    key: 'ARTHIER',
    name: 'Search Help for Article Hierarchy',
    shortName: 'Article Hierarchy',
    available: false,
    unavailableReason: 'ARTHIER: Search Help for Article Hierarchy is not available yet (SAP Error DA:131).'
  },
  {
    key: 'ORIGINAL',
    name: 'Original Material',
    shortName: 'Original Material',
    available: true,
    fields: [
      { id: 'ORIGINAL_ART_NR', label: 'Original Article', placeholder: 'e.g. 100-*', maxLen: 18 },
      { id: 'FOLUP_ART_NR', label: 'Follow-up Article', placeholder: 'Optional follow-up', maxLen: 18 },
      { id: 'FOLLOWUP_TYP_DE', label: 'Substitution Type', placeholder: 'Optional type', maxLen: 20 },
      { id: 'MAKTG_ORG_ART', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'FOLLOWUP',
    name: 'Follow-Up/Replacement Material',
    shortName: 'Follow-Up Material',
    available: true,
    fields: [
      { id: 'FOLUP_ART_NR', label: 'Follow-up Article', placeholder: 'e.g. 100-*', maxLen: 18 },
      { id: 'ORIGINAL_ART_NR', label: 'Original Article', placeholder: 'Optional original', maxLen: 18 },
      { id: 'FOLLOWUP_TYP_DE', label: 'Substitution Type', placeholder: 'Optional type', maxLen: 20 },
      { id: 'MAKTG_FOLUP_ART', label: 'Material description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'X',
    code: 'X',
    name: 'X: Material by Characteristic Value',
    shortName: 'X: Char Value',
    available: false,
    unavailableReason: 'X: Material by Characteristic Value is not available yet (SAP Error AD:559).'
  },
  {
    key: 'G',
    code: 'G',
    name: 'G: Search Help for Manufacturer Part Number',
    shortName: 'G: Manufacturer Part No.',
    available: true,
    fields: [
      { id: 'MFRPN', label: 'Manufacturer Part Number', placeholder: 'e.g. PART-*', maxLen: 40 },
      { id: 'MFRNR', label: 'Manufacturer', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'TEXT_HTN', label: 'Description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'MATNR_HTN', label: 'MPN material', placeholder: 'Optional MPN', maxLen: 18 },
      { id: 'MATNR_B', label: 'Inventory-managed material', placeholder: 'Optional material', maxLen: 18 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'U',
    code: 'U',
    name: 'U: Search Help for Manufacturer Part Number with AMPL',
    shortName: 'U: MPN with AMPL',
    available: true,
    fields: [
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000, 1001', maxLen: 4 },
      { id: 'AMPSP', label: 'AMPL Status', placeholder: 'Optional AMPL status', maxLen: 4 },
      { id: 'MFRNR', label: 'Manufacturer', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'REVLV', label: 'Revision Level', placeholder: 'Optional rev level', maxLen: 2 },
      { id: 'MATNR_B', label: 'Inventory-managed material', placeholder: 'Optional material', maxLen: 18 },
      { id: 'MFRPN', label: 'Manufacturer Part Number', placeholder: 'e.g. PART-*', maxLen: 40 },
      { id: 'MATNR_HTN', label: 'MPN material', placeholder: 'Optional MPN', maxLen: 18 }
    ]
  },
  {
    key: 'FFF',
    name: 'Part from FFF Class Ext. Matl No.',
    shortName: 'FFF Class Matl No.',
    available: true,
    fields: [
      { id: 'MFRNR', label: 'Manufacturer', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'MFRPN', label: 'Manufacturer Part Number', placeholder: 'e.g. PART-*', maxLen: 40 },
      { id: 'TEXT_HTN', label: 'Description', placeholder: 'e.g. SPARX*', maxLen: 40 },
      { id: 'MATNR_HTN', label: 'MPN material', placeholder: 'Optional MPN', maxLen: 18 },
      { id: 'MATNR_B', label: 'Inventory-managed material', placeholder: 'Optional material', maxLen: 18 }
    ]
  },
  {
    key: 'MPN',
    name: 'Valid Materials in MPN MRP Sets',
    shortName: 'MPN MRP Sets',
    available: true,
    fields: [
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'MFRNR', label: 'Manufacturer', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'MFRPN', label: 'Manufacturer Part Number', placeholder: 'e.g. PART-*', maxLen: 40 },
      { id: 'MATNR_HTN', label: 'MPN material', placeholder: 'Optional MPN', maxLen: 18 },
      { id: 'MATNR_B', label: 'Inventory-managed material', placeholder: 'Optional material', maxLen: 18 }
    ]
  },
  {
    key: 'Z_INTER',
    code: 'Z',
    name: 'Z (1-Way/Restricted Interchangeability)',
    shortName: 'Z: Interchangeability',
    available: true,
    fields: [
      { id: 'MATNR', label: 'Material', placeholder: 'e.g. 100-*', maxLen: 18 },
      { id: 'WERKS', label: 'Plant', placeholder: 'e.g. 1000', maxLen: 4 },
      { id: 'BERID', label: 'MRP Area', placeholder: 'Optional MRP area', maxLen: 10 },
      { id: 'LMATN', label: 'Leading Material', placeholder: 'Optional leading mat.', maxLen: 18 }
    ]
  },
  {
    key: 'D',
    code: 'D',
    name: 'D: Search Help for Inventory-Managed Material',
    shortName: 'D: Inventory-Managed',
    available: true,
    fields: [
      { id: 'MATNR_B', label: 'Inventory-managed material', placeholder: 'e.g. 100-*', maxLen: 18 },
      { id: 'MATNR_HTN', label: 'MPN material', placeholder: 'Optional MPN', maxLen: 18 },
      { id: 'MFRNR', label: 'Manufacturer', placeholder: 'e.g. 0000100000', maxLen: 10 },
      { id: 'MFRPN', label: 'Manufacturer Part Number', placeholder: 'e.g. PART-*', maxLen: 40 },
      { id: 'TEXT_HTN', label: 'Description', placeholder: 'Optional description', maxLen: 40 },
      { id: 'SPRAS', label: 'Language Key', defaultValue: 'EN', maxLen: 2 }
    ]
  },
  {
    key: 'Z_EAN',
    code: 'Z',
    name: 'Z (International Article Numbers: Vendor-Specific)',
    shortName: 'Z: Vendor EAN',
    available: true,
    fields: [
      { id: 'EAN11', label: 'Vendor-Specific EAN', placeholder: 'e.g. 8905*', maxLen: 18 },
      { id: 'LIFNR', label: 'Vendor', placeholder: 'e.g. 0000451688', maxLen: 10 },
      { id: 'MATNR', label: 'Material', placeholder: 'Optional material', maxLen: 18 },
      { id: 'LFEAN', label: 'Vendor EAN Flag', defaultValue: 'X', maxLen: 1 }
    ]
  }
];

export function getFieldInputWidth(field) {
  if (!field) return 220;
  const id = field.id || '';
  const maxLen = field.maxLen || 40;

  // 1-2 chars: Usage, Language, Task list type, Counter, Flag, Dist Channel
  if (['STLAN', 'PLNTY', 'PLNAL', 'LFEAN', 'VTWEG', 'REVLV', 'ATTYP', 'SPRAS', 'AMPSP'].includes(id) || maxLen <= 2) {
    return 54;
  }
  // 3-4 chars: Plant, Sales Org, Material Type, Unit
  if (['WERKS', 'VKORG', 'MTART', 'MEINH', 'FHM_FGRU1', 'FHM_FGRU2', 'FSH_SEASON', 'FSH_SEASON_YEAR'].includes(id) || maxLen <= 4) {
    return 74;
  }
  // 8-10 chars: Vendor, Customer, Material Group, Mfr code, Routing Group
  if (['PLNNR', 'MATKL', 'KUNNR', 'LIFNR', 'MFRNR', 'PRVBE', 'BERID', 'FSH_COLLECTION', 'FSH_THEME', 'EMNFR', 'SGT_CSGR'].includes(id) || maxLen <= 10) {
    return 120;
  }
  // Descriptions, long text, manufacturer part number
  if (['MAKTG', 'TEXT_HTN', 'MFRPN', 'IDNLF', 'KUNNR_MAT', 'WRKST', 'HERST'].includes(id)) {
    return 340;
  }
  // Material numbers, EAN, Hierarchy
  if (['MATNR', 'MATNR_B', 'MATNR_HTN', 'SATNR', 'BISMT', 'EAN11', 'PRDHA', 'ORIGINAL_ART_NR', 'FOLUP_ART_NR', 'SGT_COVSA'].includes(id)) {
    return 220;
  }
  if (maxLen <= 6) return 80;
  if (maxLen <= 12) return 130;
  if (maxLen <= 20) return 220;
  return 320;
}

export function isDescriptionField(fieldId) {
  if (!fieldId) return false;
  const upper = String(fieldId).toUpperCase();
  return (
    upper === 'MAKTG' ||
    upper === 'MAKTX' ||
    upper === 'TEXT_HTN' ||
    upper === 'MAKTG_ORG_ART' ||
    upper === 'MAKTG_FOLUP_ART' ||
    upper === 'WGBEZ' ||
    upper === 'VTEXT' ||
    upper.includes('DESC') ||
    upper.includes('TEXT')
  );
}

export function formatFilterSummary(option, values = {}) {
  const parts = [];
  if (!option?.fields) return '';
  option.fields.forEach((f) => {
    const raw = String(values[f.id] || '').trim();
    if (raw && !(f.id === 'SPRAS' && (raw.toUpperCase() === 'EN' || raw.toUpperCase() === 'E'))) {
      const val = isDescriptionField(f.id) ? raw : raw.toUpperCase();
      parts.push(`${f.label || f.id} ${val}`);
    }
  });
  return parts.join(', ');
}

export default function MaterialRestrictValueRangeModal({
  isOpen,
  initialValue = '',
  onContinueEmpty,
  onContinueWithResults,
  onClose
}) {
  const [activeTabKey, setActiveTabKey] = useState('M');
  const [formValues, setFormValues] = useState({});
  const [maxRows, setMaxRows] = useState(500);
  const [noRestriction, setNoRestriction] = useState(false);
  const [isOptionsDropdownOpen, setIsOptionsDropdownOpen] = useState(false);
  const [focusedDropdownIndex, setFocusedDropdownIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const tabListRef = useRef(null);
  const activeTabBtnRef = useRef(null);
  const firstInputRef = useRef(null);
  const dialogRef = useRef(null);
  const dropdownRef = useRef(null);
  const dropdownItemRefs = useRef([]);
  const abortControllerRef = useRef(null);

  const { dialogStyle, headerProps } = useDraggableModal({
    isOpen,
    dialogRef,
    defaultTopRatio: 0.12
  });

  const activeOption = ALL_SEARCH_OPTIONS.find((o) => o.key === activeTabKey) || ALL_SEARCH_OPTIONS[0];

  // Initialize form state with defaults when modal opens or initialValue changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsSearching(false);
      setIsOptionsDropdownOpen(false);
      const unlock = lockScroll();

      // Initialize default tab 'M' with initialValue if present
      setFormValues((prev) => {
        const initM = { ...(prev.M || {}) };
        if (initialValue && !initM.MATNR) {
          initM.MATNR = String(initialValue).toUpperCase();
        }
        if (!initM.SPRAS) {
          initM.SPRAS = 'EN';
        }
        return {
          ...prev,
          M: initM
        };
      });

      // Autofocus first field of the active tab
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
        firstInputRef.current?.select?.();
      }, 50);

      return () => {
        unlock();
        clearTimeout(timer);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }
  }, [isOpen, initialValue]);

  // Focus first field when active tab changes
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      const timer = setTimeout(() => {
        firstInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTabKey, isOpen]);

  // Scroll active tab into view when changed
  useEffect(() => {
    if (activeTabBtnRef.current && tabListRef.current) {
      activeTabBtnRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activeTabKey]);

  // Synchronize dropdown focus when opened
  useEffect(() => {
    if (isOptionsDropdownOpen) {
      const idx = ALL_SEARCH_OPTIONS.findIndex((o) => o.key === activeTabKey);
      setFocusedDropdownIndex(idx >= 0 ? idx : 0);
    }
  }, [isOptionsDropdownOpen, activeTabKey]);

  // Ensure focused dropdown option is scrolled into view
  useEffect(() => {
    if (
      isOptionsDropdownOpen &&
      focusedDropdownIndex >= 0 &&
      dropdownItemRefs.current[focusedDropdownIndex]
    ) {
      dropdownItemRefs.current[focusedDropdownIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusedDropdownIndex, isOptionsDropdownOpen]);

  // Close options dropdown on outside click
  useEffect(() => {
    if (!isOptionsDropdownOpen) return;
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOptionsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOptionsDropdownOpen]);

  // Scroll tab list horizontally via buttons
  const scrollTabs = (direction) => {
    if (tabListRef.current) {
      const scrollAmount = direction === 'left' ? -220 : 220;
      tabListRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Switch tab and ensure default language key
  const handleSelectTab = (key) => {
    setActiveTabKey(key);
    setIsOptionsDropdownOpen(false);
    setFormValues((prev) => {
      const tabVals = { ...(prev[key] || {}) };
      const opt = ALL_SEARCH_OPTIONS.find((o) => o.key === key);
      if (opt?.fields) {
        opt.fields.forEach((f) => {
          if (f.defaultValue && !tabVals[f.id]) {
            tabVals[f.id] = f.defaultValue;
          }
        });
      }
      return { ...prev, [key]: tabVals };
    });
  };

  const handleFieldChange = (fieldId, val) => {
    setErrorMsg(null);
    const transformedVal = isDescriptionField(fieldId) ? val : (val || '').toUpperCase();
    setFormValues((prev) => ({
      ...prev,
      [activeTabKey]: {
        ...(prev[activeTabKey] || {}),
        [fieldId]: transformedVal
      }
    }));
  };

  // Reset all fields on the current tab to defaults
  const handleReset = () => {
    setErrorMsg(null);
    const defaults = {};
    if (activeOption.fields) {
      activeOption.fields.forEach((f) => {
        defaults[f.id] = f.defaultValue || '';
      });
    }
    setFormValues((prev) => ({
      ...prev,
      [activeTabKey]: defaults
    }));
    setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);
  };

  // Submit action: check if empty or filled
  const handleSubmit = useCallback(async () => {
    if (!activeOption.available) {
      return;
    }

    const currentValues = formValues[activeTabKey] || {};
    // Check if any non-default field is filled
    let isFilled = false;
    for (const [k, v] of Object.entries(currentValues)) {
      const trimmed = String(v || '').trim();
      if (!trimmed) continue;
      // Ignore default language key 'EN' / 'E'
      if (k === 'SPRAS' && (trimmed.toUpperCase() === 'EN' || trimmed.toUpperCase() === 'E')) {
        continue;
      }
      isFilled = true;
      break;
    }

    // Rule 2: If every field is empty, open existing Material results popup unchanged!
    if (!isFilled) {
      if (onContinueEmpty) {
        onContinueEmpty();
      }
      return;
    }

    // Rule 3: Search with tab filters and open results popup
    setIsSearching(true);
    setErrorMsg(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await searchMaterialsByOption(
        {
          tab: activeTabKey,
          fields: currentValues,
          maxRows: Number(maxRows) || 500,
          noRestriction
        },
        { signal: controller.signal }
      );

      setIsSearching(false);

      if (res?.available === false) {
        setErrorMsg('This search option is not available on this system.');
        return;
      }

      if (onContinueWithResults) {
        onContinueWithResults(res?.data || [], {
          tab: activeTabKey,
          tabCode: activeTabKey,
          tabName: activeOption.name,
          count: res?.count || 0,
          limitReached: Boolean(res?.limitReached),
          message: res?.message,
          filterSummary: formatFilterSummary(activeOption, currentValues),
          fields: currentValues,
          activeOption
        });
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setIsSearching(false);
      const msg = err.response?.data?.error || err.message || 'Failed to search materials.';
      setErrorMsg(msg);
    }
  }, [
    activeOption,
    activeTabKey,
    formValues,
    maxRows,
    noRestriction,
    onContinueEmpty,
    onContinueWithResults
  ]);

  // Keyboard navigation: Enter submits, Esc cancels, Ctrl+Arrows switch tabs
  const handleKeyDown = (e) => {
    // When options dropdown is open, keyboard controls the dropdown list
    if (isOptionsDropdownOpen) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIsOptionsDropdownOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedDropdownIndex((prev) => Math.min(ALL_SEARCH_OPTIONS.length - 1, prev + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedDropdownIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (focusedDropdownIndex >= 0 && focusedDropdownIndex < ALL_SEARCH_OPTIONS.length) {
          handleSelectTab(ALL_SEARCH_OPTIONS[focusedDropdownIndex].key);
        }
        return;
      }
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }

    if (e.key === 'Enter' && !isSearching) {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
      return;
    }

    if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const currentIdx = ALL_SEARCH_OPTIONS.findIndex((o) => o.key === activeTabKey);
      if (e.key === 'ArrowLeft') {
        const prevIdx = (currentIdx - 1 + ALL_SEARCH_OPTIONS.length) % ALL_SEARCH_OPTIONS.length;
        handleSelectTab(ALL_SEARCH_OPTIONS[prevIdx].key);
      } else {
        const nextIdx = (currentIdx + 1) % ALL_SEARCH_OPTIONS.length;
        handleSelectTab(ALL_SEARCH_OPTIONS[nextIdx].key);
      }
    }
  };

  if (!isOpen) return null;

  const currentTabValues = formValues[activeTabKey] || {};

  return createPortal(
    <div
      className="sap-f4-portal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sap-restrict-range-title"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="sap-f4-modal-dialog sap-restrict-modal-dialog"
        style={{
          ...dialogStyle,
          width: 'min(660px, 94vw)',
          maxWidth: 680,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh'
        }}
      >
        {/* Header (Draggable) */}
        <div
          className="sap-f4-header"
          {...headerProps}
          style={{
            ...headerProps.style,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'none' }}>
            <span className="sap-f4-header-badge">F4</span>
            <h3
              id="sap-restrict-range-title"
              style={{
                margin: 0,
                fontSize: 'var(--sap-size-section-header, 15px)',
                fontWeight: 600,
                color: 'var(--sap-shell-text, #ffffff)'
              }}
            >
              Restrict Value Range
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sap-f4-header-close"
            title="Cancel (Esc)"
            aria-label="Cancel and close"
            data-no-drag="true"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Row with Scroll Arrows and All-Options Button */}
        <div className="sap-restrict-tab-container">
          <div ref={tabListRef} className="sap-restrict-tab-list" role="tablist">
            {ALL_SEARCH_OPTIONS.map((opt) => {
              const isSelected = opt.key === activeTabKey;
              return (
                <button
                  key={opt.key}
                  ref={isSelected ? activeTabBtnRef : null}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => handleSelectTab(opt.key)}
                  className={`sap-restrict-tab-btn ${isSelected ? 'active' : ''}`}
                  title={opt.name}
                >
                  {opt.shortName || opt.name}
                </button>
              );
            })}
          </div>

          {/* Tab Scroll & Options Controls */}
          <div className="sap-restrict-tab-controls">
            <button
              type="button"
              className="sap-restrict-arrow-btn"
              onClick={() => scrollTabs('left')}
              title="Scroll tabs left"
              aria-label="Scroll tabs left"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              className="sap-restrict-arrow-btn"
              onClick={() => scrollTabs('right')}
              title="Scroll tabs right"
              aria-label="Scroll tabs right"
            >
              <ChevronRight size={14} />
            </button>
            <div style={{ position: 'relative' }} ref={dropdownRef}>
              <button
                type="button"
                className={`sap-restrict-arrow-btn ${isOptionsDropdownOpen ? 'active' : ''}`}
                onClick={() => setIsOptionsDropdownOpen((v) => !v)}
                title="All search help options (Image 2 list)"
                aria-label="Select from all search help options"
                aria-expanded={isOptionsDropdownOpen}
              >
                <ListFilter size={14} />
              </button>

              {/* All Options Dropdown (Image 2 List) */}
              {isOptionsDropdownOpen && (
                <div className="sap-restrict-options-dropdown" role="menu">
                  <div className="sap-restrict-dropdown-header">All Search Help Options</div>
                  <div className="sap-restrict-dropdown-list">
                    {ALL_SEARCH_OPTIONS.map((opt, idx) => {
                      const isSelected = opt.key === activeTabKey;
                      const isFocused = idx === focusedDropdownIndex;
                      return (
                        <button
                          key={`${opt.key}-${idx}`}
                          ref={(el) => (dropdownItemRefs.current[idx] = el)}
                          type="button"
                          role="menuitem"
                          onClick={() => handleSelectTab(opt.key)}
                          onMouseEnter={() => setFocusedDropdownIndex(idx)}
                          className={`sap-restrict-dropdown-item ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${!opt.available ? 'unavailable' : ''}`}
                        >
                          <span className="sap-restrict-dot">{isSelected ? '●' : '○'}</span>
                          <span className="sap-restrict-opt-name">{opt.name}</span>
                          {!opt.available && (
                            <span className="sap-restrict-opt-unavailable-tag">Not available</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content Form Area */}
        <div className="sap-restrict-content-area">
          {errorMsg && (
            <div className="sap-f4-error" style={{ marginBottom: 16 }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeOption.available ? (
            <div className="sap-restrict-form-fields">
              {(activeOption.fields || []).map((field, idx) => {
                const val = currentTabValues[field.id] ?? (field.defaultValue || '');
                const inputWidth = getFieldInputWidth(field);
                return (
                  <div key={field.id} className="sap-restrict-field-row">
                    <label
                      htmlFor={`field-${field.id}`}
                      className="sap-restrict-field-label"
                      title={field.label}
                    >
                      {field.label}:
                    </label>
                    <div className="sap-restrict-input-wrap">
                      {field.id === 'STLAN' ? (
                        <ValueHelpInput
                          id={`field-${field.id}`}
                          ref={idx === 0 ? firstInputRef : null}
                          kind="bomUsage"
                          value={val}
                          maxLength={field.maxLen || 1}
                          placeholder={field.placeholder || ''}
                          onChange={(e) => handleFieldChange(field.id, e.target.value)}
                          className="sap-restrict-input"
                          wrapperStyle={{ width: Math.max(inputWidth, 68), maxWidth: '100%' }}
                          style={{ width: '100%' }}
                          autoComplete="off"
                          spellCheck="false"
                        />
                      ) : (
                        <input
                          id={`field-${field.id}`}
                          ref={idx === 0 ? firstInputRef : null}
                          type="text"
                          value={val}
                          maxLength={field.maxLen || 40}
                          placeholder={field.placeholder || ''}
                          onChange={(e) => handleFieldChange(field.id, e.target.value)}
                          className="sap-input sap-restrict-input"
                          autoComplete="off"
                          spellCheck="false"
                          style={{ width: inputWidth, maxWidth: '100%' }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Unavailable Tab Message */
            <div className="sap-restrict-unavailable-panel">
              <Info size={28} style={{ color: 'var(--sap-text-secondary, #64748b)', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--sap-text-primary, #1e293b)' }}>
                {activeOption.unavailableReason ? 'Not available on this system' : (activeOption.notConfiguredOnSap ? 'Not configured on this system' : 'Not available yet')}
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 13,
                  color: 'var(--sap-text-secondary, #64748b)',
                  maxWidth: 520,
                  textAlign: 'center'
                }}
              >
                {activeOption.unavailableReason || (activeOption.notConfiguredOnSap
                  ? `${activeOption.name} is not configured on this SAP system.`
                  : `${activeOption.name} is not available yet.`)}
              </p>
            </div>
          )}
        </div>

        {/* Maximum Hits / Restriction Section */}
        <div className="sap-restrict-limit-section">
          <div className="sap-restrict-limit-group">
            <label htmlFor="sap-restrict-max-rows" className="sap-restrict-limit-label">
              Restrict Number To:
            </label>
            <input
              id="sap-restrict-max-rows"
              type="number"
              min="1"
              max="5000"
              value={maxRows}
              disabled={noRestriction}
              onChange={(e) => setMaxRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="sap-input sap-restrict-number-input"
            />
          </div>

          <label className="sap-restrict-checkbox-label">
            <input
              type="checkbox"
              checked={noRestriction}
              onChange={(e) => setNoRestriction(e.target.checked)}
              className="sap-restrict-checkbox"
            />
            <span>No Restriction</span>
          </label>
        </div>

        {/* SAP-Style Footer with Continue (Green Tick), Reset, Cancel (Red X) */}
        <div className="sap-f4-footer sap-restrict-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sap-text-secondary, #64748b)' }}>
            <span>Active option: <strong>{activeOption.code || activeOption.key}</strong></span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Continue (Green Tick) */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!activeOption.available || isSearching}
              className="sap-button sap-button-primary sap-restrict-btn-continue"
              title="Continue (Enter)"
            >
              {isSearching ? (
                <Loader2 size={14} className="sap-spin" style={{ marginRight: 6 }} />
              ) : (
                <Check size={14} strokeWidth={2.5} style={{ marginRight: 6, color: '#16a34a' }} />
              )}
              Continue
            </button>

            {/* Reset */}
            <button
              type="button"
              onClick={handleReset}
              disabled={isSearching || !activeOption.available}
              className="sap-button sap-button-secondary"
              title="Reset fields on current tab"
            >
              <RotateCcw size={14} style={{ marginRight: 6 }} />
              Reset
            </button>

            {/* Cancel (Neutral icon) */}
            <button
              type="button"
              onClick={onClose}
              disabled={isSearching}
              className="sap-button sap-button-secondary sap-restrict-btn-cancel"
              title="Cancel (Esc)"
            >
              <X size={14} strokeWidth={2.5} style={{ marginRight: 6 }} />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
