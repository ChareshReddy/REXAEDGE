import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import app from '../server.js';
import { testServerConnection } from '../services/sapConnectionTest.js';
import { supabaseService } from '../services/supabaseClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runConnectionTestEngineTests() {
  console.log('\n======================================================');
  console.log('--- Testing SAP Connection Test Engine & Endpoints ---');
  console.log('======================================================');

  process.env.NODE_ENV = 'test';
  process.env.USE_MOCK_SAP = 'true';

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}`;

  try {
    // 1. Missing credentials rejection
    console.log('\n1. Testing testServerConnection with missing credentials:');
    const missingRes = await testServerConnection({ ashost: '', sap_username: '' }, { persist: false });
    assert.strictEqual(missingRes.success, false);
    assert.strictEqual(missingRes.overallStatus, 'FAIL');
    assert.strictEqual(missingRes.checks.length, 5);
    assert.strictEqual(missingRes.checks[0].status, 'FAIL');
    console.log('   ✓ Incomplete configuration rejected with structured FAIL checklist');

    // 2. Mock mode connection test (ECC schema mock)
    console.log('\n2. Testing testServerConnection in Mock mode (Standard ECC):');
    const eccRes = await testServerConnection({
      name: 'Test ECC',
      ashost: '192.168.1.10',
      sysnr: '00',
      client: '100',
      sap_username: 'TEST_USER',
      sap_password: 'MockPassword123!'
    }, { persist: false });

    assert.strictEqual(eccRes.success, true);
    assert.strictEqual(eccRes.overallStatus, 'PASS');
    assert.strictEqual(eccRes.checks.length, 5);
    assert.strictEqual(eccRes.checks[0].id, 'rfc_logon');
    assert.strictEqual(eccRes.checks[0].status, 'PASS');
    assert.strictEqual(eccRes.checks[1].id, 'rfc_read_table');
    assert.strictEqual(eccRes.checks[1].status, 'PASS');
    assert.strictEqual(eccRes.checks[2].id, 'matnr_length');
    assert.strictEqual(eccRes.checks[2].status, 'INFO');
    assert.strictEqual(eccRes.checks[2].length, 18);
    assert.strictEqual(eccRes.checks[3].id, 'zbom_copy');
    assert.strictEqual(eccRes.checks[3].status, 'PASS');
    assert.strictEqual(eccRes.checks[4].id, 'dd03l_schema');
    assert.strictEqual(eccRes.checks[4].status, 'PASS');
    console.log('   ✓ All 5 checks evaluated with correct status and INFO padding length');

    // 3. Mock mode connection test (S/4HANA client 800 with ZBOM_COPY warning)
    console.log('\n3. Testing testServerConnection in Mock mode (S/4HANA client 800 with ZBOM_COPY warning):');
    const s4Res = await testServerConnection({
      name: 'Hana System Mock',
      ashost: '115.245.150.98',
      sysnr: '18',
      client: '800',
      sap_username: 'ACCESS1',
      sap_password: 'MockPassword123!'
    }, { persist: false });

    assert.strictEqual(s4Res.success, true);
    assert.strictEqual(s4Res.overallStatus, 'WARN');
    assert.strictEqual(s4Res.checks[2].length, 40);
    assert.strictEqual(s4Res.checks[2].status, 'INFO');
    assert.strictEqual(s4Res.checks[3].status, 'WARN');
    assert.match(s4Res.checks[3].message, /ZBOM_COPY not found/i);
    assert.match(s4Res.checks[3].message, /Copy and Delete operations are unavailable on this server without ZBOM_COPY/i);
    console.log('   ✓ ZBOM_COPY warning correctly flagged and matnr 40 is informational');

    // 4. Test simulated RFC client with missing DD03L schema fields
    console.log('\n4. Testing simulated RFC client reporting missing DD03L fields:');
    const simulatedClient = {
      call: async (fm, params) => {
        if (fm === 'RFC_PING') return {};
        if (fm === 'RFC_READ_TABLE') {
          if (params.QUERY_TABLE === 'T000') return { DATA: [{ WA: '100' }] };
          if (params.QUERY_TABLE === 'DD03L') {
            const opt = params.OPTIONS?.[0]?.TEXT || '';
            if (opt.includes("FIELDNAME = 'MATNR'")) return { DATA: [{ WA: '40' }] };
            // Simulate missing STPO-POTX1
            if (opt.includes("TABNAME = 'STPO'") && opt.includes("FIELDNAME = 'POTX1'")) {
              return { DATA: [] };
            }
            return { DATA: [{ WA: 'EXISTS' }] };
          }
          if (params.QUERY_TABLE === 'TSTC') {
            return { DATA: [] }; // No ZBOM_COPY
          }
        }
        return { DATA: [] };
      }
    };

    const simulatedRes = await testServerConnection({
      name: 'Simulated S4',
      ashost: '10.0.0.1',
      sysnr: '00',
      client: '800',
      sap_username: 'SIM_USER',
      sap_password: 'ValidPass'
    }, { client: simulatedClient, persist: false });

    assert.strictEqual(simulatedRes.overallStatus, 'WARN');
    const schemaCheck = simulatedRes.checks.find((c) => c.id === 'dd03l_schema');
    assert.strictEqual(schemaCheck.status, 'WARN');
    assert.ok(schemaCheck.missingFields.includes('STPO.POTX1'));
    assert.match(schemaCheck.message, /Missing data dictionary fields: STPO\.POTX1/i);
    console.log('   ✓ DD03L schema check successfully listed missing fields');

    // 5. Test API endpoint POST /api/admin/servers/test-connection with Admin credentials
    console.log('\n5. Testing API endpoint POST /api/admin/servers/test-connection:');
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200, 'Admin login must succeed');
    const adminToken = adminLogin.data.token;

    const apiTestRes = await makeRequest('POST', '/api/admin/servers/test-connection', {
      ashost: '192.168.1.10',
      sysnr: '00',
      client: '100',
      sap_username: 'TEST_USER',
      sap_password: 'MockPassword123!'
    }, adminToken);
    assert.strictEqual(apiTestRes.status, 200);
    assert.strictEqual(apiTestRes.data.success, true);
    assert.ok(apiTestRes.data.connection_test);
    assert.strictEqual(apiTestRes.data.connection_test.checks.length, 5);
    console.log('   ✓ Endpoint /api/admin/servers/test-connection returned 5-point checklist payload');

    // 6. Test API endpoint POST /api/admin/servers/:id/test-connection and persistence
    console.log('\n6. Testing POST /api/admin/servers/:id/test-connection and database persistence:');
    const serverList = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
    assert.ok(serverList.length > 0);
    let targetServer = serverList.find((s) => s.sap_username && s.has_password);
    if (!targetServer) {
      await supabaseService.updateServer(serverList[0].id, {
        sap_username: 'TEST_USER',
        sap_password: 'MockPassword123!'
      });
      targetServer = await supabaseService.getServerById(serverList[0].id);
    }

    const testByIdRes = await makeRequest('POST', `/api/admin/servers/${targetServer.id}/test-connection`, null, adminToken);
    assert.strictEqual(testByIdRes.status, 200);
    assert.strictEqual(testByIdRes.data.success, true);
    assert.ok(testByIdRes.data.connection_test);

    // Verify persisted column in database / listServers
    const updatedServerList = await supabaseService.listServers({ includeSensitive: true, role: 'admin' });
    const verifiedServer = updatedServerList.find((s) => s.id === targetServer.id);
    assert.ok(verifiedServer.connection_test);
    assert.strictEqual(verifiedServer.connection_test.overallStatus, testByIdRes.data.connection_test.overallStatus);
    console.log('   ✓ Connection test result saved into database connection_test column and returned on listServers');

    // 7. Security: Confirm test-connection endpoints are strictly Admin-Only
    console.log('\n7. Testing Admin-Only Authorization on both endpoints:');
    // Unauthenticated call (no token) -> 401
    const unauthTest1 = await makeRequest('POST', '/api/admin/servers/test-connection', { ashost: '10.0.0.1' });
    assert.strictEqual(unauthTest1.status, 401, 'Unauthenticated POST /api/admin/servers/test-connection must be 401');

    const unauthTest2 = await makeRequest('POST', `/api/admin/servers/${targetServer.id}/test-connection`);
    assert.strictEqual(unauthTest2.status, 401, 'Unauthenticated POST /api/admin/servers/:id/test-connection must be 401');

    // Non-admin user call -> 403 Forbidden
    const userLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'user@nextitpoint.com',
      password: 'User@123456'
    });
    assert.strictEqual(userLogin.status, 200);
    const userToken = userLogin.data.token;

    const forbiddenTest1 = await makeRequest('POST', '/api/admin/servers/test-connection', { ashost: '10.0.0.1' }, userToken);
    assert.strictEqual(forbiddenTest1.status, 403, 'Non-admin user calling test-connection must be 403 Forbidden');
    assert.match(forbiddenTest1.data.error, /Administrator/i);

    const forbiddenTest2 = await makeRequest('POST', `/api/admin/servers/${targetServer.id}/test-connection`, null, userToken);
    assert.strictEqual(forbiddenTest2.status, 403, 'Non-admin user calling :id/test-connection must be 403 Forbidden');
    assert.match(forbiddenTest2.data.error, /Administrator/i);
    console.log('   ✓ Both test-connection endpoints reject unauthenticated (401) and non-admin users (403)');

    // 8. Security: Passwords are NEVER logged or returned in responses or stored results
    console.log('\n8. Testing that passwords and secrets are NEVER returned or stored in connection_test:');
    const secretPass = 'SuperSecretSapPass987!';
    const testWithSecret = await makeRequest('POST', '/api/admin/servers/test-connection', {
      ashost: '192.168.1.10',
      sysnr: '00',
      client: '100',
      sap_username: 'TEST_USER',
      sap_password: secretPass
    }, adminToken);
    assert.strictEqual(testWithSecret.status, 200);

    // Verify response body does not contain secretPass
    const resString = JSON.stringify(testWithSecret.data);
    assert.ok(!resString.includes(secretPass), 'Response payload must never contain the plain password');
    assert.strictEqual(testWithSecret.data.sap_password, undefined);
    assert.strictEqual(testWithSecret.data.sap_password_encrypted, undefined);

    // Verify checks array does not contain secretPass
    for (const chk of testWithSecret.data.connection_test.checks) {
      assert.ok(!JSON.stringify(chk).includes(secretPass), `Check ${chk.id} must not contain secret`);
    }

    // Verify persisted connection_test contains no secrets
    const persistedServer = await supabaseService.getServerById(targetServer.id);
    const persistedJson = JSON.stringify(persistedServer.connection_test);
    assert.ok(!persistedJson.includes('password'), 'Persisted connection_test must contain no password fields');
    console.log('   ✓ Passwords are never returned in responses and never saved in connection_test results');

    // 9. Verify No Silent Fallback: Error propagation when connection_test column is missing
    console.log('\n9. Testing explicit error when database connection_test column is missing:');
    const originalUpdateServer = supabaseService.updateServer;
    try {
      // Simulate database throwing missing column error
      supabaseService.updateServer = async () => {
        console.error('[Supabase] connection_test column missing - run migration_server_connection_test.sql');
        throw new Error('Database error: connection_test column missing - run migration_server_connection_test.sql');
      };

      const missingColRes = await makeRequest('POST', `/api/admin/servers/${targetServer.id}/test-connection`, null, adminToken);
      assert.strictEqual(missingColRes.status, 500);
      assert.strictEqual(missingColRes.data.success, false);
      assert.match(missingColRes.data.error, /connection_test column missing - run migration_server_connection_test\.sql/i);
      assert.strictEqual(missingColRes.data.migration_required, true);

      // Verify no fallback file was created on disk
      const fallbackPath = path.join(__dirname, '../mock/serverConnectionTests.json');
      assert.strictEqual(fs.existsSync(fallbackPath), false, 'No local fallback file must exist on disk');
      console.log('   ✓ Missing column returns explicit 500 error with migration guidance (no silent fallback)');
    } finally {
      supabaseService.updateServer = originalUpdateServer;
    }

    console.log('\n======================================================');
    console.log('✅ ALL SAP CONNECTION TEST ENGINE TESTS PASSED!');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runConnectionTestEngineTests().catch((err) => {
  console.error('Test suite failed:', err);
  if (server) server.close();
  process.exit(1);
});
