import assert from 'assert';
import {
  rfcGetBomDisplayData,
  rfcReadBom,
  rfcValidateSourceBom,
  fetchDirectBom
} from '../services/sapRfcClient.js';
import { deleteBomViaGui } from '../services/sapGuiClient.js';

async function runEmptyMastTests() {
  console.log('\n============================================================');
  console.log('  TESTING BOM ALTERNATIVE DEFAULT RESOLUTION & EMPTY MAST   ');
  console.log('============================================================\n');

  process.env.USE_MOCK_SAP = 'true';

  // 1. Mock RFC Client that returns empty MAST table (0 rows)
  const emptyMastClient = {
    call: async (funcName, params) => {
      if (funcName === 'RFC_READ_TABLE') {
        const table = params.QUERY_TABLE;
        if (table === 'MAST') {
          return {
            DATA: [],
            FIELDS: [
              { FIELDNAME: 'MATNR' },
              { FIELDNAME: 'WERKS' },
              { FIELDNAME: 'STLAN' },
              { FIELDNAME: 'STLNR' },
              { FIELDNAME: 'STLAL' }
            ]
          };
        }
        return { DATA: [], FIELDS: [] };
      }
      return {};
    },
    close: async () => {}
  };

  // Helper to construct mock client for specific BOM setups
  function createMockRfcClient({ mastRows = [], stpoRows = [], stkoData = {} }) {
    return {
      call: async (funcName, params) => {
        if (funcName === 'RFC_READ_TABLE') {
          const table = params.QUERY_TABLE;
          if (table === 'MAST') {
            return {
              DATA: mastRows.map((r) => ({ WA: `${r.matnr}|${r.werks}|${r.stlan}|${r.stlnr}|${r.stlal}` })),
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' },
                { FIELDNAME: 'STLAL' }
              ]
            };
          }
          if (table === 'STKO') {
            return {
              DATA: [{ WA: '100|PAA|20240115' }],
              FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }, { FIELDNAME: 'DATUV' }]
            };
          }
          if (table === 'STAS') {
            return {
              DATA: stpoRows.map((_, idx) => ({ WA: String(idx + 1).padStart(8, '0') })),
              FIELDS: [{ FIELDNAME: 'STLKN' }]
            };
          }
          if (table === 'STPO') {
            return {
              DATA: stpoRows.map((r, idx) => ({
                WA: `${String(idx + 1).padStart(8, '0')}|${r.item || String((idx + 1) * 10).padStart(4, '0')}|${r.itemCategory || 'L'}|${r.component}|${r.quantity || 1}|${r.unit || 'EA'}|${r.description || ''}|20240115`
              })),
              FIELDS: [
                { FIELDNAME: 'STLKN' },
                { FIELDNAME: 'POSNR' },
                { FIELDNAME: 'POSTP' },
                { FIELDNAME: 'IDNRK' },
                { FIELDNAME: 'MENGE' },
                { FIELDNAME: 'MEINS' },
                { FIELDNAME: 'POTX1' },
                { FIELDNAME: 'DATUV' }
              ]
            };
          }
          if (table === 'MAKT') {
            return {
              DATA: [
                { WA: 'A1BH0214C|Athletic Footwear 214' },
                { WA: '11021735|Rubber Sole' },
                { WA: '11021733|Upper Shell' },
                { WA: 'SUB_ASM_01|Sub Assembly Sole' },
                { WA: 'RAW_PART_99|Raw Chemical' }
              ],
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTX' }]
            };
          }
          return { DATA: [], FIELDS: [] };
        }
        return {};
      },
      close: async () => {}
    };
  }

  // 1. Only alternative 02 exists (no 01)
  const onlyAlt02Client = createMockRfcClient({
    mastRows: [
      { matnr: 'A1BH0214C', werks: '1001', stlan: '1', stlnr: '00783595', stlal: '02' }
    ],
    stpoRows: [
      { item: '0010', component: '11021735', quantity: 2, unit: 'KG', description: 'Rubber Sole' },
      { item: '0020', component: '11021733', quantity: 1, unit: 'KG', description: 'Upper Shell' }
    ]
  });

  // 2. Alternatives 02 and 03 exist (no 01)
  const alt02And03Client = createMockRfcClient({
    mastRows: [
      { matnr: 'A1BH0214C', werks: '1001', stlan: '1', stlnr: '00783595', stlal: '02' },
      { matnr: 'A1BH0214C', werks: '1001', stlan: '1', stlnr: '00783595', stlal: '03' }
    ],
    stpoRows: [
      { item: '0010', component: '11021735', quantity: 2, unit: 'KG', description: 'Rubber Sole' },
      { item: '0020', component: '11021733', quantity: 1, unit: 'KG', description: 'Upper Shell' }
    ]
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Only alternative 02 exists and field is empty
  // ---------------------------------------------------------------------------
  console.log('1. Testing only alt 02 exists and alternative field is empty:');
  const resOnlyAlt02 = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    client: onlyAlt02Client
  });
  assert.strictEqual(resOnlyAlt02.success, true, 'Must succeed when alternative is empty');
  assert.strictEqual(resOnlyAlt02.bomExists, true);
  assert.strictEqual(resOnlyAlt02.alternativeBom, '02', 'Must resolve to 02 as first existing alternative');
  assert.deepStrictEqual(resOnlyAlt02.availableAlternatives, ['02']);
  assert.strictEqual(resOnlyAlt02.components.length, 2);
  console.log('   ✓ Single Level Display BOM resolves alternative 02 when field is empty');

  // Validate BOM also defaults to 02
  const valOnlyAlt02 = await rfcValidateSourceBom({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    client: onlyAlt02Client
  });
  assert.strictEqual(valOnlyAlt02.success, true);
  assert.strictEqual(valOnlyAlt02.alternativeBom, '02');
  console.log('   ✓ Validate BOM resolves alternative 02 when field is empty');

  // ---------------------------------------------------------------------------
  // TEST 2: Alternatives 02 + 03 exist and field is empty (reads 02)
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing alternatives 02 + 03 and alternative field is empty (reads lowest, 02):');
  const resAlt02And03 = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    client: alt02And03Client
  });
  assert.strictEqual(resAlt02And03.success, true);
  assert.strictEqual(resAlt02And03.alternativeBom, '02', 'Lowest STLAL must be 02');
  assert.deepStrictEqual(resAlt02And03.availableAlternatives, ['02', '03']);
  console.log('   ✓ Reads lowest alternative 02 when 02 and 03 exist and field is empty');

  const readResAlt02And03 = await rfcReadBom({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    client: alt02And03Client
  });
  assert.strictEqual(readResAlt02And03.success, true);
  assert.strictEqual(readResAlt02And03.alternativeBom, '02');
  console.log('   ✓ rfcReadBom reads lowest alternative 02 when alternative is empty');

  // ---------------------------------------------------------------------------
  // TEST 3: User typed existing alternative (03)
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing user typed existing alternative (03):');
  const resTypedAlt03 = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '03',
    client: alt02And03Client
  });
  assert.strictEqual(resTypedAlt03.success, true);
  assert.strictEqual(resTypedAlt03.alternativeBom, '03', 'Must read exact typed alternative 03');
  assert.deepStrictEqual(resTypedAlt03.availableAlternatives, ['02', '03']);
  console.log('   ✓ Reads exact typed alternative 03');

  // Also test integer typed '3'
  const resTypedAlt3 = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '3',
    client: alt02And03Client
  });
  assert.strictEqual(resTypedAlt3.success, true);
  assert.strictEqual(resTypedAlt3.alternativeBom, '03');
  console.log('   ✓ Reads alternative 03 when user types integer 3');

  // ---------------------------------------------------------------------------
  // TEST 4: User typed missing alternative (05) - lists available alternatives
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing user typed missing alternative (05):');
  const resMissingAlt05 = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '05',
    client: alt02And03Client
  });
  assert.strictEqual(resMissingAlt05.success, false);
  assert.strictEqual(resMissingAlt05.errorCode, 'ALTERNATIVE_NOT_FOUND');
  assert.strictEqual(
    resMissingAlt05.message,
    'Alternative 05 does not exist for this BOM. Available alternatives: 02, 03.'
  );
  assert.deepStrictEqual(resMissingAlt05.availableAlternatives, ['02', '03']);
  console.log('   ✓ Returns clear error listing available alternatives: 02, 03');

  // ---------------------------------------------------------------------------
  // TEST 5: No BOM exists at all for material/plant/usage
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing no BOM exists at all:');
  const resNoBom = await rfcGetBomDisplayData({
    material: 'NON_EXISTENT_MAT',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    client: emptyMastClient
  });
  assert.strictEqual(resNoBom.success, false);
  assert.strictEqual(resNoBom.bomExists, false);
  assert.strictEqual(resNoBom.errorCode, 'BOM_NOT_FOUND');
  assert.strictEqual(resNoBom.message, 'No BOM exists for material NON_EXISTENT_MAT in plant 1001.');
  console.log('   ✓ Returns "No BOM exists for material X in plant Y." when no BOM exists at all');

  // ---------------------------------------------------------------------------
  // TEST 6: Multi-level child sub-assembly without alternative
  // ---------------------------------------------------------------------------
  console.log('\n6. Testing multi-level hierarchy child sub-assembly without alternative:');
  const multiLevelClient = {
    call: async (funcName, params) => {
      if (funcName === 'RFC_READ_TABLE') {
        const table = params.QUERY_TABLE;
        if (table === 'MAST') {
          // If parent A1BH0214C
          const optText = (params.OPTIONS || []).map((o) => o.TEXT || '').join(' ');
          if (optText.includes('A1BH0214C')) {
            return {
              DATA: [{ WA: 'A1BH0214C|1001|1|00783595|02' }],
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' },
                { FIELDNAME: 'STLAL' }
              ]
            };
          }
          if (optText.includes('SUB_ASM_01')) {
            // Child sub-assembly has ONLY alternative 02!
            return {
              DATA: [{ WA: 'SUB_ASM_01|1001|1|00783598|02' }],
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' },
                { FIELDNAME: 'STLAL' }
              ]
            };
          }
          return { DATA: [], FIELDS: [] };
        }
        if (table === 'STKO') {
          return {
            DATA: [{ WA: '100|PAA|20240115' }],
            FIELDS: [{ FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }, { FIELDNAME: 'DATUV' }]
          };
        }
        if (table === 'STAS') {
          return {
            DATA: [{ WA: '00000001' }],
            FIELDS: [{ FIELDNAME: 'STLKN' }]
          };
        }
        if (table === 'STPO') {
          const optText = (params.OPTIONS || []).map((o) => o.TEXT || '').join(' ');
          if (optText.includes('00783598')) {
            // Child BOM components
            return {
              DATA: [{ WA: '00000001|0010|L|RAW_PART_99|5|KG|Raw Material|20240115' }],
              FIELDS: [
                { FIELDNAME: 'STLKN' },
                { FIELDNAME: 'POSNR' },
                { FIELDNAME: 'POSTP' },
                { FIELDNAME: 'IDNRK' },
                { FIELDNAME: 'MENGE' },
                { FIELDNAME: 'MEINS' },
                { FIELDNAME: 'POTX1' },
                { FIELDNAME: 'DATUV' }
              ]
            };
          }
          // Parent BOM components
          return {
            DATA: [{ WA: '00000001|0010|L|SUB_ASM_01|1|EA|Sub Assembly Sole|20240115' }],
            FIELDS: [
              { FIELDNAME: 'STLKN' },
              { FIELDNAME: 'POSNR' },
              { FIELDNAME: 'POSTP' },
              { FIELDNAME: 'IDNRK' },
              { FIELDNAME: 'MENGE' },
              { FIELDNAME: 'MEINS' },
              { FIELDNAME: 'POTX1' },
              { FIELDNAME: 'DATUV' }
            ]
          };
        }
        if (table === 'MAKT') {
          return {
            DATA: [
              { WA: 'A1BH0214C|Footwear Model 214' },
              { WA: 'SUB_ASM_01|Sub Assembly Sole' },
              { WA: 'RAW_PART_99|Raw Material' }
            ],
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MAKTX' }]
          };
        }
        return { DATA: [], FIELDS: [] };
      }
      return {};
    },
    close: async () => {}
  };

  const multiRes = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1001',
    bomUsage: '1',
    alternativeBom: '',
    multiLevel: true,
    client: multiLevelClient
  });
  assert.strictEqual(multiRes.success, true);
  assert.strictEqual(multiRes.bomExists, true);
  assert.strictEqual(multiRes.components.length, 2, 'Should have Level 1 child and Level 2 raw part');
  assert.strictEqual(multiRes.components[0].level, 1);
  assert.strictEqual(multiRes.components[0].component, 'SUB_ASM_01');
  assert.strictEqual(multiRes.components[1].level, 2);
  assert.strictEqual(multiRes.components[1].component, 'RAW_PART_99');
  console.log('   ✓ Multi-level child sub-assembly with only alternative 02 resolves and traverses successfully');

  // ---------------------------------------------------------------------------
  // TEST 7: Safety & Unchanged write flows (Delete BOM)
  // ---------------------------------------------------------------------------
  console.log('\n7. Verifying write safety: Delete BOM rejects non-existent alternative:');
  const delNonExistent = await deleteBomViaGui({
    material: 'NON_EXISTENT_MAT_FOR_DELETE',
    plant: '1001',
    alternativeBom: '1',
    bomUsage: '1'
  });
  assert.strictEqual(delNonExistent.success, false);
  assert.ok(
    delNonExistent.code === 'BOM_NOT_FOUND' || delNonExistent.code === 'ALTERNATIVE_NOT_FOUND'
  );
  console.log('   ✓ Delete safely rejects non-existent BOM without unintended deletion');

  console.log('\n============================================================');
  console.log('  ALL 7 BOM ALTERNATIVE & EMPTY MAST TESTS PASSED!          ');
  console.log('============================================================\n');
}

runEmptyMastTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
