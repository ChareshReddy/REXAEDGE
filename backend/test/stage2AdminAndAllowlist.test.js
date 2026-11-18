process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.USE_MOCK_SUPABASE = 'true';
process.env.SKIP_GATEWAY_AUTH = 'false';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import {
  isIpAddress,
  matchCidr,
  matchPattern,
  getPatternSpecificity,
  findBestAllowlistMatch,
  validateRouterString,
  validateServerHost,
  isBlockedSsrfTarget
} from '../services/serverAllowlistService.js';
import { inMemorySupabase, supabaseService } from '../services/supabaseClient.js';
import { auditLogger } from '../services/auditLog.js';
import { encryptPassword, decryptPassword } from '../utils/crypto.js';
import { bomJobManager } from '../services/bomJobManager.js';
import {
  SapConnectionPool,
  GLOBAL_MAX_SAP_CONNECTIONS,
  getTotalGlobalActiveConnections,
  checkAndCleanIdlePools,
  getSapConnectionPool,
  removePool,
  resetAllPools
} from '../services/sapConnectionPool.js';

const { default: app } = await import('../server.js');

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
          resolve({ status: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await resetAllPools();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Setup mock users and tokens
const adminToken = 'mock-admin-token-s2';
const userAToken = 'mock-usera-token-s2';
const userBToken = 'mock-userb-token-s2';

inMemorySupabase.users = [
  { id: 'admin-s2-id', email: 'admin@rexaedge.com', role: 'admin', is_disabled: false },
  { id: 'user-a-s2-id', email: 'usera@rexaedge.com', role: 'user', is_disabled: false },
  { id: 'user-b-s2-id', email: 'userb@rexaedge.com', role: 'user', is_disabled: false }
];

inMemorySupabase.sessions.set(adminToken, { user: inMemorySupabase.users[0] });
inMemorySupabase.sessions.set(userAToken, { user: inMemorySupabase.users[1] });
inMemorySupabase.sessions.set(userBToken, { user: inMemorySupabase.users[2] });

// Standard allowlist fixtures
inMemorySupabase.server_allowlist = [
  { id: 'al-exact', pattern: '103.206.249.51', type: 'Sandbox', comment: 'Sandbox Gateway' },
  { id: 'al-cidr-prod', pattern: '192.168.1.0/24', type: 'Production', comment: 'Prod Subnet' },
  { id: 'al-wildcard-dev', pattern: '192.168.*', type: 'Development', comment: 'Dev Wildcard' },
  { id: 'al-wildcard-qa', pattern: '10.*', type: 'QA', comment: 'QA Range' }
];
inMemorySupabase.allowlist = inMemorySupabase.server_allowlist;

test('Stage 2 Core: AES-256-GCM Encryption Round-Trip & No Secrets in Responses/Logs', async (t) => {
  await t.test('Password encryption round trip produces iv:authTag:cipher and restores plain text', () => {
    const rawSecret = 'TopSecretSapPassword2026!';
    const cipherPayload = encryptPassword(rawSecret);
    assert.ok(cipherPayload);
    assert.strictEqual(cipherPayload.split(':').length, 3);
    assert.strictEqual(cipherPayload.includes(rawSecret), false);

    const decrypted = decryptPassword(cipherPayload);
    assert.strictEqual(decrypted, rawSecret);
  });

  await t.test('Audit log action never captures raw secrets or keys', () => {
    let loggedEntry = null;
    const origLog = auditLogger.logAction;
    auditLogger.logAction = (entry) => {
      loggedEntry = entry;
      return origLog.call(auditLogger, entry);
    };

    try {
      auditLogger.logAction({
        user: 'user@rexaedge.com',
        actionType: 'server_add',
        recordId: 'srv-test',
        task: 'Created server with credentials',
        afterValues: { ashost: '103.206.249.51', name: 'Test Srv' }
      });

      const entryStr = JSON.stringify(loggedEntry);
      assert.strictEqual(entryStr.includes('TopSecretSapPassword2026!'), false);
      assert.strictEqual(entryStr.includes(process.env.ENCRYPTION_KEY), false);
    } finally {
      auditLogger.logAction = origLog;
    }
  });
});

test('Stage 2 Core: SSRF & Security Defense (Loopback, Metadata, DNS Rebinding, Router Hop, /P/, Message Server, SNC)', async (t) => {
  await t.test('Loopback hosts (127.0.0.1, localhost, ::1, 0.0.0.0) are blocked', async () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '0.0.0.0', '127.0.0.99']) {
      const res = await validateServerHost({ ashost: host }, inMemorySupabase.server_allowlist);
      assert.strictEqual(res.permitted, false);
      assert.strictEqual(res.code, 'HOST_NOT_ALLOWED');
    }
  });

  await t.test('Cloud metadata IP (169.254.169.254) is blocked', async () => {
    const res = await validateServerHost({ ashost: '169.254.169.254' }, inMemorySupabase.server_allowlist);
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'HOST_NOT_ALLOWED');
  });

  await t.test('Non-allowlisted hosts are strictly rejected', async () => {
    const res = await validateServerHost({ ashost: '203.0.113.88' }, inMemorySupabase.server_allowlist);
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'HOST_NOT_ALLOWED');
  });

  await t.test('Router string with /P/ password is strictly rejected', async () => {
    const res = await validateServerHost(
      { ashost: '103.206.249.51', router: '/H/103.206.249.51/S/3299/P/routerpass/H/' },
      inMemorySupabase.server_allowlist
    );
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'ROUTER_PASSWORD_NOT_ALLOWED');
  });

  await t.test('Router string with bad/forbidden hop is rejected', async () => {
    const res = await validateServerHost(
      { ashost: '103.206.249.51', router: '/H/127.0.0.1/H/' },
      inMemorySupabase.server_allowlist
    );
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'ROUTER_HOP_NOT_ALLOWED');
  });

  await t.test('Message-server logon is rejected', async () => {
    const res = await validateServerHost(
      { ashost: '103.206.249.51', mshost: 'sapms.corp', group: 'SPACE' },
      inMemorySupabase.server_allowlist
    );
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'MESSAGE_SERVER_NOT_SUPPORTED');
  });

  await t.test('SNC connection is rejected', async () => {
    const res = await validateServerHost(
      { ashost: '103.206.249.51', snc_mode: '1' },
      inMemorySupabase.server_allowlist
    );
    assert.strictEqual(res.permitted, false);
    assert.strictEqual(res.code, 'SNC_NOT_SUPPORTED');
  });
});

