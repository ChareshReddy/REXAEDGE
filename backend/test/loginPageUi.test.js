import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING LOGIN PAGE CARD UI & STRICT SCOPE GUARD RULES     ');
console.log('============================================================\n');

const loginFilePath = path.resolve(__dirname, '../../frontend/src/components/Login.jsx');
const loginContent = fs.readFileSync(loginFilePath, 'utf8');

const loginCssPath = path.resolve(__dirname, '../../frontend/src/components/Login.css');
const loginCss = fs.readFileSync(loginCssPath, 'utf8');

// ============================================================================
// TEST 1: CARD STRUCTURE, DIMENSIONS & TIGHTENED SPACING
// ============================================================================
console.log('Test 1: Verify single white card container, removed inner box, and tightened spacing...');
assert(loginContent.includes('className="lg-card"'), 'Login must use single .lg-card container');
assert(!loginContent.includes('rexa-card-outer'), 'Old nested card .rexa-card-outer must not be used');
assert(!loginContent.includes('rexa-portal-card'), 'Old nested card .rexa-portal-card must not be used');
assert(!loginContent.includes('<form onSubmit={handleSubmit} className="lg-form sap-login-canvas'), 'Form must not have sap-login-canvas inner box');

assert.match(loginCss, /\.login-page\s+\.lg-card\s*\{[^}]*border-radius:\s*1\.7cqw;/s, 'Card must have border-radius: 1.7cqw');
assert.match(loginCss, /\.login-page\s+\.lg-card\s*\{[^}]*border:\s*1px solid #FED7AA;/s, 'Card must have 1px solid #FED7AA border');
assert.match(loginCss, /\.login-page\s+\.lg-card\s*\{[^}]*box-shadow:\s*0\s+20px\s+60px\s+rgba\(194,\s*65,\s*12,\s*0\.15\);/s, 'Card must have soft shadow 0 20px 60px rgba(194,65,12,0.15)');
assert.match(loginCss, /\.login-page\s+\.lg-card\s*\{[^}]*padding:\s*32px\s+36px;/s, 'Card padding must be 32px top/bottom and 36px left/right');

// Tightened spacing specifications
assert.match(loginCss, /\.login-page\s+\.lg-logo-wrap\s*\{[^}]*margin-bottom:\s*10px;/s, 'Spacing: 10px logo to welcome');
assert.match(loginCss, /\.login-page\s+\.lg-welcome\s*\{[^}]*margin-bottom:\s*16px;/s, 'Spacing: 16px welcome to Sign In');
assert.match(loginCss, /\.login-page\s+\.lg-title\s*\{[^}]*margin:\s*0\s+0\s+4px\s+0;/s, 'Spacing: 4px Sign In to subtitle');
assert.match(loginCss, /\.login-page\s+\.lg-intro\s*\{[^}]*margin-bottom:\s*20px;/s, 'Spacing: 20px subtitle to first label');
assert.match(loginCss, /\.login-page\s+\.lg-label\s*\{[^}]*margin:\s*0\s+0\s+6px\s+0;/s, 'Spacing: 6px label to field');
assert.match(loginCss, /\.login-page\s+\.lg-field\s*\{[^}]*margin-bottom:\s*14px;/s, 'Spacing: 14px between email field and Password label');
assert.match(loginCss, /\.login-page\s+\.lg-field-last\s*\{[^}]*margin-bottom:\s*20px;/s, 'Spacing: 20px password field to button');
console.log('   ✓ Single white card, no inner box, radius 1.7cqw, #FED7AA border, soft shadow, and tightened spacing verified');

// ============================================================================
// TEST 2: TYPOGRAPHY & BRANDING
// ============================================================================
console.log('\nTest 2: Verify typography and copy...');
assert(loginContent.includes('Welcome to the RexaEdge'), 'Heading must be "Welcome to the RexaEdge"');
assert(loginContent.includes('Sign In'), 'Heading must be "Sign In"');
assert(loginContent.includes('Access your SAP operations and automations'), 'Subtitle must be "Access your SAP operations and automations"');

// Ensure no emoji anywhere in the card
assert(!loginContent.includes('🔒 Sign In'), 'No lock emoji in Sign In heading');
assert(!/[🔒🔓🔑🚪🔐]/.test(loginContent), 'No emoji icons allowed in Login.jsx');

// CSS Typography specs
assert.match(loginCss, /\.login-page\s+\.lg-logo-img\s*\{[^}]*width:\s*160px;/s, 'Logo must be 160px wide');
assert.match(loginCss, /\.login-page\s+\.lg-welcome-title\s*\{[^}]*font-size:\s*20px;[^}]*font-weight:\s*600;[^}]*color:\s*#0F2744;/s, 'Welcome must be 20px semi-bold navy');
assert.match(loginCss, /\.login-page\s+\.lg-title\s*\{[^}]*font-size:\s*28px;[^}]*font-weight:\s*700;[^}]*color:\s*#0F2744;/s, 'Sign In must be 28px bold navy');
assert.match(loginCss, /\.login-page\s+\.lg-subtitle\s*\{[^}]*font-size:\s*15px;[^}]*color:\s*#475569;/s, 'Subtitle must be 15px slate-600');
console.log('   ✓ Logo 160px, "Welcome to the RexaEdge" 20px semi-bold navy, "Sign In" 28px bold navy without emojis, subtitle 15px slate-600');

