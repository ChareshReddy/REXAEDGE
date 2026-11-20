process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.DB_TIMEOUT_MS = '300'; // Fast 300ms timeout for test suite speed

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase, withDbTimeout } from '../services/supabaseClient.js';
import { traceRequestArrival, traceMiddlewareStep } from '../utils/rfcTrace.js';

let server;
let baseUrl;

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  supabaseService.resetMemoryStore();
});

test('1. withDbTimeout rejects with DB_TIMEOUT (504) on hanging promise', async () => {
  const hangingPromise = new Promise(() => {});
  const start = Date.now();
  let caught = null;

  try {
    await withDbTimeout(hangingPromise, 200, 'Test Hanging Operation');
  } catch (err) {
    caught = err;
  }

  const elapsed = Date.now() - start;
  assert.ok(caught, 'Expected timeout error to be thrown');
  assert.equal(caught.code, 'DB_TIMEOUT');
  assert.equal(caught.status, 504);
  assert.ok(caught.message.includes('Test Hanging Operation timed out'));
  assert.ok(elapsed >= 180 && elapsed < 1000, `Elapsed ${elapsed}ms should be around 200ms`);
});

test('2. Per-request server and module caching executes at most 1 server lookup', async () => {
  supabaseService.resetMemoryStore();
  const userId = '00000000-0000-0000-0000-000000000001';
  const serverId = 'test-cached-server-1';

  // Seed test server in inMemorySupabase
  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Cached Server',
    ashost: '192.168.1.100',
    sysnr: '00',
    client: '100',
    owner_id: userId,
    is_active: true,
    is_disabled: false
  });

  const req = { id: 'req-cache-test' };

  // Track lookups in inMemorySupabase.servers
  let lookupCount = 0;
  const originalFind = inMemorySupabase.servers.find.bind(inMemorySupabase.servers);
  inMemorySupabase.servers.find = function (predicate) {
    lookupCount++;
    return originalFind(predicate);
  };

  try {
    // 1st lookup - populates req._serverRecord
    const s1 = await supabaseService.getServerById(serverId, { req });
    assert.ok(s1);
    assert.equal(s1.id, serverId);
    assert.ok(req._serverRecord);
    const initialLookups = lookupCount;

    // 2nd lookup on same request - reuses req._serverRecord without querying inMemorySupabase.servers
    const s2 = await supabaseService.getServerById(serverId, { req });
    assert.equal(s2, s1);
    assert.equal(lookupCount, initialLookups, 'Should not perform another store lookup when cached on req');

    // Modules caching on req
    const m1 = await supabaseService.getServerModules(serverId, { req });
    assert.ok(Array.isArray(m1));
    assert.ok(req._serverModules && req._serverModules[serverId]);
  } finally {
    inMemorySupabase.servers.find = originalFind;
  }
});

test('3. RFC_TRACE request arrival and middleware step tracing logs formatted lines', () => {
  const originalEnv = process.env.RFC_TRACE;
  process.env.RFC_TRACE = '1';

  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.join(' '));

  try {
    const fakeReq = { id: 'test-req-trace-id', method: 'GET', originalUrl: '/api/plants' };
    traceRequestArrival(fakeReq);

    const step = traceMiddlewareStep(fakeReq, 'requireServerOwner');
    step.end();

    assert.ok(logs.some((l) => l.includes('ARRIVED GET /api/plants') && l.includes('test-req-trace-id')));
    assert.ok(logs.some((l) => l.includes('START requireServerOwner') && l.includes('test-req-trace-id')));
    assert.ok(logs.some((l) => l.includes('END requireServerOwner') && l.includes('test-req-trace-id')));
  } finally {
    console.log = originalLog;
    if (originalEnv !== undefined) {
      process.env.RFC_TRACE = originalEnv;
    } else {
      delete process.env.RFC_TRACE;
    }
  }
});