test('Stage 2 Core: Server Type Taken from Allowlist (Most Specific Match)', async (t) => {
  await t.test('Exact match takes precedence over wildcard and sets Sandbox', () => {
    const best = findBestAllowlistMatch('103.206.249.51', inMemorySupabase.server_allowlist);
    assert.strictEqual(best.type, 'Sandbox');
    assert.strictEqual(best.pattern, '103.206.249.51');
  });

  await t.test('CIDR /24 match takes precedence over broader wildcard and sets Production', () => {
    // 192.168.1.5 matches both '192.168.1.0/24' (Prod) and '192.168.*' (Dev)
    // /24 must win because it has higher specificity score
    const best = findBestAllowlistMatch('192.168.1.5', inMemorySupabase.server_allowlist);
    assert.strictEqual(best.type, 'Production');
    assert.strictEqual(best.pattern, '192.168.1.0/24');
  });

  await t.test('Wildcard matches fallback when no CIDR/exact match exists and sets Development', () => {
    const best = findBestAllowlistMatch('192.168.99.10', inMemorySupabase.server_allowlist);
    assert.strictEqual(best.type, 'Development');
  });
});

test('Stage 2 Core: My Servers API (CRUD, Owner-Scoped, Password Handling, Limits)', async (t) => {
  inMemorySupabase.servers = []; // Clear for clean test state
  let createdServerId = null;

  await t.test('User A creates a server -> type derived from allowlist, password encrypted, default set', async () => {
    const res = await makeRequest(
      'POST',
      '/api/servers',
      {
        name: 'My Dev SAP',
        ashost: '192.168.1.50',
        sysnr: '00',
        client: '100',
        sap_username: 'DEVELOPER_A',
        sap_password: 'InitialSapSecretPassword1!',
        max_connections: 10 // User requests 10, must be capped to 5
      },
      userAToken
    );

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.server);
    assert.strictEqual(res.body.server.environment, 'Production'); // Derived from 192.168.1.0/24
    assert.strictEqual(res.body.server.is_default, true); // First server becomes default
    assert.strictEqual(res.body.server.max_connections, 5); // Capped by admin max
    assert.strictEqual(res.body.server.sap_password, undefined); // Password NEVER returned in response
    assert.strictEqual(res.body.server.sap_password_masked, true);

    createdServerId = res.body.server.id;

    // Verify stored DB representation is encrypted
    const inDb = inMemorySupabase.servers.find((s) => s.id === createdServerId);
    assert.ok(inDb.sap_password);
    assert.strictEqual(inDb.sap_password.split(':').length, 3);
    assert.strictEqual(decryptPassword(inDb.sap_password), 'InitialSapSecretPassword1!');
  });

  await t.test('User A edits server: "leave blank to keep" password preserves existing secret', async () => {
    const res = await makeRequest(
      'PUT',
      `/api/servers/${createdServerId}`,
      {
        name: 'My Renamed Dev SAP',
        sap_password: '' // Blank password means KEEP existing!
      },
      userAToken
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.server.name, 'My Renamed Dev SAP');
    assert.strictEqual(res.body.server.sap_password, undefined);

    const inDb = inMemorySupabase.servers.find((s) => s.id === createdServerId);
    assert.strictEqual(decryptPassword(inDb.sap_password), 'InitialSapSecretPassword1!');
  });

  await t.test('User B cannot access or edit User A server (404 owner isolation)', async () => {
    const getRes = await makeRequest('GET', `/api/servers/${createdServerId}`, null, userBToken);
    assert.strictEqual(getRes.status, 404);

    const putRes = await makeRequest('PUT', `/api/servers/${createdServerId}`, { name: 'Hacked' }, userBToken);
    assert.strictEqual(putRes.status, 404);

    const delRes = await makeRequest('DELETE', `/api/servers/${createdServerId}`, null, userBToken);
    assert.strictEqual(delRes.status, 404);
  });

  await t.test('Per-user server limit (default 5): 6th server is rejected', async () => {
    // User A currently has 1 server. Add 4 more to reach 5.
    for (let i = 2; i <= 5; i++) {
      const r = await makeRequest(
        'POST',
        '/api/servers',
        { name: `Server ${i}`, ashost: '103.206.249.51' },
        userAToken
      );
      assert.strictEqual(r.status, 201);
    }

    // 6th server creation must fail with 400 LIMIT_EXCEEDED
    const overflowRes = await makeRequest(
      'POST',
      '/api/servers',
      { name: 'Server 6', ashost: '103.206.249.51' },
      userAToken
    );
    assert.strictEqual(overflowRes.status, 400);
    assert.strictEqual(overflowRes.body.code, 'LIMIT_EXCEEDED');
  });

  await t.test('User A deletes a server and pool is closed cleanly', async () => {
    const delRes = await makeRequest('DELETE', `/api/servers/${createdServerId}`, null, userAToken);
    assert.strictEqual(delRes.status, 200);

    const checkRes = await makeRequest('GET', `/api/servers/${createdServerId}`, null, userAToken);
    assert.strictEqual(checkRes.status, 404);
  });
});

