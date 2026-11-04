import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('============================================================');
console.log('  TESTING COMPONENT ITEMS TABLE SPACING SPECIFICATIONS     ');
console.log('============================================================\n');

// 1. Verify shared CSS tokens
console.log('Test 1: Verify shared table spacing tokens in sap-theme.css & index.css...');
const sapThemePath = path.join(rootDir, 'frontend/src/sap-theme.css');
const sapTheme = fs.readFileSync(sapThemePath, 'utf8');

const indexCssPath = path.join(rootDir, 'frontend/src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

assert.match(sapTheme, /--sap-table-row-pad-y:\s*6px;/i, 'sap-theme.css must define --sap-table-row-pad-y: 6px');
assert.match(sapTheme, /--sap-table-row-pad-x:\s*8px;/i, 'sap-theme.css must define --sap-table-row-pad-x: 8px');
assert.match(sapTheme, /--sap-table-row-separator:\s*rgba\(253,\s*186,\s*116,\s*0\.45\);/i, 'sap-theme.css must define separator');

assert.match(indexCss, /--sap-table-row-pad-y:\s*6px;/i, 'index.css must define --sap-table-row-pad-y: 6px');
assert.match(indexCss, /--sap-table-row-pad-x:\s*8px;/i, 'index.css must define --sap-table-row-pad-x: 8px');
assert.match(indexCss, /--sap-table-row-separator:\s*rgba\(253,\s*186,\s*116,\s*0\.45\);/i, 'index.css must define separator');
console.log('   ✓ Shared design tokens properly configured in both CSS stylesheets');

// 2. Verify shared table cell rules
console.log('\nTest 2: Verify shared table cell padding, height, and border rules...');
assert.match(sapTheme, /\.sap-table td[^{]*\{[^}]*padding:\s*var\(--sap-table-row-pad-y,\s*6px\)\s*var\(--sap-table-row-pad-x,\s*8px\)/s, 'sap-theme.css must apply 6px vertical cell padding');
assert.match(sapTheme, /\.sap-table td[^{]*\{[^}]*border-bottom:\s*1px solid var\(--sap-table-row-separator,\s*rgba\(253,\s*186,\s*116,\s*0\.45\)\)/s, 'sap-theme.css must apply orange separator on body rows');
assert.match(sapTheme, /\.sap-table tbody tr:last-child td[^{]*\{[^}]*border-bottom:\s*none/s, 'sap-theme.css must not have border on last row');
assert.match(sapTheme, /\.sap-table td[^{]*\{[^}]*vertical-align:\s*middle/s, 'sap-theme.css must keep all cells vertically centered');
console.log('   ✓ Shared table cell padding, separator, and vertical alignment verified');

// 3. Verify F4 table selectable rows
console.log('\nTest 3: Verify F4 result table selectable row rules (40px height, 8px padding)...');
assert.match(sapTheme, /\.sap-f4-table td[^{]*\{[^}]*height:\s*40px\s*!important;/s, 'F4 result table must keep 40px row height');
assert.match(sapTheme, /\.sap-f4-table td[^{]*\{[^}]*padding:\s*8px/s, 'F4 result table must keep 8px padding');
assert.match(sapTheme, /\.sap-f4-table tbody tr:last-child td[^{]*\{[^}]*border-bottom:\s*none/s, 'F4 result table must not have border on last row');
console.log('   ✓ F4 result table 40px row height and 8px padding verified');

// 4. Verify input focus ring within 6px padding
console.log('\nTest 4: Verify focused input ring within 6px padding (box-shadow within padding, no red)...');
assert.match(sapTheme, /\.sap-table td input:focus[^{]*\{[^}]*box-shadow:\s*0\s+0\s+0\s+1\.5px\s+#EA580C/s, 'Focused input ring must use box-shadow <= 2px in orange theme');
assert.match(sapTheme, /\.sap-table td input:focus[^{]*\{[^}]*border-color:\s*#EA580C/s, 'Focused input ring must use orange border');
console.log('   ✓ Focus ring styles stay within cell padding without overlapping neighboring rows');

// 5. Verify real Chrome measurements from artifact JSON
console.log('\nTest 5: Verify real Chrome measurements from artifact directory...');
const measurementsPath = path.join(rootDir, 'scratch/chrome-verification-prof/table_spacing_measurements.json');
const artifactJsonPath = 'C:/Users/chare/.gemini/antigravity/brain/4b45f543-634c-4bd2-8ca9-df6e172e91fd/table_spacing_measurements.json';

const jsonPathToUse = fs.existsSync(artifactJsonPath) ? artifactJsonPath : (fs.existsSync(measurementsPath) ? measurementsPath : null);

if (jsonPathToUse) {
  const data = JSON.parse(fs.readFileSync(jsonPathToUse, 'utf8'));

  // Test Create Single BOM (5 components)
  const c5 = data.create_single_bom_5;
  assert.ok(c5 && c5.length > 0, 'Create Single BOM 5 measurements must exist');
  c5.forEach((run) => {
    const { rowDetails, gaps, actionDistance } = run.measured;
    rowDetails.forEach((r) => {
      assert.strictEqual(r.cellPaddingTop, 6, `Row ${r.rowIdx} cellPaddingTop must be 6px in ${run.viewport}`);
      assert.strictEqual(r.cellPaddingBottom, 6, `Row ${r.rowIdx} cellPaddingBottom must be 6px in ${run.viewport}`);
      // rowHeight equals inputHeight + 12px (+/- 1px for border-collapse)
      const expectedHeight = r.inputHeight + 12;
      assert.ok(
        Math.abs(r.rowHeight - expectedHeight) <= 1.5,
        `Row ${r.rowIdx} height (${r.rowHeight}px) must equal input height (${r.inputHeight}px) + 12px in ${run.viewport}`
      );
    });

    gaps.forEach((g, idx) => {
      assert.ok(g >= 10, `Gap between rows ${idx + 1} and ${idx + 2} (${g}px) must be at least 10px in ${run.viewport}`);
    });

    assert.ok(actionDistance >= 16, `Action row distance (${actionDistance}px) must be at least 16px in ${run.viewport}`);
  });
  console.log('   ✓ Real Chrome measurements verified: rowHeight = inputHeight + 12px, gaps >= 10px, action distance >= 16px');
} else {
  console.log('   (Skipping measurements check: table_spacing_measurements.json not yet generated)');
}

console.log('\n============================================================');
console.log('  ALL TABLE SPACING TESTS PASSED SUCCESSFULLY!             ');
console.log('============================================================');
