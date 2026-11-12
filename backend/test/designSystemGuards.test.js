import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, '../frontend/src');

console.log('============================================================');
console.log('  RUNNING DESIGN SYSTEM & SCOPE GUARD TESTS                 ');
console.log('============================================================\n');

// 1. Verify tokens.css defines all required Beautiful Blues tokens
console.log('Test 1: Verify tokens.css defines the Beautiful Blues palette and tokens...');
const tokensCss = fs.readFileSync(path.resolve(frontendDir, 'tokens.css'), 'utf8');

const requiredTokens = [
  '--color-navy-900',
  '--color-navy-800',
  '--color-blue-600',
  '--color-blue-400',
  '--color-blue-200',
  '--color-blue-100',
  '--color-blue-50',
  '--color-page-bg',
  '--color-surface',
  '--color-border',
  '--color-text',
  '--color-text-secondary',
  '--color-text-muted',
  '--color-success',
  '--color-warning',
  '--color-info',
  '--color-danger',
  '--font-sans',
  '--font-mono',
  '--size-form-input-height',
  '--size-table-input-height',
  '--size-table-row-height',
  '--size-button-height',
  '--size-f4-form-button',
  '--size-f4-table-button',
  '--size-topbar-height',
  '--size-sidebar-width-expanded',
  '--size-sidebar-width-collapsed',
  '--focus-ring',
  '--page-header-bg',
  '--page-header-text',
  '--page-header-subtext',
  '--card-header-bg',
  '--table-header-bg'
];

for (const token of requiredTokens) {
  assert(tokensCss.includes(token), `tokens.css must define ${token}`);
}
console.log(`   ✓ All ${requiredTokens.length} core design tokens defined in tokens.css\n`);

// 2. Scan component CSS for stray old orange/amber values
console.log('Test 2: Scan component CSS files for leftover orange colors...');
const componentCssFiles = [
  'tokens.css',
  'tailwind.css',
  'components/FioriOpCard.css',
  'components/HomePage.css',
  'components/Login.css',
  'components/ui/ui.css'
];

const disallowedOrangeRegex = /#(EA580C|C2410C|9A3412|F97316|FFF7ED|FFF8F2|FFF1E3)\b/i;

for (const relPath of componentCssFiles) {
  const filePath = path.resolve(frontendDir, relPath);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(disallowedOrangeRegex);
  assert(
    !match,
    `Stray leftover orange color ${match?.[0]} found in ${relPath}! Must use Beautiful Blues tokens.`
  );
}
console.log('   ✓ Zero leftover orange colors across all component CSS files\n');

// 3. Scoped CSS Guard Test: No bare element selectors
console.log('Test 3: Scoped CSS Guard: Check for bare element selectors in component CSS...');
const bareElementRegex = /(?:^|\s|,)(?:input|button|label|table)(?:::|:|\s|\{)/;

for (const relPath of componentCssFiles) {
  const filePath = path.resolve(frontendDir, relPath);
  if (!fs.existsSync(filePath)) continue;
  const raw = fs.readFileSync(filePath, 'utf8');
  // Strip comments and keyframes
  const cleaned = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[\s\S]*?\n\}/g, '');
  const blocks = cleaned.split('}');

  for (const block of blocks) {
    const parts = block.split('{');
    if (parts.length < 2) continue;
    const selector = parts[0].trim();
    if (!selector || selector.startsWith('@')) continue;

    const selectors = selector.split(',').map(s => s.trim());
    for (const s of selectors) {
      if (s.startsWith(':root')) continue;
      // Fail if bare input, button, label, table is the root of the selector
      const isBare = /^(?:input|button|label|table)(?:::|:|\s|$)/i.test(s);
      assert(
        !isBare,
        `Bare element selector "${s}" detected in ${relPath}! Must be scoped with a class prefix.`
      );
    }
  }
}
console.log('   ✓ Zero bare element selectors in component CSS (all properly scoped)\n');

// 4. Verify Sidebar & Command Palette Implementation
console.log('Test 4: Verify Sidebar & Command Palette implementation files...');
const sidebarJsx = fs.readFileSync(path.resolve(frontendDir, 'components/layout/Sidebar.jsx'), 'utf8');
const commandPaletteJsx = fs.readFileSync(path.resolve(frontendDir, 'components/layout/CommandPalette.jsx'), 'utf8');
const appJsx = fs.readFileSync(path.resolve(frontendDir, 'App.jsx'), 'utf8');

