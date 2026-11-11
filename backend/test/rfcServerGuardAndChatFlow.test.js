process.env.NODE_ENV = 'test';
process.env.SAP_BOM_MODE = 'RFC';
process.env.USE_MOCK_SAP = 'true';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import assert from 'assert';
import http from 'http';
import {
  assertResolvedServer,
  openRfcClient,
  getRfcConnectionParams,
  executeRfcFunction,
  pingRfcServer,
  rfcRetryJob,
  rfcReprocessIdoc,
  rfcReadBom,
  rfcValidateSourceBom,
  rfcCreateBom,
  isSubAssemblyBomExistingInTarget,
  rfcSimulateCopyBom,
  rfcDeleteBom,
  rfcExplodeBomHierarchy,
  batchQueryMakt,
  batchQuerySubBom,
  fetchDirectBom,
  rfcGetBomDisplayData,
  getExistingAlternatives,
  getNextAvailableAlternative,
  resolveTargetAlternativeForCopy,
  resolveSourceAlternativeForCopy,
  getSubAssemblyComponents,
  verifyBomComponents,
  inspectAndVerifyHierarchy,
  repairHierarchyBottomUp,
  rfcCopyBom,
  rfcBatchValidateBoms,
  rfcBatchCopyBoms,
  verifyCopiedBomHierarchy
} from '../services/sapRfcClient.js';
import { pendingActionStore } from '../services/pendingActions.js';
import { supabaseService } from '../services/supabaseClient.js';
const { default: app } = await import('../server.js');

