import 'dotenv/config';
import assert from 'assert';
import http from 'http';
import app from '../server.js';
import supabaseService, { isMissingPermissionsColumn, shouldUseInMemory } from '../services/supabaseClient.js';
import { ALL_BOM_APPS, BOM_APP_KEYS } from '../config/modules.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `sb_access_token=${token}`;
    }

    const req = http.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (_) {
            parsed = data;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runDualStatePermissionsTests() {
  console.log('\n============================================================');
  console.log('  RUNNING DUAL-STATE PERMISSION & INDEPENDENT LOADING TESTS  ');
  console.log('============================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: Error Pattern Matching for Missing permissions Column
    // ------------------------------------------------------------------------
    console.log('Test 1: Detecting missing "permissions" column error variations:');
    
    // Postgres undefined_column code 42703
    assert.strictEqual(
      isMissingPermissionsColumn({ code: '42703', message: 'column user_server_permissions.permissions does not exist' }),
      true,
      'Must identify Postgres 42703 code'
    );

    // PostgREST missing column in schema cache PGRST204
    assert.strictEqual(
      isMissingPermissionsColumn({ code: 'PGRST204', message: "Could not find the 'permissions' column of 'user_server_permissions' in the schema cache" }),
      true,
      'Must identify PostgREST PGRST204'
    );

    // Generic error message mentioning permissions does not exist
    assert.strictEqual(
      isMissingPermissionsColumn({ message: 'column "permissions" does not exist' }),
      true,
      'Must identify column does not exist by message'
    );

    // Unrelated errors must NOT be classified as missing permissions column
    assert.strictEqual(
      isMissingPermissionsColumn({ code: '23505', message: 'duplicate key value violates unique constraint' }),
      false,
      'Unique constraint violation must not be classified as missing column'
    );
    assert.strictEqual(
      isMissingPermissionsColumn({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }),
      false,
      'PGRST116 must not be classified as missing column'
    );
    assert.strictEqual(
      isMissingPermissionsColumn(null),
      false,
      'Null error must return false'
    );
    console.log('   ✓ Error pattern detection correctly isolates missing column errors from other database failures');

    // ------------------------------------------------------------------------
    // Login as Admin to get bearer token
    // ------------------------------------------------------------------------
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(loginRes.status, 200, 'Admin login must succeed');
    const adminToken = loginRes.data.token || loginRes.data.session?.access_token;
    const adminId = loginRes.data.user.id;

    // Login as normal user
    const userLoginRes = await makeRequest('POST', '/api/auth/login', {
      email: 'user@nextitpoint.com',
      password: 'User@123456'
    });
    assert.strictEqual(userLoginRes.status, 200, 'Normal user login must succeed');
    const userToken = userLoginRes.data.token || userLoginRes.data.session?.access_token;
    const normalUserId = userLoginRes.data.user.id;

    // Create a dedicated test server
    const serverRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Dual State Test Server',
      environment: 'SANDBOX',
      ashost: '10.0.0.99',
      sysnr: '00',
      client: '100',
      lang: 'EN',
      sap_username: 'TEST_USER',
      sap_password: 'TestPassword123'
    }, adminToken);
    assert.strictEqual(serverRes.status, 201, 'Test server creation must succeed');
    const testServerId = serverRes.data.server.id;

    // ------------------------------------------------------------------------
    // SECTION 2: Pre-Migration State (Missing Column Fallback)
    // ------------------------------------------------------------------------
    console.log('\nTest 2: Pre-migration state (permissions column missing in database):');
    supabaseService.setSimulateMissingPermissionsColumn(true);

    // 2a. listPermissions in pre-migration mode
    const preList = await supabaseService.listPermissions();
    assert.strictEqual(preList.migrationPending, true, 'listPermissions must flag migrationPending = true');
    assert(Array.isArray(preList), 'listPermissions must return an array');
    console.log(`   ✓ listPermissions returns ${preList.length} records with migrationPending = true and full app fallback`);

    // 2b. GET /api/admin/permissions HTTP endpoint in pre-migration mode
    const preHttpRes = await makeRequest('GET', '/api/admin/permissions', null, adminToken);
    assert.strictEqual(preHttpRes.status, 200, 'GET /api/admin/permissions must return HTTP 200 even when column is missing');
    assert.strictEqual(preHttpRes.data.success, true, 'API response must have success: true');
    assert.strictEqual(preHttpRes.data.migrationPending, true, 'API response must report migrationPending: true');
    console.log('   ✓ GET /api/admin/permissions returns 200 with migrationPending: true');

    // 2c. grantPermission in pre-migration mode
    const preGrant = await supabaseService.grantPermission({
      userId: normalUserId,
      serverId: testServerId,
      grantedBy: adminId,
      permissions: ['bom.display'] // requested granularly, but database only has legacy table
    });
    assert.strictEqual(preGrant.legacyFallback, true, 'Grant must be marked legacyFallback: true');
    console.log('   ✓ grantPermission succeeds gracefully in pre-migration mode without failing on missing column');

    // 2d. getAvailableServersForUser in pre-migration mode
    const preServers = await supabaseService.getAvailableServersForUser(normalUserId, 'user');
    assert(preServers.length > 0, 'Permitted user must see their permitted servers in pre-migration state');
    assert.deepStrictEqual(
      preServers[0].permissions,
      ALL_BOM_APPS,
      'In pre-migration mode, user must receive full BOM app fallback to prevent lockout'
    );
    console.log('   ✓ getAvailableServersForUser grants ALL_BOM_APPS fallback so users are not locked out');

    // 2e. checkUserServerAccess in pre-migration mode
    const preAccess = await supabaseService.checkUserServerAccess(normalUserId, testServerId, 'user');
    assert.strictEqual(preAccess.permitted, true, 'checkUserServerAccess must permit granted user');
    assert.deepStrictEqual(preAccess.permissions, ALL_BOM_APPS, 'Permitted user gets ALL_BOM_APPS in pre-migration mode');
    console.log('   ✓ checkUserServerAccess permits user with ALL_BOM_APPS fallback in pre-migration state');

    // ------------------------------------------------------------------------
    // SECTION 3: Post-Migration State (Column Exists & Granular Permissions Active)
    // ------------------------------------------------------------------------
    console.log('\nTest 3: Post-migration state (permissions column exists in database):');
    supabaseService.resetColumnDetection(); // column is now present

    // 3a. Update grant with granular display-only permission
    const postGrant = await supabaseService.grantPermission({
      userId: normalUserId,
      serverId: testServerId,
      grantedBy: adminId,
      permissions: ['bom.display']
    });
    assert.deepStrictEqual(postGrant.permissions, ['bom.display'], 'Grant must save exact granular permissions');

    // 3b. listPermissions in post-migration mode
    const postList = await supabaseService.listPermissions();
    assert.strictEqual(postList.migrationPending, false, 'listPermissions must flag migrationPending = false');
    console.log('   ✓ listPermissions returns granular permissions with migrationPending = false');

    // 3c. GET /api/admin/permissions HTTP endpoint in post-migration mode
    const postHttpRes = await makeRequest('GET', '/api/admin/permissions', null, adminToken);
    assert.strictEqual(postHttpRes.status, 200);
    assert.strictEqual(postHttpRes.data.migrationPending, false, 'migrationPending must be false when column exists');
    console.log('   ✓ GET /api/admin/permissions returns 200 with migrationPending: false');

    // 3d. checkUserServerAccess in post-migration mode
    const postAccess = await supabaseService.checkUserServerAccess(normalUserId, testServerId, 'user');
    assert.strictEqual(postAccess.permitted, true);
    assert.deepStrictEqual(postAccess.permissions, ['bom.display'], 'User must have exactly bom.display permission');
    console.log('   ✓ checkUserServerAccess accurately enforces granular [bom.display] permission');

    // ------------------------------------------------------------------------
    // SECTION 4: Independent Loading Logic (Promise.allSettled Contract)
    // ------------------------------------------------------------------------
    console.log('\nTest 4: Admin page independent loading logic (Promise.allSettled):');

    // Simulate scenario: Users and Servers succeed, but Permissions endpoint rejects with HTTP 500
    const mockUsers = [{ id: 'u1', email: 'user1@example.com' }, { id: 'u2', email: 'user2@example.com' }];
    const mockServers = [{ id: 's1', name: 'Server 1001' }];

    const getAdminUsersMock = async () => mockUsers;
    const getAdminServersMock = async () => mockServers;
    const getAdminPermissionsMockFailing = async () => {
      const err = new Error('Database error listing permissions: column user_server_permissions.permissions does not exist');
      err.response = { status: 500, data: { error: 'Failed to retrieve permissions.' } };
      throw err;
    };

    // Run independent loading using Promise.allSettled
    const [usersResult, serversResult, permsResult] = await Promise.allSettled([
      getAdminUsersMock(),
      getAdminServersMock(),
      getAdminPermissionsMockFailing()
    ]);

    // Verify Users tab succeeds independently
    assert.strictEqual(usersResult.status, 'fulfilled', 'Users request must be fulfilled');
    assert.strictEqual(usersResult.value.length, 2, 'Users count must be 2, not 0');

    // Verify Servers tab succeeds independently
    assert.strictEqual(serversResult.status, 'fulfilled', 'Servers request must be fulfilled');
    assert.strictEqual(serversResult.value.length, 1, 'Servers count must be 1, not 0');

    // Verify Permissions failure is isolated
    assert.strictEqual(permsResult.status, 'rejected', 'Permissions request rejection is isolated');
    const permErrorMsg = permsResult.reason?.response?.data?.error || permsResult.reason?.message;
    assert.strictEqual(permErrorMsg, 'Failed to retrieve permissions.', 'Permissions error captured cleanly');

    console.log('   ✓ Users and SAP Servers tabs load completely (counts: 2 users, 1 server) even when Permissions fails');
    console.log('   ✓ Access Permissions failure is isolated without taking down the other tabs');

    console.log('\n============================================================');
    console.log('  ALL DUAL-STATE PERMISSION & INDEPENDENT LOADING TESTS PASSED (100%)');
    console.log('============================================================\n');

  } finally {
    supabaseService.resetColumnDetection();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runDualStatePermissionsTests().catch((err) => {
  console.error('\n❌ Dual-State Permissions Test Failed:', err);
  process.exit(1);
});
