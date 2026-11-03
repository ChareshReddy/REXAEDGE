import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('============================================================');
console.log('  TESTING TOP BAR PURE WHITE BACKGROUND & COMPONENT STYLING ');
console.log('============================================================\n');

const indexCssPath = path.join(rootDir, 'frontend/src/index.css');
const sapThemeCssPath = path.join(rootDir, 'frontend/src/sap-theme.css');
const layoutCssPath = path.join(rootDir, 'frontend/src/components/layout/layout.css');

const indexCss = fs.readFileSync(indexCssPath, 'utf8');
const sapThemeCss = fs.readFileSync(sapThemeCssPath, 'utf8');
const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');

// 1. Verify --sap-topbar-bg: #FFFFFF token
console.log('Test 1: Verify --sap-topbar-bg: #FFFFFF token in CSS files...');
assert.match(
  indexCss,
  /--sap-topbar-bg:\s*#FFFFFF;/i,
  'index.css must define --sap-topbar-bg: #FFFFFF'
);
assert.match(
  sapThemeCss,
  /--sap-topbar-bg:\s*#FFFFFF;/i,
  'sap-theme.css must define --sap-topbar-bg: #FFFFFF'
);
assert.match(
  layoutCss,
  /--sap-topbar-bg:\s*#FFFFFF;/i,
  'layout.css must define --sap-topbar-bg: #FFFFFF'
);
console.log('   ✓ --sap-topbar-bg: #FFFFFF defined across stylesheets\n');

// 2. Verify .sap-shell-header solid white background, no gradient, no blur/transparency, 1px #FED7AA bottom border
console.log('Test 2: Verify .sap-shell-header solid white background, no gradient, 1px bottom border...');
assert.match(
  indexCss,
  /\.sap-shell-header\s*\{[^}]*background:\s*var\(--sap-topbar-bg,\s*#FFFFFF\)\s*!important;/s,
  'index.css .sap-shell-header must have solid white background'
);
assert.match(
  indexCss,
  /\.sap-shell-header\s*\{[^}]*background-image:\s*none\s*!important;/s,
  'index.css .sap-shell-header must have background-image: none'
);
assert.match(
  indexCss,
  /\.sap-shell-header\s*\{[^}]*border-bottom:\s*1px solid var\(--sap-border,\s*#FED7AA\)\s*!important;/s,
  'index.css .sap-shell-header must have 1px solid #FED7AA bottom border'
);
assert.match(
  sapThemeCss,
  /\.sap-shell-header[^\{]*\{[^}]*background:\s*var\(--sap-topbar-bg,\s*#FFFFFF\)\s*!important;/s,
  'sap-theme.css .sap-shell-header must enforce white background'
);
assert.match(
  layoutCss,
  /\.sap-shell-header\s*\{[^}]*background:\s*var\(--sap-topbar-bg,\s*#FFFFFF\)\s*!important;/s,
  'layout.css .sap-shell-header must enforce white background'
);
console.log('   ✓ .sap-shell-header solid white background & border verified\n');

// 3. Verify Logo sitting directly on white with transparent background (no box, no shadow)
console.log('Test 3: Verify Logo sits cleanly on white background with transparent container...');
assert.match(
  indexCss,
  /\.sap-brand-logo-container\s*\{[^}]*background:\s*transparent\s*!important;[^}]*box-shadow:\s*none\s*!important;/s,
  'Logo container must be transparent with no shadow'
);
console.log('   ✓ Logo container transparent on white verified\n');

// 4. Verify Server selector: white background with #FDBA74 border
console.log('Test 4: Verify Server selector has white background with #FDBA74 border...');
assert.match(
  indexCss,
  /\.sap-system-select\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid var\(--sap-border-strong,\s*#FDBA74\)\s*!important;/s,
  '.sap-system-select must have white background and #FDBA74 border'
);
assert.match(
  indexCss,
  /\.sap-system-static-label\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid var\(--sap-border-strong,\s*#FDBA74\)\s*!important;/s,
  '.sap-system-static-label must have white background and #FDBA74 border'
);
console.log('   ✓ Server selector styling verified\n');

// 5. Verify Top Bar Dropdown Menus: white with orange-200 (#FED7AA) border
console.log('Test 5: Verify Top Bar Dropdown Menus (profile menu, mobile dropdown) use white with #FED7AA border...');
assert.match(
  indexCss,
  /\.sap-user-dropdown-menu\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid var\(--sap-border,\s*#FED7AA\)\s*!important;/s,
  '.sap-user-dropdown-menu must have white background and #FED7AA border'
);
assert.match(
  indexCss,
  /\.sap-user-dropdown-header\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border-bottom:\s*1px solid var\(--sap-border,\s*#FED7AA\)\s*!important;/s,
  '.sap-user-dropdown-header must have white background and #FED7AA border'
);
assert.match(
  indexCss,
  /\.sap-mobile-dropdown\s*\{[^}]*background:\s*#ffffff\s*!important;[^}]*border:\s*1px solid var\(--sap-border,\s*#FED7AA\)\s*!important;/s,
  '.sap-mobile-dropdown must have white background and #FED7AA border'
);
console.log('   ✓ Top bar dropdown menus white + #FED7AA border verified\n');

// 6. Verify Page Header Band below top bar stays #FFF8F2 with 1px border
console.log('Test 6: Verify Page Header Band below top bar stays #FFF8F2 with bottom border...');
assert.match(
  indexCss,
  /--sap-page-header-bg:\s*#FFF8F2;/i,
  'index.css must retain --sap-page-header-bg: #FFF8F2'
);
assert.match(
  layoutCss,
  /\.sap-layout-header,\s*\.fiori-ph\s*\{[^}]*background:\s*var\(--sap-page-header-bg,\s*#FFF8F2\)\s*!important;[^}]*border-bottom:\s*1px solid var\(--sap-border,\s*#FED7AA\)\s*!important;/s,
  'Page header band must remain #FFF8F2 with #FED7AA border'
);
console.log('   ✓ Page header band #FFF8F2 clearly separated by border verified\n');

console.log('============================================================');
console.log('  ALL TOP BAR COLOR FIX TESTS PASSED (100%)                 ');
console.log('============================================================');
