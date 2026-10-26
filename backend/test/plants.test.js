import assert from 'assert';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import {
  sanitizePlantQuery,
  getPlants,
  clearPlantCache,
  getPlantCacheEntry,
  MOCK_PLANTS
} from '../services/plantService.js';

console.log('============================================================');
console.log('  RUNNING PLANT SELECTOR (T001W) TEST SUITE                 ');
console.log('============================================================\n');

// 1. Sanitization test
console.log('1. Testing plant search query sanitization (max 20 chars, allowlist)...');
{
  const maliciousQ = "' OR '1'='1; DROP TABLE T001W; --";
  const sanitized = sanitizePlantQuery(maliciousQ);
  assert(!sanitized.includes("'"), 'Single quotes must be stripped');
  assert(!sanitized.includes(';'), 'Semicolons must be stripped');
  assert.strictEqual(sanitized, 'OR 11 DROP TABLE T00', 'Sanitized and capped to 20 chars');

  const safeQ = 'Plant-1001 / City*';
  assert.strictEqual(sanitizePlantQuery(safeQ), 'Plant-1001 / City*');

  console.log('   ✓ Query sanitization enforces allowlist and 20 character length cap');
}

// 2. In-Memory Cache per Server & Server Isolation
console.log('2. Testing plant cache per serverId and cross-server isolation...');
{
  clearPlantCache();

  const serverA = { id: 'SERVER_A', ashost: 'host_a' };
  const serverB = { id: 'SERVER_B', ashost: 'host_b' };

  // Fetch for Server A -> cache miss
  const resA1 = await getPlants({ server: serverA });
  assert.strictEqual(resA1.cached, false, 'First fetch on Server A is not cached');
  assert.strictEqual(resA1.count, MOCK_PLANTS.length);

  // Fetch for Server A again -> cache hit
  const resA2 = await getPlants({ server: serverA });
  assert.strictEqual(resA2.cached, true, 'Second fetch on Server A is served from cache');

  // Fetch for Server B -> must be cache miss (never shared with Server A)
  const resB1 = await getPlants({ server: serverB });
  assert.strictEqual(resB1.cached, false, 'Server B fetch is a cache miss (cache isolated per server)');

  console.log('   ✓ Plant list cached per server and strictly isolated across servers');
}

// 3. TTL Expiration (12 hours)
console.log('3. Testing 12-hour TTL cache expiration...');
{
  const serverTest = { id: 'SERVER_TTL_TEST', ashost: 'host_ttl' };
  clearPlantCache();

  await getPlants({ server: serverTest });
  const entry = getPlantCacheEntry('SERVER_TTL_TEST');
  assert(entry, 'Cache entry exists');
  assert(entry.expiresAt > Date.now() + 11 * 60 * 60 * 1000, 'Expiration set to ~12 hours in future');

  // Simulate expiration
  entry.expiresAt = Date.now() - 1000;
  const expiredRes = await getPlants({ server: serverTest });
  assert.strictEqual(expiredRes.cached, false, 'Expired cache entry triggers fresh fetch');

  console.log('   ✓ 12-hour TTL expiration verified');
}

// 4. Refresh bypass & Rate limit on refresh
console.log('4. Testing manual refresh bypass and 60-second rate limiting...');
{
  clearPlantCache();
  const serverR = { id: 'SERVER_REFRESH', ashost: 'host_refresh' };

  // Initial fetch
  await getPlants({ server: serverR });

  // Admin refresh -> bypasses immediately
  const adminRefresh = await getPlants({ server: serverR, refresh: true, userRole: 'admin' });
  assert.strictEqual(adminRefresh.cached, false, 'Admin refresh bypasses cache');

  // Non-admin refresh immediately after (< 60s cooldown) -> throttled to cached
  const userRefresh1 = await getPlants({ server: serverR, refresh: true, userRole: 'user' });
  assert.strictEqual(userRefresh1.cached, true, 'Non-admin second refresh within 60s is throttled to cache');

  console.log('   ✓ Manual refresh and 60-second non-admin cooldown verified');
}

// 5. Material Extension Ordering (MARC)
console.log('5. Testing material extension ordering (maintained plants first)...');
{
  clearPlantCache();
  const serverMat = { id: 'SERVER_MAT', ashost: 'host_mat' };

  // A1BH0214C is maintained in 1001, 1012, 1034 in mock dataset
  const res = await getPlants({ server: serverMat, material: 'A1BH0214C' });

  assert(Array.isArray(res.data), 'Returns data array');
  assert.strictEqual(res.warning, undefined, 'No warning on successful MARC check');

  // First 3 items must be maintained
  const top3Werks = res.data.slice(0, 3).map((p) => p.werks);
  assert(top3Werks.includes('1001'), 'Plant 1001 is maintained and sorted to top');
  assert(top3Werks.includes('1012'), 'Plant 1012 is maintained and sorted to top');
  assert(top3Werks.includes('1034'), 'Plant 1034 is maintained and sorted to top');

  // Top 3 items have isExtended: true
  assert.strictEqual(res.data[0].isExtended, true);
  assert.strictEqual(res.data[1].isExtended, true);
  assert.strictEqual(res.data[2].isExtended, true);

  // Remaining items have isExtended: false
  assert.strictEqual(res.data[3].isExtended, false);

  console.log('   ✓ Maintained plants sorted to top with isExtended: true');
}

// 6. Resilient Warning on MARC lookup failure
console.log('6. Testing resilient warning when MARC material lookup fails...');
{
  clearPlantCache();
  const serverFail = {
    id: 'SERVER_MARC_FAIL',
    ashost: 'simulated_fail'
  };

  const res = await getPlants({ server: serverFail, material: 'TRIGGER_MARC_ERROR' });

  // Must not fail the whole request
  assert.strictEqual(res.success, true, 'Request still succeeds');
  assert(Array.isArray(res.data), 'Plant list returned');
  assert(res.data.length > 0, 'Plants present');
  assert(res.warning, 'Warning field is present');
  assert(res.warning.includes('could not be completed'), 'Explicit warning message provided');

  console.log('   ✓ MARC error returns plant list with explicit warning (never crashes whole request)');
}

// 7. Filtering by `q` (code, name, city)
console.log('7. Testing in-memory filtering by plant code, name, and city...');
{
  clearPlantCache();
  const serverFilter = { id: 'SERVER_FILTER', ashost: 'host_filter' };

  // Search by code "1012"
  const resCode = await getPlants({ server: serverFilter, q: '1012' });
  assert.strictEqual(resCode.count, 1);
  assert.strictEqual(resCode.data[0].werks, '1012');

  // Search by city "Bhiwadi"
  const resCity = await getPlants({ server: serverFilter, q: 'Bhiwadi' });
  assert(resCity.count >= 2);
  assert(resCity.data.some((p) => p.ort01.includes('Bhiwadi')));

  // Search by name "Relaxo"
  const resName = await getPlants({ server: serverFilter, q: 'Relaxo' });
  assert(resName.count >= 5);

  console.log('   ✓ In-memory search by code, name, and city verified');
}

console.log('\n============================================================');
console.log('  ALL PLANT SELECTOR (T001W) TESTS PASSED (100%)            ');
console.log('============================================================\n');
