process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';
process.env.USE_MOCK_SUPABASE = 'true';
process.env.SKIP_GATEWAY_AUTH = 'false';
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = '01234567890123456789012345678901';
}

import assert from 'node:assert/strict';
import { inMemorySupabase } from '../services/supabaseClient.js';
import {
  rfcCreateBom,
  rfcReadBom,
  rfcChangeBom,
  rfcCopyBom,
  rfcDeleteBom,
  rfcSimulateCopyBom,
  rfcValidateSourceBom,
  rfcGetBomDisplayData,
  batchReadBomHierarchy,
  rfcBatchValidateBoms,
  rfcBatchCopyBoms,
  getActiveMockBoms,
  assertResolvedServer
} from '../services/sapRfcClient.js';
import {
  rfcPreflightCreateBoms,
  rfcVerifyCreatedBom,
  createBomFromData,
  rfcBatchCreateBoms
} from '../services/bomCreateEngine.js';
import { getPlants } from '../services/plantService.js';
import { getStorageLocations } from '../services/storageLocationService.js';
import { searchMaterials, getMaterialDetail } from '../services/materialSearchService.js';
import { searchMaterialsByOption } from '../services/searchByOptionService.js';
import { getBomUsages } from '../services/bomUsageService.js';
import { runSearchRfc } from '../services/searchRfcClient.js';
import { bomJobManager } from '../services/bomJobManager.js';

const ownedServer = {
  id: 'srv-test-owner',
  name: 'Owned Test SAP',
  ashost: '127.0.0.1',
  sysnr: '00',
  client: '100',
  lang: 'EN',
  owner_id: 'usr-test-owner',
  is_disabled: false
};

const userTestOwner = {
  id: 'usr-test-owner',
  email: 'owner@rexaedge.test'
};

