process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'false';

import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchRfc, closeAllSearchClients } from '../services/searchRfcClient.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { clearPlantCache } from '../services/plantService.js';
import { inMemorySupabase } from '../services/supabaseClient.js';

inMemorySupabase.server_allowlist = [
  {
    id: 'al-test-hang-safeguards',
    pattern: '192.168.12.*',
    type: 'Sandbox',
    comment: 'Test CIDR'
  }
];
inMemorySupabase.allowlist = inMemorySupabase.server_allowlist;

test('Hang & Abort Safeguards: Hanging client.open() times out and releases pool slot', async () => {
  await closeAllSearchClients();
  clearPlantCache();

  class HangingOpenClient {
    constructor(params) {
      this.params = params;
    }
    async open() {
      // Never resolves
      return new Promise(() => {});
    }
    async close() {
      return Promise.resolve();
    }
  }

  const testServer = {
    id: 'test_server_hang_open',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    user: 'TEST_USER',
    sap_password: 'testPassword123',
    connect_timeout_ms: 100 // fast timeout for test
  };

  let errorCaught = null;
  try {
    await runSearchRfc(
      { server: testServer, timeoutMs: 300, ClientClass: HangingOpenClient },
      async () => {
        return 'success';
      }
    );
  } catch (err) {
    errorCaught = err;
  }

  assert.ok(errorCaught, 'Expected open() to time out and throw an error');
  assert.ok(
    errorCaught.code === 'CONNECT_TIMEOUT' || errorCaught.code === 'RFC_SEARCH_TIMEOUT' || errorCaught.status === 504,
    `Unexpected error code: ${errorCaught.code || errorCaught.message}`
  );

  // Verify next request to the same server is NOT blocked and can acquire slot
  class HealthyClient {
    async open() { return Promise.resolve(); }
    async close() { return Promise.resolve(); }
    isAlive() { return true; }
    async call(fn) { return { mock: true, fn }; }
  }

  const nextResult = await runSearchRfc(
    { server: testServer, timeoutMs: 1000, ClientClass: HealthyClient },
    async () => {
      return 'next_call_succeeded';
    }
  );
  assert.equal(nextResult, 'next_call_succeeded');
  await closeAllSearchClients();
});

test('Hang & Abort Safeguards: Hanging client.call() times out with RFC_INVOKE_TIMEOUT and releases slot', async () => {
  await closeAllSearchClients();
  clearPlantCache();

  class HangingCallClient {
    async open() { return Promise.resolve(); }
    async close() { return Promise.resolve(); }
    isAlive() { return true; }
    async call() {
      // Never resolves
      return new Promise(() => {});
    }
  }

  const testServer = {
    id: 'test_server_hang_call',
    ashost: '192.168.12.241',
    sysnr: '00',
    client: '100',
    user: 'TEST_USER',
    sap_password: 'testPassword123'
  };

  let errorCaught = null;
  try {
    await runSearchRfc(
      { server: testServer, timeoutMs: 150, ClientClass: HangingCallClient },
      async (client) => {
        return client.call('RFC_READ_TABLE', {});
      }
    );
  } catch (err) {
    errorCaught = err;
  }

  assert.ok(errorCaught, 'Expected call() to time out and throw an error');
  assert.ok(
    errorCaught.code === 'RFC_INVOKE_TIMEOUT' || errorCaught.code === 'RFC_SEARCH_TIMEOUT' || errorCaught.status === 504,
    `Expected invoke or search timeout, got ${errorCaught.code}`
  );

  // Verify next request succeeds without hanging
  class QuickClient {
    async open() { return Promise.resolve(); }
    async close() { return Promise.resolve(); }
    isAlive() { return true; }
    async call() { return { rows: [] }; }
  }

  const recovered = await runSearchRfc(
    { server: testServer, timeoutMs: 1000, ClientClass: QuickClient },
    async () => 'recovered_successfully'
  );
  assert.equal(recovered, 'recovered_successfully');
  await closeAllSearchClients();
});

test('Hang & Abort Safeguards: Aborting client frees f4CacheService dedupe entry immediately', async () => {
  await closeAllSearchClients();
  f4CacheService.clear('srv_abort_test');

  const abortController = new AbortController();
  let fetchStarted = false;

  const hangingFetch = () =>
    new Promise(() => {
      fetchStarted = true;
      // Never resolves
    });

  const p1 = f4CacheService.fetchWithCache({
    serverId: 'srv_abort_test',
    lookupType: 'plants',
    query: 'test_q',
    signal: abortController.signal,
    fetchFn: hangingFetch
  });

  // Wait for fetch to start
  while (!fetchStarted) {
    await new Promise((r) => setTimeout(r, 10));
  }

  // Abort request
  abortController.abort();

  let p1Error = null;
  try {
    await p1;
  } catch (err) {
    p1Error = err;
  }

  assert.ok(p1Error, 'Expected aborted promise to reject');
  assert.equal(p1Error.status, 499);

  // Subsequent request must NOT receive hanging promise and should execute fresh fetch
  const p2 = await f4CacheService.fetchWithCache({
    serverId: 'srv_abort_test',
    lookupType: 'plants',
    query: 'test_q',
    fetchFn: async () => [{ werks: '1001', name1: 'Fresh Plant' }]
  });

  assert.ok(Array.isArray(p2));
  assert.equal(p2[0].werks, '1001');
});

test('Hang & Abort Safeguards: RFC_TRACE=1 logs START and END lines', async () => {
  const originalTrace = process.env.RFC_TRACE;
  process.env.RFC_TRACE = '1';

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };

  try {
    class TraceTestClient {
      async open() { return Promise.resolve(); }
      async close() { return Promise.resolve(); }
      isAlive() { return true; }
      async call() { return { test: 'ok' }; }
    }

    await runSearchRfc(
      {
        server: {
          id: 'srv_trace_test',
          ashost: '192.168.12.241',
          sysnr: '00',
          client: '100',
          user: 'TEST',
          sap_password: 'testPassword123'
        },
        timeoutMs: 1000,
        ClientClass: TraceTestClient
      },
      async (client) => {
        return client.call('RFC_PING', {});
      }
    );

    const startLines = logs.filter((l) => l.includes('[RFC_TRACE]') && l.includes('START'));
    const endLines = logs.filter((l) => l.includes('[RFC_TRACE]') && l.includes('END'));

    assert.ok(startLines.length > 0, 'Expected at least one START trace line');
    assert.ok(endLines.length > 0, 'Expected at least one END trace line');
  } finally {
    console.log = originalLog;
    process.env.RFC_TRACE = originalTrace;
    await closeAllSearchClients();
  }
});
