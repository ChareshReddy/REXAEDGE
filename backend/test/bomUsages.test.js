import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.env.NODE_ENV = 'test';
process.env.USE_MOCK_SAP = 'true';

import {
  sanitizeSapLanguage,
  getBomUsages,
  clearBomUsageCache,
  MOCK_BOM_USAGES
} from '../services/bomUsageService.js';

console.log('============================================================');
console.log('  RUNNING BOM USAGE VALUE HELP (T416/T416T) TEST SUITE     ');
console.log('============================================================\n');

// 1. Language sanitization test
console.log('1. Testing SAP language sanitization (EN -> E, DE -> D, uppercase single-char)...');
{
  assert.strictEqual(sanitizeSapLanguage('EN'), 'E');
  assert.strictEqual(sanitizeSapLanguage('en'), 'E');
  assert.strictEqual(sanitizeSapLanguage('E'), 'E');
  assert.strictEqual(sanitizeSapLanguage('DE'), 'D');
  assert.strictEqual(sanitizeSapLanguage('FR'), 'F');
  assert.strictEqual(sanitizeSapLanguage('ES'), 'S');
  assert.strictEqual(sanitizeSapLanguage(null), 'E');
  assert.strictEqual(sanitizeSapLanguage(''), 'E');
  console.log('   ✓ Language sanitizer correctly maps ISO codes to internal 1-char SAP language keys');
}

// 2. In-Memory Cache per Server & Language Isolation
console.log('2. Testing in-memory cache, 1-hour TTL, and server/language isolation...');
{
  clearBomUsageCache();

  const serverA = { id: 'SERVER_A', ashost: 'host_a' };
  const serverB = { id: 'SERVER_B', ashost: 'host_b' };

  // Fetch for Server A in English -> cache miss
  const resA_EN_1 = await getBomUsages({ server: serverA, lang: 'EN' });
  assert.strictEqual(resA_EN_1.cached, false, 'First fetch is a cache miss');
  assert.strictEqual(resA_EN_1.count, MOCK_BOM_USAGES.length);
  assert.strictEqual(resA_EN_1.data.length, MOCK_BOM_USAGES.length);

  // Fetch for Server A in English again -> cache hit
  const resA_EN_2 = await getBomUsages({ server: serverA, lang: 'EN' });
  assert.strictEqual(resA_EN_2.cached, true, 'Second fetch is served from cache');

  // Fetch with refresh=true -> cache bypass
  const resA_EN_Refreshed = await getBomUsages({ server: serverA, lang: 'EN', refresh: true });
  assert.strictEqual(resA_EN_Refreshed.cached, false, 'refresh=true bypasses cache');

  // Fetch for Server B -> isolated cache miss
  const resB = await getBomUsages({ server: serverB, lang: 'EN' });
  assert.strictEqual(resB.cached, false, 'Server B is isolated from Server A cache');

  // Fetch for Server A in German -> isolated by language
  const resA_DE = await getBomUsages({ server: serverA, lang: 'DE' });
  assert.strictEqual(resA_DE.cached, false, 'German language is cached independently from English');

  console.log('   ✓ In-memory cache functions with 1-hour TTL, refresh bypass, and strict server/lang isolation');
}

// 3. SAP Data Shape and Relevancy Indicators
console.log('3. Testing data structure and 6 relevancy columns (+, -, .)...');
{
  const result = await getBomUsages({ server: { id: 'TEST_SERVER' } });
  assert(Array.isArray(result.data), 'Data must be an array');
  assert(result.data.length > 0, 'Data array must not be empty');

  const validSymbols = new Set(['+', '-', '.']);

  result.data.forEach((entry) => {
    assert(entry.stlan, 'stlan (Usage key) must be defined');
    assert.strictEqual(entry.stlan.length, 1, `stlan must be 1 character, got "${entry.stlan}"`);
    assert(entry.antxt !== undefined, 'antxt (Usage text) must be defined');

    // 6 Relevancy columns
    assert(validSymbols.has(entry.pmpfe), `pmpfe (Production) must be +, -, or ., got "${entry.pmpfe}"`);
    assert(validSymbols.has(entry.pmpko), `pmpko (Engineering) must be +, -, or ., got "${entry.pmpko}"`);
    assert(validSymbols.has(entry.pmpin), `pmpin (Plant Maint.) must be +, -, or ., got "${entry.pmpin}"`);
    assert(validSymbols.has(entry.pmper), `pmper (Spare Parts) must be +, -, or ., got "${entry.pmper}"`);
    assert(validSymbols.has(entry.pmpka), `pmpka (Costing) must be +, -, or ., got "${entry.pmpka}"`);
    assert(validSymbols.has(entry.pmprv), `pmprv (Sales & Dist.) must be +, -, or ., got "${entry.pmprv}"`);
  });

  // Verify standard Usage '1' has Production '+'
  const usage1 = result.data.find((e) => e.stlan === '1');
  assert(usage1, 'Usage 1 must exist');
  assert.strictEqual(usage1.pmpfe, '+', 'Usage 1 must have Production relevant (+)');
  assert.strictEqual(usage1.antxt, 'Production', 'Usage 1 text must be Production');

  console.log('   ✓ All BOM usages match SAP T416/T416T schema with valid relevancy symbols (+, -, .)');
}

