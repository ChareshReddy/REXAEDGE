/**
 * CS02 Batch Input Configuration and BDC Builder.
 *
 * Source of Truth: SHDB Recording of CS02 on S/4HANA (Release 2026/S4A).
 * All Dynpros, Field Names, Subscreens, and OK Codes are strictly derived
 * from the live SHDB recording session (ZTEST_CS02 and ZTEST_CS02_2).
 */

export const CS02_BATCH_CONFIG = {
  tcode: 'CS02',
  mode: 'N',
  screens: {
    // 1. Initial Screen (Recorded in ZTEST_CS02_Q, ZTEST_CS02_I, TEST_ADD, Test_DELETE, TEST_HEADER)
    initial: {
      program: 'SAPLCSDI',
      dynpro: '0100',
      fields: {
        cursor: 'RC29N-STLAL',
        material: 'RC29N-MATNR',
        plant: 'RC29N-WERKS',
        usage: 'RC29N-STLAN',
        alternative: 'RC29N-STLAL',
        validFrom: 'RC29N-DATUV',
        changeNo: 'RC29N-AENNR'
      },
      okCodes: {
        enter: '/00'
      }
    },

    // 2. Overview Screen (Item List) (Recorded in ZTEST_CS02_Q, ZTEST_CS02_I, TEST_ADD, Test_DELETE, TEST_HEADER)
    overview: {
      program: 'SAPLCSDI',
      dynpro: '0150',
      altDynpro: '0140',
      subscreens: {
        header: '0802STLKOPF',
        items: '0820BER_BTCI'
      },
      fields: {
        selectRow01: 'RC29P-AUSKZ(01)',
        selectRow02: 'RC29P-AUSKZ(02)',
        quantity01: 'RC29P-MENGE(01)',
        quantity02: 'RC29P-MENGE(02)',
        component01: 'RC29P-IDNRK(01)',
        component02: 'RC29P-IDNRK(02)',
        category01: 'RC29P-POSTP(01)',
        category02: 'RC29P-POSTP(02)',
        unit01: 'RC29P-MEINS(01)',
        unit02: 'RC29P-MEINS(02)'
      },
      okCodes: {
        enter: '/00',
        position: '=SETP',      // Position popup (Recorded in ZTEST_CS02_Q, ZTEST_CS02_I)
        delete: '=FCDL',        // Delete selected row (Recorded in Test_DELETE)
        header: '=KALL',        // Header base data screen (Recorded in TEST_HEADER)
        newItemPage: '=FCNP',   // Append new item page (Recorded in TEST_ADD)
        itemDetail: '=/CS',     // Navigate to item details (Recorded in ZTEST_CS02_I)
        save: '=FCBU',          // Save BOM (Recorded in ZTEST_CS02_Q, Test_DELETE, TEST_ADD, ZTEST_CS02_I, TEST_HEADER)
        overview: '=FCPU',      // Return to overview (Recorded in TEST_ALL)
        back: '/EBACK'          // Return
      }
    },

    // 3. Position Dialog Popup (Recorded in ZTEST_CS02_Q, ZTEST_CS02_I)
    position: {
      program: 'SAPLCSDI',
      dynpro: '0708',           // Screen 0708 replaces earlier guessed 0700
      subscreens: {
        positionBox: '0710POS_SETP'
      },
      fields: {
        cursor: 'RC29P-SELPO',
        itemNo: 'RC29P-SELPO'
      },
      okCodes: {
        confirm: '=CLWI',
        cancel: '/EABBR'        // Cancel/close popup (Recorded in TEST_QTY_TWO, TEST_HDR_ITM, TEST_DEL_MIX, TEST_QTY_ADD)
      }
    },

    // 4. Item Detail: General Data Screen (Recorded in ZTEST_CS02_Q, TEST_ADD)
    itemDetailGeneral: {
      program: 'SAPLCSDI',
      dynpro: '0130',
      subscreens: {
        generalBox: '0830POS_PHPT'
      },
      fields: {
        cursor: 'RC29P-IDNRK',
        component: 'RC29P-IDNRK',
        quantity: 'RC29P-MENGE',
        unit: 'RC29P-MEINS',
        fixedQuantity: 'RC29P-FMENG',
        componentScrap: 'RC29P-AUSCH'
      },
      okCodes: {
        enter: '/00'
      }
    },

    // 5. Item Detail: Status / Costing Screen (Recorded in ZTEST_CS02_Q, TEST_ADD)
    itemDetailStatusText: {
      program: 'SAPLCSDI',
      dynpro: '0131',
      subscreens: {
        header: '0802STLKOPF',
        textData: '0840POS_PDAT'
      },
      fields: {
        cursor: 'RC29P-POTX1',
        itemText1: 'RC29P-POTX1',
        costingRelevancy: 'RC29P-SANKA'
      },
      okCodes: {
        enter: '/00',
        back: '/EBACK'
      }
    },

    // 6. Item Detail: Extended 2130 Screen (Recorded in ZTEST_CS02_I)
    itemDetail2130: {
      program: 'SAPLCSDI',
      dynpro: '2130',
      fields: {
        cursorUnit: 'RC29P-MEINS',
        cursorLgort: 'RC29P-LGORT',
        component: 'RC29P-IDNRK',
        quantity: 'RC29P-MENGE',
        unit: 'RC29P-MEINS',
        text: 'RC29P-POTX1',
        storageLocation: 'RC29P-LGORT',
        costingFlag1: 'RC29P-SANKO',
        costingFlag2: 'RC29P-SANKA'
      },
      okCodes: {
        page2: '=PDAT',
        save: '=FCBU'
      }
    },

    // 7. Header Base Data Screen (Recorded in TEST_HEADER)
    header: {
      program: 'SAPLCSDI',
      dynpro: '2110',
      subscreens: {
        header: '0800STLKOPF',
        subpage: '1110SUBPAGE'
      },
      fields: {
        cursor: 'RC29K-STLST',
        baseQty: 'RC29K-BMENG',
        bomStatus: 'RC29K-STLST'
      },
      okCodes: {
        save: '=FCBU',
        overview: '=FCPU',      // Return to overview (Recorded in TEST_ALL, TEST_HDR_ITM)
        back: '/EBACK'
      }
    }
  },

  // 8. Expected Success Message
  expectedSuccess: {
    msgId: '29',
    msgNr: '024' // Message: "BOM & & & changed"
  }
};

