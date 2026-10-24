import fs from 'fs';

// ============================================================================
// 1. UPDATE sapRfcClient.js
// ============================================================================
let rfcCode = fs.readFileSync('services/sapRfcClient.js', 'utf8');

// A. cleanAlt in rfcReadBom
rfcCode = rfcCode.replace(
  "const cleanAlt = String(alternativeBom || '1').trim();",
  "const cleanAlt = alternativeBom !== undefined && alternativeBom !== null ? String(alternativeBom).trim() : '';"
);
rfcCode = rfcCode.replace(
  "alternativeBom: String(alternativeBom || '1').trim(),",
  "alternativeBom: String(alternativeBom || '').trim(),"
);

// B. Mock mode handling in rfcReadBom
const oldMockRfc = `  // Mock mode handling
  if (process.env.USE_MOCK_SAP === 'true') {
    const found = activeMockBoms.find(
      (b) =>
        (String(b.material).toUpperCase() === cleanMat ||
          toSapMatnr(b.material) === sapMat ||
          formatMaterialNumber(b.material) === formatMaterialNumber(cleanMat)) &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg
    );

    if (!found) {
      return {
        success: false,
        bomExists: false,
        errorCode: 'BOM_NOT_FOUND',
        message: \`BOM does not exist for material \${cleanMat} in plant \${cleanPlt}\`,
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        componentCount: 0,
        components: []
      };
    }

    const comps = found.components || [];
    return {
      success: true,
      bomExists: true,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: cleanAlt,
      componentCount: comps.length,
      components: comps.map((c, idx) => ({
        item: c.item || String((idx + 1) * 10).padStart(4, '0'),
        component: c.component || c.material || '',
        description: c.description || '',
        quantity: c.quantity || 1,
        unit: c.unit || 'EA',
        itemCategory: c.itemCategory || 'L'
      })),
      header: {
        description: found.description || '',
        validFrom: found.validFrom || ''
      },
      message: \`BOM retrieved successfully (\${comps.length} components)\`
    };
  }`;

const newMockRfc = `  // Mock mode handling
  if (process.env.USE_MOCK_SAP === 'true') {
    const matchingUsage = activeMockBoms.filter(
      (b) =>
        (String(b.material).toUpperCase() === cleanMat ||
          toSapMatnr(b.material) === sapMat ||
          formatMaterialNumber(b.material) === formatMaterialNumber(cleanMat)) &&
        String(b.plant) === cleanPlt &&
        String(b.bomUsage || '1') === cleanUsg
    );

    if (matchingUsage.length === 0) {
      return {
        success: false,
        bomExists: false,
        errorCode: 'BOM_NOT_FOUND',
        message: \`BOM does not exist for material \${cleanMat} in plant \${cleanPlt}\`,
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        componentCount: 0,
        components: []
      };
    }

    const availableAlternatives = [...new Set(matchingUsage.map((b) => String(b.alternativeBom || '01')))];

    let found = null;
    if (cleanAlt) {
      const altPad = cleanAlt.padStart(2, '0');
      found = matchingUsage.find(
        (b) =>
          String(b.alternativeBom || '1').padStart(2, '0') === altPad ||
          parseInt(b.alternativeBom || '1', 10) === parseInt(cleanAlt, 10)
      );
      if (!found) {
        return {
          success: true,
          bomExists: false,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_NOT_FOUND',
          message: \`Alternative BOM \${cleanAlt} does not exist for material \${cleanMat} in plant \${cleanPlt}. Available alternatives: \${availableAlternatives.join(', ')}\`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: cleanAlt,
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    } else {
      // Blank alternative:
      const alt01 = matchingUsage.find((b) => String(b.alternativeBom || '1').padStart(2, '0') === '01' || parseInt(b.alternativeBom || '1', 10) === 1);
      if (alt01) {
        found = alt01;
      } else if (availableAlternatives.length === 1) {
        found = matchingUsage[0];
      } else {
        return {
          success: false,
          bomExists: true,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_SELECTION_REQUIRED',
          message: \`Alternative BOM was not specified and alternative 01 does not exist for material \${cleanMat} in plant \${cleanPlt}. Available alternatives: \${availableAlternatives.join(', ')}. Please specify an alternative.\`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: '',
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    }

    const comps = found.components || [];
    const resolvedAlt = found.alternativeBom ? String(found.alternativeBom).padStart(2, '0') : (cleanAlt ? cleanAlt.padStart(2, '0') : '01');
    const hasNoActiveComponents = comps.length === 0;

    return {
      success: true,
      bomExists: true,
      hasActiveComponents: !hasNoActiveComponents,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: resolvedAlt,
      allAlternatives: availableAlternatives,
      availableAlternatives,
      componentCount: comps.length,
      components: comps.map((c, idx) => ({
        item: c.item || String((idx + 1) * 10).padStart(4, '0'),
        component: c.component || c.material || '',
        description: c.description || '',
        quantity: c.quantity || 1,
        unit: c.unit || 'EA',
        itemCategory: c.itemCategory || 'L'
      })),
      header: {
        description: found.description || '',
        validFrom: found.validFrom || ''
      },
      message: hasNoActiveComponents ? 'BOM has no active components.' : \`BOM retrieved successfully (\${comps.length} components)\`
    };
  }`;

