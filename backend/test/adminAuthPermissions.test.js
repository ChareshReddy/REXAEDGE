import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService } from '../services/supabaseClient.js';
import { auditLogger } from '../services/auditLog.js';

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

async function runAdminTests() {
  console.log('\n============================================================');
  console.log('  RUNNING SUPABASE AUTH, ADMIN & SERVER PERMISSIONS TESTS  ');
  console.log('============================================================\n');

  // Start HTTP Server on an ephemeral port
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  process.env.USE_MOCK_SAP = 'true';
  process.env.SKIP_GATEWAY_AUTH = 'false';

  let createdUserId;
  let createdServerId;
  let adminToken;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Unauthenticated request to /api/admin/* returns 401
    // -------------------------------------------------------------------------
    console.log('Test 1: Unauthenticated access to /api/admin/users:');
    const unauthAdmin = await makeRequest('GET', '/api/admin/users');
    assert.strictEqual(unauthAdmin.status, 401, 'Unauthenticated request must return 401');
    console.log('   ✓ Blocked with 401 Unauthorized');

    // -------------------------------------------------------------------------
    // TEST 2: Non-admin user cannot access /api/admin/* routes (403)
    // -------------------------------------------------------------------------
    console.log('Test 2: Non-admin user access to /api/admin/* routes:');
    const userLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'user@nextitpoint.com',
      password: 'User@123456'
    });
    assert.strictEqual(userLogin.status, 200);
    const userToken = userLogin.data.token;
    assert(userToken, 'User token must be returned');

    const nonAdminGetUsers = await makeRequest('GET', '/api/admin/users', null, userToken);
    assert.strictEqual(nonAdminGetUsers.status, 403, 'Non-admin user must get 403 on GET /api/admin/users');
    assert(nonAdminGetUsers.data.error.includes('Administrator privileges required'));

    const nonAdminGetServers = await makeRequest('GET', '/api/admin/servers', null, userToken);
    assert.strictEqual(nonAdminGetServers.status, 403, 'Non-admin user must get 403 on GET /api/admin/servers');

    const nonAdminGetPerms = await makeRequest('GET', '/api/admin/permissions', null, userToken);
    assert.strictEqual(nonAdminGetPerms.status, 403, 'Non-admin user must get 403 on GET /api/admin/permissions');
    console.log('   ✓ Non-admin strictly blocked with 403 Forbidden across all /api/admin/* endpoints');

    // -------------------------------------------------------------------------
    // TEST 3: Admin login and access to /api/admin/* routes
    // -------------------------------------------------------------------------
    console.log('Test 3: Admin user login and access:');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200);
    adminToken = adminLogin.data.token;
    assert.strictEqual(adminLogin.data.user.role, 'admin');

    const adminGetUsers = await makeRequest('GET', '/api/admin/users', null, adminToken);
    assert.strictEqual(adminGetUsers.status, 200);
    assert(Array.isArray(adminGetUsers.data.users));
    console.log(`   ✓ Admin access granted: retrieved ${adminGetUsers.data.users.length} users`);

    // -------------------------------------------------------------------------
    // TEST 4: Admin creates new user, adds new SAP server, grants permission
    // -------------------------------------------------------------------------
    console.log('Test 4: Admin creates new user, adds SAP server, grants permission:');
    const testUserEmail = `engineer_${Date.now()}@nextitpoint.com`;
    const createUserRes = await makeRequest('POST', '/api/admin/users', {
      email: testUserEmail,
      password: 'InitialPassword@2026',
      role: 'user'
    }, adminToken);
    assert.strictEqual(createUserRes.status, 201);
    createdUserId = createUserRes.data.user.id;
    assert(createdUserId, 'New user ID must exist');

    const createServerRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Special QA S4HANA',
      ashost: '10.20.30.40',
      sysnr: '05',
      client: '300',
      lang: 'EN',
      environment: 'QA',
      sap_username: 'SAP_TEST_USER',
      sap_password: 'TestPassword123'
    }, adminToken);
    assert.strictEqual(createServerRes.status, 201);
    createdServerId = createServerRes.data.server.id;
    assert(createdServerId, 'New server ID must exist');

    // Grant access to this new server for this user (takes only userId and serverId)
    const grantRes = await makeRequest('POST', '/api/admin/permissions', {
      userId: createdUserId,
      serverId: createdServerId
    }, adminToken);
    assert.strictEqual(grantRes.status, 201);
    const permissionId = grantRes.data.permission.id;
    console.log(`   ✓ User created (${testUserEmail}), server created (${createdServerId}), permission granted`);

    // -------------------------------------------------------------------------
    // TEST 5: New user logs in, retrieves available servers (exactly the 1 permitted server)
    // -------------------------------------------------------------------------
    console.log('Test 5: New user login & dynamic server discovery:');
    const newUserLogin = await makeRequest('POST', '/api/auth/login', {
      email: testUserEmail,
      password: 'InitialPassword@2026'
    });
    assert.strictEqual(newUserLogin.status, 200);
    const newUserToken = newUserLogin.data.token;

    const availServersRes = await makeRequest('GET', '/api/servers/available', null, newUserToken);
    assert.strictEqual(availServersRes.status, 200);
    assert.strictEqual(availServersRes.data.servers.length, 1, 'User must have exactly 1 permitted server');
    assert.strictEqual(availServersRes.data.servers[0].id, createdServerId);
    assert.strictEqual(availServersRes.data.servers[0].name, 'Special QA S4HANA');
    console.log('   ✓ GET /api/servers/available returns exactly the 1 permitted server');

    // -------------------------------------------------------------------------
    // TEST 6: User CAN query & write to permitted server, but CANNOT access unauthorized server (403)
    // -------------------------------------------------------------------------
    console.log('Test 6: User accesses permitted server (read + write) vs unpermitted server (403):');
    // Read operation on permitted server (/api/bom/ping)
    const pingPermitted = await makeRequest('GET', '/api/bom/ping', null, {
      'Authorization': `Bearer ${newUserToken}`,
      'x-server-id': createdServerId
    });
    assert.strictEqual(pingPermitted.status, 200);
    console.log('   ✓ Read on permitted server successful');

    // Write operation on permitted server (/api/bom/copy) - full read+write access
    const writeAllowed = await makeRequest('POST', '/api/bom/copy', {
      sourceMaterial: 'MAT-BOM-100',
      sourcePlant: '1000',
      targetMaterial: 'MAT-BOM-100',
      targetPlant: '2000',
      copyHierarchy: false,
      serverId: createdServerId
    }, {
      'Authorization': `Bearer ${newUserToken}`,
      'x-server-id': createdServerId
    });
    assert.strictEqual(writeAllowed.status, 200, 'Permitted user can execute write operation');
    assert.strictEqual(writeAllowed.data.success, true);

    // Verify audit logs recorded real user email and server name
    const logs = auditLogger.getAuditLogs();
    const latestBomLog = logs.find((l) => l.actionType === 'copy' && l.user === testUserEmail);
    assert(latestBomLog, 'Audit log must record action with real user email');
    assert.strictEqual(latestBomLog.user, testUserEmail);
    assert.strictEqual(latestBomLog.system, 'Special QA S4HANA');
    console.log(`   ✓ Write succeeded and verified in Audit Logs with user "${latestBomLog.user}" and server "${latestBomLog.system}"`);

    // Attempt to access unpermitted server (e.g. Production server)
    const unpermittedServerId = '10000000-0000-0000-0000-000000000003';
    const pingUnpermitted = await makeRequest('GET', '/api/bom/ping', null, {
      'Authorization': `Bearer ${newUserToken}`,
      'x-server-id': unpermittedServerId
    });
    assert.strictEqual(pingUnpermitted.status, 403, 'Access to unauthorized server must return 403');
    assert(pingUnpermitted.data.error.includes('Access denied') || pingUnpermitted.data.error.includes('permission'));
    console.log('   ✓ Access to unpermitted server blocked with 403 even when server ID is known');

    // -------------------------------------------------------------------------
    // TEST 7: Admin revokes permission, access becomes forbidden (403)
    // -------------------------------------------------------------------------
    console.log('Test 7: Admin revokes permission, access returns 403:');
    const revokeRes = await makeRequest('DELETE', `/api/admin/permissions/${permissionId}`, null, adminToken);
    assert.strictEqual(revokeRes.status, 200);

    const pingAfterRevoke = await makeRequest('GET', '/api/bom/ping', null, {
      'Authorization': `Bearer ${newUserToken}`,
      'x-server-id': createdServerId
    });
    assert.strictEqual(pingAfterRevoke.status, 403, 'Query after revocation must return 403');
    console.log('   ✓ Revocation immediate: subsequent request rejected with 403');

    console.log('\n============================================================');
    console.log('  ALL ADMIN, AUTH, & SERVER PERMISSION TESTS PASSED!  ');
    console.log('============================================================\n');
  } finally {
    try {
      if (adminToken) {
        if (createdServerId) await makeRequest('DELETE', `/api/admin/servers/${createdServerId}`, null, adminToken);
        if (createdUserId) await makeRequest('DELETE', `/api/admin/users/${createdUserId}`, null, adminToken);
      }
    } catch (_) {}
    if (server) server.close();
  }
}

runAdminTests().catch((err) => {
  console.error('\n❌ Admin & Auth Permissions Test Failed:', err);
  if (server) server.close();
  process.exit(1);
});
