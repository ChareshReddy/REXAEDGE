/**
 * Search Help Options Configuration for Material Collective Search Help MAT1
 * Ordered exactly as in standard SAP MAT1 search help options list.
 */

export const SAP_SEARCH_OPTIONS = [
  {
    key: 'M',
    code: 'M',
    name: 'Material Number/Material Description',
    available: true,
    table: 'MAKT',
    fields: [
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Ex. 1102* or 100-100' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Ex. SOLAR* or PANEL' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'A',
    code: 'A',
    name: 'Material by Old Material Number',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'BISMT', label: 'Old material number', length: 18, placeholder: 'Ex. 1527279*' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Ex. *BEARING*' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' }
    ]
  },
  {
    key: 'B',
    code: 'B',
    name: 'Materials that have a BOM',
    available: true,
    table: 'MAST',
    fields: [
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Ex. 100-*' },
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000' },
      { id: 'STLAN', label: 'BOM Usage', length: 1, placeholder: 'Ex. 1, 2, 3' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'C',
    code: 'C',
    name: 'Material Transferred from CAD System',
    available: true,
    table: 'M_MAT1C',
    fields: [
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Ex. CAD-*' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'E',
    code: 'E',
    name: 'Competitor Product',
    available: true,
    table: 'M_MAT1E',
    fields: [
      { id: 'KUNNR', label: 'Competitor', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'F',
    code: 'F',
    name: 'Production Resources/Tools by Description/PRT Grouping',
    available: true,
    table: 'M_MAT1F',
    fields: [
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000' },
      { id: 'FHM_FGRU1', label: 'PRT Grouping 1', length: 4, placeholder: 'Ex. PRT1' },
      { id: 'FHM_FGRU2', label: 'PRT Grouping 2', length: 4, placeholder: 'Ex. PRT2' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'H',
    code: 'H',
    name: 'Sales Material by General Product Hierarchy',
    available: true,
    table: 'M_MAT1H',
    fields: [
      { id: 'PRDHA', label: 'Product Hierarchy', length: 18, placeholder: 'Ex. PROD-*' },
      { id: 'VKORG', label: 'Sales Organization', length: 4, placeholder: 'Ex. 1000' },
      { id: 'VTWEG', label: 'Distribution Channel', length: 2, placeholder: 'Ex. 10' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'I',
    code: 'I',
    name: "Supplier's Material Number",
    available: true,
    table: 'EINA',
    fields: [
      { id: 'IDNLF', label: "Supplier's Material Number", length: 35, placeholder: 'Ex. VEND-*' },
      { id: 'LIFNR', label: 'Vendor', length: 10, placeholder: 'Ex. 0000451688' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'J',
    code: 'J',
    name: 'Material Category',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'ATTYP', label: 'Material Category', length: 2, placeholder: 'Ex. 00, 01, 11' },
      { id: 'MATKL', label: 'Material Group', length: 9, placeholder: 'Optional group' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'K',
    code: 'K',
    name: 'Materials for class',
    available: false,
    unavailableReason: 'K: Materials for class is not available yet (SAP Error AD:559).'
  },
  {
    key: 'L',
    code: 'L',
    name: 'Material by Material Group',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'MATKL', label: 'Material Group', length: 9, placeholder: 'Ex. F1SX or ELEC*' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'N',
    code: 'N',
    name: 'Material by EAN (International Article Number)',
    available: true,
    table: 'MEAN',
    fields: [
      { id: 'EAN11', label: 'International Article Number (EAN)', length: 18, placeholder: 'Ex. 8905*' },
      { id: 'MEINH', label: 'Unit of Measure', length: 3, placeholder: 'Ex. ST or PAA' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'O',
    code: 'O',
    name: 'Materials by Several Classes',
    available: false,
    unavailableReason: 'O: Materials by Several Classes is not available yet (SAP Error AD:559).'
  },
  {
    key: 'P',
    code: 'P',
    name: 'Material by Product Hierarchy',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'PRDHA', label: 'Product Hierarchy', length: 18, placeholder: 'Ex. PROD-*' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'R',
    code: 'R',
    name: 'Material by Task List',
    available: true,
    table: 'M_MAT1R',
    fields: [
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1009, 1000' },
      { id: 'PLNTY', label: 'Task List Type', length: 1, placeholder: 'Ex. N' },
      { id: 'PLNNR', label: 'Key for Task List Group', length: 8, placeholder: 'Ex. 09M06154' },
      { id: 'PLNAL', label: 'Group Counter', length: 2, placeholder: 'Ex. 01' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Ex. CUT COMP*' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'S',
    code: 'S',
    name: 'Sales Material by Description',
    available: true,
    table: 'M_MAT1S',
    fields: [
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Ex. CASUAL*' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' },
      { id: 'VKORG', label: 'Sales Organization', length: 4, placeholder: 'Ex. 1000' },
      { id: 'VTWEG', label: 'Distribution Channel', length: 2, placeholder: 'Ex. 10' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' }
    ]
  },
  {
    key: 'T',
    code: 'T',
    name: 'Material by Material Type',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'MTART', label: 'Material Type', length: 4, placeholder: 'Ex. ROH, FERT, HALB' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'V',
    code: 'V',
    name: 'Material by Supply Area',
    available: true,
    table: 'M_MAT1V',
    fields: [
      { id: 'PRVBE', label: 'Supply Area', length: 10, placeholder: 'Ex. PV01' },
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material filter' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'W',
    code: 'W',
    name: 'Plant Material by Description',
    available: true,
    table: 'M_MAT1W',
    fields: [
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000, 1001' },
      { id: 'MATNR', label: 'Material', length: 18 },
      { id: 'MAKTG', label: 'Material description', length: 40 },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'FASHION',
    name: 'Material with Fashion Fields',
    available: true,
    table: 'FSH_MG_MATNR_V',
    fields: [
      { id: 'FSH_SEASON_YEAR', label: 'Season Year', length: 4, placeholder: 'Ex. 2024' },
      { id: 'FSH_SEASON', label: 'Season', length: 4, placeholder: 'Ex. SS01' },
      { id: 'FSH_COLLECTION', label: 'Collection', length: 10, placeholder: 'Optional collection' },
      { id: 'FSH_THEME', label: 'Theme', length: 10, placeholder: 'Optional theme' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'GENERIC',
    name: 'Variants of a Generic Material',
    available: true,
    table: 'MGW_GENERIC_VAR',
    fields: [
      { id: 'SATNR', label: 'Generic material', length: 18, placeholder: 'Ex. XA1FL0464L' },
      { id: 'MATNR', label: 'Variant material', length: 18, placeholder: 'Optional variant' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'MATKL', label: 'Material Group', length: 9, placeholder: 'Optional group' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'SEGMENTATION',
    name: 'Material with Segmentation',
    available: true,
    table: 'MARA',
    fields: [
      { id: 'SGT_CSGR', label: 'Segmentation Structure', length: 4, placeholder: 'Ex. ZRFL' },
      { id: 'SGT_COVSA', label: 'Segmentation Strategy', length: 8, placeholder: 'Ex. ZRFL01' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material' },
      { id: 'MAKTG', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'MATLIST',
    name: 'Search Help for Material List',
    available: false,
    unavailableReason: 'MATLIST: Search Help for Material List is not available yet (SAP Error DA:131).'
  },
  {
    key: 'ARTHIER',
    name: 'Search Help for Article Hierarchy',
    available: false,
    unavailableReason: 'ARTHIER: Search Help for Article Hierarchy is not available yet (SAP Error DA:131).'
  },
  {
    key: 'ORIGINAL',
    name: 'Original Material',
    available: true,
    table: 'VWRF_ART_SHLP',
    fields: [
      { id: 'ORIGINAL_ART_NR', label: 'Original Article', length: 18, placeholder: 'Ex. 100-*' },
      { id: 'FOLUP_ART_NR', label: 'Follow-up Article', length: 18, placeholder: 'Optional follow-up' },
      { id: 'FOLLOWUP_TYP_DE', label: 'Substitution Type', length: 20, placeholder: 'Optional type' },
      { id: 'MAKTG_ORG_ART', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'FOLLOWUP',
    name: 'Follow-Up/Replacement Material',
    available: true,
    table: 'VWRF_ART_SHLP',
    fields: [
      { id: 'FOLUP_ART_NR', label: 'Follow-up Article', length: 18, placeholder: 'Ex. 100-*' },
      { id: 'ORIGINAL_ART_NR', label: 'Original Article', length: 18, placeholder: 'Optional original' },
      { id: 'FOLLOWUP_TYP_DE', label: 'Substitution Type', length: 20, placeholder: 'Optional type' },
      { id: 'MAKTG_FOLUP_ART', label: 'Material description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'X',
    code: 'X',
    name: 'Material by Characteristic Value',
    available: false,
    unavailableReason: 'X: Material by Characteristic Value is not available yet (SAP Error AD:559).'
  },
  {
    key: 'G',
    code: 'G',
    name: 'Search Help for Manufacturer Part Number',
    available: true,
    table: 'M_MAT1MPN',
    fields: [
      { id: 'MFRPN', label: 'Manufacturer Part Number', length: 40, placeholder: 'Ex. PART-*' },
      { id: 'MFRNR', label: 'Manufacturer', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'TEXT_HTN', label: 'Description', length: 40, placeholder: 'Optional description' },
      { id: 'MATNR_HTN', label: 'MPN material', length: 18, placeholder: 'Optional MPN' },
      { id: 'MATNR_B', label: 'Inventory-managed material', length: 18, placeholder: 'Optional material' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'U',
    code: 'U',
    name: 'Search Help for Manufacturer Part Number with AMPL',
    available: true,
    table: 'M_MAT2MPN',
    fields: [
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000, 1001' },
      { id: 'AMPSP', label: 'AMPL Status', length: 4, placeholder: 'Optional AMPL status' },
      { id: 'MFRNR', label: 'Manufacturer', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'REVLV', label: 'Revision Level', length: 2, placeholder: 'Optional rev level' },
      { id: 'MATNR_B', label: 'Inventory-managed material', length: 18, placeholder: 'Optional material' },
      { id: 'MFRPN', label: 'Manufacturer Part Number', length: 40, placeholder: 'Ex. PART-*' },
      { id: 'MATNR_HTN', label: 'MPN material', length: 18, placeholder: 'Optional MPN' }
    ]
  },
  {
    key: 'FFF',
    name: 'Part from FFF Class Ext. Matl No.',
    available: true,
    table: 'M_MAT1MPN',
    fields: [
      { id: 'MFRNR', label: 'Manufacturer', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'MFRPN', label: 'Manufacturer Part Number', length: 40, placeholder: 'Ex. PART-*' },
      { id: 'TEXT_HTN', label: 'Description', length: 40, placeholder: 'Ex. SPARX*' },
      { id: 'MATNR_HTN', label: 'MPN material', length: 18, placeholder: 'Optional MPN' },
      { id: 'MATNR_B', label: 'Inventory-managed material', length: 18, placeholder: 'Optional material' }
    ]
  },
  {
    key: 'MPN',
    name: 'Valid Materials in MPN MRP Sets',
    available: true,
    table: 'M_MAT1MPN',
    fields: [
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000' },
      { id: 'MFRNR', label: 'Manufacturer', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'MFRPN', label: 'Manufacturer Part Number', length: 40, placeholder: 'Ex. PART-*' },
      { id: 'MATNR_HTN', label: 'MPN material', length: 18, placeholder: 'Optional MPN' },
      { id: 'MATNR_B', label: 'Inventory-managed material', length: 18, placeholder: 'Optional material' }
    ]
  },
  {
    key: 'Z_INTER',
    code: 'Z',
    name: 'Z (1-Way/Restricted Interchangeability)',
    available: true,
    table: 'V_PICPSRL',
    fields: [
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Ex. 100-*' },
      { id: 'WERKS', label: 'Plant', length: 4, placeholder: 'Ex. 1000' },
      { id: 'BERID', label: 'MRP Area', length: 10, placeholder: 'Optional MRP area' },
      { id: 'LMATN', label: 'Leading Material', length: 18, placeholder: 'Optional leading mat.' }
    ]
  },
  {
    key: 'D',
    code: 'D',
    name: 'Search Help for Inventory-Managed Material',
    available: true,
    table: 'M_MAT1MPN',
    fields: [
      { id: 'MATNR_B', label: 'Inventory-managed material', length: 18, placeholder: 'Ex. 100-*' },
      { id: 'MATNR_HTN', label: 'MPN material', length: 18, placeholder: 'Optional MPN' },
      { id: 'MFRNR', label: 'Manufacturer', length: 10, placeholder: 'Ex. 0000100000' },
      { id: 'MFRPN', label: 'Manufacturer Part Number', length: 40, placeholder: 'Ex. PART-*' },
      { id: 'TEXT_HTN', label: 'Description', length: 40, placeholder: 'Optional description' },
      { id: 'SPRAS', label: 'Language Key', length: 2, defaultValue: 'EN' }
    ]
  },
  {
    key: 'Z_EAN',
    code: 'Z',
    name: 'Z (International Article Numbers: Vendor-Specific)',
    available: true,
    table: 'MLEA',
    fields: [
      { id: 'EAN11', label: 'Vendor-Specific EAN', length: 18, placeholder: 'Ex. 8905*' },
      { id: 'LIFNR', label: 'Vendor', length: 10, placeholder: 'Ex. 0000451688' },
      { id: 'MATNR', label: 'Material', length: 18, placeholder: 'Optional material' },
      { id: 'LFEAN', label: 'Vendor EAN Flag', length: 1, defaultValue: 'X' }
    ]
  }
];

export function getSearchOption(key) {
  if (!key) return null;
  const upper = String(key).trim().toUpperCase();
  return SAP_SEARCH_OPTIONS.find(o => o.key.toUpperCase() === upper || (o.code && o.code.toUpperCase() === upper));
}
