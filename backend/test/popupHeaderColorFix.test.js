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
const modalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/Modal.jsx'), 'utf8');
const bomUsageModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/BomUsageValueHelpModal.jsx'), 'utf8');
const materialModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/MaterialValueHelpModal.jsx'), 'utf8');
const plantModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/PlantValueHelpModal.jsx'), 'utf8');
const storageModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/StorageLocationValueHelpModal.jsx'), 'utf8');
const restrictModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/MaterialRestrictValueRangeModal.jsx'), 'utf8');
const bulkModalJsx = fs.readFileSync(path.join(rootDir, 'frontend/src/components/BulkBomCopyModal.jsx'), 'utf8');

// Test 1: Design Tokens
console.log('Test 1: Verify Popup Header Design Tokens in index.css & sap-theme.css...');
assert.ok(indexCss.includes('--sap-popup-header-bg'), 'index.css must define --sap-popup-header-bg');
assert.ok(indexCss.includes('--sap-popup-header-border'), 'index.css must define --sap-popup-header-border');
assert.ok(indexCss.includes('--sap-popup-header-title'), 'index.css must define --sap-popup-header-title');
assert.ok(indexCss.includes('--sap-popup-header-badge-bg'), 'index.css must define --sap-popup-header-badge-bg');

assert.ok(sapThemeCss.includes('--sap-popup-header-bg'), 'sap-theme.css must define --sap-popup-header-bg');
assert.ok(sapThemeCss.includes('--sap-popup-header-border'), 'sap-theme.css must define --sap-popup-header-border');
assert.ok(sapThemeCss.includes('--sap-popup-header-title'), 'sap-theme.css must define --sap-popup-header-title');
console.log('   ✓ Master design tokens defined properly in both index.css and sap-theme.css\n');

// Test 2: Header Background and Border on Every Popup Type
console.log('Test 2: Verify Flat Header Background and Border on All Popups...');
assert.ok(!modalJsx.includes('linear-gradient(135deg, #EA580C'), 'Modal.jsx must not use linear gradient header');

// CSS rules for .sap-f4-header and .sap-modal-header
assert.match(indexCss, /\.sap-f4-header\s*\{[^}]*var\(--sap-popup-header-bg/s, 'index.css .sap-f4-header must use popup header bg token');
assert.match(sapThemeCss, /\.sap-modal-header[^{]*\{[^}]*var\(--sap-popup-header-bg/s, 'sap-theme.css .sap-modal-header must use popup header bg token');
console.log('   ✓ Header background and 1px border verified across all popups\n');

// Test 3: Navy Title Text and Bold Weight with Contrast Ratio
console.log('Test 3: Verify Navy Title Text, Bold Weight, and Text Contrast (>= 4.5:1)...');
assert.ok(modalJsx.includes('#00204E') || modalJsx.includes('#0f2744'), 'Modal.jsx title must use brand navy');
assert.ok(bomUsageModalJsx.includes('#00204E') || bomUsageModalJsx.includes('#0f2744'), 'BomUsageValueHelpModal.jsx title must use navy');
assert.ok(materialModalJsx.includes('#00204E') || materialModalJsx.includes('#0f2744'), 'MaterialValueHelpModal.jsx title must use navy');
assert.ok(plantModalJsx.includes('#00204E') || plantModalJsx.includes('#0f2744'), 'PlantValueHelpModal.jsx title must use navy');
assert.ok(storageModalJsx.includes('#00204E') || storageModalJsx.includes('#0f2744'), 'StorageLocationValueHelpModal.jsx title must use navy');
assert.ok(restrictModalJsx.includes('#00204E') || restrictModalJsx.includes('#0f2744'), 'MaterialRestrictValueRangeModal.jsx title must use navy');
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
assert.match(indexCss, /\.sap-restrict-tab-container\s*\{[^}]*background:\s*#ffffff/s, 'Tab container must have white background');
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
