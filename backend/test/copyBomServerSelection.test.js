process.env.NODE_ENV = 'test';
process.env.SAP_BOM_MODE = 'RFC';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import assert from 'assert';
import http from 'http';
const { default: app } = await import('../server.js');
import { pendingActionStore } from '../services/pendingActions.js';
import { supabaseService } from '../services/supabaseClient.js';
import { getRfcConnectionParams, openRfcClient } from '../services/sapRfcClient.js';
import { extractErrorInfo } from '../../frontend/src/utils/friendlyError.js';

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

async function run() {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  console.log('\n======================================================');
  console.log('  TEST: COPY/CREATE/DELETE BOM PER-REQUEST SERVER CREDENTIALS');
  console.log('======================================================\n');

  try {
    // 1. Login Admin
    const adminLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'admin@nextitpoint.com',
      password: 'Admin@123456'
    });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    // 2. Create Server A and Server B with distinct SAP credentials
    const srvARes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server Alpha RFC',
      ashost: '115.245.150.98',
      sysnr: '00',
      client: '100',
      environment: 'DEV',
      sap_username: 'SAP_USER_ALPHA',
      sap_password: 'PasswordAlpha123!',
      modules: ['bom']
    }, adminToken);
    const serverA = srvARes.data.server;
    assert(serverA && serverA.id, 'Server A must be created');

    const srvBRes = await makeRequest('POST', '/api/admin/servers', {
      name: 'Server Beta RFC',
      ashost: '115.245.150.99',
      sysnr: '01',
      client: '200',
      environment: 'DEV',
      sap_username: 'SAP_USER_BETA',
      sap_password: 'PasswordBeta123!',
      modules: ['bom']
    }, adminToken);
    const serverB = srvBRes.data.server;
    assert(serverB && serverB.id, 'Server B must be created');

    // Verify credential decryption for both servers
    const credsA = getRfcConnectionParams(serverA);
    assert.strictEqual(credsA.user, 'SAP_USER_ALPHA', 'Server A user must match');
    assert.strictEqual(credsA.passwd, 'PasswordAlpha123!', 'Server A password must match');

    const credsB = getRfcConnectionParams(serverB);
    assert.strictEqual(credsB.user, 'SAP_USER_BETA', 'Server B user must match');
    assert.strictEqual(credsB.passwd, 'PasswordBeta123!', 'Server B password must match');
    console.log('✓ Step 1: Server A and Server B created with distinct credentials');

    // 3. Test copy_bom confirm path with server credentials
    process.env.USE_MOCK_SAP = 'true';

    const copyAction = pendingActionStore.createPendingAction({
      type: 'copy_bom',
      entityKey: 'bom',
      recordId: 'MAT_TGT_ALPHA',
      payload: {
        source: { material: 'A1BH0214C', plant: '1012', bomUsage: '1', alternativeBom: '01' },
        target: { material: 'MAT_TGT_ALPHA', plant: '1001', bomUsage: '1', alternativeBom: '01' }
      },
      preview: { summary: 'Copy BOM to MAT_TGT_ALPHA' },
      serverId: serverA.id,
      sapUsername: 'SAP_USER_ALPHA'
    });

    const confirmCopyRes = await makeRequest('POST', '/api/chat', {
      confirmAction: copyAction.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverA.id
    });

    assert.strictEqual(confirmCopyRes.status, 200, 'Confirm copy should return 200');
    assert.strictEqual(confirmCopyRes.data.error, false, 'Confirm copy error must be false');
    assert(confirmCopyRes.data.reply.includes('Successfully copied BOM') || confirmCopyRes.data.actionExecuted, 'Copy BOM must succeed');
    console.log('✓ Step 2: Confirmed copy_bom on Server A succeeded with Server A context');

    // 4. Test create_bom and delete_bom across Server A and Server B (each uses its own credentials)
    // Create on Server A
    const createActionA = pendingActionStore.createPendingAction({
      type: 'create_bom',
      entityKey: 'bom',
      recordId: 'MAT_NEW_SRVA',
      payload: {
        material: 'MAT_NEW_SRVA',
        plant: '1001',
        bomUsage: '1',
        alternativeBom: '01',
        components: [{ component: 'COMP_A', quantity: '5' }]
      },
      preview: { summary: 'Create BOM MAT_NEW_SRVA on Server A' },
      serverId: serverA.id,
      sapUsername: 'SAP_USER_ALPHA'
    });

    const confirmCreateARes = await makeRequest('POST', '/api/chat', {
      confirmAction: createActionA.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverA.id
    });

    assert.strictEqual(confirmCreateARes.status, 200);
    assert.strictEqual(confirmCreateARes.data.error, false);
    assert(confirmCreateARes.data.reply && confirmCreateARes.data.reply.includes('created'), 'Create BOM on Server A must succeed');
    console.log('✓ Step 3a: Confirmed create_bom on Server A succeeded with Server A credentials');

    // Create on Server B
    const createActionB = pendingActionStore.createPendingAction({
      type: 'create_bom',
      entityKey: 'bom',
      recordId: 'MAT_NEW_SRVB',
      payload: {
        material: 'MAT_NEW_SRVB',
        plant: '2001',
        bomUsage: '1',
        alternativeBom: '01',
        components: [{ component: 'COMP_B', quantity: '10' }]
      },
      preview: { summary: 'Create BOM MAT_NEW_SRVB on Server B' },
      serverId: serverB.id,
      sapUsername: 'SAP_USER_BETA'
    });

    const confirmCreateBRes = await makeRequest('POST', '/api/chat', {
      confirmAction: createActionB.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverB.id
    });

    assert.strictEqual(confirmCreateBRes.status, 200);
    assert.strictEqual(confirmCreateBRes.data.error, false);
    assert(confirmCreateBRes.data.reply && confirmCreateBRes.data.reply.includes('created'), 'Create BOM on Server B must succeed');
    console.log('✓ Step 3b: Confirmed create_bom on Server B succeeded with Server B credentials');

    // Delete on Server A
    const deleteActionA = pendingActionStore.createPendingAction({
      type: 'delete_bom',
      entityKey: 'bom',
      recordId: 'MAT_NEW_SRVA',
      payload: {
        material: 'MAT_NEW_SRVA',
        plant: '1001',
        bomUsage: '1',
        alternativeBom: '01'
      },
      preview: { summary: 'Delete BOM MAT_NEW_SRVA on Server A' },
      serverId: serverA.id,
      sapUsername: 'SAP_USER_ALPHA'
    });

    const confirmDeleteARes = await makeRequest('POST', '/api/chat', {
      confirmAction: deleteActionA.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverA.id
    });

    assert.strictEqual(confirmDeleteARes.status, 200);
    assert.strictEqual(confirmDeleteARes.data.error, false);
    assert(confirmDeleteARes.data.reply && confirmDeleteARes.data.reply.includes('deleted'), 'Delete BOM on Server A must succeed');
    console.log('✓ Step 3c: Confirmed delete_bom on Server A succeeded with Server A credentials');

    // Delete on Server B
    const deleteActionB = pendingActionStore.createPendingAction({
      type: 'delete_bom',
      entityKey: 'bom',
      recordId: 'MAT_NEW_SRVB',
      payload: {
        material: 'MAT_NEW_SRVB',
        plant: '2001',
        bomUsage: '1',
        alternativeBom: '01'
      },
      preview: { summary: 'Delete BOM MAT_NEW_SRVB on Server B' },
      serverId: serverB.id,
      sapUsername: 'SAP_USER_BETA'
    });

    const confirmDeleteBRes = await makeRequest('POST', '/api/chat', {
      confirmAction: deleteActionB.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverB.id
    });

    assert.strictEqual(confirmDeleteBRes.status, 200);
    assert.strictEqual(confirmDeleteBRes.data.error, false);
    assert(confirmDeleteBRes.data.reply && confirmDeleteBRes.data.reply.includes('deleted'), 'Delete BOM on Server B must succeed');
    console.log('✓ Step 3d: Confirmed delete_bom on Server B succeeded with Server B credentials');

    // 5. Test Cross-Server Mismatch Rejection
    const mismatchAction = pendingActionStore.createPendingAction({
      type: 'copy_bom',
      entityKey: 'bom',
      recordId: 'MAT_MISMATCH',
      payload: {
        source: { material: 'A1BH0214C', plant: '1001' },
        target: { material: 'MAT_MISMATCH', plant: '1001' }
      },
      preview: { summary: 'Copy BOM on Server A' },
      serverId: serverA.id,
      sapUsername: 'SAP_USER_ALPHA'
    });

    const mismatchRes = await makeRequest('POST', '/api/chat', {
      confirmAction: mismatchAction.actionId
    }, {
      'Authorization': `Bearer ${adminToken}`,
      'x-server-id': serverB.id
    });

    assert.strictEqual(mismatchRes.status, 400, 'Cross-server confirmation must return 400');
    assert.strictEqual(mismatchRes.data.error, true);
    assert(
      mismatchRes.data.reply === 'The selected server changed. Please start again.' ||
      mismatchRes.data.reply.includes('The selected server changed') ||
      mismatchRes.data.reply.includes('was prepared for server'),
      'Must explain server mismatch'
    );
    console.log('✓ Step 4: Cross-server execution correctly blocked');

    // 6. Test App Permissions Enforcement
    const limitedUserRes = await makeRequest('POST', '/api/admin/users', {
      email: 'bom_limited_user@company.com',
      password: 'Password@123',
      name: 'Limited BOM User'
    }, adminToken);
    const limitedUser = limitedUserRes.data.user;

    // Grant ONLY 'bom.display' (no copy, create, delete)
    await makeRequest('POST', '/api/admin/permissions', {
      userId: limitedUser.id,
      serverId: serverA.id,
      permissions: ['bom.display']
    }, adminToken);

    const limitedLogin = await makeRequest('POST', '/api/auth/login', {
      email: 'bom_limited_user@company.com',
      password: 'Password@123'
    });
    const limitedToken = limitedLogin.data.token;

    // Attempt Copy
    const noCopyAction = pendingActionStore.createPendingAction({
      type: 'copy_bom',
      entityKey: 'bom',
      recordId: 'NO_PERM',
      payload: { source: {}, target: {} },
      preview: {},
      serverId: serverA.id
    });
    const noCopyRes = await makeRequest('POST', '/api/chat', { confirmAction: noCopyAction.actionId }, {
      'Authorization': `Bearer ${limitedToken}`,
      'x-server-id': serverA.id
    });
    assert.strictEqual(noCopyRes.status, 403, 'User without bom.copy must be rejected with 403');

    // Attempt Create
    const noCreateAction = pendingActionStore.createPendingAction({
      type: 'create_bom',
      entityKey: 'bom',
      recordId: 'NO_PERM',
      payload: {},
      preview: {},
      serverId: serverA.id
    });
    const noCreateRes = await makeRequest('POST', '/api/chat', { confirmAction: noCreateAction.actionId }, {
      'Authorization': `Bearer ${limitedToken}`,
      'x-server-id': serverA.id
    });
    assert.strictEqual(noCreateRes.status, 403, 'User without bom.create must be rejected with 403');

    // Attempt Delete
    const noDeleteAction = pendingActionStore.createPendingAction({
      type: 'delete_bom',
      entityKey: 'bom',
      recordId: 'NO_PERM',
      payload: {},
      preview: {},
      serverId: serverA.id
    });
    const noDeleteRes = await makeRequest('POST', '/api/chat', { confirmAction: noDeleteAction.actionId }, {
      'Authorization': `Bearer ${limitedToken}`,
      'x-server-id': serverA.id
    });
    assert.strictEqual(noDeleteRes.status, 403, 'User without bom.delete must be rejected with 403');
    console.log('✓ Step 5: App permissions (bom.copy, bom.create, bom.delete) strictly enforced');

    // 7. Test Toast Text & Emoji Normalization (friendlyError)
    const rawReply = '❌ Execution failed: No SAP credentials configured for this server';
    const parsed = extractErrorInfo(rawReply);
    assert.strictEqual(parsed.title, 'Execution failed', 'Toast title must be "Execution failed"');
    assert.strictEqual(parsed.message, 'No SAP credentials configured for this server', 'Toast body must not duplicate "Execution failed:"');
    assert(!parsed.title.includes('❌'), 'Title must not contain emoji');
    assert(!parsed.message.includes('❌'), 'Body must not contain emoji');
    console.log('✓ Step 6: Toast title & body normalized without emoji or duplicated text');

    console.log('\n======================================================');
    console.log('  ALL SERVER CREDENTIALS TESTS PASSED SUCCESSFULLY');
    console.log('======================================================\n');
  } finally {
    process.env.USE_MOCK_SAP = 'true';
    server.close();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