if (rfcCode.includes(oldMockRfc)) {
  rfcCode = rfcCode.replace(oldMockRfc, newMockRfc);
} else {
  console.log('oldMockRfc not found with exact CRLF/LF, checking normalized...');
  const normOld = oldMockRfc.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newMockRfc.replace(/\r\n/g, '\n'));
  }
}

// C. Live MAST alternative matching and STAS / STPO queries in rfcReadBom
const oldMastLive = `    // Filter by usage if rows exist with matching usage, otherwise keep all
    const matchingUsageRows = allMastRows.filter((r) => r.stlan === cleanUsg);
    const mastRows = matchingUsageRows.length > 0 ? matchingUsageRows : allMastRows;
    const availableAlternatives = [...new Set(mastRows.map((r) => r.stlal))];

    // Find requested alternative
    const targetMast = mastRows.find(
      (r) =>
        r.stlal === cleanAlt.padStart(2, '0') ||
        parseInt(r.stlal, 10) === parseInt(cleanAlt, 10)
    );

    if (!targetMast && cleanAlt) {
      return {
        success: true,
        bomExists: false,
        alternativeExists: false,
        errorCode: 'ALTERNATIVE_NOT_FOUND',
        message: \`Alternative BOM \${cleanAlt} does not exist for material \${cleanMat} in plant \${cleanPlt}. Available alternatives: \${availableAlternatives.join(', ')}\`,
        material: cleanMat,
        plant: cleanPlt,
        bomUsage: cleanUsg,
        alternativeBom: cleanAlt,
        allAlternatives: availableAlternatives,
        availableAlternatives,
        componentCount: 0,
        components: []
      };
    }

    const activeMast = targetMast || mastRows[0];
    const stlnr = activeMast.stlnr;
    const stlal = activeMast.stlal;`;

const newMastLive = `    // Filter by usage if rows exist with matching usage, otherwise keep all
    const matchingUsageRows = allMastRows.filter((r) => r.stlan === cleanUsg);
    const mastRows = matchingUsageRows.length > 0 ? matchingUsageRows : allMastRows;
    const availableAlternatives = [...new Set(mastRows.map((r) => r.stlal))];

    let targetMast = null;
    if (cleanAlt) {
      targetMast = mastRows.find(
        (r) =>
          r.stlal === cleanAlt.padStart(2, '0') ||
          parseInt(r.stlal, 10) === parseInt(cleanAlt, 10)
      );

      if (!targetMast) {
        return {
          success: true,
          bomExists: false,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_NOT_FOUND',
          message: \`Alternative BOM \${cleanAlt} does not exist for material \${cleanMat} in plant \${cleanPlt}. Available alternatives: \${availableAlternatives.join(', ')}\`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: cleanAlt,
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    } else {
      // Blank alternative:
      const alt01 = mastRows.find((r) => r.stlal === '01' || parseInt(r.stlal, 10) === 1);
      if (alt01) {
        targetMast = alt01;
      } else if (availableAlternatives.length === 1) {
        targetMast = mastRows[0];
      } else {
        return {
          success: false,
          bomExists: true,
          alternativeExists: false,
          errorCode: 'ALTERNATIVE_SELECTION_REQUIRED',
          message: \`Alternative BOM was not specified and alternative 01 does not exist for material \${cleanMat} in plant \${cleanPlt}. Available alternatives: \${availableAlternatives.join(', ')}. Please specify an alternative.\`,
          material: cleanMat,
          plant: cleanPlt,
          bomUsage: cleanUsg,
          alternativeBom: '',
          allAlternatives: availableAlternatives,
          availableAlternatives,
          componentCount: 0,
          components: []
        };
      }
    }

    const activeMast = targetMast;
    const stlnr = activeMast.stlnr;
    const stlal = activeMast.stlal;`;

