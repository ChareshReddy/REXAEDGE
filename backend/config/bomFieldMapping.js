/**
 * BOM Field Mapping Configuration
 * Defines exact SAP table, DDIC field, and BAPI mapping for BOM create operations.
 */

export const BOM_FIELD_MAPPING = {
  SEQUENCE_NUM: {
    sheetHeader: 'Sequence Num',
    description: 'Group label shared across BOMs for display and export tracking; auto-numbered 0010, 0020... in SAP',
    isGroupLabel: true
  },
  REFERENCE_NUMBER: {
    sheetHeader: 'REFERENCE NUMBER',
    sapTable: 'STPO',
    sapField: 'POTX1',
    bapiStructure: 'BAPI1080_ITM_C',
    bapiField: 'ITEM_TEXT1',
    maxLen: 40,
    description: 'BOM Item Text Line 1. Must not exceed 40 characters; if longer, BOM is marked Invalid (never truncated).'
  },
  STORAGE_LOCATION: {
    sheetHeader: 'StorageLocation',
    sapTable: 'STPO',
    sapField: 'LGORT',
    bapiStructure: 'BAPI1080_ITM_C',
    bapiField: 'ISS_ST_LOC',
    maxLen: 4,
    checkTable: 'T001L',
    description: 'Issue Storage Location. Validated against T001L for the plant.'
  },
  BOM_STATUS: {
    sheetHeader: 'BOM Status',
    sapTable: 'STKO',
    sapField: 'STLST',
    bapiStructure: 'BAPI1080_BOM_C',
    bapiField: 'BOM_STATUS',
    maxLen: 2,
    checkTable: 'T415S',
    description: 'BOM Header Status. Validated against SAP status table T415S.'
  },
  COSTING_RELEVANCY: {
    sheetHeader: 'CostingRelevncy',
    altHeaders: ['CostingRelevancy', 'Costing Relevancy', 'Costing Relevncy'],
    sapTable: 'STPO',
    sapField: 'SANKA',
    bapiStructure: 'BAPI1080_ITM_C',
    bapiField: 'COST_REL',
    maxLen: 1,
    description: 'Costing Relevancy Indicator ("X" or blank).'
  },
  ENGINEERING: {
    sheetHeader: 'Engineering',
    sapTable: 'STPO',
    sapField: 'SANKO',
    bapiStructure: 'BAPI1080_ITM_C',
    bapiField: 'ENG_REL',
    maxLen: 1,
    description: 'Engineering Relevancy Indicator ("X" or blank).'
  },
  CHANGE_NO_TO: {
    sheetHeader: 'Change No. To',
    altHeaders: ['ChangeNoTo', 'Change No To', 'Change No.', 'ChangeNo'],
    sapTable: 'STKO/STPO',
    sapField: 'AENNR',
    bapiStructure: 'BAPI1080_BOM_C/BAPI1080_ITM_C',
    bapiField: 'CHANGE_NO',
    maxLen: 12,
    description: 'Engineering Change Management number.'
  }
};
