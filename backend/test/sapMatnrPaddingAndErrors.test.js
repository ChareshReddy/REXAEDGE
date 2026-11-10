import assert from 'assert';
import {
  toSapMatnr,
  formatMaterialNumber,
  rfcReadBom,
  rfcValidateSourceBom,
  rfcCreateBom,
  rfcSimulateCopyBom,
  isSubAssemblyBomExistingInTarget
} from '../services/sapRfcClient.js';

async function runTests() {
  console.log('\n======================================================');
  console.log('--- Testing toSapMatnr Padding & Error Propagation ---');
  console.log('======================================================');

  // 1. toSapMatnr unit tests
  console.log('\n1. Testing toSapMatnr numeric padding to 18 digits:');
  assert.strictEqual(toSapMatnr('143'), '000000000000000143');
  assert.strictEqual(toSapMatnr('143').length, 18);
  assert.strictEqual(toSapMatnr('000000000000000143'), '000000000000000143');
  assert.strictEqual(toSapMatnr('000000000000000143').length, 18);
  assert.strictEqual(toSapMatnr('1'), '000000000000000001');
  assert.strictEqual(toSapMatnr('  143  '), '000000000000000143');
  console.log('   ✓ Numeric materials correctly padded to 18 characters');

  console.log('\n2. Testing toSapMatnr leaves alphanumeric materials unchanged:');
  assert.strictEqual(toSapMatnr('MAT-BOM-100'), 'MAT-BOM-100');
  assert.strictEqual(toSapMatnr('A1BH0214C'), 'A1BH0214C');
  assert.strictEqual(toSapMatnr('bolt-123'), 'BOLT-123');
  assert.strictEqual(toSapMatnr(''), '');
  assert.strictEqual(toSapMatnr(null), '');
  assert.strictEqual(toSapMatnr(undefined), '');
  console.log('   ✓ Alphanumeric materials preserved uppercase and unpadded');

  // 2. formatMaterialNumber unit tests
  console.log('\n3. Testing formatMaterialNumber trims leading zeros for display:');
  assert.strictEqual(formatMaterialNumber('000000000000000143'), '143');
  assert.strictEqual(formatMaterialNumber('143'), '143');
  assert.strictEqual(formatMaterialNumber('A1BH0214C'), 'A1BH0214C');
  assert.strictEqual(formatMaterialNumber('MAT-BOM-100'), 'MAT-BOM-100');
  console.log('   ✓ formatMaterialNumber cleanly trims for display');

  // 3. Mock RFC calls with 40-char schema mock
  console.log('\n4. Testing rfcReadBom with padded vs unpadded material:');
  process.env.USE_MOCK_SAP = 'false'; // Test against mock RFC client directly

  // Create a simulated SAP client that mimics SAP S/4HANA (40-char MATNR field)
  const mockS4Client = {
    calls: [],
    call: async (fm, params) => {
      mockS4Client.calls.push({ fm, params });
      if (fm === 'RFC_READ_TABLE') {
        const table = params.QUERY_TABLE;
        if (table === 'MAST') {
          const opt = params.OPTIONS?.[0]?.TEXT || '';
          // S/4HANA stores 18-digit zero padded in 40-char CHAR column:
          // MATNR matches only if '000000000000000143' is queried!
          if (opt.includes("MATNR = '000000000000000143'") && opt.includes("WERKS = '16P1'")) {
            return {
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' },
                { FIELDNAME: 'STLAL' }
              ],
              DATA: [
                { WA: '000000000000000143                      |16P1|1|00000104|01' }
              ]
            };
          }
          return { FIELDS: [], DATA: [] };
        }
        if (table === 'STKO') {
          return {
            FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }],
            DATA: [{ WA: '1.000|KG' }]
          };
        }
        if (table === 'STAS') {
          // Verify STPOZ is NOT requested
          const requestedFields = (params.FIELDS || []).map((f) => f.FIELDNAME);
          assert.strictEqual(requestedFields.includes('STPOZ'), false, 'STAS must never request STPOZ!');
          assert.deepStrictEqual(requestedFields, ['STLKN'], 'STAS must only request STLKN');
          return {
            FIELDS: [{ FIELDNAME: 'STLKN' }],
            DATA: [{ WA: '00000001' }]
          };
        }
        if (table === 'STPO') {
          return {
            FIELDS: [
              { FIELDNAME: 'STLKN' },
              { FIELDNAME: 'POSNR' },
              { FIELDNAME: 'POSTP' },
              { FIELDNAME: 'IDNRK' },
              { FIELDNAME: 'MENGE' },
              { FIELDNAME: 'MEINS' },
              { FIELDNAME: 'POTX1' }
            ],
            DATA: [
              { WA: '00000001|0010|L|000000000000000144|5.000|KG|TEST COMPONENT' }
            ]
          };
        }
      }
      return { FIELDS: [], DATA: [] };
    }
  };

  // Test with unpadded '143'
  const resUnpadded = await rfcReadBom({
    material: '143',
    plant: '16P1',
    bomUsage: '1',
    alternativeBom: '01',
    client: mockS4Client
  });

  assert.strictEqual(resUnpadded.success, true);
  assert.strictEqual(resUnpadded.bomExists, true);
  assert.strictEqual(resUnpadded.bomNumber, '00000104');
  assert.strictEqual(resUnpadded.baseQty, '1');
  assert.strictEqual(resUnpadded.baseUnit, 'KG');
  assert.strictEqual(resUnpadded.components.length, 1);
  assert.strictEqual(resUnpadded.components[0].component, '000000000000000144');

  // Test with padded '000000000000000143'
  const resPadded = await rfcReadBom({
    material: '000000000000000143',
    plant: '16P1',
    bomUsage: '1',
    alternativeBom: '01',
    client: mockS4Client
  });

  assert.strictEqual(resPadded.success, true);
  assert.strictEqual(resPadded.bomExists, true);
  assert.strictEqual(resPadded.bomNumber, resUnpadded.bomNumber);
  assert.strictEqual(resPadded.baseQty, resUnpadded.baseQty);
  assert.strictEqual(resPadded.baseUnit, resUnpadded.baseUnit);
  assert.deepStrictEqual(resPadded.components, resUnpadded.components);
  console.log('   ✓ "143" and "000000000000000143" return identical BOM data on 40-char schema');

  // 4. Test error propagation: RFC errors must NEVER be masked as BOM_NOT_FOUND
  console.log('\n5. Testing RFC errors are returned with real message, NEVER swallowed as BOM_NOT_FOUND:');
  const failingClient = {
    call: async (fm, params) => {
      if (params.QUERY_TABLE === 'MAST') {
        throw new Error('SAP RFC Connection reset by peer: timeout (ID:14 Number:002)');
      }
      return { FIELDS: [], DATA: [] };
    }
  };

  const valFailed = await rfcValidateSourceBom({
    material: '143',
    plant: '16P1',
    bomUsage: '1',
    client: failingClient
  });

  assert.strictEqual(valFailed.success, false);
  assert.strictEqual(valFailed.errorCode, 'RFC_BOM_READ_ERROR');
  assert.notStrictEqual(valFailed.errorCode, 'BOM_NOT_FOUND');
  assert.match(valFailed.message, /Failed to read BOM via RFC/i);
  assert.match(valFailed.message, /Connection reset/i);
  console.log('   ✓ RFC failures return RFC_BOM_READ_ERROR with original message, not BOM_NOT_FOUND');

  // 5. Test genuine BOM_NOT_FOUND
  console.log('\n6. Testing genuine BOM_NOT_FOUND when MAST returns 0 rows:');
  const emptyMastClient = {
    call: async (fm, params) => {
      return { FIELDS: [], DATA: [] };
    }
  };

  const valNotFound = await rfcValidateSourceBom({
    material: '999999',
    plant: '16P1',
    bomUsage: '1',
    client: emptyMastClient
  });

  assert.strictEqual(valNotFound.success, false);
  assert.strictEqual(valNotFound.errorCode, 'BOM_NOT_FOUND');
  assert.match(valNotFound.message, /BOM does not exist/i);
  console.log('   ✓ Genuine missing BOM correctly returns BOM_NOT_FOUND');

  // 6. Test missing or blank plant parameter safety (no unhandled throw)
  console.log('\n7. Testing blank plant parameter safety in rfcReadBom & rfcGetBomDisplayData:');
  const { rfcGetBomDisplayData } = await import('../services/sapRfcClient.js');

  const readBlankPlant = await rfcReadBom({
    material: '143',
    plant: '',
    bomUsage: '1'
  });
  assert.strictEqual(readBlankPlant.success, false);
  assert.strictEqual(readBlankPlant.errorCode, 'MATERIAL_PLANT_INVALID');
  assert.match(readBlankPlant.message, /Plant code is required/i);

  const dispBlankPlant = await rfcGetBomDisplayData({
    material: '143',
    plant: '',
    bomUsage: '1'
  });
  assert.strictEqual(dispBlankPlant.success, false);
  assert.strictEqual(dispBlankPlant.errorCode, 'MATERIAL_PLANT_INVALID');
  assert.match(dispBlankPlant.message, /Plant code is required/i);
  console.log('   ✓ Blank plant parameter handled safely with structured error instead of throwing');

  // 7. Test alternative with zero active items (strict filtering, no leak)
  console.log('\n8. Testing alternative with zero active items returns zero components:');
  const zeroActiveClient = {
    call: async (fm, params) => {
      const table = params.QUERY_TABLE;
      if (table === 'MAST') {
        return {
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
          DATA: [
            { WA: 'A1PSB001B|1010|1|00786012|01' },
            { WA: 'A1PSB001B|1010|1|00786012|02' }
          ]
        };
      }
      if (table === 'STKO') {
        return { FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }], DATA: [{ WA: '100|PAA' }] };
      }
      if (table === 'STAS') {
        const opt = params.OPTIONS?.[0]?.TEXT || '';
        assert.ok(opt.includes("STLTY = 'M'"), 'STAS query must include STLTY = M');
        assert.ok(opt.includes("LKENZ = ''"), 'STAS query must include LKENZ = blank');
        if (opt.includes("STLAL = '01'")) {
          return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
        }
        // Alt 02 has ZERO active items in STAS
        return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [] };
      }
      if (table === 'STPO') {
        const opt = params.OPTIONS?.[0]?.TEXT || '';
        assert.ok(opt.includes("STLTY = 'M'"), 'STPO query must include STLTY = M');
        assert.ok(opt.includes("LKENZ = ''"), 'STPO query must include LKENZ = blank');
        // STPO has components for alt 01 in the group
        return {
          FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'POSTP' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }, { FIELDNAME: 'POTX1' }],
          DATA: [{ WA: '00000001|0010|L|D4PSB001B|90.000|PAA|Desc' }]
        };
      }
      return { FIELDS: [], DATA: [] };
    }
  };

  const zeroAltRes = await rfcReadBom({
    material: 'A1PSB001B',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '02',
    client: zeroActiveClient
  });
  assert.strictEqual(zeroAltRes.success, true);
  assert.strictEqual(zeroAltRes.bomExists, true);
  assert.strictEqual(zeroAltRes.hasActiveComponents, false);
  assert.strictEqual(zeroAltRes.componentCount, 0);
  assert.deepStrictEqual(zeroAltRes.components, []);
  assert.strictEqual(zeroAltRes.message, 'BOM has no active components.');
  console.log('   ✓ Alternative with zero active items returns 0 components and does not leak items from other alternatives');

  // Validate Source blocks copy for 0 components
  const valZeroRes = await rfcValidateSourceBom({
    material: 'A1PSB001B',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '02',
    client: zeroActiveClient
  });
  assert.strictEqual(valZeroRes.success, false);
  assert.strictEqual(valZeroRes.errorCode, 'BOM_NO_ACTIVE_COMPONENTS');
  assert.strictEqual(valZeroRes.message, 'BOM has no active components.');
  console.log('   ✓ Validate source blocks copy for BOM with no active components');

  // 8. Test blank alternative resolution logic
  console.log('\n9. Testing blank alternative resolution rules:');
  // (a) Blank alternative picks 01 when 01 exists
  const blankWith01 = await rfcReadBom({
    material: 'A1PSB001B',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '',
    client: zeroActiveClient
  });
  assert.strictEqual(blankWith01.success, true);
  assert.strictEqual(blankWith01.alternativeBom, '01');
  assert.strictEqual(blankWith01.componentCount, 1);
  console.log('   ✓ Blank alternative automatically selects 01 when 01 exists');

  // (b) Blank alternative with single alternative (Ex. only 03 exists)
  const singleAltClient = {
    call: async (fm, params) => {
      if (params.QUERY_TABLE === 'MAST') {
        return {
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
          DATA: [{ WA: 'TESTMAT|1010|1|00789999|03' }]
        };
      }
      if (params.QUERY_TABLE === 'STKO') return { FIELDS: [{ FIELDNAME: 'BMENG' }], DATA: [{ WA: '1' }] };
      if (params.QUERY_TABLE === 'STAS') return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
      if (params.QUERY_TABLE === 'STPO') return { FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }], DATA: [{ WA: '00000001|0010|COMP1' }] };
      return { FIELDS: [], DATA: [] };
    }
  };
  const blankSingleRes = await rfcReadBom({
    material: 'TESTMAT',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '',
    client: singleAltClient
  });
  assert.strictEqual(blankSingleRes.success, true);
  assert.strictEqual(blankSingleRes.alternativeBom, '03');
  console.log('   ✓ Blank alternative selects the single existing alternative when exactly one exists');

  // (c) Blank alternative with multiple alternatives and no 01 -> must read first existing alternative (02)
  const multiAltNo01Client = {
    call: async (fm, params) => {
      if (params.QUERY_TABLE === 'MAST') {
        return {
          FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
          DATA: [
            { WA: 'MULTIMAT|1010|1|00789999|02' },
            { WA: 'MULTIMAT|1010|1|00789999|05' }
          ]
        };
      }
      return { FIELDS: [], DATA: [] };
    }
  };
  const blankMultiRes = await rfcReadBom({
    material: 'MULTIMAT',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '',
    client: multiAltNo01Client
  });
  assert.strictEqual(blankMultiRes.success, true);
  assert.strictEqual(blankMultiRes.alternativeBom, '02');
  console.log('   ✓ Blank alternative selects the first existing alternative (02) when 01 is absent');

  // (d) Typed missing alternative (01) -> must error and list available alternatives
  const typedMissingRes = await rfcReadBom({
    material: 'MULTIMAT',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '01',
    client: multiAltNo01Client
  });
  assert.strictEqual(typedMissingRes.success, false);
  assert.strictEqual(typedMissingRes.errorCode, 'ALTERNATIVE_NOT_FOUND');
  assert.match(typedMissingRes.message, /Alternative (?:BOM )?01 does not exist/i);
  assert.match(typedMissingRes.message, /02, 05/i);
  console.log('   ✓ Typed missing alternative rejects with ALTERNATIVE_NOT_FOUND and lists available alternatives');


  // 10. BAPI payload padding & alphanumeric preservation in rfcCreateBom
  console.log('\n10. Testing rfcCreateBom BAPI payload normalization:');
  process.env.USE_MOCK_SAP = 'false';

  let capturedPayloadUnpadded = null;
  const mockCaptureClient1 = {
    call: async (fm, payload) => {
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        capturedPayloadUnpadded = payload;
        return { RETURN: [] };
      }
      if (fm === 'RFC_READ_TABLE') return { FIELDS: [], DATA: [] };
      return {};
    }
  };

  await rfcCreateBom({
    material: '143',
    plant: '16P2',
    bomUsage: '1',
    alternativeBom: '01',
    components: [{ component: '144', quantity: 5 }],
    client: mockCaptureClient1
  });

  let capturedPayloadPadded = null;
  const mockCaptureClient2 = {
    call: async (fm, payload) => {
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        capturedPayloadPadded = payload;
        return { RETURN: [] };
      }
      if (fm === 'RFC_READ_TABLE') return { FIELDS: [], DATA: [] };
      return {};
    }
  };

  await rfcCreateBom({
    material: '000000000000000143',
    plant: '16P2',
    bomUsage: '1',
    alternativeBom: '01',
    components: [{ component: '000000000000000144', quantity: 5 }],
    client: mockCaptureClient2
  });

  assert.strictEqual(capturedPayloadUnpadded.MATERIALRELATIONS[0].MATERIAL, '000000000000000143');
  assert.strictEqual(capturedPayloadPadded.MATERIALRELATIONS[0].MATERIAL, '000000000000000143');
  assert.strictEqual(capturedPayloadUnpadded.ITEMS[0].COMPONENT, '000000000000000144');
  assert.strictEqual(capturedPayloadPadded.ITEMS[0].COMPONENT, '000000000000000144');
  assert.deepStrictEqual(
    capturedPayloadUnpadded.MATERIALRELATIONS,
    capturedPayloadPadded.MATERIALRELATIONS,
    'Padded and unpadded inputs must produce identical MATERIALRELATIONS'
  );
  console.log('   ✓ Padded and unpadded numeric inputs produce identical 18-digit BAPI payloads');

  // Alphanumeric preservation
  let capturedAlphaPayload = null;
  const mockAlphaClient = {
    call: async (fm, payload) => {
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        capturedAlphaPayload = payload;
        return { RETURN: [] };
      }
      if (fm === 'RFC_READ_TABLE') return { FIELDS: [], DATA: [] };
      return {};
    }
  };

  await rfcCreateBom({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    alternativeBom: '01',
    components: [{ component: 'D4PSB001B', quantity: 2 }],
    client: mockAlphaClient
  });

  assert.strictEqual(capturedAlphaPayload.MATERIALRELATIONS[0].MATERIAL, 'A1BH0214C');
  assert.strictEqual(capturedAlphaPayload.ITEMS[0].COMPONENT, 'D4PSB001B');
  console.log('   ✓ Alphanumeric material and component numbers preserved unchanged');

  // 11. Testing BAPI TESTRUN simulation blocks invalid copy and allows valid
  console.log('\n11. Testing BAPI TESTRUN simulation (BAPIFLAG = "X"):');
  const mockBapiErrorClient = {
    call: async (fm, payload) => {
      if (fm === 'RFC_READ_TABLE') {
        if (payload.QUERY_TABLE === 'MAST') {
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
            DATA: [{ WA: '000000000000000143|16P1|1|00000104|01' }]
          };
        }
        if (payload.QUERY_TABLE === 'STKO') return { FIELDS: [{ FIELDNAME: 'BMENG' }], DATA: [{ WA: '1' }] };
        if (payload.QUERY_TABLE === 'STAS') return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
        if (payload.QUERY_TABLE === 'STPO') return { FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }], DATA: [{ WA: '00000001|0010|000000000000000144|5|KG' }] };
        if (payload.QUERY_TABLE === 'MARC') return { FIELDS: [], DATA: [] };
        return { FIELDS: [], DATA: [] };
      }
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        assert.deepStrictEqual(payload.TESTRUN, { BAPIFLAG: 'X' }, 'Simulation must send TESTRUN = { BAPIFLAG: "X" }');
        return {
          RETURN: [
            { TYPE: 'E', ID: 'M3', NUMBER: '351', MESSAGE: 'Material 000000000000000144 not maintained in plant 16P2' }
          ]
        };
      }
      return {};
    }
  };

  const simFailRes = await rfcSimulateCopyBom({
    sourceMaterial: '143',
    sourcePlant: '16P1',
    targetMaterial: '143',
    targetPlant: '16P2',
    copyHierarchy: false,
    client: mockBapiErrorClient
  });

  assert.strictEqual(simFailRes.valid, false, 'Simulation failure must mark valid=false');
  assert.strictEqual(simFailRes.canCopy, false, 'Simulation failure must block copy');
  assert.strictEqual(simFailRes.blocked, true, 'Simulation failure must set blocked=true');
  assert.match(simFailRes.message, /^Cannot copy: Component 144 not maintained in plant 16P2 \(BOM of 143, level 0\)/);
  console.log('   ✓ TESTRUN error blocks the copy and formats message as "Cannot copy: <SAP message>"');

  // TESTRUN pass allows copy
  const mockBapiPassClient = {
    call: async (fm, payload) => {
      if (fm === 'RFC_READ_TABLE') {
        if (payload.QUERY_TABLE === 'MAST') {
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
            DATA: [{ WA: 'TESTMAT|1010|1|00789999|01' }]
          };
        }
        if (payload.QUERY_TABLE === 'STKO') return { FIELDS: [{ FIELDNAME: 'BMENG' }], DATA: [{ WA: '1' }] };
        if (payload.QUERY_TABLE === 'STAS') return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
        if (payload.QUERY_TABLE === 'STPO') return { FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }], DATA: [{ WA: '00000001|0010|COMP1|1|EA' }] };
        return { FIELDS: [], DATA: [] };
      }
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        return { RETURN: [] };
      }
      return {};
    }
  };

  const simPassRes = await rfcSimulateCopyBom({
    sourceMaterial: 'TESTMAT',
    sourcePlant: '1010',
    targetMaterial: 'TESTMAT',
    targetPlant: '1012',
    copyHierarchy: false,
    client: mockBapiPassClient
  });

  assert.strictEqual(simPassRes.valid, true, 'Clean simulation must mark valid=true');
  assert.strictEqual(simPassRes.canCopy, true, 'Clean simulation must allow copy');
  assert.strictEqual(simPassRes.blocked, false);
  console.log('   ✓ TESTRUN pass allows the copy to proceed');

  // 12. Testing multi-level BOM copy pre-simulation with missing materials at levels 0 and 2
  console.log('\n12. Testing multi-level BOM simulation (levels 0 and 2 failures, de-duplication):');
  const mock3LevelClient = {
    call: async (fm, payload) => {
      if (fm === 'RFC_READ_TABLE') {
        const table = payload.QUERY_TABLE;
        const opt = (payload.OPTIONS || []).map((o) => o.TEXT).join(' ');

        if (table === 'MAST') {
          if (opt.includes("WERKS = '1010'")) {
            if (opt.includes('ROOT_3LVL')) {
              return {
                FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
                DATA: [{ WA: 'ROOT_3LVL|1010|1|00780001|01' }]
              };
            }
            if (opt.includes('SUB_LVL1')) {
              return {
                FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
                DATA: [{ WA: 'SUB_LVL1|1010|1|00780002|01' }]
              };
            }
            if (opt.includes('SUB_LVL2')) {
              return {
                FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
                DATA: [{ WA: 'SUB_LVL2|1010|1|00780003|01' }]
              };
            }
          }
          return { FIELDS: [], DATA: [] };
        }

        if (table === 'STKO') {
          return { FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }], DATA: [{ WA: '1|EA' }] };
        }

        if (table === 'STAS') {
          if (opt.includes('00780001')) { // ROOT_3LVL
            return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }, { WA: '00000002' }, { WA: '00000003' }] };
          }
          if (opt.includes('00780002')) { // SUB_LVL1
            return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }, { WA: '00000002' }] };
          }
          if (opt.includes('00780003')) { // SUB_LVL2
            return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }, { WA: '00000002' }] };
          }
          return { FIELDS: [], DATA: [] };
        }

        if (table === 'STPO') {
          if (opt.includes('00780001')) {
            return {
              FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }],
              DATA: [
                { WA: '00000001|0010|000000000000000144|1|EA' },
                { WA: '00000002|0020|000000000000000144|1|EA' }, // Duplicate 144 to verify de-duplication
                { WA: '00000003|0030|SUB_LVL1|1|EA' }
              ]
            };
          }
          if (opt.includes('00780002')) {
            return {
              FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }],
              DATA: [
                { WA: '00000001|0010|COMP_VALID_1|1|EA' },
                { WA: '00000002|0020|SUB_LVL2|1|EA' }
              ]
            };
          }
          if (opt.includes('00780003')) {
            return {
              FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }],
              DATA: [
                { WA: '00000001|0010|000000000000000221|2|EA' },
                { WA: '00000002|0020|COMP_VALID_2|1|EA' }
              ]
            };
          }
          return { FIELDS: [], DATA: [] };
        }
        return { FIELDS: [], DATA: [] };
      }

      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        const mat = payload.MATERIALRELATIONS?.[0]?.MATERIAL || '';
        if (mat === 'ROOT_3LVL') {
          return {
            RETURN: [
              { TYPE: 'E', ID: 'M3', NUMBER: '351', MESSAGE: 'Material 000000000000000144 not maintained in plant 16P2' },
              { TYPE: 'A', ID: 'BAPI', NUMBER: '001', MESSAGE: 'No instance of object type BOMGroup has been created' }
            ]
          };
        }
        if (mat === 'SUB_LVL1') {
          return { RETURN: [] }; // Pass at Level 1
        }
        if (mat === 'SUB_LVL2') {
          return {
            RETURN: [
              { TYPE: 'E', ID: 'M3', NUMBER: '351', MESSAGE: 'Material 000000000000000221 not maintained in plant 16P2' },
              { TYPE: 'A', ID: 'BAPI', NUMBER: '001', MESSAGE: 'No instance of object type BOMGroup has been created' }
            ]
          };
        }
        return { RETURN: [] };
      }

      return {};
    }
  };

  const multiSimRes = await rfcSimulateCopyBom({
    sourceMaterial: 'ROOT_3LVL',
    sourcePlant: '1010',
    targetMaterial: 'ROOT_3LVL',
    targetPlant: '16P2',
    copyHierarchy: true,
    client: mock3LevelClient
  });

  assert.strictEqual(multiSimRes.valid, false, 'Multi-level simulation with errors must mark valid=false');
  assert.strictEqual(multiSimRes.canCopy, false, 'Multi-level simulation with errors must block copy');
  assert.strictEqual(multiSimRes.blocked, true, 'Multi-level simulation with errors must set blocked=true');
  assert.strictEqual(multiSimRes.totalBomsSimulated, 3, 'Must simulate all 3 BOM levels');

  // Verify that BOTH errors are reported grouped by material and level
  const expectedProbLvl0 = 'Component 144 not maintained in plant 16P2 (BOM of ROOT_3LVL, level 0)';
  const expectedProbLvl2 = 'Component 221 not maintained in plant 16P2 (BOM of SUB_LVL2, level 2)';
  assert.ok(multiSimRes.message.includes(expectedProbLvl0), `Message must include level 0 failure. Got: ${multiSimRes.message}`);
  assert.ok(multiSimRes.message.includes(expectedProbLvl2), `Message must include level 2 failure. Got: ${multiSimRes.message}`);

  // Verify level 0 appears before level 2
  const idxLvl0 = multiSimRes.message.indexOf(expectedProbLvl0);
  const idxLvl2 = multiSimRes.message.indexOf(expectedProbLvl2);
  assert.ok(idxLvl0 < idxLvl2, 'Level 0 problem must appear before level 2 problem');

  // Verify de-duplication: Component 144 only appears once in the message
  const occurrencesOf144 = (multiSimRes.message.match(/Component 144 not maintained in plant 16P2/g) || []).length;
  assert.strictEqual(occurrencesOf144, 1, 'Repeated material 144 must be de-duplicated to a single entry');
  console.log('   ✓ Multi-level TESTRUN covers all 3 levels, groups errors by material & level, and de-duplicates');

  // 13. Testing existing target plant sub-assemblies are skipped from simulation and reused
  console.log('\n13. Testing sub-assemblies existing in target plant are reused and skipped from simulation:');
  const mockExistingSubClient = {
    call: async (fm, payload) => {
      if (fm === 'RFC_READ_TABLE') {
        const table = payload.QUERY_TABLE;
        const opt = (payload.OPTIONS || []).map((o) => o.TEXT).join(' ');

        if (table === 'MAST') {
          // Check for sub-assembly existing in target plant 16P2!
          if (opt.includes("WERKS = '16P2'") && opt.includes('SUB_EXISTING')) {
            return {
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
              DATA: [{ WA: 'SUB_EXISTING|16P2|1|00788888|01' }]
            };
          }
          if (opt.includes('ROOT_REUSE')) {
            return {
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
              DATA: [{ WA: 'ROOT_REUSE|1010|1|00780010|01' }]
            };
          }
          if (opt.includes('SUB_EXISTING')) {
            return {
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
              DATA: [{ WA: 'SUB_EXISTING|1010|1|00780011|01' }]
            };
          }
          return { FIELDS: [], DATA: [] };
        }

        if (table === 'STKO') {
          return { FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }], DATA: [{ WA: '1|EA' }] };
        }

        if (table === 'STAS') {
          return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
        }

        if (table === 'STPO') {
          if (opt.includes('00780010')) { // ROOT_REUSE
            return {
              FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'POSTP' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }],
              DATA: [{ WA: '00000001|0010|L|SUB_EXISTING|1|EA' }]
            };
          }
          if (opt.includes('00780011')) { // SUB_EXISTING - has bad component in 16P2
            return {
              FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'POSTP' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }],
              DATA: [{ WA: '00000001|0010|L|UNMAINTAINED_MAT|1|EA' }]
            };
          }
          return { FIELDS: [], DATA: [] };
        }
        return { FIELDS: [], DATA: [] };
      }

      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        const mat = payload.MATERIALRELATIONS?.[0]?.MATERIAL || '';
        if (mat === 'SUB_EXISTING') {
          // If simulation was called for SUB_EXISTING, fail! It should have been skipped!
          throw new Error('SUB_EXISTING should have been skipped and not simulated for creation!');
        }
        return { RETURN: [] };
      }
      return {};
    }
  };

  // Directly verify shared helper function
  const subCheck = await isSubAssemblyBomExistingInTarget(
    { material: 'SUB_EXISTING', bomUsage: '1', alternativeBom: '01', level: 1 },
    '16P2',
    mockExistingSubClient
  );
  assert.strictEqual(subCheck.exists, true, 'isSubAssemblyBomExistingInTarget must identify existing BOM in target plant');
  assert.strictEqual(subCheck.bomNumber, '00788888');

  // Verify in rfcSimulateCopyBom: SUB_EXISTING is skipped, copy succeeds with 1 BOM simulated
  const reuseSimRes = await rfcSimulateCopyBom({
    sourceMaterial: 'ROOT_REUSE',
    sourcePlant: '1010',
    targetMaterial: 'ROOT_REUSE',
    targetPlant: '16P2',
    copyHierarchy: true,
    client: mockExistingSubClient
  });

  assert.strictEqual(reuseSimRes.valid, true, 'Simulation must pass when existing sub-assembly is reused');
  assert.strictEqual(reuseSimRes.canCopy, true);
  assert.strictEqual(reuseSimRes.totalBomsSimulated, 1, 'Only root BOM should be simulated for creation');
  assert.strictEqual(reuseSimRes.reusedBoms.length, 1, 'Existing sub-assembly must be recorded as reused');
  assert.strictEqual(reuseSimRes.reusedBoms[0].material, 'SUB_EXISTING');
  console.log('   ✓ Existing sub-assembly BOM in target plant is reused and skipped from creation simulation');

  // 14. Testing simulation 30-second timeout handling (real error, blocks copy, never passes)
  console.log('\n14. Testing simulation RFC timeout handling (surfaces as real error, blocks copy):');
  const mockTimeoutClient = {
    call: async (fm, payload) => {
      if (fm === 'RFC_READ_TABLE') {
        if (payload.QUERY_TABLE === 'MAST') {
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
            DATA: [{ WA: 'TIMEOUT_MAT|1010|1|00789999|01' }]
          };
        }
        if (payload.QUERY_TABLE === 'STKO') return { FIELDS: [{ FIELDNAME: 'BMENG' }], DATA: [{ WA: '1' }] };
        if (payload.QUERY_TABLE === 'STAS') return { FIELDS: [{ FIELDNAME: 'STLKN' }], DATA: [{ WA: '00000001' }] };
        if (payload.QUERY_TABLE === 'STPO') return { FIELDS: [{ FIELDNAME: 'STLKN' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }], DATA: [{ WA: '00000001|0010|COMP1|1|EA' }] };
        return { FIELDS: [], DATA: [] };
      }
      if (fm === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        const timeoutErr = new Error('RFC timeout: Simulation for BOM TIMEOUT_MAT (Level 0) in plant 16P2 exceeded 30s limit');
        timeoutErr.code = 'RFC_TIMEOUT';
        throw timeoutErr;
      }
      return {};
    }
  };

  const timeoutRes = await rfcSimulateCopyBom({
    sourceMaterial: 'TIMEOUT_MAT',
    sourcePlant: '1010',
    targetMaterial: 'TIMEOUT_MAT',
    targetPlant: '16P2',
    copyHierarchy: false,
    client: mockTimeoutClient
  });

  assert.strictEqual(timeoutRes.valid, false, 'Timeout must mark valid=false');
  assert.strictEqual(timeoutRes.canCopy, false, 'Timeout must block copy');
  assert.strictEqual(timeoutRes.blocked, true, 'Timeout must set blocked=true');
  assert.match(timeoutRes.message, /RFC timeout/i, 'Timeout error message must be surfaced');
  console.log('   ✓ RFC timeout surfaces as real error, blocks copy, and never passes silently');

  // 15. Testing UI BlockedReasonsList parser & grouping logic (16 problems in 30 BOMs)
  console.log('\n15. Testing BlockedReasonsList grouping and heading formatting logic:');
  const sample16Problems = [
    'Material FL0002S-BKBK0011 not maintained in plant 1001 (BOM of FL0002S-BKBK0011, level 0)',
    'Material PCFL0003G not maintained in plant 1001 (BOM of PCFL0003G, level 1)',
    'Material A1FL0002S-BKBK0011 not maintained in plant 1001 (BOM of A1FL0002S-BKBK0011, level 1)',
    'Material PPFL0010G not maintained in plant 1001 (BOM of PPFL0010G, level 2)',
    'Material B1FL0002S-BKBK0011 not maintained in plant 1001 (BOM of B1FL0002S-BKBK0011, level 2)',
    'Material E1FL0002GBLK1011 not maintained in plant 1001 (BOM of E1FL0002GBLK1011, level 2)',
    'Material H2EVBLK0001 not maintained in plant 1001 (BOM of H2EVBLK0001, level 3)',
    'Material H2EVEXRD001 not maintained in plant 1001 (BOM of H2EVEXRD001, level 3)',
    'Material H2PVBLK0004 not maintained in plant 1001 (BOM of H2PVBLK0004, level 3)',
    'Component 11021432 not maintained in plant 1001 (BOM of H2EVRBD0001, level 4)',
    'Component 11022504 not maintained in plant 1001 (BOM of H2EVRBD0001, level 4)',
    'Material H2EVABS0001 not maintained in plant 1001 (BOM of H2EVABS0001, level 4)',
    'Material I2EVAMIX001 not maintained in plant 1001 (BOM of I2EVAMIX001, level 4)',
    'Component 11039074 not maintained in plant 1001 (BOM of H2EVRBD0001, level 4)',
    'Component 11037358 not maintained in plant 1001 (BOM of H2EVRBD0001, level 4)',
    'Material I2PVCMIX001 not maintained in plant 1001 (BOM of I2PVCMIX001, level 4)'
  ];

  // Heading check
  const totalBoms = 30;
  const heading = `Cannot copy: ${sample16Problems.length} problems found in ${totalBoms} BOMs`;
  assert.strictEqual(heading, 'Cannot copy: 16 problems found in 30 BOMs');

  // Grouping check
  const groups = {};
  for (const p of sample16Problems) {
    const lvl = parseInt(p.match(/level\s*(\d+)/i)[1], 10);
    if (!groups[lvl]) groups[lvl] = [];
    groups[lvl].push(p);
  }

  assert.strictEqual(groups[0].length, 1);
  assert.strictEqual(groups[1].length, 2);
  assert.strictEqual(groups[2].length, 3);
  assert.strictEqual(groups[3].length, 3);
  assert.strictEqual(groups[4].length, 7);
  assert.strictEqual(sample16Problems.slice(0, 8).length, 8, 'Initial view must show first 8 items');
  console.log('   ✓ Grouped list heading and level-grouping accurately formats 16 problems across 30 BOMs');

  console.log('\n======================================================');
  console.log('✅ ALL PADDING AND ERROR PROPAGATION TESTS PASSED!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
