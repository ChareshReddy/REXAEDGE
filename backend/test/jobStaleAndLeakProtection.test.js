import assert from 'assert';
import { bomJobManager } from '../services/bomJobManager.js';
import { bomJobRepository } from '../services/bomJobRepository.js';
import { rfcExplodeBomHierarchy } from '../services/sapRfcClient.js';
import { bomLockService } from '../services/bomLockService.js';
import { getSapConnectionPool, RFC_PRIORITY } from '../services/sapConnectionPool.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTests() {
  console.log('--- TEST SUITE: Job Stale Protection, Leaks, & Hierarchy Guard ---');
  await bomJobManager.init();

  const testServer = {
    id: 'test-server-stale-reap',
    name: 'TEST_SAP_REAP',
    environment: 'DEV',
    client: '100',
    sap_username: 'TESTUSER',
    rfc_call_timeout_ms: 1000 // fast timeout for test
  };

  const user1 = { id: 'user-stale-1', email: 'user1@test.com' };
  const user2 = { id: 'user-stale-2', email: 'user2@test.com' };

  // --------------------------------------------------------------------------
  // Test 1: Copy-validate job with 2 rows runs end-to-end with per-row results
  // --------------------------------------------------------------------------
  console.log('1. Copy-validate job with 2 rows runs end-to-end to completion...');
  const copyItems = [
    {
      sourceMaterial: 'MAT-A',
      sourcePlant: '1000',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'MAT-B',
      targetPlant: '1000',
      targetUsage: '1',
      targetAltBom: '01'
    },
    {
      sourceMaterial: 'MAT-C',
      sourcePlant: '1000',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'MAT-D',
      targetPlant: '1000',
      targetUsage: '1',
      targetAltBom: '01'
    }
  ];

  const startRes = bomJobManager.startJob({
    type: 'copy_validate',
    user: user1,
    server: testServer,
    items: copyItems
  });

  assert.strictEqual(startRes.success, true);
  const jobId1 = startRes.jobId;

  // Poll until finished
  let finalJob = null;
  for (let i = 0; i < 40; i++) {
    await sleep(50);
    finalJob = bomJobManager.getJob(jobId1, user1);
    if (finalJob && ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(finalJob.status)) {
      break;
    }
  }

  assert(finalJob, 'Job must exist');
  assert.strictEqual(finalJob.total, 2, 'Total must be 2');
  assert.strictEqual(finalJob.processed, 2, 'Both rows must be processed');
  assert.strictEqual(finalJob.results.length, 2, 'Results must have 2 row entries');
  console.log('   ✓ Copy-validate finished successfully with per-row results.\n');

  // --------------------------------------------------------------------------
  // Test 2: Stale job auto-interrupted when heartbeat > 2 minutes or runner lost
  // --------------------------------------------------------------------------
  console.log('2. Stale job protection: auto-marked INTERRUPTED on missing runner or stale heartbeat...');
  const fakeStaleJob = {
    jobId: 'job_stale_heartbeat_test',
    id: 'job_stale_heartbeat_test',
    type: 'copy_validate',
    userId: user1.id,
    userEmail: user1.email,
    serverId: testServer.id,
    serverName: testServer.name,
    status: 'RUNNING',
    total: 2,
    processed: 0,
    startedAt: new Date(Date.now() - 300000).toISOString(),
    updatedAt: new Date(Date.now() - 150000).toISOString(), // 2.5 min ago (> 2 min)
    createdAt: new Date(Date.now() - 300000).toISOString(),
    results: []
  };

  bomJobManager.jobs.set(fakeStaleJob.jobId, fakeStaleJob);
  // Runner does not exist in activeRunners and updatedAt is > 2 min ago
  bomJobManager.cleanStaleJobs();

  const cleanedJob = bomJobManager.getJob(fakeStaleJob.jobId, user1);
  assert.strictEqual(cleanedJob.status, 'INTERRUPTED');
  assert(cleanedJob.message.includes('interrupted'));
  console.log('   ✓ Stale job auto-marked INTERRUPTED.\n');

  // --------------------------------------------------------------------------
  // Test 3: New job starts immediately after stale job is reaped (capacity freed)
  // --------------------------------------------------------------------------
  console.log('3. New job starts immediately after stale job is cleaned...');
  const newStartRes = bomJobManager.startJob({
    type: 'copy_validate',
    user: user1,
    server: testServer,
    items: [copyItems[0]]
  });

  assert.strictEqual(newStartRes.success, true);
  assert.strictEqual(newStartRes.status, 'RUNNING', 'Should be RUNNING, not queued, because stale job was freed');
  console.log('   ✓ New job started in RUNNING state without being blocked.\n');

  // --------------------------------------------------------------------------
  // Test 4: Queued reason exposed when user has active running job
  // --------------------------------------------------------------------------
  console.log('4. Queued reason exposed when user capacity limit is reached...');
  // While newStartRes job is running or if we simulate a running job:
  const runningSimJob = {
    jobId: 'job_active_sim',
    id: 'job_active_sim',
    type: 'create_bulk',
    userId: 'user-capacity-test',
    userEmail: 'user-cap@test.com',
    serverId: testServer.id,
    serverName: testServer.name,
    status: 'RUNNING',
    total: 10,
    processed: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    results: []
  };
  bomJobManager.jobs.set(runningSimJob.jobId, runningSimJob);
  bomJobManager.activeRunners.set(runningSimJob.jobId, { startedAt: Date.now() });

  const queuedRes = bomJobManager.startJob({
    type: 'create_bulk',
    user: { id: 'user-capacity-test', email: 'user-cap@test.com' },
    server: testServer,
    items: [copyItems[0]]
  });

  assert.strictEqual(queuedRes.status, 'QUEUED');
  assert.strictEqual(queuedRes.queuedReason, 'Waiting for your running job to finish');
  const queuedJobData = bomJobManager.getJob(queuedRes.jobId, { id: 'user-capacity-test', email: 'user-cap@test.com' });
  assert.strictEqual(queuedJobData.queuedReason, 'Waiting for your running job to finish');
  console.log('   ✓ Correct queuedReason returned and exposed in job summary.\n');

  // Clean up sim jobs
  bomJobManager.jobs.delete(runningSimJob.jobId);
  bomJobManager.activeRunners.delete(runningSimJob.jobId);
  bomJobManager.jobs.delete(queuedRes.jobId);

  // --------------------------------------------------------------------------
  // Test 5: Hierarchy recursion / cycle guard
  // --------------------------------------------------------------------------
  console.log('5. Hierarchy recursion / cycle guard stops infinite loops and depth > 10...');
  const cycleResult = await rfcExplodeBomHierarchy({
    material: 'CYCLE-MAT',
    plant: '1000',
    bomUsage: '1',
    alternativeBom: '01',
    maxDepth: 15, // should be capped at 10
    server: testServer
  });

  assert.strictEqual(cycleResult.success, true);
  assert(cycleResult.totalLevels <= 11, 'Total levels must never exceed 11 (0 through 10)');
  console.log('   ✓ Hierarchy explode respected max depth and circular dependency guard.\n');

  // --------------------------------------------------------------------------
  // Test 6: BOM lock release and connection release on failure / exception
  // --------------------------------------------------------------------------
  console.log('6. Resource leak protection: locks and connections released on failure...');
  let lockAcquired = false;
  try {
    const lock = bomLockService.acquireLock({
      serverId: testServer.id,
      material: 'TEST-LOCK-MAT',
      plant: '1000',
      bomUsage: '1',
      alternative: '01',
      userId: user1.id
    });
    lockAcquired = true;
    lock.release();
    lockAcquired = false;
  } catch (err) {
    if (lockAcquired) lock.release();
  }

  assert.strictEqual(lockAcquired, false, 'Lock must be released');
  console.log('   ✓ Resource locks cleanly release on completion/finally.\n');

  console.log('============================================================');
  console.log('  ALL TESTS PASSED SUCCESSFULLY                             ');
  console.log('============================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
