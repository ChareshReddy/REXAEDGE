import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import {
  rfcPreflightCreateBoms,
  clearMaterialUnitsCache,
  getMaterialUnitsCache,
  createBomFromData,
  toSapMatnr
} from '../services/bomCreateEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING BULK CREATE BOM UNIT RESOLUTION & MAST VALIDATION ');
console.log('============================================================\n');

// -----------------------------------------------------------------------------
// Helper: Bundle BulkBomShared for Node ESM import
// -----------------------------------------------------------------------------
const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_preview_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
const sharedOut = path.join(tempDir, 'BulkBomShared_UnitTests.mjs');
const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/BulkBomShared.jsx')],
  bundle: true,
  format: 'esm',
  outfile: sharedOut,
  external: ['react', 'react-dom', 'lucide-react', 'xlsx', '@shared/*']
});

const { getExecutionRowMessages } = await import(pathToFileURL(sharedOut).href);

// -----------------------------------------------------------------------------
// 1. Mock RFC Client Builder
// -----------------------------------------------------------------------------
function createMockRfcClient({ existingBoms = [], maraData = {}, marmData = {}, marcPairs = new Set() } = {}) {
  const callLog = [];

  const client = {
    callLog,
    async call(rfcName, params = {}) {
      callLog.push({ rfcName, params });

      if (rfcName === 'RFC_READ_TABLE') {
        const table = params.QUERY_TABLE;
        const options = (params.OPTIONS || []).map((o) => o.TEXT).join(' ');

        if (table === 'MARA') {
          const rows = [];
          for (const [matnr, info] of Object.entries(maraData)) {
            if (!options || options.includes(`'${matnr}'`)) {
              rows.push({ WA: `${matnr}|${info.meins || 'EA'}` });
            }
          }
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINS' }],
            DATA: rows
          };
        }

        if (table === 'MARM') {
          const rows = [];
          for (const [matnr, units] of Object.entries(marmData)) {
            if (!options || options.includes(`'${matnr}'`)) {
              for (const u of units) {
                rows.push({ WA: `${matnr}|${u}` });
              }
            }
          }
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'MEINH' }],
            DATA: rows
          };
        }

        if (table === 'MARC') {
          const rows = [];
          for (const pair of marcPairs) {
            const [plant, mat] = pair.split('|');
            if (options.includes(`WERKS = '${plant}'`) && options.includes(`MATNR = '${mat}'`)) {
              rows.push({ WA: `${mat}|${plant}` });
            }
          }
          return {
            FIELDS: [{ FIELDNAME: 'MATNR' }, { FIELDNAME: 'WERKS' }],
            DATA: rows
          };
        }

        if (table === 'T001L') {
          return {
            FIELDS: [{ FIELDNAME: 'WERKS' }, { FIELDNAME: 'LGORT' }],
            DATA: [{ WA: '1010|PR01' }]
          };
        }

        if (table === 'T415S') {
          return {
            FIELDS: [{ FIELDNAME: 'STLST' }],
            DATA: [{ WA: '01' }]
          };
        }

        if (table === 'MAST') {
          const rows = [];
          for (const b of existingBoms) {
            const sapMat = toSapMatnr(b.material);
            if (options.includes(`MATNR = '${sapMat}'`) && options.includes(`WERKS = '${b.plant}'`)) {
              rows.push({
                WA: `${sapMat}|${b.plant}|${b.bomUsage || '1'}|${b.alternativeBom}`
              });
            }
          }
          return {
            FIELDS: [
              { FIELDNAME: 'MATNR' },
              { FIELDNAME: 'WERKS' },
              { FIELDNAME: 'STLAN' },
              { FIELDNAME: 'STLAL' }
            ],
            DATA: rows
          };
        }

        return { FIELDS: [], DATA: [] };
      }

      if (rfcName === 'BAPI_MATERIAL_BOM_GROUP_CREATE') {
        throw new Error('BAPI_MATERIAL_BOM_GROUP_CREATE should NEVER be called during read-only preflight validation!');
      }

      return {};
    }
  };

  return client;
}

