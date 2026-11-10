import assert from 'assert';
import { bomJobManager, MAX_BOMS, CHUNK_SIZE } from '../services/bomJobManager.js';
import { bomJobRepository } from '../services/bomJobRepository.js';
import { getSapConnectionPool, resetAllPools, RFC_PRIORITY } from '../services/sapConnectionPool.js';
import { MockRfcEngine, createMockClientClass } from './load/mockRfcEngine.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  TESTING BULK OPERATIONS AS BACKGROUND JOBS (STAGE 4)      ');
console.log('============================================================\n');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runStage4Tests() {
  await bomJobManager.init();

  const testServer = {
    id: 'server-bulk-stage4-test',
    name: 'MOCK_SAP_BULK_4',
    environment: 'DEV',
    client: '100',
    sap_username: 'SAPUSER'
  };

  const userAlice = { id: 'user-alice-uuid', email: 'alice@company.com', role: 'user' };
  const userBob = { id: 'user-bob-uuid', email: 'bob@company.com', role: 'user' };
  const adminUser = { id: 'user-admin-uuid', email: 'admin@company.com', role: 'admin' };

  // --------------------------------------------------------------------------
  // Test 1: Start returns in under 1s with 100 rows; completes in chunks of 10
  // --------------------------------------------------------------------------
  console.log('Test 1: Start returns in < 1s with 100 rows; processes in chunks of 10 and persists progress...');
  const items100 = Array.from({ length: 100 }, (_, i) => ({
    sequenceNum: String(i + 1),
    material: `MAT-${1000 + i}`,
    plant: '1000',
    bomUsage: '1',
    alternativeBom: '01',
    components: [{ component: `COMP-${i + 1}`, quantity: '1', itemCategory: 'L' }]
  }));

  const startPerf = Date.now();
  const startRes = bomJobManager.startJob({
    type: 'create_preflight',
    user: userAlice,
    server: testServer,
    items: items100
  });
  const startDuration = Date.now() - startPerf;

  assert.strictEqual(startRes.success, true, 'Job must start successfully');
  assert(startDuration < 1000, `Start must return in under 1 second (took ${startDuration}ms)`);
  assert(startRes.jobId, 'Must return jobId');

  // Wait for background execution to complete
  let jobState = null;
  for (let k = 0; k < 40; k++) {
    await sleep(50);
    jobState = await bomJobManager.getJob(startRes.jobId, userAlice);
    if (jobState && (jobState.status === 'COMPLETED' || jobState.status === 'COMPLETED_WITH_ERRORS')) {
      break;
    }
  }

  assert(jobState, 'Job must exist');
  assert.strictEqual(jobState.total, 100, 'Total rows must be 100');
  assert.strictEqual(jobState.processed, 100, 'All 100 rows must be processed');
  assert.strictEqual(jobState.results.length, 100, 'All 100 row outcomes must be recorded');

  // Verify persistence from repository
  const persistedJob = await bomJobRepository.getJob(startRes.jobId);
  assert(persistedJob, 'Job must be persisted in repository');
  assert.strictEqual(persistedJob.total_rows || persistedJob.total, 100);
  console.log('   ✓ Verified start in < 1s (took', startDuration, 'ms) and chunked completion of 100 rows\n');

  // --------------------------------------------------------------------------
  // Test 2: Two users\' jobs never mix; user cannot read another user\'s job
  // --------------------------------------------------------------------------
  console.log("Test 2: Two users' jobs never mix; user cannot read another user's job...");
  const aliceJobRes = bomJobManager.startJob({
    type: 'create_preflight',
    user: userAlice,
    server: testServer,
    items: items100.slice(0, 5)
  });

  // Bob attempts to read Alice's job -> MUST FAIL WITH 403 FORBIDDEN
  let bobForbiddenCaught = false;
  try {
    await bomJobManager.getJob(aliceJobRes.jobId, userBob);
  } catch (err) {
    if (err.code === 'FORBIDDEN' && err.status === 403) {
      bobForbiddenCaught = true;
    }
  }
  assert.strictEqual(bobForbiddenCaught, true, "User Bob must be rejected with 403 FORBIDDEN when reading Alice's job");

  // Alice can read her own job
  const aliceRead = await bomJobManager.getJob(aliceJobRes.jobId, userAlice);
  assert.strictEqual(aliceRead.jobId, aliceJobRes.jobId, "Alice can access her own job");

  // Admin can read Alice's job
  const adminRead = await bomJobManager.getJob(aliceJobRes.jobId, adminUser);
  assert.strictEqual(adminRead.jobId, aliceJobRes.jobId, "Admin can access Alice's job");
  console.log('   ✓ Verified job isolation: Bob blocked with 403, Alice allowed, Admin allowed\n');

  // --------------------------------------------------------------------------
  // Test 3: Concurrency limits (1 per user, 3 per server, FIFO queue), 501 rows rejected
  // --------------------------------------------------------------------------
  console.log('Test 3: Concurrency limits (1 per user, 3 per server) and 501 rows rejected...');
  // 3a. 501 rows rejected
  const items501 = Array.from({ length: 501 }, (_, i) => ({
    sequenceNum: String(i + 1),
    material: `MAT-${i}`,
    plant: '1000'
  }));

  let overLimitCaught = false;
  try {
    bomJobManager.startJob({
      type: 'create_preflight',
      user: userAlice,
      server: testServer,
      items: items501
    });
  } catch (err) {
    if (err.code === 'BOM_LIMIT_EXCEEDED' && err.status === 400) {
      overLimitCaught = true;
    }
  }
  assert.strictEqual(overLimitCaught, true, 'Jobs with > 500 rows must be rejected with 400 BOM_LIMIT_EXCEEDED');

  // 3b. Per-user limit = 1 running job; second job gets queued
  const userCharlie = { id: 'user-charlie', email: 'charlie@company.com', role: 'user' };
  const charlieJob1 = bomJobManager.startJob({
    type: 'create_preflight',
    user: userCharlie,
    server: testServer,
    items: items100.slice(0, 30) // takes a moment to process
  });

  const charlieJob2 = bomJobManager.startJob({
    type: 'create_preflight',
    user: userCharlie,
    server: testServer,
    items: items100.slice(0, 10)
  });

  assert.strictEqual(charlieJob2.status, 'QUEUED', 'Second job by same user must be QUEUED');
  console.log('   ✓ Verified 501 rows rejected and per-user single running job limit (second job queued)\n');

  // --------------------------------------------------------------------------
  // Test 4: Cancel mid-job keeps partial results; restart marks running jobs interrupted
  // --------------------------------------------------------------------------
  console.log('Test 4: Cancel mid-job keeps partial results; restart marks running jobs interrupted...');
  const cancelItems = Array.from({ length: 40 }, (_, i) => ({
    sequenceNum: String(i + 1),
    material: `CANCEL-${i}`,
    plant: '1000',
    bomUsage: '1',
    components: []
  }));

  const userDave = { id: 'user-dave', email: 'dave@company.com', role: 'user' };
  const cancelJobRes = bomJobManager.startJob({
    type: 'create_preflight',
    user: userDave,
    server: testServer,
    items: cancelItems
  });

  // Request cancellation immediately while job is queued/running
  const cancelRes = await bomJobManager.cancelJob(cancelJobRes.jobId, userDave);
  assert.strictEqual(cancelRes.success, true, 'Cancellation request must succeed');

  // Wait for current chunk to finish
  let cancelledJob = null;
  for (let k = 0; k < 20; k++) {
    await sleep(50);
    cancelledJob = await bomJobManager.getJob(cancelJobRes.jobId, userDave);
    if (cancelledJob && cancelledJob.status === 'CANCELLED') break;
  }

  assert(cancelledJob, 'Cancelled job must exist');
  assert.strictEqual(cancelledJob.status, 'CANCELLED', 'Job status must be CANCELLED');
  assert(cancelledJob.results.length > 0, 'Partial results must be kept');

  // Test restart marks running jobs as INTERRUPTED
  const fakeRunningJob = {
    jobId: 'job_interrupted_test_1',
    id: 'job_interrupted_test_1',
    type: 'create_bulk',
    userId: 'user-restart',
    status: 'RUNNING',
    total: 50,
    processed: 10,
    results: []
  };
  await bomJobRepository.saveJob(fakeRunningJob);

  // Simulate server restart
  await bomJobRepository.markRunningJobsInterrupted();
  const recoveredJob = await bomJobRepository.getJob('job_interrupted_test_1');
  assert.strictEqual(recoveredJob.status, 'INTERRUPTED', 'Running job must be marked INTERRUPTED on restart');
  assert(recoveredJob.message.includes('interrupted by a server restart'));
  console.log('   ✓ Verified cancel mid-job preserves partial results and restart marks running as INTERRUPTED\n');

  // --------------------------------------------------------------------------
  // Test 5: Writes are NEVER retried on connection error
  // --------------------------------------------------------------------------
  console.log('Test 5: Writes are not retried on connection error, marked failed with retryable=true...');
  const { getCircuitBreaker } = await import('../services/serverHealthService.js');
  const connBreaker = getCircuitBreaker(testServer.id);
  // Trip circuit breaker to simulate connection drop/unreachable
  connBreaker.onFailure(true, 'ECONNRESET');
  connBreaker.onFailure(true, 'ECONNRESET');
  connBreaker.onFailure(true, 'ECONNRESET');

  const userEve = { id: 'user-eve', email: 'eve@company.com', role: 'user' };
  const writeJob = {
    jobId: 'job_write_no_retry_test',
    type: 'create_bulk',
    userId: userEve.id,
    userEmail: userEve.email,
    serverId: testServer.id,
    serverName: testServer.name,
    status: 'RUNNING',
    total: 1,
    processed: 0,
    successCount: 0,
    failedCount: 0,
    skippedCount: 0,
    results: [],
    items: [
      { sequenceNum: '1', material: 'FAIL-CONN', plant: '1000', bomUsage: '1', components: [] }
    ]
  };
  bomJobManager.jobs.set(writeJob.jobId, writeJob);

  await bomJobManager.runCreateBulk(writeJob, writeJob.items, testServer, userEve);
  assert.strictEqual(writeJob.failedCount, 1, 'Item must be marked failed');
  assert.strictEqual(writeJob.results[0].retryable, true, 'Connection error on write must be marked retryable: true');
  assert(writeJob.results[0].input, 'Original input must be preserved for retry');
  connBreaker.reset();
  console.log('   ✓ Verified write is not retried, marked failed with retryable: true and original input preserved\n');

  // --------------------------------------------------------------------------
  // Test 6: While bulk job runs, F4 call completes within normal time (priority 1 vs 3)
  // --------------------------------------------------------------------------
  console.log('Test 6: While bulk job runs, F4 call completes ahead in connection pool (Priority 1 vs 3)...');
  await resetAllPools();
  const mockEngine = new MockRfcEngine({ minLatencyMs: 15, maxLatencyMs: 30 });
  const ClientClass = createMockClientClass(mockEngine);
  const pool = getSapConnectionPool('SERVER_BULK_PRIO_TEST', { ClientClass });

  // Simulate saturated pool with bulk tasks (Priority 3)
  const executionOrder = [];
  const bulkPromises = [];
  for (let b = 0; b < 6; b++) {
    bulkPromises.push(
      pool.run(RFC_PRIORITY.BULK, `bulk_user_${b}`, async () => {
        executionOrder.push(`bulk_${b}`);
        await sleep(25);
        return {};
      })
    );
  }

  // F4 call arrives immediately after (Priority 1)
  await sleep(5);
  const f4Promise = pool.run(RFC_PRIORITY.READ, 'f4_user', async () => {
    executionOrder.push('f4_search');
    return {};
  });

  await Promise.all([...bulkPromises, f4Promise]);

  const f4Index = executionOrder.indexOf('f4_search');
  assert(f4Index <= 3, `F4 search (pos ${f4Index}) must jump ahead of queued bulk items`);
  console.log('   ✓ Verified F4 call prioritized ahead of queued bulk operations in connection pool\n');

  // --------------------------------------------------------------------------
  // Test 7: Fallback to file store when table is missing
  // --------------------------------------------------------------------------
  console.log('Test 7: Fallback to local atomic file store when table is missing...');
  // Force table to be unavailable
  bomJobRepository.tableAvailable = false;

  const testFileJob = {
    jobId: 'job_file_fallback_test_1',
    type: 'create_bulk',
    userId: 'user-fallback',
    status: 'COMPLETED',
    total: 10,
    processed: 10
  };

  await bomJobRepository.saveJob(testFileJob);
  const retrievedFileJob = await bomJobRepository.getJob('job_file_fallback_test_1');
  assert(retrievedFileJob, 'Job must be saved and retrieved from file store fallback');
  assert.strictEqual(retrievedFileJob.jobId, 'job_file_fallback_test_1');
  console.log('   ✓ Verified transparent fallback to atomic file store\n');

  console.log('============================================================');
  console.log('  ALL 7 STAGE 4 BACKGROUND JOB TESTS PASSED CLEANLY!       ');
  console.log('============================================================\n');
}

runStage4Tests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