async function runExplicitServerContextTests() {
  console.log('\n================================================================');
  console.log('--- RFC Explicit Server Context Verification & Guard Tests ---');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function runSubTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // REQUIREMENT 3: Functional paths with explicit owned server
  // -------------------------------------------------------------------------
  console.log('Requirement 3: Functional paths with explicit owned server');

  await runSubTest('Single Create (preflight/validate) with explicit server', async () => {
    const res = await rfcPreflightCreateBoms({
      boms: [{
        material: 'TEST_MAT_CREATE',
        plant: '1010',
        bomUsage: '1',
        items: [{ itemNumber: '0010', component: 'COMP1', quantity: '1', componentUnit: 'PC' }]
      }],
      server: ownedServer
    });
    assert.ok(res, 'Should return preflight result');
  });

  await runSubTest('Single Create (execute createBomFromData) with explicit server', async () => {
    const res = await createBomFromData({
      bom: {
        material: 'TEST_MAT_CREATE_EXEC',
        plant: '1010',
        bomUsage: '1',
        items: [{ itemNumber: '0010', component: 'COMP1', quantity: '1', unit: 'PC' }],
        status: 'Ready'
      },
      server: ownedServer
    });
    assert.ok(res, 'Should create BOM successfully');
  });

  await runSubTest('Single Create (execute rfcCreateBom) with explicit server', async () => {
    const res = await rfcCreateBom({
      material: 'TEST_MAT_RFC_CREATE',
      plant: '1010',
      bomUsage: '1',
      items: [{ itemNumber: '0010', component: 'COMP1', quantity: '1', componentUnit: 'PC' }],
      server: ownedServer
    });
    assert.ok(res, 'Should return created result');
  });

  await runSubTest('Bulk Create (preflight/validate) with explicit server', async () => {
    const res = await rfcPreflightCreateBoms({
      boms: [
        {
          material: 'TEST_BULK_CR_1',
          plant: '1010',
          bomUsage: '1',
          items: [{ itemNumber: '0010', component: 'COMP1', quantity: '1', componentUnit: 'PC' }]
        },
        {
          material: 'TEST_BULK_CR_2',
          plant: '1010',
          bomUsage: '1',
          items: [{ itemNumber: '0010', component: 'COMP2', quantity: '2', componentUnit: 'PC' }]
        }
      ],
      server: ownedServer
    });
    assert.ok(Array.isArray(res.boms), 'Should return boms array');
  });

  await runSubTest('Bulk Create (execute rfcBatchCreateBoms) with explicit server', async () => {
    const res = await rfcBatchCreateBoms({
      boms: [{
        material: 'TEST_BULK_CR_3',
        plant: '1010',
        bomUsage: '1',
        items: [{ itemNumber: '0010', component: 'COMP1', quantity: '1', componentUnit: 'PC' }]
      }],
      server: ownedServer
    });
    assert.ok(Array.isArray(res.results), 'Should return results array');
  });

  await runSubTest('Single Copy (validate rfcSimulateCopyBom) with explicit server', async () => {
    const res = await rfcSimulateCopyBom({
      sourceMaterial: 'A1BH0214C',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAlternative: '01',
      targetMaterial: 'A1BH0214C_CP1',
      targetPlant: '1012',
      targetUsage: '1',
      server: ownedServer
    });
    assert.ok(res, 'Should simulate copy successfully');
  });

  await runSubTest('Single Copy (execute rfcCopyBom) with explicit server', async () => {
    const res = await rfcCopyBom({
      sourceMaterial: 'A1BH0214C',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAlternative: '01',
      targetMaterial: 'A1BH0214C_CP2',
      targetPlant: '1012',
      targetUsage: '1',
      server: ownedServer
    });
    assert.ok(res, 'Should execute copy successfully');
  });

  await runSubTest('Bulk Copy (validate rfcBatchValidateBoms) with explicit server', async () => {
    const res = await rfcBatchValidateBoms(
      [{
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        targetMaterial: 'A1BH0214C_BULK1',
        targetPlant: '1012',
        targetUsage: '1'
      }],
      { server: ownedServer }
    );
    assert.ok(Array.isArray(res.results), 'Should return validation results array');
  });

  await runSubTest('Bulk Copy (execute rfcBatchCopyBoms) with explicit server', async () => {
    const res = await rfcBatchCopyBoms(
      [{
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        targetMaterial: 'A1BH0214C_BULK2',
        targetPlant: '1012',
        targetUsage: '1'
      }],
      { server: ownedServer }
    );
    assert.ok(Array.isArray(res.results), 'Should return copy results array');
  });

  await runSubTest('Delete BOM (rfcDeleteBom) with explicit server', async () => {
    const mockList = getActiveMockBoms();
    mockList.push({
      material: 'MAT_TO_DELETE',
      plant: '1012',
      usage: '1',
      alternative: '01',
      items: []
    });
    const res = await rfcDeleteBom({
      material: 'MAT_TO_DELETE',
      plant: '1012',
      bomUsage: '1',
      alternative: '01',
      server: ownedServer
    });
    assert.ok(res, 'Should return delete result');
  });

  await runSubTest('Validate BOM (rfcValidateSourceBom) with explicit server', async () => {
    const res = await rfcValidateSourceBom({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternativeBom: '01',
      server: ownedServer
    });
    assert.ok(res.bomExists !== undefined || res.success !== undefined, 'Should validate source BOM exists');
  });

  await runSubTest('Display BOM (single level) with explicit server', async () => {
    const res = await rfcGetBomDisplayData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternative: '01',
      multiLevel: false,
      server: ownedServer
    });
    assert.ok(res, 'Should return display data');
  });

  await runSubTest('Display BOM (hierarchy) with explicit server', async () => {
    const res = await rfcGetBomDisplayData({
      material: 'A1BH0214C',
      plant: '1012',
      bomUsage: '1',
      alternative: '01',
      multiLevel: true,
      server: ownedServer
    });
    assert.ok(res, 'Should return multi-level display data');
  });

  await runSubTest('Batch read BOM hierarchy with explicit server', async () => {
    const res = await batchReadBomHierarchy({
      boms: [{ material: 'A1BH0214C', plant: '1012', bomUsage: '1', alternative: '01' }],
      server: ownedServer
    });
    assert.ok(res, 'Should return hierarchy result');
  });

  await runSubTest('BOM Usage (getBomUsages) with explicit server', async () => {
    const res = await getBomUsages({ server: ownedServer });
    assert.ok(Array.isArray(res.data), 'Should return usages data array');
  });

  await runSubTest('F4 Plants (getPlants) with explicit server', async () => {
    const res = await getPlants({ server: ownedServer });
    assert.ok(Array.isArray(res.data), 'Should return plants array');
  });

  await runSubTest('F4 Storage Locations (getStorageLocations) with explicit server', async () => {
    const res = await getStorageLocations({ plant: '1012', server: ownedServer });
    assert.ok(Array.isArray(res.data), 'Should return storage locations array');
  });

  await runSubTest('F4 Material Search (searchMaterials) with explicit server', async () => {
    const res = await searchMaterials({ search: 'A1BH0214C', plant: '1012', server: ownedServer });
    assert.ok(Array.isArray(res), 'Should return materials array');
  });

  await runSubTest('F4 Material Detail (getMaterialDetail) with explicit server', async () => {
    const res = await getMaterialDetail({ matnr: 'A1BH0214C', plant: '1012', server: ownedServer });
    assert.ok(res.matnr !== undefined, 'Should return material detail');
  });

  await runSubTest('F4 Material Search By Option (searchMaterialsByOption) with explicit server', async () => {
    const res = await searchMaterialsByOption({
      tab: 'M',
      fields: { MATNR: 'A1BH0214C' },
      plant: '1012',
      server: ownedServer
    });
    assert.ok(res.data !== undefined, 'Should return option search result');
  });

  await runSubTest('Background job resume after restart: loads server from DB and executes', async () => {
    // Populate inMemorySupabase with server and user
    const dbServer = {
      id: 'srv-db-resumed',
      name: 'Resumed Server',
      ashost: '127.0.0.1',
      sysnr: '00',
      client: '100',
      owner_id: 'usr-job-owner',
      is_disabled: false,
      is_active: true
    };
    inMemorySupabase.servers = inMemorySupabase.servers || [];
    inMemorySupabase.servers.push(dbServer);

    // Create job with server_id only, no in-memory serverRef (simulating post-restart)
    const job = {
      jobId: 'job-resume-test-1',
      id: 'job-resume-test-1',
      type: 'copy_bulk',
      totalItems: 1,
      items: [{
        sourceMaterial: 'A1BH0214C',
        sourcePlant: '1012',
        sourceUsage: '1',
        sourceAlternative: '01',
        targetMaterial: 'A1BH0214C_RESUME',
        targetPlant: '1012',
        targetUsage: '1'
      }],
      userId: 'usr-job-owner',
      userEmail: 'owner@rexaedge.test',
      serverId: 'srv-db-resumed',
      serverName: 'Resumed Server',
      serverRef: null,
      userRef: null,
      status: 'QUEUED',
      options: {}
    };
    bomJobManager.jobs.set(job.jobId, job);

    // Execute job with no passed server, simulating background restart worker
    await bomJobManager.executeJob(job.jobId);

    const reloaded = await bomJobManager.getJob(job.jobId);
    assert.notStrictEqual(reloaded.status, 'FAILED', `Job should not fail with server context error: ${reloaded.error}`);
    assert.strictEqual(reloaded.status, 'COMPLETED', `Job should successfully complete after resolving server from DB`);
  });

  await runSubTest('Background job resume: fails if job user is not the server owner', async () => {
    const job = {
      jobId: 'job-mismatch-test',
      id: 'job-mismatch-test',
      type: 'copy_bulk',
      totalItems: 1,
      items: [],
      userId: 'attacker-user',
      userEmail: 'attacker@rexaedge.test',
      serverId: 'srv-db-resumed',
      serverRef: null,
      status: 'QUEUED'
    };
    bomJobManager.jobs.set(job.jobId, job);

    await bomJobManager.executeJob(job.jobId);
    const reloaded = await bomJobManager.getJob(job.jobId);
    assert.strictEqual(reloaded.status, 'FAILED');
    assert.strictEqual(reloaded.error, 'SAP Server not found.');
  });

  await runSubTest('Background job resume: fails if server is disabled', async () => {
    const disabledServer = {
      id: 'srv-db-disabled',
      name: 'Disabled Server',
      ashost: '127.0.0.1',
      owner_id: 'usr-disabled-owner',
      is_disabled: true,
      is_active: true
    };
    inMemorySupabase.servers.push(disabledServer);

    const job = {
      jobId: 'job-disabled-test',
      id: 'job-disabled-test',
      type: 'copy_bulk',
      totalItems: 1,
      items: [],
      userId: 'usr-disabled-owner',
      userEmail: 'disabled@rexaedge.test',
      serverId: 'srv-db-disabled',
      serverRef: null,
      status: 'QUEUED'
    };
    bomJobManager.jobs.set(job.jobId, job);

    await bomJobManager.executeJob(job.jobId);
    const reloaded = await bomJobManager.getJob(job.jobId);
    assert.strictEqual(reloaded.status, 'FAILED');
    assert.strictEqual(reloaded.error, 'This SAP server is disabled.');
  });

  // -------------------------------------------------------------------------
  // REQUIREMENT 4: Guard tests - must throw when server context is missing
  // -------------------------------------------------------------------------
  console.log('\nRequirement 4: Guard tests failing when called without server argument');

  const guardCallers = [
    { name: 'rfcCreateBom', fn: () => rfcCreateBom({}) },
    { name: 'rfcReadBom', fn: () => rfcReadBom({}) },
    { name: 'rfcChangeBom', fn: () => rfcChangeBom({}) },
    { name: 'rfcCopyBom', fn: () => rfcCopyBom({}) },
    { name: 'rfcDeleteBom', fn: () => rfcDeleteBom({}) },
    { name: 'rfcSimulateCopyBom', fn: () => rfcSimulateCopyBom({}) },
    { name: 'rfcValidateSourceBom', fn: () => rfcValidateSourceBom({}) },
    { name: 'rfcGetBomDisplayData', fn: () => rfcGetBomDisplayData({}) },
    { name: 'batchReadBomHierarchy', fn: () => batchReadBomHierarchy({}) },
    { name: 'rfcBatchValidateBoms', fn: () => rfcBatchValidateBoms([{}], {}) },
    { name: 'rfcBatchCopyBoms', fn: () => rfcBatchCopyBoms([{}], {}) },
    { name: 'rfcPreflightCreateBoms', fn: () => rfcPreflightCreateBoms({}) },
    { name: 'rfcVerifyCreatedBom', fn: () => rfcVerifyCreatedBom({}) },
    { name: 'createBomFromData', fn: () => createBomFromData({}) },
    { name: 'rfcBatchCreateBoms', fn: () => rfcBatchCreateBoms({}) },
    { name: 'getPlants', fn: () => getPlants({}) },
    { name: 'getStorageLocations', fn: () => getStorageLocations({}) },
    { name: 'searchMaterials', fn: () => searchMaterials({}) },
    { name: 'getMaterialDetail', fn: () => getMaterialDetail({}) },
    { name: 'searchMaterialsByOption', fn: () => searchMaterialsByOption({}) },
    { name: 'getBomUsages', fn: () => getBomUsages({}) },
    { name: 'runSearchRfc', fn: () => runSearchRfc({}) },
    { name: 'assertResolvedServer direct guard', fn: () => assertResolvedServer(null, 'testGuard') }
  ];

  for (const { name, fn } of guardCallers) {
    await runSubTest(`Guard: ${name} throws when called without server`, async () => {
      let threw = false;
      try {
        await fn();
      } catch (err) {
        threw = true;
        const isServerRequired =
          err.code === 'SAP_SERVER_REQUIRED' ||
          (err.message && err.message.includes('Called without a resolved SAP server context'));
        assert.ok(
          isServerRequired,
          `Expected SAP_SERVER_REQUIRED or server context error, got: [${err.code}] ${err.message}`
        );
      }
      assert.ok(threw, `Expected ${name} to throw error when server context is missing`);
    });
  }

  console.log('\n================================================================');
  console.log(`Explicit Server Context Tests Completed: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runExplicitServerContextTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
