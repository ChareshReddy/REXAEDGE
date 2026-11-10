process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase } from '../services/supabaseClient.js';
import { BOM_APP_KEYS, ALL_BOM_APPS } from '../config/modules.js';

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

async function runPermissionsEnforcementTests() {
  console.log('\n======================================================');
  console.log('  TEST: BACKEND PERMISSION ENFORCEMENT ON SAP ENDPOINTS');
  console.log('======================================================\n');

  // Start HTTP server on dynamic port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Setup Admin, Users, and Servers
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    // Server A & Server B
    const srvARes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server Alpha Perm',
      ashost: '115.245.150.98',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      sap_username: 'SAP_USER_A',
      sap_password: 'Password123!',
      modules: ['bom']
    }, adminToken);
    const serverA = srvARes.data.server;

    const srvBRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server Beta Perm',
      ashost: '115.245.150.99',
      sysnr: '01',
      client: '200',
      environment: 'DEV',
      sap_username: 'SAP_USER_B',
      sap_password: 'Password123!',
      modules: ['bom']
    }, adminToken);
    const serverB = srvBRes.data.server;

    // Create Display-only user
    const uDisplayRes = await makeRequest('POST', '/api/admin/users', {
      email: 'perm_display_only@company.com',
      password: 'Password@123',
      name: 'Display Only User'
    }, adminToken);
    const userDisplay = uDisplayRes.data.user;

    // Grant userDisplay ONLY 'bom.display' on Server A
    await makeRequest('POST', '/api/admin/permissions', {
      userId: userDisplay.id,
      serverId: serverA.id,
      permissions: ['bom.display']
    }, adminToken);

    // Login userDisplay
    const lDisplay = await makeRequest('POST', '/api/auth/login', {
      email: 'perm_display_only@company.com',
      password: 'Password@123'
    });
    const tokenDisplay = lDisplay.data.token;
    const headerDisplayA = { Authorization: `Bearer ${tokenDisplay}`, 'x-server-id': serverA.id };
    const headerDisplayB = { Authorization: `Bearer ${tokenDisplay}`, 'x-server-id': serverB.id };

    // --- TEST (a): Display-only user gets 403 on validate, create, copy and delete endpoints ---
    console.log('Test (a): User with only bom.display access on Server A:');
    
    // Validate endpoints
    const resValSource = await makeRequest('POST', '/api/bom/validate-source', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resValSource.status, 403, 'POST /api/bom/validate-source must return 403 for display-only user');

    // Create endpoints
    const resCreate = await makeRequest('POST', '/api/bom/create', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resCreate.status, 403, 'POST /api/bom/create must return 403');

    const resCreateSingle = await makeRequest('POST', '/api/bom/create-single', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resCreateSingle.status, 403, 'POST /api/bom/create-single must return 403');

    const resCreateBulk = await makeRequest('POST', '/api/bom/create-bulk', { boms: [] }, headerDisplayA);
    assert.strictEqual(resCreateBulk.status, 403, 'POST /api/bom/create-bulk must return 403');

    // Copy endpoints
    const resCopy = await makeRequest('POST', '/api/bom/copy', { material: 'MAT-1', fromPlant: '1000', toPlant: '1001' }, headerDisplayA);
    assert.strictEqual(resCopy.status, 403, 'POST /api/bom/copy must return 403');

    const resBatchCopy = await makeRequest('POST', '/api/bom/batch-copy', { boms: [] }, headerDisplayA);
    assert.strictEqual(resBatchCopy.status, 403, 'POST /api/bom/batch-copy must return 403');

    // Delete endpoint
    const resDelete = await makeRequest('POST', '/api/bom/delete', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resDelete.status, 403, 'POST /api/bom/delete must return 403');

    // Display endpoints MUST WORK (200)
    const resRead = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resRead.status, 200, 'POST /api/bom/read must return 200 for display-only user');

    const resHier = await makeRequest('POST', '/api/bom/hierarchy', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resHier.status, 200, 'POST /api/bom/hierarchy must return 200 for display-only user');

    console.log('   ✓ Display-only user successfully blocked with 403 on validate, create, copy, delete; 200 on read/hierarchy');

    // --- TEST (b): User with no permission on Server B gets 403 on Server B but works on Server A ---
    console.log('\nTest (b): User with grants on Server A but NO permission on Server B:');
    const resReadB = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayB);
    assert.strictEqual(resReadB.status, 403, 'Accessing Server B without grant must return 403');
    assert.match(resReadB.data.error || '', /Access denied/, 'Must return clear access denied message');

    const resReadA = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resReadA.status, 200, 'Accessing Server A with grant must return 200');
    console.log('   ✓ Unassigned server strictly returns 403; assigned server works cleanly');

    // --- TEST (c): Disabled or unknown server ID returns clean error ---
    console.log('\nTest (c): Disabled or unknown server ID returns clean error:');
    const headerUnknown = { Authorization: `Bearer ${tokenDisplay}`, 'x-server-id': '00000000-0000-0000-0000-000000000000' };
    const resUnknown = await makeRequest('POST', '/api/bom/read', { material: 'MAT-1' }, headerUnknown);
    assert.strictEqual(resUnknown.status, 403, 'Unknown server ID must return 403');

    // Disable Server A and verify
    await makeRequest('PUT', `/api/admin/servers/${serverA.id}`, { is_active: false }, adminToken);
    const resDisabled = await makeRequest('POST', '/api/bom/read', { material: 'MAT-1' }, headerDisplayA);
    assert.strictEqual(resDisabled.status, 403, 'Inactive/disabled server must return 403');
    assert.match(resDisabled.data.error || '', /inactive|Server not found/i);
    // Re-enable
    await makeRequest('PUT', `/api/admin/servers/${serverA.id}`, { is_active: true }, adminToken);
    console.log('   ✓ Disabled and unknown server IDs return clean structured error');

    // --- TEST (d): Admin keeps today\'s behavior (bypasses permission checks) ---
    console.log('\nTest (d): Admin user full permission bypass:');
    const headerAdmin = { Authorization: `Bearer ${adminToken}`, 'x-server-id': serverA.id };
    const resAdminCreate = await makeRequest('POST', '/api/bom/create', { material: 'ADMIN_MAT_1', plant: '1000' }, headerAdmin);
    assert.strictEqual(resAdminCreate.status, 200, 'Admin must have full access to create BOM');
    const resAdminDelete = await makeRequest('POST', '/api/bom/delete', { material: 'ADMIN_MAT_1', plant: '1000' }, headerAdmin);
    assert.strictEqual(resAdminDelete.status, 200, 'Admin must have full access to delete BOM');
    console.log('   ✓ Admin user bypasses individual permission gates as expected');

    // --- TEST (e): Unauthenticated requests get 401 ---
    console.log('\nTest (e): Unauthenticated requests:');
    const resUnauth = await makeRequest('POST', '/api/bom/read', { material: 'MAT-1' }, null);
    assert.strictEqual(resUnauth.status, 401, 'Unauthenticated request must return 401');
    const resUnauthCreate = await makeRequest('POST', '/api/bom/create', { material: 'MAT-1' }, null);
    assert.strictEqual(resUnauthCreate.status, 401, 'Unauthenticated request to create must return 401');
    console.log('   ✓ Unauthenticated requests return 401 Unauthorized');

    console.log('\n======================================================');
    console.log('✅ ALL BACKEND PERMISSION ENFORCEMENT TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runPermissionsEnforcementTests().catch((err) => {
  console.error('\nTest Failed:', err);
  if (server) server.close();
  process.exit(1);
});