/**
 * Validates incoming items against current BOM components.
 * Rejects duplicate item numbers and component mismatches before write.
 *
 * @param {Array<object>} items - List of change items from caller
 * @param {Array<object>} currentComponents - Existing BOM components from read-table
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
export function validateChangeItems(items = [], currentComponents = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: true };
  }

  const seenItems = new Set();
  const existingMap = new Map();

  for (const c of currentComponents) {
    const pos = String(c.item || c.itemNo || c.posnr || '').padStart(4, '0');
    const comp = String(c.component || c.idnrk || c.material || '').trim().toUpperCase();
    if (pos) {
      existingMap.set(pos, comp);
    }
  }

  for (const item of items) {
    const type = (item.changeType || '').toUpperCase();
    const itemNum = String(item.item || item.itemNo || item.posnr || '').padStart(4, '0');

    // 1. Check for duplicate item numbers within the batch
    if (itemNum && itemNum !== '0000') {
      if (seenItems.has(itemNum)) {
        return {
          valid: false,
          code: 'DUPLICATE_ITEM_NUMBER',
          error: `Duplicate item number '${itemNum}' in change request. Each item number must be unique.`
        };
      }
      seenItems.add(itemNum);
    }

    // 2. Check for unknown item number or component mismatch on existing items
    if (type === 'CHANGE' || type === 'DELETE') {
      if (itemNum && currentComponents.length > 0 && !existingMap.has(itemNum)) {
        return {
          valid: false,
          code: 'UNKNOWN_ITEM_NUMBER',
          error: `Item number '${itemNum}' not found in BOM.`
        };
      }
      if (itemNum && existingMap.has(itemNum)) {
        const expectedComp = existingMap.get(itemNum);
        const providedComp = String(item.component || item.material || '').trim().toUpperCase();
        if (providedComp && expectedComp) {
          // Normalize (strip leading zeros for comparison)
          const normExp = expectedComp.replace(/^0+/, '');
          const normProv = providedComp.replace(/^0+/, '');
          if (normExp !== normProv) {
            return {
              valid: false,
              code: 'COMPONENT_MISMATCH',
              error: `Component mismatch for item ${itemNum}: expected '${expectedComp}', received '${providedComp}'.`
            };
          }
        }
      }
    }
  }

  return { valid: true };
}

/**
 * Formats quantity according to SAP user decimal notation (DCPFM).
 * Never sends thousands separators.
 * DCPFM 'X': 1234.56 (period decimal)
 * DCPFM ' ' or 'Y': 1234,56 (comma decimal)
 *
 * @param {string|number} qty
 * @param {string} [dcpfm='X']
 * @returns {string}
 */