if (rfcCode.includes(oldMastLive)) {
  rfcCode = rfcCode.replace(oldMastLive, newMastLive);
} else {
  const normOld = oldMastLive.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newMastLive.replace(/\r\n/g, '\n'));
  }
}

// D. STAS and STPO queries and active-node filtering in rfcReadBom
const oldStasStpoBlock = `    // 2. Query STAS to find item nodes active for this alternative
    const stasRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STAS',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: \`STLNR = '\${stlnr}' AND STLAL = '\${stlal}'\` }],
      FIELDS: [{ FIELDNAME: 'STLKN' }],
      DATA: []
    });

    const activeItemNodes = new Set((stasRes.DATA || []).map((r) => r.WA.split('|')[0]?.trim()));

    // 3. Query STPO for components
    const stpoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STPO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: \`STLNR = '\${stlnr}'\` }],
      FIELDS: [
        { FIELDNAME: 'STLKN' },
        { FIELDNAME: 'POSNR' },
        { FIELDNAME: 'POSTP' },
        { FIELDNAME: 'IDNRK' },
        { FIELDNAME: 'MENGE' },
        { FIELDNAME: 'MEINS' },
        { FIELDNAME: 'POTX1' }
      ],
      DATA: []
    });

    const fieldNames = (stpoRes.FIELDS || []).map((f) => f.FIELDNAME);
    const normalizedComps = [];

    for (const row of (stpoRes.DATA || [])) {
      const p = row.WA.split('|').map((s) => s?.trim());
      const rowObj = {};
      fieldNames.forEach((fname, idx) => {
        rowObj[fname] = p[idx] || '';
      });

      if (activeItemNodes.size > 0 && !activeItemNodes.has(rowObj.STLKN)) {
        continue;
      }

      normalizedComps.push({
        item: rowObj.POSNR || String((normalizedComps.length + 1) * 10).padStart(4, '0'),
        itemCategory: rowObj.POSTP || 'L',
        component: rowObj.IDNRK || '',
        quantity: parseFloat(rowObj.MENGE) || 1,
        unit: rowObj.MEINS || 'EA',
        description: rowObj.POTX1 || ''
      });
    }`;

const newStasStpoBlock = `    // 2. Query STAS to find item nodes active for this alternative
    const stasRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STAS',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: \`STLTY = 'M' AND STLNR = '\${stlnr}' AND STLAL = '\${stlal}' AND LKENZ = ''\` }],
      FIELDS: [{ FIELDNAME: 'STLKN' }],
      DATA: []
    });

    const activeItemNodes = new Set((stasRes.DATA || []).map((r) => r.WA.split('|')[0]?.trim()).filter(Boolean));

    // 3. Query STPO for components
    const stpoRes = await client.call('RFC_READ_TABLE', {
      QUERY_TABLE: 'STPO',
      DELIMITER: '|',
      OPTIONS: [{ TEXT: \`STLTY = 'M' AND STLNR = '\${stlnr}' AND LKENZ = ''\` }],
      FIELDS: [
        { FIELDNAME: 'STLKN' },
        { FIELDNAME: 'POSNR' },
        { FIELDNAME: 'POSTP' },
        { FIELDNAME: 'IDNRK' },
        { FIELDNAME: 'MENGE' },
        { FIELDNAME: 'MEINS' },
        { FIELDNAME: 'POTX1' }
      ],
      DATA: []
    });

    const fieldNames = (stpoRes.FIELDS || []).map((f) => f.FIELDNAME);
    const normalizedComps = [];

    if (activeItemNodes.size > 0) {
      for (const row of (stpoRes.DATA || [])) {
        const p = row.WA.split('|').map((s) => s?.trim());
        const rowObj = {};
        fieldNames.forEach((fname, idx) => {
          rowObj[fname] = p[idx] || '';
        });

        if (!activeItemNodes.has(rowObj.STLKN)) {
          continue;
        }

        normalizedComps.push({
          item: rowObj.POSNR || String((normalizedComps.length + 1) * 10).padStart(4, '0'),
          itemCategory: rowObj.POSTP || 'L',
          component: rowObj.IDNRK || '',
          quantity: parseFloat(rowObj.MENGE) || 1,
          unit: rowObj.MEINS || 'EA',
          description: rowObj.POTX1 || ''
        });
      }
    }`;

