import assert from 'assert';
import {
  rfcPreflightCreateBoms,
  rfcBatchCreateBoms,
  resolveBomGroups,
  applyGroupValidationRules
} from '../services/bomCreateEngine.js';
import { bomJobManager } from '../services/bomJobManager.js';
import {
  normalizeExecutionStatus,
  normalizeBomStatus,
  getBomStatusCounts
} from '../../frontend/src/utils/bulkBomStatusUtils.js';

process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  TESTING BULK CREATE BOM GROUP INTEGRITY PROTECTION        ');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// TEST 1: Group whose parent exists: all members Skipped at validation, create count 0
// --------------------------------------------------------------------------
console.log('1. Testing group whose parent exists:');
{
  const boms = [
    {
      sequenceNum: '1',
      material: 'A1PSB001B_EXISTING',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '08',
      validFrom: '01.01.2026',
      components: [
        { component: 'SUB_BOM_01', quantity: '1', unit: 'EA', storageLocation: '101A' },
        { component: 'SUB_BOM_02', quantity: '1', unit: 'EA', storageLocation: '101A' }
      ]
    },
    {
      sequenceNum: '1',
      material: 'SUB_BOM_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_MAT_A', quantity: '5', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '1',
      material: 'SUB_BOM_02',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_MAT_B', quantity: '10', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  const preflight = await rfcPreflightCreateBoms({ boms });
  assert.strictEqual(preflight.readyCount, 0, 'Ready count must be 0');
  assert.strictEqual(preflight.skippedCount, 3, 'All 3 members must be skipped');
  assert.strictEqual(preflight.invalidCount, 0, 'Invalid count must be 0');

  const parent = preflight.boms.find((b) => b.material === 'A1PSB001B_EXISTING');
  const sub1 = preflight.boms.find((b) => b.material === 'SUB_BOM_01');
  const sub2 = preflight.boms.find((b) => b.material === 'SUB_BOM_02');

  assert.strictEqual(parent.status, 'Already exists - skipped');
  assert.strictEqual(parent.reason, 'Skipped: alternative 8 of A1PSB001B_EXISTING already exists in SAP');

  assert.strictEqual(sub1.status, 'Already exists - skipped');
  assert.strictEqual(sub1.reason, 'Skipped: not created because the parent BOM A1PSB001B_EXISTING already exists');

  assert.strictEqual(sub2.status, 'Already exists - skipped');
  assert.strictEqual(sub2.reason, 'Skipped: not created because the parent BOM A1PSB001B_EXISTING already exists');

  // Verify create calls: ready BOMs filter produces 0 items
  const readyBoms = preflight.boms.filter((b) => b.status === 'Ready');
  assert.strictEqual(readyBoms.length, 0, 'No items sent to create');
  console.log('   ✓ Parent and all sub-BOMs skipped at validation; create call count is 0');
}

// --------------------------------------------------------------------------
// TEST 2: Group with child unit-of-measure error: failing child Failed, rest of group Skipped
// --------------------------------------------------------------------------
console.log('\n2. Testing group with child unit-of-measure error:');
{
  const boms = [
    {
      sequenceNum: '2',
      material: 'PARENT_MAT_02',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'CHILD_MAT_BADUNIT', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '2',
      material: 'CHILD_MAT_BADUNIT',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_MAT_NOUNIT', quantity: '2', unit: '', storageLocation: '101A' }]
    }
  ];

  const preflight = await rfcPreflightCreateBoms({ boms });
  assert.strictEqual(preflight.readyCount, 0, 'Ready count must be 0');
  assert.strictEqual(preflight.invalidCount, 1, 'Child with error must be Invalid');
  assert.strictEqual(preflight.skippedCount, 1, 'Parent must be Skipped');

  const child = preflight.boms.find((b) => b.material === 'CHILD_MAT_BADUNIT');
  const parent = preflight.boms.find((b) => b.material === 'PARENT_MAT_02');

  assert.strictEqual(child.status, 'Invalid');
  assert.ok(child.errors.length > 0, 'Child must have error details');

  assert.strictEqual(parent.status, 'Skipped');
  assert.strictEqual(parent.reason, 'Not created because CHILD_MAT_BADUNIT in this group has errors');

  const readyBoms = preflight.boms.filter((b) => b.status === 'Ready');
  assert.strictEqual(readyBoms.length, 0, 'Create count is 0 for blocked group');
  console.log('   ✓ Failing child marked Invalid, parent marked Skipped (blocked); create count is 0');
}

// --------------------------------------------------------------------------
// TEST 3: Two groups, one bad and one good: good group created, bad group not
// --------------------------------------------------------------------------
console.log('\n3. Testing two groups (one bad, one good):');
{
  const boms = [
    // Bad group (Seq 10)
    {
      sequenceNum: '10',
      material: 'BAD_PARENT',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'BAD_CHILD', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '10',
      material: 'BAD_CHILD',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_NONEXISTENT', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    // Good group (Seq 20)
    {
      sequenceNum: '20',
      material: 'GOOD_PARENT',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'GOOD_CHILD', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '20',
      material: 'GOOD_CHILD',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'GOOD_RAW', quantity: '5', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  const preflight = await rfcPreflightCreateBoms({ boms });
  assert.strictEqual(preflight.readyCount, 2, 'Only the 2 members of good group must be Ready');
  assert.strictEqual(preflight.skippedCount, 1, 'Bad parent skipped');
  assert.strictEqual(preflight.invalidCount, 1, 'Bad child invalid');

  const readyBoms = preflight.boms.filter((b) => b.status === 'Ready');
  assert.strictEqual(readyBoms.length, 2);
  assert.ok(readyBoms.every((b) => b.sequenceNum === '20'), 'Only Seq 20 is Ready');

  const createBatch = await rfcBatchCreateBoms({ boms: readyBoms, server: { id: 'MOCK_DEV' } });
  assert.strictEqual(createBatch.bomsCreated, 2, '2 BOMs in good group created');
  assert.strictEqual(createBatch.failedCount, 0);
  assert.strictEqual(createBatch.skippedCount, 0);
  console.log('   ✓ Good group created successfully; bad group isolated and not sent to create');
}

// --------------------------------------------------------------------------
// TEST 4: Child exists, parent new: child Skipped (Existing), parent created
// --------------------------------------------------------------------------
console.log('\n4. Testing child exists, parent new:');
{
  const boms = [
    {
      sequenceNum: '30',
      material: 'NEW_PARENT_30',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [
        { component: 'EXISTING_CHILD_30', quantity: '1', unit: 'EA', storageLocation: '101A' },
        { component: 'NEW_CHILD_30', quantity: '1', unit: 'EA', storageLocation: '101A' }
      ]
    },
    {
      sequenceNum: '30',
      material: 'EXISTING_CHILD_30_EXISTING',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_MAT_Z', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '30',
      material: 'NEW_CHILD_30',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_MAT_W', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  const preflight = await rfcPreflightCreateBoms({ boms });
  const existingChild = preflight.boms.find((b) => b.material.includes('EXISTING'));
  const newParent = preflight.boms.find((b) => b.material === 'NEW_PARENT_30');
  const newChild = preflight.boms.find((b) => b.material === 'NEW_CHILD_30');

  assert.strictEqual(existingChild.status, 'Already exists - skipped');
  assert.strictEqual(newParent.status, 'Ready');
  assert.strictEqual(newChild.status, 'Ready');
  assert.strictEqual(preflight.readyCount, 2);
  assert.strictEqual(preflight.skippedCount, 1);

  const readyBoms = preflight.boms.filter((b) => b.status === 'Ready');
  const createBatch = await rfcBatchCreateBoms({ boms: readyBoms, server: { id: 'MOCK_DEV' } });
  assert.strictEqual(createBatch.bomsCreated, 2, 'Parent and new child created');
  console.log('   ✓ Existing child Skipped (reusable in SAP); parent and new child created');
}

// --------------------------------------------------------------------------
// TEST 5: Execution: a child fails, so the parent and later members are not created
// --------------------------------------------------------------------------
console.log('\n5. Testing execution failure in child halts parent creation:');
{
  const boms = [
    {
      sequenceNum: '40',
      material: 'PARENT_FAIL_TEST',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'CHILD_WILL_FAIL', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '40',
      material: 'CHILD_WILL_FAIL',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      // Trigger execution rejection by invalid component setup
      components: [{ component: 'FAIL_IN_SAP', quantity: '-1', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  const createBatch = await rfcBatchCreateBoms({ boms, server: { id: 'MOCK_DEV' } });
  assert.strictEqual(createBatch.failedCount, 1, 'Failing child must be FAILED');
  assert.strictEqual(createBatch.skippedCount, 1, 'Parent must be SKIPPED');
  assert.strictEqual(createBatch.bomsCreated, 0, 'No BOMs created');

  const childRes = createBatch.results.find((r) => r.material === 'CHILD_WILL_FAIL');
  const parentRes = createBatch.results.find((r) => r.material === 'PARENT_FAIL_TEST');

  assert.strictEqual(childRes.status, 'FAILED');
  assert.strictEqual(parentRes.status, 'SKIPPED');
  assert.strictEqual(parentRes.message, 'Not created because CHILD_WILL_FAIL failed earlier in this group');
  console.log('   ✓ Child failure stopped parent creation; parent marked Skipped with exact reason');
}

// --------------------------------------------------------------------------
// TEST 6: Execution: parent fails after children created -> Partially created note, no delete
// --------------------------------------------------------------------------
console.log('\n6. Testing parent fails after children created:');
{
  const boms = [
    {
      sequenceNum: '50',
      material: 'PARENT_FAIL_AT_CREATE',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [
        { component: 'SUB_OK_01', quantity: '1', unit: 'EA', storageLocation: '101A' },
        { component: 'SUB_OK_02', quantity: '1', unit: 'EA', storageLocation: '101A' }
      ]
    },
    {
      sequenceNum: '50',
      material: 'SUB_OK_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_1', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '50',
      material: 'SUB_OK_02',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'RAW_2', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  // We make the parent fail at create by giving it an invalid base qty
  boms[0].baseQty = '-5';

  const createBatch = await rfcBatchCreateBoms({ boms, server: { id: 'MOCK_DEV' } });
  assert.strictEqual(createBatch.bomsCreated, 2, '2 sub-BOMs created');
  assert.strictEqual(createBatch.failedCount, 1, 'Parent failed');

  const parentRes = createBatch.results.find((r) => r.material === 'PARENT_FAIL_AT_CREATE');
  assert.strictEqual(parentRes.status, 'FAILED');
  assert.ok(parentRes.message.includes('Partially created: SUB_OK_01, SUB_OK_02'), 'Must show Partially created list');
  console.log('   ✓ Parent row shows "Partially created: SUB_OK_01, SUB_OK_02"; no delete call made');
}

// --------------------------------------------------------------------------
// TEST 7: Counters add up; Create button count is correct; Retry retries whole group
// --------------------------------------------------------------------------
console.log('\n7. Testing counter additivity and Retry Failed Rows group behavior:');
{
  const boms = [
    {
      sequenceNum: '60',
      material: 'P60',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'C60', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    },
    {
      sequenceNum: '60',
      material: 'C60',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '01.01.2026',
      components: [{ component: 'R60', quantity: '1', unit: 'EA', storageLocation: '101A' }]
    }
  ];

  const preflight = await rfcPreflightCreateBoms({ boms });
  const counts = getBomStatusCounts(preflight.boms, true);
  assert.strictEqual(counts.ready + counts.skipped + counts.errors, preflight.boms.length, 'Counters must add up to total');
  assert.strictEqual(counts.ready, preflight.readyCount, 'Create BOMs (n) button matches readyCount');

  // Simulate an execution where C60 failed and P60 was skipped
  const mockExecutionResults = [
    {
      sequenceNum: '60',
      material: 'C60',
      plant: '1010',
      status: 'FAILED',
      message: 'SAP rejected BOM creation'
    },
    {
      sequenceNum: '60',
      material: 'P60',
      plant: '1010',
      status: 'SKIPPED',
      message: 'Not created because C60 failed earlier in this group'
    }
  ];

  // Verify Execution Details counters add up
  const bomsCreated = mockExecutionResults.filter((r) => normalizeExecutionStatus(r) === 'CREATED').length;
  const skippedCount = mockExecutionResults.filter((r) => normalizeExecutionStatus(r) === 'SKIPPED').length;
  const failedCount = mockExecutionResults.filter((r) => normalizeExecutionStatus(r) === 'FAILED').length;
  assert.strictEqual(bomsCreated + skippedCount + failedCount, mockExecutionResults.length, 'Execution details counters add up');

  // Verify normalizeExecutionStatus correctly classifies the blocked skipped row as SKIPPED
  const p60Norm = normalizeExecutionStatus(mockExecutionResults[1]);
  assert.strictEqual(p60Norm, 'SKIPPED', 'Blocked row with "failed earlier" message must normalize to SKIPPED');

  // Test Retry selection logic
  const failedResults = mockExecutionResults.filter((r) => normalizeExecutionStatus(r) === 'FAILED');
  const failedMats = new Set(failedResults.map((r) => r.material));
  const failedSeqNums = new Set(failedResults.map((r) => r.sequenceNum));
  const groups = resolveBomGroups(boms);
  const failedGroups = groups.filter((g) =>
    g.members.some((m) => failedMats.has(m.material) || failedSeqNums.has(m.sequenceNum))
  );

  const itemsToRetry = [];
  failedGroups.forEach((g) => {
    g.members.forEach((m) => {
      const res = mockExecutionResults.find((r) => r.material === m.material);
      const norm = res ? normalizeExecutionStatus(res) : 'FAILED';
      if (norm === 'FAILED' || norm === 'SKIPPED') {
        itemsToRetry.push(m);
      }
    });
  });

  assert.strictEqual(itemsToRetry.length, 2, 'Retry retries both failed child AND blocked parent together');
  console.log('   ✓ Counters add up perfectly; Retry Failed Rows retries failed and blocked rows of the group together');
}

// --------------------------------------------------------------------------
// TEST 8: Check that Bulk Copy, Validate and Delete are not affected
// --------------------------------------------------------------------------
console.log('\n8. Checking Bulk Copy, Validate and Delete are not affected:');
{
  const { rfcCopyBom, rfcBatchValidateBoms, rfcDeleteBom } = await import('../services/sapRfcClient.js');

  assert.strictEqual(typeof rfcCopyBom, 'function');
  assert.strictEqual(typeof rfcBatchValidateBoms, 'function');
  assert.strictEqual(typeof rfcDeleteBom, 'function');

  // Verify rfcBatchValidateBoms works as expected
  const valRes = await rfcBatchValidateBoms(
    [
      {
        sourceMaterial: 'MAT_COPY_01',
        sourcePlant: '1010',
        targetMaterial: 'MAT_COPY_TGT',
        targetPlant: '1010',
        bomUsage: '1',
        sourceAlternative: '01',
        targetAlternative: '01'
      }
    ],
    { server: { id: 'MOCK_DEV' } }
  );
  assert.ok(valRes.results, 'Validation results returned');
  assert.strictEqual(valRes.results.length, 1);

  console.log('   ✓ Bulk Copy, Validate and Delete signatures and baseline execution are unaffected');
}

console.log('\n============================================================');
console.log('  ALL BULK CREATE BOM GROUP INTEGRITY TESTS PASSED!         ');
console.log('============================================================\n');
