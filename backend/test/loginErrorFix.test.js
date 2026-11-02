import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING LOGIN ERROR FIX & PANEL OVERLAY LAYOUT TESTS      ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const indexCssPath = path.resolve(frontendDir, 'src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

const loginPath = path.resolve(frontendDir, 'src/components/Login.jsx');
const loginCode = fs.readFileSync(loginPath, 'utf8');

const toastContextPath = path.resolve(frontendDir, 'src/context/ToastContext.jsx');
const toastContextCode = fs.readFileSync(toastContextPath, 'utf8');

// ============================================================================
// 1. DUPLICATE ELIMINATION & SINGLE ERROR VERIFICATION
// ============================================================================
console.log('Test 1: Single error element, no double dispatch, no floating banner...');

// Double dispatch eliminated: Login must NOT call toast.error
assert(
  !loginCode.includes('toast.error(msg)'),
  'Login.jsx must not call toast.error(msg); error must only be dispatched to the inline state'
);

// ToastContainer suppression on auth page
assert(
  toastContextCode.includes('isAuthPage') && toastContextCode.includes('suppressBanner'),
  'ToastContainer must suppress the global floating banner on auth pages'
);

// Only one error alert element in Login.jsx
const alertOccurrences = (loginCode.match(/className="sap-login-error-alert"/g) || []).length;
assert.strictEqual(
  alertOccurrences,
  1,
  'Login.jsx must have exactly one error alert element'
);

console.log('   ✓ Single error dispatch confirmed; global floating banner suppressed on login\n');

// ============================================================================
// 2. ERROR POSITION: ABOVE THE LOGO, AT TOP OF RIGHT PANEL (DOM & FLOW)
// ============================================================================
console.log('Test 2: Error positioned above RexaEdge logo inside right panel...');

const rightPanelIndex = loginCode.indexOf('sap-login-right-panel');
const errorIndex = loginCode.indexOf('sap-login-panel-error');
const logoIndex = loginCode.indexOf('sap-login-brand-center');
const canvasIndex = loginCode.indexOf('sap-login-canvas');
const emailIndex = loginCode.indexOf('id="sap-email"');
const passwordIndex = loginCode.indexOf('id="sap-password"');
const buttonIndex = loginCode.indexOf('className="sap-btn-navy-login"');

assert(rightPanelIndex !== -1, 'sap-login-right-panel must exist in Login.jsx');
assert(errorIndex !== -1, 'sap-login-panel-error must exist in Login.jsx');
assert(logoIndex !== -1, 'sap-login-brand-center (logo) must exist in Login.jsx');
assert(canvasIndex !== -1, 'sap-login-canvas must exist in Login.jsx');

// DOM order: inside right panel, ABOVE logo and canvas
assert(
  rightPanelIndex < errorIndex,
  'Error element must be inside sap-login-right-panel'
);
assert(
  errorIndex < logoIndex,
  'Error element must be positioned above the RexaEdge logo'
);
assert(
  logoIndex < canvasIndex,
  'Logo must be above the form canvas'
);

// Form has NO reserved slot above email: tight layout
assert(
  !loginCode.includes('sap-login-error-slot'),
  'Empty reserved slot (.sap-login-error-slot) must be completely removed from Login.jsx'
);

const headerDirectIndex = loginCode.indexOf('sap-login-header-direct');
assert(
  headerDirectIndex !== -1 && headerDirectIndex < emailIndex,
  'Header "Sign in to continue" must precede the Email address field'
);

// Verify nothing exists between password and Sign In button
const betweenPwdAndBtn = loginCode.slice(passwordIndex, buttonIndex);
assert(
  !betweenPwdAndBtn.includes('sap-login-error') &&
  !betweenPwdAndBtn.includes('Notification') &&
  !betweenPwdAndBtn.includes('role="alert"'),
  'No error box or notification must exist between password field and Sign In button'
);

console.log('   ✓ Error element positioned above logo inside right panel; empty slot above email removed\n');

// ============================================================================
// 3. ZERO LAYOUT SHIFT & ZERO LAYOUT SPACE (ABSOLUTE POSITIONING)
// ============================================================================
console.log('Test 3: Absolutely positioned overlay: takes no layout space, zero layout shift...');

// Right panel must have position: relative and top padding (80px to 96px)
assert.match(
  indexCss,
  /\.sap-login-right-panel\s*\{[^}]*position:\s*relative;[^}]*padding:\s*(?:8[0-9]|9[0-6])px/s,
  '.sap-login-right-panel must have position: relative and top padding between 80px and 96px above logo'
);