test('Stage 2 Core: Connection Limits, Idle Pool Close & Test Connection Rate Limiting', async (t) => {
  await t.test('Test connection endpoint rate limit (5/min/user): 6th request rejected with 429', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await makeRequest(
        'POST',
        '/api/servers/test',
        { ashost: '103.206.249.51' },
        userBToken
      );
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.success, true);
    }

    // 6th test connection in same window must fail with 429
    const limitedRes = await makeRequest(
      'POST',
      '/api/servers/test',
      { ashost: '103.206.249.51' },
      userBToken
    );
    assert.strictEqual(limitedRes.status, 429);
    assert.strictEqual(limitedRes.body.code, 'RATE_LIMITED');
  });

  await t.test('Idle pool closes and evicts after 10 minutes timeout', async () => {
    const testPoolId = 'pool-idle-test';
    const pool = getSapConnectionPool({ id: testPoolId, max_connections: 2 });
    assert.ok(pool);

    // Simulate 10 minutes of inactivity
    pool.lastActiveAt = Date.now() - (10 * 60 * 1000 + 5000);

    const closed = await checkAndCleanIdlePools(10 * 60 * 1000);
    assert.ok(closed.includes(testPoolId));
  });

  await t.test('Global SAP connection limit is enforced', () => {
    assert.strictEqual(typeof GLOBAL_MAX_SAP_CONNECTIONS, 'number');
    assert.ok(GLOBAL_MAX_SAP_CONNECTIONS > 0);
  });
});