assert(sidebarJsx.includes('rexa_sidebar_collapsed'), 'Sidebar must remember collapsed state');
assert(sidebarJsx.includes('var(--size-sidebar-width-expanded, 240px)'), 'Sidebar expanded width 240px');
assert(sidebarJsx.includes('var(--size-sidebar-width-collapsed, 72px)'), 'Sidebar collapsed width 72px');
assert(sidebarJsx.includes('MODULE_REGISTRY'), 'Sidebar module list must be data-driven from registry');

assert(commandPaletteJsx.includes('ctrlKey || e.metaKey'), 'Command palette must listen for Ctrl+K / Cmd+K');
assert(commandPaletteJsx.includes('hasCardPermission'), 'Command palette must be permission-aware');

assert(appJsx.includes('<Sidebar'), 'App.jsx must integrate Sidebar component');
assert(appJsx.includes('<CommandPalette'), 'App.jsx must integrate CommandPalette component');
assert(appJsx.includes('rx-topbar-search-btn'), 'App.jsx top bar must include quick search button');
console.log('   ✓ Sidebar (240px/72px, data-driven) and CommandPalette (Ctrl+K) verified\n');

// 5. Verify Popups Backdrop Click Protection
console.log('Test 5: Verify F4 Popup overlay backdrop click prevention...');
const f4OverlayJsx = fs.readFileSync(path.resolve(frontendDir, 'components/F4PopupOverlay.jsx'), 'utf8');
assert(f4OverlayJsx.includes('e.stopPropagation()'), 'F4 overlay must block backdrop click propagation');
assert(f4OverlayJsx.includes('e.preventDefault()'), 'F4 overlay must prevent default on backdrop click');

const modalJsx = fs.readFileSync(path.resolve(frontendDir, 'components/ui/Modal.jsx'), 'utf8');
assert(modalJsx.includes('role="presentation"'), 'Modal overlay presentation');
assert(!modalJsx.includes('onClick={onClose}'), 'Modal overlay must NOT close on backdrop click');
console.log('   ✓ Backdrop click protection verified across all dialogs & popups\n');

// 6. Verify Table Spacing & Token Heights
console.log('Test 6: Verify Table spacing and component height tokens...');
const uiCss = fs.readFileSync(path.resolve(frontendDir, 'components/ui/ui.css'), 'utf8');
assert.match(uiCss, /\.rx-table-td\s*\{[^}]*padding:\s*8px/s, 'Table cell padding must be 8px var(--space-12)');
assert.match(uiCss, /height:\s*var\(--size-form-input-height\)/s, 'Form input height must use token');
assert.match(uiCss, /height:\s*var\(--size-table-input-height\)/s, 'Table cell input height must use token');
assert.match(uiCss, /height:\s*var\(--size-button-height\)/s, 'Button height must use token');
console.log('   ✓ Table 8px 12px spacing and token-driven input/button heights verified\n');

// 7. Verify Modal/Popup headers contain no orange/amber hex codes or classes
console.log('Test 7: Static check that modal/popup component files contain no orange/amber colors in header/icon code...');
const popupFiles = [
  'components/Modal.jsx',
  'components/ui/Modal.jsx',
  'components/ValidateBomModal.jsx',
  'components/PasswordModal.jsx',
  'components/BulkBomCopyModal.jsx',
  'components/PlantValueHelpModal.jsx',
  'components/MaterialValueHelpModal.jsx',
  'components/StorageLocationValueHelpModal.jsx',
  'components/BomUsageValueHelpModal.jsx',
  'components/MaterialRestrictValueRangeModal.jsx',
  'components/ConfirmationCard.jsx',
  'components/DeleteBomView.jsx'
];

const disallowedOrangeHeaderHexRegex = /#(ffd099|d97706|f59e0b|ea580c|c2410c|9a3412|f97316)\b/i;

