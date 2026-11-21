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
import { rfcCreateBom, rfcReadBom, rfcChangeBom, getBomChangeFunctionName, getSapUserDefaults, rfcGetBomAlternatives, clearBomAlternativesCache, getBomAlternativesCache } from '../services/sapRfcClient.js';
import { CS02_BATCH_CONFIG, buildCs02BdcData, validateChangeItems, formatSapQuantity, formatSapDate } from '../config/cs02BatchConfig.js';
import { toFriendlyError } from '../utils/friendlyError.js';
import { DefaultMockRfcClient } from '../services/sapConnectionPool.js';

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
    ],
    server: serverA
  });

  // Verify initial read
  const initialRead = await rfcReadBom({
    material: testMaterial,
    plant: testPlant,
    bomUsage: testUsage,
    alternativeBom: testAlt,
    server: serverA
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

  await t.test('9b. Missing x-sap-server-id header: never uses body serverId and returns 404 SERVER_NOT_FOUND', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '500' },
        serverId: serverA.id // Present in body, but header is absent
      },
      {
        Authorization: `Bearer ${userAToken}`
        // x-sap-server-id omitted
      }
    );

    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'SERVER_NOT_FOUND');
  });

  await t.test('9c. Server context mismatch: differing body serverId and header returns 400 SERVER_CONTEXT_MISMATCH', async () => {
    const res = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '500' },
        serverId: '00000000-0000-0000-0000-000000000999' // Differs from header!
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'SERVER_CONTEXT_MISMATCH');
    assert.ok(res.body.error.includes('Server ID in request body does not match'));
  });

  await t.test('10. SAP_BOM_CHANGE_FUNCTION: defaults to CS02 batch input when env var is unset', async () => {
    const origEnv = process.env.SAP_BOM_CHANGE_FUNCTION;
    delete process.env.SAP_BOM_CHANGE_FUNCTION;

    assert.equal(getBomChangeFunctionName(), 'CS02');

    let invokedFm = null;
    let bdcPayload = null;

    const mockClient = {
      call: async (fm, payload) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          invokedFm = fm;
          bdcPayload = payload;
          return {
            SUBRC: 0,
            L_ERRORS: [
              { MSGID: '29', MSGNR: '024', MSGTYP: 'S', MSGTXT: 'BOM changed' }
            ]
          };
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '150' },
      client: mockClient,
      server: serverA
    });

    assert.equal(invokedFm, 'RFC_CALL_TRANSACTION_USING');
    assert.ok(bdcPayload, 'RFC_CALL_TRANSACTION_USING payload must be present');
    assert.equal(bdcPayload.TCODE, 'CS02');
    assert.equal(bdcPayload.MODE, 'N');
    assert.equal(bdcPayload.UPDATE, undefined, 'UPDATE parameter must NOT be passed to RFC_CALL_TRANSACTION_USING');
    assert.ok(Array.isArray(bdcPayload.BT_DATA), 'BT_DATA must be an array');
    assert.equal(res.success, true);

    if (origEnv !== undefined) {
      process.env.SAP_BOM_CHANGE_FUNCTION = origEnv;
    }
  });

  await t.test('11. SAP_BOM_CHANGE_FUNCTION: uses custom Z wrapper with SAME parameters & commit like Create', async () => {
    const origEnv = process.env.SAP_BOM_CHANGE_FUNCTION;
    process.env.SAP_BOM_CHANGE_FUNCTION = 'Z_RFC_BOM_MAINTAIN';

    assert.equal(getBomChangeFunctionName(), 'Z_RFC_BOM_MAINTAIN');

    let invokedFm = null;
    let commitCalled = false;
    let maintainPayload = null;

    const mockClient = {
      call: async (fm, payload) => {
        if (fm === 'Z_RFC_BOM_MAINTAIN') {
          invokedFm = fm;
          maintainPayload = payload;
          return {};
        }
        if (fm === 'BAPI_TRANSACTION_COMMIT') {
          commitCalled = true;
          return {};
        }
        if (fm === 'RFC_READ_TABLE') {
          return { FIELDS: [{ FIELDNAME: 'STLAL' }], DATA: [] };
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { headerText: 'Z Wrapper Header' },
      items: [{ item: '0010', component: 'RAW-01', quantity: 15, unit: 'EA', itemCategory: 'L' }],
      client: mockClient,
      server: serverA
    });

    assert.equal(invokedFm, 'Z_RFC_BOM_MAINTAIN');
    assert.equal(commitCalled, true);
    assert.ok(maintainPayload, 'maintainPayload must be passed to Z wrapper');
    assert.equal(maintainPayload.I_STKO.BKTXT, 'Z Wrapper Header');
    assert.equal(maintainPayload.T_STPO[0].COMP_QTY, '15');

    if (origEnv !== undefined) {
      process.env.SAP_BOM_CHANGE_FUNCTION = origEnv;
    } else {
      delete process.env.SAP_BOM_CHANGE_FUNCTION;
    }
  });

  await t.test('12. Incompatible Call (Note 2295840): maps to friendly message without technical text', async () => {
    const origEnv = process.env.SAP_BOM_CHANGE_FUNCTION;
    process.env.SAP_BOM_CHANGE_FUNCTION = 'CSAP_MAT_BOM_MAINTAIN';

    const technicalSapErr = 'Incompatible Call Rejected, see note 2295840; Called Incompatible Function: CSAP_MAT_BOM_MAINTAIN';

    const mockClient = {
      call: async (fm) => {
        if (fm === 'CSAP_MAT_BOM_MAINTAIN') {
          throw new Error(technicalSapErr);
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { headerText: 'Trigger Incompatible Call' },
      client: mockClient,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'SAP_NOT_AVAILABLE');
    assert.equal(
      res.message,
      'Your SAP system does not allow Change BOM from RexaEdge yet. Ask your SAP team to enable it.'
    );
    assert.ok(!res.message.includes('2295840'), 'Technical note number must not appear in user message');
    assert.ok(!res.message.includes('CSAP_MAT_BOM_MAINTAIN'), 'Technical function name must not appear in user message');

    // Also verify toFriendlyError utility maps it identically
    const friendly = toFriendlyError(technicalSapErr);
    assert.equal(friendly.code, 'SAP_NOT_AVAILABLE');
    assert.equal(
      friendly.message,
      'Your SAP system does not allow Change BOM from RexaEdge yet. Ask your SAP team to enable it.'
    );
    assert.ok(!friendly.message.includes('2295840'));

    // Also verify simulated mock route returns the friendly message
    const apiRes = await makeRequest(
      'POST',
      '/api/bom/change',
      {
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '300' },
        simulateIncompatibleCall: true
      },
      {
        Authorization: `Bearer ${userAToken}`,
        'x-sap-server-id': serverA.id
      }
    );

    assert.equal(apiRes.status, 400);
    assert.equal(apiRes.body.code, 'SAP_NOT_AVAILABLE');
    assert.equal(
      apiRes.body.message,
      'Your SAP system does not allow Change BOM from RexaEdge yet. Ask your SAP team to enable it.'
    );

    if (origEnv !== undefined) {
      process.env.SAP_BOM_CHANGE_FUNCTION = origEnv;
    } else {
      delete process.env.SAP_BOM_CHANGE_FUNCTION;
    }
  });

  await t.test('13. CS02 BDC Builder: verifies exact screen sequence and positioning', async () => {
    const bdc = buildCs02BdcData({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '101' },
      items: [
        {
          changeType: 'CHANGE',
          item: '0010',
          component: 'RAW-01',
          quantity: 25,
          componentScrap: '5',
          fixedQuantity: true,
          itemText: 'Updated Text'
        },
        {
          changeType: 'ADD',
          item: '0030',
          component: 'RAW-03',
          quantity: 5,
          unit: 'KG',
          itemCategory: 'L'
        },
        {
          changeType: 'DELETE',
          item: '0020',
          component: 'RAW-02'
        }
      ]
    });

    assert.ok(Array.isArray(bdc), 'BDC data must be an array');

    // 1. Initial screen 0100
    const screen1 = bdc.find((b) => b.DYNPRO === '0100');
    assert.ok(screen1, 'Initial screen 0100 must be present');
    assert.equal(screen1.PROGRAM, 'SAPLCSDI');

    // 2. Header screen 2110 via =KALL and returns via /EBACK
    const headerOk = bdc.find((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=KALL');
    assert.ok(headerOk, 'Header open OK code =KALL must be present');
    const headerScreen = bdc.find((b) => b.DYNPRO === '2110');
    assert.ok(headerScreen, 'Header screen 2110 must be present');
    const baseQtyVal = bdc.find((b) => b.FNAM === 'RC29K-BMENG');
    assert.equal(baseQtyVal?.FVAL, '101');

    // 3. Position before item change: =SETP -> dynpro 0708 -> item 0010 -> =CLWI
    const posScreens = bdc.filter((b) => b.DYNPRO === '0708');
    assert.equal(posScreens.length, 2, 'Must position before item change and before deletion');

    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-SELPO' && b.FVAL === '0010'), 'Must position item 0010');
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-SELPO' && b.FVAL === '0020'), 'Must position item 0020');

    // 4. Detail screen 2130 (recorded in ZTEST_CS02_I)
    const detailScreen = bdc.find((b) => b.DYNPRO === '2130');
    assert.ok(detailScreen, 'Detail screen 2130 must be present');

    // 5. New item page via =FCNP and fills line (02)
    const newPageOk = bdc.find((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCNP');
    assert.ok(newPageOk, 'New item page OK code =FCNP must be present');
    const newCompVal = bdc.find((b) => b.FNAM === 'RC29P-IDNRK(02)');
    assert.equal(newCompVal?.FVAL, 'RAW-03');

    // 6. Delete item: position 0020, select row RC29P-AUSKZ(01) = 'X', and =FCDL
    const delOk = bdc.find((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCDL');
    assert.ok(delOk, 'Delete OK code =FCDL must be present');
    const delSelect = bdc.find((b) => b.FNAM === 'RC29P-AUSKZ(01)');
    assert.equal(delSelect?.FVAL, 'X');

    // 7. Save via =FCBU at the very end
    const lastOk = bdc.filter((b) => b.FNAM === 'BDC_OKCODE').pop();
    assert.equal(lastOk?.FVAL, '=FCBU', 'Final OK code must be save =FCBU');
  });

  await t.test('14. Pre-write validation: rejects duplicate item numbers', async () => {
    const itemsWithDuplicate = [
      { changeType: 'CHANGE', item: '0010', component: 'RAW-01', quantity: 5 },
      { changeType: 'CHANGE', item: '0010', component: 'RAW-01', quantity: 8 }
    ];

    const valRes = validateChangeItems(itemsWithDuplicate, [
      { item: '0010', component: 'RAW-01' },
      { item: '0020', component: 'RAW-02' }
    ]);

    assert.equal(valRes.valid, false);
    assert.equal(valRes.code, 'DUPLICATE_ITEM_NUMBER');
    assert.ok(valRes.error.includes("Duplicate item number '0010'"));
  });

  await t.test('15. Pre-write validation: rejects component mismatch on existing items', async () => {
    const itemsWithMismatch = [
      { changeType: 'CHANGE', item: '0010', component: 'WRONG-COMP', quantity: 5 }
    ];

    const valRes = validateChangeItems(itemsWithMismatch, [
      { item: '0010', component: 'RAW-01' }
    ]);

    assert.equal(valRes.valid, false);
    assert.equal(valRes.code, 'COMPONENT_MISMATCH');
    assert.ok(valRes.error.includes("Component mismatch for item 0010"));
  });

  await t.test('16. RFC_CALL_TRANSACTION_USING: handles error message Type E or A', async () => {
    const origEnv = process.env.SAP_BOM_CHANGE_FUNCTION;
    delete process.env.SAP_BOM_CHANGE_FUNCTION;

    const mockClient = {
      call: async (fm) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          return {
            SUBRC: 4,
            L_ERRORS: [
              { MSGID: '29', MSGNR: '999', MSGTYP: 'E', MSGTXT: 'Component RAW-01 rejected' }
            ]
          };
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '200' },
      client: mockClient,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'RFC_CHANGE_TRANSACTION_ERROR');
    assert.ok(res.message.includes('Component RAW-01 rejected'));

    if (origEnv !== undefined) {
      process.env.SAP_BOM_CHANGE_FUNCTION = origEnv;
    }
  });

  await t.test('17. Post-write verification failure returns VERIFICATION_FAILED', async () => {
    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '200' },
      simulateVerificationFailure: true,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'VERIFICATION_FAILED');
  });

  await t.test('18. Mock RFC client rejects unknown parameter names (e.g. UPDATE) like real SAP', async () => {
    const mock = new DefaultMockRfcClient();
    await mock.open();

    // Calling with disallowed parameter 'UPDATE' must throw "field 'UPDATE' not found"
    await assert.rejects(
      async () => {
        await mock.call('RFC_CALL_TRANSACTION_USING', {
          TCODE: 'CS02',
          MODE: 'N',
          UPDATE: 'S',
          BT_DATA: []
        });
      },
      (err) => {
        assert.equal(err.code, 'RFC_INVALID_PARAMETER');
        assert.equal(err.message, "field 'UPDATE' not found");
        return true;
      }
    );

    // Calling with valid interface parameters (TCODE, MODE, BT_DATA) must succeed
    const validRes = await mock.call('RFC_CALL_TRANSACTION_USING', {
      TCODE: 'CS02',
      MODE: 'N',
      BT_DATA: []
    });
    assert.equal(validRes.SUBRC, 0);
    assert.ok(Array.isArray(validRes.L_ERRORS));
    assert.equal(validRes.L_ERRORS[0].MSGID, '29');
    assert.equal(validRes.L_ERRORS[0].MSGNR, '024');
  });

  await t.test('19. Interface parameter error maps to friendly message and logs technical text', async () => {
    const mockErrClient = {
      call: async () => {
        const err = new Error("field 'UPDATE' not found");
        err.code = 'RFC_INVALID_PARAMETER';
        throw err;
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '200' },
      client: mockErrClient,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'SAP_NOT_AVAILABLE');
    assert.equal(
      res.message,
      'Your SAP system interface does not support this change option. Please contact your SAP administrator.'
    );
    assert.ok(!res.message.includes('UPDATE'), 'Technical parameter name must not leak into user message');

    // Also verify toFriendlyError maps raw error text identically
    const friendly = toFriendlyError(new Error("SAP rejected BOM change: field 'UPDATE' not found"));
    assert.equal(friendly.code, 'SAP_NOT_AVAILABLE');
    assert.equal(
      friendly.message,
      'Your SAP system interface does not support this change option. Please contact your SAP administrator.'
    );
    assert.ok(!friendly.message.includes('UPDATE'));
  });

  await t.test('20. Post-write asynchronous re-read retry reports "Not applied" after bounded attempts', async () => {
    let postWriteTries = 0;
    let bdcCalled = false;
    const mockSlowClient = {
      call: async (fm, params) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          bdcCalled = true;
          return {
            SUBRC: 0,
            L_ERRORS: [{ MSGID: '29', MSGNR: '024', MSGTYP: 'S', MSGTXT: 'BOM changed' }]
          };
        }
        if (fm === 'RFC_READ_TABLE') {
          const tbl = params?.QUERY_TABLE;
          if (tbl === 'MAST') {
            return {
              FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
              DATA: [{ WA: `${testMaterial}|${testPlant}|${testUsage}|00783595|01` }]
            };
          }
          if (tbl === 'STKO') {
            if (bdcCalled) postWriteTries++;
            return {
              FIELDS: [{ FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }, { FIELDNAME: 'BMENG' }, { FIELDNAME: 'BMEIN' }, { FIELDNAME: 'STLST' }],
              DATA: [{ WA: '00783595|01|100|EA|01' }] // Continues returning old baseQty 100 instead of 999
            };
          }
          return { DATA: [] };
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '999' },
      retryDelayMs: 10,
      client: mockSlowClient,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'VERIFICATION_FAILED');
    assert.ok(res.message.includes('Not applied'), `Message must include "Not applied": ${res.message}`);
    assert.equal(postWriteTries, 3, 'Must attempt re-read verification 3 times before reporting Not applied');
  });

  await t.test('21. SUBRC 1001 maps to friendly message and logs technical step details', async () => {
    let loggedError = '';
    const origConsoleError = console.error;
    console.error = (...args) => {
      loggedError += args.join(' ');
      origConsoleError(...args);
    };

    const mock1001Client = {
      call: async (fm) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          return {
            SUBRC: 1001,
            L_ERRORS: [{ MSGID: '00', MSGNR: '349', MSGTYP: 'E', MSGTXT: 'Field does not exist on screen' }]
          };
        }
        return {};
      }
    };

    try {
      const res = await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '200' },
        client: mock1001Client,
        server: serverA
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'RFC_CHANGE_TRANSACTION_ERROR');
      assert.equal(res.message, 'Field does not exist on screen (screen 2110)');

      // Technical text must be logged in error log with SUBRC and last step info
      assert.ok(loggedError.includes('SUBRC 1001'));
      assert.ok(loggedError.includes('Last BDC screen sent: Program: SAPLCSDI, Dynpro: 2110'));
      assert.ok(!res.message.includes('SUBRC 1001'), 'Technical SUBRC must not leak into user message');

      // Verify toFriendlyError also maps raw SUBRC 1001 error
      const friendly = toFriendlyError(new Error('Transaction terminated with SUBRC 1001 in mode N'));
      assert.equal(friendly.message, 'SAP could not process the change screens. Please contact support.');
    } finally {
      console.error = origConsoleError;
    }
  });

  await t.test('22. CS02_BDC_TRACE=1 logs BDC table without secrets and is off by default', async () => {
    let loggedTrace = '';
    const origConsoleLog = console.log;
    console.log = (...args) => {
      loggedTrace += args.join(' ');
      origConsoleLog(...args);
    };

    const origEnv = process.env.CS02_BDC_TRACE;

    const mockSuccessClient = {
      call: async (fm) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          return {
            SUBRC: 0,
            L_ERRORS: [{ MSGID: '29', MSGNR: '024', MSGTYP: 'S', MSGTXT: 'BOM changed' }]
          };
        }
        if (fm === 'RFC_READ_TABLE') {
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }, { FIELDNAME: 'STLAN' }, { FIELDNAME: 'STLNR' }, { FIELDNAME: 'STLAL' }],
            DATA: [{ WA: `${testMaterial}|${testPlant}|${testUsage}|00783595|01` }]
          };
        }
        return {};
      }
    };

    try {
      // 1. Off by default
      delete process.env.CS02_BDC_TRACE;
      loggedTrace = '';
      await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '100' },
        client: mockSuccessClient,
        server: serverA
      });
      assert.ok(!loggedTrace.includes('[CS02_BDC_TRACE]'), 'BDC trace must not log when flag is unset');

      // 2. Active when CS02_BDC_TRACE=1
      process.env.CS02_BDC_TRACE = '1';
      loggedTrace = '';
      await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '100' },
        client: mockSuccessClient,
        server: serverA
      });
      assert.ok(loggedTrace.includes('[CS02_BDC_TRACE]'), 'BDC trace must log when CS02_BDC_TRACE=1');
      assert.ok(loggedTrace.includes('SAPLCSDI'), 'BDC trace must contain program name');
    } finally {
      console.log = origConsoleLog;
      if (origEnv !== undefined) {
        process.env.CS02_BDC_TRACE = origEnv;
      } else {
        delete process.env.CS02_BDC_TRACE;
      }
    }
  });

  await t.test('23. SAP user decimal notation (DCPFM) and date format (DATFM) read once & formatted without thousands separators', async () => {
    // 1. Quantity formatting
    // DCPFM 'X' (period decimal)
    assert.equal(formatSapQuantity('101', 'X'), '101');
    assert.equal(formatSapQuantity('0.09', 'X'), '0.09');
    assert.equal(formatSapQuantity('1,234.50', 'X'), '1234.50', 'Thousands separator comma must be stripped');

    // DCPFM ' ' or 'Y' (comma decimal)
    assert.equal(formatSapQuantity('101', ' '), '101');
    assert.equal(formatSapQuantity('0.09', ' '), '0,09', 'Must convert decimal dot to comma on comma decimal systems');
    assert.equal(formatSapQuantity('0,09', ' '), '0,09');
    assert.equal(formatSapQuantity('1.234,50', ' '), '1234,50', 'Thousands separator period must be stripped');

    // 2. Date formatting (DATFM)
    assert.equal(formatSapDate('20261120', '1'), '20.11.2026'); // DD.MM.YYYY
    assert.equal(formatSapDate('20261120', '2'), '11/20/2026'); // MM/DD/YYYY
    assert.equal(formatSapDate('20261120', '6'), '2026-11-20'); // YYYY-MM-DD

    // 3. getSapUserDefaults cached once per connection
    let callCount = 0;
    const mockUserClient = {
      call: async (fm) => {
        if (fm === 'BAPI_USER_GET_DETAIL') {
          callCount++;
          return { DEFAULTS: { DCPFM: ' ', DATFM: '1' } };
        }
        return {};
      }
    };
    const def1 = await getSapUserDefaults(mockUserClient, 'TESTUSER');
    assert.equal(def1.dcpfm, ' ');
    assert.equal(def1.datfm, '1');
    assert.equal(callCount, 1);

    // Second call on same client must use cached value without calling BAPI again
    const def2 = await getSapUserDefaults(mockUserClient, 'TESTUSER');
    assert.equal(def2.dcpfm, ' ');
    assert.equal(callCount, 1, 'Defaults must be cached on client connection');
  });

  await t.test('24. Pre-CS02 lock check stops with friendly message naming locking user', async () => {
    // 1. When locked via bomLockService
    const held = bomLockService.acquireLock({
      server: serverA,
      serverId: serverA.id,
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternative: testAlt,
      userId: 'LEELAM_EXT'
    });

    try {
      const res = await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '101' },
        user: { id: 'other_user' },
        server: serverA
      });

      assert.equal(res.success, false);
      assert.equal(res.code, 'BOM_LOCKED');
      assert.equal(
        res.message,
        'This BOM is being changed by another user. Please try again in a moment.'
      );
    } finally {
      held.release();
    }

    // 2. When locked in SAP GUI (simulated SAP lock)
    const resSapLock = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '101' },
      simulateSapLockUser: 'LEELAM_EXT',
      server: serverA
    });

    assert.equal(resSapLock.success, false);
    assert.equal(resSapLock.code, 'BOM_LOCKED');
    assert.equal(
      resSapLock.message,
      'This BOM is locked in SAP by another user. Ask them to close it, or try again later.'
    );
  });

  await t.test('25. Live-SAP guard: recorded operations proceed; unrecorded multiple detail changes are blocked', async () => {
    const origMock = process.env.USE_MOCK_SAP;
    try {
      process.env.USE_MOCK_SAP = 'false';
      delete process.env.ALLOW_GUESSED_CS02_BDC;

      let bdcCalled = false;
      const mockLiveClient = {
        call: async (fm) => {
          if (fm === 'RFC_CALL_TRANSACTION_USING') {
            bdcCalled = true;
            return {
              SUBRC: 0,
              L_ERRORS: [{ MSGID: '29', MSGNR: '024', MSGTYP: 'S', MSGTXT: 'BOM changed' }]
            };
          }
          if (fm === 'RFC_READ_TABLE') {
            return { DATA: [] };
          }
          return {};
        }
      };

      // (a) Quantity change proceeds to BDC call
      const resQty = await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        currentBom: {
          success: true,
          bomExists: true,
          components: [{ item: '0010', component: 'RAW-01', quantity: '100', unit: 'EA' }]
        },
        items: [{ changeType: 'CHANGE', item: '0010', quantity: '101' }],
        client: mockLiveClient,
        server: serverA
      });
      assert.equal(bdcCalled, true, 'Recorded quantity change must reach RFC_CALL_TRANSACTION_USING');

      // (b) Combined quantity change + add (recorded in TEST_QTY_ADD) proceeds to BDC call
      bdcCalled = false;
      const resCombined = await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        currentBom: {
          success: true,
          bomExists: true,
          components: [{ item: '0010', component: 'RAW-01', quantity: '100', unit: 'EA' }]
        },
        items: [
          { changeType: 'CHANGE', item: '0010', quantity: '101' },
          { changeType: 'ADD', component: 'RAW-09', quantity: '5', itemCategory: 'L' }
        ],
        client: mockLiveClient,
        server: serverA
      });
      assert.equal(bdcCalled, true, 'Combined qty + add must reach RFC_CALL_TRANSACTION_USING');

      // (c) Multiple detail changes is blocked with BDC_RECORDING_REQUIRED
      const resMultiDetail = await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        currentBom: {
          success: true,
          bomExists: true,
          components: [
            { item: '0010', component: 'RAW-01', quantity: '10' },
            { item: '0020', component: 'RAW-02', quantity: '20' }
          ]
        },
        items: [
          { changeType: 'CHANGE', item: '0010', unit: 'KG' },
          { changeType: 'CHANGE', item: '0020', unit: 'PC' }
        ],
        client: mockLiveClient,
        server: serverA
      });
      assert.equal(resMultiDetail.success, false);
      assert.equal(resMultiDetail.code, 'BDC_RECORDING_REQUIRED');
      assert.ok(resMultiDetail.message.includes('multiple item detail changes'));
    } finally {
      process.env.USE_MOCK_SAP = origMock;
    }
  });

  await t.test('26. Example (a): change quantity of item 0010 matches ZTEST_CS02_Q', async () => {
    const currentBom = {
      components: [{ item: '0010', component: 'B1BH0214C', quantity: '100', unit: 'PAA' }]
    };
    const bdc = buildCs02BdcData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '33',
      validFrom: '20261120',
      items: [{ changeType: 'CHANGE', item: '0010', quantity: 101 }]
    }, currentBom);

    // Verify exact sequence from ZTEST_CS02_Q
    assert.equal(bdc[0].DYNPRO, '0100');
    assert.equal(bdc[2].FVAL, '/00');
    // Position
    const setpIdx = bdc.findIndex((b) => b.FVAL === '=SETP');
    assert.ok(setpIdx > 0);
    assert.equal(bdc[setpIdx + 1].DYNPRO, '0708');
    assert.equal(bdc[setpIdx + 2].FVAL, '=CLWI');
    // Overview with =FCBU and changed quantity
    const saveIdx = bdc.findIndex((b) => b.FVAL === '=FCBU');
    assert.ok(saveIdx > 0);
    assert.equal(bdc[saveIdx - 2].DYNPRO, '0150');
    // Screen 0130 & 0131 confirmations
    assert.ok(bdc.some((b) => b.DYNPRO === '0130'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0131'));
  });

  await t.test('27. Example (b): change unit, storage location and text matches ZTEST_CS02_I', async () => {
    const currentBom = {
      components: [{ item: '0010', component: 'D4PSB001B', quantity: '1', unit: 'EA' }]
    };
    const bdc = buildCs02BdcData({
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '30',
      validFrom: '20261120',
      items: [{
        changeType: 'CHANGE',
        item: '0010',
        unit: 'PAA',
        storageLocation: 'PR67',
        itemText: 'RFL2400000015'
      }]
    }, currentBom);

    // Detail navigation =/CS
    assert.ok(bdc.some((b) => b.FVAL === '=/CS'));
    // Screen 2130 subpages =PDAT and =FCBU
    const p2130 = bdc.filter((b) => b.DYNPRO === '2130');
    assert.equal(p2130.length, 2);
    assert.ok(bdc.some((b) => b.FVAL === '=PDAT'));
    assert.ok(bdc.some((b) => b.FVAL === '=FCBU'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-LGORT' && b.FVAL === 'PR67'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-POTX1' && b.FVAL === 'RFL2400000015'));
  });

  await t.test('28. Example (c): add one item matches TEST_ADD', async () => {
    const bdc = buildCs02BdcData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '33',
      validFrom: '20261120',
      items: [{
        changeType: 'ADD',
        component: '11031873',
        quantity: 1,
        unit: 'KG',
        itemCategory: 'L'
      }]
    });

    // Overview =FCNP -> screen 0140 row 02 -> 0130 -> 0131 -> 0140 =FCBU
    assert.ok(bdc.some((b) => b.FVAL === '=FCNP'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0140'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-IDNRK(02)' && b.FVAL === '11031873'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-POSTP(02)' && b.FVAL === 'L'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0130'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0131'));
    const last = bdc[bdc.length - 1];
    assert.equal(last.FVAL, '=FCBU');
  });

  await t.test('29. Example (d): delete one item matches TEST_DELETE', async () => {
    const bdc = buildCs02BdcData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '33',
      validFrom: '20261120',
      items: [{ changeType: 'DELETE', item: '0010' }]
    });

    // Position 0708, then select row 01 and =FCDL, then =FCBU
    assert.ok(bdc.some((b) => b.DYNPRO === '0708'));
    assert.ok(bdc.some((b) => b.FVAL === '=FCDL'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-AUSKZ(01)' && b.FVAL === 'X'));
    const last = bdc[bdc.length - 1];
    assert.equal(last.FVAL, '=FCBU');
  });

  await t.test('30. Example (e): header base quantity & status matches TEST_HEADER', async () => {
    const bdc = buildCs02BdcData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '33',
      validFrom: '20261120',
      header: { baseQty: '101', bomStatus: '1' }
    });

    // =KALL -> 2110 with =FCBU and RC29K-BMENG, RC29K-STLST (no /EBACK popup)
    assert.ok(bdc.some((b) => b.FVAL === '=KALL'));
    assert.ok(bdc.some((b) => b.DYNPRO === '2110'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29K-BMENG' && b.FVAL === '101'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29K-STLST' && b.FVAL === '1'));
    const headerScreen = bdc.filter((b) => b.DYNPRO === '2110');
    assert.equal(headerScreen.length, 1);
    assert.ok(bdc.some((b) => b.FVAL === '=FCBU'));
    assert.ok(!bdc.some((b) => b.FVAL === '/EBACK'));
  });

  await t.test('31. Example (f): quantity change plus new item in one run', async () => {
    const currentBom = {
      components: [{ item: '0010', component: 'B1BH0214C', quantity: '100', unit: 'PAA' }]
    };
    const bdc = buildCs02BdcData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '33',
      validFrom: '20261120',
      items: [
        { changeType: 'CHANGE', item: '0010', quantity: 101 },
        { changeType: 'ADD', component: '11031873', quantity: 1, unit: 'KG', itemCategory: 'L' }
      ]
    }, currentBom);

    // Quantity updated on 0150 with =FCNP, then 0140 line (02), then 0130, 0131, 0140 =FCBU
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-MENGE(01)' && b.FVAL === '101'));
    assert.ok(bdc.some((b) => b.FVAL === '=FCNP'));
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-IDNRK(02)' && b.FVAL === '11031873'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0130'));
    assert.ok(bdc.some((b) => b.DYNPRO === '0131'));
    const last = bdc[bdc.length - 1];
    assert.equal(last.FVAL, '=FCBU');
  });

  await t.test('32. Single CS02 run per BOM and pre-write validation for unknown item', async () => {
    let callCount = 0;
    const mockRfcClient = {
      call: async (fm, params) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          callCount++;
          return {
            SUBRC: 0,
            L_ERRORS: [{ MSGID: '29', MSGNR: '024', MSGTYP: 'S', MSGTXT: 'BOM changed' }]
          };
        }
        if (fm === 'RFC_READ_TABLE') {
          return { DATA: [] };
        }
        return {};
      }
    };

    // Unknown item rejection
    const unkRes = validateChangeItems(
      [{ changeType: 'CHANGE', item: '9999', component: 'RAW-99', quantity: 10 }],
      [{ item: '0010', component: 'RAW-01' }]
    );
    assert.equal(unkRes.valid, false);
    assert.equal(unkRes.code, 'UNKNOWN_ITEM_NUMBER');

    // Single run per BOM
    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '105' },
      items: [
        { changeType: 'CHANGE', item: '0010', component: 'RAW-01', quantity: 20 },
        { changeType: 'ADD', component: 'RAW-04', quantity: 2, unit: 'EA', itemCategory: 'L' }
      ],
      client: mockRfcClient,
      server: serverA
    });

    assert.equal(callCount, 1, 'Exactly one CS02 RFC call must be executed per BOM change');
  });

  await t.test('33. RFC_CALL_TRANSACTION_USING handles AUTHORITY_NOT_AVAILABLE with clear error', async () => {
    const mockAuthClient = {
      call: async (fm) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          const err = new Error('AUTHORITY_NOT_AVAILABLE');
          err.key = 'AUTHORITY_NOT_AVAILABLE';
          throw err;
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '105' },
      client: mockAuthClient,
      server: serverA
    });

    assert.equal(res.success, false);
    assert.equal(res.code, 'AUTHORITY_NOT_AVAILABLE');
    assert.ok(res.message.includes('not authorized to maintain BOMs in SAP'));
  });

  await t.test('34. Success decided from any S message in L_ERRORS and returns structured message fields', async () => {
    const mockSuccessClient = {
      call: async (fm, params) => {
        if (fm === 'RFC_CALL_TRANSACTION_USING') {
          assert.ok(Array.isArray(params.L_ERRORS), 'L_ERRORS must be passed as a table');
          return {
            SUBRC: 0,
            L_ERRORS: [
              {
                MSGTYP: 'S',
                MSGID: 'ZZ',
                MSGNR: '777',
                MSGV1: 'BOM_A',
                MSGV2: 'PLANT_B',
                MSGV3: 'USAGE_1',
                MSGV4: 'ALT_01',
                DYNAME: 'SAPLCSDI',
                DYNUMB: '0150',
                FLDNAME: 'RC29P-MENGE',
                MSGTXT: 'Custom change applied successfully'
              }
            ]
          };
        }
        if (fm === 'RFC_READ_TABLE') {
          return { DATA: [] };
        }
        return {};
      }
    };

    const res = await rfcChangeBom({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      header: { baseQty: '105' },
      client: mockSuccessClient,
      server: serverA
    });

    assert.equal(res.success, true);
    assert.equal(res.subrc, 0);
    assert.ok(Array.isArray(res.messages), 'messages must be returned');
    assert.equal(res.messages.length, 1);
    const m = res.messages[0];
    assert.equal(m.MSGTYP, 'S');
    assert.equal(m.MSGID, 'ZZ');
    assert.equal(m.MSGNR, '777');
    assert.equal(m.MSGV1, 'BOM_A');
    assert.equal(m.DYNAME, 'SAPLCSDI');
    assert.equal(m.DYNUMB, '0150');
    assert.equal(m.FLDNAME, 'RC29P-MENGE');
  });

  await t.test('35. RFC_TRACE=1 logs exact BT_DATA rows in order and L_ERRORS', async () => {
    let loggedTrace = '';
    const origLog = console.log;
    console.log = (...args) => {
      loggedTrace += args.join(' ') + '\n';
      origLog(...args);
    };

    const origTrace = process.env.RFC_TRACE;
    try {
      process.env.RFC_TRACE = '1';

      const mockClient = {
        call: async (fm) => {
          if (fm === 'RFC_CALL_TRANSACTION_USING') {
            return {
              SUBRC: 0,
              L_ERRORS: [{ MSGTYP: 'S', MSGID: '29', MSGNR: '024', MSGTXT: 'BOM changed' }]
            };
          }
          return {};
        }
      };

      await rfcChangeBom({
        material: testMaterial,
        plant: testPlant,
        bomUsage: testUsage,
        alternativeBom: testAlt,
        header: { baseQty: '105' },
        client: mockClient,
        server: serverA
      });

      assert.ok(loggedTrace.includes('[RFC_TRACE] RFC_CALL_TRANSACTION_USING BT_DATA:'));
      assert.ok(loggedTrace.includes('PROGRAM=SAPLCSDI DYNPRO=0100'));
      assert.ok(loggedTrace.includes('[RFC_TRACE] RFC_CALL_TRANSACTION_USING L_ERRORS:'));
      assert.ok(loggedTrace.includes('BOM changed'));
    } finally {
      process.env.RFC_TRACE = origTrace;
      console.log = origLog;
    }
  });

  await t.test('36. Quantity-only with unchanged unit/storage/text uses quantity route and never 2130', async () => {
    const currentBom = {
      components: [
        { item: '0010', component: 'RAW-01', quantity: 10, unit: 'EA', storageLocation: '1000', itemText: 'Motor Core' }
      ]
    };

    // Frontend sends all row fields unchanged along with new quantity 15
    const bdc = buildCs02BdcData({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      items: [
        {
          changeType: 'CHANGE',
          item: '0010',
          component: 'RAW-01',
          quantity: 15,
          unit: 'EA',
          storageLocation: '1000',
          itemText: 'Motor Core'
        }
      ]
    }, currentBom);

    // Verify quantity route screens
    assert.ok(bdc.some((b) => b.DYNPRO === '0100'), 'Screen 0100 must be present');
    assert.ok(bdc.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=SETP'), '0150 =SETP must be present');
    assert.ok(bdc.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=CLWI'), '0708 =CLWI must be present');
    assert.ok(bdc.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCBU'), '0150 =FCBU must be present');
    assert.ok(bdc.some((b) => b.DYNPRO === '0130'), 'Screen 0130 must be present');
    assert.ok(bdc.some((b) => b.DYNPRO === '0131'), 'Screen 0131 must be present');

    // Must NOT contain 2130 or =/CS
    assert.ok(!bdc.some((b) => b.DYNPRO === '2130'), 'Screen 2130 must NOT be present on quantity edit');
    assert.ok(!bdc.some((b) => b.FVAL === '=/CS'), 'OK code =/CS must NOT be present on quantity edit');
  });

  await t.test('37. Changing unit uses detail route and matches ZTEST_CS02_I order', async () => {
    const currentBom = {
      components: [
        { item: '0010', component: 'RAW-01', quantity: 10, unit: 'EA', storageLocation: '1000', itemText: 'Motor Core' }
      ]
    };

    // User changed unit from EA to KG
    const bdc = buildCs02BdcData({
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: testAlt,
      items: [
        {
          changeType: 'CHANGE',
          item: '0010',
          component: 'RAW-01',
          quantity: 10,
          unit: 'KG',
          storageLocation: '1000',
          itemText: 'Motor Core'
        }
      ]
    }, currentBom);

    // Detail route screens in order: 0100, 0150 =SETP, 0708 =CLWI, 0150 =/CS, 2130 =PDAT, 2130 =FCBU
    assert.ok(bdc.some((b) => b.FVAL === '=/CS'), 'OK code =/CS must be present when unit changed');
    const p2130 = bdc.filter((b) => b.DYNPRO === '2130');
    assert.equal(p2130.length, 2, 'Screen 2130 must appear twice (=PDAT then =FCBU)');
    assert.ok(bdc.some((b) => b.FVAL === '=PDAT'), '=PDAT must be present');
    assert.ok(bdc.some((b) => b.FVAL === '=FCBU'), '=FCBU must be present');
    assert.ok(bdc.some((b) => b.FNAM === 'RC29P-MEINS' && b.FVAL === 'KG'), 'New unit KG must be sent');
  });

  await t.test('38. Alternative BOM selection: multi-alternative, single alternative, none, typed alternative', async () => {
    const multiMat = 'MAT-MULTI-ALT-99';
    // 1. Seed Alternative 01
    await rfcCreateBom({
      material: multiMat,
      plant: testPlant,
      bomUsage: '1',
      alternativeBom: '01',
      baseQty: '10',
      baseUnit: 'EA',
      bomStatus: '01',
      altText: 'Alt 01 Header',
      components: [{ itemNo: '0010', component: 'RAW-01', quantity: 1, unit: 'EA', itemCategory: 'L' }],
      server: serverA
    });

    // 2. Seed Alternative 02
    await rfcCreateBom({
      material: multiMat,
      plant: testPlant,
      bomUsage: '1',
      alternativeBom: '02',
      baseQty: '20',
      baseUnit: 'EA',
      bomStatus: '01',
      altText: 'Alt 02 Header',
      components: [{ itemNo: '0010', component: 'RAW-02', quantity: 2, unit: 'EA', itemCategory: 'L' }],
      server: serverA
    });

    // (a) Empty alternative on multi-alt BOM returns availableAlternatives with both
    const readEmpty = await makeRequest('POST', '/api/bom/read', {
      material: multiMat,
      plant: testPlant,
      bomUsage: '1',
      alternativeBom: ''
    }, {
      Authorization: `Bearer ${userAToken}`,
      'x-sap-server-id': serverA.id
    });
    assert.equal(readEmpty.status, 200);
    assert.equal(readEmpty.body.success, true);
    assert.ok(Array.isArray(readEmpty.body.availableAlternatives), 'availableAlternatives must be an array');
    assert.ok(readEmpty.body.availableAlternatives.length >= 2, 'Must have at least 2 alternatives');
    assert.ok(readEmpty.body.availableAlternatives.includes('01') && readEmpty.body.availableAlternatives.includes('02'));

    // (b) Typed alternative 02 returns specifically alternative 02
    const readTyped = await makeRequest('POST', '/api/bom/read', {
      material: multiMat,
      plant: testPlant,
      bomUsage: '1',
      alternativeBom: '02'
    }, {
      Authorization: `Bearer ${userAToken}`,
      'x-sap-server-id': serverA.id
    });
    assert.equal(readTyped.status, 200);
    assert.equal(readTyped.body.alternativeBom, '02');
    assert.equal(readTyped.body.header.baseQty, '20');

    // (c) Single alternative BOM returns availableAlternatives of length 1
    const readSingle = await makeRequest('POST', '/api/bom/read', {
      material: testMaterial,
      plant: testPlant,
      bomUsage: testUsage,
      alternativeBom: ''
    }, {
      Authorization: `Bearer ${userAToken}`,
      'x-sap-server-id': serverA.id
    });
    assert.equal(readSingle.status, 200);
    assert.equal(readSingle.body.success, true);
    assert.equal(readSingle.body.availableAlternatives.length, 1);

    // (d) Non-existent BOM returns 404 with BOM_NOT_FOUND
    const readNone = await makeRequest('POST', '/api/bom/read', {
      material: 'NON-EXISTENT-MAT-999',
      plant: testPlant,
      bomUsage: '1',
      alternativeBom: ''
    }, {
      Authorization: `Bearer ${userAToken}`,
      'x-sap-server-id': serverA.id
    });
    assert.equal(readNone.status, 404);
    assert.equal(readNone.body.errorCode, 'BOM_NOT_FOUND');
  });

  await t.test('39. Chained CS02 BDC recordings: TEST_ALL, TEST_QTY_TWO, TEST_ADD_TWO match exact SHDB sequences', async () => {
    // 1. TEST_ALL: Header + Qty + Delete + Add + Detail + Save
    const currentBomAll = {
      components: [
        { item: '0020', component: 'C1BH0214C', quantity: '100', unit: 'PAA' },
        { item: '0040', component: '11021733', quantity: '0.014', unit: 'KG' },
        { item: '0050', component: 'D4PSB001B', quantity: '1', unit: 'EA' }
      ]
    };
    const bdcAll = buildCs02BdcData({
      material: 'a1bh0214c',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '30',
      validFrom: '21.11.2026',
      header: { baseQty: '101', bomStatus: '1' },
      items: [
        { changeType: 'CHANGE', item: '0020', quantity: 101 },
        { changeType: 'DELETE', item: '0050' },
        { changeType: 'ADD', component: '11031875', quantity: 1, unit: 'KG', itemCategory: 'L' },
        { changeType: 'CHANGE', item: '0040', unit: 'KG', quantity: '0.014', storageLocation: 'st01', itemText: 'text' }
      ]
    }, currentBomAll);

    // Verify key transition points in TEST_ALL
    // (a) Header returns to overview via =FCPU
    const p2110Idx = bdcAll.findIndex((b) => b.DYNPRO === '2110');
    assert.ok(p2110Idx >= 0, 'Header screen 2110 must be present');
    assert.equal(bdcAll[p2110Idx + 1].FVAL, '=FCPU', 'Header must return to overview via =FCPU');

    // (b) Qty 0020 executed with /00 then 0130, 0131
    assert.ok(bdcAll.some((b) => b.FNAM === 'RC29P-MENGE(01)' && b.FVAL === '101'));
    assert.ok(bdcAll.some((b) => b.DYNPRO === '0130'));
    assert.ok(bdcAll.some((b) => b.DYNPRO === '0131'));

    // (c) Delete 0050 directly from auto-opened 0708 popup
    assert.ok(bdcAll.some((b) => b.FNAM === 'RC29P-SELPO' && b.FVAL === '0050'));
    assert.ok(bdcAll.some((b) => b.FVAL === '=FCDL' && b.FNAM === 'BDC_OKCODE'));

    // (d) Add item 11031875 via =FCNP on row (02)
    assert.ok(bdcAll.some((b) => b.FVAL === '=FCNP'));
    assert.ok(bdcAll.some((b) => b.FNAM === 'RC29P-IDNRK(02)' && b.FVAL === '11031875'));

    // (e) Return from 0140 to 0150 via =FCPU for detail change
    const fcpuOk = bdcAll.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCPU');
    assert.ok(fcpuOk, 'Must return from 0140 to 0150 via =FCPU');

    // (f) Position 0040 and detail change via =/CS into 2130
    assert.ok(bdcAll.some((b) => b.FNAM === 'RC29P-SELPO' && b.FVAL === '0040'));
    assert.ok(bdcAll.some((b) => b.FVAL === '=/CS'));
    assert.ok(bdcAll.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=PDAT'));

    // (g) Save directly from 2130 via =FCBU
    const lastBdcAll = bdcAll[bdcAll.length - 1];
    assert.equal(lastBdcAll.FVAL, 'X'); // RC29P-SANKA on 2130
    assert.ok(bdcAll.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCBU'));

    // 2. TEST_QTY_TWO: two quantity changes chained with auto-opened 0708
    const bdcQtyTwo = buildCs02BdcData({
      material: 'a1bh0214c',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '30',
      validFrom: '21.11.2026',
      items: [
        { changeType: 'CHANGE', item: '0020', quantity: 101 },
        { changeType: 'CHANGE', item: '0040', quantity: 0.014 }
      ]
    });
    // Two 0708 confirms (=CLWI), then /EABBR on 0708 to close, then =FCBU on 0150
    const clwiCount = bdcQtyTwo.filter((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=CLWI').length;
    assert.equal(clwiCount, 2);
    assert.ok(bdcQtyTwo.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '/EABBR'));
    assert.ok(bdcQtyTwo.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCBU'));

    // 3. TEST_ADD_TWO: two new items added on row (02) and (03)
    const bdcAddTwo = buildCs02BdcData({
      material: 'a1bh0214c',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '28',
      validFrom: '21.11.2026',
      items: [
        { changeType: 'ADD', component: '11031873', quantity: 1, unit: 'KG', itemCategory: 'L' },
        { changeType: 'ADD', component: '11031875', quantity: 1, unit: 'KG', itemCategory: 'L' }
      ]
    });
    assert.ok(bdcAddTwo.some((b) => b.FNAM === 'RC29P-IDNRK(02)' && b.FVAL === '11031873'));
    assert.ok(bdcAddTwo.some((b) => b.FNAM === 'RC29P-IDNRK(03)' && b.FVAL === '11031875'));
    assert.ok(bdcAddTwo.some((b) => b.FNAM === 'BDC_OKCODE' && b.FVAL === '=FCBU'));
  });

  await t.test('40. Lightweight BOM Alternatives lookup: 2 RFC calls for 34 alts, zero STAS/STPO, cache, de-duplication, invalidation, input rejection', async () => {
    clearBomAlternativesCache();

    // 1. Mock RFC client with 34 alternatives
    const tableCalls = [];
    const mock34Client = {
      async call(funcName, params) {
        if (funcName === 'RFC_READ_TABLE') {
          const table = params.QUERY_TABLE;
          tableCalls.push({ table, options: params.OPTIONS });

          if (table === 'MAST') {
            const mastData = [];
            for (let i = 1; i <= 34; i++) {
              const alt = String(i).padStart(2, '0');
              mastData.push({ WA: `MAT-34-ALTS|1012|1|00012345|${alt}` });
            }
            return {
              FIELDS: [
                { FIELDNAME: 'MATNR' },
                { FIELDNAME: 'WERKS' },
                { FIELDNAME: 'STLAN' },
                { FIELDNAME: 'STLNR' },
                { FIELDNAME: 'STLAL' }
              ],
              DATA: mastData
            };
          }

          if (table === 'STKO') {
            const stkoData = [];
            for (let i = 1; i <= 34; i++) {
              const alt = String(i).padStart(2, '0');
              stkoData.push({ WA: `${alt}|01|100|PAA|20260101|Alt Description ${alt}` });
            }
            return {
              FIELDS: [
                { FIELDNAME: 'STLAL' },
                { FIELDNAME: 'STLST' },
                { FIELDNAME: 'BMENG' },
                { FIELDNAME: 'BMEIN' },
                { FIELDNAME: 'DATUV' },
                { FIELDNAME: 'BKTXT' }
              ],
              DATA: stkoData
            };
          }

          if (table === 'STAS' || table === 'STPO') {
            throw new Error(`UNEXPECTED_READ: Component table ${table} must NOT be queried during alternatives lookup!`);
          }
        }
        return { DATA: [] };
      }
    };

    // (a) First lookup: executes exactly 2 RFC calls (MAST and STKO) for 34 alternatives; zero STAS/STPO
    const res1 = await rfcGetBomAlternatives({
      material: 'MAT-34-ALTS',
      plant: '1012',
      bomUsage: '1',
      client: mock34Client
    });

    assert.equal(res1.success, true);
    assert.equal(res1.alternatives.length, 34);
    assert.equal(res1.availableAlternatives.length, 34);
    assert.equal(res1.alternatives[0].alternative, '01');
    assert.equal(res1.alternatives[33].alternative, '34');
    assert.equal(res1.alternatives[0].unit, 'PAA');
    assert.equal(res1.alternatives[0].baseQty, '100');
    assert.equal(tableCalls.length, 2, 'Must execute exactly 2 SAP table queries');
    assert.equal(tableCalls[0].table, 'MAST');
    assert.equal(tableCalls[1].table, 'STKO');
    assert.ok(!tableCalls.some((c) => c.table === 'STAS' || c.table === 'STPO'), 'Zero calls to STAS or STPO');

    // (b) Cache hit avoids SAP calls
    const res2 = await rfcGetBomAlternatives({
      material: 'MAT-34-ALTS',
      plant: '1012',
      bomUsage: '1',
      client: mock34Client
    });
    assert.equal(res2.success, true);
    assert.equal(res2.alternatives.length, 34);
    assert.equal(tableCalls.length, 2, 'Cache hit must not make additional SAP calls');

    // (c) In-flight de-duplication avoids duplicate calls
    clearBomAlternativesCache();
    let delayedCalls = 0;
    const delayedClient = {
      async call(funcName, params) {
        if (params.QUERY_TABLE === 'MAST' || params.QUERY_TABLE === 'STKO') {
          delayedCalls++;
          await new Promise((resolve) => setTimeout(resolve, 30));
          return mock34Client.call(funcName, params);
        }
        return { DATA: [] };
      }
    };

    const [p1, p2] = await Promise.all([
      rfcGetBomAlternatives({ material: 'MAT-34-ALTS', plant: '1012', bomUsage: '1', client: delayedClient }),
      rfcGetBomAlternatives({ material: 'MAT-34-ALTS', plant: '1012', bomUsage: '1', client: delayedClient })
    ]);
    assert.equal(p1.alternatives.length, 34);
    assert.equal(p2.alternatives.length, 34);
    assert.equal(delayedCalls, 2, 'In-flight de-duplication must execute exactly 2 calls for parallel requests, not 4');

    // (d) Cache is cleared after successful BOM change
    const cache = getBomAlternativesCache();
    assert.ok(cache.size > 0, 'Cache should contain entries before change');

    // Seed mock BOM so rfcChangeBom succeeds
    await rfcCreateBom({
      material: 'MAT-34-ALTS',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '01',
      baseQty: '100',
      baseUnit: 'PAA',
      bomStatus: '01',
      components: [{ itemNo: '0010', component: 'RAW-01', quantity: 1, unit: 'EA', itemCategory: 'L' }],
      server: serverA
    });

    // Populate cache again for serverA
    await rfcGetBomAlternatives({
      material: 'MAT-34-ALTS',
      plant: '1012',
      bomUsage: '1',
      server: serverA
    });
    assert.ok(cache.size > 0, 'Cache should have entry for MAT-34-ALTS');

    // Change BOM on MAT-34-ALTS
    const changeRes = await rfcChangeBom({
      material: 'MAT-34-ALTS',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '01',
      header: { baseQty: '110' },
      items: [],
      server: serverA,
      user: { id: 'test-user' }
    });
    assert.equal(changeRes.success, true);
    // Cache for MAT-34-ALTS must now be invalidated
    let hasMatInCache = false;
    for (const k of cache.keys()) {
      if (k.includes('MAT-34-ALTS')) hasMatInCache = true;
    }
    assert.equal(hasMatInCache, false, 'Cache for MAT-34-ALTS must be cleared after successful BOM change');

    // (e) Invalid input is rejected
    await assert.rejects(
      async () => {
        await rfcGetBomAlternatives({ material: "MAT'; DROP TABLE", plant: '1012', bomUsage: '1' });
      },
      (err) => err.code === 'INVALID_INPUT'
    );

    await assert.rejects(
      async () => {
        await rfcGetBomAlternatives({ material: 'MAT-34-ALTS', plant: '1012;--', bomUsage: '1' });
      },
      (err) => err.code === 'INVALID_INPUT'
    );

    await assert.rejects(
      async () => {
        await rfcGetBomAlternatives({ material: 'MAT-34-ALTS', plant: '1012', bomUsage: '1 OR 1=1' });
      },
      (err) => err.code === 'INVALID_INPUT'
    );

    // Test API route rejection via HTTP
    const apiRes = await makeRequest('POST', '/api/bom/alternatives', {
      material: "MAT'; DROP TABLE",
      plant: '1012',
      bomUsage: '1'
    }, {
      Authorization: `Bearer ${userAToken}`,
      'x-sap-server-id': serverA.id
    });
    assert.equal(apiRes.status, 400);
    assert.equal(apiRes.body.code, 'INVALID_INPUT');
  });
});