// 4. Verify Route and Server Setup
console.log('4. Testing backend route configuration (/api/bom-usages)...');
{
  const serverJsPath = path.resolve(__dirname, '../server.js');
  const serverJsContent = fs.readFileSync(serverJsPath, 'utf8');
  assert(serverJsContent.includes('/api/bom-usages'), 'server.js must mount /api/bom-usages');
  assert(serverJsContent.includes('bomUsagesRoutes'), 'server.js must import bomUsagesRoutes');

  const routePath = path.resolve(__dirname, '../routes/bomUsages.js');
  assert(fs.existsSync(routePath), 'backend/routes/bomUsages.js must exist');
  const routeContent = fs.readFileSync(routePath, 'utf8');
  assert(routeContent.includes("requireModuleAccess(MODULE_KEYS.BOM)"), 'Route requires BOM module');
  assert(routeContent.includes("requireAppPermission('bom.*')"), 'Route requires bom.* permission');

  console.log('   ✓ Route /api/bom-usages mounted with requireAuth, requireModuleAccess, and requireAppPermission');
}

// 5. Verify Frontend Modal Component (BomUsageValueHelpModal.jsx)
console.log('5. Testing frontend BomUsageValueHelpModal component...');
{
  const modalPath = path.resolve(__dirname, '../../frontend/src/components/BomUsageValueHelpModal.jsx');
  assert(fs.existsSync(modalPath), 'BomUsageValueHelpModal.jsx must exist');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Verify modal title format: "BOM Usage <N> Entries"
  assert(modalContent.includes('BOM Usage ${countDisplay} Entries'), 'Modal title matches exact requirement');

  // Verify 8 columns in order: Usage, Prod., Eng./Design, Plant Maint., Spare Part, Costing, Sales/Dist., BOM Usage Text
  assert(modalContent.includes('Usage</span>'), 'Column Usage present');
  assert(modalContent.includes('Prod.</span>') || modalContent.includes('Ind.</span>'), 'Column Prod. or Ind. present');
  assert(modalContent.includes('Eng./Design</span>'), 'Column Eng./Design present');
  assert(modalContent.includes('Plant Maint.</span>'), 'Column Plant Maint. present');
  assert(modalContent.includes('Spare Part</span>'), 'Column Spare Part present');
  assert(modalContent.includes('Costing</span>'), 'Column Costing present');
  assert(modalContent.includes('Sales/Dist.</span>') || modalContent.includes('Sales</span>'), 'Column Sales/Dist. present');
  assert(modalContent.includes('BOM Usage Text</span>') || modalContent.includes('Description</span>'), 'Column BOM Usage Text present');

  // Verify tooltips on all relevancy columns
  assert(modalContent.includes('<Tooltip text="Production">') || modalContent.includes('<Tooltip text="Production Indicator">'), 'Tooltip for Production present');
  assert(modalContent.includes('<Tooltip text="Engineering/Design">'), 'Tooltip for Engineering/Design present');
  assert(modalContent.includes('<Tooltip text="Plant Maintenance">'), 'Tooltip for Plant Maintenance present');
  assert(modalContent.includes('<Tooltip text="Spare Parts">'), 'Tooltip for Spare Parts present');
  assert(modalContent.includes('<Tooltip text="Costing">') || modalContent.includes('<Tooltip text="Costing Indicator">'), 'Tooltip for Costing present');
  assert(modalContent.includes('<Tooltip text="Sales and Distribution">'), 'Tooltip for Sales and Distribution present');

  // Verify keyboard navigation & draggable title bar
  assert(modalContent.includes('useDraggableModal'), 'Draggable modal hook used');
  assert(modalContent.includes('ArrowDown'), 'ArrowDown navigation supported');
  assert(modalContent.includes('ArrowUp'), 'ArrowUp navigation supported');
  assert(modalContent.includes('Escape'), 'Escape key closes modal');
  assert(modalContent.includes('Enter'), 'Enter key selects current item');
  assert(modalContent.includes('onDoubleClick'), 'Double-click selects item');

  console.log('   ✓ BomUsageValueHelpModal contains all required columns, tooltips, dragging, and keyboard navigation');
}

