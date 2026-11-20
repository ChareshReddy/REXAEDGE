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
import { inMemorySupabase, supabaseService } from '../services/supabaseClient.js';
import {
  bomLockService,
  normalizeSapSystemIdentity,
  normalizeBomLockKey,
  BomLockError
} from '../services/bomLockService.js';
import { checkServerOwnership } from '../middleware/serverOwnership.js';
import { bomJobManager } from '../services/bomJobManager.js';

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
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// Setup mock users and tokens
const userAToken = 'mock-usera-stage3';
const userBToken = 'mock-userb-stage3';

const userA = { id: 'user-a-s3-id', email: 'usera.s3@rexaedge.com', role: 'user', is_disabled: false };
const userB = { id: 'user-b-s3-id', email: 'userb.s3@rexaedge.com', role: 'user', is_disabled: false };

inMemorySupabase.users = [userA, userB];
inMemorySupabase.sessions.set(userAToken, { user: userA });
inMemorySupabase.sessions.set(userBToken, { user: userB });

// Standard allowlist
inMemorySupabase.server_allowlist = [
  { id: 'al-sap-prod', pattern: '103.206.249.51', type: 'Production', comment: 'SAP Core' },
  { id: 'al-sap-dev', pattern: '192.168.1.0/24', type: 'Development', comment: 'Dev Subnet' }
];
inMemorySupabase.allowlist = inMemorySupabase.server_allowlist;

// Create servers for User A and User B pointing to the SAME physical SAP system
const sapSharedHost = '103.206.249.51';
const serverA1 = {
  id: 'srv-user-a-shared',
  owner_id: userA.id,
  name: 'User A Production SAP',
  ashost: sapSharedHost,
  sysnr: '00',
  client: '100',
  is_default: true,
  is_disabled: false,
  sap_username: 'USER_A_SAP'
};

const serverB1 = {
  id: 'srv-user-b-shared',
  owner_id: userB.id,
  name: 'User B Production SAP',
  ashost: sapSharedHost,
  sysnr: '00',
  client: '100',
  is_default: true,
  is_disabled: false,
  sap_username: 'USER_B_SAP'
};

const serverA2 = {
  id: 'srv-user-a-dev',
  owner_id: userA.id,
  name: 'User A Dev SAP',
  ashost: '192.168.1.50',
  sysnr: '01',
  client: '200',
  is_default: false,
  is_disabled: false,
  sap_username: 'USER_A_DEV'
};

inMemorySupabase.servers = [serverA1, serverB1, serverA2];

test('Stage 3 Core: Explicit Header Resolution & No Active-Server Fallback', async (t) => {
  await t.test('Server-scoped request with valid x-sap-server-id header succeeds', async () => {
    const res = await makeRequest(
      'GET',
      '/api/plants',
      null,
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA1.id
      }
    );
    assert.strictEqual(res.status, 200);
  });

  await t.test('Server-scoped request WITHOUT server header returns 404 SERVER_NOT_FOUND (never uses body serverId)', async () => {
    const res = await makeRequest(
      'POST',
      '/api/sap/sessions/select',
      { sessionId: 'RFC_TEST', serverId: serverA1.id },
      {
        Authorization: `Bearer ${userAToken}`
        // Missing x-sap-server-id header
      }
    );
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'SERVER_NOT_FOUND');
  });

  await t.test('Request with differing body serverId and x-sap-server-id rejects with 400 SERVER_CONTEXT_MISMATCH', async () => {
    const res = await makeRequest(
      'POST',
      '/api/sap/sessions/select',
      { sessionId: 'RFC_TEST', serverId: serverA2.id },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA1.id
      }
    );
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.code, 'SERVER_CONTEXT_MISMATCH');
    assert.ok(res.body.error.includes('Server ID in request body does not match'));
  });

  await t.test('Request with server owned by another user returns 404 (strictly owner-isolated)', async () => {
    const res = await makeRequest(
      'GET',
      '/api/plants',
      null,
      {
        Authorization: `Bearer ${userBToken}`,
        'x-sap-server-id': serverA1.id // Server A1 is owned by User A
      }
    );
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.code, 'SERVER_NOT_FOUND');
  });
});

