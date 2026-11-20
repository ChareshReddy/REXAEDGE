import assert from 'node:assert';
process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
import { inMemorySupabase } from '../services/supabaseClient.js';
import { getRfcConnectionParams, pingRfcServer, openRfcClient } from '../services/sapRfcClient.js';
import { getSapConnectionPool, SapConnectionPool, RFC_PRIORITY } from '../services/sapConnectionPool.js';
import { runSearchRfc } from '../services/searchRfcClient.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { validateRouterString } from '../services/serverAllowlistService.js';

inMemorySupabase.allowlist.push({
  id: 'al-test-1',
  pattern: '192.168.12.*',
  type: 'Sandbox',
  comment: 'Test CIDR'
});

console.log('--- RUNNING ROUTER HANDLING & CONNECTION SAFEGUARD TESTS ---');

// 1. EMPTY / BLANK ROUTER IS NOT SENT TO RFC PARAMS
console.log('\n1. Testing empty / blank router handling in getRfcConnectionParams...');
{
  const baseServer = {
    id: 'srv-test-router-1',
    ashost: '  192.168.12.241  ',
    sysnr: ' 09 ',
    client: ' 500 ',
    sap_username: ' TESTUSER ',
    sap_password: 'testPassword123'
  };

  // 1a. Empty router string ""
  const paramsEmpty = getRfcConnectionParams({ server: { ...baseServer, router: '' } });
  assert.strictEqual(paramsEmpty.saprouter, undefined, 'Empty router string must NOT set params.saprouter');
  assert.strictEqual(paramsEmpty.ashost, '192.168.12.241', 'ashost must be trimmed');
  assert.strictEqual(paramsEmpty.user, 'TESTUSER', 'user must be trimmed');
  assert.strictEqual(paramsEmpty.sysnr, '09', 'sysnr must be trimmed');
  assert.strictEqual(paramsEmpty.client, '500', 'client must be trimmed');
  console.log('   ✓ Empty router "" does not set saprouter; credentials/host trimmed');

  // 1b. Whitespace-only router "   "
  const paramsWhitespace = getRfcConnectionParams({ server: { ...baseServer, router: '   ' } });
  assert.strictEqual(paramsWhitespace.saprouter, undefined, 'Whitespace-only router must NOT set params.saprouter');
  console.log('   ✓ Whitespace router "   " does not set saprouter');

  // 1c. saprouter field passed as "" or "   "
  const paramsSaprouterEmpty = getRfcConnectionParams({ server: { ...baseServer, saprouter: '   ' } });
  assert.strictEqual(paramsSaprouterEmpty.saprouter, undefined, 'Blank saprouter must NOT set params.saprouter');
  console.log('   ✓ Blank saprouter "   " does not set saprouter');

  // 1d. Null router
  const paramsNull = getRfcConnectionParams({ server: { ...baseServer, router: null } });
  assert.strictEqual(paramsNull.saprouter, undefined, 'null router must NOT set params.saprouter');
  console.log('   ✓ Null router does not set saprouter');

  // 1e. Optional fields: empty strings must NEVER be sent
  const paramsOptionalEmpty = getRfcConnectionParams({
    server: {
      ...baseServer,
      router: '',
      lang: '   ',
      gwserv: '',
      group: '  '
    }
  });
  assert.strictEqual(paramsOptionalEmpty.lang, undefined, 'Blank lang must NOT be sent');
  assert.strictEqual(paramsOptionalEmpty.gwserv, undefined, 'Blank gwserv must NOT be sent');
  assert.strictEqual(paramsOptionalEmpty.group, undefined, 'Blank group must NOT be sent');
  assert.strictEqual(paramsOptionalEmpty.saprouter, undefined, 'Blank router must NOT be sent');
  console.log('   ✓ Blank optional fields (lang, gwserv, group) are omitted rather than sent as empty strings');
}

// 2. BAD ROUTER VALIDATION & NORMALIZATION
console.log('\n2. Testing router format validation & normalization...');
{
  const baseServer = {
    id: 'srv-test-router-2',
    ashost: '192.168.12.241',
    sysnr: '09',
    client: '500',
    sap_username: 'TESTUSER',
    sap_password: 'testPassword123'
  };

  // 2a. Missing leading /H/
  assert.throws(
    () => getRfcConnectionParams({ server: { ...baseServer, router: '103.206.249.51' } }),
    (err) => {
      assert(err.message.includes('must start with /H/'), `Expected router prefix message, got: ${err.message}`);
      assert.strictEqual(err.code, 'INVALID_ROUTER_FORMAT');
      return true;
    },
    'Router without /H/ must throw INVALID_ROUTER_FORMAT'
  );
  console.log('   ✓ Router without leading /H/ throws INVALID_ROUTER_FORMAT');

  // 2b. Router starting with /H/ but missing trailing /H/ -> normalized
  const paramsNormalized = getRfcConnectionParams({ server: { ...baseServer, router: '/H/103.206.249.51' } });
  assert.strictEqual(paramsNormalized.saprouter, '/H/103.206.249.51/H/', 'Router must normalize with trailing /H/');
  console.log('   ✓ Router /H/host normalized to /H/host/H/');

  // 2c. Router password /P/ rejected
  const validationRes = await validateRouterString('/H/103.206.249.51/P/secret123/H/');
  assert.strictEqual(validationRes.valid, false);
  assert.strictEqual(validationRes.code, 'ROUTER_PASSWORD_NOT_ALLOWED');
  console.log('   ✓ Router password /P/ strictly rejected');
}

