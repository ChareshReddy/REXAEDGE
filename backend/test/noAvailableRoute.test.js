process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
import 'dotenv/config';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = 'c4a8990172bf46e9df53e9a4e4d6d678d120a1122bfbe2580b03e05151598f82';
}
import assert from 'assert';
import http from 'http';
import app from '../server.js';
import { inMemorySupabase } from '../services/supabaseClient.js';
import { ensureMockOwnedServer, TEST_SERVER_ID } from './helpers/testServerHelper.js';

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

async function runTest() {
  console.log('\n============================================================');
  console.log('  TESTING /api/servers vs DEAD /api/servers/available ROUTE');
  console.log('============================================================');

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

  ensureMockOwnedServer(testUserId, TEST_SERVER_ID);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  const authHeaders = {
    Authorization: `Bearer ${testToken}`
  };

  try {
    // 1. GET /api/servers/available must return 404 (route dead / does not exist)
    console.log('1. Testing GET /api/servers/available returns 404...');
    const deadRes = await makeRequest('GET', '/api/servers/available', authHeaders);
    assert.strictEqual(deadRes.status, 404, `Expected 404 for dead /api/servers/available, got ${deadRes.status}`);
    console.log('   ✓ GET /api/servers/available correctly returns 404');

    // 2. GET /api/servers must return 200 with user servers
    console.log('2. Testing GET /api/servers returns 200 with servers array...');
    const liveRes = await makeRequest('GET', '/api/servers', authHeaders);
    assert.strictEqual(liveRes.status, 200, `Expected 200 for /api/servers, got ${liveRes.status}`);
    assert.strictEqual(liveRes.data.success, true);
    assert.ok(Array.isArray(liveRes.data.servers), 'Expected servers array');
    console.log(`   ✓ GET /api/servers returns 200 with ${liveRes.data.servers.length} server(s)`);

    console.log('\n============================================================');
    console.log('  ALL AVAILABLE ROUTE DEPRECATION TESTS PASSED!');
    console.log('============================================================\n');
  } finally {
    server.close();
  }
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  if (server) server.close();
  process.exit(1);
});