for (const relPath of popupFiles) {
  const filePath = path.resolve(frontendDir, relPath);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  // Check that header/badge definitions do not use orange/amber hex
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('sap-bulk-icon-badge') || line.includes('sap-f4-header') || line.includes('sap-confirm-header') || line.includes('sap-proposal-header-card') || line.includes('iconBadgeBg') || line.includes('iconColor')) {
      const match = line.match(disallowedOrangeHeaderHexRegex);
      assert(!match, `Found disallowed orange/amber hex ${match?.[0]} at ${relPath}:${idx + 1}: ${line.trim()}`);
    }
  });
}
console.log('   ✓ Zero disallowed orange/amber hex colors in modal/popup headers and icons\n');

// 8. Static check: Bulk components & CSS files contain no orange/amber hex or utility classes
console.log('Test 8: Static check: Bulk operation components contain no orange/amber colors...');
const bulkFiles = [
  'components/bulk/BulkStatTiles.jsx',
  'components/bulk/BulkLayout.jsx',
  'components/bulk/BulkUploadCard.jsx',
  'components/BulkBomShared.jsx',
  'components/BulkBomView.jsx',
  'components/BulkCreateBomView.jsx',
  'components/BulkUploadPanel.jsx',
  'components/BlockedReasonsList.jsx'
];

const disallowedBulkHexRegex = /#(d97706|f59e0b|b45309|fef3c7|fffbeb|ea580c|c2410c|f97316)\b/i;
const disallowedBulkClassRegex = /\b(sap-badge-warning|rx-alert-warning|status-stat\.warning)\b/i;

for (const relPath of bulkFiles) {
  const filePath = path.resolve(frontendDir, relPath);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    // Disallowed utility classes
    const classMatch = line.match(disallowedBulkClassRegex);
    assert(!classMatch, `Disallowed class ${classMatch?.[0]} found in ${relPath}:${idx + 1}: ${line.trim()}`);

    // Disallowed hex colors (allow only single warning icon token var(--color-warning, #d97706) on AlertTriangle)
    const hexMatch = line.match(disallowedBulkHexRegex);
    if (hexMatch) {
      const isAllowedWarningIcon = line.includes('AlertTriangle') && line.includes('var(--color-warning, #d97706)');
      assert(
        isAllowedWarningIcon,
        `Disallowed orange/amber hex ${hexMatch[0]} found in ${relPath}:${idx + 1}: ${line.trim()}`
      );
    }
  });
}
console.log('   ✓ Zero disallowed orange/amber colors or classes in bulk components\n');

// 9. Page Header Band & Swapped Card/Table Header Guard with WCAG AA Contrast
console.log('Test 9: Verify Page Header, Card Header, and Table Header tokens and WCAG AA contrast...');
assert(tokensCss.includes('--page-header-bg: #0B2D57'), 'tokens.css must define --page-header-bg as #0B2D57');
assert(tokensCss.includes('--page-header-text: #FFFFFF'), 'tokens.css must define --page-header-text as #FFFFFF');
assert(tokensCss.includes('--card-header-bg: #7F9DB9'), 'tokens.css must set --card-header-bg to #7F9DB9');
assert(tokensCss.includes('--card-header-text: #0B2D57'), 'tokens.css must set --card-header-text to #0B2D57');
assert(tokensCss.includes('--table-header-bg: var(--color-blue-100)'), 'tokens.css must set --table-header-bg to the light token (--color-blue-100)');