test('Stage 3 Core: Lock Leases Keyed by SAP System Identity (Multi-User Cross-Server Collision)', async (t) => {
  await t.test('SAP system identity normalization produces identical key for distinct server rows', () => {
    const identityA = normalizeSapSystemIdentity(serverA1);
    const identityB = normalizeSapSystemIdentity(serverB1);
    assert.strictEqual(identityA, identityB);
    assert.strictEqual(identityA, '103.206.249.51:00:100');

    const keyA = normalizeBomLockKey({
      server: serverA1,
      material: 'ROBOT-01',
      plant: '1000',
      bomUsage: '1',
      alternative: '01'
    });

    const keyB = normalizeBomLockKey({
      server: serverB1,
      material: 'ROBOT-01',
      plant: '1000',
      bomUsage: '1',
      alternative: '01'
    });

    assert.strictEqual(keyA, keyB);
    assert.strictEqual(keyA, '103.206.249.51:00:100:ROBOT-01:1000:1:01');
  });

  await t.test('Two users with different server rows on the SAME SAP system block each other on the same BOM', async () => {
    bomLockService.clearAllLocks();

    // User A acquires lock on BOM via serverA1
    const lockA = bomLockService.acquireLock({
      server: serverA1,
      material: 'PUMP-440',
      plant: '2000',
      bomUsage: '1',
      alternative: '01',
      userId: userA.id
    });
    assert.ok(lockA);

    // User B tries to acquire lock on the SAME BOM via serverB1 -> MUST FAIL with BomLockError (409 BOM_LOCKED)
    assert.throws(
      () => {
        bomLockService.acquireLock({
          server: serverB1,
          material: 'PUMP-440',
          plant: '2000',
          bomUsage: '1',
          alternative: '01',
          userId: userB.id
        });
      },
      (err) => {
        assert.ok(err instanceof BomLockError);
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'BOM_LOCKED');
        return true;
      }
    );

    // After User A releases lock, User B can acquire it
    lockA.release();

    const lockB = bomLockService.acquireLock({
      server: serverB1,
      material: 'PUMP-440',
      plant: '2000',
      bomUsage: '1',
      alternative: '01',
      userId: userB.id
    });
    assert.ok(lockB);
    lockB.release();
  });
});

test('Stage 3 Core: Concurrent Requests with Different Server IDs Do Not Cross', async (t) => {
  await t.test('Parallel requests carrying different server IDs resolve their own servers correctly', async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const targetServer = i % 2 === 0 ? serverA1 : serverA2;
      promises.push(
        makeRequest(
          'GET',
          '/api/plants',
          null,
          {
            Authorization: `Bearer ${userAToken}`,
            'x-sap-server-id': targetServer.id
          }
        ).then((res) => {
          assert.strictEqual(res.status, 200);
        })
      );
    }
    await Promise.all(promises);
  });
});

test('Stage 3 Requirement 2: Bulk Job Ownership & File Downloads', async (t) => {
  // 1. Bulk jobs store server_id at creation; job status, cancel, and results are authorized by job ownership and use stored server_id (no request header required)
  await t.test('Bulk job status and cancel work without header using stored server_id; other users get 404', async () => {
    const jobResult = bomJobManager.startJob({
      type: 'create_bulk',
      user: userA,
      server: serverA1,
      items: [{ Material: 'MAT-01', Plant: '1000' }],
      fileName: 'test.xlsx'
    });
    const jobId = jobResult.jobId;
    assert.ok(jobId);

    // Fetch job status WITHOUT x-sap-server-id header -> must succeed authorized by job ownership
    const statusResNoHeader = await makeRequest(
      'GET',
      `/api/bom/jobs/${jobId}`,
      null,
      {
        Authorization: `Bearer ${userAToken}`
      }
    );
    assert.strictEqual(statusResNoHeader.status, 200);
    assert.strictEqual(statusResNoHeader.body.job.serverId, serverA1.id);

    // Ensure job is in RUNNING state to test cancellation
    const activeJob = bomJobManager.jobs.get(jobId);
    if (activeJob) {
      activeJob.status = 'RUNNING';
    }

    // Cancel job WITHOUT x-sap-server-id header -> must succeed authorized by job ownership
    const cancelResNoHeader = await makeRequest(
      'POST',
      `/api/bom/jobs/${jobId}/cancel`,
      {},
      {
        Authorization: `Bearer ${userAToken}`
      }
    );
    assert.strictEqual(cancelResNoHeader.status, 200);

    // User B tries to access User A's job -> MUST return 404
    const userBAccessRes = await makeRequest(
      'GET',
      `/api/bom/jobs/${jobId}`,
      null,
      {
        Authorization: `Bearer ${userBToken}`
      }
    );
    assert.strictEqual(userBAccessRes.status, 404);
  });

  // 2. Direct POST file download carrying explicit x-sap-server-id header
  await t.test('Direct POST file download succeeds with x-sap-server-id and fails without it', async () => {
    const successRes = await makeRequest(
      'POST',
      '/api/bom/template',
      {},
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA1.id
      }
    );
    assert.strictEqual(successRes.status, 200);

    const failRes = await makeRequest(
      'POST',
      '/api/bom/template',
      {},
      {
        Authorization: `Bearer ${userAToken}`
      }
    );
    assert.strictEqual(failRes.status, 404);
  });

  // 3. File download via short-lived ticket tied to user + server
  await t.test('File download via short-lived download ticket tied to user + server succeeds without header on GET', async () => {
    // Generate ticket with header
    const ticketRes = await makeRequest(
      'POST',
      '/api/bom/download-ticket',
      {},
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA1.id
      }
    );
    assert.strictEqual(ticketRes.status, 200);
    assert.ok(ticketRes.body.ticket);
    const ticketId = ticketRes.body.ticket;

    // Consume ticket via GET without any server header
    const downloadRes = await makeRequest(
      'GET',
      `/api/bom/download/${ticketId}`,
      null,
      {
        Authorization: `Bearer ${userAToken}`
      }
    );
    assert.strictEqual(downloadRes.status, 200);

    // Consuming second time fails (single use)
    const secondRes = await makeRequest(
      'GET',
      `/api/bom/download/${ticketId}`,
      null,
      {
        Authorization: `Bearer ${userAToken}`
      }
    );
    assert.strictEqual(secondRes.status, 404);
  });
});
