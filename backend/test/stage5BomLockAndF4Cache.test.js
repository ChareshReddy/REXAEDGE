import assert from 'assert';
import { bomLockService, normalizeBomLockKey, BomLockError } from '../services/bomLockService.js';
import { f4CacheService, F4_TTL } from '../services/f4CacheService.js';
import { SapConnectionPool, RFC_PRIORITY } from '../services/sapConnectionPool.js';
import { toFriendlyError } from '../utils/friendlyError.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  TESTING BOM LOCK LEASES, SAFE WRITES & F4 CACHING (STAGE 5)');
console.log('============================================================\n');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStage5Tests() {
  const serverA = 'server-test-a';
  const serverB = 'server-test-b';
  const userAlice = 'alice@company.com';
  const userBob = 'bob@company.com';

  // --------------------------------------------------------------------------
  // Test 1: Two different users writing the same BOM key: User Bob gets BOM_LOCKED
  // --------------------------------------------------------------------------
  console.log('Test 1: User B gets BOM_LOCKED fast when User A holds lock on same key...');
  bomLockService.clearAllLocks();

  const lockA = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-100',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userAlice
  });

  assert.ok(lockA && typeof lockA.release === 'function', 'User A should acquire lock');

  let bobBlocked = false;
  try {
    bomLockService.acquireLock({
      serverId: serverA,
      material: 'MAT-100',
      plant: '1000',
      bomUsage: '1',
      alternative: '01',
      userId: userBob
    });
  } catch (err) {
    bobBlocked = true;
    assert.strictEqual(err.code, 'BOM_LOCKED', 'Error code must be BOM_LOCKED');
    assert.strictEqual(err.status, 409, 'Status must be 409');
    assert.strictEqual(err.retryable, true, 'Lock error must be retryable');
    assert.ok(err.message.includes('being changed by another user'), 'User-friendly message expected');
    assert.ok(!err.message.includes(userAlice), 'Must NEVER expose User A identity or email');
  }

  assert.strictEqual(bobBlocked, true, 'User Bob must be blocked fast without waiting');
  lockA.release();
  console.log('   ✓ Verified User B gets BOM_LOCKED fast (409) with sanitized friendly message');

  // --------------------------------------------------------------------------
  // Test 2: Different BOM keys proceed concurrently without conflict
  // --------------------------------------------------------------------------
  console.log('Test 2: Two different users writing different BOM keys proceed concurrently...');
  bomLockService.clearAllLocks();

  const lock1 = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-AAA',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userAlice
  });

  const lock2 = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-BBB',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userBob
  });

  assert.ok(lock1 && lock2, 'Both locks on distinct materials must be granted simultaneously');
  lock1.release();
  lock2.release();
  console.log('   ✓ Verified concurrent writes to different BOM keys do not conflict');

  // --------------------------------------------------------------------------
  // Test 3: Lock is released cleanly on success and on error
  // --------------------------------------------------------------------------
  console.log('Test 3: withLock releases cleanly on success and on error...');
  bomLockService.clearAllLocks();

  const bomKey = { serverId: serverA, material: 'MAT-CLEAN', plant: '1000', bomUsage: '1', alternative: '01' };

  // Success path
  await bomLockService.withLock({ ...bomKey, userId: userAlice }, async () => {
    assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey(bomKey)), true);
  });
  assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey(bomKey)), false, 'Lock must be released after block');

  // Error path
  let thrown = false;
  try {
    await bomLockService.withLock({ ...bomKey, userId: userAlice }, async () => {
      assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey(bomKey)), true);
      throw new Error('Simulated write failure in SAP');
    });
  } catch (err) {
    thrown = true;
  }
  assert.strictEqual(thrown, true);
  assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey(bomKey)), false, 'Lock must be released in finally after error');

  // User Bob can immediately acquire after error
  const lockBobAfterErr = bomLockService.acquireLock({ ...bomKey, userId: userBob });
  assert.ok(lockBobAfterErr);
  lockBobAfterErr.release();
  console.log('   ✓ Verified lock is released cleanly in finally on success and error');

  // --------------------------------------------------------------------------
  // Test 4: Auto-expiry after lease duration (simulated crashed worker)
  // --------------------------------------------------------------------------
  console.log('Test 4: Lease auto-expires so crashed worker does not block future writes...');
  bomLockService.clearAllLocks();

  // Acquire with 50ms lease to test expiration deterministically
  bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-CRASH',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userAlice,
    leaseMs: 50
  });

  // Wait 60ms for lease to expire
  await sleep(65);

  // Bob acquires immediately without deadlock
  const bobRecoveredLock = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-CRASH',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userBob
  });

  assert.ok(bobRecoveredLock, 'Bob should acquire lock after lease expired');
  bobRecoveredLock.release();
  console.log('   ✓ Verified lease auto-expires cleanly after leaseMs without orphaned locks');

  // --------------------------------------------------------------------------
  // Test 5: Same user re-entrancy
  // --------------------------------------------------------------------------
  console.log('Test 5: Same user re-entering same key is allowed (nested validate then create)...');
  bomLockService.clearAllLocks();

  const outerLock = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-REENTRANT',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userAlice
  });

  // Same user re-entering
  const innerLock = bomLockService.acquireLock({
    serverId: serverA,
    material: 'MAT-REENTRANT',
    plant: '1000',
    bomUsage: '1',
    alternative: '01',
    userId: userAlice
  });

  assert.ok(innerLock, 'Same user should be granted re-entrant lock');

  // Bob is still blocked while Alice holds it
  assert.throws(() => {
    bomLockService.acquireLock({
      serverId: serverA,
      material: 'MAT-REENTRANT',
      plant: '1000',
      bomUsage: '1',
      alternative: '01',
      userId: userBob
    });
  }, (err) => err.code === 'BOM_LOCKED');

  // Release inner, Alice still holds outer
  innerLock.release();
  assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey({
    serverId: serverA,
    material: 'MAT-REENTRANT',
    plant: '1000',
    bomUsage: '1',
    alternative: '01'
  })), true, 'Still locked after 1st release');

  // Release outer, fully free
  outerLock.release();
  assert.strictEqual(bomLockService.isLocked(normalizeBomLockKey({
    serverId: serverA,
    material: 'MAT-REENTRANT',
    plant: '1000',
    bomUsage: '1',
    alternative: '01'
  })), false, 'Fully released after 2nd release');
  console.log('   ✓ Verified same-user re-entrancy works with refCounting');

  // --------------------------------------------------------------------------
  // Test 6: Safe writes: timeout/disconnect returns WRITE_OUTCOME_UNKNOWN (call count == 1)
  // --------------------------------------------------------------------------
  console.log('Test 6: Write timeout returns WRITE_OUTCOME_UNKNOWN with call count == 1 (no blind retries)...');
  let writeCallCount = 0;

  class MockWriteFailureClient {
    constructor() { this.isOpen = true; }
    async open() { this.isOpen = true; }
    async call(fn) {
      writeCallCount++;
      const err = new Error('RFC connection dropped during BAPI_MATERIAL_BOM_GROUP_CREATE');
      err.code = 'RFC_COMMUNICATION_FAILURE';
      throw err;
    }
    async close() { this.isOpen = false; }
    isAlive() { return this.isOpen; }
  }

  const writePool = new SapConnectionPool('server-write-test', {
    max_connections: 2,
    queue_timeout_ms: 5000,
    rfc_call_timeout_ms: 1000
  }, { ClientClass: MockWriteFailureClient });

  let writeErr = null;
  try {
    await writePool.run(RFC_PRIORITY.INTERACTIVE, userAlice, async (client) => {
      return await client.call('BAPI_MATERIAL_BOM_GROUP_CREATE', {});
    }, { isWrite: true });
  } catch (err) {
    writeErr = err;
  }

  assert.ok(writeErr, 'Write must fail');
  assert.strictEqual(writeErr.code, 'WRITE_OUTCOME_UNKNOWN', 'Error code must be WRITE_OUTCOME_UNKNOWN');
  assert.strictEqual(writeErr.status, 504, 'HTTP status must be 504');
  assert.strictEqual(writeErr.retryable, false, 'Must NOT be retryable');
  assert.strictEqual(writeCallCount, 1, 'Write must NEVER be retried blindly (call count == 1)');

  const friendly = toFriendlyError(writeErr);
  assert.strictEqual(friendly.code, 'WRITE_OUTCOME_UNKNOWN');
  assert.strictEqual(friendly.retryable, false);
  assert.ok(friendly.message.includes('verify using Display BOM'), 'Must instruct user to verify via Display BOM');
  console.log('   ✓ Verified write timeout returns WRITE_OUTCOME_UNKNOWN with 0 retries (count = 1)');

  // --------------------------------------------------------------------------
  // Test 7: F4 coalescing: 10 concurrent requests = exactly 1 RFC call
  // --------------------------------------------------------------------------
  console.log('Test 7: F4 cache coalesces 10 concurrent requests into 1 single RFC call...');
  f4CacheService.clear();

  let rfcCallCount = 0;
  const mockFetchFn = async () => {
    rfcCallCount++;
    await sleep(20); // simulate network latency
    return [
      { werks: '1001', name1: 'Plant 1001' },
      { werks: '1002', name1: 'Plant 1002' }
    ];
  };

  // 10 concurrent users requesting the plant list simultaneously
  const requests = Array.from({ length: 10 }, () =>
    f4CacheService.fetchWithCache({
      serverId: serverA,
      lookupType: 'plants',
      query: '',
      fetchFn: mockFetchFn
    })
  );

  const results = await Promise.all(requests);
  assert.strictEqual(results.length, 10, 'All 10 callers receive data');
  assert.strictEqual(rfcCallCount, 1, 'Exactly 1 RFC call must be made for all 10 coalesced requests');
  assert.strictEqual(results[0][0].werks, '1001');
  assert.strictEqual(results[9][0].werks, '1001');

  const stats = f4CacheService.getStats();
  assert.strictEqual(stats.coalesced_requests >= 9, true, 'At least 9 requests should be coalesced');
  console.log(`   ✓ Verified 10 concurrent requests coalesced into 1 RFC call (coalesced: ${stats.coalesced_requests})`);

  // --------------------------------------------------------------------------
  // Test 8: F4 cache server isolation (server A data not returned for server B)
  // --------------------------------------------------------------------------
  console.log('Test 8: F4 cache is strictly isolated between servers...');
  f4CacheService.clear();

  const dataA = await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'plants',
    query: '',
    fetchFn: async () => [{ werks: 'A001', name1: 'Plant Server A' }]
  });

  const dataB = await f4CacheService.fetchWithCache({
    serverId: serverB,
    lookupType: 'plants',
    query: '',
    fetchFn: async () => [{ werks: 'B001', name1: 'Plant Server B' }]
  });

  assert.strictEqual(dataA[0].werks, 'A001');
  assert.strictEqual(dataB[0].werks, 'B001');
  assert.notStrictEqual(dataA[0].werks, dataB[0].werks, 'Server A and B caches must be isolated');
  console.log('   ✓ Verified cache is strictly isolated between different servers');

  // --------------------------------------------------------------------------
  // Test 9: F4 cache TTL expiry triggers a new fetch
  // --------------------------------------------------------------------------
  console.log('Test 9: TTL expiry triggers a fresh fetch...');
  f4CacheService.clear();

  let fetchCount = 0;
  const testTtlFn = async () => {
    fetchCount++;
    return [{ value: `Fetch #${fetchCount}` }];
  };

  // Initial fetch with short 50ms TTL
  await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'materials',
    query: 'TEST',
    ttlMs: 50,
    fetchFn: testTtlFn
  });
  assert.strictEqual(fetchCount, 1);

  // Immediate second fetch within TTL: cache hit, no new fetch
  const cachedRes = await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'materials',
    query: 'TEST',
    ttlMs: 50,
    fetchFn: testTtlFn
  });
  assert.strictEqual(fetchCount, 1, 'Must hit cache within TTL');
  assert.strictEqual(cachedRes[0].value, 'Fetch #1');

  // Wait for TTL expiration
  await sleep(60);

  // Third fetch after TTL: triggers fresh fetch
  const freshRes = await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'materials',
    query: 'TEST',
    ttlMs: 50,
    fetchFn: testTtlFn
  });
  assert.strictEqual(fetchCount, 2, 'Must trigger fresh fetch after TTL expiration');
  assert.strictEqual(freshRes[0].value, 'Fetch #2');
  console.log('   ✓ Verified TTL expiry triggers fresh fetch');

  // --------------------------------------------------------------------------
  // Test 10: Failed RFC calls are NOT cached
  // --------------------------------------------------------------------------
  console.log('Test 10: Failed RFC calls are never cached (subsequent call retries)...');
  f4CacheService.clear();

  let attempt = 0;
  const failingFetchFn = async () => {
    attempt++;
    if (attempt === 1) {
      throw new Error('Temporary SAP RFC timeout');
    }
    return [{ werks: 'RECOVERED_1001' }];
  };

  // Attempt 1 fails
  let failed = false;
  try {
    await f4CacheService.fetchWithCache({
      serverId: serverA,
      lookupType: 'plants',
      query: 'FAIL_TEST',
      fetchFn: failingFetchFn
    });
  } catch (err) {
    failed = true;
  }
  assert.strictEqual(failed, true, 'First call should fail');

  // Attempt 2 succeeds immediately because failure was NOT cached
  const recovered = await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'plants',
    query: 'FAIL_TEST',
    fetchFn: failingFetchFn
  });

  assert.strictEqual(attempt, 2, 'Second call must re-attempt RFC fetch');
  assert.strictEqual(recovered[0].werks, 'RECOVERED_1001');
  console.log('   ✓ Verified failed calls are never cached');

  // --------------------------------------------------------------------------
  // Test 11: Admin cache clear endpoint functionality
  // --------------------------------------------------------------------------
  console.log('Test 11: Admin cache clear invalidates specific server or all...');
  f4CacheService.clear();

  await f4CacheService.fetchWithCache({
    serverId: serverA,
    lookupType: 'plants',
    query: 'Q1',
    fetchFn: async () => [{ werks: '1001' }]
  });

  await f4CacheService.fetchWithCache({
    serverId: serverB,
    lookupType: 'plants',
    query: 'Q1',
    fetchFn: async () => [{ werks: '2001' }]
  });

  assert.strictEqual(f4CacheService.getStats().total_entries, 2);

  // Clear server A only
  f4CacheService.clear(serverA);
  assert.strictEqual(f4CacheService.getStats().total_entries, 1);

  // Clear all
  f4CacheService.clear();
  assert.strictEqual(f4CacheService.getStats().total_entries, 0);
  console.log('   ✓ Verified admin cache clear invalidates targeted server or all entries');

  console.log('\n============================================================');
  console.log('  ALL 11 STAGE 5 LOCK & F4 CACHE TESTS PASSED CLEANLY!     ');
  console.log('============================================================\n');
}

runStage5Tests().catch((err) => {
  console.error('STAGE 5 TEST FAILED:', err);
  process.exit(1);
});
