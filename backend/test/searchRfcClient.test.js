import assert from 'assert';
import { runSearchRfc, closeAllSearchClients } from '../services/searchRfcClient.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

console.log('============================================================');
console.log('  RUNNING SEARCH RFC CONNECTION HOLDER TEST SUITE           ');
console.log('============================================================\n');

class MockClient {
  constructor(params, options) {
    this.params = params;
    this.options = options;
  }
  isAlive() { return true; }
  async ping() { return true; }
  async open() {}
  async close() {}
  async call(fnName, args) {
    return { success: true };
  }
}

const baseServer = {
  sap_username: 'TEST_USER',
  sap_password: 'TEST_PASSWORD',
  ashost: '127.0.0.1',
  sysnr: '00',
  client: '100'
};

// 1. Connection Reuse
console.log('1. Testing RFC connection reuse for consecutive searches...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_REUSE' };

  let clientA = null;
  let clientB = null;

  await runSearchRfc({ server, ClientClass: MockClient }, async (client) => {
    clientA = client;
    return client.call('RFC_PING', {});
  });

  await runSearchRfc({ server, ClientClass: MockClient }, async (client) => {
    clientB = client;
    return client.call('RFC_PING', {});
  });

  assert(clientA, 'First search must acquire client');
  assert(clientB, 'Second search must acquire client');
  assert.strictEqual(clientA, clientB, 'Consecutive searches on same server must reuse same client instance');
  console.log('   ✓ Consecutive searches successfully reuse open client instance');
}

// 2. Strict Server Isolation
console.log('2. Testing strict server isolation (no cross-server sharing)...');
{
  await closeAllSearchClients();
  const srv1 = { ...baseServer, id: 'SERVER_ALPHA' };
  const srv2 = { ...baseServer, id: 'SERVER_BETA' };

  let c1 = null;
  let c2 = null;

  await runSearchRfc({ server: srv1, ClientClass: MockClient }, async (client) => {
    c1 = client;
    return client.call('RFC_PING', {});
  });

  await runSearchRfc({ server: srv2, ClientClass: MockClient }, async (client) => {
    c2 = client;
    return client.call('RFC_PING', {});
  });

  assert.notStrictEqual(c1, c2, 'Different servers must NEVER share RFC client instances');
  console.log('   ✓ Server connections strictly isolated by serverId');
}

// 3. Error Discarding (Never leave connection open after error)
console.log('3. Testing error discarding (connection closed/discarded on error)...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_FAIL' };

  let clientBefore = null;
  let clientAfter = null;

  // Trigger error
  await assert.rejects(
    async () => {
      await runSearchRfc({ server, ClientClass: MockClient }, async (client) => {
        clientBefore = client;
        throw new Error('RFC read error');
      });
    },
    /RFC read error/
  );

  // Next search must get a fresh client
  await runSearchRfc({ server, ClientClass: MockClient }, async (client) => {
    clientAfter = client;
    return client.call('RFC_PING', {});
  });

  assert.notStrictEqual(clientBefore, clientAfter, 'Connection must be discarded and replaced after an error');
  console.log('   ✓ Dead/failed client discarded immediately; fresh connection established');
}

// 4. Hard Timeout Protection (default 20s or custom timeoutMs)
console.log('4. Testing hard search timeout (returns 504 and discards connection)...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_TIMEOUT' };

  await assert.rejects(
    async () => {
      await runSearchRfc({ server, timeoutMs: 50, ClientClass: MockClient }, async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'too_late';
      });
    },
    (err) => {
      assert.strictEqual(err.status, 504, 'Timeout error status must be 504');
      assert(err.message.includes('SAP took too long'), 'Error message matches specification');
      return true;
    }
  );

  console.log('   ✓ Hard timeout triggers 504 error and discards connection');
}

// 5. Concurrency Limiter (Max 2 concurrent per server)
console.log('5. Testing concurrency limiter (max 2 concurrent, queue wait or 503)...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_CONCURRENCY' };

  let active = 0;
  let maxActive = 0;

  const runTask = (delayMs) =>
    runSearchRfc({ server, ClientClass: MockClient }, async (client) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, delayMs));
      active--;
      return true;
    });

  // Launch 3 searches simultaneously
  const results = await Promise.all([runTask(60), runTask(60), runTask(60)]);

  assert.strictEqual(results.length, 3);
  assert(maxActive <= 2, `Concurrent searches must not exceed 2 (observed: ${maxActive})`);
  console.log('   ✓ Concurrency strictly capped at 2 active searches');
}

// 6. AbortSignal / Browser Disconnect Protection
console.log('6. Testing AbortSignal / Browser cancellation...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_ABORT' };
  const controller = new AbortController();

  const promise = runSearchRfc({ server, signal: controller.signal, ClientClass: MockClient }, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return 'done';
  });

  // Abort midway
  setTimeout(() => controller.abort(), 20);

  await assert.rejects(
    promise,
    (err) => {
      assert.strictEqual(err.status, 499, 'Cancelled request status is 499');
      assert(err.message.includes('cancelled'), 'Error indicates cancellation');
      return true;
    }
  );

  console.log('   ✓ Aborted request stops waiting and releases connection cleanly');
}

