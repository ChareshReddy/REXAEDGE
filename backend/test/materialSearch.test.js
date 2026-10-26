import assert from 'assert';

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import {
  sanitizeSearchQuery,
  fromSapMatnr,
  MaterialLruCache,
  searchMaterials,
  getMaterialDetail
} from '../services/materialSearchService.js';
import { toSapMatnr, formatRfcTableOptions } from '../services/sapRfcClient.js';

console.log('============================================================');
console.log('  RUNNING MATERIAL SEARCH & STATUS TEST SUITE               ');
console.log('============================================================\n');

// 1. Sanitization & SQL Injection Protection
console.log('1. Testing input sanitization and SQL injection guards...');
{
  // Test single quotes, semicolons, and SQL delimiters stripped
  const maliciousQuery = "' OR '1'='1; DROP TABLE MARA; --";
  const sanitized = sanitizeSearchQuery(maliciousQuery);
  assert(!sanitized.includes("'"), 'Single quotes must be completely stripped');
  assert(!sanitized.includes(';'), 'Semicolons must be completely stripped');
  assert.strictEqual(sanitized, 'OR 11 DROP TABLE MARA --', 'Sanitized result contains only safe allowed characters');

  // Test allowed characters preserved: letters, digits, space, -, _, ., /, *
  const safeQuery = 'AIR-FILTER_01 / V.2 *';
  assert.strictEqual(sanitizeSearchQuery(safeQuery), 'AIR-FILTER_01 / V.2 *');

  // Test length truncated to 40 characters
  const longQuery = 'A'.repeat(60);
  assert.strictEqual(sanitizeSearchQuery(longQuery).length, 40, 'Query truncated to max 40 chars');

  // Test rejection when trimmed query < 2 characters
  assert.rejects(
    async () => {
      await searchMaterials({ query: 'A', server: { id: 'test_srv' } });
    },
    /at least 2 characters/,
    'Queries with < 2 characters must throw 400 error'
  );

  console.log('   ✓ Input sanitization removes dangerous SQL characters and enforces length limits');
}

// 2. Numeric Padding & Formatting (toSapMatnr / fromSapMatnr)
console.log('2. Testing SAP numeric padding and display normalization...');
{
  // Padding
  assert.strictEqual(toSapMatnr('11021735'), '000000000011021735', 'Numeric material padded to 18 digits');
  assert.strictEqual(toSapMatnr('A1BH0214C'), 'A1BH0214C', 'Alphanumeric material remains unchanged');

  // Unpadding for display
  assert.strictEqual(fromSapMatnr('000000000011021735'), '11021735', 'Leading zeros trimmed from numeric SAP material');
  assert.strictEqual(fromSapMatnr('A1BH0214C'), 'A1BH0214C', 'Alphanumeric material unchanged on display');
  assert.strictEqual(fromSapMatnr('000123'), '123', 'Small numeric leading zeros trimmed');
  assert.strictEqual(fromSapMatnr(''), '', 'Empty string handled safely');

  console.log('   ✓ SAP 18-digit padding and display unpadding work accurately');
}

// 3. Multi-Word Tokenization & RFC Options Formatting
console.log('3. Testing multi-word search query formatting for MAKT...');
{
  const tokens = ['STEEL', 'BOLT'];
  const descClause = tokens.map((tok) => `MAKTG LIKE '%${tok}%'`).join(' AND ');
  const maktWhere = `SPRAS = 'E' AND ( ${descClause} )`;
  const options = formatRfcTableOptions(maktWhere);

  assert(Array.isArray(options), 'OPTIONS must be an array of table rows');
  options.forEach((opt) => {
    assert(opt.TEXT.length <= 70, `Option line length must be <= 70 chars: "${opt.TEXT}"`);
  });
  const reassembled = options.map((o) => o.TEXT).join(' ');
  assert(reassembled.includes("MAKTG LIKE '%STEEL%'"), 'Options must contain first token');
  assert(reassembled.includes("MAKTG LIKE '%BOLT%'"), 'Options must contain second token');
  assert(reassembled.includes('AND'), 'Tokens must be joined by AND');

  console.log('   ✓ Multi-word tokens correctly joined and formatted into <= 70 character RFC table chunks');
}

// 4. In-Memory LRU Cache & Server Isolation
console.log('4. Testing In-Memory LRU Cache with per-server isolation and TTL...');
{
  const testCache = new MaterialLruCache(3);

  // Set entries for different servers
  testCache.set('server1:1001:AIR:flags', [{ matnr: 'MAT_1' }], 1000);
  testCache.set('server2:1001:AIR:flags', [{ matnr: 'MAT_2' }], 1000);

  // Verify server isolation
  const s1Result = testCache.get('server1:1001:AIR:flags');
  const s2Result = testCache.get('server2:1001:AIR:flags');
  assert.strictEqual(s1Result[0].matnr, 'MAT_1', 'Server 1 cache isolated');
  assert.strictEqual(s2Result[0].matnr, 'MAT_2', 'Server 2 cache isolated');

  // Test LRU eviction when exceeding max capacity (3)
  testCache.set('server1:1001:BOLT:flags', [{ matnr: 'MAT_3' }], 1000);
  testCache.set('server1:1001:SCREW:flags', [{ matnr: 'MAT_4' }], 1000);

  // Oldest un-refreshed entry (server1:1001:AIR:flags) should be evicted
  assert.strictEqual(testCache.get('server1:1001:AIR:flags'), null, 'Oldest entry evicted on overflow');
  assert.strictEqual(testCache.size(), 3, 'Cache capacity maintained at max size');

  // Test TTL expiration
  testCache.set('expired_key', [{ matnr: 'EXPIRED' }], -10); // already expired
  assert.strictEqual(testCache.get('expired_key'), null, 'Expired item returns null');

  console.log('   ✓ LRU Cache enforces capacity, per-server isolation, and TTL eviction');
}