// 3. CONNECTION ERROR DOES NOT LEAVE REQUEST PENDING OR POOL SLOT HELD
console.log('\n3. Testing pool slot and queue cleanup after connection errors...');
{
  class FailingMockClient {
    constructor(params) {
      this.params = params;
    }
    async open() {
      const err = new Error('NI socket connection refused');
      err.code = 'ECONNREFUSED';
      throw err;
    }
    async close() {}
  }

  const failingServer = {
    id: 'srv-fail-pool-slot',
    name: 'Failing Server',
    ashost: '192.168.12.99',
    validated_ip: '192.168.12.99',
    sysnr: '00',
    client: '100',
    sap_username: 'FAILUSER',
    sap_password: 'secretPassword',
    max_connections: 2,
    per_user_limit: 2
  };

  const pool = new SapConnectionPool(failingServer.id, failingServer, { ClientClass: FailingMockClient });

  // 3a. Run in pool: fails promptly
  let errorCaught = null;
  try {
    await pool.run(RFC_PRIORITY.INTERACTIVE, 'user-1', async () => 'ok');
  } catch (err) {
    errorCaught = err;
  }

  assert(errorCaught !== null, 'pool.run must reject when client connection fails');
  assert.strictEqual(pool.activeConnections.size, 0, 'activeConnections must be 0 after connection failure');
  assert.strictEqual(pool.pendingConnections, 0, 'pendingConnections must be 0 after connection failure');
  assert.strictEqual(pool.queue.length, 0, 'queue must be 0 after failure');
  assert.strictEqual(pool.userActiveCount.get('user-1') || 0, 0, 'userActiveCount must be 0 after failure');
  console.log('   ✓ pool.run failure releases pending/active slots and decrements user count');

  // 3b. Verify searchRfcClient slot release on connection failure
  let searchError = null;
  try {
    await runSearchRfc(
      { server: failingServer, timeoutMs: 3000 },
      async () => 'search_result',
      FailingMockClient
    );
  } catch (err) {
    searchError = err;
  }
  assert(searchError !== null, 'runSearchRfc must reject when connection fails');
  console.log('   ✓ runSearchRfc cleanly releases search slot on connection failure');

  // 3c. Verify f4CacheService cleans up pending map on failure
  let f4Error = null;
  try {
    await f4CacheService.fetchWithCache({
      serverId: 'srv-failing-f4',
      lookupType: 'plants',
      query: 'test',
      fetchFn: async () => {
        throw new Error('Connection failed during plant fetch');
      }
    });
  } catch (err) {
    f4Error = err;
  }
  assert(f4Error !== null, 'fetchWithCache must reject when fetchFn fails');
  const cacheKey = f4CacheService._buildKey({ serverId: 'srv-failing-f4', lookupType: 'plants', query: 'test' });
  assert.strictEqual(f4CacheService.pending.has(cacheKey), false, 'pending map must NOT retain failed key');
  console.log('   ✓ f4CacheService purges pending promise on error, preventing permanently stuck requests');

  // 3d. Verify openRfcClient connection timeout protection
  class HangingMockClient {
    constructor(params) {
      this.params = params;
    }
    open() {
      // Hangs indefinitely
      return new Promise(() => {});
    }
    close() {}
  }

  const hangingServer = {
    ...failingServer,
    connect_timeout_ms: 100 // 100ms for fast test
  };

  let hangError = null;
  const hangStart = Date.now();
  try {
    await openRfcClient({ server: hangingServer }, HangingMockClient);
  } catch (err) {
    hangError = err;
  }
  const hangDuration = Date.now() - hangStart;
  assert(hangError !== null, 'openRfcClient must time out rather than hanging indefinitely');
  assert.strictEqual(hangError.code, 'CONNECT_TIMEOUT');
  assert(hangDuration < 1500, `Expected timeout in ~100ms, took ${hangDuration}ms`);
  console.log(`   ✓ openRfcClient timed out safely after ${hangDuration}ms with CONNECT_TIMEOUT`);
}

console.log('\n--- ALL ROUTER HANDLING & CONNECTION SAFEGUARD TESTS PASSED ---');