if (rfcCode.includes(oldStasStpoBlock)) {
  rfcCode = rfcCode.replace(oldStasStpoBlock, newStasStpoBlock);
} else {
  const normOld = oldStasStpoBlock.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newStasStpoBlock.replace(/\r\n/g, '\n'));
  }
}

// E. Update return message in rfcReadBom
const oldReturnBlock = `    return {
      success: true,
      bomExists: true,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: stlal,
      bomNumber: stlnr,
      baseQty,
      baseUnit: baseUnit || 'PAA',
      allAlternatives: [...new Set(mastRows.map((r) => r.stlal))],
      componentCount: normalizedComps.length,
      components: normalizedComps,`;

const newReturnBlock = `    const hasNoActiveComponents = normalizedComps.length === 0;

    return {
      success: true,
      bomExists: true,
      hasActiveComponents: !hasNoActiveComponents,
      material: cleanMat,
      plant: cleanPlt,
      bomUsage: cleanUsg,
      alternativeBom: stlal,
      bomNumber: stlnr,
      baseQty,
      baseUnit: baseUnit || 'PAA',
      allAlternatives: availableAlternatives,
      availableAlternatives,
      componentCount: normalizedComps.length,
      components: normalizedComps,
      message: hasNoActiveComponents ? 'BOM has no active components.' : undefined,`;

if (rfcCode.includes(oldReturnBlock)) {
  rfcCode = rfcCode.replace(oldReturnBlock, newReturnBlock);
} else {
  const normOld = oldReturnBlock.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newReturnBlock.replace(/\r\n/g, '\n'));
  }
}

// F. Update rfcValidateSourceBom: do not force alternativeBom || '1', and block 0 active components
const oldValSource = `  const readResult = await rfcReadBom({
    material: cleanMat,
    plant: cleanPlant,
    bomUsage,
    alternativeBom: alternativeBom || '1',
    server: params.server,
    client: params.client
  });`;

const newValSource = `  const cleanAltParam = alternativeBom !== undefined && alternativeBom !== null ? String(alternativeBom).trim() : '';
  const readResult = await rfcReadBom({
    material: cleanMat,
    plant: cleanPlant,
    bomUsage,
    alternativeBom: cleanAltParam,
    server: params.server,
    client: params.client
  });`;

if (rfcCode.includes(oldValSource)) {
  rfcCode = rfcCode.replace(oldValSource, newValSource);
} else {
  const normOld = oldValSource.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newValSource.replace(/\r\n/g, '\n'));
  }
}

// In rfcValidateSourceBom return:
const oldValReturn = `  return {
    success: true,
    materialExists: true,
    plantValid: true,
    bomExists: true,
    alternativeValid: true,
    availableAlternatives: readResult.availableAlternatives || [readResult.alternativeBom || '1'],
    componentCount: readResult.componentCount,
    components: readResult.components,
    message: \`Source BOM validated: \${readResult.componentCount} components found.\`
  };`;

const newValReturn = `  if (readResult.componentCount === 0) {
    return {
      success: false,
      materialExists: true,
      plantValid: true,
      bomExists: true,
      alternativeValid: true,
      alternativeBom: readResult.alternativeBom,
      availableAlternatives: readResult.availableAlternatives || [readResult.alternativeBom || '01'],
      componentCount: 0,
      components: [],
      errorCode: 'BOM_NO_ACTIVE_COMPONENTS',
      message: 'BOM has no active components.'
    };
  }

  return {
    success: true,
    materialExists: true,
    plantValid: true,
    bomExists: true,
    alternativeValid: true,
    alternativeBom: readResult.alternativeBom,
    availableAlternatives: readResult.availableAlternatives || [readResult.alternativeBom || '01'],
    componentCount: readResult.componentCount,
    components: readResult.components,
    message: \`Source BOM validated: \${readResult.componentCount} components found.\`
  };`;

if (rfcCode.includes(oldValReturn)) {
  rfcCode = rfcCode.replace(oldValReturn, newValReturn);
} else {
  const normOld = oldValReturn.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newValReturn.replace(/\r\n/g, '\n'));
  }
}

