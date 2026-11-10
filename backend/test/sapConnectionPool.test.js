import assert from 'assert';
import {
  SapConnectionPool,
  getSapConnectionPool,
  getAllPoolStats,
  resetAllPools,
  RFC_PRIORITY,
  isConnectionLevelError
} from '../services/sapConnectionPool.js';
import { MockRfcEngine, createMockClientClass } from './load/mockRfcEngine.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  TEST: PER-SERVER RFC CONNECTION POOL & PRIORITY QUEUE      ');
console.log('============================================================\n');

async function runTests() {
  await resetAllPools();

  // -------------------------------------------------------------------------
  // Test 1: Never exceeds maxConnections with 50 concurrent calls
  // -------------------------------------------------------------------------
  console.log('1. Testing maxConnections cap under 50 concurrent calls:');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({
      name: 'SAP_CONCURRENCY_TEST',
      minLatencyMs: 10,
      maxLatencyMs: 25,
      maxConnections: 3
    });
    const ClientClass = createMockClientClass(mockEngine);

    const pool = new SapConnectionPool('SERVER_50_CALLS', {
      max_connections: 3,
      per_user_limit: 10,
      queue_timeout_ms: 10000,
      rfc_call_timeout_ms: 10000
    }, { ClientClass });

    let running = 0;
    let peakObserved = 0;

    const promises = Array.from({ length: 50 }, (_, i) => {
      const userId = `user_${i % 5}`;
      return pool.run(RFC_PRIORITY.READ, userId, async (client) => {
        running++;
        peakObserved = Math.max(peakObserved, running);
        await client.call('RFC_PING', {});
        running--;
        return { index: i, success: true };
      });
    });

    const results = await Promise.all(promises);
    assert.strictEqual(results.length, 50, 'All 50 calls must succeed');
    assert(peakObserved <= 3, `Observed concurrent calls (${peakObserved}) must not exceed maxConnections (3)`);
    assert(mockEngine.peakConnections <= 3, `Mock RFC engine peak connections (${mockEngine.peakConnections}) must not exceed 3`);

    const stats = pool.getStats();
    assert(stats.peakConnections <= 3, 'Pool stats peakConnections must be <= 3');
    console.log(`   ✓ 50 concurrent calls completed cleanly. Max concurrent connections strictly capped at ${peakObserved} (limit: 3)`);
  }

  // -------------------------------------------------------------------------
  // Test 2: Priority order: F4 queued after 10 bulk calls runs before them
  // -------------------------------------------------------------------------
  console.log('2. Testing priority queue order (Priority 1 F4 runs before Priority 3 Bulk):');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({ minLatencyMs: 5, maxLatencyMs: 10 });
    const ClientClass = createMockClientClass(mockEngine);

    const pool = new SapConnectionPool('SERVER_PRIO_TEST', {
      max_connections: 1,
      per_user_limit: 15,
      queue_timeout_ms: 10000
    }, { ClientClass });

    const executionOrder = [];

    // Hold the single connection with an active task
    let releaseGate;
    const gatePromise = new Promise((resolve) => { releaseGate = resolve; });

    const blockerPromise = pool.run(RFC_PRIORITY.INTERACTIVE, 'user_blocker', async (client) => {
      executionOrder.push('blocker_started');
      await gatePromise;
      executionOrder.push('blocker_done');
    });

    // Wait for blocker to start
    await new Promise((r) => setTimeout(r, 15));

    // Enqueue 10 Bulk calls (Priority 3)
    const bulkPromises = Array.from({ length: 10 }, (_, i) => {
      return pool.run(RFC_PRIORITY.BULK, `user_bulk_${i}`, async (client) => {
        executionOrder.push(`bulk_${i}`);
      });
    });

    // Enqueue 1 F4 call (Priority 1) AFTER all bulk calls
    const f4Promise = pool.run(RFC_PRIORITY.READ, 'user_f4', async (client) => {
      executionOrder.push('f4_search');
    });

    // Release blocker
    releaseGate();
    await Promise.all([blockerPromise, f4Promise, ...bulkPromises]);

    const f4Idx = executionOrder.indexOf('f4_search');
    const firstBulkIdx = executionOrder.indexOf('bulk_0');

    assert(f4Idx !== -1, 'F4 call must have executed');
    assert(firstBulkIdx !== -1, 'Bulk call must have executed');
    assert(f4Idx < firstBulkIdx, `F4 search (index ${f4Idx}) must execute BEFORE any bulk call (bulk_0 index ${firstBulkIdx})`);
    console.log(`   ✓ F4 search jumped ahead of 10 bulk calls (F4 executed at position ${f4Idx}, before bulk at ${firstBulkIdx})`);
  }

  // -------------------------------------------------------------------------
  // Test 3: One user submitting 20 calls cannot block other users beyond per_user_limit
  // -------------------------------------------------------------------------
  console.log('3. Testing per-user concurrency cap (per_user_limit=2 prevents starvation):');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({ minLatencyMs: 25, maxLatencyMs: 35 });
    const ClientClass = createMockClientClass(mockEngine);

    // Pool capacity 3, per-user limit 2
    const pool = new SapConnectionPool('SERVER_FAIRNESS', {
      max_connections: 3,
      per_user_limit: 2,
      queue_timeout_ms: 10000
    }, { ClientClass });

    const executionLog = [];

    // User Alice submits 20 calls
    const alicePromises = Array.from({ length: 20 }, (_, i) => {
      return pool.run(RFC_PRIORITY.INTERACTIVE, 'alice@company.com', async (client) => {
        executionLog.push(`alice_${i}_start`);
        await client.call('RFC_PING', {});
        executionLog.push(`alice_${i}_end`);
      });
    });

    // User Bob submits 1 call right after Alice's 20 calls
    await new Promise((r) => setTimeout(r, 5));
    const bobPromise = pool.run(RFC_PRIORITY.INTERACTIVE, 'bob@company.com', async (client) => {
      executionLog.push('bob_start');
      await client.call('RFC_PING', {});
      executionLog.push('bob_end');
    });

    await Promise.all([bobPromise, ...alicePromises]);

    const bobStartIdx = executionLog.indexOf('bob_start');
    const aliceEndsBeforeBob = executionLog.slice(0, bobStartIdx).filter(e => e.endsWith('_end')).length;

    // Bob must have started while Alice still had at least 15 calls remaining
    assert(bobStartIdx !== -1, 'Bob call must have executed');
    assert(aliceEndsBeforeBob <= 4, `Bob must not be starved (Alice finished only ${aliceEndsBeforeBob} calls before Bob started)`);
    console.log(`   ✓ Bob was served immediately on the 3rd connection while Alice was capped at 2 connections`);
  }

  // -------------------------------------------------------------------------
  // Test 4: Queue timeout (SERVER_BUSY), Call timeout, Discard broken connection
  // -------------------------------------------------------------------------
  console.log('4. Testing queue timeout (SERVER_BUSY), call timeout, and error discarding:');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({ minLatencyMs: 50, maxLatencyMs: 80 });
    const ClientClass = createMockClientClass(mockEngine);

    // (4a) Queue timeout -> SERVER_BUSY
    const busyPool = new SapConnectionPool('SERVER_BUSY_TEST', {
      max_connections: 1,
      queue_timeout_ms: 40
    }, { ClientClass });

    let slowDone;
    const slowGate = new Promise((r) => { slowDone = r; });
    const slowCall = busyPool.run(RFC_PRIORITY.INTERACTIVE, 'user1', async () => {
      await slowGate;
    });

    // Enqueue second call that should time out waiting in queue
    await assert.rejects(
      async () => {
        await busyPool.run(RFC_PRIORITY.INTERACTIVE, 'user2', async () => 'not_reached');
      },
      (err) => {
        assert.strictEqual(err.code, 'SERVER_BUSY', 'Error code must be SERVER_BUSY');
        assert.strictEqual(err.status, 503, 'HTTP status must be 503');
        assert(err.message.includes('The SAP server is busy'), 'Message must match specification');
        assert.strictEqual(typeof err.retryAfter, 'number', 'retryAfter must be provided');
        return true;
      }
    );
    slowDone();
    await slowCall;
    console.log('   ✓ Queue timeout correctly rejected with 503 SERVER_BUSY and retry-after hint');

    // (4b) Call timeout -> RFC_CALL_TIMEOUT & discarded connection
    const timeoutPool = new SapConnectionPool('SERVER_TIMEOUT_TEST', {
      max_connections: 1,
      rfc_call_timeout_ms: 40
    }, { ClientClass });

    await assert.rejects(
      async () => {
        await timeoutPool.run(RFC_PRIORITY.INTERACTIVE, 'user_timeout', async () => {
          await new Promise((r) => setTimeout(r, 120));
          return 'late';
        });
      },
      (err) => {
        assert.ok(err.code === 'RFC_CALL_TIMEOUT' || err.code === 'WRITE_OUTCOME_UNKNOWN', 'Error code must be RFC_CALL_TIMEOUT or WRITE_OUTCOME_UNKNOWN');
        assert.strictEqual(err.status, 504, 'HTTP status must be 504');
        return true;
      }
    );
    assert.strictEqual(timeoutPool.idleConnections.length, 0, 'Timed out connection must be discarded, not stored in idle pool');
    console.log('   ✓ Call timeout correctly aborted at 40ms with 504 and discarded connection');

    // (4c) Failed connection is not reused
    let instanceA = null;
    let instanceB = null;

    const failPool = new SapConnectionPool('SERVER_FAIL_TEST', {
      max_connections: 1
    }, { ClientClass });

    await assert.rejects(
      async () => {
        await failPool.run(RFC_PRIORITY.READ, 'user_err', async (client) => {
          instanceA = client;
          const connErr = new Error('RFC_COMMUNICATION_FAILURE: Socket reset');
          connErr.code = 'RFC_COMMUNICATION_FAILURE';
          throw connErr;
        });
      },
      /RFC_COMMUNICATION_FAILURE/
    );

    // Next call must receive a completely fresh connection
    await failPool.run(RFC_PRIORITY.INTERACTIVE, 'user_fresh', async (client) => {
      instanceB = client;
      return true;
    });

    assert(instanceA && instanceB, 'Both clients must be recorded');
    assert.notStrictEqual(instanceA, instanceB, 'Failed connection must be discarded and replaced by a fresh connection');
    console.log('   ✓ Failed connection discarded immediately; fresh connection provided on next call');
  }

  // -------------------------------------------------------------------------
  // Test 5: Two servers have independent pools
  // -------------------------------------------------------------------------
  console.log('5. Testing independent server pools:');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({ minLatencyMs: 10, maxLatencyMs: 20 });
    const ClientClass = createMockClientClass(mockEngine);

    const poolA = getSapConnectionPool('SERVER_ALPHA_INDEP', { ClientClass });
    const poolB = getSapConnectionPool('SERVER_BETA_INDEP', { ClientClass });

    assert.notStrictEqual(poolA, poolB, 'Different server IDs must have different pool instances');

    // Fill pool A completely
    poolA.updateConfig({ max_connections: 1 });
    let releaseA;
    const gateA = new Promise((r) => { releaseA = r; });
    const callA = poolA.run(RFC_PRIORITY.INTERACTIVE, 'userA', async () => {
      await gateA;
    });

    // Pool B should execute immediately without waiting for Server A
    const startB = Date.now();
    const resultB = await poolB.run(RFC_PRIORITY.READ, 'userB', async (client) => {
      return 'server_b_ok';
    });
    const durationB = Date.now() - startB;

    assert.strictEqual(resultB, 'server_b_ok');
    assert(durationB < 250, 'Server B call must execute immediately without waiting for Server A');

    releaseA();
    await callA;

    const allStats = getAllPoolStats();
    assert(allStats.servers['SERVER_ALPHA_INDEP'], 'Stats must include Server Alpha');
    assert(allStats.servers['SERVER_BETA_INDEP'], 'Stats must include Server Beta');
    console.log('   ✓ Server Alpha and Server Beta operate with 100% pool independence');
  }

  // -------------------------------------------------------------------------
  // Test 6: Cancelled request frees its slot immediately
  // -------------------------------------------------------------------------
  console.log('6. Testing cancelled / disconnected request frees queue slot:');
  {
    await resetAllPools();
    const mockEngine = new MockRfcEngine({ minLatencyMs: 5, maxLatencyMs: 10 });
    const ClientClass = createMockClientClass(mockEngine);

    const pool = new SapConnectionPool('SERVER_CANCEL_TEST', {
      max_connections: 1
    }, { ClientClass });

    // Block connection
    let releaseBlocker;
    const blockerGate = new Promise((r) => { releaseBlocker = r; });
    const blockerCall = pool.run(RFC_PRIORITY.INTERACTIVE, 'user1', async () => {
      await blockerGate;
    });

    // Enqueue cancellable request
    const controller = new AbortController();
    const cancelledCall = pool.run(RFC_PRIORITY.READ, 'user_cancelling', async () => {
      return 'should_not_run';
    }, { signal: controller.signal });

    assert.strictEqual(pool.queue.length, 1, 'Request must be present in queue');

    // Abort controller
    controller.abort();

    await assert.rejects(cancelledCall, /aborted by client/);
    assert.strictEqual(pool.queue.length, 0, 'Cancelled request must immediately be removed from queue');

    // Enqueue next normal request
    let nextRan = false;
    const nextCall = pool.run(RFC_PRIORITY.READ, 'user_next', async () => {
      nextRan = true;
      return 'next_ok';
    });

    releaseBlocker();
    await Promise.all([blockerCall, nextCall]);

    assert.strictEqual(nextRan, true, 'Next queued call must execute cleanly');
    console.log('   ✓ Aborted request released queue slot immediately without holding connection');
  }

  await resetAllPools();
  console.log('\n============================================================');
  console.log('✅ ALL SAP CONNECTION POOL & PRIORITY QUEUE TESTS PASSED!   ');
  console.log('============================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error in sapConnectionPool test:', err);
  process.exit(1);
});