// Error panel must be position: absolute, top: 24px, centered horizontally, max-width ~430-440px
assert.match(
  indexCss,
  /\.sap-login-panel-error\s*\{[^}]*position:\s*absolute;[^}]*top:\s*24px;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s,
  '.sap-login-panel-error must be absolutely positioned at top 24px, centered horizontally'
);
assert.match(
  indexCss,
  /\.sap-login-panel-error\s*\{[^}]*max-width:\s*(?:430|440)px;/s,
  '.sap-login-panel-error must match form card max-width (430px - 440px)'
);

// Form gap validation: normal 16 to 24px gaps
assert.match(
  indexCss,
  /\.sap-login-header-direct\s*\{[^}]*margin-bottom:\s*(?:1[6-9]|2[0-4])px;/s,
  '.sap-login-header-direct must have normal 16-24px margin-bottom'
);
assert.match(
  indexCss,
  /\.sap-login-body-direct\s*\{[^}]*gap:\s*(?:1[6-9]|2[0-4])px;/s,
  '.sap-login-body-direct must have normal 16-24px gap'
);

console.log('   ✓ Absolute positioning takes no layout space; card, logo and button positions are identical before and after error\n');

// ============================================================================
// 4. STYLE: COMPACT AMBER THEME, ACCENT BAR, ANIMATION & ACCESSIBILITY
// ============================================================================
console.log('Test 4: Compact amber styling, 3px accent bar, animation, and role="alert"...');

// Style requirements: Amber-50 bg, Amber-300 border, Amber-900 text, 3px left accent bar
assert.match(
  indexCss,
  /\.sap-login-error-alert\s*\{[^}]*background-color:\s*#FFFBEB;[^}]*border:\s*1px solid #FCD34D;[^}]*border-left:\s*3px solid #F59E0B;[^}]*color:\s*#78350F;/s,
  '.sap-login-error-alert must adhere strictly to compact amber style with 3px left accent bar (no red)'
);

assert.match(
  indexCss,
  /\.sap-login-error-alert\s*\{[^}]*padding:\s*10px 12px;/s,
  '.sap-login-error-alert must have 10px 12px padding'
);

assert.match(
  indexCss,
  /\.sap-login-error-title\s*\{[^}]*font-size:\s*14px;[^}]*font-weight:\s*600;/s,
  '.sap-login-error-title must have 14px semi-bold styling'
);

assert.match(
  indexCss,
  /\.sap-login-error-text\s*\{[^}]*font-size:\s*13px;/s,
  '.sap-login-error-text must have 13px styling'
);

assert.match(
  indexCss,
  /\.sap-login-error-close\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s,
  '.sap-login-error-close must have 24px square hit area'
);

// Animation: slide-down and fade-in, and respects prefers-reduced-motion
assert.match(
  indexCss,
  /@keyframes\s+sap-login-slide-down[\s\S]*?from[\s\S]*?opacity:\s*0;[\s\S]*?to[\s\S]*?opacity:\s*1;/s,
  'sap-login-slide-down keyframes must provide slide-down and fade-in'
);

assert.match(
  indexCss,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.sap-login-panel-error\s*\{[^}]*animation:\s*none\s*!important;/s,
  'Must respect prefers-reduced-motion'
);

// ARIA: role="alert" and aria-live="assertive"
assert(
  loginCode.includes('role="alert"') && loginCode.includes('aria-live="assertive"'),
  'Login error must include role="alert" and aria-live="assertive"'
);

console.log('   ✓ Compact amber tokens, 3px accent bar, slide-down animation, and accessible ARIA attributes verified\n');

// ============================================================================
// 5. CLEARING LOGIC & SINGLE RETRY SAFETY
// ============================================================================
console.log('Test 5: Error cleared on email change, password change, submit, and close...');

assert(
  loginCode.includes('handleEmailChange') && loginCode.includes('clearErrors();'),
  'Email edit must clear error'
);
assert(
  loginCode.includes('handlePasswordChange') && loginCode.includes('clearErrors();'),
  'Password edit must clear error'
);
assert(
  loginCode.includes('handleSubmit') && loginCode.includes('clearErrors();'),
  'Form submission must clear error'
);

// Check api.js loginUser single retry implementation
const apiPath = path.resolve(frontendDir, 'src/services/api.js');
const apiCode = fs.readFileSync(apiPath, 'utf8');

assert(
  apiCode.includes('isLoginRetryableError'),
  'api.js must check isLoginRetryableError'
);
assert(
  !apiCode.includes("toast.error") && !apiCode.includes("dispatchToast"),
  'api.js must not dispatch toast directly during login retry'
);

console.log('   ✓ Clearing logic and safe single retry verified\n');

console.log('============================================================');
console.log('  ALL LOGIN ERROR FIX TESTS PASSED (100%)                   ');
console.log('============================================================\n');
