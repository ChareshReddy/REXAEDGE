import assert from 'assert';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import { getMaterialDetail } from '../services/materialSearchService.js';
import { getPlants, clearPlantCache } from '../services/plantService.js';

console.log('============================================================');
console.log('  RUNNING MATERIAL & PLANT SERVICE PARITY TEST SUITE        ');
console.log('============================================================\n');

// 1. Parity check on A1BH0214C
console.log('1. Testing plant parity for material A1BH0214C...');
{
  clearPlantCache();
  const server = { id: 'PARITY_SERVER', ashost: 'mock_host' };

  const [detailRes, plantRes] = await Promise.all([
    getMaterialDetail({ matnr: 'A1BH0214C', server }),
    getPlants({ server, material: 'A1BH0214C' })
  ]);

  const detailPlants = [...(detailRes.plants || [])].sort();
  const maintainedPlants = plantRes.data.filter((p) => p.isExtended).map((p) => p.werks).sort();

  console.log('   getMaterialDetail plants:', detailPlants);
  console.log('   getPlants maintained plants:', maintainedPlants);

  assert.deepStrictEqual(
    detailPlants,
    maintainedPlants,
    'Both endpoints must return the exact same plants for material A1BH0214C'
  );
  console.log('   ✓ getMaterialDetail and getPlants returned identical maintained plants for A1BH0214C');
}

// 2. Parity check on 11021735 (numeric material)
console.log('\n2. Testing plant parity for numeric material 11021735...');
{
  clearPlantCache();
  const server = { id: 'PARITY_SERVER', ashost: 'mock_host' };

  const [detailRes, plantRes] = await Promise.all([
    getMaterialDetail({ matnr: '11021735', server }),
    getPlants({ server, material: '11021735' })
  ]);

  const detailPlants = [...(detailRes.plants || [])].sort();
  const maintainedPlants = plantRes.data.filter((p) => p.isExtended).map((p) => p.werks).sort();

  console.log('   getMaterialDetail plants:', detailPlants);
  console.log('   getPlants maintained plants:', maintainedPlants);

  assert.deepStrictEqual(
    detailPlants,
    maintainedPlants,
    'Both endpoints must return the exact same plants for material 11021735'
  );
  console.log('   ✓ getMaterialDetail and getPlants returned identical maintained plants for 11021735');
}

// 3. Parity check on SM0001
console.log('\n3. Testing plant parity for service material SM0001...');
{
  clearPlantCache();
  const server = { id: 'PARITY_SERVER', ashost: 'mock_host' };

  const [detailRes, plantRes] = await Promise.all([
    getMaterialDetail({ matnr: 'SM0001', server }),
    getPlants({ server, material: 'SM0001' })
  ]);

  const detailPlants = [...(detailRes.plants || [])].sort();
  const maintainedPlants = plantRes.data.filter((p) => p.isExtended).map((p) => p.werks).sort();

  console.log('   getMaterialDetail plants:', detailPlants);
  console.log('   getPlants maintained plants:', maintainedPlants);

  assert.deepStrictEqual(
    detailPlants,
    maintainedPlants,
    'Both endpoints must return the exact same plants for material SM0001'
  );
  console.log('   ✓ getMaterialDetail and getPlants returned identical maintained plants for SM0001');
}

console.log('\n============================================================');
console.log('  ALL MATERIAL & PLANT PARITY TESTS PASSED (100%)           ');
console.log('============================================================');
