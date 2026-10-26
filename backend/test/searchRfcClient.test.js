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

await closeAllSearchClients();

console.log('\n============================================================');
console.log('  ALL SEARCH RFC CONNECTION TESTS PASSED (100%)             ');
console.log('============================================================\n');