// -----------------------------------------------------------------------------
// Test 1: Unit of Measure Resolution from MARA-MEINS when upload has no unit
// -----------------------------------------------------------------------------
console.log('1. Testing unit resolution from MARA-MEINS when component has no unit:');
clearMaterialUnitsCache();

const client1 = createMockRfcClient({
  maraData: {
    'MAT_HDR_01': { meins: 'EA' },
    '000000000011021735': { meins: 'KG' } // Material with KG base unit
  },
  marcPairs: new Set(['1010|MAT_HDR_01', '1010|000000000011021735'])
});

const res1 = await rfcPreflightCreateBoms({
  server: { id: 'TEST_SRV_1' },
  client: client1,
  boms: [
    {
      sequenceNum: '1',
      material: 'MAT_HDR_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      components: [
        {
          itemNo: '0010',
          component: '11021735', // No unit specified in upload
          quantity: '5'
        }
      ]
    }
  ]
});

assert.strictEqual(res1.readyCount, 1, 'BOM must be Ready');
assert.strictEqual(res1.invalidCount, 0, 'No errors expected');
assert.strictEqual(res1.boms[0].components[0].unit, 'KG', 'Component unit must be resolved to KG from MARA-MEINS');
console.log('   ✓ Resolved base unit KG from MARA-MEINS when upload has no unit');

// -----------------------------------------------------------------------------
// Test 2: MARM Alternative Unit Validation
// -----------------------------------------------------------------------------
console.log('\n2. Testing MARM alternative unit validation:');
clearMaterialUnitsCache();

const client2 = createMockRfcClient({
  maraData: {
    'MAT_HDR_01': { meins: 'EA' },
    '000000000011021735': { meins: 'KG' }
  },
  marmData: {
    '000000000011021735': ['KG', 'TO', 'G'] // Allowed units
  },
  marcPairs: new Set(['1010|MAT_HDR_01', '1010|000000000011021735'])
});

// Case 2a: Explicit unsupported unit 'EA' supplied
const res2a = await rfcPreflightCreateBoms({
  server: { id: 'TEST_SRV_1' },
  client: client2,
  boms: [
    {
      sequenceNum: '1',
      material: 'MAT_HDR_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      components: [
        {
          itemNo: '0010',
          component: '11021735',
          unit: 'EA', // Invalid unit for 11021735
          quantity: '5'
        }
      ]
    }
  ]
});

assert.strictEqual(res2a.invalidCount, 1, 'BOM must be marked Invalid');
assert.ok(
  res2a.boms[0].errors.some((e) => e.includes('Unit of measure EA is not defined for component 11021735')),
  'Must report exact error: Unit of measure EA is not defined for component 11021735'
);
console.log('   ✓ Reported "Unit of measure EA is not defined for component 11021735" when unsupported unit supplied');

// Case 2b: Explicit supported alternative unit 'TO' supplied
clearMaterialUnitsCache();
const res2b = await rfcPreflightCreateBoms({
  server: { id: 'TEST_SRV_1' },
  client: client2,
  boms: [
    {
      sequenceNum: '1',
      material: 'MAT_HDR_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      components: [
        {
          itemNo: '0010',
          component: '11021735',
          unit: 'TO', // Valid alternative unit in MARM
          quantity: '2'
        }
      ]
    }
  ]
});

assert.strictEqual(res2b.readyCount, 1, 'BOM must be Ready with valid MARM unit');
assert.strictEqual(res2b.boms[0].components[0].unit, 'TO', 'Preserved valid MARM unit TO');
console.log('   ✓ Accepted valid alternative unit TO from MARM');

// -----------------------------------------------------------------------------
// Test 3: Batched Material Calls Assert Count + Server-Isolated Cache
// -----------------------------------------------------------------------------
console.log('\n3. Testing batched MARA call assert count + cache:');
clearMaterialUnitsCache();

