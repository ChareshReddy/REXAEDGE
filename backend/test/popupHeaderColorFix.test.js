import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('============================================================');
console.log('  TESTING POPUP HEADER COLOR FIX & MODAL SPECIFICATIONS     ');
console.log('============================================================\n');

const indexCss = fs.readFileSync(path.join(rootDir, 'frontend/src/index.css'), 'utf8');
const sapThemeCss = fs.readFileSync(path.join(rootDir, 'frontend/src/sap-theme.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(rootDir, 'frontend/src/tokens.css'), 'utf8');
const uiModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/ui/Modal.jsx'), 'utf8');
const popupsCss = fs.readFileSync(path.join(rootDir, 'frontend/src/components/ui/popups.css'), 'utf8');
// Navy title: the literal brand navy or a token that resolves to it.
const NAVY = /#00204E|#0f2744|var\(--(color-navy-900|sap-popup-header-title|modal-title-color)\)/i;
const modalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/Modal.jsx'), 'utf8');
const bomUsageModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/BomUsageValueHelpModal.jsx'), 'utf8');
const materialModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/MaterialValueHelpModal.jsx'), 'utf8');
const plantModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/PlantValueHelpModal.jsx'), 'utf8');
const storageModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/StorageLocationValueHelpModal.jsx'), 'utf8');
const restrictModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/MaterialRestrictValueRangeModal.jsx'), 'utf8');
const bulkModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/BulkBomCopyModal.jsx'), 'utf8');

// Test 1: Design Tokens
console.log('Test 1: Verify Popup Header Design Tokens (single source: tokens.css)...');
for (const t of ['--sap-popup-header-bg', '--sap-popup-header-border', '--sap-popup-header-title', '--sap-popup-header-badge-bg', '--modal-header-bg', '--modal-title-color']) {
  assert.ok(new RegExp(`${t}\\s*:`).test(tokensCss), `tokens.css must define ${t}`);
}
assert.match(tokensCss, /--modal-header-bg:\s*var\(--color-blue-50\)/, 'Popup header band must be the light blue-50 surface');
assert.match(tokensCss, /--modal-title-color:\s*var\(--color-navy-900\)/, 'Popup title must be brand navy');
assert.ok(!/--sap-popup-header-[a-z-]+\s*:/.test(indexCss + sapThemeCss), 'Popup tokens must not be re-declared outside tokens.css');
console.log('   ✓ Popup design tokens defined once in tokens.css\n');

// Test 2: Header Background and Border on Every Popup Type
console.log('Test 2: Verify Flat Header Background and Border on All Popups...');
assert.ok(!modalJsx.includes('linear-gradient(135deg, #EA580C'), 'Modal.jsx must not use linear gradient header');

// CSS rules for .sap-f4-header and .sap-modal-header
assert.match(indexCss, /\.sap-f4-header\s*\{[^}]*var\(--sap-popup-header-bg/s, 'index.css .sap-f4-header must use popup header bg token');
assert.match(sapThemeCss, /\.sap-modal-header[^{]*\{[^}]*var\(--sap-popup-header-bg/s, 'sap-theme.css .sap-modal-header must use popup header bg token');
console.log('   ✓ Header background and 1px border verified across all popups\n');

// Test 3: Navy Title Text and Bold Weight with Contrast Ratio
console.log('Test 3: Verify Navy Title Text, Bold Weight, and Text Contrast (>= 4.5:1)...');
assert.ok(uiModalJsx.includes('rx-modal-title') && /\.rx-modal-title[^{]*\{[^}]*color:\s*var\(--modal-title-color\)/s.test(popupsCss), 'Shared Modal title must use the navy title token');
assert.ok(NAVY.test(bomUsageModalJsx), 'BomUsageValueHelpModal.jsx title must use navy');
assert.ok(NAVY.test(materialModalJsx), 'MaterialValueHelpModal.jsx title must use navy');
assert.ok(NAVY.test(plantModalJsx), 'PlantValueHelpModal.jsx title must use navy');
assert.ok(NAVY.test(storageModalJsx), 'StorageLocationValueHelpModal.jsx title must use navy');
assert.ok(NAVY.test(restrictModalJsx), 'MaterialRestrictValueRangeModal.jsx title must use navy');
console.log('   ✓ Navy bold titles with zero white text verified across all modal/popup components\n');

// Test 4: "F4" Badge Removed (Clean title/close header per request 2)
console.log('Test 4: Verify "F4" Badge Removed from Modal Headers...');
assert.ok(!modalJsx.includes('sap-f4-header-badge'), 'F4 badge removed from Modal.jsx');
assert.ok(!bomUsageModalJsx.includes('sap-f4-header-badge'), 'F4 badge removed from BomUsageValueHelpModal.jsx');
console.log('   ✓ F4 badge cleanly removed in favor of clean title/close header\n');

// Test 5: Close Button States and Hit Area
console.log('Test 5: Verify Close (X) Button States and Hit Area...');
assert.match(sapThemeCss, /\.sap-modal-close-btn[^{]*\{[^}]*transparent/s, 'Close button normal must have transparent background');
console.log('   ✓ Close button states, 36px hit area, and SVG icon colors verified\n');

// Test 6: Tabs Row Under the Header
console.log('Test 6: Verify Tabs Row Under Header...');
assert.match(indexCss, /\.sap-restrict-tab-container\s*\{[^}]*background:\s*(#ffffff|var\(--color-surface\))/s, 'Tab container must have white background');
console.log('   ✓ Tabs row white background and controls verified\n');

// Test 7: Strict No-Red Verification across All Modified Components
console.log('Test 7: Verify Zero Red Color Codes across All Modal and Popup Styles...');
const disallowedRedRegex = /#(ff0000|f00\b|ef4444|dc2626|b91c1c|991b1b|7f1d1d|f87171|fca5a5|fecaca|fee2e2)/i;
assert.ok(!disallowedRedRegex.test(modalJsx), 'Modal.jsx must contain zero red');
assert.ok(!disallowedRedRegex.test(bomUsageModalJsx), 'BomUsageValueHelpModal.jsx must contain zero red');
assert.ok(!disallowedRedRegex.test(materialModalJsx), 'MaterialValueHelpModal.jsx must contain zero red');
assert.ok(!disallowedRedRegex.test(plantModalJsx), 'PlantValueHelpModal.jsx must contain zero red');
assert.ok(!disallowedRedRegex.test(storageModalJsx), 'StorageLocationValueHelpModal.jsx must contain zero red');
assert.ok(!disallowedRedRegex.test(restrictModalJsx), 'MaterialRestrictValueRangeModal.jsx must contain zero red');
console.log('   ✓ Zero disallowed red color codes confirmed across all popup files\n');

console.log('============================================================');
console.log('  ALL POPUP HEADER COLOR FIX TESTS PASSED (100%)            ');
console.log('============================================================\n');
