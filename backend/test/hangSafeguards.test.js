process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
import 'dotenv/config';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}

import assert from 'assert';
import http from 'http';
import dns from 'dns';
import app from '../server.js';
import { inMemorySupabase, supabaseService } from '../services/supabaseClient.js';
import { supabaseCache } from '../services/supabaseCache.js';
import { ensureMockOwnedServer } from './helpers/testServerHelper.js';
import { getCircuitBreaker, BREAKER_STATE } from '../services/serverHealthService.js';
import { f4CacheService } from '../services/f4CacheService.js';
import { setTestPingOverride } from '../services/sapRfcClient.js';

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

async function runTests() {
  console.log('\n============================================================');
  console.log('  TESTING HANG SAFEGUARDS (DNS, PROBE & ROUTE TIMEOUTS)');
  console.log('============================================================');

  const testUserId = `test-user-${Date.now()}`;
  const testServerId = `srv-${Date.now()}`;
  const testToken = `token-${testUserId}`;
  const testUser = {
    id: testUserId,
    email: `${testUserId}@example.com`,
    role: 'user',
    must_change_password: false,
    is_disabled: false
  };
  inMemorySupabase.users.push(testUser);
  inMemorySupabase.sessions.set(testToken, {
    user: testUser,
    expiresAt: Date.now() + 3600000
  });

  // Ensure test server exists with non-IP hostname to exercise DNS
  ensureMockOwnedServer(testUserId, testServerId, 'sap-slow-dns.example.corp');
  const serverObj = inMemorySupabase.servers.find((s) => s.id === testServerId);
  serverObj.ashost = 'sap-slow-dns.example.corp';
  serverObj.sap_username = 'TEST_USER';
  serverObj.sap_password = 'mock_password';

  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const authHeaders = {
    Authorization: `Bearer ${testToken}`,
    'x-sap-server-id': testServerId
  };

  const origDnsLookup = dns.promises.lookup;

  try {
    // ------------------------------------------------------------------------
    // 1. Slow DNS Safeguard on GET /api/sap/session-status
    // ------------------------------------------------------------------------
    console.log('\n1. Testing slow DNS (5s delay) triggers 3s DNS safeguard on session-status...');
    dns.promises.lookup = async () => {
      await new Promise((r) => setTimeout(r, 5000));
      return [{ address: '192.168.12.240', family: 4 }];
    };

    const start1 = Date.now();
    const res1 = await makeRequest('GET', '/api/sap/session-status', authHeaders);
    const duration1 = Date.now() - start1;

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.connected, false);
    // DNS timeout (3s) must abort before the 5s sleep completes, well under 4.5s
    assert.ok(duration1 < 4500, `Expected DNS safeguard under 4500ms, took ${duration1}ms`);
    console.log(`   ✓ session-status answered in ${duration1}ms with connected: false (DNS bounded)`);

    // ------------------------------------------------------------------------
    // 2. Slow DNS Safeguard on GET /api/plants
    // ------------------------------------------------------------------------
    console.log('\n2. Testing slow DNS triggers timeout and does NOT stay pending on /api/plants...');
    f4CacheService.clear(testServerId);

    const start2 = Date.now();
    const res2 = await makeRequest('GET', '/api/plants?refresh=true', authHeaders);
    const duration2 = Date.now() - start2;

    assert.ok(duration2 < 4500, `Expected plants response under 4500ms, took ${duration2}ms`);
    assert.ok(res2.status === 200 || res2.status === 504 || res2.status === 503);
    console.log(`   ✓ /api/plants answered in ${duration2}ms with status ${res2.status} (never stayed pending)`);

    // Restore DNS lookup
    dns.promises.lookup = origDnsLookup;

    // ------------------------------------------------------------------------
    // 3. Hanging Ping on HALF_OPEN probe in session-status (5s safeguard)
    // ------------------------------------------------------------------------
    console.log('\n3. Testing hanging HALF_OPEN probe (mocked hanging ping)...');
    serverObj.ashost = '192.168.12.240';
    supabaseCache.invalidateServer(testServerId);
    const breaker = getCircuitBreaker(testServerId);
    breaker.state = BREAKER_STATE.HALF_OPEN;

    // Mock pingRfcServer to hang indefinitely
    setTestPingOverride(() => new Promise(() => {}));

    const start3 = Date.now();
    const res3 = await makeRequest('GET', '/api/sap/session-status', authHeaders);
    const duration3 = Date.now() - start3;

    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.data.connected, false);
    // Probe timeout (5s) must answer in ~5-6.5s, well under the 10s whole-route timeout
    assert.ok(duration3 >= 4800 && duration3 < 7500, `Expected HALF_OPEN probe safeguard ~5-7s, took ${duration3}ms`);
    console.log(`   ✓ session-status answered in ${duration3}ms without hanging on HALF_OPEN probe`);

    // Restore ping
    setTestPingOverride(null);

    // ------------------------------------------------------------------------
    // 4. F4 Cache Service Slot and Promise Release in Finally
    // ------------------------------------------------------------------------
    console.log('\n4. Testing F4 cache service clears pending map on error/timeout...');
    f4CacheService.clear(testServerId);
    let failed = false;
    try {
      await f4CacheService.fetchWithCache({
        serverId: testServerId,
        lookupType: 'plants',
        query: 'hang_test',
        fetchFn: () => new Promise((_, reject) => setTimeout(() => reject(new Error('Simulated failure')), 50)),
        timeoutMs: 1000
      });
    } catch {
      failed = true;
    }
    assert.ok(failed, 'Expected fetchWithCache to reject');
    assert.strictEqual(f4CacheService.pending.size, 0, 'Pending map must be cleanly purged in finally');
    console.log('   ✓ F4 cache cleanly releases in-flight coalesced entry in finally');

    console.log('\n============================================================');
    console.log('  ALL HANG SAFEGUARD TESTS PASSED SUCCESSFULLY!');
    console.log('============================================================\n');
  } finally {
    dns.promises.lookup = origDnsLookup;
    setTestPingOverride(null);
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  if (server) server.close();
  process.exit(1);
});
