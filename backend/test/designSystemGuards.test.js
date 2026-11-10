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
  '--focus-ring'
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
assert.match(uiCss, /\.rx-table-td\s*\{[^}]*padding:\s*6px/s, 'Table cell padding must be 6px so inputs never touch');
assert.match(uiCss, /height:\s*var\(--size-form-input-height\)/s, 'Form input height must use token');
assert.match(uiCss, /height:\s*var\(--size-table-input-height\)/s, 'Table cell input height must use token');
assert.match(uiCss, /height:\s*var\(--size-button-height\)/s, 'Button height must use token');
console.log('   ✓ Table 6px spacing and token-driven input/button heights verified\n');

console.log('============================================================');
console.log('  ALL DESIGN SYSTEM & SCOPE GUARD TESTS PASSED! (100%)      ');
console.log('============================================================\n');
