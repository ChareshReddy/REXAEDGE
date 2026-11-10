import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import assert from 'assert';
import http from 'http';
const { default: app } = await import('../server.js');
import { validateServerLimits } from '../routes/admin.js';
import {
  SapConnectionPool,
  resetAllPools,
  updatePoolConfig,
  getSapConnectionPool,
  RFC_PRIORITY
} from '../services/sapConnectionPool.js';
import { MockRfcEngine, createMockClientClass } from './load/mockRfcEngine.js';
import { bomJobRepository } from '../services/bomJobRepository.js';
import { supabaseService } from '../services/supabaseClient.js';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

let server;
let baseUrl;

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

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

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('============================================================');
  console.log('  TEST: STAGE 6 - ADMIN UI FOR MULTIPLE SERVERS & LIMITS    ');
  console.log('============================================================\n');

  // Start HTTP test server
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const adminLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@nextitpoint.com',
    password: 'Admin@123456'
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
  const adminToken = adminLogin.data.token;

  const userLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'user@nextitpoint.com',
    password: 'User@123456'
  });
  assert.strictEqual(userLogin.status, 200, 'User login must succeed');
  const userToken = userLogin.data.token;

  try {
    // -----------------------------------------------------------------------
    // Test 1: validateServerLimits range & logic validation
    // -----------------------------------------------------------------------
    console.log('1. Testing validateServerLimits:');
    {
      // Valid input
      const validRes = validateServerLimits({
        max_connections: 5,
        per_user_limit: 3,
        queue_timeout_seconds: 25,
        rfc_call_timeout_seconds: 60
      });
      assert.strictEqual(validRes.valid, true);
      assert.strictEqual(validRes.max_connections, 5);
      assert.strictEqual(validRes.per_user_limit, 3);
      assert.strictEqual(validRes.queue_timeout_ms, 25000);
      assert.strictEqual(validRes.rfc_call_timeout_ms, 60000);

      // max_connections < 1
      assert.strictEqual(validateServerLimits({ max_connections: 0 }).valid, false);
      // max_connections > 20
      assert.strictEqual(validateServerLimits({ max_connections: 21 }).valid, false);

      // per_user_limit > max_connections
      const perUserOver = validateServerLimits({ max_connections: 4, per_user_limit: 5 });
      assert.strictEqual(perUserOver.valid, false);
      assert.ok(perUserOver.error.includes('cannot exceed max connections'));

      // per_user_limit < 1
      assert.strictEqual(validateServerLimits({ per_user_limit: 0 }).valid, false);

      // queue_timeout_seconds < 5 or > 120
      assert.strictEqual(validateServerLimits({ queue_timeout_seconds: 4 }).valid, false);
      assert.strictEqual(validateServerLimits({ queue_timeout_seconds: 121 }).valid, false);

      // rfc_call_timeout_seconds < 10 or > 300
      assert.strictEqual(validateServerLimits({ rfc_call_timeout_seconds: 9 }).valid, false);
      assert.strictEqual(validateServerLimits({ rfc_call_timeout_seconds: 301 }).valid, false);

      console.log('   ✓ validateServerLimits enforces all bounds and conversions properly');
    }

    // -----------------------------------------------------------------------
    // Test 2: Live Reconfiguration & Idle Connection Draining
    // -----------------------------------------------------------------------
    console.log('\n2. Testing live reconfigure & idle draining:');
    {
      await resetAllPools();
      const mockEngine = new MockRfcEngine({
        name: 'SAP_RECONFIG_TEST',
        minLatencyMs: 5,
        maxLatencyMs: 10,
        maxConnections: 10
      });
      const ClientClass = createMockClientClass(mockEngine);

      const pool = new SapConnectionPool('SERVER_RECONFIG_1', {
        max_connections: 5,
        per_user_limit: 5,
        queue_timeout_ms: 10000,
        rfc_call_timeout_ms: 10000
      }, { ClientClass });

      // Run 4 calls to create 4 connections and return them to the idle pool
      await Promise.all([
        pool.run(RFC_PRIORITY.READ, 'u1', async () => 'ok'),
        pool.run(RFC_PRIORITY.READ, 'u2', async () => 'ok'),
        pool.run(RFC_PRIORITY.READ, 'u3', async () => 'ok'),
        pool.run(RFC_PRIORITY.READ, 'u4', async () => 'ok')
      ]);

      let stats = pool.getStats();
      assert.strictEqual(stats.idleConnections, 4, 'Should have 4 idle connections');

      // Lower max_connections to 2
      pool.updateConfig({ max_connections: 2 });
      stats = pool.getStats();
      assert.strictEqual(pool.maxConnections, 2, 'maxConnections should now be 2');
      assert.strictEqual(stats.idleConnections, 2, 'Excess 2 idle connections should be drained immediately');

      // Raise max_connections to 6
      pool.updateConfig({ max_connections: 6 });
      assert.strictEqual(pool.maxConnections, 6, 'maxConnections should now be 6');

      console.log('   ✓ Live updateConfig adjusts limits and cleanly drains excess idle connections');
    }

    // -----------------------------------------------------------------------
    // Test 3: Disabled Server Rejection & In-Flight Preservation
    // -----------------------------------------------------------------------
    console.log('\n3. Testing disabled server fast rejection:');
    {
      await resetAllPools();
      const mockEngine = new MockRfcEngine({
        name: 'SAP_DISABLED_TEST',
        minLatencyMs: 5,
        maxLatencyMs: 10,
        maxConnections: 5
      });
      const ClientClass = createMockClientClass(mockEngine);

      const pool = new SapConnectionPool('SERVER_DISABLE_1', {
        max_connections: 3,
        per_user_limit: 2,
        is_active: true
      }, { ClientClass });

      // In-flight call
      let inFlightDone = false;
      const inFlightPromise = pool.run(RFC_PRIORITY.READ, 'u1', async () => {
        await new Promise((r) => setTimeout(r, 60));
        inFlightDone = true;
        return 'in-flight-ok';
      });

      await new Promise((r) => setTimeout(r, 15));

      // Disable pool live
      pool.updateConfig({ is_active: false });

      // New call on disabled server should fail fast
      let rejectedFast = false;
      try {
        await pool.run(RFC_PRIORITY.READ, 'u2', async () => 'new-call');
      } catch (err) {
        rejectedFast = true;
        assert.strictEqual(err.code, 'SERVER_DISABLED');
        assert.strictEqual(err.statusCode, 503);
      }
      assert.strictEqual(rejectedFast, true, 'New call must be rejected with SERVER_DISABLED');

      // Wait for in-flight call to finish cleanly
      const inFlightRes = await inFlightPromise;
      assert.strictEqual(inFlightRes, 'in-flight-ok');
      assert.strictEqual(inFlightDone, true, 'In-flight call must complete successfully');

      console.log('   ✓ Disabled server rejects new requests fast (503) while running calls finish');
    }

    // -----------------------------------------------------------------------
    // Test 4: DELETE /api/admin/servers/:id blocks deletion if bulk jobs running (409)
    // -----------------------------------------------------------------------
    console.log('\n4. Testing DELETE server with running jobs blocked (409):');
    {
      const created = await supabaseService.createServer({
        name: 'Delete Block Test Server',
        ashost: '192.168.1.50',
        sysnr: '00',
        client: '100',
        environment: 'SANDBOX'
      });
      const serverId = created.id;

      // Create a running job on this server in bomJobRepository
      await bomJobRepository.saveJob({
        jobId: 'job-stage6-del-test',
        userId: 'admin-uuid-1',
        serverId,
        action: 'validate',
        status: 'running',
        totalRows: 5
      });

      // Attempt DELETE while job is running
      const res = await makeRequest('DELETE', `/api/admin/servers/${serverId}`, null, adminToken);
      assert.strictEqual(res.status, 409, 'Should return 409 Conflict');
      assert.ok(res.data.error.includes('bulk job(s) are running'), 'Error message should mention running jobs');

      // Mark job completed
      await bomJobRepository.saveJob({
        jobId: 'job-stage6-del-test',
        userId: 'admin-uuid-1',
        serverId,
        action: 'validate',
        status: 'completed',
        totalRows: 5
      });

      // Attempt DELETE again -> should succeed
      const resAfter = await makeRequest('DELETE', `/api/admin/servers/${serverId}`, null, adminToken);
      assert.strictEqual(resAfter.status, 200, 'Should delete successfully once jobs finish');

      console.log('   ✓ DELETE server is safely blocked (409) while bulk jobs are executing');
    }

    // -----------------------------------------------------------------------
    // Test 5: Password Security on Add/Edit and Non-disclosure
    // -----------------------------------------------------------------------
    console.log('\n5. Testing password security on GET/PUT/POST:');
    {
      const srvName = 'Secured Creds Server';
      const createRes = await makeRequest('POST', '/api/admin/servers', {
        name: srvName,
        ashost: '10.0.0.99',
        sysnr: '01',
        client: '200',
        environment: 'QA',
        sap_username: 'TEST_USER',
        sap_password: 'SecretPassword123!',
        max_connections: 4,
        per_user_limit: 2,
        queue_timeout_seconds: 15,
        rfc_call_timeout_seconds: 30
      }, adminToken);

      assert.strictEqual(createRes.status, 201);
      const createdSrv = createRes.data.server;
      assert.strictEqual(createdSrv.sap_password, undefined, 'Password must never be returned on creation');

      // GET /servers: ensure password is not disclosed
      const listRes = await makeRequest('GET', '/api/admin/servers', null, adminToken);
      assert.strictEqual(listRes.status, 200);
      const fetched = listRes.data.servers.find((s) => s.id === createdSrv.id);
      assert.ok(fetched, 'Created server must be in list');
      assert.strictEqual(fetched.sap_password, undefined, 'Password must never be returned in server list');
      assert.strictEqual(fetched.has_password, true, 'has_password indicator should be true');

      // PUT without password -> must preserve original password
      const updateRes = await makeRequest('PUT', `/api/admin/servers/${createdSrv.id}`, {
        name: 'Secured Creds Server Renamed',
        max_connections: 6,
        per_user_limit: 3,
        queue_timeout_seconds: 25,
        rfc_call_timeout_seconds: 50,
        sap_password: '' // empty string
      }, adminToken);

      assert.strictEqual(updateRes.status, 200);
      assert.strictEqual(updateRes.data.server.sap_password, undefined, 'Password must not be returned on update');

      const rawInDb = await supabaseService.getServerById(createdSrv.id);
      assert.ok(rawInDb.sap_password_encrypted, 'Encrypted password must be preserved when updating without password');

      console.log('   ✓ Passwords are never returned to client and preserved on blank-password edit');
    }

    // -----------------------------------------------------------------------
    // Test 6: RBAC 403 Non-Admin Protection
    // -----------------------------------------------------------------------
    console.log('\n6. Testing RBAC non-admin 403 protection:');
    {
      const getServersRes = await makeRequest('GET', '/api/admin/servers', null, userToken);
      assert.strictEqual(getServersRes.status, 403, 'Non-admin must receive 403 on GET /api/admin/servers');

      const postServersRes = await makeRequest('POST', '/api/admin/servers', { name: 'X' }, userToken);
      assert.strictEqual(postServersRes.status, 403, 'Non-admin must receive 403 on POST /api/admin/servers');

      const clearCacheRes = await makeRequest('POST', '/api/admin/cache/clear', {}, userToken);
      assert.strictEqual(clearCacheRes.status, 403, 'Non-admin must receive 403 on POST /api/admin/cache/clear');

      // Admin access succeeds
      const adminClearCacheRes = await makeRequest('POST', '/api/admin/cache/clear', {}, adminToken);
      assert.strictEqual(adminClearCacheRes.status, 200, 'Admin must succeed on POST /api/admin/cache/clear');

      console.log('   ✓ Non-admin gets 403 on /api/admin/servers and /api/admin/cache/clear');
    }

    console.log('\n============================================================');
    console.log('  ALL STAGE 6 BACKEND TESTS PASSED SUCCESSFULLY!             ');
    console.log('============================================================\n');
    process.exit(0);
  } finally {
    if (server) {
      server.close();
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
