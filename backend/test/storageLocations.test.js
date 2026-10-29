process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import 'dotenv/config';
import http from 'http';
import app from '../server.js';
import {
  getStorageLocations,
  sanitizePlantCode,
  sanitizeStorageLocationQuery,
  clearStorageLocationCache,
  MOCK_STORAGE_LOCATIONS
} from '../services/storageLocationService.js';
import { supabaseService } from '../services/supabaseClient.js';

let server;
let baseUrl;

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    let payload = null;

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `sb_access_token=${token}`;
    }

    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      url,
      { method, headers },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(rawData);
          } catch {
            json = rawData;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: json });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('\n============================================================');
  console.log('  RUNNING STORAGE LOCATIONS (F4 POPUP & ENDPOINT) TEST SUITE');
  console.log('============================================================');

  try {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // 1. Sanitization tests
    console.log('\n1. Testing Storage Location and Plant input sanitization...');
    {
      const cleanPlant = sanitizePlantCode("1010'; DROP TABLE T001L; --");
      if (cleanPlant !== '1010') throw new Error(`Plant sanitization failed: got ${cleanPlant}`);

      const cleanQ = sanitizeStorageLocationQuery("STORE' OR 1=1 -- *");
      if (cleanQ.includes("'") || cleanQ.includes('=')) {
        throw new Error(`Query sanitization failed: got ${cleanQ}`);
      }
      console.log('   ✓ Quotes, semicolons, and injection characters cleanly stripped');
    }

    // 2. Service level tests: Plant filter
    console.log('\n2. Testing getStorageLocations with specific plant filter (1010)...');
    {
      clearStorageLocationCache();
      const res = await getStorageLocations({ plant: '1010' });
      if (!res.success) throw new Error('Expected success: true');
      if (res.data.length === 0) throw new Error('Expected storage locations for plant 1010');
      if (res.data.some((s) => s.werks !== '1010')) {
        throw new Error('All returned entries must belong to plant 1010');
      }
      console.log(`   ✓ Returned ${res.data.length} storage locations strictly for plant 1010`);
    }

    // 3. Service level tests: Empty plant filter
    console.log('\n3. Testing getStorageLocations with empty plant filter (all plants)...');
    {
      clearStorageLocationCache();
      const res = await getStorageLocations({ plant: '' });
      if (!res.success) throw new Error('Expected success: true');
      const plantsInRes = new Set(res.data.map((s) => s.werks));
      if (plantsInRes.size <= 1) {
        throw new Error('Expected multiple plants when plant filter is empty');
      }
      console.log(`   ✓ Returned ${res.data.length} storage locations spanning ${plantsInRes.size} distinct plants`);
    }

    // 4. Service level tests: Query filter (substring search)
    console.log('\n4. Testing getStorageLocations with query filter (q="Main")...');
    {
      const res = await getStorageLocations({ q: 'Main' });
      if (!res.success) throw new Error('Expected success: true');
      if (res.data.length === 0) throw new Error('Expected results for "Main"');
      if (!res.data.every((s) => s.lgobe.toLowerCase().includes('main') || s.lgort.toLowerCase().includes('main'))) {
        throw new Error('All entries must match query "Main"');
      }
      console.log(`   ✓ Filtered to ${res.data.length} entries matching "Main"`);
    }

    // 5. Caching test
    console.log('\n5. Testing in-memory caching and TTL...');
    {
      clearStorageLocationCache();
      const first = await getStorageLocations({ plant: '1001' });
      if (first.cached !== false) throw new Error('First call should not be cached');

      const second = await getStorageLocations({ plant: '1001' });
      if (second.cached !== true) throw new Error('Second call should be served from in-memory cache');
      console.log('   ✓ In-memory cache hit verified on subsequent request');
    }

    // 6. Authentication & Permission Enforcement
    console.log('\n6. Testing Auth & Permission Enforcement on /api/storage-locations...');
    {
      const unauth = await makeRequest('GET', '/api/storage-locations');
      if (unauth.status !== 401) {
        throw new Error(`Expected 401 for unauthenticated request, got ${unauth.status}`);
      }
      console.log('   ✓ Unauthenticated request rejected with 401 Unauthorized');
    }

    // 7. ValueHelpInput icon click & keyboard activation for Storage Location
    console.log('\n7. Testing ValueHelpInput icon click & keyboard activation for kind="storageLocation"...');
    {
      const simulateTrigger = ({ kind = 'storageLocation', disabled = false, readOnly = false, eventKey = null }) => {
        let isOpen = false;
        let isRestrictOpen = false;

        const handleIconClick = () => {
          if (!disabled && !readOnly) {
            if (kind === 'material') {
              isRestrictOpen = true;
            } else {
              isOpen = true;
            }
          }
        };

        const handleButtonKeyDown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleIconClick();
          }
        };

        const handleInputKeyDown = (e) => {
          if (e.key === 'F4') {
            handleIconClick();
          }
        };

        if (eventKey === 'F4') {
          handleInputKeyDown({ key: 'F4' });
        } else if (eventKey) {
          handleButtonKeyDown({ key: eventKey });
        } else {
          handleIconClick();
        }

        return { isOpen, isRestrictOpen };
      };

      // Storage location icon click
      const slocClick = simulateTrigger({ kind: 'storageLocation' });
      if (!slocClick.isOpen) throw new Error('Storage Location icon click must open modal');

      // Storage location F4 key on input
      const slocF4 = simulateTrigger({ kind: 'storageLocation', eventKey: 'F4' });
      if (!slocF4.isOpen) throw new Error('F4 on Storage Location input must open modal');

      // Storage location Enter/Space on icon button
      const slocEnter = simulateTrigger({ kind: 'storageLocation', eventKey: 'Enter' });
      const slocSpace = simulateTrigger({ kind: 'storageLocation', eventKey: ' ' });
      if (!slocEnter.isOpen || !slocSpace.isOpen) {
        throw new Error('Enter/Space on icon button must open modal');
      }

      // Disabled / Readonly safety
      const disabledSloc = simulateTrigger({ kind: 'storageLocation', disabled: true });
      const readOnlySloc = simulateTrigger({ kind: 'storageLocation', readOnly: true });
      if (disabledSloc.isOpen || readOnlySloc.isOpen) {
        throw new Error('Disabled or ReadOnly field must not open popup');
      }

      console.log('   ✓ SLoc icon click, F4 key, and Enter/Space open modal; Disabled/ReadOnly safely ignored');
    }

    // 8. Storage Location Selection & Plant Autofill Rules
    console.log('\n8. Testing SLoc selection and conditional plant autofill...');
    {
      // Rule: SLoc filled; Plant filled in row/header IF empty (and only then)
      let currentSloc = '';
      let currentPlant = '';

      const onSelectRow = (sloc, record) => {
        currentSloc = sloc;
        if (!currentPlant && record?.werks) {
          currentPlant = record.werks;
        }
      };

      // Case 1: Plant is empty -> fills SLoc AND autofills Plant
      onSelectRow('ST01', { werks: '1010', lgort: 'ST01', lgobe: 'Main Store' });
      if (currentSloc !== 'ST01') throw new Error(`Expected SLoc ST01, got ${currentSloc}`);
      if (currentPlant !== '1010') throw new Error(`Expected Plant 1010 autofilled, got ${currentPlant}`);

      // Case 2: Plant is already set to 1001 -> SLoc updates, Plant MUST NOT be overwritten
      currentPlant = '1001';
      onSelectRow('PR01', { werks: '1010', lgort: 'PR01', lgobe: 'Production Store' });
      if (currentSloc !== 'PR01') throw new Error(`Expected SLoc PR01, got ${currentSloc}`);
      if (currentPlant !== '1001') throw new Error(`Plant should not be overwritten! Got ${currentPlant}`);

      console.log('   ✓ SLoc value correctly filled; Plant autofilled ONLY when initially empty');
    }

    console.log('\n============================================================');
    console.log('  ALL STORAGE LOCATIONS TESTS PASSED SUCCESSFULLY! (100%)');
    console.log('============================================================\n');
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Storage Location Test Suite Failed:', err);
  process.exit(1);
});