// G. Update fetchDirectBom in sapRfcClient.js
const oldFetchDirectAlt = `  const targetAltPad = cleanAlt ? String(cleanAlt).padStart(2, '0') : '01';
  let matched = mastRows.find((r) => r.stlan === cleanUsg && r.stlal === targetAltPad);
  if (!matched && cleanAlt) {
    matched = mastRows.find((r) => r.stlan === cleanUsg && parseInt(r.stlal, 10) === parseInt(cleanAlt, 10));
  }
  if (!matched) {
    matched = mastRows.find((r) => r.stlan === cleanUsg);
  }
  if (!matched) {
    matched = mastRows[0];
  }`;

const newFetchDirectAlt = `  const availableAlts = [...new Set(mastRows.filter((r) => r.stlan === cleanUsg).map((r) => r.stlal))];
  let matched = null;
  if (cleanAlt) {
    const targetAltPad = String(cleanAlt).padStart(2, '0');
    matched = mastRows.find((r) => r.stlan === cleanUsg && (r.stlal === targetAltPad || parseInt(r.stlal, 10) === parseInt(cleanAlt, 10)));
  } else {
    const alt01 = mastRows.find((r) => r.stlan === cleanUsg && (r.stlal === '01' || parseInt(r.stlal, 10) === 1));
    if (alt01) {
      matched = alt01;
    } else if (availableAlts.length === 1) {
      matched = mastRows.find((r) => r.stlan === cleanUsg);
    } else {
      return null;
    }
  }`;

if (rfcCode.includes(oldFetchDirectAlt)) {
  rfcCode = rfcCode.replace(oldFetchDirectAlt, newFetchDirectAlt);
} else {
  const normOld = oldFetchDirectAlt.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newFetchDirectAlt.replace(/\r\n/g, '\n'));
  }
}

// Update STAS and STPO in fetchDirectBom
rfcCode = rfcCode.replace(
  "OPTIONS: [{ TEXT: `STLNR = '${stlnr}' AND STLAL = '${stlal}'` }],",
  "OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${stlal}' AND LKENZ = ''` }],"
);
rfcCode = rfcCode.replace(
  "OPTIONS: [{ TEXT: `STLNR = '${stlnr}'` }],",
  "OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND LKENZ = ''` }],"
);

// In fetchDirectBom: strict activeItemNodes filtering
const oldFetchDirectComps = `    if (activeItemNodes.size > 0 && !activeItemNodes.has(rowObj.STLKN)) {
      continue;
    }

    rawComps.push({`;

const newFetchDirectComps = `    if (!activeItemNodes.has(rowObj.STLKN)) {
      continue;
    }

    rawComps.push({`;

rfcCode = rfcCode.replace(oldFetchDirectComps, newFetchDirectComps);

// H. In rfcValidateBulkCopy (around line 2655)
const oldBulkStas = `        // 3. Count components in STAS for this specific alternative
        const stasRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'STAS',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: \`STLNR = '\${altMatch.stlnr}' AND STLAL = '\${altMatch.stlal}'\` }],
          FIELDS: [{ FIELDNAME: 'STLKN' }],
          DATA: []
        });
        rowResult.componentCount = stasRes.DATA ? stasRes.DATA.length : 0;`;

const newBulkStas = `        // 3. Count components in STAS for this specific alternative
        const stasRes = await client.call('RFC_READ_TABLE', {
          QUERY_TABLE: 'STAS',
          DELIMITER: '|',
          OPTIONS: [{ TEXT: \`STLTY = 'M' AND STLNR = '\${altMatch.stlnr}' AND STLAL = '\${altMatch.stlal}' AND LKENZ = ''\` }],
          FIELDS: [{ FIELDNAME: 'STLKN' }],
          DATA: []
        });
        rowResult.componentCount = stasRes.DATA ? stasRes.DATA.length : 0;
        if (rowResult.componentCount === 0) {
          rowResult.status = 'INVALID';
          rowResult.message = 'BOM has no active components';
          results.push(rowResult);
          continue;
        }`;

if (rfcCode.includes(oldBulkStas)) {
  rfcCode = rfcCode.replace(oldBulkStas, newBulkStas);
} else {
  const normOld = oldBulkStas.replace(/\r\n/g, '\n');
  const normCode = rfcCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    rfcCode = normCode.replace(normOld, newBulkStas.replace(/\r\n/g, '\n'));
  }
}

fs.writeFileSync('services/sapRfcClient.js', rfcCode, 'utf8');
console.log('Successfully updated services/sapRfcClient.js');

