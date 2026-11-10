import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING MODERN ENTERPRISE LOGIN PAGE UI & SCOPE RULES     ');
console.log('============================================================\n');

const loginFilePath = path.resolve(__dirname, '../../frontend/src/components/Login.jsx');
const loginContent = fs.readFileSync(loginFilePath, 'utf8');

const loginCssPath = path.resolve(__dirname, '../../frontend/src/components/Login.css');
const loginCss = fs.readFileSync(loginCssPath, 'utf8');

// ============================================================================
// TEST 1: SPLIT LAYOUT & BRAND PANEL (55% / 45%)
// ============================================================================
console.log('Test 1: Verify split layout, 55% brand panel, no baked images, geometric pattern...');
assert(loginContent.includes('className="lg-brand-panel"'), 'Login must include .lg-brand-panel');
assert(loginContent.includes('className="lg-form-panel"'), 'Login must include .lg-form-panel');
assert(loginContent.includes('className="lg-card"'), 'Login must include single .lg-card');
assert(!loginContent.includes('sap_portal_bg_template'), 'No baked portal bg template image');

assert.match(loginCss, /\.login-page\s+\.lg-brand-panel\s*\{[^}]*width:\s*55%;/s, 'Brand panel must be 55% width');
assert.match(loginCss, /\.login-page\s+\.lg-form-panel\s*\{[^}]*width:\s*45%;/s, 'Form panel must be 45% width');
assert.match(loginCss, /\.login-page\s+\.lg-geometric-overlay\s*\{[^}]*fill-opacity='0\.05'/s, 'Geometric overlay with 5% opacity SVG pattern');
console.log('   ✓ Split layout (55%/45%), no baked images, and geometric SVG pattern verified\n');

// ============================================================================
// TEST 2: BRAND COPY, 3 CHIPS, & PRODUCT PREVIEW CARD
// ============================================================================
console.log('Test 2: Verify brand copy, 3 feature chips, and product preview card...');
assert(loginContent.includes('SAP operations hub'), 'Headline must be "SAP operations hub"');
assert(loginContent.includes('Automate. Integrate. Execute.'), 'Tagline must be "Automate. Integrate. Execute."');
assert(loginContent.includes('Production planning'), 'Chip: Production planning');
assert(loginContent.includes('Master data'), 'Chip: Master data');
assert(loginContent.includes('Procurement'), 'Chip: Procurement');

assert(loginContent.includes('lg-preview-container'), 'Preview card container present');
assert(loginContent.includes('BOM creation workflow'), 'Preview card title present');
assert(loginContent.includes('Upload') && loginContent.includes('Validate') && loginContent.includes('Create'), 'Preview 3 steps present');

assert.match(loginCss, /\.login-page\s+\.lg-chips-row\s*\{[^}]*display:\s*flex;/s, 'Chips must be flex row');
assert.match(loginCss, /\.login-page\s+\.lg-preview-card-front\s*\{/s, 'Front glassy card style present');
console.log('   ✓ Headline, tagline, 3 chips, and CSS/SVG preview card verified\n');

// ============================================================================
// TEST 3: FORM CARD, REAL LABELS, 44PX INPUTS, & NO EMOJIS
// ============================================================================
console.log('Test 3: Verify form card, visible labels, placeholders, 44px fields, and zero emojis...');
assert(loginContent.includes('Welcome back'), 'Card title must be "Welcome back"');
assert(loginContent.includes('Sign in to access your SAP operations'), 'Card subtitle verified');
assert(loginContent.includes('Email address'), 'Label "Email address" present');
assert(loginContent.includes('Password'), 'Label "Password" present');
assert(loginContent.includes('placeholder="Ex. user@nextitpoint.com"'), 'Email placeholder verified');
assert(loginContent.includes('placeholder="Enter your password"'), 'Password placeholder verified');
assert(loginContent.includes('Sign in'), 'Button text "Sign in" verified');

assert.match(loginCss, /\.login-page\s+\.lg-input\s*\{[^}]*height:\s*44px;/s, 'Inputs must be 44px high');
assert.match(loginCss, /\.login-page\s+\.lg-submit-btn\s*\{[^}]*height:\s*44px;/s, 'Submit button must be 44px high');

assert(!/[🔒🔓🔑🚪🔐]/.test(loginContent), 'Zero emojis in Login.jsx');
console.log('   ✓ Form card copy, visible labels, 44px inputs/button, and zero emojis verified\n');

// ============================================================================
// TEST 4: BUTTON, ACCESSIBILITY, ERROR OVERLAY & RESPONSIVENESS
// ============================================================================
console.log('Test 4: Verify submit button, absolute error overlay (0px shift), and mobile breakpoint (<900px)...');
assert(loginContent.includes('role="alert"'), 'Error alert must have role="alert"');
assert(loginContent.includes('lg-error-overlay'), 'Error overlay present');
assert.match(loginCss, /\.login-page\s+\.lg-error-overlay\s*\{[^}]*position:\s*absolute;/s, 'Error overlay must be absolutely positioned for 0px shift');
assert.match(loginCss, /@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.lg-brand-content[\s\S]*?display:\s*none;/s, 'Below 900px brand content hides for compact mobile header');
console.log('   ✓ Submit button, absolute error overlay, and mobile breakpoint (<900px) verified\n');

// ============================================================================
// TEST 5: SCOPED CSS GUARD TEST & LG- CLASS PREFIX ENFORCEMENT
// ============================================================================
console.log('Test 5: Verify strict scoping under .login-page root & .lg- class naming...');
const cleanCss = loginCss
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@keyframes[\s\S]*?\n\}/g, '');

const ruleBlocks = cleanCss.split('}');

for (const block of ruleBlocks) {
  const parts = block.split('{');
  if (parts.length < 2) continue;
  let selector = parts[0].trim();
  if (!selector) continue;
  if (selector.startsWith('@media')) {
    selector = parts[parts.length - 2]?.trim() || '';
  }

  const individualSelectors = selector
    .split('\n')
    .filter(l => !l.trim().startsWith('@'))
    .join(' ')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  for (const s of individualSelectors) {
    if (s.startsWith('@')) continue;
    assert(
      s.startsWith('.login-page'),
      `Every selector in Login.css must start with .login-page! Offending: ${s}`
    );

    const classes = s.match(/\.[a-zA-Z0-9_-]+/g) || [];
    for (const c of classes) {
      assert(
        c === '.login-page' || c.startsWith('.lg-'),
        `Every class in Login.css must start with .lg-! Offending class: ${c} in selector: ${s}`
      );
    }
  }
}
console.log('   ✓ All CSS rules are strictly scoped under .login-page root and start with .lg-\n');

console.log('============================================================');
console.log('  ALL LOGIN PAGE UI TESTS PASSED! (100%)                    ');
console.log('============================================================\n');