test('4. GET /api/plants responds with 504 DB_TIMEOUT when Supabase getServerById hangs', async () => {
  supabaseService.resetMemoryStore();
  const userId = '00000000-0000-0000-0000-000000000001';
  const serverId = 'test-plants-hang-server';

  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Plants Hang Server',
    ashost: '192.168.1.101',
    sysnr: '00',
    client: '100',
    owner_id: userId,
    is_active: true,
    is_disabled: false
  });

  // Enable simulated hang for getServerById
  supabaseService.setSimulatedHang('getServerById', true);

  const start = Date.now();
  try {
    const res = await makeRequest('GET', '/api/plants', {
      authorization: 'Bearer admin-test-token',
      'x-sap-server-id': serverId
    });

    const elapsed = Date.now() - start;
    assert.equal(res.status, 504, `Expected 504, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'DB_TIMEOUT');
    assert.ok(elapsed >= 250 && elapsed < 2000, `Request took ${elapsed}ms, should timeout around ~300ms`);
  } finally {
    supabaseService.setSimulatedHang('getServerById', false);
  }
});

test('5. GET /api/sap/session-status answers connected:false with DB_TIMEOUT when Supabase hangs', async () => {
  supabaseService.resetMemoryStore();
  const userId = '00000000-0000-0000-0000-000000000001';
  const serverId = 'test-session-hang-server';

  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Session Hang Server',
    ashost: '192.168.1.102',
    sysnr: '00',
    client: '100',
    owner_id: userId,
    is_active: true,
    is_disabled: false
  });

  supabaseService.setSimulatedHang('getServerById', true);

  const start = Date.now();
  try {
    const res = await makeRequest('GET', '/api/sap/session-status', {
      authorization: 'Bearer admin-test-token',
      'x-sap-server-id': serverId
    });

    const elapsed = Date.now() - start;
    assert.equal(res.data.code, 'DB_TIMEOUT', `Expected DB_TIMEOUT code, got: ${JSON.stringify(res.data)}`);
    assert.ok(res.status === 504 || res.data.connected === false);
    assert.ok(elapsed >= 250 && elapsed < 2000, `Request took ${elapsed}ms, should timeout around ~300ms`);
  } finally {
    supabaseService.setSimulatedHang('getServerById', false);
  }
});

test('6. Event loop remains responsive and subsequent requests succeed after a timeout', async () => {
  supabaseService.resetMemoryStore();
  const userId = '00000000-0000-0000-0000-000000000001';
  const serverId = 'test-recovery-server';

  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Recovery Server',
    ashost: '192.168.1.103',
    sysnr: '00',
    client: '100',
    owner_id: userId,
    is_active: true,
    is_disabled: false
  });

  // Verify healthy request succeeds
  const res1 = await makeRequest('GET', '/api/servers', {
    authorization: 'Bearer admin-test-token'
  });
  assert.equal(res1.status, 200);
  assert.ok(Array.isArray(res1.data.servers));

  // Hang getServersByOwner briefly
  supabaseService.setSimulatedHang('getServersByOwner', true);
  const resHang = await makeRequest('GET', '/api/servers', {
    authorization: 'Bearer admin-test-token'
  });
  assert.equal(resHang.status, 504);
  assert.equal(resHang.data.code, 'DB_TIMEOUT');

  // Clear hang, verify immediate recovery
  supabaseService.setSimulatedHang('getServersByOwner', false);
  const resRecovered = await makeRequest('GET', '/api/servers', {
    authorization: 'Bearer admin-test-token'
  });
  assert.equal(resRecovered.status, 200);
  assert.ok(Array.isArray(resRecovered.data.servers));
});

test('7. Two parallel requests cause one call (single-flight deduplication)', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();
  const serverId = 'test-parallel-srv';
  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Parallel Srv',
    ashost: '192.168.1.104',
    sysnr: '00',
    client: '100',
    is_active: true
  });

  const [s1, s2] = await Promise.all([
    supabaseService.getServerById(serverId),
    supabaseService.getServerById(serverId)
  ]);
  assert.equal(s1.id, serverId);
  assert.equal(s2.id, serverId);
  assert.equal(supabaseCache.getFetchCount('server:' + serverId), 1, 'Two parallel calls should trigger exactly 1 store lookup via single-flight');
});

test('8. Cache invalidation on server edit/disable', async () => {
  supabaseService.resetMemoryStore();
  const serverId = 'test-invalidation-srv';
  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Initial Name',
    ashost: '192.168.1.105',
    sysnr: '00',
    client: '100',
    is_active: true,
    is_disabled: false
  });

  // Populate cache
  const s1 = await supabaseService.getServerById(serverId);
  assert.equal(s1.name, 'Initial Name');

  // Update server (name and disabled)
  await supabaseService.updateServer(serverId, { name: 'Updated Name', is_disabled: true });

  // Read back: should reflect updated values immediately because cache was invalidated
  const s2 = await supabaseService.getServerById(serverId);
  assert.equal(s2.name, 'Updated Name');
  assert.equal(s2.is_disabled, true);
});

test('9. Stale-on-timeout applies ONLY to harmless data (modules list, allowlist)', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();
  const serverId = 'test-stale-modules-srv';

  // 1. Seed modules
  inMemorySupabase.setServerModules(serverId, ['bom']);

  // Initial fetch puts it in cache
  const initial = await supabaseService.getServerModules(serverId);
  assert.deepEqual(initial, ['bom']);

  // Age the cache past fresh TTL (30s) but within stale TTL (5min)
  const cachedEntry = supabaseCache.cache.get(`modules:${serverId}`);
  assert.ok(cachedEntry);
  cachedEntry.fetchedAt = Date.now() - 35000;

  // DB starts hanging
  supabaseService.setSimulatedHang('getServerModules', true);

  try {
    // Harmless data should serve stale cached value on timeout
    const recovered = await supabaseService.getServerModules(serverId, { timeoutMs: 200 });
    assert.deepEqual(recovered, ['bom']);
  } finally {
    supabaseService.setSimulatedHang('getServerModules', false);
  }
});

test('10. Sensitive data (server, user, auth) NEVER serves stale records on timeout (fails closed with DB_TIMEOUT)', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();
  const serverId = 'test-no-stale-srv';
  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Sensitive Server',
    ashost: '192.168.1.106',
    sysnr: '00',
    client: '100',
    is_active: true
  });

  // Fetch into cache
  const initial = await supabaseService.getServerById(serverId);
  assert.equal(initial.name, 'Sensitive Server');

  // Age the cache past fresh TTL
  const cachedEntry = supabaseCache.cache.get(`server:${serverId}`);
  assert.ok(cachedEntry);
  cachedEntry.fetchedAt = Date.now() - 35000;

  // DB starts hanging
  supabaseService.setSimulatedHang('getServerById', true);

  let err = null;
  try {
    await supabaseService.getServerById(serverId, { timeoutMs: 200 });
  } catch (e) {
    err = e;
  } finally {
    supabaseService.setSimulatedHang('getServerById', false);
  }

  // Must fail closed with DB_TIMEOUT (504), never stale server record
  assert.ok(err, 'Expected sensitive record to fail closed');
  assert.equal(err.code, 'DB_TIMEOUT');
  assert.equal(err.status, 504);
  assert.equal(err.message, 'The database is slow right now. Please try again.');
});

test('11. /api/health/ready returns measured Supabase latency', async () => {
  const res = await makeRequest('GET', '/api/health/ready');
  assert.equal(res.status, 200);
  assert.equal(res.data.status, 'ready');
  assert.equal(res.data.database, 'connected');
  assert.ok(typeof res.data.latencyMs === 'number');
});

test('12. User disabled by admin takes effect IMMEDIATELY with zero waiting for TTL', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();

  const userId = 'user-disable-test-id';
  const token = 'user-disable-test-token';
  const serverId = 'srv-disable-test';

  // Seed user and session
  inMemorySupabase.users.push({
    id: userId,
    email: 'testuser@example.com',
    role: 'user',
    must_change_password: false,
    is_disabled: false,
    created_at: new Date().toISOString()
  });
  inMemorySupabase.sessions.set(token, {
    user: { id: userId, email: 'testuser@example.com', role: 'user', is_disabled: false, must_change_password: false },
    access_token: token
  });
  inMemorySupabase.servers.push({
    id: serverId,
    name: 'User Server',
    ashost: '192.168.1.110',
    sysnr: '00',
    client: '100',
    owner_id: userId,
    is_active: true,
    is_disabled: false
  });

  // Request 1: succeeds and caches auth token
  const res1 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res1.status, 200);

  // Admin disables user immediately
  await supabaseService.setUserDisabled(userId, true, 'admin-id');

  // Request 2: must immediately be blocked with 403 USER_DISABLED without waiting for TTL
  const res2 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res2.status, 403);
  assert.equal(res2.data.code, 'USER_DISABLED');
});

test('13. must_change_password takes effect IMMEDIATELY with zero waiting for TTL', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();

  const userId = 'user-pwd-change-id';
  const token = 'user-pwd-change-token';

  inMemorySupabase.users.push({
    id: userId,
    email: 'pwdchange@example.com',
    role: 'user',
    must_change_password: false,
    is_disabled: false,
    created_at: new Date().toISOString()
  });
  inMemorySupabase.sessions.set(token, {
    user: { id: userId, email: 'pwdchange@example.com', role: 'user', is_disabled: false, must_change_password: false },
    access_token: token
  });

  // Request 1: succeeds
  const res1 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res1.status, 200);

  // Admin or system sets must_change_password = true
  await supabaseService.setUserMustChangePassword(userId, true);

  // Request 2: must immediately be blocked with 403 PASSWORD_CHANGE_REQUIRED
  const res2 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res2.status, 403);
  assert.equal(res2.data.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('14. User deleted takes effect IMMEDIATELY with zero waiting for TTL', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();

  const userId = 'user-delete-test-id';
  const token = 'session-delete-test-token';

  inMemorySupabase.users.push({
    id: userId,
    email: 'deleteuser@example.com',
    role: 'user',
    must_change_password: false,
    is_disabled: false,
    created_at: new Date().toISOString()
  });
  inMemorySupabase.sessions.set(token, {
    user: { id: userId, email: 'deleteuser@example.com', role: 'user', is_disabled: false, must_change_password: false },
    access_token: token
  });

  const res1 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res1.status, 200);

  // Delete user
  await supabaseService.deleteUser(userId);

  // Request 2: must be rejected with 401 Session expired or invalid
  const res2 = await makeRequest('GET', '/api/servers', {
    authorization: `Bearer ${token}`
  });
  assert.equal(res2.status, 401);
});

test('15. Server edit, owner change, or disable invalidates cache IMMEDIATELY', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();

  const serverId = 'srv-mutation-test';
  const ownerA = 'owner-a-id';
  const ownerB = 'owner-b-id';

  inMemorySupabase.servers.push({
    id: serverId,
    name: 'Original Name',
    ashost: '192.168.1.111',
    sysnr: '00',
    client: '100',
    owner_id: ownerA,
    is_active: true,
    is_disabled: false
  });

  // 1. Initial fetch into cache
  const s1 = await supabaseService.getServerById(serverId);
  assert.equal(s1.name, 'Original Name');

  // 2. User edits server
  await supabaseService.updateUserServer(serverId, ownerA, { name: 'Renamed Server' });
  const s2 = await supabaseService.getServerById(serverId);
  assert.equal(s2.name, 'Renamed Server', 'User edit must reflect immediately');

  // 3. Admin reassigns owner
  await supabaseService.updateServer(serverId, { owner_id: ownerB });
  const s3 = await supabaseService.getServerById(serverId);
  assert.equal(s3.owner_id, ownerB, 'Owner change must reflect immediately');

  // 4. Admin disables server
  await supabaseService.updateServer(serverId, { is_disabled: true });
  const s4 = await supabaseService.getServerById(serverId);
  assert.equal(s4.is_disabled, true, 'Server disable must reflect immediately');
});

test('16. Allowlist addition or deletion invalidates cache IMMEDIATELY', async () => {
  const { supabaseCache } = await import('../services/supabaseCache.js');
  supabaseService.resetMemoryStore();

  // 1. Fetch initial allowlist
  const initial = await supabaseService.getAllowlist();
  const initialCount = initial.length;

  // 2. Add entry
  const { data: newEntry } = await supabaseService.addAllowlistEntry({ pattern: '10.99.*.*' });
  assert.ok(newEntry?.id);

  // 3. Must reflect immediately
  const afterAdd = await supabaseService.getAllowlist();
  assert.equal(afterAdd.length, initialCount + 1);
  assert.ok(afterAdd.some((e) => e.pattern === '10.99.*.*'));

  // 4. Delete entry
  await supabaseService.deleteAllowlistEntry(newEntry.id);
  const afterDelete = await supabaseService.getAllowlist();
  assert.equal(afterDelete.length, initialCount);
  assert.ok(!afterDelete.some((e) => e.pattern === '10.99.*.*'));
});
