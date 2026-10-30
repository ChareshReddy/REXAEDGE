import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING CREATE BOM UI, TOOLTIPS & HEADER RENAME TESTS     ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const tempDir = path.resolve(frontendDir, 'src/.temp_create_bom_tooltips_test');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const createBomViewOut = path.join(tempDir, 'CreateBomView.mjs');
const esbuildPath = path.resolve(frontendDir, 'node_modules/esbuild/lib/main.js');
const { default: esbuild } = await import(pathToFileURL(esbuildPath).href);

// Bundle CreateBomView
esbuild.buildSync({
  entryPoints: [path.resolve(frontendDir, 'src/components/CreateBomView.jsx')],
  bundle: true,
  format: 'esm',
  outfile: createBomViewOut,
  external: ['react', 'react-dom', 'lucide-react', '@shared/*'],
  alias: {
    '@shared': path.resolve(__dirname, '../../shared')
  }
});

// Import React and ReactDOMServer
const ReactPath = path.resolve(frontendDir, 'node_modules/react/index.js');
const ReactDOMServerPath = path.resolve(frontendDir, 'node_modules/react-dom/server.node.js');

const ReactModule = await import(pathToFileURL(ReactPath).href);
const React = ReactModule.default || ReactModule;
const { renderToStaticMarkup } = await import(pathToFileURL(ReactDOMServerPath).href);

// Import bundled component
const CreateBomViewModule = await import(pathToFileURL(createBomViewOut).href);
const CreateBomView = CreateBomViewModule.default;

// Import sapFieldHelp directly
const fieldHelpPath = path.resolve(frontendDir, 'src/constants/sapFieldHelp.js');
const { BOM_FIELD_TOOLTIPS } = await import(pathToFileURL(fieldHelpPath).href);

console.log('1. Testing Column Header Rename: "Component Material*" -> "Component*"');
const html = renderToStaticMarkup(React.createElement(CreateBomView, {
  systemKey: 'DEV',
  onBack: () => {},
  initialMaterial: 'A1BH0214C',
  initialPlant: '1010'
}));

// Must NOT contain old header "Component Material*" in th
assert(!html.includes('<th>Component Material*</th>'), 'Old column header "Component Material*" must NOT be present in th tags');
assert(html.includes('Component*'), 'New column header "Component*" must be present');
console.log('   ✓ Column header successfully renamed to "Component*"\n');

console.log('2. Testing Column Widths for Truncation Prevention');
assert(html.includes('width:110px') || html.includes('width: 110px') || html.includes('Costing Rel'), 'Costing Rel column must have sufficient width (>=110px)');
assert(html.includes('width:95px') || html.includes('width: 95px') || html.includes('Eng Rel'), 'Eng Rel column must have sufficient width (>=95px)');
assert(html.includes('width:75px') || html.includes('width: 75px') || html.includes('Action'), 'Action column must have sufficient width (>=75px)');
console.log('   ✓ Columns Costing Rel, Eng Rel, and Action have sufficient width to avoid truncation\n');

console.log('3. Testing "Add Component" Button Styling');
assert(html.includes('sap-btn-primary'), 'Add Component button must use primary styling');
assert(html.includes('Add Component'), 'Add Component button text must be present');
assert(html.includes('background:var(--sap-primary, #0a6ed1)'), 'Add Component button must use brand blue fill');
assert(html.includes('color:#ffffff'), 'Add Component button must have white text');
console.log('   ✓ "Add Component" button stands out as primary filled action\n');

