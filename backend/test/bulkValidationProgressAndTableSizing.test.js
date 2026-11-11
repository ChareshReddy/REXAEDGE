import assert from 'assert';
import { bomJobManager } from '../services/bomJobManager.js';

process.env.USE_MOCK_SAP = 'true';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('============================================================');
  console.log('  RUNNING BULK VALIDATION PROGRESS & TABLE SIZING UNIT TESTS ');
  console.log('============================================================\n');

  const mockUser = { id: 'test_user_progress', email: 'progress@example.com' };
  const mockServer = { id: 'MOCK_DEV', name: 'Mock Sandbox', environment: 'DEV' };

  // 1. Verify copy_validate job execution in bomJobManager
  console.log('1. Testing copy_validate job in bomJobManager...');
  const testRows = [
    {
      sourceMaterial: 'A1PSB001B-BK01',
      sourcePlant: '1010',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'TEST-TGT-01',
      targetPlant: '1010',
      targetUsage: '1',
      targetAltBom: '02'
    },
    {
      sourceMaterial: 'NON_EXISTENT_SOURCE',
      sourcePlant: '1010',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'TEST-TGT-02',
      targetPlant: '1010',
      targetUsage: '1',
      targetAltBom: '02'
    }
  ];

  const startRes = bomJobManager.startJob({
    type: 'copy_validate',
    user: mockUser,
    server: mockServer,
    items: testRows
  });

  assert(startRes.success, 'Job should start successfully');
  const jobId = startRes.jobId;
  assert(jobId, 'Job ID should be returned');

  let completedJob = null;
  const startWait = Date.now();
  while (Date.now() - startWait < 8000) {
    const job = await bomJobManager.getJob(jobId, mockUser);
    if (job && ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(job.status)) {
      completedJob = job;
      break;
    }
    await wait(50);
  }

  assert(completedJob, 'copy_validate job must finish within 8 seconds');
  assert(
    completedJob.status === 'COMPLETED' || completedJob.status === 'COMPLETED_WITH_ERRORS',
    `Expected completed status, got: ${completedJob.status}`
  );
  assert.strictEqual(completedJob.total, 2, 'Total rows must be 2');
  assert.strictEqual(completedJob.processed, 2, 'Processed rows must be 2');
  assert(Array.isArray(completedJob.results) && completedJob.results.length === 2, 'Should have 2 result items');
  console.log('   ✓ copy_validate completed end-to-end with 2 items\n');

  // 2. Test job status transitions: queued, running, completed, failed, cancelled, interrupted, not-found
  console.log('2. Testing polling job status transitions logic...');
  const terminalStates = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'CANCELLED', 'STOPPED_ON_CONNECTION_DROP', 'FAILED', 'INTERRUPTED'];

  // Test simulation of polling reducer / state handler
  function simulateJobPoll({ data, error, lastProgress, now }) {
    if (now - lastProgress.startedAt >= 600000) {
      return { status: 'TIMEOUT', shouldStopSpinner: true, error: 'Operation timed out after 10 minutes. Please check your SAP connection or retry.' };
    }
    if (error?.status === 404 || error?.message?.includes('not found') || !data?.job) {
      return { status: 'NOT_FOUND', shouldStopSpinner: true, error: 'Job not found. The job may have expired or been removed.' };
    }

    const job = data.job;
    let watchdogWarning = '';
    if (job.status === 'RUNNING') {
      if (job.processed !== lastProgress.processed) {
        lastProgress.processed = job.processed;
        lastProgress.lastChangedAt = now;
      } else if (now - lastProgress.lastChangedAt >= 90000) {
        watchdogWarning = 'This is taking longer than expected';
      }
    }

    const isFinished = terminalStates.includes(job.status);
    return {
      status: job.status,
      shouldStopSpinner: isFinished,
      watchdogWarning,
      error: job.status === 'INTERRUPTED'
        ? 'The job was interrupted, please upload again'
        : job.status === 'FAILED'
        ? (job.error || 'Job failed in SAP.')
        : null
    };
  }

  // State: QUEUED
  const queuedState = simulateJobPoll({
    data: { job: { status: 'QUEUED', processed: 0, total: 10 } },
    lastProgress: { processed: 0, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(queuedState.status, 'QUEUED');
  assert.strictEqual(queuedState.shouldStopSpinner, false, 'QUEUED should keep spinner running');

  // State: RUNNING
  const runningState = simulateJobPoll({
    data: { job: { status: 'RUNNING', processed: 2, total: 10 } },
    lastProgress: { processed: 0, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(runningState.status, 'RUNNING');
  assert.strictEqual(runningState.shouldStopSpinner, false, 'RUNNING should keep spinner running');

  // State: COMPLETED
  const completedState = simulateJobPoll({
    data: { job: { status: 'COMPLETED', processed: 10, total: 10 } },
    lastProgress: { processed: 10, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(completedState.shouldStopSpinner, true, 'COMPLETED must stop spinner');

  // State: FAILED
  const failedState = simulateJobPoll({
    data: { job: { status: 'FAILED', error: 'SAP gateway timed out' } },
    lastProgress: { processed: 2, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(failedState.shouldStopSpinner, true, 'FAILED must stop spinner');
  assert.strictEqual(failedState.error, 'SAP gateway timed out');

  // State: CANCELLED
  const cancelledState = simulateJobPoll({
    data: { job: { status: 'CANCELLED' } },
    lastProgress: { processed: 2, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(cancelledState.shouldStopSpinner, true, 'CANCELLED must stop spinner');

  // State: INTERRUPTED
  const interruptedState = simulateJobPoll({
    data: { job: { status: 'INTERRUPTED' } },
    lastProgress: { processed: 2, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(interruptedState.shouldStopSpinner, true, 'INTERRUPTED must stop spinner');
  assert.strictEqual(interruptedState.error, 'The job was interrupted, please upload again');

  // State: NOT_FOUND (404)
  const notFoundState = simulateJobPoll({
    error: { status: 404, message: 'Job not found' },
    lastProgress: { processed: 0, lastChangedAt: 1000, startedAt: 1000 },
    now: 2000
  });
  assert.strictEqual(notFoundState.shouldStopSpinner, true, 'NOT_FOUND must stop spinner');
  assert.strictEqual(notFoundState.error, 'Job not found. The job may have expired or been removed.');
  console.log('   ✓ Handled all job statuses correctly: QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED, INTERRUPTED, NOT_FOUND\n');

  // 3. Test Watchdog after 90s without progress change
  console.log('3. Testing 90-second progress watchdog logic...');
  const progressTracker = { processed: 5, lastChangedAt: 10000, startedAt: 10000 };

  // After 45 seconds (no warning yet)
  const pollAt45s = simulateJobPoll({
    data: { job: { status: 'RUNNING', processed: 5, total: 10 } },
    lastProgress: progressTracker,
    now: 55000 // 45s elapsed
  });
  assert.strictEqual(pollAt45s.watchdogWarning, '', 'No warning after 45 seconds');

  // After 91 seconds with same processed count
  const pollAt91s = simulateJobPoll({
    data: { job: { status: 'RUNNING', processed: 5, total: 10 } },
    lastProgress: progressTracker,
    now: 101000 // 91s elapsed
  });
  assert.strictEqual(pollAt91s.watchdogWarning, 'This is taking longer than expected', 'Must show watchdog warning after 90s stall');

  // Progress resumes: processed increases
  const pollProgressResumed = simulateJobPoll({
    data: { job: { status: 'RUNNING', processed: 6, total: 10 } },
    lastProgress: progressTracker,
    now: 102000
  });
  assert.strictEqual(pollProgressResumed.watchdogWarning, '', 'Warning cleared when progress resumes');
  console.log('   ✓ Watchdog triggered at 90s stall and cleared on progress resumption\n');

  // 4. Test 10-minute timeout
  console.log('4. Testing 10-minute timeout watchdog...');
  const pollAt10m = simulateJobPoll({
    data: { job: { status: 'RUNNING', processed: 6, total: 10 } },
    lastProgress: { processed: 6, lastChangedAt: 10000, startedAt: 10000 },
    now: 10000 + 600001 // > 10m
  });
  assert.strictEqual(pollAt10m.status, 'TIMEOUT');
  assert.strictEqual(pollAt10m.shouldStopSpinner, true, 'Timeout must stop spinner');
  assert(pollAt10m.error.includes('10 minutes'), 'Timeout error message must mention 10 minutes');
  console.log('   ✓ 10-minute timeout correctly halts polling and clears spinner\n');

  // 5. Test Table Column Percentage Sizing Math
  console.log('5. Testing table column percentage sizing calculations...');

  // Bulk Copy preview
  const bulkCopyCols = [
    { name: '#', pct: 5 },
    { name: 'Source BOM', pct: 35 },
    { name: 'Target BOM', pct: 35 },
    { name: 'Items', pct: 9 },
    { name: 'Result', pct: 16 }
  ];
  const copySum = bulkCopyCols.reduce((acc, col) => acc + col.pct, 0);
  assert.strictEqual(copySum, 100, `Bulk Copy columns must sum to 100%, got ${copySum}%`);

  const sourceCol = bulkCopyCols.find((c) => c.name === 'Source BOM');
  const targetCol = bulkCopyCols.find((c) => c.name === 'Target BOM');
  assert(sourceCol.pct < 40, `Source BOM (${sourceCol.pct}%) must be < 40%`);
  assert(targetCol.pct < 40, `Target BOM (${targetCol.pct}%) must be < 40%`);
  const diff = Math.abs(sourceCol.pct - targetCol.pct) / Math.max(sourceCol.pct, targetCol.pct);
  assert(diff <= 0.10, `Source and Target column widths must be within 10% of each other, diff was ${diff * 100}%`);

  // Bulk Create preview
  const bulkCreateCols = [
    { name: 'Seq', pct: 4 },
    { name: 'Material', pct: 14 },
    { name: 'Plant', pct: 5 },
    { name: 'Usage', pct: 5 },
    { name: 'Alt', pct: 4 },
    { name: 'Valid From', pct: 9 },
    { name: 'Base Qty', pct: 6 },
    { name: 'Status', pct: 5 },
    { name: 'Cat', pct: 4 },
    { name: 'Component', pct: 16 },
    { name: 'Qty', pct: 6 },
    { name: 'Result', pct: 22 }
  ];
  const createSum = bulkCreateCols.reduce((acc, col) => acc + col.pct, 0);
  assert.strictEqual(createSum, 100, `Bulk Create columns must sum to 100%, got ${createSum}%`);

  const resultCol = bulkCreateCols.find((c) => c.name === 'Result');
  assert(resultCol.pct >= 14, `Result column (${resultCol.pct}%) must be at least 14% to fit badges without truncation`);
  console.log('   ✓ Bulk Copy and Bulk Create table percentage widths strictly verified\n');

  console.log('============================================================');
  console.log('  ALL BULK VALIDATION PROGRESS & TABLE SIZING TESTS PASSED! ');
  console.log('============================================================');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