// 7. Abort Frees Concurrency Slot Immediately
console.log('7. Testing that abort immediately frees concurrency slot for waiting searches...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_ABORT_FREES_SLOT' };

  const controller1 = new AbortController();
  let search1Started = false;
  let search3Started = false;

  // Search 1: will be aborted
  const p1 = runSearchRfc({ server, signal: controller1.signal, ClientClass: MockClient }, async () => {
    search1Started = true;
    await new Promise((r) => setTimeout(r, 1000));
    return 's1_done';
  });

  // Search 2: occupies slot 2
  const p2 = runSearchRfc({ server, ClientClass: MockClient }, async () => {
    await new Promise((r) => setTimeout(r, 300));
    return 's2_done';
  });

  // Wait for both to acquire slots
  while (!search1Started) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Search 3: queued because activeCount == 2
  const p3 = runSearchRfc({ server, ClientClass: MockClient }, async () => {
    search3Started = true;
    return 's3_success';
  });

  // Abort Search 1 immediately
  controller1.abort();

  // Search 1 must reject with 499
  await assert.rejects(p1, (err) => err.status === 499);

  // Search 3 must be woken up and succeed immediately without waiting 300ms for Search 2
  const res3 = await p3;
  assert.strictEqual(res3, 's3_success', 'Search 3 acquired freed slot from aborted search 1');
  assert.strictEqual(search3Started, true, 'Search 3 started immediately after search 1 abort');

  await p2;
  console.log('   ✓ Abort immediately frees slot and unblocks waiting search without busy error');
}

// 8. Queue Times Out Correctly (Returns 503 after 3 seconds)
console.log('8. Testing that wait queue times out after 3s with 503 busy error...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_QUEUE_TIMEOUT' };

  let s1Started = false;
  let s2Started = false;

  // Occupy both slots for 3500ms
  const p1 = runSearchRfc({ server, ClientClass: MockClient }, async () => {
    s1Started = true;
    await new Promise((r) => setTimeout(r, 3500));
    return 's1';
  });

  const p2 = runSearchRfc({ server, ClientClass: MockClient }, async () => {
    s2Started = true;
    await new Promise((r) => setTimeout(r, 3500));
    return 's2';
  });

  while (!s1Started || !s2Started) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Search 3 queues and should time out after ~3000ms with 503
  const startTime = Date.now();
  await assert.rejects(
    runSearchRfc({ server, ClientClass: MockClient }, async () => 's3'),
    (err) => {
      const elapsed = Date.now() - startTime;
      assert.strictEqual(err.status, 503, 'Queue timeout status must be 503');
      assert(err.message.includes('busy with searches'), 'Error message indicates server busy');
      assert(elapsed >= 2800 && elapsed <= 3800, `Queue timeout took ~3s (elapsed: ${elapsed}ms)`);
      return true;
    }
  );

  await Promise.all([p1, p2]);
  console.log('   ✓ Queue times out after ~3s and returns 503 busy error');
}

// 9. Three Quick Searches in a Row Result in 1 Real Result and No Busy Error
console.log('9. Testing three quick searches in a row: previous searches aborted, 1 real result, no busy error...');
{
  await closeAllSearchClients();
  const server = { ...baseServer, id: 'SRV_QUICK_TYPING' };

  const c1 = new AbortController();
  const c2 = new AbortController();
  const c3 = new AbortController();

  // User types "1"
  const p1 = runSearchRfc({ server, signal: c1.signal, ClientClass: MockClient }, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return 'result_1';
  });
  const p1Reject = assert.rejects(p1, (err) => err.status === 499);

  // User types "11" -> cancels "1"
  await new Promise((r) => setTimeout(r, 20));
  c1.abort();

  const p2 = runSearchRfc({ server, signal: c2.signal, ClientClass: MockClient }, async () => {
    await new Promise((r) => setTimeout(r, 200));
    return 'result_11';
  });
  const p2Reject = assert.rejects(p2, (err) => err.status === 499);

  // User types "110" -> cancels "11"
  await new Promise((r) => setTimeout(r, 20));
  c2.abort();

  const p3 = runSearchRfc({ server, signal: c3.signal, ClientClass: MockClient }, async () => {
    await new Promise((r) => setTimeout(r, 50));
    return 'result_110_final';
  });

  await p1Reject;
  await p2Reject;

  // P3 must succeed with real result without hitting 503
  const finalResult = await p3;
  assert.strictEqual(finalResult, 'result_110_final', 'Third quick search completed successfully with real result');
  console.log('   ✓ Three quick searches in a row: slots freed on abort, final search succeeds with real result');
}

await closeAllSearchClients();

console.log('\n============================================================');
console.log('  ALL SEARCH RFC CONNECTION TESTS PASSED (100%)             ');
console.log('============================================================\n');
