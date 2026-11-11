import assert from 'assert';
import { rfcPreflightCreateBoms } from '../services/bomCreateEngine.js';
import { bomJobManager } from '../services/bomJobManager.js';

process.env.USE_MOCK_SAP = 'true';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJobCompletion(jobId, user, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const job = await bomJobManager.getJob(jobId, user);
    if (job && ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(job.status)) {
      return job;
    }
    await wait(50);
  }
  return await bomJobManager.getJob(jobId, user);
}

console.log('============================================================');
console.log('  RUNNING BULK VALIDATE OPTIONS REGRESSION TEST SUITE       ');
console.log('============================================================\n');

async function runRegressionTests() {
  const mockUser = { id: 'reg_user_01', email: 'reg_user@example.com' };
  const mockServer = { id: 'SANDBOX', name: 'SAP-SANDBOX', environment: 'DEV' };

  // Prepare 6 BOMs: 3 valid, 1 bad material, 1 bad plant, 1 bad component
  const testBoms = [
    {
      sequenceNum: '1',
      material: 'MAT-VALID-01',
      plant: '1000',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-VALID-01', quantity: '1', itemCategory: 'L' }]
    },
    {
      sequenceNum: '2',
      material: 'MAT-VALID-02',
      plant: '1000',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-VALID-02', quantity: '2', itemCategory: 'L' }]
    },
    {
      sequenceNum: '3',
      material: 'MAT-VALID-03',
      plant: '1000',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-VALID-03', quantity: '3', itemCategory: 'L' }]
    },
    {
      sequenceNum: '4',
      material: 'MAT-NONEXISTENT',
      plant: '1000',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-VALID-04', quantity: '1', itemCategory: 'L' }]
    },
    {
      sequenceNum: '5',
      material: 'MAT-VALID-05',
      plant: 'PLANT-INVALID',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-VALID-05', quantity: '1', itemCategory: 'L' }]
    },
    {
      sequenceNum: '6',
      material: 'MAT-VALID-06',
      plant: '1000',
      bomUsage: '1',
      alternativeBom: '01',
      components: [{ rowNum: 1, component: 'COMP-NONEXISTENT', quantity: '1', itemCategory: 'L' }]
    }
  ];

  console.log('1. Executing direct preflight validation (rfcPreflightCreateBoms)...');
  const directRes = await rfcPreflightCreateBoms({ boms: testBoms, server: mockServer });
  assert.strictEqual(directRes.success, true, 'Direct preflight must succeed');
  assert.strictEqual(directRes.boms.length, 6, 'Must return 6 validated BOMs');

  console.log('2. Executing job-based preflight validation (bomJobManager)...');
  const jobStart = bomJobManager.startJob({
    type: 'create_preflight',
    user: mockUser,
    server: mockServer,
    items: testBoms
  });
  assert(jobStart.success, 'Job start must succeed');

  const completedJob = await waitForJobCompletion(jobStart.jobId, mockUser);
  assert(completedJob, 'Job must complete');
  assert.strictEqual(completedJob.results.length, 6, 'Job must produce 6 results');

  console.log('3. Asserting row results across direct and job-based flows:');
  for (let i = 0; i < 6; i++) {
    const directBom = directRes.boms[i];
    const jobResult = completedJob.results[i];

    // Assert no message contains "is not defined" or "options"
    const directMsg = directBom.reason || directBom.errors?.join(' | ') || '';
    const jobMsg = jobResult.message || '';

    assert(!directMsg.includes('is not defined'), `Direct row ${i + 1} message must not contain "is not defined": ${directMsg}`);
    assert(!directMsg.includes('options'), `Direct row ${i + 1} message must not contain "options": ${directMsg}`);
    assert(!jobMsg.includes('is not defined'), `Job row ${i + 1} message must not contain "is not defined": ${jobMsg}`);
    assert(!jobMsg.includes('options'), `Job row ${i + 1} message must not contain "options": ${jobMsg}`);

    // Assert job-based flow returns same messages as direct validate
    assert.strictEqual(jobMsg, directMsg, `Job row ${i + 1} message must match direct message`);

    if (i < 3) {
      // Valid BOMs
      assert.strictEqual(directBom.status, 'Ready', `BOM ${i + 1} direct status must be Ready`);
      assert.strictEqual(jobResult.status, 'Ready', `BOM ${i + 1} job status must be Ready`);
      assert.strictEqual(directMsg, 'Ready for creation', `BOM ${i + 1} must be Ready for creation`);
      console.log(`   ✓ BOM ${i + 1} (Valid): Status = Ready, Message = "${jobMsg}"`);
    } else if (i === 3) {
      // Bad material
      assert(['Invalid', 'Failed'].includes(directBom.status), 'BOM 4 direct status must be Invalid/Failed');
      assert(['Invalid', 'Failed'].includes(jobResult.status), 'BOM 4 job status must be Invalid/Failed');
      assert.match(jobMsg, /Header material "MAT-NONEXISTENT" does not exist in SAP \(MARA\)/i);
      console.log(`   ✓ BOM 4 (Bad material): Status = ${jobResult.status}, Message = "${jobMsg}"`);
    } else if (i === 4) {
      // Bad plant
      assert(['Invalid', 'Failed'].includes(directBom.status), 'BOM 5 direct status must be Invalid/Failed');
      assert(['Invalid', 'Failed'].includes(jobResult.status), 'BOM 5 job status must be Invalid/Failed');
      assert.match(jobMsg, /Plant "PLANT-INVALID" does not exist in SAP \(T001W\)/i);
      console.log(`   ✓ BOM 5 (Bad plant): Status = ${jobResult.status}, Message = "${jobMsg}"`);
    } else if (i === 5) {
      // Bad component
      assert(['Invalid', 'Failed'].includes(directBom.status), 'BOM 6 direct status must be Invalid/Failed');
      assert(['Invalid', 'Failed'].includes(jobResult.status), 'BOM 6 job status must be Invalid/Failed');
      assert.match(jobMsg, /Component "COMP-NONEXISTENT" does not exist in SAP \(MARA\)/i);
      console.log(`   ✓ BOM 6 (Bad component): Status = ${jobResult.status}, Message = "${jobMsg}"`);
    }
  }

  console.log('\n============================================================');
  console.log('  ALL BULK VALIDATE OPTIONS REGRESSION TESTS PASSED (100%) ');
  console.log('============================================================');
}

runRegressionTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