export function formatSapQuantity(qty, dcpfm = 'X') {
  if (qty === undefined || qty === null || String(qty).trim() === '') return '1';
  let s = String(qty).trim().replace(/[\s_]/g, '');

  if (/^\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  } else if (s.includes(',') && s.includes('.')) {
    if (s.indexOf(',') < s.indexOf('.')) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(/\./g, '').replace(',', '.');
    }
  }

  const num = Number(s);
  if (isNaN(num)) return s;

  if (Number.isInteger(num)) {
    return String(num);
  }

  const parts = s.split('.');
  const intPart = parts[0] || '0';
  const decPart = parts[1] || '';
  const decSep = (dcpfm === ' ' || dcpfm === '' || dcpfm === 'Y') ? ',' : '.';
  return decPart ? `${intPart}${decSep}${decPart}` : intPart;
}

/**
 * Formats date according to SAP user date format (DATFM).
 * DATFM '1' = DD.MM.YYYY
 * DATFM '2' = MM/DD/YYYY
 * DATFM '3' = MM-DD-YYYY
 * DATFM '4' = YYYY.MM.DD
 * DATFM '5' = YYYY/MM/DD
 * DATFM '6' = YYYY-MM-DD
 *
 * @param {string|Date} dateVal
 * @param {string} [datfm='1']
 * @returns {string}
 */
export function formatSapDate(dateVal, datfm = '1') {
  let d, m, y;
  if (!dateVal) {
    const now = new Date();
    d = String(now.getDate()).padStart(2, '0');
    m = String(now.getMonth() + 1).padStart(2, '0');
    y = String(now.getFullYear());
  } else if (dateVal instanceof Date) {
    d = String(dateVal.getDate()).padStart(2, '0');
    m = String(dateVal.getMonth() + 1).padStart(2, '0');
    y = String(dateVal.getFullYear());
  } else {
    const s = String(dateVal).trim();
    if (/^\d{8}$/.test(s)) {
      y = s.slice(0, 4);
      m = s.slice(4, 6);
      d = s.slice(6, 8);
    } else if (/^\d{4}[-./]\d{2}[-./]\d{2}/.test(s)) {
      const parts = s.split(/[-./]/);
      y = parts[0];
      m = parts[1];
      d = parts[2].slice(0, 2);
    } else if (/^\d{2}[-./]\d{2}[-./]\d{4}/.test(s)) {
      const parts = s.split(/[-./]/);
      d = parts[0];
      m = parts[1];
      y = parts[2].slice(0, 4);
    } else {
      return s;
    }
  }

  switch (String(datfm).trim()) {
    case '2': return `${m}/${d}/${y}`;
    case '3': return `${m}-${d}-${y}`;
    case '4': return `${y}.${m}.${d}`;
    case '5': return `${y}/${m}/${d}`;
    case '6': return `${y}-${m}-${d}`;
    case '1':
    default:
      return `${d}.${m}.${y}`;
  }
}

/**
 * Builds the complete BDC Data table for RFC_CALL_TRANSACTION_USING CS02.
 * Strictly follows the recorded SHDB executions:
 *   - Header changes: =KALL -> 2110 -> =FCBU (TEST_HEADER)
 *   - Quantity changes: =SETP -> 0708 -> 0150 =FCBU -> 0130 -> 0131 (ZTEST_CS02_Q)
 *   - Detail changes (unit, lgort, text): =SETP -> 0708 -> 0150 =/CS -> 2130 =PDAT -> 2130 =FCBU (ZTEST_CS02_I)
 *   - New items (ADD): =FCNP -> 0140 line (02) -> 0130 -> 0131 -> 0140 =FCBU (TEST_ADD)
 *   - Deletions: =SETP -> 0708 -> 0150 RC29P-AUSKZ(01)='X' + =FCDL -> 0150 =FCBU (TEST_DELETE)
 *   - Combination Qty + Add: 0150 Qty(01) + =FCNP -> 0140 -> 0130 -> 0131 -> 0140 =FCBU
 *
 * @param {object} params
 * @param {string} params.material
 * @param {string} params.plant
 * @param {string} params.bomUsage
 * @param {string} params.alternativeBom
 * @param {string} [params.changeNo]
 * @param {string} [params.validFrom]
 * @param {object} [params.header]
 * @param {Array<object>} [params.items]
 * @param {object} [params.userDefaults] - SAP user DCPFM and DATFM defaults
 * @param {object} [_currentBom] - Current BOM loaded via read-table
 * @param {object} [userDefaults] - Optional direct userDefaults
 * @returns {Array<object>} Array of BDC steps { PROGRAM, DYNPRO, DYNBEGIN, FNAM, FVAL }
 */