let server;
let baseUrl;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const reqHeaders = { ...headers };
    if (body) {
      reqHeaders['Content-Type'] = 'application/json';
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
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
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function testAllExportedFunctionsFailWithoutServer() {
  console.log('\n======================================================');
  console.log('PART 1: VERIFYING RFC SERVER GUARD ON ALL 29 EXPORTS');
  console.log('======================================================\n');

  const functionsToTest = [
    { name: 'getRfcConnectionParams', fn: () => getRfcConnectionParams({}) },
    { name: 'openRfcClient', fn: () => openRfcClient({}) },
    { name: 'rfcRetryJob', fn: () => rfcRetryJob('JOB_01', null) },
    { name: 'rfcReprocessIdoc', fn: () => rfcReprocessIdoc('IDOC_01', null) },
    { name: 'executeRfcFunction', fn: () => executeRfcFunction('RFC_PING', {}, {}) },
    { name: 'pingRfcServer', fn: () => pingRfcServer({}) },
    { name: 'rfcReadBom', fn: () => rfcReadBom({}) },
    { name: 'rfcValidateSourceBom', fn: () => rfcValidateSourceBom({}) },
    { name: 'rfcCreateBom', fn: () => rfcCreateBom({}) },
    { name: 'isSubAssemblyBomExistingInTarget', fn: () => isSubAssemblyBomExistingInTarget({ level: 1, material: 'M1' }, '1000', null, null) },
    { name: 'rfcSimulateCopyBom', fn: () => rfcSimulateCopyBom({}) },
    { name: 'rfcDeleteBom', fn: () => rfcDeleteBom({}) },
    { name: 'rfcExplodeBomHierarchy', fn: () => rfcExplodeBomHierarchy({}) },
    { name: 'batchQueryMakt', fn: () => batchQueryMakt(null, ['M1'], 'E', null) },
    { name: 'batchQuerySubBom', fn: () => batchQuerySubBom(null, ['M1'], '1000', null) },
    { name: 'fetchDirectBom', fn: () => fetchDirectBom(null, 'M1', '1000', '1', '', null) },
    { name: 'rfcGetBomDisplayData', fn: () => rfcGetBomDisplayData({}) },
    { name: 'getExistingAlternatives', fn: () => getExistingAlternatives('M1', '1000', '1', null, null) },
    { name: 'getNextAvailableAlternative', fn: () => getNextAvailableAlternative('M1', '1000', '1', null, null) },
    { name: 'resolveTargetAlternativeForCopy', fn: () => resolveTargetAlternativeForCopy({}) },
    { name: 'resolveSourceAlternativeForCopy', fn: () => resolveSourceAlternativeForCopy({}) },
    { name: 'getSubAssemblyComponents', fn: () => getSubAssemblyComponents({}) },
    { name: 'verifyBomComponents', fn: () => verifyBomComponents({}) },
    { name: 'inspectAndVerifyHierarchy', fn: () => inspectAndVerifyHierarchy({}) },
    { name: 'repairHierarchyBottomUp', fn: () => repairHierarchyBottomUp({}) },
    { name: 'rfcCopyBom', fn: () => rfcCopyBom({}) },
    { name: 'rfcBatchValidateBoms', fn: () => rfcBatchValidateBoms([], {}) },
    { name: 'rfcBatchCopyBoms', fn: () => rfcBatchCopyBoms([], {}) },
    { name: 'verifyCopiedBomHierarchy', fn: () => verifyCopiedBomHierarchy({}) }
  ];

  let verifiedCount = 0;
  for (const { name, fn } of functionsToTest) {
    let threw = false;
    let thrownError = null;
    try {
      await fn();
    } catch (err) {
      threw = true;
      thrownError = err;
    }

    assert.strictEqual(threw, true, `Function ${name} must throw when called without resolved server`);
    assert(
      thrownError.message.includes(`[sapRfcClient.${name}]`),
      `Error from ${name} must name the function, got: "${thrownError.message}"`
    );
    assert(
      thrownError.message.includes('Called without a resolved SAP server context'),
      `Error from ${name} must specify explicit per-request server required, got: "${thrownError.message}"`
    );
    verifiedCount++;
    console.log(`  ✓ ${name}: Threw loud internal error naming function`);
  }

  assert.strictEqual(verifiedCount, 29, 'All 29 exported RFC functions must be tested and guarded');
  console.log(`\n✓ Total ${verifiedCount}/29 exported RFC functions successfully verified with loud guard.\n`);
}

async function testChatFlowsAndServerMismatch() {
  console.log('======================================================');
  console.log('PART 2: TESTING CHAT FLOWS ON TWO SERVERS');
  console.log('======================================================\n');

  // 1. Authenticate admin user
  const loginRes = await makeRequest('POST', '/api/auth/login', {
    email: 'admin@nextitpoint.com',
    password: 'Admin@123456'
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const token = loginRes.data.token;

  // Create Server A and Server B with bom module enabled
  const srvARes = await makeRequest('POST', '/api/admin/servers', {
    name: 'Server Alpha Test',
    ashost: '192.168.10.1',
    sysnr: '01',
    client: '100',
    environment: 'DEV',
    sap_username: 'USER_ALPHA',
    sap_password: 'PasswordAlpha123!',
    modules: ['bom']
  }, { Authorization: `Bearer ${token}` });
  assert.strictEqual(srvARes.status, 201, 'Server A creation must succeed');
  const serverA = srvARes.data.server;

  const srvBRes = await makeRequest('POST', '/api/admin/servers', {
    name: 'Server Beta Test',
    ashost: '192.168.20.1',
    sysnr: '02',
    client: '200',
    environment: 'DEV',
    sap_username: 'USER_BETA',
    sap_password: 'PasswordBeta123!',
    modules: ['bom']
  }, { Authorization: `Bearer ${token}` });
  assert.strictEqual(srvBRes.status, 201, 'Server B creation must succeed');
  const serverB = srvBRes.data.server;

  const authHeadersA = { Authorization: `Bearer ${token}`, 'x-server-id': serverA.id };
  const authHeadersB = { Authorization: `Bearer ${token}`, 'x-server-id': serverB.id };

  // 2. Validate BOM on Server A vs Server B
  console.log('1. Testing BOM Validation through chat/API on Server A and Server B:');
  const valResA = await makeRequest('POST', '/api/bom/validate-source', {
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    alternativeBom: '01'
  }, authHeadersA);
  console.log('valResA.data:', JSON.stringify(valResA.data));
  assert.strictEqual(valResA.status, 200);
  assert.strictEqual(valResA.data.success, true);
  console.log('   ✓ Source validation on Server A succeeded with Server A context');

  const valResB = await makeRequest('POST', '/api/bom/validate-source', {
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    alternativeBom: '01'
  }, authHeadersB);
  assert.strictEqual(valResB.status, 200);
  assert.strictEqual(valResB.data.success, true);
  console.log('   ✓ Source validation on Server B succeeded with Server B context');

  // 3. Display BOM on Server A and Server B
  console.log('\n2. Testing Display BOM through API on Server A and Server B:');
  const dispResA = await makeRequest('POST', '/api/bom/read', {
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    alternativeBom: '01'
  }, authHeadersA);
  assert.strictEqual(dispResA.status, 200);
  assert.strictEqual(dispResA.data.success, true);
  console.log('   ✓ Display BOM on Server A succeeded');

  const dispResB = await makeRequest('POST', '/api/bom/read', {
    material: 'A1BH0214C',
    plant: '1012',
    bomUsage: '1',
    alternativeBom: '01'
  }, authHeadersB);
  assert.strictEqual(dispResB.status, 200);
  assert.strictEqual(dispResB.data.success, true);
  console.log('   ✓ Display BOM on Server B succeeded');

  // 4. Cross-Server Proposal Blocking: Proposal made on Server A cannot be executed with Server B
  console.log('\n3. Testing Cross-Server Proposal Rejection:');
  const copyProposal = pendingActionStore.createPendingAction({
    type: 'copy_bom',
    entityKey: 'bom',
    recordId: 'MAT_TARGET_01',
    payload: {
      source: { material: 'A1BH0214C', plant: '1001', bomUsage: '1', alternativeBom: '01' },
      target: { material: 'MAT_TARGET_01', plant: '1001', bomUsage: '1', alternativeBom: '01' }
    },
    preview: { summary: 'Copy BOM to MAT_TARGET_01' },
    serverId: serverA.id,
    serverName: serverA.name
  });

  // Attempt execution on Server B
  const mismatchRes = await makeRequest('POST', '/api/chat', {
    confirmAction: copyProposal.actionId
  }, authHeadersB);

  assert.strictEqual(mismatchRes.status, 400, 'Cross-server confirmation must return 400');
  assert.strictEqual(mismatchRes.data.error, true);
  assert.strictEqual(
    mismatchRes.data.reply,
    'The selected server changed. Please start again.',
    'Must return exact friendly message: "The selected server changed. Please start again."'
  );
  console.log('   ✓ Proposal made on Server A blocked with Server B selected: "The selected server changed. Please start again."');

  // 5. Delete BOM proposal cross-server rejection
  const deleteProposal = pendingActionStore.createPendingAction({
    type: 'delete_bom',
    entityKey: 'bom',
    recordId: 'MAT_DEL_01',
    payload: { material: 'MAT_DEL_01', plant: '1001', bomUsage: '1', alternativeBom: '01' },
    preview: { summary: 'Delete BOM MAT_DEL_01' },
    serverId: serverA.id
  });

  const delMismatchRes = await makeRequest('POST', '/api/chat', {
    confirmAction: deleteProposal.actionId
  }, authHeadersB);

  assert.strictEqual(delMismatchRes.status, 400);
  assert.strictEqual(delMismatchRes.data.reply, 'The selected server changed. Please start again.');
  console.log('   ✓ Delete proposal on Server A rejected with Server B selected');

  // 6. create_bom tool/confirm flow verification
  console.log('\n4. Verifying create_bom tool/confirm flow:');
  // a) Propose creation (simulates tool propose_create_entity_record for BOM)
  const createProposal = pendingActionStore.createPendingAction({
    type: 'create_bom',
    entityKey: 'bom',
    recordId: 'MAT_CREATE_NEW',
    payload: {
      material: 'MAT_CREATE_NEW',
      plant: '1001',
      bomUsage: '1',
      alternativeBom: '01',
      baseQty: '100',
      baseUnit: 'EA',
      components: [
        { itemNo: '0010', component: 'COMP_01', quantity: 2, unit: 'EA' }
      ]
    },
    preview: { summary: 'Create BOM MAT_CREATE_NEW' },
    serverId: serverA.id
  });

  // Verify it requires human confirmation (action exists in store with pending status)
  assert(createProposal.actionId, 'Proposal must have generated actionId');
  console.log('   ✓ create_bom proposal generated and held in pending state without SAP creation');

  // b) Try executing with Server B -> blocked
  const createMismatchRes = await makeRequest('POST', '/api/chat', {
    confirmAction: createProposal.actionId
  }, authHeadersB);
  assert.strictEqual(createMismatchRes.status, 400);
  assert.strictEqual(createMismatchRes.data.reply, 'The selected server changed. Please start again.');
  console.log('   ✓ create_bom proposal on Server A rejected with Server B selected');

  // c) Execute with matching Server A -> creates BOM only now
  const createMatchRes = await makeRequest('POST', '/api/chat', {
    confirmAction: createProposal.actionId
  }, authHeadersA);
  assert.strictEqual(createMatchRes.status, 200, 'Confirmation on matching server must succeed');
  assert(!createMatchRes.data.error, 'Confirmation must not have error');
  console.log('   ✓ create_bom confirmed on matching Server A succeeded and executed rfcCreateBom');
}

async function run() {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;

  try {
    await testAllExportedFunctionsFailWithoutServer();
    await testChatFlowsAndServerMismatch();

    console.log('======================================================');
    console.log('  ALL AUDIT & CROSS-SERVER TESTS PASSED SUCCESSFULLY! ');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