// ============================================================================
// TEST 3: FIELDS, LABELS, OUTLINE ICONS, TOGGLE & FOCUS
// ============================================================================
console.log('\nTest 3: Verify form fields, visible labels, outline icons, and focus ring...');
assert(loginContent.includes('htmlFor="sap-email"'), 'Email label must use real htmlFor="sap-email"');
assert(loginContent.includes('htmlFor="sap-password"'), 'Password label must use real htmlFor="sap-password"');
assert(loginContent.includes('Email Address'), 'Visible "Email Address" label text');
assert(loginContent.includes('Password'), 'Visible "Password" label text');

// Input attributes
assert(loginContent.includes('type="email"'), 'Email input must have type="email"');
assert(loginContent.includes('autoComplete="username"'), 'Email input must have autoComplete="username"');
assert(loginContent.includes('inputMode="email"'), 'Email input must have inputMode="email"');
assert(loginContent.includes('autoComplete="current-password"'), 'Password input must have autoComplete="current-password"');
assert(loginContent.includes('placeholder="e.g. user@nextitpoint.com"'), 'Email placeholder must be "e.g. user@nextitpoint.com"');
assert(loginContent.includes('placeholder="Enter your password"'), 'Password placeholder must be "Enter your password"');

// Outline icons
assert(loginContent.includes('<Mail size={18} strokeWidth={1.8}'), 'Email must use outline Mail icon 18px');
assert(loginContent.includes('<Lock size={18} strokeWidth={1.8}'), 'Password must use outline Lock icon 18px');
assert(loginContent.includes('aria-label={showPassword ? \'Hide password\' : \'Show password\'}'), 'Eye toggle must have accessible aria-label');

// Field CSS specs
assert.match(loginCss, /\.login-page\s+\.lg-label\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*600;[^}]*color:\s*#0F2744;/s, 'Label must be 14px semi-bold navy');
assert.match(loginCss, /\.login-page\s+\.lg-input\s*\{[^}]*height:\s*52px;[^}]*border:\s*1px solid #FDBA74;[^}]*border-radius:\s*10px;/s, 'Input must be 52px high, radius 10px, 1px #FDBA74 border');
assert.match(loginCss, /\.login-page\s+\.lg-input:focus\s*\{[^}]*border-color:\s*#EA580C;[^}]*box-shadow:\s*0\s+0\s+0\s+2px\s+#EA580C/s, 'Focus must be 2px #EA580C ring with soft glow, no border-width change');
console.log('   ✓ Visible labels, 52px inputs, #FDBA74 border, outline icons, eye toggle, and 2px #EA580C focus ring verified');

// ============================================================================
// TEST 4: SIGN IN BUTTON
// ============================================================================
console.log('\nTest 4: Verify Sign In button specifications...');
assert(loginContent.includes('<LogIn size={20} strokeWidth={2}'), 'LogIn outline icon (20px) must be present in button');
const btnIconIdx = loginContent.indexOf('LogIn size={20}');
const btnTextIdx = loginContent.indexOf('<span>Sign In</span>');
assert(btnIconIdx < btnTextIdx, 'LogIn icon must appear BEFORE the "Sign In" text');

// Button CSS specs
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*height:\s*52px;/s, 'Button must be 52px high');
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*border-radius:\s*10px;/s, 'Button must have border-radius: 10px');
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#F97316\s*0%,\s*#EA580C\s*100%\);/s, 'Button must have orange gradient (#F97316 to #EA580C)');
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*font-size:\s*16px;/s, 'Button font-size must be 16px');
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*font-weight:\s*600;/s, 'Button font-weight must be 600');
assert.match(loginCss, /\.login-page\s+\.lg-btn\s*\{[^}]*color:\s*#FFFFFF;/s, 'Button text color must be white');
assert.match(loginCss, /\.login-page\s+\.lg-btn:hover:not\(:disabled\)\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#EA580C\s*0%,\s*#C2410C\s*100%\);/s, 'Button hover must be darker gradient');
assert.match(loginCss, /\.login-page\s+\.lg-btn:focus-visible\s*\{[^}]*outline:\s*2px solid #EA580C;/s, 'Button must have 2px focus ring');
assert.match(loginCss, /\.login-page\s+\.lg-btn:disabled\s*\{[^}]*opacity:\s*0\.65;/s, 'Button disabled state verified');
console.log('   ✓ Sign In button 52px high, radius 10px, gradient #F97316->#EA580C, white 16px semi-bold, LogIn icon before text');

// ============================================================================
// TEST 5: PRESERVED ESSENTIAL FEATURES
// ============================================================================
console.log('\nTest 5: Verify preserved error handling and accessibility...');
assert(loginContent.includes('role="alert"') && loginContent.includes('aria-live="assertive"'), 'Error overlay has role="alert" and aria-live="assertive"');
assert(loginContent.includes('onSubmit={handleSubmit}'), 'Enter to submit supported via form onSubmit');
console.log('   ✓ Error alert accessibility and keyboard Enter submit preserved');

// ============================================================================
// TEST 6: SCOPE GUARD TEST (Login.css MUST NOT LEAK INTO APPLICATION)
// ============================================================================
console.log('\nTest 6: RUNNING SCOPE GUARD TEST ON Login.css...');

// Helper to extract every CSS selector from Login.css
function extractCssSelectors(cssText) {
  const clean = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  let depth = 0;
  let inKeyframes = false;
  let currentSelector = '';

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '{') {
      const trimmed = currentSelector.trim();
      if (trimmed.startsWith('@keyframes')) {
        inKeyframes = true;
      } else if (trimmed.startsWith('@media')) {
        // media container, ignore header
      } else if (inKeyframes) {
        // keyframe stop (e.g. from, to, 50%), ignore
      } else {
        const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
          selectors.push(p);
        }
      }
      depth++;
      currentSelector = '';
    } else if (ch === '}') {
      depth--;
      if (depth === 0) inKeyframes = false;
      currentSelector = '';
    } else if (depth === 0 || (depth === 1 && !inKeyframes)) {
      currentSelector += ch;
    }
  }
  return selectors;
}