const client3 = createMockRfcClient({
  maraData: {
    'MAT_HDR_01': { meins: 'EA' },
    'COMP_BATCH_01': { meins: 'ST' },
    'COMP_BATCH_02': { meins: 'M' }
  },
  marcPairs: new Set(['1010|MAT_HDR_01', '1010|COMP_BATCH_01', '1010|COMP_BATCH_02'])
});

// Run job with 3 BOMs, 6 components total, referencing only 2 unique components
const res3FirstRun = await rfcPreflightCreateBoms({
  server: { id: 'SRV_CACHE_TEST' },
  client: client3,
  boms: [
    {
      sequenceNum: '1',
      material: 'MAT_HDR_01',
      plant: '1010',
      alternativeBom: '01',
      components: [
        { itemNo: '0010', component: 'COMP_BATCH_01' },
        { itemNo: '0020', component: 'COMP_BATCH_02' }
      ]
    },
    {
      sequenceNum: '2',
      material: 'MAT_HDR_01',
      plant: '1010',
      alternativeBom: '02',
      components: [
        { itemNo: '0010', component: 'COMP_BATCH_01' },
        { itemNo: '0020', component: 'COMP_BATCH_02' }
      ]
    },
    {
      sequenceNum: '3',
      material: 'MAT_HDR_01',
      plant: '1010',
      alternativeBom: '03',
      components: [
        { itemNo: '0010', component: 'COMP_BATCH_01' },
        { itemNo: '0020', component: 'COMP_BATCH_02' }
      ]
    }
  ]
});

const maraCallsRun1 = client3.callLog.filter(
  (c) => c.rfcName === 'RFC_READ_TABLE' && c.params?.QUERY_TABLE === 'MARA'
).length;

// Unique materials: MAT_HDR_01, COMP_BATCH_01, COMP_BATCH_02 = 3 materials (fits in 1 chunk of 25)
assert.strictEqual(maraCallsRun1, 1, 'Must execute exactly 1 batched MARA query for all unique components');
assert.strictEqual(res3FirstRun.readyCount, 3, 'All 3 BOMs ready');

// Second run on same server: all materials are cached, should execute 0 MARA calls
client3.callLog.length = 0;
const res3SecondRun = await rfcPreflightCreateBoms({
  server: { id: 'SRV_CACHE_TEST' },
  client: client3,
  boms: [
    {
      sequenceNum: '4',
      material: 'MAT_HDR_01',
      plant: '1010',
      alternativeBom: '04',
      components: [{ itemNo: '0010', component: 'COMP_BATCH_01' }]
    }
  ]
});

const maraCallsRun2 = client3.callLog.filter(
  (c) => c.rfcName === 'RFC_READ_TABLE' && c.params?.QUERY_TABLE === 'MARA'
).length;

assert.strictEqual(maraCallsRun2, 0, 'Must execute 0 MARA calls on second run due to server-isolated cache');
console.log('   ✓ Batched MARA calls asserted: exactly 1 call for job, 0 calls on cache hit');

// -----------------------------------------------------------------------------
// Test 4: Existing BOM Detection in MAST (A1PSB001B / 1010 / 1 / 8)
// -----------------------------------------------------------------------------
console.log('\n4. Testing existing BOM detection in MAST:');
clearMaterialUnitsCache();

const client4 = createMockRfcClient({
  existingBoms: [
    {
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '08' // Stored in MAST as 08
    }
  ],
  maraData: {
    'A1PSB001B': { meins: 'EA' },
    '000000000011021735': { meins: 'KG' }
  },
  marcPairs: new Set(['1010|A1PSB001B', '1010|000000000011021735'])
});

