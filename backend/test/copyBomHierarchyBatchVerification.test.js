import assert from 'assert';
import {
  verifyCopiedBomHierarchy,
  batchReadBomHierarchy,
  clearHierarchyCache
} from '../services/sapRfcClient.js';

async function runBatchVerificationTests() {
  console.log('\n============================================================');
  console.log('  RUNNING COPY BOM HIERARCHY BATCH VERIFICATION TESTS       ');
  console.log('============================================================\n');

  clearHierarchyCache();

  // ---------------------------------------------------------------------------
  // TEST 1: RFC call count for a hierarchy of 34 BOMs stays <= 5 (fixed small number)
  // ---------------------------------------------------------------------------
  console.log('1. Testing RFC call count for 34 BOMs stays under fixed small number (<= 5):');

  let callCount = 0;
  const callsMade = [];

  // Construct 34 BOM headers and components
  const mockMastRows = [];
  const mockStpoRows = [];
  const mockMaktRows = [];

  // Root BOM: MAT_ROOT_34
  mockMastRows.push({
    WA: 'MAT_ROOT_34|1012|1|STLNR_0001|01'
  });
  mockMaktRows.push({
    WA: 'MAT_ROOT_34|Root Assembly 34'
  });

  // Level 1 has 3 sub-assemblies; each has more, totaling 34 BOMs
  for (let i = 2; i <= 34; i++) {
    const matName = `MAT_SUB_${String(i).padStart(4, '0')}`;
    const stlnr = `STLNR_${String(i).padStart(4, '0')}`;
    mockMastRows.push({
      WA: `${matName}|1012|1|${stlnr}|01`
    });
    mockMaktRows.push({
      WA: `${matName}|Sub Assembly ${i}`
    });
  }

  // Root items: points to SUB_0002, SUB_0003, SUB_0004
  mockStpoRows.push(
    { WA: 'STLNR_0001|0010|L|MAT_SUB_0002|1|EA|Item text 1|20240101' },
    { WA: 'STLNR_0001|0020|L|MAT_SUB_0003|1|EA|Item text 2|20240101' },
    { WA: 'STLNR_0001|0030|L|MAT_SUB_0004|1|EA|Item text 3|20240101' }
  );

  // Distribute other 30 sub-assemblies hierarchically across 5 levels
  let currentParent = 2;
  for (let i = 5; i <= 34; i++) {
    const parentStlnr = `STLNR_${String(currentParent).padStart(4, '0')}`;
    const childMat = `MAT_SUB_${String(i).padStart(4, '0')}`;
    mockStpoRows.push({
      WA: `${parentStlnr}|0010|L|${childMat}|2|EA|Sub Item|20240101`
    });
    mockStpoRows.push({
      WA: `${parentStlnr}|0020|L|RAW_COMP_LEAF|5|KG|Leaf Part|20240101`
    });
    if (i % 2 === 0) currentParent++;
  }

  // Mock client tracking RFC calls
  const mockClient = {
    call: async (funcName, params) => {
      callCount++;
      callsMade.push({ funcName, table: params?.QUERY_TABLE });

      if (funcName === 'RFC_READ_TABLE') {
        const table = params.QUERY_TABLE;
        if (table === 'MAST') {
          return {
            FIELDS: [
              { FIELDNAME: 'MATNR' },
              { FIELDNAME: 'WERKS' },
              { FIELDNAME: 'STLAN' },
              { FIELDNAME: 'STLNR' },
              { FIELDNAME: 'STLAL' }
            ],
            DATA: mockMastRows
          };
        }
        if (table === 'STPO') {
          return {
            FIELDS: [
              { FIELDNAME: 'STLNR' },
              { FIELDNAME: 'POSNR' },
              { FIELDNAME: 'POSTP' },
              { FIELDNAME: 'IDNRK' },
              { FIELDNAME: 'MENGE' },
              { FIELDNAME: 'MEINS' },
              { FIELDNAME: 'POTX1' },
              { FIELDNAME: 'DATUV' }
            ],
            DATA: mockStpoRows
          };
        }
        if (table === 'MAKT') {
          return {
            FIELDS: [
              { FIELDNAME: 'MATNR' },
              { FIELDNAME: 'MAKTX' }
            ],
            DATA: mockMaktRows
          };
        }
      }
      return { DATA: [] };
    }
  };

  const verifyResult = await verifyCopiedBomHierarchy({
    sourceMaterial: 'MAT_ROOT_34',
    sourcePlant: '1012',
    targetMaterial: 'MAT_ROOT_34',
    targetPlant: '1012',
    targetAlternative: '01',
    client: mockClient
  });

  console.log(`   Calls made for 34 BOMs: ${callCount}`);
  callsMade.forEach((c, idx) => console.log(`     ${idx + 1}. ${c.funcName} (${c.table})`));

  // Assert RFC call count stays under fixed small number (<= 5, here exactly 3 for target and source reuse)
  assert.ok(callCount <= 5, `RFC call count for 34 BOMs must be <= 5, actual: ${callCount}`);
  assert.strictEqual(verifyResult.success, true, 'Verification of 34 BOMs succeeds');
  assert.ok(verifyResult.bomsCreated >= 15, `Multiple BOMs created in hierarchy: ${verifyResult.bomsCreated}`);
  assert.ok(verifyResult.totalComponents > 34, `Total components must exceed 34: ${verifyResult.totalComponents}`);
  assert.ok(verifyResult.totalLevels > 1, `Hierarchy must have multiple levels: ${verifyResult.totalLevels}`);
  console.log(`   ✓ 34-BOM hierarchy verified in exactly ${callCount} RFC calls (bound: <= 5). BOMs: ${verifyResult.bomsCreated}, Comps: ${verifyResult.totalComponents}, Levels: ${verifyResult.totalLevels}`);

  // ---------------------------------------------------------------------------
  // TEST 2: Server-isolated read cache prevents redundant RFC calls
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing server-isolated read cache:');
  const countBefore = callCount;
  const cachedVerify = await verifyCopiedBomHierarchy({
    sourceMaterial: 'MAT_ROOT_34',
    sourcePlant: '1012',
    targetMaterial: 'MAT_ROOT_34',
    targetPlant: '1012',
    targetAlternative: '01',
    client: mockClient
  });
  const countAfter = callCount;
  assert.strictEqual(countAfter, countBefore, 'Subsequent verification within TTL must use cache (0 additional RFC calls)');
  assert.strictEqual(cachedVerify.success, true);
  console.log(`   ✓ Cache hit: 0 additional RFC calls (${countBefore} -> ${countAfter})`);

  // ---------------------------------------------------------------------------
  // TEST 3: Cyclic BOM reference detection FAILS CLEARLY
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing cyclic BOM reference guard fails clearly (never silent):');
  clearHierarchyCache();

  const cyclicClient = {
    call: async (funcName, params) => {
      const table = params?.QUERY_TABLE;
      if (table === 'MAST') {
        return {
          FIELDS: [
            { FIELDNAME: 'MATNR' },
            { FIELDNAME: 'WERKS' },
            { FIELDNAME: 'STLAN' },
            { FIELDNAME: 'STLNR' },
            { FIELDNAME: 'STLAL' }
          ],
          DATA: [
            { WA: 'CYCLIC_A|1012|1|STLNR_CYC_A|01' },
            { WA: 'CYCLIC_B|1012|1|STLNR_CYC_B|01' }
          ]
        };
      }
      if (table === 'STPO') {
        return {
          FIELDS: [
            { FIELDNAME: 'STLNR' },
            { FIELDNAME: 'POSNR' },
            { FIELDNAME: 'POSTP' },
            { FIELDNAME: 'IDNRK' },
            { FIELDNAME: 'MENGE' },
            { FIELDNAME: 'MEINS' },
            { FIELDNAME: 'POTX1' },
            { FIELDNAME: 'DATUV' }
          ],
          DATA: [
            // CYCLIC_A includes CYCLIC_B
            { WA: 'STLNR_CYC_A|0010|L|CYCLIC_B|1|EA||20240101' },
            // CYCLIC_B includes CYCLIC_A (Cycle!)
            { WA: 'STLNR_CYC_B|0010|L|CYCLIC_A|1|EA||20240101' }
          ]
        };
      }
      return { DATA: [] };
    }
  };

  const cyclicResult = await verifyCopiedBomHierarchy({
    sourceMaterial: 'CYCLIC_A',
    sourcePlant: '1012',
    targetMaterial: 'CYCLIC_A',
    targetPlant: '1012',
    targetAlternative: '01',
    client: cyclicClient
  });

  assert.strictEqual(cyclicResult.success, false, 'Cyclic BOM must not report success');
  assert.strictEqual(cyclicResult.status, 'FAILED', 'Status must be FAILED');
  assert.ok(cyclicResult.message.includes('Cyclic BOM reference detected'), `Message must identify cycle: ${cyclicResult.message}`);
  console.log(`   ✓ Cyclic BOM caught and failed clearly: "${cyclicResult.message}"`);

  // ---------------------------------------------------------------------------
  // TEST 4: Maximum depth guard FAILS CLEARLY when depth exceeds limit
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing maximum depth guard fails clearly:');
  clearHierarchyCache();

  // Create chain of 5 levels with maxDepth = 3
  const deepMast = [];
  const deepStpo = [];
  for (let d = 1; d <= 6; d++) {
    deepMast.push({ WA: `DEPTH_MAT_${d}|1012|1|STLNR_DEPTH_${d}|01` });
    if (d < 6) {
      deepStpo.push({ WA: `STLNR_DEPTH_${d}|0010|L|DEPTH_MAT_${d + 1}|1|EA||20240101` });
    }
  }

  const deepClient = {
    call: async (funcName, params) => {
      const table = params?.QUERY_TABLE;
      if (table === 'MAST') return { FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }], DATA: deepMast };
      if (table === 'STPO') return { FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'POSNR' }, { FIELDNAME: 'POSTP' }, { FIELDNAME: 'IDNRK' }, { FIELDNAME: 'MENGE' }, { FIELDNAME: 'MEINS' }, { FIELDNAME: 'POTX1' }, { FIELDNAME: 'DATUV' }], DATA: deepStpo };
      return { DATA: [] };
    }
  };

  const deepResult = await verifyCopiedBomHierarchy({
    sourceMaterial: 'DEPTH_MAT_1',
    sourcePlant: '1012',
    targetMaterial: 'DEPTH_MAT_1',
    targetPlant: '1012',
    targetAlternative: '01',
    maxDepth: 3,
    client: deepClient
  });

  assert.strictEqual(deepResult.success, false, 'Exceeded depth must fail');
  assert.strictEqual(deepResult.status, 'FAILED', 'Status must be FAILED');
  assert.ok(deepResult.message.includes('maximum hierarchy depth limit'), `Message must mention depth limit: ${deepResult.message}`);
  console.log(`   ✓ Depth limit caught and failed clearly: "${deepResult.message}"`);

  console.log('\n============================================================');
  console.log('  ALL BATCH VERIFICATION TESTS PASSED SUCCESSFULLY!         ');
  console.log('============================================================\n');
}

runBatchVerificationTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
