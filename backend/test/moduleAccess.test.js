import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase } from '../services/supabaseClient.js';
import { MODULE_KEYS, MODULE_REGISTRY, isModuleAvailable } from '../config/modules.js';

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

async function runModuleAccessTests() {
  console.log('\n============================================================');
  console.log('       RUNNING SERVER MODULE ACCESS & REGISTRY TESTS        ');
  console.log('============================================================\n');

  // Start HTTP Server on an ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  process.env.USE_MOCK_SAP = 'true';
  process.env.SKIP_GATEWAY_AUTH = 'false';

  let serverAId;
  let serverBId;
  let serverCId;
  let userId;
  let adminToken;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Single source of truth module registry integrity
    // -------------------------------------------------------------------------
    console.log('Test 1: Module registry contains required entries and status:');
    assert(Array.isArray(MODULE_REGISTRY), 'MODULE_REGISTRY must be an array');
    const bomMod = MODULE_REGISTRY.find((m) => m.key === MODULE_KEYS.BOM);
    assert(bomMod, 'BOM module must be present in registry');
    assert.strictEqual(bomMod.status, 'available', 'BOM status must be available');
    assert(isModuleAvailable(MODULE_KEYS.BOM), 'isModuleAvailable(bom) must return true');

    const routingMod = MODULE_REGISTRY.find((m) => m.key === MODULE_KEYS.ROUTING);
    assert(routingMod, 'Routing module must be present in registry');
    assert.strictEqual(routingMod.status, 'coming_soon', 'Routing status must be coming_soon');
    assert.strictEqual(isModuleAvailable(MODULE_KEYS.ROUTING), false, 'Routing isModuleAvailable must return false');

    const matMod = MODULE_REGISTRY.find((m) => m.key === MODULE_KEYS.MATERIAL_MASTER);
    assert(matMod && matMod.status === 'coming_soon');
    const poMod = MODULE_REGISTRY.find((m) => m.key === MODULE_KEYS.PURCHASE_ORDERS);
    assert(poMod && poMod.status === 'coming_soon');
    const prodMod = MODULE_REGISTRY.find((m) => m.key === MODULE_KEYS.PRODUCTION_ORDERS);
    assert(prodMod && prodMod.status === 'coming_soon');
    console.log('   ✓ Single source of truth registry verified: bom=available, 4 coming_soon');

    // -------------------------------------------------------------------------
    // TEST 2: Migration keeps BOM enabled on all existing servers
    // -------------------------------------------------------------------------
    console.log('Test 2: Migration keeps BOM enabled on existing servers:');
    const existingServers = await supabaseService.listServers();
    assert(existingServers.length > 0, 'Servers must exist');
    for (const s of existingServers) {
      const mods = await supabaseService.getServerModules(s.id);
      assert(mods.includes(MODULE_KEYS.BOM), `Server ${s.name} must have BOM enabled by default`);
    }
    console.log(`   ✓ All ${existingServers.length} existing servers have 'bom' module enabled`);

    // -------------------------------------------------------------------------
    // TEST 3: Admin login & setup test user with permission to two servers
    // -------------------------------------------------------------------------
    console.log('Test 3: Setup admin, test servers, and permissions:');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200);
    adminToken = adminLogin.data.token;

    // Create server A with BOM enabled
    const srvA = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server A (BOM Enabled)',
      ashost: '192.168.10.10',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      modules: [MODULE_KEYS.BOM],
      sap_username: 'SAP_TEST_USER',
      sap_password: 'TestPassword123'
    }, adminToken);
    assert.strictEqual(srvA.status, 201);
    serverAId = srvA.data.server.id;
    assert(srvA.data.server.modules.includes(MODULE_KEYS.BOM));

    // Create server B with zero modules enabled (allowed per Addition 4)
    const srvB = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server B (Zero Modules)',
      ashost: '192.168.10.20',
      sysnr: '00',
      client: '200',
      environment: 'QA',
      modules: [],
      sap_username: 'SAP_TEST_USER',
      sap_password: 'TestPassword123'
    }, adminToken);
    assert.strictEqual(srvB.status, 201);
    serverBId = srvB.data.server.id;
    assert.deepStrictEqual(srvB.data.server.modules, []);

    // Create a regular user
    const userEmail = `mod_tester_${Date.now()}@nextitpoint.com`;
    const userRes = await makeRequest('POST', '/api/admin/users', {
      email: userEmail,
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(userRes.status, 201);
    userId = userRes.data.user.id;

    // Grant user access to both Server A and Server B
    await makeRequest('POST', '/api/admin/permissions', { user_id: userId, server_id: serverAId }, adminToken);
    await makeRequest('POST', '/api/admin/permissions', { user_id: userId, server_id: serverBId }, adminToken);

    // Login as the regular user
    const userLogin = await makeRequest('POST', '/api/auth/login', {
      email: userEmail,
      password: 'Password@123'
    });
    assert.strictEqual(userLogin.status, 200);
    const userToken = userLogin.data.token;
    console.log('   ✓ Test servers & user permissions established');

    // -------------------------------------------------------------------------
    // TEST 4: GET /api/servers/:id/modules returns enabled modules
    // -------------------------------------------------------------------------
    console.log('Test 4: GET /api/servers/:id/modules reflects per-server modules:');
    const modulesA = await makeRequest('GET', `/api/servers/${serverAId}/modules`, null, userToken);
    assert.strictEqual(modulesA.status, 200);
    assert.deepStrictEqual(modulesA.data.modules, [MODULE_KEYS.BOM]);

    const modulesB = await makeRequest('GET', `/api/servers/${serverBId}/modules`, null, userToken);
    assert.strictEqual(modulesB.status, 200);
    assert.deepStrictEqual(modulesB.data.modules, []);
    console.log('   ✓ Server A returns [bom], Server B returns [] (empty launchpad)');

    // -------------------------------------------------------------------------
    // TEST 5: User accessing BOM route on permitted server with BOM enabled -> 200
    // -------------------------------------------------------------------------
    console.log('Test 5: User accesses BOM routes on Server A (BOM enabled):');
    const pingA = await makeRequest('GET', '/api/bom/ping', null, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverAId
    });
    assert.strictEqual(pingA.status, 200, 'GET /api/bom/ping must succeed on server with BOM enabled');

    const copyA = await makeRequest('POST', '/api/bom/copy', {
      sourceMaterial: 'MAT-100',
      sourcePlant: '1000',
      targetMaterial: 'MAT-200',
      targetPlant: '1000'
    }, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverAId
    });
    assert.strictEqual(copyA.status, 200, 'POST /api/bom/copy must succeed on server with BOM enabled');
    console.log('   ✓ Full read + write access granted on Server A where BOM is enabled');

    // -------------------------------------------------------------------------
    // TEST 6: User accessing BOM route on Server B (BOM disabled) -> 403 Forbidden
    // -------------------------------------------------------------------------
    console.log('Test 6: User accesses BOM routes on Server B (BOM disabled) -> 403:');
    const pingB = await makeRequest('GET', '/api/bom/ping', null, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(pingB.status, 403, 'Must return 403 when module is not enabled for server');
    assert.strictEqual(pingB.data.error, 'Module not enabled for this server');

    const copyB = await makeRequest('POST', '/api/bom/copy', {
      sourceMaterial: 'MAT-100',
      sourcePlant: '1000',
      targetMaterial: 'MAT-200',
      targetPlant: '1000'
    }, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(copyB.status, 403, 'Must return 403 on copy when module is not enabled');
    assert.strictEqual(copyB.data.error, 'Module not enabled for this server');

    const validateB = await makeRequest('POST', '/api/bom/validate-source', {
      material: 'MAT-100',
      plant: '1000'
    }, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(validateB.status, 403, 'Must return 403 on validate-source when module disabled');
    assert.strictEqual(validateB.data.error, 'Module not enabled for this server');

    const deleteB = await makeRequest('POST', '/api/bom/delete', {
      material: 'MAT-100',
      plant: '1000'
    }, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(deleteB.status, 403, 'Must return 403 on delete when module disabled');
    assert.strictEqual(deleteB.data.error, 'Module not enabled for this server');
    console.log('   ✓ All BOM routes (ping, copy, validate, delete) strictly rejected with 403 on Server B');

    // -------------------------------------------------------------------------
    // TEST 7: Chat / AI tool touching BOM on disabled server is rejected
    // -------------------------------------------------------------------------
    console.log('Test 7: Chat/AI tool touching BOM on Server B (disabled) is blocked:');
    const chatBomDisabled = await makeRequest('POST', '/api/chat', {
      actionType: 'copy_bom',
      copyBomParams: {
        sourceMaterial: 'MAT-100',
        sourcePlant: '1000',
        targetMaterial: 'MAT-200',
        targetPlant: '1000'
      }
    }, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(chatBomDisabled.status, 403);
    assert.strictEqual(chatBomDisabled.data.error, 'Module not enabled for this server');
    console.log('   ✓ Chat BOM action rejected with 403 "Module not enabled for this server"');

    // -------------------------------------------------------------------------
    // TEST 8: Coming soon modules cannot be enabled via API (Strict Rejection)
    // -------------------------------------------------------------------------
    console.log('Test 8: Admin cannot enable coming_soon modules:');
    const attemptSoonCreate = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server with Coming Soon',
      ashost: '192.168.10.30',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      modules: [MODULE_KEYS.BOM, MODULE_KEYS.ROUTING]
    }, adminToken);
    assert.strictEqual(attemptSoonCreate.status, 400, 'Attempting to enable coming_soon module must be rejected with 400');
    assert(attemptSoonCreate.data.error.includes('Cannot enable coming soon'));

    const attemptSoonUpdate = await makeRequest('PUT', `/api/admin/servers/${serverAId}`, {
      modules: [MODULE_KEYS.BOM, MODULE_KEYS.MATERIAL_MASTER]
    }, adminToken);
    assert.strictEqual(attemptSoonUpdate.status, 400, 'Attempting to update server with coming_soon module must return 400');
    console.log('   ✓ Admin API strictly blocks enabling coming_soon modules');

    // -------------------------------------------------------------------------
    // TEST 9: Admin edits Server B to enable BOM -> Access immediately unblocked
    // -------------------------------------------------------------------------
    console.log('Test 9: Admin toggles BOM on for Server B -> access is restored:');
    const updateRes = await makeRequest('PUT', `/api/admin/servers/${serverBId}`, {
      modules: [MODULE_KEYS.BOM]
    }, adminToken);
    assert.strictEqual(updateRes.status, 200);
    assert.deepStrictEqual(updateRes.data.server.modules, [MODULE_KEYS.BOM]);

    const pingBAfterEnable = await makeRequest('GET', '/api/bom/ping', null, {
      Authorization: `Bearer ${userToken}`,
      'x-server-id': serverBId
    });
    assert.strictEqual(pingBAfterEnable.status, 200, 'BOM access must now succeed on Server B');
    console.log('   ✓ Dynamic toggle verified: Server B now allows BOM operations');

    // -------------------------------------------------------------------------
    // TEST 10: Unpermitted server returns 403 on /api/servers/:id/modules
    // -------------------------------------------------------------------------
    console.log('Test 10: Unpermitted server returns 403 on GET /api/servers/:id/modules:');
    // Create server C with no permission for tester
    const srvC = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server C (Restricted)',
      ashost: '192.168.10.40',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      modules: [MODULE_KEYS.BOM]
    }, adminToken);
    serverCId = srvC.data.server.id;

    const unpermMod = await makeRequest('GET', `/api/servers/${serverCId}/modules`, null, userToken);
    assert.strictEqual(unpermMod.status, 403, 'Must return 403 for server user has no permission for');
    console.log('   ✓ Unpermitted server module query blocked with 403');

    console.log('\n============================================================');
    console.log('       ALL 10 MODULE ACCESS & REGISTRY TESTS PASSED!        ');
    console.log('============================================================\n');
  } finally {
    try {
      if (adminToken) {
        if (serverAId) await makeRequest('DELETE', `/api/admin/servers/${serverAId}`, null, adminToken);
        if (serverBId) await makeRequest('DELETE', `/api/admin/servers/${serverBId}`, null, adminToken);
        if (serverCId) await makeRequest('DELETE', `/api/admin/servers/${serverCId}`, null, adminToken);
        if (userId) await makeRequest('DELETE', `/api/admin/users/${userId}`, null, adminToken);
      }
    } catch (_) {}
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

// Execute test suite if run directly
if (process.argv[1]?.endsWith('moduleAccess.test.js')) {
  runModuleAccessTests().catch((err) => {
    console.error('Test suite failure:', err);
    process.exit(1);
  });
}

export default runModuleAccessTests;