// User upload specifies alternativeBom: '8' (unpadded)
const res4 = await rfcPreflightCreateBoms({
  server: { id: 'TEST_SRV_1' },
  client: client4,
  boms: [
    {
      sequenceNum: '1',
      material: 'A1PSB001B',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '8', // Unpadded 8
      components: [{ itemNo: '0010', component: '11021735', quantity: '1' }]
    }
  ]
});

assert.strictEqual(res4.skippedCount, 1, 'Must detect existing BOM and increment skippedCount to 1');
assert.strictEqual(res4.readyCount, 0, 'Ready count must be 0');
assert.strictEqual(res4.boms[0].status, 'Already exists - skipped', 'Status must be Already exists - skipped');
assert.ok(
  res4.boms[0].reason.includes('already exists in plant 1010'),
  'Reason must explain BOM already exists in plant 1010'
);
console.log('   ✓ Correctly flagged existing alternative 8 as "Already exists - skipped" in plant 1010');

// -----------------------------------------------------------------------------
// Test 5: Message Display Order and Neutral Info Style on Failed Rows
// -----------------------------------------------------------------------------
console.log('\n5. Testing message display order and info style on failed rows:');

const failedRow = {
  sequenceNum: '1',
  status: 'FAILED',
  material: 'A1PSB001B',
  plant: '1010',
  message:
    'Alternative 8 already exists in BOM A1PSB001B/1010/1 | Consistency check when creating BOM item was not successful | No instance of object type BOMGroup has been created.'
};

const messages = getExecutionRowMessages(failedRow);

assert.strictEqual(messages.length, 3, 'Must extract 3 itemized messages');
assert.strictEqual(messages[0].type, 'error', 'Primary error must be first with type error');
assert.strictEqual(messages[0].text, 'Alternative 8 already exists in BOM A1PSB001B/1010/1');

assert.strictEqual(messages[1].type, 'info', 'Consistency check follow-on message must have type info');
assert.strictEqual(messages[1].text, 'Consistency check when creating BOM item was not successful');

assert.strictEqual(messages[2].type, 'info', 'No instance follow-on message must have type info');
assert.strictEqual(messages[2].text, 'No instance of object type BOMGroup has been created.');

console.log('   ✓ Primary SAP error ordered first in error style; follow-on messages ordered after with info style');

// -----------------------------------------------------------------------------
// Test 6: Single Create Unit Resolution
// -----------------------------------------------------------------------------
console.log('\n6. Testing Single Create unit resolution:');
clearMaterialUnitsCache();

const client6 = createMockRfcClient({
  maraData: {
    'MAT_SINGLE_01': { meins: 'EA' },
    '000000000011021735': { meins: 'KG' }
  },
  marcPairs: new Set(['1010|MAT_SINGLE_01', '1010|000000000011021735'])
});

// Single Create flow preflight:
const preflightSingle = await rfcPreflightCreateBoms({
  server: { id: 'SRV_SINGLE' },
  client: client6,
  boms: [
    {
      material: 'MAT_SINGLE_01',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      components: [
        {
          component: '11021735', // No unit in UI form
          quantity: '3'
        }
      ]
    }
  ]
});

assert.strictEqual(preflightSingle.readyCount, 1);
const validatedSingleBom = preflightSingle.boms[0];
assert.strictEqual(validatedSingleBom.components[0].unit, 'KG', 'Single create preflight resolved unit to KG');

// Now call createBomFromData with validated single BOM (in mock mode):
process.env.USE_MOCK_SAP = 'true';
const createRes = await createBomFromData({
  bom: validatedSingleBom,
  server: { id: 'SRV_SINGLE' },
  user: { email: 'single_test@company.com' }
});

assert.strictEqual(createRes.success, true);
assert.strictEqual(createRes.after.components[0].unit, 'KG', 'Component unit passed to create must be KG');
console.log('   ✓ Single Create resolved component unit to KG and preserved it through create payload');

console.log('\n============================================================');
console.log('  ALL BULK CREATE BOM UNIT & EXISTING TESTS PASSED!         ');
console.log('============================================================');
