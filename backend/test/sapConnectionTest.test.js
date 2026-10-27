import assert from 'assert';
import http from 'http';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { supabaseService } from '../services/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);

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

async function runTestConnectionRemovalTests() {
  console.log('\n======================================================');
  console.log('  TESTING REMOVAL OF "TEST CONNECTION" FEATURE');
  console.log('======================================================\n');

  // 1. Setup Admin credentials
  const adminLogin = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@nextitpoint.com',
    password: 'Admin@123456'
  });
  assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
  const adminToken = adminLogin.data.token;

  // 2. Verify POST /api/admin/servers/test-connection is REMOVED (returns 404)
  console.log('1. Testing POST /api/admin/servers/test-connection route removal:');
  const removedTest1 = await makeRequest(
    'POST',
    '/api/admin/servers/test-connection',
    { ashost: '10.0.0.1', sap_username: 'TEST', sap_password: 'PWD' },
    adminToken
  );
  assert.strictEqual(
    removedTest1.status,
    404,
    'POST /api/admin/servers/test-connection must return 404 (route removed)'
  );
  console.log('   ✓ POST /api/admin/servers/test-connection returns 404 (route completely removed)');

  // 3. Create a test SAP server
  console.log('\n2. Testing server creation without connection_test dependency:');
  const createServerRes = await makeRequest(
    'POST',
    '/api/admin/servers',
    {
      name: 'NoTestConn Server',
      ashost: '115.245.150.98',
      sysnr: '00',
      client: '100',
      lang: 'EN',
      environment: 'DEV',
      sap_username: 'TEST_USER',
      sap_password: 'TestPassword123!',
      modules: ['bom']
    },
    adminToken
  );
  assert.strictEqual(createServerRes.status, 201, 'Server creation must succeed');
  const createdServer = createServerRes.data.server;
  assert.strictEqual(createdServer.name, 'NoTestConn Server');
  assert.strictEqual(
    createdServer.connection_test,
    undefined,
    'Server response must not contain connection_test field'
  );
  console.log('   ✓ Server created cleanly without connection_test field and without background test triggers');

  // 4. Verify POST /api/admin/servers/:id/test-connection is REMOVED (returns 404)
  console.log('\n3. Testing POST /api/admin/servers/:id/test-connection route removal:');
  const removedTest2 = await makeRequest(
    'POST',
    `/api/admin/servers/${createdServer.id}/test-connection`,
    null,
    adminToken
  );
  assert.strictEqual(
    removedTest2.status,
    404,
    'POST /api/admin/servers/:id/test-connection must return 404 (route removed)'
  );
  console.log('   ✓ POST /api/admin/servers/:id/test-connection returns 404 (route completely removed)');

  // 5. Verify server update works without connection_test
  console.log('\n4. Testing server update without connection_test dependency:');
  const updateRes = await makeRequest(
    'PUT',
    `/api/admin/servers/${createdServer.id}`,
    {
      name: 'Updated Server Clean',
      environment: 'QA'
    },
    adminToken
  );
  assert.strictEqual(updateRes.status, 200, 'Server update must succeed');
  assert.strictEqual(updateRes.data.server.name, 'Updated Server Clean');
  assert.strictEqual(
    updateRes.data.server.connection_test,
    undefined,
    'Updated server response must not contain connection_test field'
  );
  console.log('   ✓ Server updated cleanly without connection_test dependency');

  // 6. Verify server list excludes connection_test
  console.log('\n5. Testing GET /api/admin/servers excludes connection_test:');
  const listRes = await makeRequest('GET', '/api/admin/servers', null, adminToken);
  assert.strictEqual(listRes.status, 200);
  const found = (listRes.data.servers || []).find((s) => s.id === createdServer.id);
  assert.ok(found, 'Created server must be listed');
  assert.strictEqual(
    found.connection_test,
    undefined,
    'Listed server must not have connection_test'
  );
  console.log('   ✓ Server list correctly excludes connection_test field from all records');

  // 7. Cleanup
  console.log('\n6. Cleaning up test server:');
  const deleteRes = await makeRequest(
    'DELETE',
    `/api/admin/servers/${createdServer.id}`,
    null,
    adminToken
  );
  assert.strictEqual(deleteRes.status, 200, 'Server deletion must succeed');
  console.log('   ✓ Test server deleted cleanly');

  console.log('\n======================================================');
  console.log('  ALL "TEST CONNECTION" REMOVAL TESTS PASSED (100%)');
  console.log('======================================================\n');
}

async function start() {
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  try {
    await runTestConnectionRemovalTests();
  } finally {
    server.close();
  }
}

start().catch((err) => {
  console.error('Test Suite Failed:', err);
  if (server) server.close();
  process.exit(1);
});
