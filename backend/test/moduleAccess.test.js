process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
import 'dotenv/config';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}
import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { supabaseService, inMemorySupabase, supabaseCache } from '../services/supabaseClient.js';
import { MODULE_KEYS } from '../config/modules.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {
      'Authorization': 'Bearer admin-test-token',
      ...extraHeaders
    };
    if (body) headers['Content-Type'] = 'application/json';

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://localhost:${server.address().port}`;

  try {
    // 1. Assert removed endpoints return 404 in User-Owned Servers architecture
    {
      const res = await makeRequest('POST', '/api/admin/permissions', { 'user_id': 'u1', 'server_id': 's1' });
      assert.strictEqual(res.status, 404, 'POST /api/admin/permissions must return 404 on removed route');
      console.log('   ✓ Verified POST /api/admin/permissions returns 404 (removed route)');
    }

    // 2. Setup user and session
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

    // 3. Create an owned server via supabaseService.createUserServer
    const { data: ownedServer, error: createError } = await supabaseService.createUserServer({
      name: 'Owner Test SAP Server',
      ashost: '10.10.10.10',
      sysnr: '00',
      client: '100',
      lang: 'EN',
      environment: 'DEV',
      is_disabled: false,
      is_active: true
    }, testUserId);

    assert(!createError, `Server creation failed: ${createError?.message}`);
    assert(ownedServer && ownedServer.id, 'Created server must return an ID');

    // Verify BOM module was automatically assigned in server_modules on creation
    const modulesAfterCreate = inMemorySupabase.getServerModules(ownedServer.id);
    assert(modulesAfterCreate.includes(MODULE_KEYS.BOM), 'User-owned server must have BOM module enabled upon creation');
    console.log('   ✓ User-owned server created and automatically assigned BOM module');

    // 4. Call F4 route (GET /api/plants) on the owned server -> Expect 200 success
    const f4Headers = {
      'Authorization': `Bearer ${testToken}`,
      'x-sap-server-id': ownedServer.id
    };
    const f4Res = await makeRequest('GET', '/api/plants', null, f4Headers);
    assert.strictEqual(f4Res.status, 200, `F4 /api/plants should succeed with 200, got ${f4Res.status}: ${JSON.stringify(f4Res.body)}`);
    assert(Array.isArray(f4Res.body?.data) || Array.isArray(f4Res.body), 'F4 route should return plants array');
    console.log('   ✓ F4 route (/api/plants) called successfully on user-owned server (200 OK)');

    // 5. Existing owned server with NO rows in server_modules (simulate pre-migration state) -> Expect 200 success
    inMemorySupabase.server_modules = inMemorySupabase.server_modules.filter(m => m.server_id !== ownedServer.id);
    const fallbackModules = inMemorySupabase.getServerModules(ownedServer.id);
    assert(fallbackModules.includes(MODULE_KEYS.BOM), 'Owner fallback must provide BOM module even with 0 rows in server_modules');

    const f4FallbackRes = await makeRequest('GET', '/api/plants', null, f4Headers);
    assert.strictEqual(f4FallbackRes.status, 200, `F4 route must succeed for owned server even with 0 server_modules rows, got ${f4FallbackRes.status}`);
    console.log('   ✓ Existing user-owned server with 0 server_modules rows succeeds via owner fallback (200 OK)');

    // 6. Admin disables the server -> F4 route must return 403 SERVER_DISABLED
    ownedServer.is_disabled = true;
    supabaseCache.invalidateServer(ownedServer.id);
    const disabledModules = inMemorySupabase.getServerModules(ownedServer.id);
    assert.deepStrictEqual(disabledModules, [], 'Disabled server must report no active modules');

    const f4DisabledRes = await makeRequest('GET', '/api/plants', null, f4Headers);
    assert.strictEqual(f4DisabledRes.status, 403, `Disabled server must be blocked with 403, got ${f4DisabledRes.status}`);
    assert.strictEqual(f4DisabledRes.body?.code, 'SERVER_DISABLED', `Expected SERVER_DISABLED code, got ${f4DisabledRes.body?.code}`);
    console.log('   ✓ Admin-disabled server is strictly blocked with 403 SERVER_DISABLED');

    // 7. Legacy server (owner_id NULL) where admin configured 0 modules -> BOM module is NOT enabled
    const legacyServerId = `legacy-${Date.now()}`;
    const legacyServer = {
      id: legacyServerId,
      name: 'Legacy Server Without Modules',
      owner_id: null,
      ashost: '10.10.10.11',
      sysnr: '00',
      client: '100',
      is_disabled: false,
      is_active: true
    };
    inMemorySupabase.servers.push(legacyServer);
    inMemorySupabase.setServerModules(legacyServerId, [], 'admin-id');

    const legacyModules = inMemorySupabase.getServerModules(legacyServerId);
    assert.deepStrictEqual(legacyModules, [], 'Legacy server with admin-cleared modules must have 0 modules');
    const isBomEnabled = inMemorySupabase.isModuleEnabled(legacyServerId, MODULE_KEYS.BOM);
    assert.strictEqual(isBomEnabled, false, 'Legacy server without BOM must return false for isModuleEnabled');
    console.log('   ✓ Legacy server without assigned modules correctly behaves as not having BOM enabled');

    console.log('✓ moduleAccess.test.js: All module access and ownership assertions passed');
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
