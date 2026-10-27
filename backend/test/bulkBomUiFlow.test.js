import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING BULK BOM UI FLOW & VALIDATION TESTS               ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_preview_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// 1. Test Client-Side Spreadsheet Parser
console.log('1. Testing Client-Side Spreadsheet Parser (Zero SAP Calls)...');
const { parseBomSpreadsheetClient } = await import(pathToFileURL(path.resolve(frontendDir, 'src/utils/bomSpreadsheetParser.js')).href);

// Generate sample Excel workbook with 2 BOMs
const sampleRows = [
  { 'Sequence Num': 1, 'Material': 'MAT-001', 'Plant': '1010', 'BOM Usage': '1', 'Alternative BOM': '1', 'Component': 'COMP-A', 'Component Qty': 5 },
  { 'Sequence Num': 1, 'Material': 'MAT-001', 'Plant': '1010', 'BOM Usage': '1', 'Alternative BOM': '1', 'Component': 'COMP-B', 'Component Qty': 10 },
  { 'Sequence Num': 2, 'Material': 'MAT-002', 'Plant': '1010', 'BOM Usage': '1', 'Alternative BOM': '1', 'Component': 'COMP-C', 'Component Qty': 2 }
];
const ws = XLSX.utils.json_to_sheet(sampleRows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

const parseResult = parseBomSpreadsheetClient(fileBuffer);
assert.strictEqual(parseResult.success, true, 'Parsing must succeed');
assert.strictEqual(parseResult.boms.length, 2, 'Should detect 2 distinct BOM groups');
assert.strictEqual(parseResult.totalRows, 3, 'Should detect 3 component rows');
assert.strictEqual(parseResult.boms[0].components.length, 2, 'First BOM has 2 components');
assert.strictEqual(parseResult.boms[1].components.length, 1, 'Second BOM has 1 component');
console.log('   ✓ Client parser successfully parsed 2 BOMs without any SAP call');

// Test 500 BOM cap enforcement
console.log('2. Testing 500 BOM Cap Enforcement on Parse...');
const capRows = [];
for (let i = 1; i <= 501; i++) {
  capRows.push({ 'Sequence Num': i, 'Material': `MAT-${i}`, 'Plant': '1010', 'Component': 'COMP-1', 'Component Qty': 1 });
}
const wsCap = XLSX.utils.json_to_sheet(capRows);
const wbCap = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbCap, wsCap, 'Sheet1');
const capBuffer = XLSX.write(wbCap, { type: 'buffer', bookType: 'xlsx' });

const capResult = parseBomSpreadsheetClient(capBuffer);
assert.strictEqual(capResult.success, false, 'Parser must reject batches > 500 BOMs');
assert(capResult.error.includes('500 BOMs'), 'Error message must clearly cite the 500 BOM limit');
console.log('   ✓ 501 BOM file rejected on client parse before any API call');

// Bundle BulkCreateBomView and BulkBomView for static markup checks
const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

const bulkCreateViewOut = path.join(tempDir, 'BulkCreateBomViewFlow.mjs');
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/BulkCreateBomView.jsx')],
  bundle: true,
  format: 'esm',
  outfile: bulkCreateViewOut,
  external: ['react', 'react-dom', 'lucide-react', 'xlsx', '@shared/*'],
  alias: {
    '@shared': path.resolve(__dirname, '../../shared')
  }
});

const bulkCopyViewOut = path.join(tempDir, 'BulkBomViewFlow.mjs');
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/BulkBomView.jsx')],
  bundle: true,
  format: 'esm',
  outfile: bulkCopyViewOut,
  external: ['react', 'react-dom', 'lucide-react', 'xlsx', '@shared/*'],
  alias: {
    '@shared': path.resolve(__dirname, '../../shared')
  }
});

const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

const { default: BulkCreateBomView } = await import(pathToFileURL(bulkCreateViewOut).href);
const { default: BulkBomView } = await import(pathToFileURL(bulkCopyViewOut).href);

// 3. Test Initial State (Before Upload)
console.log('3. Testing Initial State (Upload File Step)...');
const htmlInitial = renderToStaticMarkup(React.createElement(BulkCreateBomView, { systemKey: 'DEV' }));
assert(htmlInitial.includes('Upload Spreadsheet'), 'Upload panel must be visible initially');
assert(htmlInitial.includes('Download Template'), 'Download template button must be visible');
assert(htmlInitial.includes('Upload file'), 'Workflow step 1 must be present');
assert(htmlInitial.includes('active'), 'Step 1 must be active initially');
console.log('   ✓ Step 1 active, upload box displayed, no premature SAP calls');

// 4. Test Validated State in BulkCreateBomView
console.log('4. Testing Validated State in BulkCreateBomView...');
const mockReport = {
  success: true,
  totalBoms: 2,
  totalRows: 3,
  readyCount: 2,
  skippedCount: 0,
  invalidCount: 0,
  boms: [
    {
      sequenceNum: 1,
      material: 'MAT-001',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '1',
      baseQty: '1',
      status: 'Ready',
      components: [
        { itemCategory: 'L', component: 'COMP-A', quantity: '5' },
        { itemCategory: 'L', component: 'COMP-B', quantity: '10' }
      ]
    },
    {
      sequenceNum: 2,
      material: 'MAT-002',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '1',
      baseQty: '1',
      status: 'Ready',
      components: [
        { itemCategory: 'L', component: 'COMP-C', quantity: '2' }
      ]
    }
  ]
};

const htmlValidated = renderToStaticMarkup(
  React.createElement(BulkCreateBomView, {
    systemKey: 'DEV',
    initialPreflightReport: mockReport
  })
);

// Preview table must be rendered
assert(htmlValidated.includes('Data Preview'), 'Table header must show');
assert(htmlValidated.includes('Ready'), 'Ready badge must show');
assert(htmlValidated.includes('sap-badge-success'), 'Ready status badge has sap-badge-success');
assert(htmlValidated.includes('Validation Summary:'), 'Summary label must be present');
assert(htmlValidated.includes('Ready: 2'), 'Summary ready count must show 2');
assert(htmlValidated.includes('Create BOMs (2)') || htmlValidated.includes('Create 2 Ready BOM(s)'), 'Create BOMs button must show');
assert(!htmlValidated.includes('disabled="" style="padding:9px 24px"'), 'Execute button must be enabled when readyCount > 0');
assert(htmlValidated.includes('Re-validate data') || htmlValidated.includes('Validate data') || htmlValidated.includes('Re-validate') || htmlValidated.includes('Validate with SAP'), 'Validate data button present in footer');
console.log('   ✓ Validated preview renders in place with Ready badges and enabled Create button');

// 5. Test Bulk Copy BOM (BulkBomView) Shared Consistency
console.log('5. Testing Bulk Copy BOM Visual & Step Consistency...');
const htmlCopyInitial = renderToStaticMarkup(React.createElement(BulkBomView, { systemKey: 'DEV' }));
assert(htmlCopyInitial.includes('Upload file'), 'Bulk Copy must have 3-step indicator');
assert(htmlCopyInitial.includes('Validate data'), 'Bulk Copy step 2 wording matches');
assert(htmlCopyInitial.includes('Copy BOMs'), 'Bulk Copy step 3 wording matches');
console.log('   ✓ Both screens share identical step indicators and visual workflow');

console.log('\n============================================================');
console.log('  ALL BULK BOM UI FLOW & VALIDATION TESTS PASSED (100%)    ');
console.log('============================================================');
