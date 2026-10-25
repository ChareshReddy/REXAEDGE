import assert from 'assert';
import path from 'path';
import { fileURLToPath } from 'url';

process.env.USE_MOCK_SAP = 'true';

import {
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy,
  findLowestFreeAlternative,
  getExistingAlternatives,
  rfcBatchValidateBoms,
  rfcBatchCopyBoms
} from '../services/sapRfcClient.js';
import { bomJobManager } from '../services/bomJobManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('\n================================================================');
  console.log('--- Bulk Copy BOM Alternative Resolution Test Suite ---');
  console.log('================================================================\n');

  const targetMaterial = 'A1BH0214C';
  const targetPlant = '1012';
  const targetUsage = '1';

  // ---------------------------------------------------------------------------
  // TEST 1: Blank target alt with existing alt 1 in target
  // ---------------------------------------------------------------------------
  console.log('1. Test: Blank target alt with existing alt 1 in target');
  {
    // A1BH0214C in plant 1012 usage 1 has alt 01 in mock dataset
    const existingAlts = await getExistingAlternatives(targetMaterial, targetPlant, targetUsage);
    assert.ok(existingAlts.includes(1), 'Target BOM A1BH0214C/1012/1 should have alternative 1 existing in mock dataset');

    const res = await resolveTargetAlternativeForCopy({
      targetMaterial,
      targetPlant,
      targetUsage,
      targetAlternative: ''
    });

    assert.strictEqual(res.targetAlternative, '02', 'Blank target alt must resolve to 02 when alt 1 exists');
    assert.strictEqual(res.isAutoSelected, true, 'isAutoSelected must be true');
    assert.strictEqual(res.exists, false, 'exists must be false so it is not blocked');

    // Also test through rfcBatchValidateBoms
    const batchRes = await rfcBatchValidateBoms([
      {
        id: 1,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: '' // blank target alt
      }
    ]);

    assert.strictEqual(batchRes.success, true);
    assert.strictEqual(batchRes.results.length, 1);
    const row = batchRes.results[0];
    assert.strictEqual(row.status, 'VALID', `Expected status VALID, got ${row.status}: ${row.message}`);
    assert.strictEqual(row.targetAltBom, '02', 'Target Alt BOM column must show resolved alternative 02, not blank');
    console.log('   ✓ Resolved to alternative 02, status is VALID, targetAltBom populated');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Two rows with blank target alt to the same target BOM (file-internal collision prevention)
  // ---------------------------------------------------------------------------
  console.log('\n2. Test: Two rows with blank target alt to the same target BOM');
  {
    const batchRes = await rfcBatchValidateBoms([
      {
        id: 101,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: ''
      },
      {
        id: 102,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: ''
      }
    ]);

    assert.strictEqual(batchRes.results.length, 2);
    const [row1, row2] = batchRes.results;

    assert.strictEqual(row1.status, 'VALID', 'Row 1 should be VALID');
    assert.strictEqual(row1.targetAltBom, '02', 'Row 1 should be assigned 02');

    assert.strictEqual(row2.status, 'VALID', 'Row 2 should be VALID');
    assert.strictEqual(row2.targetAltBom, '03', 'Row 2 should be assigned 03 without collision');

    // Background job validation path verification
    const allocatedByTargetKey = new Map();
    const subJob = { results: [], successCount: 0, failedCount: 0, currentBom: null };
    await bomJobManager.runCopyValidate(subJob, [
      { id: 201, sourceMaterial: 'A1BH0214C', sourcePlant: '1012', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'A1BH0214C', targetPlant: '1012', targetUsage: '1', targetAltBom: '' },
      { id: 202, sourceMaterial: 'A1BH0214C', sourcePlant: '1012', sourceUsage: '1', sourceAltBom: '01', targetMaterial: 'A1BH0214C', targetPlant: '1012', targetUsage: '1', targetAltBom: '' }
    ]);

    assert.strictEqual(subJob.results[0].targetAltBom, '02');
    assert.strictEqual(subJob.results[1].targetAltBom, '03');
    console.log('   ✓ Row 1 got Alt 02, Row 2 got Alt 03: no collision with SAP or within batch');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Explicit existing alt (still blocked)
  // ---------------------------------------------------------------------------
  console.log('\n3. Test: Explicit existing alt (still blocked)');
  {
    const res = await resolveTargetAlternativeForCopy({
      targetMaterial: 'A1BH0214C',
      targetPlant: '1012',
      targetUsage: '1',
      targetAlternative: '1' // explicitly requested existing alt 1
    });

    assert.strictEqual(res.targetAlternative, '01');
    assert.strictEqual(res.exists, true, 'Explicitly requested alternative 1 should report exists: true');
    assert.strictEqual(res.isAutoSelected, false);

    // Verify rfcBatchValidateBoms blocks it with error message
    const batchRes = await rfcBatchValidateBoms([
      {
        id: 301,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: '01' // explicitly existing
      }
    ]);

    const row = batchRes.results[0];
    assert.strictEqual(row.status, 'ERROR', 'Explicitly existing alt must be blocked with ERROR');
    assert.ok(
      row.message.includes('Alternative 1 already exists in BOM A1BH0214C/1012/1'),
      `Expected message mentioning already exists, got: ${row.message}`
    );
    console.log(`   ✓ Correctly blocked with ERROR: "${row.message}"`);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Explicit new alt
  // ---------------------------------------------------------------------------
  console.log('\n4. Test: Explicit new alt');
  {
    const res = await resolveTargetAlternativeForCopy({
      targetMaterial: 'A1BH0214C',
      targetPlant: '1012',
      targetUsage: '1',
      targetAlternative: '12' // explicitly requested non-existing alt 12
    });

    assert.strictEqual(res.targetAlternative, '12');
    assert.strictEqual(res.exists, false, 'New alt 12 should not exist');
    assert.strictEqual(res.isAutoSelected, false);

    const batchRes = await rfcBatchValidateBoms([
      {
        id: 401,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: '12'
      }
    ]);

    const row = batchRes.results[0];
    assert.strictEqual(row.status, 'VALID');
    assert.strictEqual(row.targetAltBom, '12');
    console.log('   ✓ Explicit new alt 12 accepted as VALID');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Single Copy and Bulk Copy return the same resolved alternative for the same input
  // ---------------------------------------------------------------------------
  console.log('\n5. Test: Single Copy and Bulk Copy return the same resolved alternative');
  {
    const input = {
      targetMaterial: 'A1BH0214C',
      targetPlant: '1012',
      targetUsage: '1',
      targetAlternative: ''
    };

    // 1. Single Copy resolution call (as used in chat.js)
    const singleCopyResolution = await resolveTargetAlternativeForCopy(input);

    // 2. Bulk Copy resolution call (as used in rfcBatchValidateBoms)
    const bulkCopyBatch = await rfcBatchValidateBoms([
      {
        id: 501,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: ''
      }
    ]);
    const bulkCopyResolvedAlt = bulkCopyBatch.results[0].targetAltBom;

    assert.strictEqual(
      singleCopyResolution.targetAlternative,
      bulkCopyResolvedAlt,
      `Single copy (${singleCopyResolution.targetAlternative}) and bulk copy (${bulkCopyResolvedAlt}) must return the identical resolved alternative!`
    );
    assert.strictEqual(singleCopyResolution.targetAlternative, '02');
    console.log(`   ✓ Single Copy and Bulk Copy both resolved to: "${singleCopyResolution.targetAlternative}"`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Execution of batch copy resolves alternative identically in job execution
  // ---------------------------------------------------------------------------
  console.log('\n6. Test: Execution via runCopyBulk allocates distinct alternatives without collision');
  {
    const copyJob = {
      results: [],
      successCount: 0,
      failedCount: 0,
      currentBom: null,
      options: { copyHierarchy: false }
    };

    await bomJobManager.runCopyBulk(
      copyJob,
      [
        {
          id: 601,
          sourceMaterial: 'A1BH0214C',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'A1BH0214C',
          targetPlant: '1012',
          targetUsage: '1',
          targetAltBom: ''
        },
        {
          id: 602,
          sourceMaterial: 'A1BH0214C',
          sourcePlant: '1012',
          sourceUsage: '1',
          sourceAltBom: '01',
          targetMaterial: 'A1BH0214C',
          targetPlant: '1012',
          targetUsage: '1',
          targetAltBom: ''
        }
      ],
      null,
      { id: 'test_user', email: 'test@example.com' }
    );

    assert.strictEqual(copyJob.results.length, 2);
    assert.strictEqual(copyJob.results[0].status, 'SUCCESS');
    assert.strictEqual(copyJob.results[0].targetAltBom, '02');
    assert.strictEqual(copyJob.results[1].status, 'SUCCESS');
    assert.strictEqual(copyJob.results[1].targetAltBom, '03');
    console.log('   ✓ Execution path resolved Row 1 to Alt 02 and Row 2 to Alt 03 seamlessly');
  }

  console.log('\n================================================================');
  console.log('--- ALL 5 ALTERNATIVE RESOLUTION TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