const allSelectors = extractCssSelectors(loginCss);
assert(allSelectors.length > 0, 'Login.css must contain CSS selectors');

// Guard Rule 1: Every selector must be under .login-page
const selectorsNotUnderRoot = allSelectors.filter(s => !s.startsWith('.login-page'));
assert.strictEqual(
  selectorsNotUnderRoot.length,
  0,
  `Guard Test Failed: All selectors in Login.css must start with .login-page! Offending: ${selectorsNotUnderRoot.join(', ')}`
);

// Guard Rule 2: No shared classes (.sap-input, .sap-btn-*, .sap-card, .sap-form-*)
const forbiddenSharedRegex = /\.sap-(?:input|btn|card|form)/i;
const selectorsUsingShared = allSelectors.filter(s => forbiddenSharedRegex.test(s));
assert.strictEqual(
  selectorsUsingShared.length,
  0,
  `Guard Test Failed: Login.css must NOT use or restyle shared classes (.sap-input, .sap-btn-*, .sap-card, .sap-form-*)! Offending: ${selectorsUsingShared.join(', ')}`
);

// Guard Rule 3: No :root tokens
const selectorsUsingRoot = allSelectors.filter(s => s.includes(':root'));
assert.strictEqual(
  selectorsUsingRoot.length,
  0,
  `Guard Test Failed: Login.css must NOT define or restyle :root tokens! Offending: ${selectorsUsingRoot.join(', ')}`
);

// Guard Rule 4: No bare element selectors (input, label, button, ::placeholder)
const bareElementRegex = /(?:^|\s)(?:input|label|button)(?:::|:|\s|$)/i;
const selectorsWithBareElements = allSelectors.filter(s => bareElementRegex.test(s));
assert.strictEqual(
  selectorsWithBareElements.length,
  0,
  `Guard Test Failed: Login.css must NOT use bare element selectors! Offending: ${selectorsWithBareElements.join(', ')}`
);

// Guard Rule 5: No !important in Login.css
const cleanNoComments = loginCss.replace(/\/\*[\s\S]*?\*\//g, '');
assert(
  !cleanNoComments.includes('!important'),
  'Guard Test Failed: Login.css must not use !important'
);

console.log(`   ✓ Guard test passed: all ${allSelectors.length} selectors are strictly under .login-page, 0 shared classes, 0 :root, 0 bare element selectors, 0 !important\n`);

console.log('============================================================');
console.log('  ALL LOGIN PAGE UI AND GUARD TESTS PASSED! (100%)          ');
console.log('============================================================\n');
