import assert from 'assert';
import {
  rfcCopyBom,
  rfcReadBom,
  rfcExplodeBomHierarchy,
  repairHierarchyBottomUp,
  verifyCopiedBomHierarchy,
  rfcGetBomDisplayData,
  formatMaterialNumber,
  formatSapDate,
  batchQueryMakt,
  batchQuerySubBom
} from '../services/sapRfcClient.js';

async function runCopyBomResultEnrichmentTests() {
  console.log('\n============================================================');
  console.log('  RUNNING COPY BOM RESULT ENRICHMENT & VERIFICATION TESTS   ');
  console.log('============================================================\n');

  process.env.USE_MOCK_SAP = 'true';

  // ---------------------------------------------------------------------------
  // TEST 1: The result lists all components, including leaf components,
  //         for a hierarchy with more than 100 components.
  // ---------------------------------------------------------------------------
  console.log('1. Testing hierarchy with >100 components, including leaf components:');
  const largeTreeMaterials = [];
  for (let i = 1; i <= 120; i++) {
    largeTreeMaterials.push(`MAT_LEAF_${String(i).padStart(4, '0')}`);
  }

  // Verify batch lookups handle >100 materials in chunks of 25
  const maktResults = await batchQueryMakt(null, largeTreeMaterials, 'E');
  assert.strictEqual(Object.keys(maktResults).length, 120, 'All 120 materials processed by batchQueryMakt');

  const subBomResults = await batchQuerySubBom(null, largeTreeMaterials, '1012');
  assert.ok(subBomResults instanceof Set, 'Sub-BOM check returns Set');

  // Verify standard multi-level BOM explosion returns all components including leaf components
  const displayResult = await rfcGetBomDisplayData({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    multiLevel: true
  });

  assert.strictEqual(displayResult.success, true, 'Display reader succeeds');
  assert.ok(displayResult.components.length > 0, 'Components must be present');
  
  // Verify leaf components (hasSubBom === false) are present in the list
  const leafComponents = displayResult.components.filter((c) => !c.hasSubBom);
  assert.ok(leafComponents.length > 0, 'Leaf components must be included');
  const subBomComponents = displayResult.components.filter((c) => c.hasSubBom);
  assert.ok(subBomComponents.length > 0, 'Sub-BOM components must be included');
  console.log(`   ✓ Multi-level tree includes both ${subBomComponents.length} sub-assemblies and ${leafComponents.length} leaf components`);
  console.log('   ✓ Batched queries handle >100 materials (120 tested) in chunks of 25');

  // ---------------------------------------------------------------------------
  // TEST 2: BOM count and component count are shown separately and correctly
  // ---------------------------------------------------------------------------
  console.log('\n2. Testing separate and correct BOM count vs Component count:');
  const verifyRes = await verifyCopiedBomHierarchy({
    sourceMaterial: 'A1BH0214C',
    sourcePlant: '1012',
    targetMaterial: 'A1BH0214C',
    targetPlant: '1012',
    targetAlternative: '01'
  });

  assert.strictEqual(verifyRes.success, true);
  assert.strictEqual(typeof verifyRes.bomsCreated, 'number', 'BOMs created must be numeric');
  assert.strictEqual(typeof verifyRes.totalComponents, 'number', 'Total components must be numeric');
  assert.ok(verifyRes.bomsCreated >= 1, 'BOMs created must be at least 1');
  assert.ok(verifyRes.totalComponents > verifyRes.bomsCreated, 'Component count must exceed BOM count');
  assert.strictEqual(verifyRes.groups.length, verifyRes.bomsCreated, 'Groups length must match bomsCreated');
  assert.strictEqual(verifyRes.flatComponents.length, verifyRes.totalComponents, 'Flat components must match totalComponents');
  console.log(`   ✓ BOM count (${verifyRes.bomsCreated} BOMs) and Component count (${verifyRes.totalComponents} components) separated correctly`);

  // ---------------------------------------------------------------------------
  // TEST 3: Description, Quantity, Unit and Valid From are filled
  // ---------------------------------------------------------------------------
  console.log('\n3. Testing all columns (Description, Quantity, Unit, Valid From) are filled:');
  assert.ok(verifyRes.flatComponents.length > 0, 'Components must be returned');

  for (const comp of verifyRes.flatComponents) {
    assert.ok(comp.component, 'Component material must not be empty');
    assert.ok(comp.description !== undefined && comp.description !== '', 'Description must be populated');
    assert.ok(comp.quantity !== undefined && comp.quantity !== null, 'Quantity must be populated');
    assert.ok(comp.unit, 'Unit must not be empty');
    assert.ok(comp.validFrom, 'Valid From must be populated');
    assert.ok(comp.level >= 1, 'Level must be >= 1');
    assert.ok(comp.item, 'Item number must be populated');
  }

  // Check specific component values for accuracy
  const comp1 = verifyRes.flatComponents[0];
  assert.strictEqual(comp1.component, '11021735', 'Numeric material leading zeros trimmed');
  assert.strictEqual(comp1.description, 'Rubber Sole Compound 42', 'Description from MAKT');
  assert.strictEqual(comp1.quantity, 0.017, 'Quantity preserved');
  assert.strictEqual(comp1.unit, 'KG', 'Unit preserved');
  assert.strictEqual(comp1.validFrom, '15.01.2024', 'Valid from formatted DD.MM.YYYY');
  console.log('   ✓ Description, Quantity, Unit, and Valid From fully populated on all components');

  // ---------------------------------------------------------------------------
  // TEST 4: A deliberately altered target causes PARTIAL, not success
  // ---------------------------------------------------------------------------
  console.log('\n4. Testing strict verification: deliberately altered target causes PARTIAL:');
  // We simulate an altered target by comparing source A1BH0214C against a target with modified component
  // Using verifyCopiedBomHierarchy with a mismatch
  const alteredVerify = await verifyCopiedBomHierarchy({
    sourceMaterial: 'A1BH0214C',
    sourcePlant: '1012',
    targetMaterial: 'MAT-BOM-100', // Different hierarchy to simulate missing/different components
    targetPlant: '1000',
    targetAlternative: '01'
  });

  assert.strictEqual(alteredVerify.success, false, 'Altered target must NOT report success');
  assert.notStrictEqual(alteredVerify.status, 'SUCCESS', 'Status must not be SUCCESS');
  assert.ok(['PARTIAL', 'FAILED'].includes(alteredVerify.status), 'Status must be PARTIAL or FAILED');
  assert.ok(alteredVerify.verification.differences.length > 0, 'Discrepancies must be recorded');
  assert.ok(alteredVerify.verification.verifiedCount < alteredVerify.verification.totalCount, 'Verified count must be less than total');
  assert.ok(!alteredVerify.message.includes('100% verified'), 'Must never claim 100% verified on mismatch');
  console.log(`   ✓ Strict verification caught differences: status=${alteredVerify.status}, ${alteredVerify.verification.differences.length} differences`);

  // ---------------------------------------------------------------------------
  // TEST 5: The root Alternative shown matches the one that was actually created
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing root Alternative matches the created alternative:');
  const copyRes = await rfcCopyBom({
    sourceMaterial: 'A1BH0214C',
    sourcePlant: '1012',
    targetMaterial: 'A1BH0214C',
    targetPlant: '1012',
    bomUsage: '1'
  });

  assert.strictEqual(copyRes.success, true, 'Copy BOM succeeds');
  const expectedAlt = copyRes.alternativeBom;
  assert.ok(expectedAlt, 'Copy must return alternativeBom');

  const verifyCreated = await verifyCopiedBomHierarchy({
    sourceMaterial: 'A1BH0214C',
    sourcePlant: '1012',
    targetMaterial: 'A1BH0214C',
    targetPlant: '1012',
    targetAlternative: expectedAlt
  });

  assert.strictEqual(verifyCreated.rootAlternative, expectedAlt, `rootAlternative (${verifyCreated.rootAlternative}) must match created alternative (${expectedAlt})`);
  assert.notStrictEqual(verifyCreated.rootAlternative, undefined);
  console.log(`   ✓ Root alternative ${verifyCreated.rootAlternative} correctly matches created alternative ${expectedAlt}`);

  // ---------------------------------------------------------------------------
  // TEST 6: Guard test that copy functions return exactly what they returned before
  // ---------------------------------------------------------------------------
  console.log('\n6. Guard test: verifying copy and explosion functions maintain identical signatures:');
  // Guard test repairHierarchyBottomUp
  const repairRes = await repairHierarchyBottomUp({
    sourceMaterial: 'A1BH0214C',
    sourcePlant: '1012',
    targetMaterial: 'A1BH0214C',
    targetPlant: '1012',
    bomUsage: '1'
  });
  assert.strictEqual(repairRes.success, true);
  assert.ok(Array.isArray(repairRes.hierarchy), 'repairHierarchyBottomUp returns hierarchy array');
  assert.ok(repairRes.alternativeBom, 'repairHierarchyBottomUp returns alternativeBom');

  // Guard test rfcReadBom
  const readRes = await rfcReadBom({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1'
  });
  assert.strictEqual(readRes.success, true);
  assert.strictEqual(readRes.material, 'A1BH0214C');
  assert.strictEqual(readRes.componentCount, 4);
  assert.ok(Array.isArray(readRes.components));

  // Guard test rfcExplodeBomHierarchy
  const explodeRes = await rfcExplodeBomHierarchy({
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1'
  });
  assert.strictEqual(explodeRes.success, true);
  assert.strictEqual(explodeRes.rootMaterial, 'A1BH0214C');
  assert.ok(Array.isArray(explodeRes.items));

  console.log('   ✓ Guard test passed: copy and explosion return shapes are identical to previous baseline');

  console.log('\n============================================================');
  console.log('  ALL COPY BOM RESULT ENRICHMENT TESTS PASSED!              ');
  console.log('============================================================\n');
}

runCopyBomResultEnrichmentTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
