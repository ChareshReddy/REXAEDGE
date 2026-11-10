import assert from 'assert';
import {
  setActiveRfcServer,
  getActiveRfcServer,
  getRfcConnectionParams,
  openRfcClient
} from '../services/sapRfcClient.js';
import { bomJobManager } from '../services/bomJobManager.js';

async function runConcurrencyIsolationTests() {
  console.log('\n======================================================');
  console.log('  TEST: SERVER CONCURRENCY ISOLATION & MULTI-USER SAFETY');
  console.log('======================================================\n');

  const serverA = {
    id: 'server-a-id',
    name: 'Server Alpha',
    ashost: '10.0.0.1',
    sysnr: '00',
    client: '100',
    sap_username: 'USER_ALPHA',
    sap_password: 'PassAlpha123!'
  };

  const serverB = {
    id: 'server-b-id',
    name: 'Server Beta',
    ashost: '10.0.0.2',
    sysnr: '01',
    client: '200',
    sap_username: 'USER_BETA',
    sap_password: 'PassBeta123!'
  };

  const serverC = {
    id: 'server-c-id',
    name: 'Server Gamma',
    ashost: '10.0.0.3',
    sysnr: '02',
    client: '300',
    sap_username: 'USER_GAMMA',
    sap_password: 'PassGamma123!'
  };

  class CapturingClient {
    constructor(params, options) {
      this.params = params;
      this.options = options;
    }
    async open() {}
    async call() { return {}; }
    async close() {}
  }

  // 1. Verify getActiveRfcServer() no longer holds a module-level global
  console.log('1. Testing removal of global currentActiveServer:');
  setActiveRfcServer(serverA);
  assert.strictEqual(
    getActiveRfcServer(),
    null,
    'getActiveRfcServer() must return null (global active server removed)'
  );
  assert.throws(
    () => getRfcConnectionParams({}),
    /No SAP credentials configured for this server/,
    'Calling getRfcConnectionParams without explicit server context must throw rather than falling back to global state'
  );
  console.log('   ✓ Global active server state successfully removed; empty context throws cleanly');

  // 2. Interleaved 2-request test
  console.log('\n2. Testing 2 interleaved requests targeting Server A and Server B:');
  async function handleReq1() {
    await new Promise((r) => setTimeout(r, 40));
    const client = await openRfcClient({ server: serverA }, CapturingClient);
    return client.params;
  }
  async function handleReq2() {
    await new Promise((r) => setTimeout(r, 10));
    const client = await openRfcClient({ server: serverB }, CapturingClient);
    return client.params;
  }

  const [p1, p2] = await Promise.all([handleReq1(), handleReq2()]);
  assert.strictEqual(p1.ashost, '10.0.0.1', 'Request 1 must resolve to Server A host');
  assert.strictEqual(p1.user, 'USER_ALPHA', 'Request 1 must resolve to Server A username');
  assert.strictEqual(p2.ashost, '10.0.0.2', 'Request 2 must resolve to Server B host');
  assert.strictEqual(p2.user, 'USER_BETA', 'Request 2 must resolve to Server B username');
  console.log('   ✓ Overlapping requests strictly isolated to their own server credentials');

  // 3. 20 interleaved requests across 3 servers (Server A, Server B, Server C)
  console.log('\n3. Testing 20 randomized interleaved requests across 3 SAP servers:');
  const serverPool = [serverA, serverB, serverC];
  const promises = [];

  for (let i = 0; i < 20; i++) {
    const target = serverPool[i % serverPool.length];
    const delay = Math.floor(Math.random() * 50);
    promises.push(
      (async () => {
        await new Promise((r) => setTimeout(r, delay));
        const client = await openRfcClient({ server: target }, CapturingClient);
        assert.strictEqual(
          client.params.ashost,
          target.ashost,
          `Request ${i} expected host ${target.ashost} but got ${client.params.ashost}`
        );
        assert.strictEqual(
          client.params.user,
          target.sap_username,
          `Request ${i} expected user ${target.sap_username} but got ${client.params.user}`
        );
        return { index: i, host: client.params.ashost };
      })()
    );
  }

  const multiResults = await Promise.all(promises);
  assert.strictEqual(multiResults.length, 20);
  console.log(`   ✓ All 20 interleaved requests routed to exact corresponding server hosts without cross-talk`);

  // 4. Test User Isolation on Job Summaries and Results
  console.log('\n4. Testing multi-user job isolation (User A vs User B job summaries):');
  const userA = { id: 'usr-101', email: 'alice@company.com', role: 'user' };
  const userB = { id: 'usr-102', email: 'bob@company.com', role: 'user' };

  const jobA = bomJobManager.startJob({
    type: 'create_bulk',
    user: userA,
    server: serverA,
    items: [
      { sequenceNum: '1', material: 'ALICE-MAT-1', plant: '1000' }
    ]
  });

  const jobB = bomJobManager.startJob({
    type: 'copy_bulk',
    user: userB,
    server: serverA,
    items: [
      { sequenceNum: '1', material: 'BOB-MAT-1', plant: '1000' }
    ]
  });

  // Verify Alice can fetch her job, but Bob cannot fetch Alice's job
  const aliceView = bomJobManager.getJob(jobA.jobId, userA);
  assert.strictEqual(aliceView.jobId, jobA.jobId);
  assert.strictEqual(aliceView.userId, userA.id);

  assert.throws(
    () => bomJobManager.getJob(jobA.jobId, userB),
    /Forbidden/,
    'Bob must be forbidden from accessing Alice\'s job summary'
  );

  const bobView = bomJobManager.getJob(jobB.jobId, userB);
  assert.strictEqual(bobView.jobId, jobB.jobId);
  assert.strictEqual(bobView.userId, userB.id);

  assert.throws(
    () => bomJobManager.getJob(jobB.jobId, userA),
    /Forbidden/,
    'Alice must be forbidden from accessing Bob\'s job summary'
  );

  console.log('   ✓ User job summaries are strictly isolated per user (cross-user access returns 403 Forbidden)');

  console.log('\n======================================================');
  console.log('✅ ALL SERVER CONCURRENCY ISOLATION TESTS PASSED!');
  console.log('======================================================\n');
}

runConcurrencyIsolationTests().catch((err) => {
  console.error('\nTest Failed:', err);
  process.exit(1);
});
