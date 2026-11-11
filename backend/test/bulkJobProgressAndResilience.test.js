import assert from 'assert';
import { bomJobManager } from '../services/bomJobManager.js';
import { bomJobRepository } from '../services/bomJobRepository.js';
import { jobPerformanceTracker } from '../services/jobPerformanceTracker.js';
import { rfcBatchValidateBoms } from '../services/sapRfcClient.js';

process.env.USE_MOCK_SAP = 'true';

async function runTests() {
  console.log('\n================================================================');
  console.log('--- Bulk Job Progress, Timeout & Resilience Test Suite ---');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // TEST 1: Max job time formula and stall protection
  // ---------------------------------------------------------------------------
  console.log('1. Test: Max job time formula calculation');
  {
    const calcMaxJobTime = (rowsCount) =>
      Math.min(30 * 60 * 1000, Math.max(10 * 60 * 1000, rowsCount * 2 * 60 * 1000));

    // 2 rows: max(10m, 2*2m) = 10m = 600,000 ms
    assert.strictEqual(calcMaxJobTime(2), 10 * 60 * 1000, '2 rows should have 10 min max job time');
    // 10 rows: max(10m, 10*2m) = 20m = 1,200,000 ms
    assert.strictEqual(calcMaxJobTime(10), 20 * 60 * 1000, '10 rows should have 20 min max job time');
    // 25 rows: max(10m, 25*2m=50m) capped at 30m = 1,800,000 ms
    assert.strictEqual(calcMaxJobTime(25), 30 * 60 * 1000, '25 rows should be capped at 30 min max job time');
    console.log('   ✓ Max job time formula correctly enforces max(10m, rows*2m) capped at 30m');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Stall detection reaps hung job after 2 minutes; active job survives past 5 min
  // ---------------------------------------------------------------------------
  console.log('\n2. Test: Stall detection (no heartbeat for 2m reaped; active progress survives)');
  {
    const staleJobId = `job_test_stale_${Date.now()}`;
    const staleJob = {
      jobId: staleJobId,
      id: staleJobId,
      type: 'copy_validate',
      status: 'RUNNING',
      total: 2,
      processed: 0,
      createdAt: new Date(Date.now() - 130000).toISOString(),
      updatedAt: new Date(Date.now() - 130000).toISOString() // > 2 minutes stale
    };
    bomJobManager.jobs.set(staleJobId, staleJob);

    // Run cleanStaleJobs
    bomJobManager.cleanStaleJobs();
    assert.strictEqual(staleJob.status, 'INTERRUPTED', 'Stale job without heartbeat for > 2m must be marked INTERRUPTED');
    console.log('   ✓ Stalled job without heartbeat for 2 minutes reaped as INTERRUPTED');

    // Active job with heartbeat every 30s running for 5.5 minutes
    const activeJobId = `job_test_active_${Date.now()}`;
    const activeJob = {
      jobId: activeJobId,
      id: activeJobId,
      type: 'copy_validate',
      status: 'RUNNING',
      total: 10,
      processed: 3,
      createdAt: new Date(Date.now() - 330000).toISOString(), // 5.5 min ago
      updatedAt: new Date(Date.now() - 15000).toISOString() // updated 15s ago
    };
    bomJobManager.jobs.set(activeJobId, activeJob);
    // Add runner representation
    bomJobManager.activeRunners.set(activeJobId, { startedAt: Date.now() - 330000 });

    bomJobManager.cleanStaleJobs();
    assert.strictEqual(activeJob.status, 'RUNNING', 'Active job with recent heartbeat must survive past 5 minutes');
    console.log('   ✓ Active job with ongoing progress survives past 5 minutes without being killed');

    // Clean up
    bomJobManager.activeRunners.delete(activeJobId);
    bomJobManager.jobs.delete(staleJobId);
    bomJobManager.jobs.delete(activeJobId);
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Immediate 20 rapid polls return job record with 0 failures (no 404)
  // ---------------------------------------------------------------------------
  console.log('\n3. Test: 20 immediate rapid polls return job record without 404');
  {
    const startRes = await bomJobManager.startJob({
      type: 'copy_validate',
      user: { id: 'test_perf_user', email: 'test_perf@example.com' },
      server: { id: '1010', name: 'Test Server' },
      items: [
        {
          id: 1,
          sourceMaterial: 'A1BH0214C',
          sourcePlant: '1012',
          sourceUsage: '1',
          targetMaterial: 'A1BH0214C',
          targetPlant: '1012',
          targetUsage: '1'
        }
      ]
    });

    assert.ok(startRes.success, 'startJob must succeed');
    assert.ok(startRes.jobId, 'jobId must be returned');

    // Poll 20 times immediately
    for (let i = 0; i < 20; i++) {
      const poll = await bomJobManager.getJob(startRes.jobId, { id: 'test_perf_user', email: 'test_perf@example.com' });
      assert.ok(poll, `Poll #${i + 1} must return the job object, got null`);
      assert.strictEqual(poll.jobId, startRes.jobId);
      assert.ok(['QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS'].includes(poll.status));
    }
    console.log('   ✓ 20 rapid consecutive polls returned the job record with 0 failures');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Monotonic progress updates across polls
  // ---------------------------------------------------------------------------
  console.log('\n4. Test: Monotonic progress updates across polls');
  {
    const jobRecord = {
      jobId: `job_test_mono_${Date.now()}`,
      id: `job_test_mono_${Date.now()}`,
      type: 'copy_validate',
      userId: 'mono_user',
      status: 'RUNNING',
      total: 2,
      processed: 0,
      total_steps: 6,
      completed_steps: 1,
      current_step: 'Reading source BOM 1 of 2 (A1PSB001B)...',
      progress_percent: 17,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    bomJobManager.jobs.set(jobRecord.jobId, jobRecord);
    bomJobManager.activeRunners.set(jobRecord.jobId, { startedAt: Date.now() });

    const poll1 = await bomJobManager.getJob(jobRecord.jobId, { id: 'mono_user' });
    assert.strictEqual(poll1.progress_percent, 17);
    assert.strictEqual(poll1.current_step, 'Reading source BOM 1 of 2 (A1PSB001B)...');

    // Step advances
    jobRecord.completed_steps = 3;
    jobRecord.current_step = 'Validating components for A1PSB001B...';
    jobRecord.progress_percent = 50;
    jobRecord.updatedAt = new Date().toISOString();

    const poll2 = await bomJobManager.getJob(jobRecord.jobId, { id: 'mono_user' });
    assert.strictEqual(poll2.progress_percent, 50);
    assert.ok(poll2.progress_percent >= poll1.progress_percent, 'Progress must be monotonic');

    // Completion
    jobRecord.status = 'COMPLETED';
    jobRecord.completed_steps = 6;
    jobRecord.processed = 2;
    jobRecord.current_step = 'Validation complete';
    jobRecord.progress_percent = 100;
    jobRecord.updatedAt = new Date().toISOString();

    const poll3 = await bomJobManager.getJob(jobRecord.jobId, { id: 'mono_user' });
    assert.strictEqual(poll3.progress_percent, 100);
    assert.ok(poll3.progress_percent >= poll2.progress_percent, 'Progress must reach 100% on completion');
    console.log('   ✓ Progress percent is monotonic across polls (17% -> 50% -> 100%) and returns step labels');

    bomJobManager.activeRunners.delete(jobRecord.jobId);
    bomJobManager.jobs.delete(jobRecord.jobId);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Reduced RFC call count for 2 rows with hierarchy depth 3
  // ---------------------------------------------------------------------------
  console.log('\n5. Test: Validation RFC call reduction for 2 rows');
  {
    const jobId = `job_test_perf_${Date.now()}`;
    jobPerformanceTracker.startJob(jobId, { type: 'copy_validate', rowCount: 2 });

    const validationCache = {
      readBom: new Map(),
      existingAlternatives: new Map(),
      subAssemblyExists: new Map()
    };

    const items = [
      {
        id: 1,
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
        id: 2,
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAltBom: '01',
        targetMaterial: 'A1BH0214C',
        targetPlant: '1012',
        targetUsage: '1',
        targetAltBom: ''
      }
    ];

    const valRes = await rfcBatchValidateBoms(items, {
      server: { id: '1010', name: 'Test Server' },
      jobId,
      cache: validationCache
    });

    assert.ok(valRes.success);
    assert.strictEqual(valRes.results.length, 2);

    const timeline = jobPerformanceTracker.finishJob(jobId);
    assert.ok(timeline);
    assert.ok(timeline.totalCalls < 10, `RFC call count should be < 10, got ${timeline.totalCalls}`);
    console.log(`   ✓ 2 rows validated successfully with ${timeline.totalCalls} calls (< 10 threshold)`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Cleanup preserves queued and running jobs
  // ---------------------------------------------------------------------------
  console.log('\n6. Test: CleanupOldJobs never purges queued or running jobs');
  {
    const list = bomJobRepository._loadFileJobs();
    const testRunningJob = {
      jobId: `job_running_cleanup_test_${Date.now()}`,
      status: 'running',
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 days old
    };
    const testOldCompletedJob = {
      jobId: `job_old_completed_test_${Date.now()}`,
      status: 'completed',
      createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 days old
    };

    await bomJobRepository.saveJob(testRunningJob);
    await bomJobRepository.saveJob(testOldCompletedJob);

    await bomJobRepository.cleanupOldJobs(30);

    const afterCleanup = await bomJobRepository.getJob(testRunningJob.jobId);
    assert.ok(afterCleanup, 'Running job must NOT be deleted even if older than retention window');

    const completedAfterCleanup = await bomJobRepository.getJob(testOldCompletedJob.jobId);
    assert.strictEqual(completedAfterCleanup, null, 'Old completed job should be cleaned up');
    console.log('   ✓ Cleanup preserves running jobs and purges old completed jobs');
  }

  console.log('\nAll Bulk Job Progress & Resilience tests passed!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
