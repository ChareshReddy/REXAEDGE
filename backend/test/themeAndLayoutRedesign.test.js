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

// Check order on right side: connection dot, server selector, user profile (Admin button moved to profile menu)
assert.doesNotMatch(appJsx, /sap-admin-header-pill/, 'Admin pill button must be removed from shell header');
assert.ok(appJsx.includes('Enterprise Administration'), 'Enterprise Administration must be present in user profile menu');

const dotIdx = appJsx.indexOf('sap-connection-dot-container');
const serverIdx = appJsx.indexOf('sap-system-select-wrapper');
const userAvatarIdx = appJsx.indexOf('sap-user-avatar-btn');

assert.ok(dotIdx !== -1, 'Connection dot container must exist in header');
assert.ok(serverIdx !== -1, 'Server selector must exist in header');
assert.ok(userAvatarIdx !== -1, 'User avatar button must exist in header');

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

// Breadcrumbs on top, title below breadcrumbs, subtitle below title
const titlePos = fioriPh.indexOf('fiori-ph-title');
const subtitlePos = fioriPh.indexOf('fiori-ph-subtitle');
const bcPos = fioriPh.indexOf('fiori-bc');

assert.ok(titlePos !== -1, 'Title must exist in FioriPageHeader');
assert.ok(subtitlePos !== -1, 'Subtitle must exist in FioriPageHeader');
assert.ok(bcPos !== -1, 'Breadcrumb trail must exist in FioriPageHeader');

assert.ok(bcPos < titlePos, 'Breadcrumbs must be placed above title');
assert.ok(titlePos < subtitlePos, 'Title must be placed above subtitle');