// 5. Search Execution with Mock RFC Client (Plant filter, MTART filter, BOM check)
console.log('5. Testing search execution with plant filter, MTART filter & BOM status...');
{
  // Test search in plant 1001
  const res1001 = await searchMaterials({
    query: 'AIR',
    plant: '1001',
    limit: 20,
    checkBom: true
  });

  assert(Array.isArray(res1001), 'Search must return array of results');
  assert(res1001.length > 0, 'Must match mock AIR materials');
  res1001.forEach((item) => {
    assert(item.matnr, 'Result item must have matnr');
    assert(item.maktx.includes('AIR'), 'Description must match search term');
    assert.strictEqual(item.extendedInPlant, true, 'extendedInPlant must be true when plant matches');
  });

  // Test search with plant where material is NOT extended
  const res9999 = await searchMaterials({
    query: 'AIR',
    plant: '9999',
    limit: 20
  });
  assert.strictEqual(res9999.length, 0, 'No materials returned for unextended plant 9999');

  // Test MTART filter (only ROH)
  const resRoh = await searchMaterials({
    query: 'BAHAMAS',
    mtart: 'ROH',
    limit: 20
  });
  assert.strictEqual(resRoh.length, 0, 'HALB material A1BH0214C must be excluded when mtart=ROH');

  const resHalb = await searchMaterials({
    query: 'BAHAMAS',
    mtart: 'HALB',
    limit: 20
  });
  assert(resHalb.length > 0, 'HALB material A1BH0214C must match when mtart=HALB');
  assert.strictEqual(resHalb[0].mtart, 'HALB');

  // Test BOM existence flag
  const resWithBom = await searchMaterials({
    query: 'A1BH0214C',
    checkBom: true
  });
  assert.strictEqual(resWithBom[0].hasBom, true, 'A1BH0214C must have hasBom: true');

  console.log('   ✓ Plant scoping, MTART filtering, and BOM status resolution verified');
}

// 6. Status Text Mapping & Deletion Flag (LVORM)
console.log('6. Testing material status mapping and deletion flag...');
{
  // Material with status code '01'
  const serviceDetail = await getMaterialDetail({
    matnr: 'SM0001',
    plant: '1710'
  });
  assert.strictEqual(serviceDetail.matnr, 'SM0001');
  assert.strictEqual(serviceDetail.mmsta, '01');
  assert.strictEqual(serviceDetail.statusText, 'Design', 'Status 01 must map to description Design');

  // Material with LVORM = 'X' (deletion flag)
  const obsoleteDetail = await getMaterialDetail({
    matnr: 'MAT_OBSOLETE_01',
    plant: '1001'
  });
  assert.strictEqual(obsoleteDetail.lvorm, 'X', 'Deletion flag LVORM must be returned');

  console.log('   ✓ Status codes, T141T texts, and LVORM deletion flags mapped accurately');
}

// 7. Error Handling & Fail-Closed Behavior (No Silent Fallback)
console.log('7. Testing explicit error handling and non-existent material detail...');
{
  // Request non-existent material detail must throw 404
  await assert.rejects(
    async () => {
      await getMaterialDetail({ matnr: 'NON_EXISTENT_999' });
    },
    (err) => {
      assert.strictEqual(err.status, 404, 'Non-existent material returns 404 status');
      assert(err.message.includes('not found in SAP'), 'Error message is explicit');
      return true;
    }
  );

  console.log('   ✓ Missing material throws explicit 404 error (never silent fallback)');
}

// 8. Detail Isolation & Plant Filter Strict Enforcement (Bug 8 & Bug 9 verification)
console.log('8. Testing detail isolation and strict plant filter enforcement...');
{
  // (a) Detail isolation: Concurrent fetches for different materials must never cross-contaminate
  const [detailA, detailB] = await Promise.all([
    getMaterialDetail({ matnr: 'A1BH0214C', plant: '1001' }),
    getMaterialDetail({ matnr: 'SM0001', plant: '1710' })
  ]);

  assert.strictEqual(detailA.matnr, 'A1BH0214C', 'Detail A must belong strictly to A1BH0214C');
  assert.strictEqual(detailA.mtart, 'HALB', 'Detail A type must be HALB');
  assert.strictEqual(detailB.matnr, 'SM0001', 'Detail B must belong strictly to SM0001');
  assert.strictEqual(detailB.mtart, 'SERV', 'Detail B type must be SERV');
  assert.notStrictEqual(detailA.matnr, detailB.matnr, 'Detail objects are strictly isolated');

  // (b) Strict plant filter enforcement:
  // Material 13000340 is only extended in plant 1001 (not in 1012 or 1710)
  const resIn1001 = await searchMaterials({ query: '13000340', plant: '1001' });
  assert.strictEqual(resIn1001.length, 1, 'Material 13000340 returned when plant=1001');
  assert.strictEqual(resIn1001[0].extendedInPlant, true, 'extendedInPlant is true for maintained plant');

  const resIn1012 = await searchMaterials({ query: '13000340', plant: '1012' });
  assert.strictEqual(resIn1012.length, 0, 'Material 13000340 strictly excluded when plant=1012');

  const resIn1710 = await searchMaterials({ query: '13000340', plant: '1710' });
  assert.strictEqual(resIn1710.length, 0, 'Material 13000340 strictly excluded when plant=1710');

  console.log('   ✓ Detail isolation and strict plant filtering verified without cross-contamination');
}

console.log('\n============================================================');
console.log('  ALL MATERIAL SEARCH & STATUS TESTS PASSED (100%)          ');
console.log('============================================================\n');
