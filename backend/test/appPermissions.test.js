process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase } from '../services/supabaseClient.js';
import {
  BOM_APP_KEYS,
  BOM_APP_LIST,
  ALL_BOM_APPS,
  normalizePermissions,
  formatPermissionsSummary,
  hasCardPermission
} from '../config/modules.js';

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

/**
 * Migration Logic Simulation (Unit Testing the Data Migration Rule)
 * For each existing user-server row:
 * If the server has 'bom' module enabled in server_modules -> grant ALL_BOM_APPS
 * Else -> grant []
 */
export function simulateMigrationGrant(serverModulesForServer, existingPermissions = null) {
  if (existingPermissions && existingPermissions.length > 0) {
    return existingPermissions;
  }
  const hasBomModule = (serverModulesForServer || []).includes('bom');
  return hasBomModule ? [...ALL_BOM_APPS] : [];
}

async function runTests() {
  console.log('\n============================================================');
  console.log('      RUNNING PER-USER PER-SERVER APP PERMISSIONS TESTS     ');
  console.log('============================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  const adminToken = 'admin-test-token';

  try {
    // Reset in-memory store for a clean state
    inMemorySupabase.reset();

    // ------------------------------------------------------------------------
    // SETUP: Create 2 Test Servers (Server A & Server B)
    // ------------------------------------------------------------------------
    const srvARes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server A Alpha',
      ashost: '192.168.1.10',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      sap_username: 'SAP_USER_A',
      sap_password: 'Password123'
    }, adminToken);
    assert.strictEqual(srvARes.status, 201);
    const serverAId = srvARes.data.server.id;

    const srvBRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server B Beta',
      ashost: '192.168.1.20',
      sysnr: '01',
      client: '200',
      environment: 'QA',
      sap_username: 'SAP_USER_B',
      sap_password: 'Password123'
    }, adminToken);
    assert.strictEqual(srvBRes.status, 201);
    const serverBId = srvBRes.data.server.id;

    // ------------------------------------------------------------------------
    // SETUP: Create Test Users
    // ------------------------------------------------------------------------
    // User 1: Display-only
    const u1Res = await makeRequest('POST', '/api/admin/users', {
      email: 'display_only@nextitpoint.com',
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(u1Res.status, 201);
    const displayOnlyId = u1Res.data.user.id;

    // User 2: Creator
    const u2Res = await makeRequest('POST', '/api/admin/users', {
      email: 'creator_user@nextitpoint.com',
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(u2Res.status, 201);
    const creatorId = u2Res.data.user.id;

    // User 3: No Grants (0 apps on assigned server)
    const u3Res = await makeRequest('POST', '/api/admin/users', {
      email: 'no_grants_user@nextitpoint.com',
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(u3Res.status, 201);
    const noGrantsId = u3Res.data.user.id;

    // User 4: Multi-server (Creator on Server A, Display-only on Server B)
    const u4Res = await makeRequest('POST', '/api/admin/users', {
      email: 'multi_server_user@nextitpoint.com',
      password: 'Password@123',
      role: 'user'
    }, adminToken);
    assert.strictEqual(u4Res.status, 201);
    const multiServerId = u4Res.data.user.id;

    // ------------------------------------------------------------------------
    // SETUP: Grant Per-User Per-Server Permissions via Admin Endpoint
    // ------------------------------------------------------------------------
    // User 1 on Server A: Display only
    await makeRequest('POST', '/api/admin/permissions', {
      user_id: displayOnlyId,
      server_id: serverAId,
      permissions: ['bom.display']
    }, adminToken);

    // User 2 on Server A: Create (implied display)
    await makeRequest('POST', '/api/admin/permissions', {
      user_id: creatorId,
      server_id: serverAId,
      permissions: ['bom.create']
    }, adminToken);

    // User 3 on Server A: Assigned server but 0 app grants
    await makeRequest('POST', '/api/admin/permissions', {
      user_id: noGrantsId,
      server_id: serverAId,
      permissions: []
    }, adminToken);

    // User 4: Server A = Creator, Server B = Display-only
    await makeRequest('POST', '/api/admin/permissions', {
      user_id: multiServerId,
      server_id: serverAId,
      permissions: ['bom.create']
    }, adminToken);
    await makeRequest('POST', '/api/admin/permissions', {
      user_id: multiServerId,
      server_id: serverBId,
      permissions: ['bom.display']
    }, adminToken);

    // Obtain login session tokens for each user
    const l1 = await makeRequest('POST', '/api/auth/login', { email: 'display_only@nextitpoint.com', password: 'Password@123' });
    const tokenDisplay = l1.data.token || l1.data.session?.access_token;

    const l2 = await makeRequest('POST', '/api/auth/login', { email: 'creator_user@nextitpoint.com', password: 'Password@123' });
    const tokenCreator = l2.data.token || l2.data.session?.access_token;

    const l3 = await makeRequest('POST', '/api/auth/login', { email: 'no_grants_user@nextitpoint.com', password: 'Password@123' });
    const tokenNoGrants = l3.data.token || l3.data.session?.access_token;

    const l4 = await makeRequest('POST', '/api/auth/login', { email: 'multi_server_user@nextitpoint.com', password: 'Password@123' });
    const tokenMulti = l4.data.token || l4.data.session?.access_token;

    console.log('✓ Test environment, users, and per-server permissions initialized');

    // ========================================================================
    // TEST 1: User with only Display
    // Create, Copy, Delete, Jobs, Validate return 403; Display works; F4 works
    // ========================================================================
    console.log('\nTest 1: User with only Display permission:');
    const headerDisplayA = { Authorization: `Bearer ${tokenDisplay}`, 'x-server-id': serverAId };

    // 1. Create endpoints return 403 with friendly message
    const resCreate = await makeRequest('POST', '/api/bom/create', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resCreate.status, 403);
    assert.strictEqual(resCreate.data.error, "You don't have permission to create BOMs on this server.");
    console.log('   ✓ POST /api/bom/create -> 403 with friendly action message');

    const resCreateSingle = await makeRequest('POST', '/api/bom/create-single', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resCreateSingle.status, 403);
    assert.strictEqual(resCreateSingle.data.error, "You don't have permission to create BOMs on this server.");
    console.log('   ✓ POST /api/bom/create-single -> 403');

    const resCreateBulk = await makeRequest('POST', '/api/bom/create-bulk', { boms: [] }, headerDisplayA);
    assert.strictEqual(resCreateBulk.status, 403);
    console.log('   ✓ POST /api/bom/create-bulk -> 403');

    const resCreatePreflight = await makeRequest('POST', '/api/bom/create-preflight', { boms: [] }, headerDisplayA);
    assert.strictEqual(resCreatePreflight.status, 403);
    console.log('   ✓ POST /api/bom/create-preflight -> 403');

    const resCreateTemplate = await makeRequest('GET', '/api/bom/create-template', null, headerDisplayA);
    assert.strictEqual(resCreateTemplate.status, 403);
    console.log('   ✓ GET /api/bom/create-template -> 403');

    // 2. Copy endpoints return 403 with friendly message
    const resCopy = await makeRequest('POST', '/api/bom/copy', { material: 'MAT-1', fromPlant: '1000', toPlant: '1001' }, headerDisplayA);
    assert.strictEqual(resCopy.status, 403);
    assert.strictEqual(resCopy.data.error, "You don't have permission to copy BOMs on this server.");
    console.log('   ✓ POST /api/bom/copy -> 403 with friendly action message');

    const resBatchCopy = await makeRequest('POST', '/api/bom/batch-copy', { boms: [] }, headerDisplayA);
    assert.strictEqual(resBatchCopy.status, 403);
    console.log('   ✓ POST /api/bom/batch-copy -> 403');

    const resBatchValidate = await makeRequest('POST', '/api/bom/batch-validate', { boms: [] }, headerDisplayA);
    assert.strictEqual(resBatchValidate.status, 403);
    console.log('   ✓ POST /api/bom/batch-validate -> 403');

    const resCopyTemplate = await makeRequest('GET', '/api/bom/template', null, headerDisplayA);
    assert.strictEqual(resCopyTemplate.status, 403);
    console.log('   ✓ GET /api/bom/template -> 403');

    // 3. Delete endpoint returns 403 with friendly message
    const resDelete = await makeRequest('POST', '/api/bom/delete', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resDelete.status, 403);
    assert.strictEqual(resDelete.data.error, "You don't have permission to delete BOMs on this server.");
    console.log('   ✓ POST /api/bom/delete -> 403 with friendly action message');

    // 4. Background jobs return 403
    const resJobStart = await makeRequest('POST', '/api/bom/jobs/start', { type: 'create_bulk' }, headerDisplayA);
    assert.strictEqual(resJobStart.status, 403);
    assert.strictEqual(resJobStart.data.error, "You don't have permission to create BOMs on this server.");
    console.log('   ✓ POST /api/bom/jobs/start (create_bulk) -> 403');

    const resJobStartCopy = await makeRequest('POST', '/api/bom/jobs/start', { type: 'copy_bulk' }, headerDisplayA);
    assert.strictEqual(resJobStartCopy.status, 403);
    assert.strictEqual(resJobStartCopy.data.error, "You don't have permission to copy BOMs on this server.");
    console.log('   ✓ POST /api/bom/jobs/start (copy_bulk) -> 403');

    const resJobActive = await makeRequest('GET', '/api/bom/jobs/active', null, headerDisplayA);
    assert.strictEqual(resJobActive.status, 403);
    console.log('   ✓ GET /api/bom/jobs/active -> 403');

    // 5. Validate screen endpoint returns 403 for Display-only user
    const resValidate = await makeRequest('POST', '/api/bom/validate-source', { material: 'MAT-1', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resValidate.status, 403);
    console.log('   ✓ POST /api/bom/validate-source -> 403');

    // 6. Display/read endpoints succeed (200)
    const resRead = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resRead.status, 200);
    console.log('   ✓ POST /api/bom/read -> 200 (Display works)');

    const resHierarchy = await makeRequest('POST', '/api/bom/hierarchy', { material: 'MAT-BOM-100', plant: '1000' }, headerDisplayA);
    assert.strictEqual(resHierarchy.status, 200);
    console.log('   ✓ POST /api/bom/hierarchy -> 200 (Hierarchy works)');

    // 7. Shared helper endpoints succeed (F4 materials, plants, session status)
    const resF4 = await makeRequest('GET', '/api/materials/search?q=MAT', null, headerDisplayA);
    assert.strictEqual(resF4.status, 200);
    console.log('   ✓ GET /api/materials/search -> 200 (F4 material search works)');

    const resPlants = await makeRequest('GET', '/api/plants', null, headerDisplayA);
    assert.strictEqual(resPlants.status, 200);
    console.log('   ✓ GET /api/plants -> 200 (Plants lookup works)');

    const resSession = await makeRequest('GET', '/api/sap/session-status', null, headerDisplayA);
    assert.strictEqual(resSession.status, 200);
    console.log('   ✓ GET /api/sap/session-status -> 200 (Session status works)');

    // ========================================================================
    // TEST 2: User with Create permission
    // Can create and display; cannot copy or delete
    // ========================================================================
    console.log('\nTest 2: User with Create permission (implies Display):');
    const headerCreatorA = { Authorization: `Bearer ${tokenCreator}`, 'x-server-id': serverAId };

    // Create works
    const resCreateOk = await makeRequest('POST', '/api/bom/create', {
      material: 'NEW_MAT',
      plant: '1000',
      components: []
    }, headerCreatorA);
    assert.strictEqual(resCreateOk.status, 200);
    console.log('   ✓ POST /api/bom/create -> 200 (Create works)');

    // Implied display works
    const resReadOk = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerCreatorA);
    assert.strictEqual(resReadOk.status, 200);
    console.log('   ✓ POST /api/bom/read -> 200 (Implied Display works)');

    // Copy returns 403
    const resCopyBlocked = await makeRequest('POST', '/api/bom/copy', { material: 'NEW_MAT', fromPlant: '1000', toPlant: '1001' }, headerCreatorA);
    assert.strictEqual(resCopyBlocked.status, 403);
    assert.strictEqual(resCopyBlocked.data.error, "You don't have permission to copy BOMs on this server.");
    console.log('   ✓ POST /api/bom/copy -> 403 with friendly message');

    // Delete returns 403
    const resDeleteBlocked = await makeRequest('POST', '/api/bom/delete', { material: 'NEW_MAT', plant: '1000' }, headerCreatorA);
    assert.strictEqual(resDeleteBlocked.status, 403);
    assert.strictEqual(resDeleteBlocked.data.error, "You don't have permission to delete BOMs on this server.");
    console.log('   ✓ POST /api/bom/delete -> 403 with friendly message');

    // ========================================================================
    // TEST 3: User with No Grants (0 apps on assigned server)
    // Every BOM route returns 403; UI shows no-access
    // ========================================================================
    console.log('\nTest 3: User with server assigned but 0 apps granted:');
    const headerNoGrantsA = { Authorization: `Bearer ${tokenNoGrants}`, 'x-server-id': serverAId };

    const routesToTest = [
      { method: 'POST', path: '/api/bom/read', body: { material: 'MAT-1', plant: '1000' } },
      { method: 'POST', path: '/api/bom/hierarchy', body: { material: 'MAT-1', plant: '1000' } },
      { method: 'POST', path: '/api/bom/create-single', body: { material: 'MAT-1', plant: '1000' } },
      { method: 'POST', path: '/api/bom/copy', body: { material: 'MAT-1', fromPlant: '1000', toPlant: '1001' } },
      { method: 'POST', path: '/api/bom/delete', body: { material: 'MAT-1', plant: '1000' } },
      { method: 'POST', path: '/api/bom/validate-source', body: { material: 'MAT-1', plant: '1000' } },
      { method: 'GET', path: '/api/materials/search?q=MAT', body: null },
      { method: 'GET', path: '/api/plants', body: null },
      { method: 'GET', path: '/api/sap/session-status', body: null }
    ];

    for (const r of routesToTest) {
      const res = await makeRequest(r.method, r.path, r.body, headerNoGrantsA);
      assert.strictEqual(res.status, 403, `${r.method} ${r.path} must return 403 for user with 0 apps`);
    }
    console.log('   ✓ All 9 BOM and helper endpoints strictly return 403 for user with 0 app grants');

    // Verify GET /api/servers/available returns permissions: []
    const resAvail = await makeRequest('GET', '/api/servers/available', null, headerNoGrantsA);
    assert.strictEqual(resAvail.status, 200);
    const assignedServer = resAvail.data.servers.find((s) => s.id === serverAId);
    assert(assignedServer, 'Server A must be present in available servers list');
    assert.deepStrictEqual(assignedServer.permissions, [], 'Server A permissions must be empty array');
    console.log('   ✓ GET /api/servers/available returns permissions: []');

    // UI card evaluation: hasCardPermission returns false for all cards
    BOM_APP_LIST.forEach((app) => {
      const allowed = hasCardPermission({ id: app.shortName.toLowerCase(), action: app.key }, assignedServer.permissions, 'user');
      assert.strictEqual(allowed, false, `Card ${app.key} must be hidden when user has 0 grants`);
    });
    console.log('   ✓ hasCardPermission strictly hides all launchpad cards');

    // ========================================================================
    // TEST 4: Per-Server Difference
    // Same user is Creator on Server A and Display-only on Server B
    // ========================================================================
    console.log('\nTest 4: Per-server difference (Creator on Server A, Display-only on Server B):');
    const headerMultiA = { Authorization: `Bearer ${tokenMulti}`, 'x-server-id': serverAId };
    const headerMultiB = { Authorization: `Bearer ${tokenMulti}`, 'x-server-id': serverBId };

    // On Server A: Create succeeds, Copy fails
    const resMultiACreate = await makeRequest('POST', '/api/bom/create', {
      material: 'MULTI_MAT',
      plant: '1000',
      components: []
    }, headerMultiA);
    assert.strictEqual(resMultiACreate.status, 200);
    console.log('   ✓ Server A: Create permitted (200)');

    const resMultiACopy = await makeRequest('POST', '/api/bom/copy', { material: 'MULTI_MAT', fromPlant: '1000', toPlant: '1001' }, headerMultiA);
    assert.strictEqual(resMultiACopy.status, 403);
    console.log('   ✓ Server A: Copy rejected (403)');

    // On Server B: Create returns 403, Display succeeds
    const resMultiBCreate = await makeRequest('POST', '/api/bom/create', {
      material: 'MULTI_MAT',
      plant: '2000',
      components: []
    }, headerMultiB);
    assert.strictEqual(resMultiBCreate.status, 403);
    assert.strictEqual(resMultiBCreate.data.error, "You don't have permission to create BOMs on this server.");
    console.log('   ✓ Server B: Create rejected (403)');

    const resMultiBRead = await makeRequest('POST', '/api/bom/read', { material: 'MAT-BOM-100', plant: '1000' }, headerMultiB);
    assert.strictEqual(resMultiBRead.status, 200);
    console.log('   ✓ Server B: Display permitted (200)');

    // ========================================================================
    // TEST 5: Admin Bypass
    // Admin has full access to all apps on all servers
    // ========================================================================
    console.log('\nTest 5: Administrator full bypass:');
    const headerAdminA = { Authorization: `Bearer ${adminToken}`, 'x-server-id': serverAId };

    const resAdminCreate = await makeRequest('POST', '/api/bom/create', {
      material: 'ADMIN_MAT',
      plant: '1000',
      components: []
    }, headerAdminA);
    assert.strictEqual(resAdminCreate.status, 200);

    const resAdminCopy = await makeRequest('POST', '/api/bom/copy', {
      sourceMaterial: 'MAT-100',
      sourcePlant: '1000',
      targetMaterial: 'MAT-200',
      targetPlant: '2000'
    }, headerAdminA);
    assert.strictEqual(resAdminCopy.status, 200);

    const resAdminDelete = await makeRequest('POST', '/api/bom/delete', {
      material: 'MAT-100',
      plant: '1000'
    }, headerAdminA);
    assert.strictEqual(resAdminDelete.status, 200);

    const resAdminRead = await makeRequest('POST', '/api/bom/read', {
      material: 'MAT-BOM-100',
      plant: '1000'
    }, headerAdminA);
    assert.strictEqual(resAdminRead.status, 200);

    console.log('   ✓ Admin can execute Create, Copy, Delete, and Display across all servers');

    // ========================================================================
    // TEST 6: Implied Display Rule & Helpers
    // ========================================================================
    console.log('\nTest 6: Implied Display rule and summary formatting:');

    // normalizePermissions
    const normCreate = normalizePermissions(['bom.create']);
    assert(normCreate.includes('bom.display'), 'bom.create must imply bom.display');
    assert(normCreate.includes('bom.create'));

    const normCopy = normalizePermissions(['bom.copy']);
    assert(normCopy.includes('bom.display'), 'bom.copy must imply bom.display');

    const normDelete = normalizePermissions(['bom.delete']);
    assert(normDelete.includes('bom.display'), 'bom.delete must imply bom.display');

    const normValidate = normalizePermissions(['bom.validate']);
    assert(!normValidate.includes('bom.display'), 'bom.validate alone must NOT imply bom.display');

    // formatPermissionsSummary
    assert.strictEqual(formatPermissionsSummary([]), 'None');
    assert.strictEqual(formatPermissionsSummary(ALL_BOM_APPS), 'All (5)');
    assert.strictEqual(formatPermissionsSummary(['bom.display']), 'Display');
    assert.strictEqual(formatPermissionsSummary(['bom.create']), 'Display, Create');
    assert.strictEqual(formatPermissionsSummary(['bom.display', 'bom.validate', 'bom.create', 'bom.copy']), 'Display, Validate +2');
    console.log('   ✓ normalizePermissions correctly enforces implied Display rule');
    console.log('   ✓ formatPermissionsSummary produces clean user-facing summaries');

    // ========================================================================
    // TEST 7: Migration Mapping Logic Unit Test
    // ========================================================================
    console.log('\nTest 7: Migration mapping logic unit test:');

    // Case A: Server with 'bom' enabled -> grants all 5 apps
    const migratedWithBom = simulateMigrationGrant(['bom']);
    assert.deepStrictEqual(migratedWithBom, [...ALL_BOM_APPS]);
    console.log('   ✓ Server with "bom" enabled receives all 5 apps (ALL_BOM_APPS)');

    // Case B: Server without 'bom' enabled -> grants []
    const migratedWithoutBom = simulateMigrationGrant(['material_master']);
    assert.deepStrictEqual(migratedWithoutBom, []);
    console.log('   ✓ Server without "bom" enabled receives empty array');

    // Case C: Server with null/empty modules -> grants []
    const migratedEmpty = simulateMigrationGrant([]);
    assert.deepStrictEqual(migratedEmpty, []);
    console.log('   ✓ Server with empty modules receives empty array');

    // Case D: Existing grants preserved
    const existing = ['bom.display', 'bom.create'];
    const preserved = simulateMigrationGrant(['bom'], existing);
    assert.deepStrictEqual(preserved, existing);
    console.log('   ✓ Existing custom grants preserved intact');

    console.log('\n============================================================');
    console.log('  ALL PER-USER PER-SERVER APP PERMISSIONS TESTS PASSED!     ');
    console.log('============================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('\nTest Suite Failure:', err);
  process.exit(1);
});