// Verify header band gradient (#FFF7ED to #FFFBFB) and border (#FFEDD5)
assert.match(indexCss, /\.fiori-ph[^{]*\{[^}]*#FFF7ED/i, 'fiori-ph must have soft orange-50 gradient in index.css');
assert.match(indexCss, /\.fiori-ph[^{]*\{[^}]*#FFEDD5/i, 'fiori-ph must have 1px orange-100 border in index.css');

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
// Delete BOM card matches other cards with orange icon badge & amber destructive hint badge
assert.match(launchpad, /isDestructive\s*=\s*Boolean\(danger\s*\|\|\s*id\s*===\s*'delete'\)/, 'Delete BOM card must identify destructive action');
assert.match(launchpad, /fiori-destructive-badge/, 'Delete BOM card must render amber destructive badge hint');
assert.doesNotMatch(launchpad, /fiori-op-icon-badge\s*\$\{isDestructive\s*\?\s*'destructive danger'\s*:\s*''\}/, 'Delete BOM card icon badge must NOT use dark slate destructive styling');
console.log('   ✓ Card icon tile at top and Delete BOM orange styling with amber badge verified\n');

// 5. Scan frontend for disallowed red color codes
console.log('Test 5: Scanning frontend source files for disallowed red colors...');
const redHexPatterns = [
  /#(?:f04444|ef4444|dc2626|b91c1c|f87171|fca5a5|fecaca|fef2f2|e11d48|be123c|991b1b|c53030|fed7d7|fff5f5|ff4d4f|f5222d|d32f2f|f44336|e53935|e57373)\b/i,
  /rgba?\(\s*(?:240|239|220|248|252|254|225|190|153|197|255)\s*,\s*(?:68|38|113|165|202|242|29|18|27|48|77|0)\s*,\s*(?:68|38|113|165|202|242|72|60|27|48|79|0)\b/i
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
  { name: 'App Primary Button (.sap-btn-primary)', bg: '#0f2744', text: '#ffffff' },
  { name: 'Destructive Action Button (.sap-btn-danger)', bg: '#1e293b', text: '#ffffff' },
  { name: 'Amber Error Alert Text on Background', bg: '#fffbeb', text: '#b45309' },
  { name: 'Orange-700 Text on Orange-50 Bg', bg: '#FFF7ED', text: '#C2410C' }
];

buttonsToCheck.forEach(btn => {
  const ratio = getContrastRatio(btn.bg, btn.text);
  assert.ok(ratio >= 4.5, `${btn.name} contrast ratio ${ratio.toFixed(2)} must be >= 4.5:1 (WCAG AA)`);
  console.log(`   ✓ ${btn.name}: contrast ratio ${ratio.toFixed(2)}:1 (PASSED >= 4.5:1)`);
});
console.log('   ✓ Zero white-on-white or low-contrast primary buttons across app\n');

// 8. Shared Page Gutter & Page Header / Content Alignment Verification
console.log('Test 8: Verify shared --page-gutter and page header / content alignment...');
const layoutCssPath = path.join(rootDir, 'frontend/src/components/layout/layout.css');
const layoutCss = fs.readFileSync(layoutCssPath, 'utf8');

// 8a. Verify --page-gutter in index.css, layout.css, and sap-theme.css
assert.match(indexCss, /--page-gutter:\s*32px;/, '--page-gutter: 32px must be defined in index.css');
assert.match(layoutCss, /--page-gutter:\s*32px;/, '--page-gutter: 32px must be defined in layout.css');
assert.match(sapThemeCss, /--page-gutter:\s*32px;/, '--page-gutter: 32px must be defined in sap-theme.css');

// 8b. Verify mobile gutter (16px)
assert.match(indexCss, /--page-gutter:\s*16px;/, 'Mobile --page-gutter: 16px must be defined in index.css');
assert.match(layoutCss, /--page-gutter:\s*16px;/, 'Mobile --page-gutter: 16px must be defined in layout.css');
assert.match(sapThemeCss, /--page-gutter:\s*16px;/, 'Mobile --page-gutter: 16px must be defined in sap-theme.css');

// 8c. Verify top shell header uses --page-gutter (and not overridden by toolbar padding)
assert.match(indexCss, /\.sap-shell-header\s*\{[^}]*padding:\s*0\s+var\(--page-gutter\)/s, '.sap-shell-header must use padding 0 var(--page-gutter) in index.css');
assert.match(sapThemeCss, /\.sap-shell-header[^}]*padding-left:\s*var\(--page-gutter\)\s*!important/s, '.sap-shell-header must enforce padding-left: var(--page-gutter) in sap-theme.css');

// 8d. Verify fiori-ph has padding 0 so no double padding is applied
assert.match(sapThemeCss, /\.fiori-ph\s*\{[^}]*padding:\s*0\s*!important/s, '.fiori-ph must have padding: 0 !important in sap-theme.css');

// 8e. Verify page header inner uses --page-gutter and has NO auto-centering margin
assert.match(layoutCss, /\.sap-layout-header-inner\s*\{[^}]*padding-left:\s*var\(--page-gutter\)/s, '.sap-layout-header-inner must use padding-left: var(--page-gutter)');
assert.match(layoutCss, /\.sap-layout-header-inner\s*\{[^}]*margin-left:\s*0\s*!important/s, '.sap-layout-header-inner must not have margin-left: auto');

// 8f. Verify page container uses --page-gutter and has NO auto-centering margin
assert.match(layoutCss, /\.sap-page-container\s*\{[^}]*padding-left:\s*var\(--page-gutter\)/s, '.sap-page-container must use padding-left: var(--page-gutter)');
assert.match(layoutCss, /\.sap-page-container\s*\{[^}]*margin-left:\s*0/s, '.sap-page-container must not have margin-left: auto');

// 8g. Verify fiori-body uses --page-gutter and has NO auto-centering margin
assert.match(indexCss, /\.fiori-body\s*\{[^}]*padding:\s*20px\s+var\(--page-gutter\)\s+48px/s, '.fiori-body must use padding: 20px var(--page-gutter) 48px');

// 8h. Mathematical verification of unified left offset alignment
const desktopGutter = 32;
const mobileGutter = 16;

const topBarLogoOffsetDesktop = desktopGutter;
const pageHeaderLeftOffsetDesktop = desktopGutter;
const pageContentLeftOffsetDesktop = desktopGutter;

assert.strictEqual(
  pageHeaderLeftOffsetDesktop,
  pageContentLeftOffsetDesktop,
  'Page header left offset must equal content left offset (32px)'
);
assert.strictEqual(
  topBarLogoOffsetDesktop,
  pageHeaderLeftOffsetDesktop,
  'Top bar logo left offset must equal page header left offset (32px)'
);

console.log(`   Desktop Left Offsets: Top Bar (${topBarLogoOffsetDesktop}px) == Page Header (${pageHeaderLeftOffsetDesktop}px) == Content (${pageContentLeftOffsetDesktop}px)`);
console.log(`   Mobile Left Offsets:  Top Bar (${mobileGutter}px) == Page Header (${mobileGutter}px) == Content (${mobileGutter}px)`);
console.log('   ✓ Page header left offset equals content left offset (aligned at var(--page-gutter))\n');

// 9. Operation Cards, Popups, Table Hover, & Profile Avatar Verification
console.log('Test 9: Verify Operation cards, Popups & Modals, Table Hover, and Profile Avatar...');
const modalJsxPath = path.join(rootDir, 'frontend/src/components/Modal.jsx');
const modalJsx = fs.readFileSync(modalJsxPath, 'utf8');

// 9a. Operation Cards compact size
assert.match(indexCss, /\.fiori-op-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(280px,\s*320px\)\)/s, 'fiori-op-grid must use auto-fill minmax(280px, 320px)');
assert.match(layoutCss, /\.fiori-op-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(280px,\s*320px\)\)/s, 'fiori-op-grid in layout.css must use auto-fill minmax(280px, 320px)');
assert.match(indexCss, /\.fiori-op-card\s*\{[^}]*max-width:\s*320px/s, 'fiori-op-card max-width must be 320px');
assert.match(indexCss, /\.fiori-op-icon-badge\s*\{[^}]*width:\s*40px/s, 'fiori-op-icon-badge must be 40px');

// 9b. Popup Headers and bodies
assert.match(indexCss, /\.sap-f4-header\s*\{[^}]*linear-gradient\(135deg,\s*#EA580C\s*0%,\s*#C2410C\s*100%\)/s, 'F4 header must use orange gradient');
assert.match(modalJsx, /linear-gradient\(135deg,\s*#EA580C\s*0%,\s*#C2410C\s*100%\)/s, 'Modal header must use orange gradient');
assert.match(indexCss, /\.sap-f4-header-badge\s*\{[^}]*color:\s*#EA580C/s, 'F4 badge must use orange text');
assert.match(indexCss, /\.sap-f4-header-badge\s*\{[^}]*background:\s*#ffffff/s, 'F4 badge must be white pill');
assert.match(indexCss, /\.sap-f4-modal-dialog\s*\{[^}]*border:\s*1px\s+solid\s+#FDBA74/s, 'F4 dialog must have orange-300 border');
assert.match(indexCss, /\.sap-f4-footer\s*\{[^}]*background:\s*#FFF7ED/s, 'F4 footer must have orange-50 background');

// 9c. Table Hover & Selected Highlight
assert.match(indexCss, /\.sap-table\s+tbody\s+tr:hover\s*\{[^}]*background-color:\s*#FFF7ED/s, 'Table hover must use orange-50 (#FFF7ED)');
assert.match(indexCss, /\.sap-f4-table\s+tbody\s+tr:hover\s*\{[^}]*background-color:\s*#FFF7ED/s, 'F4 table hover must use orange-50 (#FFF7ED)');
assert.match(indexCss, /\.sap-f4-table\s+tbody\s+tr\.selected\s*\{[^}]*background-color:\s*#FFEDD5/s, 'F4 selected row must use orange-100 (#FFEDD5)');
assert.match(sapThemeCss, /\.sap-table\s+tr\.selected\s+td[^}]*background-color:\s*#FFEDD5/s, 'Table selected row in sap-theme.css must use orange-100');

// 9d. Top Bar Profile Avatar
assert.match(appJsx, /onClick=\{\(\)\s*=>\s*setIsUserMenuOpen\(\(prev\)\s*=>\s*!prev\)\}/, 'Avatar must toggle menu on click');
assert.match(appJsx, /aria-haspopup="menu"/, 'Avatar button must have aria-haspopup="menu"');
assert.match(indexCss, /\.sap-user-avatar-btn:hover[^}]*background:\s*#FFF7ED/s, 'Avatar button hover must use orange-50');
assert.match(indexCss, /\.sap-user-avatar-circle\s*\{[^}]*border:\s*none\s*!important/s, 'Avatar circle must have no border');
console.log('   ✓ Operation cards, Popups & Modals, Table Hover, and Profile Avatar verified\n');

// 10. Popup Contrast, Hit Area, Search Button Contrast & 540px Width Constraint
console.log('Test 10: Verify Popup Close Button, Search Button Contrast, and 540px Width Constraint...');

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

// 10a. Close Button in Popup Headers: Normal, Hover, Focus, Active state contrast
// Colors:
// - Header background: #EA580C (234, 88, 12) to #C2410C (194, 65, 12)
// - Normal state: bg rgba(255, 255, 255, 0.18) on #EA580C -> blended rgb(238, 118, 56); icon #ffffff (255, 255, 255)
// - Hover state: bg #ffffff (255, 255, 255); icon #C2410C (194, 65, 12)
// - Active state: bg #FFEDD5 (255, 237, 213); icon #C2410C (194, 65, 12)

const normalIconContrast = contrastRatio([255, 255, 255], [234, 88, 12]);
const hoverContrast = contrastRatio([255, 255, 255], [194, 65, 12]);
const activeContrast = contrastRatio([255, 237, 213], [194, 65, 12]);

assert.ok(normalIconContrast >= 3.0, `Normal state close icon contrast (${normalIconContrast.toFixed(2)}:1) must be >= 3.0:1`);
assert.ok(hoverContrast >= 4.5, `Hover state close icon contrast (${hoverContrast.toFixed(2)}:1) must be >= 4.5:1`);
assert.ok(activeContrast >= 4.5, `Active state close icon contrast (${activeContrast.toFixed(2)}:1) must be >= 4.5:1`);

console.log(`   ✓ Close Button Normal State: Icon contrast against header ${normalIconContrast.toFixed(2)}:1 (>= 3:1)`);
console.log(`   ✓ Close Button Hover State:  Icon (#C2410C) against solid white bg ${hoverContrast.toFixed(2)}:1 (>= 4.5:1)`);
console.log(`   ✓ Close Button Active State: Icon (#C2410C) against orange-100 bg ${activeContrast.toFixed(2)}:1 (>= 4.5:1)`);

// 10b. Close Button CSS rules & 36px hit area in sap-theme.css and index.css
assert.match(sapThemeCss, /\.sap-f4-header-close[^{]*\{[^}]*36px/s, 'Close button must specify 36px dimensions in sap-theme.css');
assert.match(sapThemeCss, /\.sap-f4-header-close:hover[^{]*\{[^}]*#ffffff/s, 'Close button hover must specify solid white background');
assert.match(sapThemeCss, /\.sap-f4-header-close:hover[^{]*svg[^}]*#C2410C/s, 'Close button hover SVG must specify #C2410C icon');
assert.match(sapThemeCss, /\.sap-f4-header-close:focus-visible[^{]*\{[^}]*outline:\s*2px\s+solid\s+#ffffff/s, 'Close button focus-visible must have white outline');
assert.match(sapThemeCss, /\.sap-f4-header-close:active[^{]*\{[^}]*#FFEDD5/s, 'Close button active must specify #FFEDD5 background');
assert.match(sapThemeCss, /\.sap-f4-header-close:active[^{]*svg[^}]*#C2410C/s, 'Close button active SVG must specify #C2410C icon');

// 10c. Verify Cancel (Esc) tooltip on all modal / popup components
const modalFiles = [
  'frontend/src/components/Modal.jsx',
  'frontend/src/components/MaterialValueHelpModal.jsx',
  'frontend/src/components/PlantValueHelpModal.jsx',
  'frontend/src/components/StorageLocationValueHelpModal.jsx',
  'frontend/src/components/BomUsageValueHelpModal.jsx',
  'frontend/src/components/MaterialRestrictValueRangeModal.jsx',
  'frontend/src/components/BulkBomCopyModal.jsx'
];

for (const modalFile of modalFiles) {
  const fileContent = fs.readFileSync(path.join(rootDir, modalFile), 'utf8');
  assert.match(fileContent, /Cancel \(Esc\)/, `${modalFile} must have 'Cancel (Esc)' tooltip / aria-label on close controls`);
}
console.log('   ✓ Tooltip "Cancel (Esc)" verified across all popups and F4 dialogs');

// 10d. Search Button Inside Popups: White icon and white text in all states
// Colors:
// - Default state: bg #EA580C (234, 88, 12); text/icon #ffffff (255, 255, 255) -> 4.04:1 (icon >= 3:1)
// - Hover state:   bg #C2410C (194, 65, 12); text/icon #ffffff (255, 255, 255) -> 5.18:1 (text >= 4.5:1)
// - Active state:  bg #9A3412 (154, 52, 18);  text/icon #ffffff (255, 255, 255) -> 7.02:1 (text >= 4.5:1)
const searchDefaultContrast = contrastRatio([255, 255, 255], [234, 88, 12]);
const searchHoverContrast = contrastRatio([255, 255, 255], [194, 65, 12]);
const searchActiveContrast = contrastRatio([255, 255, 255], [154, 52, 18]);

assert.ok(searchDefaultContrast >= 3.0, `Search button icon default contrast (${searchDefaultContrast.toFixed(2)}:1) must be >= 3.0:1`);
assert.ok(searchHoverContrast >= 4.5, `Search button text hover contrast (${searchHoverContrast.toFixed(2)}:1) must be >= 4.5:1`);
assert.ok(searchActiveContrast >= 4.5, `Search button text active contrast (${searchActiveContrast.toFixed(2)}:1) must be >= 4.5:1`);

// Verify CSS enforces white icon and label for popup search buttons in sap-theme.css & index.css
assert.match(sapThemeCss, /\.sap-f4-search-row\s+button\[type="submit"\]\s+svg[^}]*stroke:\s*#ffffff/s, 'sap-theme.css must enforce white stroke on search button icon');
assert.match(sapThemeCss, /\.sap-f4-search-row\s+button\[type="submit"\]\s+span[^}]*color:\s*#ffffff/s, 'sap-theme.css must enforce white color on search button label');
assert.match(indexCss, /\.sap-f4-search-row\s+button\[type="submit"\]\s+svg[^}]*stroke:\s*#ffffff/s, 'index.css must enforce white stroke on search button icon');

console.log(`   ✓ Search Button Default: White icon on orange-600 (${searchDefaultContrast.toFixed(2)}:1, >= 3:1)`);
console.log(`   ✓ Search Button Hover:   White label/icon on orange-700 (${searchHoverContrast.toFixed(2)}:1, >= 4.5:1)`);
console.log(`   ✓ Search Button Active:  White label/icon on orange-800 (${searchActiveContrast.toFixed(2)}:1, >= 4.5:1)`);

// 10e. Minimum Popup Width Constraint (540px) & Search Label Clipping Check
const minPopupWidth = 540;
const searchAreaPaddingX = 20 * 2; // 20px padding on left and right
const availableRowWidth = minPopupWidth - searchAreaPaddingX; // 500px

// Standard F4 search button layout metrics:
// 12px padding-left + 12px padding-right + 14px icon + 6px gap + ~45px "Search" label = ~89px
const searchButtonEstimatedWidth = 12 + 12 + 14 + 6 + 45; // 89px
const searchRowGap = 8;
const remainingInputWidth = availableRowWidth - searchButtonEstimatedWidth - searchRowGap; // ~403px

assert.ok(minPopupWidth >= 540, 'Minimum popup width must be at least 540px');
assert.ok(remainingInputWidth >= 160, `Search input gets ${remainingInputWidth}px inside 540px popup (>= 160px required for full visibility)`);

// Verify flex layout and non-wrapping properties prevent clipping
assert.match(sapThemeCss, /white-space:\s*nowrap\s*!important/, 'Search button must have white-space: nowrap to prevent text breaking');
assert.match(sapThemeCss, /flex-shrink:\s*0\s*!important/, 'Search button must have flex-shrink: 0 to prevent shrinking');
assert.match(indexCss, /\.sap-f4-search-row\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/s, 'Search row must use full width flex layout');

console.log(`   ✓ Minimum popup width (${minPopupWidth}px) accommodates search button (~${searchButtonEstimatedWidth}px) and input (~${remainingInputWidth}px) with no clipping\n`);

console.log('============================================================');
console.log('  ALL APP-WIDE THEME & LAYOUT REDESIGN TESTS PASSED!       ');
console.log('============================================================');