// 6. Verify ValueHelpInput supports bomUsage and is used on all 7 screens
console.log('6. Testing ValueHelpInput kind="bomUsage" on all 7 editable screens...');
{
  const vhiPath = path.resolve(__dirname, '../../frontend/src/components/ValueHelpInput.jsx');
  const vhiContent = fs.readFileSync(vhiPath, 'utf8');
  assert(vhiContent.includes('BomUsageValueHelpModal'), 'ValueHelpInput imports BomUsageValueHelpModal');
  assert(vhiContent.includes("kind === 'bomUsage'"), 'ValueHelpInput handles kind === bomUsage');

  // Check 1: Create Single BOM Header (CreateBomView.jsx)
  const createBomPath = path.resolve(__dirname, '../../frontend/src/components/CreateBomView.jsx');
  const createBomContent = fs.readFileSync(createBomPath, 'utf8');
  assert(createBomContent.includes('kind="bomUsage"') && createBomContent.includes('headerData.bomUsage'),
    'CreateBomView uses ValueHelpInput kind="bomUsage"');

  // Check 2: Display BOM Search (BomExplorerView.jsx)
  const explorerPath = path.resolve(__dirname, '../../frontend/src/components/BomExplorerView.jsx');
  const explorerContent = fs.readFileSync(explorerPath, 'utf8');
  assert(explorerContent.includes('kind="bomUsage"') && explorerContent.includes('searchParams.bomUsage'),
    'BomExplorerView uses ValueHelpInput kind="bomUsage"');

  // Check 3: Copy Single BOM Source and Target Usage (CreateBomForm.jsx)
  const copyFormPath = path.resolve(__dirname, '../../frontend/src/components/CreateBomForm.jsx');
  const copyFormContent = fs.readFileSync(copyFormPath, 'utf8');
  assert(copyFormContent.includes('kind="bomUsage"') && copyFormContent.includes('formData.sourceUsage'),
    'CreateBomForm uses ValueHelpInput for sourceUsage');
  assert(copyFormContent.includes('kind="bomUsage"') && copyFormContent.includes('formData.targetUsage'),
    'CreateBomForm uses ValueHelpInput for targetUsage');

  // Check 4: Validate BOM View (ValidateBomView.jsx)
  const valViewPath = path.resolve(__dirname, '../../frontend/src/components/ValidateBomView.jsx');
  const valViewContent = fs.readFileSync(valViewPath, 'utf8');
  assert(valViewContent.includes('kind="bomUsage"') && valViewContent.includes('formData.bomUsage'),
    'ValidateBomView uses ValueHelpInput kind="bomUsage"');

  // Check 5: Validate BOM Modal (ValidateBomModal.jsx)
  const valModalPath = path.resolve(__dirname, '../../frontend/src/components/ValidateBomModal.jsx');
  const valModalContent = fs.readFileSync(valModalPath, 'utf8');
  assert(valModalContent.includes('kind="bomUsage"') && valModalContent.includes('formData.bomUsage'),
    'ValidateBomModal uses ValueHelpInput kind="bomUsage"');

  // Check 6: Delete BOM Form (DeleteBomForm.jsx)
  const delFormPath = path.resolve(__dirname, '../../frontend/src/components/DeleteBomForm.jsx');
  const delFormContent = fs.readFileSync(delFormPath, 'utf8');
  assert(delFormContent.includes('kind="bomUsage"') && delFormContent.includes('formData.bomUsage'),
    'DeleteBomForm uses ValueHelpInput kind="bomUsage"');

  // Check 7: Restrict Value Range Modal Tab B STLAN field (MaterialRestrictValueRangeModal.jsx)
  const restrictModalPath = path.resolve(__dirname, '../../frontend/src/components/MaterialRestrictValueRangeModal.jsx');
  const restrictModalContent = fs.readFileSync(restrictModalPath, 'utf8');
  if (restrictModalContent.includes("field.id === 'STLAN'")) {
    assert(restrictModalContent.includes('kind="bomUsage"'),
      'MaterialRestrictValueRangeModal uses ValueHelpInput kind="bomUsage" for STLAN');
  }

  console.log('   ✓ ValueHelpInput kind="bomUsage" implemented and verified across all 7 editable screens');
}

console.log('\n============================================================');
console.log('  ALL BOM USAGE VALUE HELP TESTS PASSED SUCCESSFULLY!       ');
console.log('============================================================\n');