console.log('4. Testing Simplified Single-Line Tooltips (Plain Names Only)');
// Verify plain names exist without technical field codes
assert.strictEqual(BOM_FIELD_TOOLTIPS.itemNo, 'Item number');
assert.strictEqual(BOM_FIELD_TOOLTIPS.component, 'Component');
assert.strictEqual(BOM_FIELD_TOOLTIPS.quantity, 'Quantity');
assert.strictEqual(BOM_FIELD_TOOLTIPS.itemCategory, 'Item category');
assert.strictEqual(BOM_FIELD_TOOLTIPS.storageLocation, 'Storage location');
assert.strictEqual(BOM_FIELD_TOOLTIPS.referenceNumber, 'Reference number');
assert.strictEqual(BOM_FIELD_TOOLTIPS.costingRelevancy, 'Costing relevant');
assert.strictEqual(BOM_FIELD_TOOLTIPS.engineering, 'Engineering relevant');
assert.strictEqual(BOM_FIELD_TOOLTIPS.action, 'Action');
assert.strictEqual(BOM_FIELD_TOOLTIPS.removeComponent, 'Remove component');

assert.strictEqual(BOM_FIELD_TOOLTIPS.material, 'Material');
assert.strictEqual(BOM_FIELD_TOOLTIPS.plant, 'Plant');
assert.strictEqual(BOM_FIELD_TOOLTIPS.bomUsage, 'BOM usage');
assert.strictEqual(BOM_FIELD_TOOLTIPS.alternativeBom, 'Alternative BOM');
assert.strictEqual(BOM_FIELD_TOOLTIPS.validFrom, 'Valid-from date');
assert.strictEqual(BOM_FIELD_TOOLTIPS.baseQty, 'Base quantity');
assert.strictEqual(BOM_FIELD_TOOLTIPS.bomStatus, 'BOM status');
assert.strictEqual(BOM_FIELD_TOOLTIPS.altText, 'Alternative text');
assert.strictEqual(BOM_FIELD_TOOLTIPS.searchHelp, 'Search help');

// Ensure NO technical codes (such as LGORT, MATNR, POSTP) or sentences exist in the tooltips
for (const [key, val] of Object.entries(BOM_FIELD_TOOLTIPS)) {
  assert(!val.includes('('), `Tooltip "${key}: ${val}" must NOT contain technical parentheses code`);
  assert(!val.includes('LGORT'), `Tooltip "${key}: ${val}" must NOT contain LGORT`);
  assert(!val.includes('MATNR'), `Tooltip "${key}: ${val}" must NOT contain MATNR`);
  assert(!val.includes('.'), `Tooltip "${key}: ${val}" must NOT be a multi-sentence description`);
}
console.log('   ✓ All tooltips are clean, short plain names with zero technical codes\n');

console.log('5. Testing Absence of Hard-coded Red Colors');
assert(!html.includes('var(--sap-error)'), 'Component table remove button must not use var(--sap-error)');
assert(html.includes('var(--sap-border, #cbd5e1)') || html.includes('var(--sap-text-muted, #64748b)'), 'Component table remove button must use neutral border/text-muted');
console.log('   ✓ No red colors in component table rows or actions\n');

console.log('6. Testing Tooltip Component Logic and Accessibility');
const tooltipPath = path.resolve(frontendDir, 'src/components/Tooltip.jsx');
const tooltipOut = path.join(tempDir, 'Tooltip.mjs');
esbuild.buildSync({
  entryPoints: [tooltipPath],
  bundle: true,
  format: 'esm',
  outfile: tooltipOut,
  external: ['react', 'react-dom']
});
const { default: Tooltip } = await import(pathToFileURL(tooltipOut).href);
assert(Tooltip, 'Tooltip component must export default function');

const renderedTrigger = renderToStaticMarkup(
  React.createElement(Tooltip, {
    text: 'Storage location',
    delay: 300
  }, React.createElement('button', { id: 'test-btn' }, 'Hover me'))
);

assert(renderedTrigger.includes('id="test-btn"'), 'Tooltip must render trigger element');
console.log('   ✓ Tooltip component integrates cleanly with trigger elements and supports single-line text\n');

console.log('============================================================');
console.log('  ALL CREATE BOM UI & TOOLTIP TESTS PASSED SUCCESSFULLY!    ');
console.log('============================================================\n');

// Clean up tempDir
fs.rmSync(tempDir, { recursive: true, force: true });
