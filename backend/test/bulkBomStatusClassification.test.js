import assert from 'assert';
import {
  classifyBomStatus,
  normalizeBomStatus,
  getBomStatusCounts,
  filterBoms
} from '../../frontend/src/utils/bulkBomStatusUtils.js';

console.log('============================================================');
console.log('  TESTING BULK BOM STATUS CLASSIFICATION & FILTERING        ');
console.log('============================================================\n');

// 1. Ready without warning
console.log('1. Testing ready row without warning:');
{
  const bom = {
    material: 'MAT_READY_01',
    plant: '1001',
    status: 'VALID',
    errors: [],
    warnings: []
  };
  assert.strictEqual(classifyBomStatus(bom, true), 'ready');
  assert.strictEqual(normalizeBomStatus(bom, true), 'ready');
  console.log('   ✓ Classified strictly as "ready"');
}

// 2. Ready with warning (e.g. MARC plant extension)
console.log('\n2. Testing ready row with warning:');
{
  const bom = {
    material: 'MAT_WARN_02',
    plant: '1001',
    status: 'VALID',
    errors: [],
    warnings: ['Header material MAT_WARN_02 is not extended to plant 1001 (MARC).']
  };
  assert.strictEqual(classifyBomStatus(bom, true), 'ready');
  console.log('   ✓ Ready row with warning correctly classified as "ready"');
}

// 3. Error without warning
console.log('\n3. Testing error row without warning:');
{
  const bom = {
    material: 'MAT_FAIL_03',
    plant: '1001',
    status: 'ERROR',
    errors: ['Component RAW_MAT_01 does not exist in plant 1001.'],
    warnings: []
  };
  assert.strictEqual(classifyBomStatus(bom, true), 'error');
  console.log('   ✓ Classified strictly as "error"');
}

// 4. Error with warning (error takes precedence)
console.log('\n4. Testing error row with warning:');
{
  const bom = {
    material: 'MAT_FAIL_WARN_04',
    plant: '1001',
    status: 'FAILED',
    errors: ['Component does not exist in plant.'],
    warnings: ['Header material MARC warning']
  };
  assert.strictEqual(classifyBomStatus(bom, true), 'error');
  console.log('   ✓ Error row with warning classified as "error" (error takes precedence)');
}

// 5. Skipped (alternative exists)
console.log('\n5. Testing skipped row:');
{
  const bom = {
    material: 'MAT_SKIP_05',
    plant: '1001',
    status: 'SKIPPED',
    message: 'Alternative 01 already exists for MAT_SKIP_05 in plant 1001.'
  };
  assert.strictEqual(classifyBomStatus(bom, true), 'skipped');
  console.log('   ✓ Classified strictly as "skipped"');
}

// 6. Grouped BOM: header valid, but one component has error
console.log('\n6. Testing grouped BOM with component error:');
{
  const groupedBom = {
    sequenceNum: '1',
    material: 'MAT_GROUP_01',
    plant: '1001',
    status: 'VALID',
    components: [
      { component: 'COMP_A', status: 'VALID' },
      { component: 'COMP_B', status: 'ERROR', error: 'Invalid component item category' }
    ]
  };
  assert.strictEqual(classifyBomStatus(groupedBom, true), 'error');
  console.log('   ✓ Grouped BOM with component error classified as "error"');
}

// 7. Counts: Ready + Errors + Skipped = Total BOMs
console.log('\n7. Testing counts sum: Ready + Errors + Skipped = Total BOMs:');
{
  const boms = [
    { id: 1, status: 'VALID' },
    { id: 2, status: 'VALID', warnings: ['MARC warning'] },
    { id: 3, status: 'ERROR', errors: ['Missing material'] },
    { id: 4, status: 'FAILED', errors: ['Missing plant'], warnings: ['Some warning'] },
    { id: 5, status: 'SKIPPED', message: 'Alternative 01 already exists' }
  ];

  const counts = getBomStatusCounts(boms, true);
  assert.strictEqual(counts.all, 5, 'Total count must be 5');
  assert.strictEqual(counts.ready, 2, 'Ready count must be 2');
  assert.strictEqual(counts.errors, 2, 'Errors count must be 2');
  assert.strictEqual(counts.skipped, 1, 'Skipped count must be 1');
  assert.strictEqual(counts.ready + counts.errors + counts.skipped, counts.all, 'Ready + Errors + Skipped must equal Total');
  console.log('   ✓ Ready (2) + Errors (2) + Skipped (1) = Total BOMs (5)');
}

// 8. Filter agreement: card counts equal filtered results
console.log('\n8. Testing filterBoms agreement with status counts:');
{
  const boms = [
    { id: 1, material: 'STEEL_01', plant: '1001', status: 'VALID' },
    { id: 2, material: 'STEEL_02', plant: '1001', status: 'VALID', warnings: ['MARC warning'] },
    { id: 3, material: 'RUBBER_01', plant: '1001', status: 'ERROR', errors: ['Missing material'] },
    { id: 4, material: 'PLASTIC_01', plant: '1001', status: 'FAILED', errors: ['Invalid plant'] },
    { id: 5, material: 'COPPER_01', plant: '1001', status: 'SKIPPED', message: 'Alternative exists' }
  ];

  const counts = getBomStatusCounts(boms, true);

  const filteredAll = filterBoms(boms, { statusFilter: 'all', hasValidated: true });
  assert.strictEqual(filteredAll.length, counts.all);

  const filteredReady = filterBoms(boms, { statusFilter: 'ready', hasValidated: true });
  assert.strictEqual(filteredReady.length, counts.ready);

  const filteredErrors = filterBoms(boms, { statusFilter: 'errors', hasValidated: true });
  assert.strictEqual(filteredErrors.length, counts.errors);

  const filteredSkipped = filterBoms(boms, { statusFilter: 'skipped', hasValidated: true });
  assert.strictEqual(filteredSkipped.length, counts.skipped);

  // Search + filter combined
  const searchRubberReady = filterBoms(boms, { statusFilter: 'ready', searchTerm: 'RUBBER', hasValidated: true });
  assert.strictEqual(searchRubberReady.length, 0, 'No ready rows match RUBBER');

  const searchRubberError = filterBoms(boms, { statusFilter: 'errors', searchTerm: 'RUBBER', hasValidated: true });
  assert.strictEqual(searchRubberError.length, 1, 'One error row matches RUBBER');

  console.log('   ✓ filterBoms matches getBomStatusCounts exactly, and search + filter combined works');
}

// 9. Unvalidated state
console.log('\n9. Testing unvalidated state:');
{
  const boms = [
    { id: 1, status: 'pending' },
    { id: 2, status: 'not_validated' }
  ];
  const counts = getBomStatusCounts(boms, false);
  assert.strictEqual(counts.all, 2);
  assert.strictEqual(counts.ready, 0);
  assert.strictEqual(counts.errors, 0);
  assert.strictEqual(counts.skipped, 0);
  assert.strictEqual(counts.notValidated, 2);
  console.log('   ✓ Unvalidated state produces 0 ready, 0 errors, 0 skipped');
}

console.log('\n============================================================');
console.log('  ALL STATUS CLASSIFICATION TESTS PASSED!                   ');
console.log('============================================================\n');
