process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
import 'dotenv/config';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}
import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase } from '../services/supabaseClient.js';
import {
  getServerHealth,
  updateServerHealth,
  getCircuitBreaker,
  BREAKER_STATE,
  HEALTH_STATE
} from '../services/serverHealthService.js';
import { encryptPassword } from '../utils/crypto.js';
import { MODULE_KEYS } from '../config/modules.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { ...extraHeaders };
    if (body) headers['Content-Type'] = 'application/json';

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
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;

  console.log('\n============================================================');
  console.log('  RUNNING SAP SERVER UNREACHABLE REASONS & PARITY SUITE     ');
  console.log('============================================================\n');

  try {
    const testUserId = `test-user-${Date.now()}`;
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

    const userAuthHeaders = {
      Authorization: `Bearer ${testToken}`
    };

    // Populate baseline allowlist for normal servers
    inMemorySupabase.server_allowlist = [
      { id: 'al-1', pattern: '10.0.0.0/8', type: 'DEV' },
      { id: 'al-2', pattern: '192.168.0.0/16', type: 'SANDBOX' }
    ];

    // -------------------------------------------------------------------------
    // 1. Missing x-sap-server-id header -> 404 SERVER_NOT_FOUND
    // -------------------------------------------------------------------------
    console.log('1. Testing missing x-sap-server-id header...');
    {
      const res = await makeRequest('GET', '/api/sap/session-status', null, userAuthHeaders);
      assert.strictEqual(res.status, 404, 'Must return 404 when x-sap-server-id is missing');
      assert.strictEqual(res.body?.code, 'SERVER_NOT_FOUND');
      console.log('   ✓ Missing x-sap-server-id strictly rejected with 404 SERVER_NOT_FOUND');
    }

    // -------------------------------------------------------------------------
    // 2. Server not owned by user (IDOR) -> 404 SERVER_NOT_FOUND
    // -------------------------------------------------------------------------
    console.log('2. Testing foreign server (IDOR protection)...');
    {
      const foreignServer = {
        id: `foreign-${Date.now()}`,
        name: 'Foreign Server',
        owner_id: 'someone-else',
        ashost: '10.1.1.1',
        sysnr: '00',
        client: '100',
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(foreignServer);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': foreignServer.id
      });
      assert.strictEqual(res.status, 404, 'Foreign server access must return 404 SERVER_NOT_FOUND');
      assert.strictEqual(res.body?.code, 'SERVER_NOT_FOUND');
      console.log('   ✓ Foreign server rejected with 404 SERVER_NOT_FOUND');
    }

    // -------------------------------------------------------------------------
    // 3. Server disabled by administrator -> 403 SERVER_DISABLED
    // -------------------------------------------------------------------------
    console.log('3. Testing admin-disabled server...');
    {
      const disabledServer = {
        id: `dis-${Date.now()}`,
        name: 'Disabled SAP Server',
        owner_id: testUserId,
        ashost: '10.1.1.2',
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: encryptPassword('ValidPass123!'),
        is_disabled: true,
        is_active: true
      };
      inMemorySupabase.servers.push(disabledServer);
      inMemorySupabase.setServerModules(disabledServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': disabledServer.id
      });
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body?.code, 'SERVER_DISABLED');
      console.log('   ✓ Disabled server rejected with 403 SERVER_DISABLED');
    }

    // -------------------------------------------------------------------------
    // 4. Missing credentials -> NO_CREDENTIALS
    // -------------------------------------------------------------------------
    console.log('4. Testing server with no credentials...');
    {
      const noCredsServer = {
        id: `nocreds-${Date.now()}`,
        name: 'No Creds Server',
        owner_id: testUserId,
        ashost: '10.1.1.3',
        sysnr: '00',
        client: '100',
        sap_username: null,
        sap_password_encrypted: null,
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(noCredsServer);
      inMemorySupabase.setServerModules(noCredsServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': noCredsServer.id
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.connected, false);
      assert.strictEqual(res.body?.code, 'NO_CREDENTIALS');
      console.log('   ✓ Server with missing credentials returns connected: false, code: NO_CREDENTIALS');
    }

    // -------------------------------------------------------------------------
    // 5. Password decryption failure -> DECRYPT_FAILED
    // -------------------------------------------------------------------------
    console.log('5. Testing corrupted encrypted password...');
    {
      const corruptServer = {
        id: `corrupt-${Date.now()}`,
        name: 'Corrupt Password Server',
        owner_id: testUserId,
        ashost: '10.1.1.4',
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: 'invalid:iv:ciphertext',
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(corruptServer);
      inMemorySupabase.setServerModules(corruptServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': corruptServer.id
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.connected, false);
      assert.strictEqual(res.body?.code, 'DECRYPT_FAILED');
      console.log('   ✓ Corrupt encrypted password returns connected: false, code: DECRYPT_FAILED');
    }

    // -------------------------------------------------------------------------
    // 6. Host not permitted by allowlist -> HOST_NOT_ALLOWED
    // -------------------------------------------------------------------------
    console.log('6. Testing host not on allowlist...');
    {
      const blockedHostServer = {
        id: `blocked-${Date.now()}`,
        name: 'Blocked Host Server',
        owner_id: testUserId,
        ashost: '203.0.113.199', // Outside 10.0.0.0/8 and 192.168.0.0/16
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: encryptPassword('ValidPass123!'),
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(blockedHostServer);
      inMemorySupabase.setServerModules(blockedHostServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': blockedHostServer.id
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.connected, false);
      assert.strictEqual(res.body?.code, 'HOST_NOT_ALLOWED');
      console.log('   ✓ Unallowlisted host returns connected: false, code: HOST_NOT_ALLOWED');
    }

    // -------------------------------------------------------------------------
    // 7. Empty allowlist -> ALLOWLIST_EMPTY
    // -------------------------------------------------------------------------
    console.log('7. Testing empty allowlist rejection...');
    {
      const prevServerAllowlist = inMemorySupabase.server_allowlist ? [...inMemorySupabase.server_allowlist] : [];
      const prevAllowlist = inMemorySupabase.allowlist ? [...inMemorySupabase.allowlist] : [];
      inMemorySupabase.server_allowlist = [];
      inMemorySupabase.allowlist = [];

      const normalServer = {
        id: `normal-${Date.now()}`,
        name: 'Normal Host Server',
        owner_id: testUserId,
        ashost: '10.1.1.5',
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: encryptPassword('ValidPass123!'),
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(normalServer);
      inMemorySupabase.setServerModules(normalServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': normalServer.id
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.connected, false);
      assert.strictEqual(res.body?.code, 'ALLOWLIST_EMPTY');
      console.log('   ✓ Empty allowlist returns connected: false, code: ALLOWLIST_EMPTY');

      // Restore allowlist
      inMemorySupabase.server_allowlist = prevServerAllowlist;
      inMemorySupabase.allowlist = prevAllowlist;
    }

    // -------------------------------------------------------------------------
    // 8. DNS Rebinding detection -> DNS_REBINDING_REFUSED
    // -------------------------------------------------------------------------
    console.log('8. Testing DNS rebinding refusal...');
    {
      const rebindingServer = {
        id: `rebind-${Date.now()}`,
        name: 'Rebinding Server',
        owner_id: testUserId,
        ashost: '10.1.1.6',
        validated_ip: '10.1.1.99', // Expected IP differs from resolved IP 10.1.1.6
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: encryptPassword('ValidPass123!'),
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(rebindingServer);
      inMemorySupabase.setServerModules(rebindingServer.id, [MODULE_KEYS.BOM], testUserId);

      const res = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': rebindingServer.id
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body?.connected, false);
      assert.strictEqual(res.body?.code, 'DNS_REBINDING_REFUSED');
      console.log('   ✓ DNS rebinding returns connected: false, code: DNS_REBINDING_REFUSED');
    }

    // -------------------------------------------------------------------------
    // 9. Circuit Breaker Trips on Consecutive Failures & Resets on Successful Test
    // -------------------------------------------------------------------------
    console.log('9. Testing Circuit Breaker trip and reset on connection test...');
    {
      const breakerServer = {
        id: `breaker-${Date.now()}`,
        name: 'Breaker Test Server',
        owner_id: testUserId,
        ashost: '10.1.1.7',
        sysnr: '00',
        client: '100',
        sap_username: 'SAPUSER',
        sap_password_encrypted: encryptPassword('ValidPass123!'),
        is_disabled: false,
        is_active: true
      };
      inMemorySupabase.servers.push(breakerServer);
      inMemorySupabase.setServerModules(breakerServer.id, [MODULE_KEYS.BOM], testUserId);

      const breaker = getCircuitBreaker(breakerServer.id);
      assert.strictEqual(breaker.getState(), BREAKER_STATE.CLOSED);

      // Simulate 3 consecutive connection failures (e.g. user was off-network)
      updateServerHealth(breakerServer.id, {
        success: false,
        error: Object.assign(new Error('Connection timed out while off-network'), { code: 'ETIMEDOUT' })
      });
      breaker.onFailure(true, 'Connection timed out');
      breaker.onFailure(true, 'Connection timed out');
      breaker.onFailure(true, 'Connection timed out');

      assert.strictEqual(breaker.getState(), BREAKER_STATE.OPEN, 'Breaker must be OPEN after 3 failures');
      const downHealth = getServerHealth(breakerServer.id);
      assert.strictEqual(downHealth.status, HEALTH_STATE.DOWN);

      // Poll session status while breaker is OPEN -> returns SERVER_UNAVAILABLE
      const downStatusRes = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': breakerServer.id
      });
      assert.strictEqual(downStatusRes.status, 200);
      assert.strictEqual(downStatusRes.body?.connected, false);
      assert.strictEqual(downStatusRes.body?.circuit_breaker, 'open');

      // Now user is back on office network and clicks Test connection
      const testRes = await makeRequest('POST', `/api/servers/${breakerServer.id}/test`, {}, userAuthHeaders);
      assert.strictEqual(testRes.status, 200, 'Test connection must succeed');
      assert.strictEqual(testRes.body?.success, true);

      // Verify circuit breaker and health cache were reset
      assert.strictEqual(breaker.getState(), BREAKER_STATE.CLOSED, 'Breaker must reset to CLOSED on successful test');
      const recoveredHealth = getServerHealth(breakerServer.id);
      assert.strictEqual(recoveredHealth.status, HEALTH_STATE.HEALTHY);
      assert.strictEqual(recoveredHealth.circuit_breaker, 'closed');
      assert.strictEqual(recoveredHealth.last_error, null);

      // Subsequent session-status poll immediately returns connected: true!
      const recoveredStatusRes = await makeRequest('GET', '/api/sap/session-status', null, {
        ...userAuthHeaders,
        'x-sap-server-id': breakerServer.id
      });
      assert.strictEqual(recoveredStatusRes.status, 200);
      assert.strictEqual(recoveredStatusRes.body?.connected, true);
      assert.strictEqual(recoveredStatusRes.body?.status, 'AVAILABLE');
      console.log('   ✓ Circuit breaker trips to OPEN on failures and cleanly resets to CLOSED on test');
    }

    // -------------------------------------------------------------------------
    // 10. Shared Source of Truth: GET /api/servers returns live health_status
    // -------------------------------------------------------------------------
    console.log('10. Testing GET /api/servers shared source of truth...');
    {
      const serversListRes = await makeRequest('GET', '/api/servers', null, userAuthHeaders);
      assert.strictEqual(serversListRes.status, 200);
      assert(Array.isArray(serversListRes.body?.servers));

      for (const s of serversListRes.body.servers) {
        assert(s.health_status, `Server ${s.id} must include health_status`);
        assert(s.circuit_breaker, `Server ${s.id} must include circuit_breaker`);
        if (s.is_disabled) {
          assert.strictEqual(s.health_status, 'disabled');
        }
      }
      console.log('   ✓ GET /api/servers returns synchronized live health_status and circuit_breaker');
    }

    console.log('\n============================================================');
    console.log('  ALL SAP SERVER UNREACHABLE REASONS & PARITY TESTS PASSED! ');
    console.log('============================================================\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
