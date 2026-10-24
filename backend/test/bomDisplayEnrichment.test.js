import assert from 'assert';
import {
  rfcGetBomDisplayData,
  rfcReadBom,
  rfcExplodeBomHierarchy,
  formatMaterialNumber,
  formatSapDate,
  batchQueryMakt,
  batchQuerySubBom
} from '../services/sapRfcClient.js';

async function runBomDisplayEnrichmentTests() {
  console.log('\n============================================================');
  console.log('  RUNNING BOM DISPLAY ENRICHMENT & HIERARCHY TESTS          ');
  console.log('============================================================\n');

  process.env.USE_MOCK_SAP = 'true';

  // ---------------------------------------------------------------------------
  // TEST 1: formatMaterialNumber & formatSapDate rules
  // ---------------------------------------------------------------------------
  console.log('1. Testing material number formatting and date formatting:');
  assert.strictEqual(formatMaterialNumber('000000000011021735'), '11021735', 'Purely numeric leading zeros trimmed');
  assert.strictEqual(formatMaterialNumber('000000000000000000'), '0', 'All zeros trimmed to single 0');
  assert.strictEqual(formatMaterialNumber('A1BH0214C'), 'A1BH0214C', 'Alphanumeric with letters unchanged');
  assert.strictEqual(formatMaterialNumber('MAT-BOM-100'), 'MAT-BOM-100', 'Alphanumeric with dashes unchanged');
  assert.strictEqual(formatMaterialNumber('000A12'), '000A12', 'Alphanumeric with leading zeros and letters unchanged');

  assert.strictEqual(formatSapDate('20240115'), '15.01.2024', 'YYYYMMDD formatted as DD.MM.YYYY');
  assert.strictEqual(formatSapDate('2024-01-15'), '15.01.2024', 'YYYY-MM-DD formatted as DD.MM.YYYY');
  assert.strictEqual(formatSapDate('00000000'), '-', '00000000 returns dash');
  assert.strictEqual(formatSapDate(''), '-', 'Empty date returns dash');
  assert.strictEqual(formatSapDate(null), '-', 'Null date returns dash');
  console.log('   ✓ Pure numeric trimming, alphanumeric preservation, and DD.MM.YYYY dates verified');

  // ---------------------------------------------------------------------------
  // TEST 2: All columns filled for A1BH0214C / plant 1012 / usage 1
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing Single Level Display BOM for A1BH0214C / plant 1012 / usage 1:');
  const singleRes = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    multiLevel: false
  });

  assert.strictEqual(singleRes.success, true, 'Single level read must succeed');
  assert.strictEqual(singleRes.bomExists, true, 'BOM must exist');
  assert.strictEqual(singleRes.header.bomNumber, '00785396', 'Real BOM number STLNR must be in header');
  assert.strictEqual(singleRes.header.alternative, '01', 'Alternative must be 01');
  assert.strictEqual(singleRes.header.baseQty, '100', 'Base quantity must be 100');
  assert.strictEqual(singleRes.header.baseUnit, 'PAA', 'Base unit must be PAA');
  assert.ok(singleRes.components.length >= 4, 'Must have at least 4 components');

  // Verify first component has all columns populated
  const comp1 = singleRes.components[0];
  assert.strictEqual(comp1.item, '0010');
  assert.strictEqual(comp1.component, '11021735', 'Numeric component must have leading zeros trimmed');
  assert.strictEqual(comp1.rawComponent, '000000000011021735', 'Original SAP material preserved');
  assert.strictEqual(comp1.description, 'Rubber Sole Compound 42', 'Description must come from MAKT');
  assert.strictEqual(comp1.quantity, 0.017, 'Quantity must be preserved');
  assert.strictEqual(comp1.unit, 'KG', 'Unit must be preserved');
  assert.strictEqual(comp1.itemCategory, 'L', 'Item category must be L');
  assert.strictEqual(comp1.validFrom, '15.01.2024', 'Valid from must be DD.MM.YYYY');
  assert.strictEqual(comp1.level, 1, 'Single level components must be Level 1');
  console.log('   ✓ All columns filled correctly for A1BH0214C');

  // ---------------------------------------------------------------------------
  // TEST 3: Component with no text shows a dash
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing component with no text shows a dash:');
  const emptyTextComp = singleRes.components.find((c) => c.component === '11021734');
  assert.ok(emptyTextComp, 'Component 11021734 must exist');
  assert.strictEqual(emptyTextComp.description, '-', 'Component with empty text must show a dash');
  console.log('   ✓ Component with no text shows dash');

  // ---------------------------------------------------------------------------
  // TEST 4: Multi-Level component tree & Level column with deeper levels
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing Multi-Level component tree for A1BH0214C:');
  const multiRes = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    multiLevel: true
  });

  assert.strictEqual(multiRes.success, true, 'Multi-level read must succeed');
  assert.strictEqual(multiRes.header.bomNumber, '00785396', 'Real BOM number STLNR in header');
  assert.strictEqual(multiRes.header.material, 'A1BH0214C', 'Root material shown only in header');

  // Root material must NOT be row 1 of the table!
  assert.notStrictEqual(multiRes.components[0].component, 'A1BH0214C', 'Root material must not be in components table');
  assert.strictEqual(multiRes.components[0].level, 1, 'Table starts at Level 1');

  // Check sub-assembly component
  const subAsmComp = multiRes.components.find((c) => c.component === '11021736');
  assert.ok(subAsmComp, 'Sub-assembly 11021736 must exist in Level 1');
  assert.strictEqual(subAsmComp.hasSubBom, true, 'Sub-BOM flag must be true for sub-assembly');

  // Check Level 2 components indented under sub-assembly
  const level2Comps = multiRes.components.filter((c) => c.level === 2);
  assert.ok(level2Comps.length >= 2, 'Must have at least 2 Level 2 components');
  const foamComp = level2Comps.find((c) => c.component === '11022139');
  assert.ok(foamComp, 'Level 2 component 11022139 must exist');
  assert.strictEqual(foamComp.level, 2, 'Must be Level 2');
  assert.strictEqual(foamComp.parentMaterial, '11021736', 'Parent material must be subassembly');
  assert.strictEqual(foamComp.description, 'High Density Foam Insert', 'Description populated at Level 2');
  assert.strictEqual(foamComp.validFrom, '01.02.2024', 'Valid from populated at Level 2');
  assert.strictEqual(foamComp.quantity, 0.001, 'Quantity populated at Level 2');
  assert.strictEqual(foamComp.unit, 'KG', 'Unit populated at Level 2');
  console.log('   ✓ Multi-Level starts at Level 1; Level 2 items indented with full columns');

  // ---------------------------------------------------------------------------
  // TEST 5: More than 100 materials in one tree work (batched chunking in 25s)
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing batched lookups for more than 100 materials:');
  const testMaterials = [];
  for (let i = 1; i <= 125; i++) {
    testMaterials.push(`MAT_BULK_TEST_${String(i).padStart(4, '0')}`);
  }
  const maktResults = await batchQueryMakt(null, testMaterials, 'E');
  assert.strictEqual(Object.keys(maktResults).length, 125, 'All 125 materials processed by batchQueryMakt');

  const subBomResults = await batchQuerySubBom(null, testMaterials, '1012');
  assert.ok(subBomResults instanceof Set, 'Sub-BOM results returned as Set');
  console.log('   ✓ Batch chunking in 25s handles 125 materials without error');

  // ---------------------------------------------------------------------------
  // TEST 6: Guard test that rfcReadBom and rfcExplodeBomHierarchy return exact shapes
  // ---------------------------------------------------------------------------
  console.log('\n6. Guard test: verifying rfcReadBom & rfcExplodeBomHierarchy return shapes are unchanged:');
  const rawRead = await rfcReadBom({
    material: 'MAT-BOM-100',
    plant: '1000',
    bomUsage: '1'
  });

  assert.strictEqual(rawRead.success, true);
  assert.strictEqual(rawRead.bomExists, true);
  assert.strictEqual(rawRead.material, 'MAT-BOM-100');
  assert.strictEqual(rawRead.plant, '1000');
  assert.strictEqual(rawRead.componentCount, 3);
  assert.ok(Array.isArray(rawRead.components));
  assert.strictEqual(rawRead.header.description, 'Standard Industrial Motor Assembly BOM');

  const rawExplode = await rfcExplodeBomHierarchy({
    material: 'MAT-BOM-100',
    plant: '1000',
    bomUsage: '1'
  });

  assert.strictEqual(rawExplode.success, true);
  assert.strictEqual(rawExplode.rootMaterial, 'MAT-BOM-100');
  assert.strictEqual(rawExplode.plant, '1000');
  assert.ok(Array.isArray(rawExplode.items));
  assert.strictEqual(rawExplode.items[0].material, 'MAT-BOM-100');
  console.log('   ✓ Guard test passed: rfcReadBom and rfcExplodeBomHierarchy return shapes identical to before');

  console.log('\n============================================================');
  console.log('  ALL BOM DISPLAY ENRICHMENT & HIERARCHY TESTS PASSED!      ');
  console.log('============================================================\n');
}

runBomDisplayEnrichmentTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