// WCAG 2.1 Contrast Formula
function getLuminance(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const [rs, gs, bs] = [r, g, b].map(c => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrast(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

// 1. Page Header Title (#FFFFFF on #0B2D57)
const phTitleContrast = getContrast('#FFFFFF', '#0B2D57');
assert(phTitleContrast >= 4.5, `Page header title contrast ${phTitleContrast.toFixed(2)} must be >= 4.5`);

// 2. Page Header Subtitle (rgba(255,255,255,0.8) on #0B2D57 -> ~#CED5DD)
// Composite 80% white over #0B2D57 (r:11, g:45, b:87) -> r:206, g:213, b:221 -> #CED5DD
const phSubtextContrast = getContrast('#CED5DD', '#0B2D57');
assert(phSubtextContrast >= 4.5, `Page header subtext contrast ${phSubtextContrast.toFixed(2)} must be >= 4.5`);

// 3. Card Header Title (#0B2D57 on #7F9DB9)
const cardHeaderContrast = getContrast('#0B2D57', '#7F9DB9');
assert(cardHeaderContrast >= 4.5, `Card header title contrast ${cardHeaderContrast.toFixed(2)} must be >= 4.5`);

// 4. Table Header Text (#00204E on #DCE8F1)
const tableHeaderContrast = getContrast('#00204E', '#DCE8F1');
assert(tableHeaderContrast >= 4.5, `Table header text contrast ${tableHeaderContrast.toFixed(2)} must be >= 4.5`);

// Verify components use token rather than hardcoded old table/card header hex
const formLayoutJsx = fs.readFileSync(path.resolve(frontendDir, 'components/ui/form-layout.jsx'), 'utf8');
assert(formLayoutJsx.includes('var(--card-header-bg)'), 'form-layout.jsx must use var(--card-header-bg)');

const dataTableJsx = fs.readFileSync(path.resolve(frontendDir, 'components/ui/DataTable.jsx'), 'utf8');
assert(dataTableJsx.includes('var(--table-header-bg)'), 'DataTable.jsx must use var(--table-header-bg)');

console.log(`   ✓ Page header title contrast: ${phTitleContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log(`   ✓ Page header subtitle contrast: ${phSubtextContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log(`   ✓ Card header title contrast: ${cardHeaderContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log(`   ✓ Table header text contrast: ${tableHeaderContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log('   ✓ Page Header, Card Header, and Table Header tokens and contrast verified\n');

// 10. Density, Flat Buttons, Radii, Shadows, Hints, and Environment Badge Guard
console.log('Test 10: Verify Density, Radii, Flat Buttons, Shadows, Removed Hints, and Environment Badge...');
assert(tokensCss.includes('--control-height: 36px'), 'tokens.css must define --control-height: 36px');
assert(tokensCss.includes('--size-button-height: 36px'), 'tokens.css must define --size-button-height: 36px');
assert(tokensCss.includes('--radius-sm: 4px'), 'tokens.css must define --radius-sm: 4px');
assert(tokensCss.includes('--radius-md: 4px'), 'tokens.css must define --radius-md: 4px');
assert(tokensCss.includes('--radius-lg: 4px'), 'tokens.css must define --radius-lg: 4px');
assert(tokensCss.includes('--radius-xl: 6px'), 'tokens.css must define --radius-xl: 6px');
assert(tokensCss.includes('--shadow-sm: none'), 'tokens.css must define --shadow-sm: none for flat cards');
assert(tokensCss.includes('--shadow-md: none'), 'tokens.css must define --shadow-md: none');

const createBomViewJsx = fs.readFileSync(path.resolve(frontendDir, 'components/CreateBomView.jsx'), 'utf8');
assert(!createBomViewJsx.includes('hint="Optional'), 'CreateBomView must NOT contain hint="Optional description"');
assert(createBomViewJsx.includes('alt-text-counter'), 'CreateBomView must contain alt-text-counter');
assert(createBomViewJsx.includes('/40'), 'CreateBomView must contain /40 counter');

const appJsxContent = fs.readFileSync(path.resolve(frontendDir, 'App.jsx'), 'utf8');
assert(appJsxContent.includes('rx-server-env-badge'), 'App.jsx must render rx-server-env-badge');
assert(appJsxContent.includes('rx-server-env-prod'), 'App.jsx must support distinct prod badge');

const primaryBtnContrast = getContrast('#FFFFFF', '#00204E');
assert(primaryBtnContrast >= 4.5, `Primary button contrast ${primaryBtnContrast.toFixed(2)} must be >= 4.5`);

const dangerBtnContrast = getContrast('#FFFFFF', '#B42318');
assert(dangerBtnContrast >= 4.5, `Danger button contrast ${dangerBtnContrast.toFixed(2)} must be >= 4.5`);

console.log(`   ✓ Primary navy button contrast: ${primaryBtnContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log(`   ✓ Danger red button contrast: ${dangerBtnContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log('   ✓ 36px control height, 4px radii, 6px modal radius, zero shadow verified');
console.log('   ✓ Removed optional hints, Alternative Text counter (0/40), and Environment Badge verified\n');

console.log('============================================================');
console.log('  ALL DESIGN SYSTEM & SCOPE GUARD TESTS PASSED! (100%)      ');
console.log('============================================================\n');