export function buildCs02BdcData(params = {}, _currentBom = null, userDefaults = null) {
  const cfg = CS02_BATCH_CONFIG;
  const bdc = [];

  const defaults = userDefaults || params.userDefaults || { dcpfm: 'X', datfm: '1' };
  const dcpfm = defaults.dcpfm || 'X';
  const datfm = defaults.datfm || '1';

  const cleanMat = String(params.material || '').trim().toUpperCase();
  const cleanPlt = String(params.plant || '').trim();
  const cleanUsg = String(params.bomUsage || '1').trim();
  const cleanAlt = String(params.alternativeBom || '1').trim();
  const cleanAltPadded = cleanAlt.padStart(2, '0');

  // Format validFrom date according to user's DATFM
  const validFromStr = formatSapDate(params.validFrom, datfm);

  // Existing components lookup from currentBom
  const existingComponents = _currentBom?.components || _currentBom?.items || [];
  function getComponentInfo(itemNo) {
    const pad = String(itemNo || '').padStart(4, '0');
    const found = existingComponents.find((c) => {
      const cPos = String(c.item || c.itemNo || c.posnr || '').padStart(4, '0');
      return cPos === pad;
    });
    return found || null;
  }

  // --- Step 1: Initial Screen (SAPLCSDI 0100 - recorded in all recordings) ---
  bdc.push(
    { PROGRAM: cfg.screens.initial.program, DYNPRO: cfg.screens.initial.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.initial.fields.cursor },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.initial.okCodes.enter },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.material, FVAL: cleanMat },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.plant, FVAL: cleanPlt },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.usage, FVAL: cleanUsg },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.alternative, FVAL: cleanAltPadded },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.validFrom, FVAL: validFromStr }
  );

  if (params.changeNo) {
    bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.initial.fields.changeNo, FVAL: String(params.changeNo).trim() });
  }

  const header = params.header || {};
  const hasHeaderChanges = Boolean(
    (header.baseQty !== undefined && header.baseQty !== null && String(header.baseQty).trim() !== '') ||
    (header.bomStatus !== undefined && header.bomStatus !== null && String(header.bomStatus).trim() !== '') ||
    (header.headerText !== undefined && header.headerText !== null && String(header.headerText).trim() !== '')
  );

  const rawItems = Array.isArray(params.items) ? params.items : [];
  const headerChanges = hasHeaderChanges ? header : null;

  // Separate item operations into quantity changes, detail changes, deletions, and additions
  const quantityChanges = [];
  const detailChanges = [];
  const deletions = rawItems.filter((i) => (i.changeType || '').toUpperCase() === 'DELETE');
  const newItems = rawItems.filter((i) => (i.changeType || '').toUpperCase() === 'ADD');

  for (const itm of rawItems) {
    if ((itm.changeType || '').toUpperCase() === 'CHANGE') {
      const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
      const compInfo = getComponentInfo(itemNo);
      const orig = itm.original || itm.orig || compInfo || null;

      const origUnit = orig ? String(orig.unit || orig.meins || orig.baseUnit || '').trim().toUpperCase() : '';
      const origLgort = orig ? String(orig.storageLocation || orig.lgort || '').trim().toUpperCase() : '';
      const origText = orig ? String(orig.itemText !== undefined ? orig.itemText : (orig.description !== undefined ? orig.description : '')).trim() : '';

      const currentUnit = String(itm.unit !== undefined ? itm.unit : (itm.meins !== undefined ? itm.meins : '')).trim().toUpperCase();
      const currentLgort = String(itm.storageLocation !== undefined ? itm.storageLocation : (itm.lgort !== undefined ? itm.lgort : '')).trim().toUpperCase();
      const currentText = String(itm.itemText !== undefined ? itm.itemText : (itm.description !== undefined ? itm.description : '')).trim();

      const unitChanged = orig ? (Boolean(currentUnit) && currentUnit !== origUnit) : Boolean(currentUnit && currentUnit !== 'EA');
      const lgortChanged = orig ? (currentLgort !== origLgort && (Boolean(currentLgort) || Boolean(origLgort))) : Boolean(currentLgort);
      const textChanged = orig ? (currentText !== origText && (Boolean(currentText) || Boolean(origText))) : Boolean(currentText);
      const extraDetailChanged = Boolean(
        (itm.fixedQuantity !== undefined && (!orig || itm.fixedQuantity !== orig.fixedQuantity)) ||
        (itm.componentScrap !== undefined && (!orig || String(itm.componentScrap) !== String(orig.componentScrap || ''))) ||
        (itm.scrap !== undefined && (!orig || String(itm.scrap) !== String(orig.scrap || '')))
      );

      if (unitChanged || lgortChanged || textChanged || extraDetailChanged) {
        detailChanges.push(itm);
      } else {
        quantityChanges.push(itm);
      }
    }
  }

  const hasItemWork = quantityChanges.length > 0 || detailChanges.length > 0 || newItems.length > 0 || deletions.length > 0;
  let currentScreen = '0150';

  // Helper to append a Position dialog sequence (0150 =SETP -> 0708 =CLWI)
  function appendPosition(itemNoStr) {
    const padItem = String(itemNoStr || '').padStart(4, '0');
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.position }
    );
    bdc.push(
      { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.position.okCodes.confirm },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.position.fields.cursor },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.position.fields.itemNo, FVAL: padItem }
    );
  }

  // --- Step 2: Header Changes (TEST_HEADER, TEST_ALL, TEST_HDR_ITEMS) ---
  if (headerChanges) {
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.header }
    );

    if (!hasItemWork) {
      // Sole change: save directly via =FCBU (TEST_HEADER)
      bdc.push(
        { PROGRAM: cfg.screens.header.program, DYNPRO: cfg.screens.header.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.header.okCodes.save }
      );
      if (headerChanges.bomStatus !== undefined && headerChanges.bomStatus !== null && String(headerChanges.bomStatus).trim() !== '') {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.header.fields.bomStatus });
      } else {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.header.fields.baseQty });
      }
      if (headerChanges.baseQty !== undefined && headerChanges.baseQty !== null && String(headerChanges.baseQty).trim() !== '') {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.baseQty, FVAL: formatSapQuantity(headerChanges.baseQty, dcpfm) });
      }
      if (headerChanges.bomStatus !== undefined && headerChanges.bomStatus !== null && String(headerChanges.bomStatus).trim() !== '') {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.bomStatus, FVAL: String(headerChanges.bomStatus).trim() });
      }
      return bdc;
    } else {
      // Followed by items: return to overview via =FCPU (TEST_ALL, TEST_HDR_ITEMS)
      bdc.push(
        { PROGRAM: cfg.screens.header.program, DYNPRO: cfg.screens.header.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: '=FCPU' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.header.fields.baseQty }
      );
      if (headerChanges.baseQty !== undefined && headerChanges.baseQty !== null && String(headerChanges.baseQty).trim() !== '') {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.baseQty, FVAL: formatSapQuantity(headerChanges.baseQty, dcpfm) });
      }
      if (headerChanges.bomStatus !== undefined && headerChanges.bomStatus !== null && String(headerChanges.bomStatus).trim() !== '') {
        bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.bomStatus, FVAL: String(headerChanges.bomStatus).trim() });
      }
      currentScreen = '0150';
    }
  }

  // --- Step 3: Quantity Changes (TEST_QTY_TWO, TEST_HDR_ITEMS, TEST_DEL_MIX, TEST_QTY_ADD, TEST_ALL) ---
  for (const itm of quantityChanges) {
    const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
    const padItem = String(itemNo).padStart(4, '0');
    const compInfo = getComponentInfo(padItem);
    const compMat = String(itm.component || compInfo?.component || '').trim().toUpperCase();
    const compUnit = String(itm.unit || compInfo?.unit || 'PAA').trim().toUpperCase();
    const formattedItemQty = formatSapQuantity(itm.quantity || compInfo?.quantity || '1', dcpfm);

    if (currentScreen === '0708') {
      // 0708 opened automatically from previous quantity change! (TEST_QTY_TWO)
      bdc.push(
        { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.position.okCodes.confirm },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.position.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.position.fields.itemNo, FVAL: padItem }
      );
    } else {
      appendPosition(padItem);
    }

    // On 0150: change quantity on row (01) and press /00
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.enter },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.quantity01, FVAL: formattedItemQty }
    );

    // Screen 0130 confirmation
    bdc.push(
      { PROGRAM: cfg.screens.itemDetailGeneral.program, DYNPRO: cfg.screens.itemDetailGeneral.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailGeneral.okCodes.enter },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailGeneral.fields.cursor },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.component, FVAL: compMat },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.quantity, FVAL: formattedItemQty },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.unit, FVAL: compUnit }
    );

    // Screen 0131 confirmation
    bdc.push(
      { PROGRAM: cfg.screens.itemDetailStatusText.program, DYNPRO: cfg.screens.itemDetailStatusText.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailStatusText.okCodes.enter },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailStatusText.fields.cursor },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailStatusText.fields.costingRelevancy, FVAL: 'X' }
    );

    // After 0131, SAP automatically opens 0708!
    currentScreen = '0708';
  }

  // --- Step 4: Deletions (TEST_DELETE, TEST_DEL_MIX, TEST_ALL) ---
  for (const itm of deletions) {
    const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
    const padItem = String(itemNo).padStart(4, '0');

    if (currentScreen === '0708') {
      // Direct position on 0708 (TEST_ALL)
      bdc.push(
        { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.position.okCodes.confirm },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.position.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.position.fields.itemNo, FVAL: padItem }
      );
    } else {
      appendPosition(padItem);
    }

    // Select row 01 and delete (=FCDL)
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.selectRow01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.delete },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.selectRow01, FVAL: 'X' }
    );
    currentScreen = '0150';
  }

  // --- Step 5: New Items (TEST_ADD, TEST_ADD_MULTI, TEST_ADD_TWO, TEST_QTY_ADD, TEST_ALL) ---
  if (newItems.length > 0) {
    if (currentScreen === '0708') {
      // Close 0708 via /EABBR to return to 0150 before =FCNP (TEST_QTY_ADD)
      bdc.push(
        { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: '/EABBR' }
      );
      currentScreen = '0150';
    }

    // Open new item page from 0150 via =FCNP
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.newItemPage }
    );
    currentScreen = '0140';

    for (let j = 0; j < newItems.length; j++) {
      const itm = newItems[j];
      const rowIdx = String(j + 2).padStart(2, '0'); // (02), (03)...
      const formattedNewQty = formatSapQuantity(itm.quantity || '1', dcpfm);
      const newComp = String(itm.component || itm.material || '').trim();
      const newUnit = String(itm.unit || 'EA').trim().toUpperCase();
      const newCat = String(itm.itemCategory || 'L').trim().toUpperCase();

      bdc.push(
        { PROGRAM: cfg.screens.overview.altDynpro, DYNPRO: cfg.screens.overview.altDynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: `RC29P-POSTP(${rowIdx})` },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.enter },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: `RC29P-IDNRK(${rowIdx})`, FVAL: newComp },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: `RC29P-MENGE(${rowIdx})`, FVAL: formattedNewQty },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: `RC29P-MEINS(${rowIdx})`, FVAL: newUnit },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: `RC29P-POSTP(${rowIdx})`, FVAL: newCat }
      );

      // Screen 0130 confirmation
      bdc.push(
        { PROGRAM: cfg.screens.itemDetailGeneral.program, DYNPRO: cfg.screens.itemDetailGeneral.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailGeneral.okCodes.enter },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailGeneral.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.component, FVAL: newComp },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.quantity, FVAL: formattedNewQty },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailGeneral.fields.unit, FVAL: newUnit }
      );

      // Screen 0131 confirmation
      bdc.push(
        { PROGRAM: cfg.screens.itemDetailStatusText.program, DYNPRO: cfg.screens.itemDetailStatusText.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailStatusText.okCodes.enter },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailStatusText.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetailStatusText.fields.costingRelevancy, FVAL: 'X' }
      );
      currentScreen = '0140';
    }
  }

  // --- Step 6: Detail Changes (ZTEST_CS02_I, TEST_QTY_DETAIL, TEST_ALL) ---
  // Detail change is always the last operation before Save
  if (detailChanges.length > 0) {
    const itm = detailChanges[0];
    const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
    const padItem = String(itemNo).padStart(4, '0');
    const compInfo = getComponentInfo(padItem);
    const orig = itm.original || itm.orig || compInfo || null;

    const compMat = String(itm.component || itm.material || compInfo?.component || compInfo?.idnrk || compInfo?.material || '').trim().toUpperCase();
    const currentUnit = String(itm.unit !== undefined ? itm.unit : (itm.meins !== undefined ? itm.meins : '')).trim().toUpperCase();
    const origUnit = orig ? String(orig.unit || orig.meins || orig.baseUnit || '').trim().toUpperCase() : '';
    const compUnit = String(currentUnit || origUnit || compInfo?.unit || compInfo?.meins || 'KG').trim().toUpperCase();
    const formattedItemQty = formatSapQuantity(itm.quantity || compInfo?.quantity || '1', dcpfm);

    const currentText = String(itm.itemText !== undefined ? itm.itemText : (itm.description !== undefined ? itm.description : '')).trim();
    const origText = orig ? String(orig.itemText !== undefined ? orig.itemText : (orig.description !== undefined ? orig.description : '')).trim() : '';
    const textVal = String(currentText || origText).trim();

    const currentLgort = String(itm.storageLocation !== undefined ? itm.storageLocation : (itm.lgort !== undefined ? itm.lgort : '')).trim().toUpperCase();
    const origLgort = orig ? String(orig.storageLocation || orig.lgort || '').trim().toUpperCase() : '';
    const lgortVal = String(currentLgort || origLgort).trim();

    const sankaVal = compInfo?.sanka || compInfo?.costingRelevancy || 'X';
    const sankoVal = compInfo?.sanko || 'X';

    if (currentScreen === '0140') {
      // From 0140 back to 0150 via =FCPU (TEST_ALL)
      bdc.push(
        { PROGRAM: cfg.screens.overview.altDynpro, DYNPRO: cfg.screens.overview.altDynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: `RC29P-MENGE(${String(newItems.length + 1).padStart(2, '0')})` },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: '=FCPU' }
      );
      currentScreen = '0150';
    }

    if (currentScreen === '0708') {
      // Position from open 0708 (TEST_QTY_DETAIL)
      bdc.push(
        { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.position.okCodes.confirm },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.position.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.position.fields.itemNo, FVAL: padItem }
      );
    } else {
      appendPosition(padItem);
    }

    // Select row 01 and navigate to detail via =/CS
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.selectRow01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.itemDetail },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.selectRow01, FVAL: 'X' }
    );

    // Screen 2130 (first subpage): =PDAT
    bdc.push(
      { PROGRAM: cfg.screens.itemDetail2130.program, DYNPRO: cfg.screens.itemDetail2130.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetail2130.okCodes.page2 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetail2130.fields.cursorUnit },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.component, FVAL: compMat },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.quantity, FVAL: formattedItemQty },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.unit, FVAL: compUnit }
    );

    // Screen 2130 (second subpage): =FCBU (Save from detail screen as proven in TEST_ALL, TEST_QTY_DETAIL, ZTEST_CS02_I)
    bdc.push(
      { PROGRAM: cfg.screens.itemDetail2130.program, DYNPRO: cfg.screens.itemDetail2130.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetail2130.okCodes.save },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetail2130.fields.cursorLgort },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.text, FVAL: textVal },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.storageLocation, FVAL: lgortVal },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.costingFlag2, FVAL: sankaVal }
    );
    if (compInfo?.sanko) {
      bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.itemDetail2130.fields.costingFlag1, FVAL: sankoVal });
    }

    return bdc;
  }

  // --- Step 7: Final Save if no detail change ---
  if (currentScreen === '0708') {
    // Popup 0708 is still open from quantity changes: close it via /EABBR then =FCBU on 0150 (TEST_QTY_TWO, TEST_HDR_ITEMS, TEST_DEL_MIX)
    bdc.push(
      { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: '/EABBR' }
    );
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.save }
    );
  } else if (currentScreen === '0140') {
    // Currently on 0140 after additions: save directly via =FCBU on 0140 (TEST_ADD, TEST_ADD_MULTI, TEST_ADD_TWO, TEST_QTY_ADD)
    const lastRowIdx = String(newItems.length + 1).padStart(2, '0');
    bdc.push(
      { PROGRAM: cfg.screens.overview.altDynpro, DYNPRO: cfg.screens.overview.altDynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: `RC29P-MENGE(${lastRowIdx})` },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.save }
    );
  } else {
    // On 0150: save directly via =FCBU on 0150
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.save }
    );
  }

  return bdc;
}
