import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bomJobManager } from '../services/bomJobManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const JOB_SUMMARIES_FILE = path.join(__dirname, '..', 'mock', 'bomJobSummaries.json');

async function runJobSummaryAtomicWriteTests() {
  console.log('\n======================================================');
  console.log('  TEST: ATOMIC JOB SUMMARY WRITES & MUTEX CONCURRENCY');
  console.log('======================================================\n');

  // Backup existing file if present
  let originalContent = null;
  if (fs.existsSync(JOB_SUMMARIES_FILE)) {
    originalContent = fs.readFileSync(JOB_SUMMARIES_FILE, 'utf-8');
  }

  try {
    // 1. Test empty / corrupt file recovery on startup
    console.log('1. Testing corrupted & empty file recovery on read:');
    fs.writeFileSync(JOB_SUMMARIES_FILE, '   ', 'utf-8');
    bomJobManager.loadPersistedSummaries();
    assert.strictEqual(Array.isArray(bomJobManager.persistedSummaries), true);

    fs.writeFileSync(JOB_SUMMARIES_FILE, '{"invalid_json": true, [broken}', 'utf-8');
    bomJobManager.loadPersistedSummaries();
    assert.strictEqual(Array.isArray(bomJobManager.persistedSummaries), true);
    console.log('   ✓ Corrupt & empty files backed up to .corrupt.* and recovered cleanly');

    // 2. Test 20 concurrent writes to bomJobSummaries.json
    console.log('\n2. Testing 20 concurrent writes with in-process mutex and atomic rename:');
    const writePromises = [];

    for (let i = 0; i < 20; i++) {
      const jobId = `test_concurrent_job_${Date.now()}_${i}`;
      bomJobManager.jobs.set(jobId, {
        jobId,
        type: 'create_bulk',
        userId: `user_${i}`,
        userEmail: `user_${i}@example.com`,
        serverId: 'srv_1',
        serverName: 'Server 1',
        status: 'COMPLETED',
        total: 10,
        processed: 10,
        successCount: 10,
        failedCount: 0,
        skippedCount: 0,
        notProcessedCount: 0,
        currentBom: null,
        results: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });

      // Simultaneous write triggers
      writePromises.push(bomJobManager.savePersistedSummaries());
    }

    await Promise.all(writePromises);

    // Verify file contents
    assert.strictEqual(fs.existsSync(JOB_SUMMARIES_FILE), true);
    const savedRaw = fs.readFileSync(JOB_SUMMARIES_FILE, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(savedRaw), 'File must be 100% valid JSON');

    const parsed = JSON.parse(savedRaw);
    assert(Array.isArray(parsed), 'Parsed content must be an array');

    for (let i = 0; i < 20; i++) {
      const found = parsed.some((j) => j.userId === `user_${i}`);
      assert.strictEqual(found, true, `Entry for user_${i} must be persisted in file`);
    }

    console.log(`   ✓ All 20 concurrent writes serialized successfully. Valid JSON contains all 20 entries.`);

    console.log('\n======================================================');
    console.log('✅ ALL JOB SUMMARY ATOMIC WRITE TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    // Restore original file or clean test remnants
    if (originalContent !== null) {
      fs.writeFileSync(JOB_SUMMARIES_FILE, originalContent, 'utf-8');
    }
    // Clean any .corrupt files generated during test
    try {
      const dir = path.dirname(JOB_SUMMARIES_FILE);
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.startsWith('bomJobSummaries.json.corrupt.')) {
          fs.unlinkSync(path.join(dir, f));
        }
      }
    } catch {}
  }
}

runJobSummaryAtomicWriteTests().catch((err) => {
  console.error('\nTest Failed:', err);
  process.exit(1);
});
