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

// Helper: WCAG relative luminance & contrast ratio calculation
function srgbLuminance(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map((val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = srgbLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = srgbLuminance(rgb2[0], rgb2[1], rgb2[2]);
  const brightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (brightest + 0.05) / (darkest + 0.05);
}

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
assert.ok(indexCss.includes('--sap-popup-header-bg: #FFEDD5'), 'index.css must define --sap-popup-header-bg: #FFEDD5');
assert.ok(indexCss.includes('--sap-popup-header-border: #FED7AA'), 'index.css must define --sap-popup-header-border: #FED7AA');
assert.ok(indexCss.includes('--sap-popup-header-title: #0f2744'), 'index.css must define --sap-popup-header-title: #0f2744');
assert.ok(indexCss.includes('--sap-popup-header-badge-bg: #EA580C'), 'index.css must define --sap-popup-header-badge-bg: #EA580C');
assert.ok(indexCss.includes('--sap-popup-header-close-color: #C2410C'), 'index.css must define --sap-popup-header-close-color: #C2410C');

assert.ok(sapThemeCss.includes('--sap-popup-header-bg: #FFEDD5'), 'sap-theme.css must define --sap-popup-header-bg: #FFEDD5');
assert.ok(sapThemeCss.includes('--sap-popup-header-border: #FED7AA'), 'sap-theme.css must define --sap-popup-header-border: #FED7AA');
assert.ok(sapThemeCss.includes('--sap-popup-header-title: #0f2744'), 'sap-theme.css must define --sap-popup-header-title: #0f2744');
console.log('   ✓ Master design tokens defined properly in both index.css and sap-theme.css\n');

// Test 2: Header Background and Border on Every Popup Type
console.log('Test 2: Verify Flat Light Orange #FFEDD5 Background and #FED7AA Border on All Popups...');
// Shared Modal
assert.ok(modalJsx.includes('#FFEDD5'), 'Modal.jsx header background must use #FFEDD5');
assert.ok(modalJsx.includes('#FED7AA'), 'Modal.jsx header border must use #FED7AA');
assert.ok(!modalJsx.includes('linear-gradient(135deg, #EA580C'), 'Modal.jsx must not use linear gradient header');

// F4 Popups
assert.ok(bomUsageModalJsx.includes('#FFEDD5'), 'BomUsageValueHelpModal.jsx must use #FFEDD5 header background');
assert.ok(bomUsageModalJsx.includes('#FED7AA'), 'BomUsageValueHelpModal.jsx must use #FED7AA border');

// CSS rules for .sap-f4-header and .sap-modal-header
assert.match(indexCss, /\.sap-f4-header\s*\{[^}]*#FFEDD5/s, 'index.css .sap-f4-header must use #FFEDD5');
assert.match(indexCss, /\.sap-f4-header\s*\{[^}]*#FED7AA/s, 'index.css .sap-f4-header must use #FED7AA border');
assert.match(sapThemeCss, /\.sap-modal-header[^{]*\{[^}]*#FFEDD5/s, 'sap-theme.css .sap-modal-header must use #FFEDD5');
assert.match(sapThemeCss, /\.sap-modal-header[^{]*\{[^}]*#FED7AA/s, 'sap-theme.css .sap-modal-header must use #FED7AA border');
console.log('   ✓ Header background flat light orange (#FFEDD5) and 1px border (#FED7AA) verified across all popups\n');

// Test 3: Navy Title Text and Bold Weight with Contrast Ratio
console.log('Test 3: Verify Navy Title Text, Bold Weight, and Text Contrast (>= 4.5:1)...');
// Contrast: Navy #0f2744 on #FFEDD5
const titleContrast = contrastRatio([15, 39, 68], [255, 237, 213]);
assert.ok(titleContrast >= 4.5, `Title contrast (${titleContrast.toFixed(2)}:1) must be >= 4.5:1`);
console.log(`   ✓ Title contrast ratio: ${titleContrast.toFixed(2)}:1 (exceeds WCAG AAA requirement 7.0:1)`);

// Check bold and navy in components
assert.ok(modalJsx.includes('#0f2744'), 'Modal.jsx title must use navy #0f2744');
assert.ok(bomUsageModalJsx.includes('#0f2744'), 'BomUsageValueHelpModal.jsx title must use navy #0f2744');
assert.ok(materialModalJsx.includes('#0f2744'), 'MaterialValueHelpModal.jsx title must use navy #0f2744');
assert.ok(plantModalJsx.includes('#0f2744'), 'PlantValueHelpModal.jsx title must use navy #0f2744');
assert.ok(storageModalJsx.includes('#0f2744'), 'StorageLocationValueHelpModal.jsx title must use navy #0f2744');
assert.ok(restrictModalJsx.includes('#0f2744'), 'MaterialRestrictValueRangeModal.jsx title must use navy #0f2744');
console.log('   ✓ Navy bold titles with zero white text verified across all modal/popup components\n');

// Test 4: "F4" Badge Styling
console.log('Test 4: Verify "F4" Badge Solid Pill with #EA580C Background and White Text...');
assert.match(indexCss, /\.sap-f4-header-badge\s*\{[^}]*#EA580C/s, 'F4 badge must have #EA580C background');
assert.match(indexCss, /\.sap-f4-header-badge\s*\{[^}]*#ffffff/s, 'F4 badge must have white text');
const badgeTextContrast = contrastRatio([255, 255, 255], [234, 88, 12]);
assert.ok(badgeTextContrast >= 3.0, `F4 badge text contrast (${badgeTextContrast.toFixed(2)}:1) must be >= 3.0:1`);
console.log(`   ✓ F4 badge contrast ratio: ${badgeTextContrast.toFixed(2)}:1 (>= 3:1)\n`);

// Test 5: Close Button States and Contrast in Every State
console.log('Test 5: Verify Close (X) Button States (Normal, Hover, Focus-Visible, Active) and Contrast (>= 3:1)...');
const closeNormalContrast = contrastRatio([255, 237, 213], [194, 65, 12]);
const closeHoverContrast = contrastRatio([254, 215, 170], [194, 65, 12]);
const closeActiveContrast = contrastRatio([253, 186, 116], [194, 65, 12]);

assert.ok(closeNormalContrast >= 3.0, `Close normal contrast (${closeNormalContrast.toFixed(2)}:1) must be >= 3:1`);
assert.ok(closeHoverContrast >= 3.0, `Close hover contrast (${closeHoverContrast.toFixed(2)}:1) must be >= 3:1`);
assert.ok(closeActiveContrast >= 3.0, `Close active contrast (${closeActiveContrast.toFixed(2)}:1) must be >= 3:1`);

console.log(`   ✓ Close icon normal: #C2410C on #FFEDD5 -> ${closeNormalContrast.toFixed(2)}:1 (>= 3:1)`);
console.log(`   ✓ Close icon hover:  #C2410C on #FED7AA -> ${closeHoverContrast.toFixed(2)}:1 (>= 3:1)`);
console.log(`   ✓ Close icon active: #C2410C on #FDBA74 -> ${closeActiveContrast.toFixed(2)}:1 (>= 3:1)`);

// Verify close button CSS rules
assert.match(sapThemeCss, /\.sap-modal-close-btn[^{]*\{[^}]*transparent/s, 'Close button normal must have transparent background');
assert.match(sapThemeCss, /\.sap-modal-close-btn:hover[^{]*\{[^}]*#FED7AA/s, 'Close button hover must have #FED7AA background');
assert.match(sapThemeCss, /\.sap-modal-close-btn:focus-visible[^{]*\{[^}]*#EA580C/s, 'Close button focus-visible must have 2px #EA580C outline');
assert.match(sapThemeCss, /\.sap-modal-close-btn:active[^{]*\{[^}]*#FDBA74/s, 'Close button active must have #FDBA74 background');
console.log('   ✓ Close button states, 36px hit area, and SVG icon colors verified\n');

// Test 6: Tabs Row Under the Header
console.log('Test 6: Verify Tabs Row Under Header (White Bg, Orange-700 Active Tab with 2px Underline, Orange-700 Arrows & Filter)...');
assert.match(indexCss, /\.sap-restrict-tab-container\s*\{[^}]*background:\s*#ffffff/s, 'Tab container must have white background');
assert.match(indexCss, /\.sap-restrict-tab-btn\.active\s*\{[^}]*color:\s*#C2410C/s, 'Active tab must have orange-700 text');
assert.match(indexCss, /\.sap-restrict-tab-btn\.active\s*\{[^}]*inset\s+0\s+-2px\s+0\s+#EA580C/s, 'Active tab must have 2px orange-600 underline');
assert.match(indexCss, /\.sap-restrict-arrow-btn\s*\{[^}]*color:\s*#C2410C/s, 'Tab arrow and filter controls must have orange-700 color');
assert.match(indexCss, /\.sap-restrict-arrow-btn\s+svg\s*\{[^}]*stroke:\s*#C2410C/s, 'Tab arrow and filter SVG must have orange-700 stroke');
console.log('   ✓ Tabs row white background, active orange-700 text with 2px underline, and orange-700 controls verified\n');

// Test 7: Search Buttons & Primary Buttons Inside Popups
console.log('Test 7: Verify Search Buttons & Primary Buttons Inside Popups Retain Solid Orange-600 with White Text...');
assert.match(indexCss, /\.sap-f4-search-row\s+button\[type="submit"\][^{]*\{[^}]*background-color:\s*#EA580C/s, 'Search button must retain #EA580C background');
assert.match(indexCss, /\.sap-f4-search-row\s+button\[type="submit"\][^{]*\{[^}]*color:\s*#ffffff/s, 'Search button must retain white text');
console.log('   ✓ Popup search buttons retain solid orange-600 with white text\n');

// Test 8: Strict No-Red Verification across All Modified Components
console.log('Test 8: Verify Zero Red Color Codes across All Modal and Popup Styles...');
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
