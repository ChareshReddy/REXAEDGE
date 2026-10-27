import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING COMPACT DIAGNOSTIC MESSAGE CELL RENDERING         ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_diag_test_build');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const blockedReasonsOut = path.join(tempDir, 'BlockedReasonsList.mjs');
const bulkBomViewOut = path.join(tempDir, 'BulkBomView.mjs');

const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

// Bundle BlockedReasonsList
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/BlockedReasonsList.jsx')],
  bundle: true,
  format: 'esm',
  outfile: blockedReasonsOut,
  external: ['react', 'react-dom', 'lucide-react']
});

// Bundle BulkBomView
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/BulkBomView.jsx')],
  bundle: true,
  format: 'esm',
  outfile: bulkBomViewOut,
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

const { default: BlockedReasonsList, cleanDiagnosticMessage, splitProblems } = await import(pathToFileURL(blockedReasonsOut).href);
const { default: BulkBomView } = await import(pathToFileURL(bulkBomViewOut).href);

try {
  // 1. Plain wording transformation tests
  console.log('Test 1: Plain wording transformations for existing alternatives and internal keys...');
  const msg1 = 'Cannot copy: Alternative 14 already exists in BOM A1BH0214C/1012/1';
  assert.strictEqual(
    cleanDiagnosticMessage(msg1),
    'Alternative 14 already exists for A1BH0214C in plant 1012.',
    'Must transform "Alternative 14 already exists in BOM A1BH0214C/1012/1" to plain language without slashes'
  );

  const msg1b = 'Alternative 1 already exists in BOM A1BH0214C/1012/1';
  assert.strictEqual(
    cleanDiagnosticMessage(msg1b),
    'Alternative 1 already exists for A1BH0214C in plant 1012.'
  );

  const msg1c = 'BOM Alternative 01 already exists in plant 1010 (STLAN=1) - skipped (strict no-overwrite)';
  assert.strictEqual(
    cleanDiagnosticMessage(msg1c),
    'Alternative 01 already exists in plant 1010.'
  );

  console.log('   ✓ Plain wording correctly transforms alternative existence messages without slash-joined keys\n');

  // 2. Sub-assembly level-based prefixing
  console.log('Test 2: Sub-assembly error prefixing (level 1+ prefixed, level 0 unprefixed)...');
  const level0Msg = 'Material FL0002S-BKBK0011 not maintained in plant 1001 (BOM of FL0002S-BKBK0011, level 0)';
  const cleanLvl0 = cleanDiagnosticMessage(level0Msg);
  assert.strictEqual(
    cleanLvl0,
    'Material FL0002S-BKBK0011 not maintained in plant 1001.',
    'Level 0 error must have NO material prefix'
  );

  const level1Msg = 'Component 11021735 not maintained in plant 1001 (BOM of B1BH0214C, level 1)';
  const cleanLvl1 = cleanDiagnosticMessage(level1Msg);
  assert.strictEqual(
    cleanLvl1,
    'B1BH0214C: Component 11021735 not maintained in plant 1001.',
    'Level 1 error must be prefixed with sub-assembly material "B1BH0214C:"'
  );

  const level3Msg = 'Material H2EVBLK0001 not maintained in plant 1001 (BOM of H2EVBLK0001, level 3)';
  const cleanLvl3 = cleanDiagnosticMessage(level3Msg);
  assert.strictEqual(
    cleanLvl3,
    'H2EVBLK0001: Material H2EVBLK0001 not maintained in plant 1001.',
    'Level 3 error must be prefixed with sub-assembly material "H2EVBLK0001:"'
  );

  console.log('   ✓ Level 0 errors have no prefix; sub-assemblies (level 1+) keep short material prefix\n');

  // 3. Compact rendering (No boxed card, No header, No LEVEL labels)
  console.log('Test 3: Verify compact rendering without bordered boxes, headings, or LEVEL badges...');
  const sampleProblems = [
    'Material FL0002S-BKBK0011 not maintained in plant 1001 (BOM of FL0002S-BKBK0011, level 0)',
    'Component 11021735 not maintained in plant 1001 (BOM of B1BH0214C, level 1)',
    'Material PCFL0003G not maintained in plant 1001 (BOM of PCFL0003G, level 1)',
    'Alternative 14 already exists in BOM A1BH0214C/1012/1'
  ];

  const html = renderToStaticMarkup(
    React.createElement(BlockedReasonsList, {
      problems: sampleProblems,
      totalBoms: 1
    })
  );

  assert(!html.includes('sap-blocked-reasons-card'), 'Must not render heavy boxed card');
  assert(!html.includes('Cannot copy:'), 'Must not render "Cannot copy: N problems" header');
  assert(!html.includes('LEVEL 0'), 'Must not render "LEVEL 0" label');
  assert(!html.includes('LEVEL 1'), 'Must not render "LEVEL 1" label');
  assert(html.includes('sap-diagnostic-errors'), 'Must render compact sap-diagnostic-errors container');
  console.log('   ✓ Heavy boxed card, header, and LEVEL tags completely eliminated\n');

  // 4. Max 3 visible, +N more toggle button in place
  console.log('Test 4: Verify max 3 visible errors and +N more expanding toggle...');
  // With 4 problems, first 3 are rendered and "+1 more" button is visible
  assert(html.includes('+1 more'), 'With 4 problems, must render "+1 more" button');
  assert(html.includes('Material FL0002S-BKBK0011 not maintained in plant 1001.'), 'First error rendered');
  assert(html.includes('B1BH0214C: Component 11021735 not maintained in plant 1001.'), 'Second error rendered');
  assert(html.includes('PCFL0003G: Material PCFL0003G not maintained in plant 1001.'), 'Third error rendered');
  assert(!html.includes('Alternative 14 already exists for A1BH0214C in plant 1012.'), 'Fourth error hidden initially behind toggle');
  console.log('   ✓ Exactly 3 errors visible initially with in-place "+1 more" expand toggle\n');

  // 5. BulkBomView table with 3 errors and 1 ready row
  console.log('Test 5: Render BulkBomView with 3 error rows and 1 ready row...');
  const testRows = [
    {
      id: 'row-1',
      sourceMaterial: 'A1BH0214C',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'A1BH0214C',
      targetPlant: '1001',
      targetUsage: '1',
      targetAltBom: '14',
      status: 'ERROR',
      message: 'Cannot copy: Alternative 14 already exists in BOM A1BH0214C/1012/1',
      problems: ['Alternative 14 already exists in BOM A1BH0214C/1012/1'],
      componentCount: 12
    },
    {
      id: 'row-2',
      sourceMaterial: 'FL0002S-BKBK0011',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'FL0002S-BKBK0011',
      targetPlant: '1001',
      targetUsage: '1',
      targetAltBom: '01',
      status: 'ERROR',
      message: 'Material FL0002S-BKBK0011 not maintained in plant 1001 (BOM of FL0002S-BKBK0011, level 0)',
      problems: ['Material FL0002S-BKBK0011 not maintained in plant 1001 (BOM of FL0002S-BKBK0011, level 0)'],
      componentCount: 8
    },
    {
      id: 'row-3',
      sourceMaterial: 'B1BH0214C',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAltBom: '01',
      targetMaterial: 'B1BH0214C',
      targetPlant: '1001',
      targetUsage: '1',
      targetAltBom: '01',
      status: 'ERROR',
      message: 'Component 11021735 not maintained in plant 1001 (BOM of B1BH0214C, level 1)',
      problems: ['Component 11021735 not maintained in plant 1001 (BOM of B1BH0214C, level 1)'],
      componentCount: 15
    },
    {
      id: 'row-4',
      sourceMaterial: 'A1BH0214C',
      sourcePlant: '1012',
      sourceUsage: '1',
      sourceAltBom: '02',
      targetMaterial: 'A1BH0214C',
      targetPlant: '1001',
      targetUsage: '1',
      targetAltBom: '02',
      status: 'VALID',
      message: 'Source BOM verified; target alternative ready to copy.',
      componentCount: 12
    }
  ];

  const tableHtml = renderToStaticMarkup(
    React.createElement(BulkBomView, {
      systemKey: 'DEV',
      initialStep: 2,
      initialParsedRows: testRows
    })
  );

  // Status pills present
  assert(tableHtml.includes('Ready'), 'Ready status pill must be rendered');
  assert(tableHtml.includes('Error'), 'Error status pill must be rendered');

  // Error messages are plain-language and formatted
  assert(tableHtml.includes('Alternative 14 already exists for A1BH0214C in plant 1012.'), 'Row 1 error must be cleaned');
  assert(tableHtml.includes('Material FL0002S-BKBK0011 not maintained in plant 1001.'), 'Row 2 error must be cleaned (no prefix)');
  assert(tableHtml.includes('B1BH0214C: Component 11021735 not maintained in plant 1001.'), 'Row 3 error must have sub-assembly prefix');

  // Ready message is rendered with check icon and green styling
  assert(tableHtml.includes('cell-msg-valid'), 'Ready row must render with cell-msg-valid class');
  assert(tableHtml.includes('Source BOM verified; target alternative ready to copy.'), 'Ready row message rendered');

  console.log('   ✓ Bulk table renders 3 plain-language error rows and 1 ready row with green message');

  console.log('\n============================================================');
  console.log('  ALL COMPACT DIAGNOSTIC MESSAGE TESTS PASSED (100%)       ');
  console.log('============================================================\n');
} catch (err) {
  console.error('\n❌ TEST FAILURE:');
  console.error(err);
  process.exit(1);
} finally {
  if (fs.existsSync(tempDir)) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}