// ============================================================================
// 2. UPDATE bomCreateEngine.js
// ============================================================================
let createEngineCode = fs.readFileSync('services/bomCreateEngine.js', 'utf8');

createEngineCode = createEngineCode.replace(
  "OPTIONS: [{ TEXT: `STLNR = '${stlnr}' AND STLAL = '${cleanAlt}'` }],",
  "OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND STLAL = '${cleanAlt}' AND LKENZ = ''` }],"
);
createEngineCode = createEngineCode.replace(
  "OPTIONS: [{ TEXT: `STLNR = '${stlnr}'` }],",
  "OPTIONS: [{ TEXT: `STLTY = 'M' AND STLNR = '${stlnr}' AND LKENZ = ''` }],"
);

const oldCreateFilter = `    let rawStpoRows = stpoRes.DATA || [];
    if (altStlknSet && altStlknSet.size > 0 && stpoFieldMap['STLKN'] !== undefined) {
      const stlknIdx = stpoFieldMap['STLKN'];
      rawStpoRows = rawStpoRows.filter((r) => {
        const p = r.WA.split('|');
        return altStlknSet.has(p[stlknIdx]?.trim());
      });
    }`;

const newCreateFilter = `    let rawStpoRows = [];
    if (altStlknSet && altStlknSet.size > 0 && stpoFieldMap['STLKN'] !== undefined) {
      const stlknIdx = stpoFieldMap['STLKN'];
      rawStpoRows = (stpoRes.DATA || []).filter((r) => {
        const p = r.WA.split('|');
        return altStlknSet.has(p[stlknIdx]?.trim());
      });
    }`;

if (createEngineCode.includes(oldCreateFilter)) {
  createEngineCode = createEngineCode.replace(oldCreateFilter, newCreateFilter);
} else {
  const normOld = oldCreateFilter.replace(/\r\n/g, '\n');
  const normCode = createEngineCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    createEngineCode = normCode.replace(normOld, newCreateFilter.replace(/\r\n/g, '\n'));
  }
}

fs.writeFileSync('services/bomCreateEngine.js', createEngineCode, 'utf8');
console.log('Successfully updated services/bomCreateEngine.js');

// ============================================================================
// 3. UPDATE sapGuiClient.js (block copying BOM with no active components)
// ============================================================================
let guiCode = fs.readFileSync('services/sapGuiClient.js', 'utf8');

const oldGuiSourceCheck = `  if (!sourceCheck.exists) {
    return {
      success: false,
      verified: false,
      code: 'SOURCE_BOM_NOT_FOUND',
      message: sourceCheck.message && sourceCheck.message.includes('Alternative')
        ? \`Cannot copy BOM: \${sourceCheck.message}\`
        : \`Cannot copy BOM: No BOM exists for material \${cleanSourceMat} in plant \${cleanSourcePlant} with BOM usage \${cleanSourceUsage}.\`
    };
  }`;

const newGuiSourceCheck = `  if (!sourceCheck.exists) {
    return {
      success: false,
      verified: false,
      code: 'SOURCE_BOM_NOT_FOUND',
      message: sourceCheck.message && sourceCheck.message.includes('Alternative')
        ? \`Cannot copy BOM: \${sourceCheck.message}\`
        : \`Cannot copy BOM: No BOM exists for material \${cleanSourceMat} in plant \${cleanSourcePlant} with BOM usage \${cleanSourceUsage}.\`
    };
  }

  if (!sourceCheck.components || sourceCheck.components.length === 0) {
    return {
      success: false,
      verified: false,
      code: 'BOM_NO_ACTIVE_COMPONENTS',
      message: 'Cannot copy BOM: BOM has no active components.'
    };
  }`;

if (guiCode.includes(oldGuiSourceCheck)) {
  guiCode = guiCode.replace(oldGuiSourceCheck, newGuiSourceCheck);
} else {
  const normOld = oldGuiSourceCheck.replace(/\r\n/g, '\n');
  const normCode = guiCode.replace(/\r\n/g, '\n');
  if (normCode.includes(normOld)) {
    guiCode = normCode.replace(normOld, newGuiSourceCheck.replace(/\r\n/g, '\n'));
  }
}

fs.writeFileSync('services/sapGuiClient.js', guiCode, 'utf8');
console.log('Successfully updated services/sapGuiClient.js');
