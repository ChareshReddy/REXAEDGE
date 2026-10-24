import assert from 'assert';
import http from 'http';
import app from '../server.js';
import {
  supabaseService,
  verifyDatabaseConfiguration,
  shouldUseInMemory,
  inMemorySupabase
} from '../services/supabaseClient.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, token = 'admin-test-token') {
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

async function runResilienceTests() {
  console.log('\n============================================================');
  console.log('  RUNNING SAP SERVER CREATION RESILIENCE & DATABASE TESTS   ');
  console.log('============================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  try {
    // -------------------------------------------------------------
    // Test 1: An insert failure returns an error, not success
    // -------------------------------------------------------------
    console.log('1. Testing that an insert failure returns an error, NOT success:');
    
    // (a) Route validation failure: missing required ashost
    const invalidPayloadRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Broken Server Without Host',
      sysnr: '00',
      client: '100',
      environment: 'DEV'
    });
    assert.strictEqual(invalidPayloadRes.status, 400);
    assert.strictEqual(invalidPayloadRes.data.success, undefined);
    assert(invalidPayloadRes.data.error, 'Response must return error object');
    assert(invalidPayloadRes.data.error.includes('ashost'), 'Error must specify missing ashost');
    console.log('   ✓ Missing required fields returns HTTP 400 error, never success');

    // (b) Invalid module failure: attempting to enable unknown or coming_soon module
    const invalidModuleRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server With Invalid Module',
      ashost: '192.168.1.50',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      modules: ['invalid_module_xyz']
    });
    assert.strictEqual(invalidModuleRes.status, 400);
    assert.strictEqual(invalidModuleRes.data.success, undefined);
    assert(invalidModuleRes.data.error.includes('invalid module'), 'Error must indicate invalid module');
    console.log('   ✓ Invalid module returns HTTP 400 error, never success');

    // (c) Direct createServer error propagation (no silent in-memory fallback swallowing errors)
    let caughtError = null;
    try {
      await supabaseService.createServer({
        name: 'Invalid Env Direct',
        ashost: '192.168.1.1',
        sysnr: '00',
        client: '100',
        environment: 'INVALID_ENV_XYZ'
      });
    } catch (err) {
      caughtError = err;
    }
    assert(caughtError !== null, 'createServer must throw on invalid input');
    assert(caughtError.message.includes('Invalid environment'), 'Error message must reflect the failure');
    console.log('   ✓ Service directly throws errors and does not silently succeed');

    // -------------------------------------------------------------
    // Test 2: SANDBOX is accepted as an environment
    // -------------------------------------------------------------
    console.log('\n2. Testing that SANDBOX is accepted as an environment:');
    const sandboxServerPayload = {
      name: 'Relaxo QA Sandbox Server',
      ashost: '192.168.12.99',
      sysnr: '09',
      client: '500',
      lang: 'EN',
      environment: 'SANDBOX',
      router: '/H/103.206.249.51/H/',
      gwserv: '3309',
      modules: ['bom'],
      sap_username: 'SANDBOX_USER',
      sap_password: 'SandboxPassword123'
    };

    const createSandboxRes = await makeRequest('POST', '/api/admin/servers', sandboxServerPayload);
    assert.strictEqual(createSandboxRes.status, 201);
    assert.strictEqual(createSandboxRes.data.success, true);
    assert.strictEqual(createSandboxRes.data.server.environment, 'SANDBOX');
    assert.strictEqual(createSandboxRes.data.server.sap_username, 'SANDBOX_USER');
    assert.strictEqual(createSandboxRes.data.server.has_password, true);
    assert.strictEqual(createSandboxRes.data.server.credentials_status, 'saved');
    // Security check: passwords must NEVER be returned
    assert.strictEqual(createSandboxRes.data.server.sap_password, undefined);
    assert.strictEqual(createSandboxRes.data.server.sap_password_encrypted, undefined);
    const createdServerId = createSandboxRes.data.server.id;
    console.log('   ✓ Server created with environment: SANDBOX');
    console.log('   ✓ Credentials status marked "saved" without exposing plain or encrypted password');

    // -------------------------------------------------------------
    // Test 3: A created server appears in the list after refresh
    // -------------------------------------------------------------
    console.log('\n3. Testing that a created server appears in the list after refresh:');
    const listRes = await makeRequest('GET', '/api/admin/servers');
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.data.success, true);
    assert(Array.isArray(listRes.data.servers), 'Servers must be an array');

    const foundServer = listRes.data.servers.find((s) => s.id === createdServerId);
    assert(foundServer, `Newly created server with id ${createdServerId} must be present in GET /servers list`);
    assert.strictEqual(foundServer.name, 'Relaxo QA Sandbox Server');
    assert.strictEqual(foundServer.environment, 'SANDBOX');
    assert.strictEqual(foundServer.has_password, true);
    assert.strictEqual(foundServer.credentials_status, 'saved');
    // Secret verification
    assert.strictEqual(foundServer.sap_password, undefined);
    assert.strictEqual(foundServer.sap_password_encrypted, undefined);
    console.log('   ✓ Created server is present in the server list on refresh with identical metadata');

    // -------------------------------------------------------------
    // Test 4: Missing Supabase settings stop the app outside test mode
    // -------------------------------------------------------------
    console.log('\n4. Testing that missing Supabase settings stop the app outside test mode:');
    
    // Save current environment
    const prevNodeEnv = process.env.NODE_ENV;
    const prevUrl = process.env.SUPABASE_URL;
    const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
      // Simulate production / non-test mode
      process.env.NODE_ENV = 'production';

      // (a) SUPABASE_URL missing
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-dummy-key';
      let urlError = null;
      try {
        verifyDatabaseConfiguration();
      } catch (err) {
        urlError = err;
      }
      assert(urlError !== null, 'Must throw error when SUPABASE_URL is missing in production');
      assert(urlError.message.includes('SUPABASE_URL'), 'Error must explicitly name SUPABASE_URL');
      console.log('   ✓ Missing SUPABASE_URL throws and specifies SUPABASE_URL outside test mode');

      // (b) SUPABASE_SERVICE_ROLE_KEY missing
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      let keyError = null;
      try {
        verifyDatabaseConfiguration();
      } catch (err) {
        keyError = err;
      }
      assert(keyError !== null, 'Must throw error when SUPABASE_SERVICE_ROLE_KEY is missing in production');
      assert(keyError.message.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Error must explicitly name SUPABASE_SERVICE_ROLE_KEY');
      console.log('   ✓ Missing SUPABASE_SERVICE_ROLE_KEY throws and specifies SUPABASE_SERVICE_ROLE_KEY outside test mode');

      // (c) Both missing
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      let bothError = null;
      try {
        verifyDatabaseConfiguration();
      } catch (err) {
        bothError = err;
      }
      assert(bothError !== null, 'Must throw error when both settings are missing');
      assert(bothError.message.includes('SUPABASE_URL') && bothError.message.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Error must specify both missing settings');
      console.log('   ✓ Both missing settings are reported together outside test mode');

      // (d) When both are present outside test mode, reports connection success
      process.env.SUPABASE_URL = 'https://valid-supabase.supabase.co';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'valid-role-key-secret';
      const successConfig = verifyDatabaseConfiguration();
      assert.strictEqual(successConfig.configured, true);
      assert.strictEqual(successConfig.mode, 'live');
      console.log('   ✓ Valid configuration reports Supabase connected');

    } finally {
      // Restore environment
      process.env.NODE_ENV = prevNodeEnv;
      if (prevUrl) process.env.SUPABASE_URL = prevUrl; else delete process.env.SUPABASE_URL;
      if (prevKey) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey; else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }

    console.log('\n============================================================');
    console.log('  ALL SERVER RESILIENCE & DATABASE TESTS PASSED!            ');
    console.log('============================================================\n');

  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runResilienceTests().catch((err) => {
  console.error('\n❌ Resilience Test Failed:', err);
  process.exit(1);
});