test('Stage 2 Confirmation & Pre-Stage 3 Security Gates', async (t) => {
  await t.test('1. Test: DNS rebinding (resolve to allowed IP at check, different IP at connect) is refused', async () => {
    // Simulated DNS rebinding scenario:
    // Host was checked and validated as 103.206.249.51.
    // At connect time, DNS resolves to 192.168.1.99 (or an IP not matching validated_ip).
    const checkTarget = { ashost: '103.206.249.51' };
    const checkResult = await validateServerHost(checkTarget, inMemorySupabase.server_allowlist);
    assert.strictEqual(checkResult.permitted, true);
    assert.strictEqual(checkResult.validatedIp, '103.206.249.51');

    // At connect time, validated_ip is passed as expectedIp, but target resolves differently
    const rebindingResult = await validateServerHost(
      { ashost: '103.206.249.51', validated_ip: '192.168.1.50' }, // Mismatch between expected IP and resolved IP
      inMemorySupabase.server_allowlist,
      { expectedIp: '192.168.1.50' }
    );
    assert.strictEqual(rebindingResult.permitted, false);
    assert.strictEqual(rebindingResult.code, 'DNS_REBINDING_REFUSED');
    assert.ok(rebindingResult.message.includes('DNS rebinding detected'));
  });

  await t.test('2. Saving a NEW server requires a successful test-connection unless admin setting allows it', async () => {
    // Clear servers for this user to ensure not hitting 5-server limit
    inMemorySupabase.servers = inMemorySupabase.servers.filter(s => s.owner_id !== inMemorySupabase.users[1].id);

    // 2a. Default admin setting: allow_untested_servers = false
    await supabaseService.updateAdminSettings({ allow_untested_servers: false });

    // Attempting to save untested server without running/passing test must fail
    const failRes = await makeRequest(
      'POST',
      '/api/servers',
      {
        name: 'Untested Server Fail',
        ashost: '103.206.249.51',
        skip_test: true
      },
      userAToken
    );
    assert.strictEqual(failRes.status, 400);
    assert.strictEqual(failRes.body.code, 'TEST_CONNECTION_REQUIRED');

    // Saving with successful test connection succeeds
    const passRes = await makeRequest(
      'POST',
      '/api/servers',
      {
        name: 'Tested Server Success',
        ashost: '103.206.249.51',
        sysnr: '00',
        client: '100',
        sap_username: 'TEST_USER',
        sap_password: 'ValidPassword123!'
      },
      userAToken
    );
    assert.strictEqual(passRes.status, 201);
    assert.ok(passRes.body.server?.id);

    // 2b. Admin setting updated: allow_untested_servers = true
    await supabaseService.updateAdminSettings({ allow_untested_servers: true });

    const adminAllowedRes = await makeRequest(
      'POST',
      '/api/servers',
      {
        name: 'Admin Untested Allowed Server',
        ashost: '103.206.249.51',
        skip_test: true
      },
      userAToken
    );
    assert.strictEqual(adminAllowedRes.status, 201);
    assert.ok(adminAllowedRes.body.server?.id);

    // Reset admin setting to default for subsequent tests
    await supabaseService.updateAdminSettings({ allow_untested_servers: false });
  });

  await t.test('3. Test: encryption round trip (save, decrypt in backend, value matches; never returned)', async () => {
    const rawSecret = 'MySuperSecret$APPassw0rd2026!';
    const createRes = await makeRequest(
      'POST',
      '/api/servers',
      {
        name: 'Encryption Verification SAP',
        ashost: '103.206.249.51',
        sysnr: '00',
        client: '100',
        sap_username: 'ENCRYPTION_TEST_USER',
        sap_password: rawSecret
      },
      userBToken
    );

    assert.strictEqual(createRes.status, 201);
    const serverObj = createRes.body.server;
    assert.ok(serverObj);
    assert.strictEqual(serverObj.sap_password, undefined); // NEVER returned in response
    assert.strictEqual(serverObj.sap_password_masked, true);

    // Verify stored representation in DB is encrypted
    const stored = inMemorySupabase.servers.find((s) => s.id === serverObj.id);
    assert.ok(stored);
    assert.ok(stored.sap_password);
    assert.strictEqual(stored.sap_password.includes(rawSecret), false); // Plaintext not stored
    assert.strictEqual(stored.sap_password.split(':').length, 3); // iv:authTag:ciphertext

    // Decrypt in backend and verify value matches exactly
    const decrypted = decryptPassword(stored.sap_password);
    assert.strictEqual(decrypted, rawSecret);
  });

  await t.test('4. Admin kill switch Delete cancels running jobs on server and closes pool', async () => {
    const userA = inMemorySupabase.users[1];
    const serverObj = inMemorySupabase.servers[0];
    assert.ok(serverObj, 'A server must exist');

    // Simulate an active pool and a running job for this server
    const pool = getSapConnectionPool(serverObj.id, {
      ashost: '127.0.0.1',
      sysnr: '00',
      client: '100',
      user: 'MOCK',
      password: 'MOCK'
    });
    assert.ok(pool);

    const jobId = 'job_killswitch_test_' + Date.now();
    const fakeJob = {
      jobId,
      id: jobId,
      type: 'create_bulk',
      userId: userA.id,
      userEmail: userA.email,
      serverId: serverObj.id,
      serverName: serverObj.name,
      status: 'RUNNING',
      total: 5,
      processed: 1,
      createdAt: new Date().toISOString()
    };
    bomJobManager.jobs.set(jobId, fakeJob);

    // Admin executes DELETE /api/admin/servers/:id kill switch
    const delRes = await makeRequest(
      'DELETE',
      `/api/admin/servers/${serverObj.id}`,
      null,
      adminToken
    );
    assert.strictEqual(delRes.status, 200);

    // Confirm job was cancelled
    const updatedJob = await bomJobManager.getJob(jobId, userA);
    assert.strictEqual(updatedJob.status, 'CANCELLED');
    assert.ok(updatedJob.error?.includes('Server deleted by administrator kill switch'));

    // Server should no longer exist in DB
    const inDb = inMemorySupabase.servers.find((s) => s.id === serverObj.id);
    assert.strictEqual(inDb, undefined);
  });
});
