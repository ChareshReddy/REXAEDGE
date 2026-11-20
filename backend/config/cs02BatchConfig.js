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
  update: 'S',
  screens: {
    // 1. Initial Screen
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

    // 2. Overview Screen (Item List)
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
        position: '=SETP', // Position popup
        delete: '=FCDL',   // Delete selected row
        header: '=KALL',   // Header base data screen
        newItemPage: '=FCNP', // Append new item page
        save: '=FC_BU',    // Save BOM
        back: '/EBACK'     // Return
      }
    },

    // 3. Position Dialog Popup
    position: {
      program: 'SAPLCSDI',
      dynpro: '0700',
      subscreens: {
        positionBox: '0710POS_SETP'
      },
      fields: {
        cursor: 'RC29P-SELPO',
        itemNo: 'RC29P-SELPO'
      },
      okCodes: {
        confirm: '=CLWI',
        enter: '/00',
        cancel: '/EABBR'
      }
    },

    // 4. Item Detail: General Data Screen
    itemDetailGeneral: {
      program: 'SAPLCSDI',
      dynpro: '0130',
      subscreens: {
        generalBox: '0830POS_PHPT'
      },
      fields: {
        cursor: 'RC29P-AUSCH',
        component: 'RC29P-IDNRK',
        quantity: 'RC29P-MENGE',
        unit: 'RC29P-MEINS',
        fixedQuantity: 'RC29P-FMENG',
        componentScrap: 'RC29P-AUSCH'
      },
      okCodes: {
        enter: '/00',
        back: '/EBACK'
      }
    },

    // 5. Item Detail: Status / Long Text Screen
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

    // 6. Header Base Data Screen
    header: {
      program: 'SAPLCSDI',
      dynpro: '2110',
      subscreens: {
        header: '0802STLKOPF',
        subpage: '1110SUBPAGE'
      },
      fields: {
        cursor: 'RC29K-BMENG',
        baseQty: 'RC29K-BMENG',
        bomStatus: 'RC29K-STLST'
      },
      okCodes: {
        back: '/EBACK'
      }
    }
  },

  // 7. Expected Success Message
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

    // 2. Check for component mismatch on existing items
    if (type === 'CHANGE' || type === 'DELETE') {
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
 * Builds the complete BDC Data table for RFC_CALL_TRANSACTION_USING CS02.
 * Strictly follows the required execution order:
 *   1. Initial screen
 *   2. Header changes (via =KALL -> 2110 -> /EBACK)
 *   3. Item changes (with position =SETP -> 0700 -> =CLWI before each, then detail if needed)
 *   4. New items (via =FCNP -> 0140 row 02 -> Enter)
 *   5. Deletions (with position =SETP -> 0700 -> =CLWI before each, then select row 01 and =FCDL)
 *   6. Save (=FC_BU)
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
 * @param {object} [currentBom] - Current BOM loaded via read-table
 * @returns {Array<object>} Array of BDC steps { PROGRAM, DYNPRO, DYNBEGIN, FNAM, FVAL }
 */
export function buildCs02BdcData(params = {}, _currentBom = null) {
  const cfg = CS02_BATCH_CONFIG;
  const bdc = [];

  const cleanMat = String(params.material || '').trim().toUpperCase();
  const cleanPlt = String(params.plant || '').trim();
  const cleanUsg = String(params.bomUsage || '1').trim();
  const cleanAlt = String(params.alternativeBom || '1').trim();
  const cleanAltPadded = cleanAlt.padStart(2, '0');

  // Format validFrom date as DD.MM.YYYY if provided, else today
  let validFromStr;
  if (params.validFrom) {
    const raw = String(params.validFrom).trim();
    if (/^\d{8}$/.test(raw)) {
      validFromStr = `${raw.slice(6, 8)}.${raw.slice(4, 6)}.${raw.slice(0, 4)}`;
    } else if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const parts = raw.split('-');
      validFromStr = `${parts[2].slice(0, 2)}.${parts[1]}.${parts[0]}`;
    } else {
      validFromStr = raw;
    }
  } else {
    const d = new Date();
    validFromStr = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  }

  // --- Step 1: Initial Screen (SAPLCSDI 0100) ---
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
  const itemChanges = rawItems.filter((i) => (i.changeType || '').toUpperCase() === 'CHANGE');
  const newItems = rawItems.filter((i) => (i.changeType || '').toUpperCase() === 'ADD');
  const deletions = rawItems.filter((i) => (i.changeType || '').toUpperCase() === 'DELETE');

  // --- Step 2: Header Changes ---
  if (headerChanges) {
    // Open Header Screen from Overview
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.header }
    );

    // Header Base Data Screen (SAPLCSDI 2110)
    bdc.push(
      { PROGRAM: cfg.screens.header.program, DYNPRO: cfg.screens.header.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.header.fields.cursor },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.header.okCodes.back }
    );

    if (headerChanges.baseQty !== undefined && headerChanges.baseQty !== null && String(headerChanges.baseQty).trim() !== '') {
      bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.baseQty, FVAL: String(headerChanges.baseQty).trim() });
    }
    if (headerChanges.bomStatus !== undefined && headerChanges.bomStatus !== null && String(headerChanges.bomStatus).trim() !== '') {
      bdc.push({ PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.header.fields.bomStatus, FVAL: String(headerChanges.bomStatus).trim() });
    }
  }

  // Helper to append a Position dialog sequence
  function appendPosition(itemNoStr) {
    const padItem = String(itemNoStr || '').padStart(4, '0');
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.position }
    );
    bdc.push(
      { PROGRAM: cfg.screens.position.program, DYNPRO: cfg.screens.position.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.position.fields.cursor },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.position.okCodes.confirm },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.position.fields.itemNo, FVAL: padItem }
    );
  }

  // --- Step 3: Item Changes ---
  for (const itm of itemChanges) {
    const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
    // Re-position before EVERY item change
    appendPosition(itemNo);

    const hasDetailFields = Boolean(
      itm.fixedQuantity !== undefined ||
      itm.componentScrap !== undefined ||
      itm.scrap !== undefined ||
      itm.itemText !== undefined ||
      itm.description !== undefined
    );

    // Overview screen: modify quantity at row 01
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.enter },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.quantity01, FVAL: String(itm.quantity || '1').trim() }
    );

    if (hasDetailFields) {
      // Screen 0130: General Data (Scrap & Fixed Quantity)
      bdc.push(
        { PROGRAM: cfg.screens.itemDetailGeneral.program, DYNPRO: cfg.screens.itemDetailGeneral.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailGeneral.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailGeneral.okCodes.enter }
      );

      if (itm.fixedQuantity !== undefined) {
        bdc.push({
          PROGRAM: '',
          DYNPRO: '',
          DYNBEGIN: '',
          FNAM: cfg.screens.itemDetailGeneral.fields.fixedQuantity,
          FVAL: itm.fixedQuantity ? 'X' : ' '
        });
      }
      const scrapVal = itm.componentScrap !== undefined ? itm.componentScrap : itm.scrap;
      if (scrapVal !== undefined && scrapVal !== null && String(scrapVal).trim() !== '') {
        bdc.push({
          PROGRAM: '',
          DYNPRO: '',
          DYNBEGIN: '',
          FNAM: cfg.screens.itemDetailGeneral.fields.componentScrap,
          FVAL: String(scrapVal).trim()
        });
      }

      // Screen 0131: Status / Long Text Screen
      bdc.push(
        { PROGRAM: cfg.screens.itemDetailStatusText.program, DYNPRO: cfg.screens.itemDetailStatusText.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.itemDetailStatusText.fields.cursor },
        { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailStatusText.okCodes.back }
      );

      const txt = itm.itemText !== undefined ? itm.itemText : itm.description;
      if (txt !== undefined && txt !== null && String(txt).trim() !== '') {
        bdc.push({
          PROGRAM: '',
          DYNPRO: '',
          DYNBEGIN: '',
          FNAM: cfg.screens.itemDetailStatusText.fields.itemText1,
          FVAL: String(txt).trim()
        });
      }
    }
  }

  // --- Step 4: New Items (ADD) ---
  for (const itm of newItems) {
    // Navigate to new item page
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.newItemPage }
    );

    // On new item page (SAPLCSDI 0140), fill line (02) as recorded
    bdc.push(
      { PROGRAM: cfg.screens.overview.altDynpro, DYNPRO: cfg.screens.overview.altDynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.unit02 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.enter },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.category02, FVAL: String(itm.itemCategory || 'L').trim().toUpperCase() },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.component02, FVAL: String(itm.component || itm.material || '').trim() },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.quantity02, FVAL: String(itm.quantity || '1').trim() },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.unit02, FVAL: String(itm.unit || 'EA').trim().toUpperCase() }
    );

    // Enter automatically steps through 0130 and 0131 in recording, return with /EBACK
    bdc.push(
      { PROGRAM: cfg.screens.itemDetailGeneral.program, DYNPRO: cfg.screens.itemDetailGeneral.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailGeneral.okCodes.enter },
      { PROGRAM: cfg.screens.itemDetailStatusText.program, DYNPRO: cfg.screens.itemDetailStatusText.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.itemDetailStatusText.okCodes.back }
    );
  }

  // --- Step 5: Deletions (DELETE) ---
  for (const itm of deletions) {
    const itemNo = itm.item || itm.itemNo || itm.posnr || '0010';
    // Re-position before EVERY deletion
    appendPosition(itemNo);

    // Overview screen: Select row 1 and execute Delete (=FCDL)
    bdc.push(
      { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.delete },
      { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: cfg.screens.overview.fields.selectRow01, FVAL: 'X' }
    );
  }

  // --- Step 6: Save Transaction (=FC_BU) ---
  bdc.push(
    { PROGRAM: cfg.screens.overview.program, DYNPRO: cfg.screens.overview.dynpro, DYNBEGIN: 'X', FNAM: '', FVAL: '' },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_CURSOR', FVAL: cfg.screens.overview.fields.quantity01 },
    { PROGRAM: '', DYNPRO: '', DYNBEGIN: '', FNAM: 'BDC_OKCODE', FVAL: cfg.screens.overview.okCodes.save }
  );

  return bdc;
}
