import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService } from '../services/supabaseClient.js';
import { MODULE_KEYS } from '../config/modules.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, tokenOrHeaders = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {};

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    if (typeof tokenOrHeaders === 'string') {
      headers['Authorization'] = `Bearer ${tokenOrHeaders}`;
    } else if (tokenOrHeaders && typeof tokenOrHeaders === 'object') {
      Object.assign(headers, tokenOrHeaders);
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

async function runNoPermittedServerAccessTests() {
  console.log('\n======================================================');
  console.log('--- Starting No-Permitted-Server Access Enforcement Tests ---');
  console.log('======================================================\n');

  process.env.USE_MOCK_SAP = 'true';
  process.env.NODE_ENV = 'test';

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Admin login to set up users and servers
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    // List active servers
    const servers = await supabaseService.listServers();
    assert.ok(servers.length > 0, 'At least one server must exist');
    const validServerId = servers[0].id;

    // 2. Create User A (Zero server permissions)
    const zeroUserEmail = `zero_server_${Date.now()}@nextitpoint.com`;
    const zeroUserRes = await makeRequest('POST', '/api/admin/users', {
      email: zeroUserEmail,
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(zeroUserRes.status, 201);
    const zeroUserId = zeroUserRes.data.user.id;

    // Login as User A
    const zeroLogin = await makeRequest('POST', '/api/auth/login', {
      email: zeroUserEmail,
      password: 'Password@123'
    });
    assert.strictEqual(zeroLogin.status, 200);
    const zeroToken = zeroLogin.data.token;

    // 3. Create User B (Permitted to Server 1)
    const permUserEmail = `perm_server_${Date.now()}@nextitpoint.com`;
    const permUserRes = await makeRequest('POST', '/api/admin/users', {
      email: permUserEmail,
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(permUserRes.status, 201);
    const permUserId = permUserRes.data.user.id;

    // Assign Server 1 to User B
    const permAssign = await makeRequest('POST', '/api/admin/permissions', {
      user_id: permUserId,
      server_id: validServerId
    }, adminToken);
    assert.strictEqual(permAssign.status, 201);

    // Login as User B
    const permLogin = await makeRequest('POST', '/api/auth/login', {
      email: permUserEmail,
      password: 'Password@123'
    });
    assert.strictEqual(permLogin.status, 200);
    const permToken = permLogin.data.token;

    console.log('✓ Test users established: Zero-permission user and Permitted user');

    // -------------------------------------------------------------
    // TEST SECTION A: Zero-Permission User Rejections (HTTP 403)
    // -------------------------------------------------------------
    console.log('\n--- Section A: Verifying 403 on all routes for zero-permission user ---');

    const zeroPermissionRoutes = [
      { name: 'GET /api/sap/session-status', method: 'GET', path: '/api/sap/session-status', body: null },
      { name: 'GET /api/sap/session-status (unpermitted serverId)', method: 'GET', path: `/api/sap/session-status?serverId=${validServerId}`, body: null },
      { name: 'GET /api/sap/sessions', method: 'GET', path: '/api/sap/sessions', body: null },
      { name: 'GET /api/sap/sessions (unpermitted serverId)', method: 'GET', path: `/api/sap/sessions?serverId=${validServerId}`, body: null },
      { name: 'POST /api/sap/sessions/select', method: 'POST', path: '/api/sap/sessions/select', body: { sessionId: 'RFC_DEFAULT' } },
      { name: 'GET /api/bom/ping', method: 'GET', path: '/api/bom/ping', body: null },
      { name: 'POST /api/bom/validate-source', method: 'POST', path: '/api/bom/validate-source', body: { material: '11021735', plant: '1000' } },
      { name: 'POST /api/bom/read', method: 'POST', path: '/api/bom/read', body: { material: '11021735', plant: '1000', bomUsage: '1' } },
      { name: 'POST /api/bom/create', method: 'POST', path: '/api/bom/create', body: { material: '11021735', plant: '1000', bomUsage: '1', components: [] } },
      { name: 'POST /api/bom/copy', method: 'POST', path: '/api/bom/copy', body: { sourceMaterial: '11021735', sourcePlant: '1000', targetMaterial: '11021736', targetPlant: '1000' } },
      { name: 'POST /api/bom/delete', method: 'POST', path: '/api/bom/delete', body: { material: '11021735', plant: '1000' } },
      { name: 'POST /api/bom/jobs/start', method: 'POST', path: '/api/bom/jobs/start', body: { type: 'validate_bulk', items: [] } },
      { name: 'GET /api/bom/jobs/active', method: 'GET', path: '/api/bom/jobs/active', body: null },
      { name: 'GET /api/materials/search?q=1102', method: 'GET', path: '/api/materials/search?q=1102', body: null },
      { name: 'GET /api/materials/11021735', method: 'GET', path: '/api/materials/11021735', body: null },
      { name: 'POST /api/materials/check', method: 'POST', path: '/api/materials/check', body: { plant: '1000', material: '11021735' } },
      { name: 'POST /api/materials/ (check alias)', method: 'POST', path: '/api/materials/', body: { plant: '1000', material: '11021735' } },
      { name: 'GET /api/plants', method: 'GET', path: '/api/plants', body: null },
      { name: 'POST /api/chat', method: 'POST', path: '/api/chat', body: { message: 'hello' } }
    ];

    for (const route of zeroPermissionRoutes) {
      const res = await makeRequest(route.method, route.path, route.body, zeroToken);
      assert.strictEqual(
        res.status,
        403,
        `Expected 403 on ${route.name} for zero-permission user, got ${res.status}: ${JSON.stringify(res.data)}`
      );
      assert.ok(
        res.data?.error?.includes('Access denied') || res.data?.error?.includes('permission'),
        `Expected access denied error message on ${route.name}, got ${JSON.stringify(res.data)}`
      );
      console.log(`   ✓ ${route.name} -> 403 Forbidden`);
    }

    // -------------------------------------------------------------
    // TEST SECTION B: Permitted User Success (HTTP 200)
    // -------------------------------------------------------------
    console.log('\n--- Section B: Verifying 200 for permitted user ---');

    const statusRes = await makeRequest('GET', '/api/sap/session-status', null, permToken);
    assert.strictEqual(statusRes.status, 200);
    assert.ok(statusRes.data.connected !== undefined);
    console.log('   ✓ GET /api/sap/session-status -> 200 (connected verified)');

    const sessRes = await makeRequest('GET', '/api/sap/sessions', null, permToken);
    assert.strictEqual(sessRes.status, 200);
    assert.strictEqual(sessRes.data.success, true);
    console.log('   ✓ GET /api/sap/sessions -> 200 (sessions list returned)');

    const selectRes = await makeRequest('POST', '/api/sap/sessions/select', { sessionId: 'RFC_DEFAULT' }, permToken);
    assert.strictEqual(selectRes.status, 200);
    assert.strictEqual(selectRes.data.success, true);
    console.log('   ✓ POST /api/sap/sessions/select -> 200 (session selected)');

    const pingRes = await makeRequest('GET', '/api/bom/ping', null, permToken);
    assert.strictEqual(pingRes.status, 200);
    console.log('   ✓ GET /api/bom/ping -> 200');

    const valRes = await makeRequest('POST', '/api/bom/validate-source', { material: '11021735', plant: '1000' }, permToken);
    assert.strictEqual(valRes.status, 200);
    console.log('   ✓ POST /api/bom/validate-source -> 200');

    const searchRes = await makeRequest('GET', '/api/materials/search?q=1102', null, permToken);
    assert.strictEqual(searchRes.status, 200);
    assert.strictEqual(searchRes.data.success, true);
    console.log('   ✓ GET /api/materials/search -> 200');

    const plantRes = await makeRequest('GET', '/api/plants', null, permToken);
    assert.strictEqual(plantRes.status, 200);
    assert.strictEqual(plantRes.data.success, true);
    console.log('   ✓ GET /api/plants -> 200');

    console.log('\n======================================================');
    console.log('✅ ALL NO-PERMITTED-SERVER ACCESS TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (server) {
      server.close();
    }
  }
}

runNoPermittedServerAccessTests().catch((err) => {
  console.error('❌ Test failed:', err);
  if (server) server.close();
  process.exit(1);
});
