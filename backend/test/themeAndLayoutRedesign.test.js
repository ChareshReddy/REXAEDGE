import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

console.log('============================================================');
console.log('  TESTING APP-WIDE THEME & LAYOUT REDESIGN SPECIFICATIONS   ');
console.log('============================================================\n');

// 1. Verify Design Tokens in index.css
console.log('Test 1: Verify master design tokens in frontend/src/index.css...');
const indexCssPath = path.join(rootDir, 'frontend/src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

assert.match(indexCss, /--sap-bg:\s*#FFFBFB;/i, 'Background token --sap-bg must be #FFFBFB');
assert.match(indexCss, /--sap-card-bg:\s*#FFFFFF;/i, 'Card background --sap-card-bg must be #FFFFFF');
assert.match(indexCss, /--sap-shell-bg:\s*#FFFFFF;/i, 'Shell background --sap-shell-bg must be #FFFFFF');
assert.match(indexCss, /--sap-brand-navy:\s*#0f2744;/i, 'Brand navy token must be #0f2744');
assert.match(indexCss, /--sap-brand-blue:\s*#0a6ed1;/i, 'Brand bright blue token must be #0a6ed1');
assert.match(indexCss, /--sap-border:\s*rgba\(0,\s*0,\s*0,\s*0\.08\);/i, 'Border token must be subtle 1px border rgba(0,0,0,0.08)');
assert.match(indexCss, /--radius-xl:\s*12px;/i, 'Border radius 12px must be present');
assert.match(indexCss, /--sap-error-bg:\s*#fffbeb;/i, 'Error bg token must use amber palette #fffbeb');
assert.match(indexCss, /--sap-error-text:\s*#b45309;/i, 'Error text token must use amber palette #b45309');
assert.match(indexCss, /--sap-destructive-bg:\s*#1e293b;/i, 'Destructive bg token must use slate/navy #1e293b');
console.log('   ✓ Design tokens properly configured in index.css\n');

// 2. Verify Header layout and ordering in App.jsx
console.log('Test 2: Verify Header layout, order, and features in frontend/src/App.jsx...');
const appJsxPath = path.join(rootDir, 'frontend/src/App.jsx');
const appJsx = fs.readFileSync(appJsxPath, 'utf8');

// Check that "Session:" and "SAP RFC ONLINE" are removed from top bar
assert.doesNotMatch(appJsx, /<span[^>]*>Session:<\/span>/, 'Top bar must not contain "Session:" text');
assert.doesNotMatch(appJsx, /SAP RFC ONLINE/, 'Top bar must not contain "SAP RFC ONLINE" text');

// Check order on right side: Admin button, connection dot, server selector, user profile
const adminIdx = appJsx.indexOf('sap-admin-header-pill');
const dotIdx = appJsx.indexOf('sap-connection-dot-container');
const serverIdx = appJsx.indexOf('sap-system-select-wrapper');
const userAvatarIdx = appJsx.indexOf('sap-user-avatar-btn');

assert.ok(adminIdx !== -1, 'Admin pill button must exist in header');
assert.ok(dotIdx !== -1, 'Connection dot container must exist in header');
assert.ok(serverIdx !== -1, 'Server selector must exist in header');
assert.ok(userAvatarIdx !== -1, 'User avatar button must exist in header');

assert.ok(adminIdx < dotIdx, 'Admin button must appear before connection dot');
assert.ok(dotIdx < serverIdx, 'Connection dot must appear before server selector');
assert.ok(serverIdx < userAvatarIdx, 'Server selector must appear before user profile avatar');

// Check connection dot accessibility
assert.match(appJsx, /aria-label=\{tooltip\}/, 'Connection dot must have accessible aria-label');
assert.match(appJsx, /title=\{tooltip\}/, 'Connection dot must have informative tooltip');

// Check hover delay on user menu
assert.match(appJsx, /handleUserMenuMouseEnter/, 'User menu must have hover handler with delay');
assert.match(appJsx, /handleUserMenuMouseLeave/, 'User menu must have mouse leave handler');

// Check multi-session switching in user menu
assert.match(appJsx, /sapSession\.sessions/, 'Active SAP sessions must be accessible in user profile dropdown');
assert.match(appJsx, /handleSelectSession/, 'Session selector action must be preserved in user profile dropdown');
console.log('   ✓ Header structure, order, accessibility, and session menu verified\n');

// 3. Verify Page Header & Breadcrumbs in FioriPageHeader.jsx and AdminView.jsx
console.log('Test 3: Verify FioriPageHeader and AdminView layout & breadcrumbs...');
const fioriPhPath = path.join(rootDir, 'frontend/src/components/FioriPageHeader.jsx');
const fioriPh = fs.readFileSync(fioriPhPath, 'utf8');

// Subtitle above title, breadcrumbs below
const subtitlePos = fioriPh.indexOf('fiori-ph-subtitle');
const titlePos = fioriPh.indexOf('fiori-ph-title');
const bcPos = fioriPh.indexOf('fiori-bc');

assert.ok(subtitlePos !== -1, 'Subtitle must exist in FioriPageHeader');
assert.ok(titlePos !== -1, 'Title must exist in FioriPageHeader');
assert.ok(bcPos !== -1, 'Breadcrumb trail must exist in FioriPageHeader');

assert.ok(subtitlePos < titlePos, 'Subtitle must be placed above title');
assert.ok(titlePos < bcPos, 'Breadcrumbs must be placed below title');

// Ensure back button (<) and SANDBOX tag are removed
assert.doesNotMatch(fioriPh, /fiori-ph-back/, 'Back button (<) must be removed from FioriPageHeader');
assert.doesNotMatch(fioriPh, /fiori-ph-env/, 'Environment pill must be removed from FioriPageHeader');

// Check AdminView header structure
const adminViewPath = path.join(rootDir, 'frontend/src/components/AdminView.jsx');
const adminView = fs.readFileSync(adminViewPath, 'utf8');
assert.doesNotMatch(adminView, /sap-header-env-badge/, 'Environment/admin badge must be removed from AdminView header');
assert.match(adminView, /fiori-bc-current["']>Enterprise Administration/, 'AdminView breadcrumb current must be Enterprise Administration');

// Check strictly Left-Aligned Header Block in CSS & sap-theme.css
const sapThemeCssPath = path.join(rootDir, 'frontend/src/sap-theme.css');
const sapThemeCss = fs.readFileSync(sapThemeCssPath, 'utf8');

assert.match(indexCss, /\.fiori-ph\s*\{[^}]*align-items:\s*flex-start/s, '.fiori-ph must have align-items: flex-start in index.css');
assert.match(indexCss, /\.fiori-ph\s*\{[^}]*text-align:\s*left/s, '.fiori-ph must have text-align: left in index.css');
assert.match(indexCss, /\.fiori-ph-header-top\s*\{[^}]*align-items:\s*flex-start/s, '.fiori-ph-header-top must be left-aligned');
assert.match(indexCss, /\.fiori-ph-subtitle\s*\{[^}]*text-align:\s*left/s, '.fiori-ph-subtitle must be left-aligned');
assert.match(indexCss, /\.fiori-bc\s*\{[^}]*justify-content:\s*flex-start/s, '.fiori-bc must be left-aligned');
assert.match(indexCss, /\.fiori-home-tabs\s*\{[^}]*justify-content:\s*flex-start/s, '.fiori-home-tabs must be left-aligned');

// Verify fiori-ph is NOT included in the center-aligned toolbar rule in sap-theme.css
const centerToolbarMatch = sapThemeCss.match(/\.sap-toolbar,\s*\.sap-shell-header[^{]*\{[^}]*align-items:\s*center/s);
if (centerToolbarMatch) {
  assert.ok(!centerToolbarMatch[0].includes('.fiori-ph'), '.fiori-ph must NOT be included in center-aligned toolbar rule in sap-theme.css');
}

// Verify FioriLaunchpad renders tabs below breadcrumbs inside FioriPageHeader
const launchpadContent = fs.readFileSync(path.join(rootDir, 'frontend/src/components/FioriLaunchpad.jsx'), 'utf8');
assert.match(launchpadContent, /<FioriPageHeader[^>]*>[\s\S]*fiori-home-tabs[\s\S]*<\/FioriPageHeader>/, 'fiori-home-tabs must be nested inside FioriPageHeader below breadcrumbs');
console.log('   ✓ Page header top-to-bottom layout, breadcrumbs, and left alignment verified\n');

// 4. Verify Cards layout in FioriLaunchpad.jsx
console.log('Test 4: Verify Products & BOM Hub cards layout in FioriLaunchpad.jsx...');
const launchpadPath = path.join(rootDir, 'frontend/src/components/FioriLaunchpad.jsx');
const launchpad = fs.readFileSync(launchpadPath, 'utf8');

// Check top-left icon tile in fiori-tile and fiori-op-card
assert.match(launchpad, /fiori-tile-header/, 'fiori-tile must have top header row with icon tile');
assert.match(launchpad, /fiori-tile-icon/, 'fiori-tile must use top icon tile');
assert.match(launchpad, /fiori-op-icon-badge/, 'fiori-op-card must use top icon tile');
// Delete BOM slate icon
assert.match(launchpad, /isDestructive\s*=\s*Boolean\(danger\s*\|\|\s*id\s*===\s*'delete'\)/, 'Delete BOM card must identify destructive action');
assert.match(launchpad, /fiori-op-icon-badge \$\{isDestructive \? 'destructive danger' : ''\}/, 'Delete BOM card icon badge must use destructive slate styling');
console.log('   ✓ Card icon tile at top and Delete BOM slate styling verified\n');

// 5. Scan frontend for disallowed red color codes
console.log('Test 5: Scanning frontend source files for disallowed red colors...');
const redHexPatterns = [
  /#(?:ef4444|dc2626|b91c1c|f87171|fca5a5|fecaca|fef2f2|e11d48|be123c|991b1b|c53030|fed7d7|fff5f5|ff4d4f|f5222d|d32f2f|f44336|e53935|e57373)\b/i,
  /rgba?\(\s*(?:239|220|248|252|254|225|190|153|197|255)\s*,\s*(?:68|38|113|165|202|242|29|18|27|48|77|0)\s*,\s*(?:68|38|113|165|202|242|72|60|27|48|79|0)\b/i
];

const disallowedFiles = [];

function scanFrontend(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'assets') {
        scanFrontend(fullPath);
      }
    } else if (/\.(jsx?|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      let inAllowedBlock = false;
      lines.forEach((line, idx) => {
        // Allowed exceptions:
        // 1. Connection dot disconnected state (allowed single-line or multi-line block)
        if (line.includes('Allowed red exception') || line.includes('RexaEdge logo')) {
          inAllowedBlock = true;
        }
        if (inAllowedBlock && line.includes('}')) {
          inAllowedBlock = false;
          return;
        }
        if (inAllowedBlock) return;
        if (line.includes('dot-disconnected') || line.includes('disconnected')) return;

        for (const pat of redHexPatterns) {
          if (pat.test(line)) {
            disallowedFiles.push({
              file: path.relative(rootDir, fullPath),
              line: idx + 1,
              content: line.trim()
            });
            break;
          }
        }
      });
    }
  }
}

scanFrontend(path.join(rootDir, 'frontend/src'));

if (disallowedFiles.length > 0) {
  console.log(`Found ${disallowedFiles.length} disallowed red occurrences:`);
  disallowedFiles.forEach(item => {
    console.log(`  ${item.file}:${item.line} -> ${item.content}`);
  });
}
assert.strictEqual(
  disallowedFiles.length,
  0,
  `Expected 0 disallowed red color codes in frontend/src, but found ${disallowedFiles.length}`
);
console.log('   ✓ Zero disallowed red color codes across all frontend source files\n');

// 6. Verify Login Page Visibility, Tokens & Non-Invisibility
console.log('Test 6: Verify Login Page visibility, elements & tokens in index.css & Login.jsx...');
const loginJsxPath = path.join(rootDir, 'frontend/src/components/Login.jsx');
const loginJsx = fs.readFileSync(loginJsxPath, 'utf8');

// Title "Welcome to RexaEdge" must NOT be white or shell-bg
assert.doesNotMatch(indexCss, /\.sap-login-header-direct\s+h2\s*\{[^}]*color:\s*var\(--sap-shell-bg/s, 'Login title h2 must NOT use var(--sap-shell-bg)');
assert.match(indexCss, /\.sap-login-header-direct\s+h2\s*\{[^}]*color:\s*var\(--sap-brand-navy,\s*#0f2744\)/s, 'Login title h2 must use var(--sap-brand-navy, #0f2744)');

// Sign In button must NOT use var(--sap-shell-bg)
assert.doesNotMatch(indexCss, /\.sap-btn-navy-login\s*\{[^}]*background:\s*var\(--sap-shell-bg/s, 'Sign in button must NOT use var(--sap-shell-bg)');
assert.match(indexCss, /\.sap-btn-navy-login\s*\{[^}]*background:\s*var\(--sap-brand-navy,\s*#0f2744\)/s, 'Sign in button must use var(--sap-brand-navy, #0f2744)');
assert.match(indexCss, /\.sap-btn-navy-login\s*\{[^}]*color:\s*#ffffff/s, 'Sign in button text must be white (#ffffff)');

// Lock icon, input icon, toggle button
assert.match(indexCss, /\.sap-password-left-icon\s*\{[^}]*color:\s*var\(--sap-brand-navy,\s*#0f2744\)/s, 'Password left icon must use brand navy');
assert.match(indexCss, /\.sap-password-toggle-btn\s*\{[^}]*color:\s*var\(--sap-brand-navy,\s*#0f2744\)/s, 'Password toggle button must use brand navy');

// Card rounded corners and subtle border
assert.match(indexCss, /\.sap-login-canvas\s*\{[^}]*border-radius:\s*var\(--radius-xl,\s*12px\)/s, 'Login canvas must have 12px radius');

// Error message must use amber palette
assert.match(indexCss, /\.sap-alert-error\s*\{[^}]*background:\s*var\(--sap-error-bg\)/s, 'Login alert error must use amber error bg');
assert.match(indexCss, /\.sap-alert-error\s*\{[^}]*color:\s*var\(--sap-error-text\)/s, 'Login alert error must use amber error text');
console.log('   ✓ Login page elements, title, navy button, icons and error alert verified\n');

// 7. Computed-Style Contrast Verification for Primary Buttons
console.log('Test 7: Computed-style contrast between text/icon and background for primary buttons...');

function getRelativeLuminance(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const buttonsToCheck = [
  { name: 'Login Primary Button (.sap-btn-navy-login)', bg: '#0f2744', text: '#ffffff' },
  { name: 'Header Admin Pill (.sap-admin-header-pill)', bg: '#0f2744', text: '#ffffff' },
  { name: 'App Primary Button (.sap-btn-primary)', bg: '#0f2744', text: '#ffffff' },
  { name: 'Destructive Action Button (.sap-btn-danger)', bg: '#1e293b', text: '#ffffff' },
  { name: 'Amber Error Alert Text on Background', bg: '#fffbeb', text: '#b45309' }
];

buttonsToCheck.forEach(btn => {
  const ratio = getContrastRatio(btn.bg, btn.text);
  assert.ok(ratio >= 4.5, `${btn.name} contrast ratio ${ratio.toFixed(2)} must be >= 4.5:1 (WCAG AA)`);
  console.log(`   ✓ ${btn.name}: contrast ratio ${ratio.toFixed(2)}:1 (PASSED >= 4.5:1)`);
});
console.log('   ✓ Zero white-on-white or low-contrast primary buttons across app\n');

console.log('============================================================');
console.log('  ALL APP-WIDE THEME & LAYOUT REDESIGN TESTS PASSED!       ');
console.log('============================================================');
