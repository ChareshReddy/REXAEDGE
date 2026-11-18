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
import { bomLockService } from '../services/bomLockService.js';
import { rfcCreateBom, rfcReadBom } from '../services/sapRfcClient.js';

const { default: app } = await import('../server.js');

let server;
let baseUrl;

async function makeRequest(method, path, body = null, headers = {}) {
  const url = new URL(path, baseUrl);
  const reqHeaders = { ...headers };
  if (body) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined
  });

  let parsed;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    parsed = text;
  }

  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body: parsed };
}

const userAToken = 'session-user-a-change-bom';
const userBToken = 'session-user-b-change-bom';

const userA = {
  id: 'usr-a-change-1',
  email: 'usera@rexaedge.com',
  role: 'user',
  is_active: true
};

const userB = {
  id: 'usr-b-change-2',
  email: 'userb@rexaedge.com',
  role: 'user',
  is_active: true
};

const serverA = {
  id: 'srv-user-a-change',
  name: 'SAP User A Change Server',
  ashost: '103.206.249.51',
  sysnr: '00',
  client: '100',
  environment: 'DEV',
  owner_id: userA.id,
  is_active: true,
  is_disabled: false,
  is_default: true,
  modules: ['bom']
};

const serverB = {
  id: 'srv-user-b-change',
  name: 'SAP User B Change Server',
  ashost: '103.206.249.51',
  sysnr: '00',
  client: '100',
  environment: 'DEV',
  owner_id: userB.id,
  is_active: true,
  is_disabled: false,
  is_default: true,
  modules: ['bom']
};

test.before(async () => {
  inMemorySupabase.users = [userA, userB];
  inMemorySupabase.sessions.set(userAToken, { user: userA });
  inMemorySupabase.sessions.set(userBToken, { user: userB });
  inMemorySupabase.servers = [serverA, serverB];
  inMemorySupabase.allowlist = [
    { id: 'al-1', pattern: '103.206.249.51', type: 'Development', comment: 'Dev SAP' }
  ];

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
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

test('Stage 1: Change BOM (CS02) Backend Test Suite', async (t) => {
  const testMaterial = 'MAT-CHG-001';
  const testPlant = '1000';
  const testUsage = '1';
  const testAlt = '01';

  // Seed an existing BOM for this material
  await rfcCreateBom({
    material: testMaterial,
    plant: testPlant,
    bomUsage: testUsage,
    alternativeBom: testAlt,
    baseQty: '100',
    baseUnit: 'EA',
    bomStatus: '01',
    altText: 'Original Header Text',
    components: [
      { itemNo: '0010', component: 'RAW-01', quantity: 10, unit: 'EA', itemCategory: 'L' },
      { itemNo: '0020', component: 'RAW-02', quantity: 20, unit: 'KG', itemCategory: 'L' }
    ]
  });

  // Verify initial read
  const initialRead = await rfcReadBom({
    material: testMaterial,
    plant: testPlant,
    bomUsage: testUsage,
    alternativeBom: testAlt
  });
  assert.equal(initialRead.success, true);
  assert.equal(initialRead.components.length, 2);

  const raw01Node = initialRead.components[0].itemNode;
  const raw02Node = initialRead.components[1].itemNode;
  assert.ok(raw01Node, 'Item node must be present on first component');

  await t.test('1. Header change: modifies base quantity, status, and header text', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: {
          baseQty: '250',
          bomStatus: '02',
          headerText: 'Updated Header Text V2'
        }
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.header.baseQty, '250');
    assert.equal(res.body.header.bomStatus, '02');
    assert.equal(res.body.header.headerText, 'Updated Header Text V2');
  });

  await t.test('2. Item change: updates quantity, unit, storage location, and text via itemNode', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        items: [
          {
            changeType: 'CHANGE',
            itemNode: raw01Node,
            item: '0010',
            component: 'RAW-01',
            quantity: 55,
            unit: 'EA',
            storageLocation: '1001',
            itemText: 'Updated packaging requirement'
          }
        ]
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const updatedComp = res.body.components.find((c) => c.itemNode === raw01Node);
    assert.ok(updatedComp);
    assert.equal(updatedComp.quantity, 55);
    assert.equal(updatedComp.storageLocation, '1001');
    assert.equal(updatedComp.itemText, 'Updated packaging requirement');
  });

  await t.test('3. Add item: appends new item with itemCategory L and auto POSNR', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        items: [
          {
            changeType: 'ADD',
            component: 'RAW-03',
            quantity: 15,
            unit: 'M',
            itemCategory: 'L',
            storageLocation: '1002',
            itemText: 'New component wire'
          }
        ]
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.components.length, 3);
    const addedComp = res.body.components.find((c) => c.component === 'RAW-03');
    assert.ok(addedComp);
    assert.equal(addedComp.itemCategory, 'L');
    assert.equal(addedComp.quantity, 15);
  });

  await t.test('4. Delete item: removes item identified by itemNode', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        items: [
          {
            changeType: 'DELETE',
            itemNode: raw02Node,
            item: '0020',
            component: 'RAW-02'
          }
        ]
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const deletedComp = res.body.components.find((c) => c.itemNode === raw02Node);
    assert.equal(deletedComp, undefined, 'Deleted item must not exist in active components');
  });

  await t.test('5. No-change rejected: returns 400 NO_CHANGES when payload is empty', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'NO_CHANGES');
  });

  await t.test('6. BOM_LOCKED: returns lock rejection when lock is held by another user/process', async () => {
    // Acquire the lock in background
    const held = bomLockService.acquireLock({
      server: serverA,
      serverId: serverA.id,
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternative: testAlt,
      userId: 'other-user-holder'
    });
    assert.ok(held, 'Lock must be acquired');

    try {
      const res = await makeRequest(
        'POST',
        '/api/bom/change',
        {
          material: testMaterial,
          plant: testPlant,
          bomUsage: testUsage,
          alternativeBom: testAlt,
          header: { baseQty: '300' }
        },
        {
          Authorization: `Bearer ${userAToken}`,
          'x-sap-server-id': serverA.id
        }
      );

      assert.equal(res.status, 409);
      assert.ok(res.body.code === 'BOM_LOCKED' || res.body.error.includes('locked'));
    } finally {
      held.release();
    }
  });

  await t.test('7. Invalid component: returns 400 VALIDATION_ERROR on <= 0 quantity or invalid component name', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        items: [
          {
            changeType: 'ADD',
            component: 'BAD_INVALID_MAT',
            quantity: -5
          }
        ]
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'VALIDATION_ERROR');
    assert.ok(res.body.errors.length >= 1);
  });

  await t.test('8. WRITE_OUTCOME_UNKNOWN verify path: returns 202 and indicates re-read required', async () => {
    // Seed material for simulation
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '999' },
        simulateOutcomeUnknown: true
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 202);
    assert.equal(res.body.code, 'WRITE_OUTCOME_UNKNOWN');
    assert.equal(res.body.verifyRequired, true);
  });

  await t.test('9. IDOR: user B server accessed with user A token returns 404', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '500' }
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverB.id // User B's server!
      }
    );

    assert.equal(res.status, 404);
    assert.ok(res.body.error.includes('Server not found') || res.body.code === 'SERVER_NOT_FOUND');
  });
});
