import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, '../frontend/src');

console.log('============================================================');
console.log('  RUNNING LOGIN ERROR FIX & PANEL OVERLAY LAYOUT TESTS      ');
console.log('============================================================\n');

const loginFilePath = path.resolve(frontendDir, 'components/Login.jsx');
const loginCssPath = path.resolve(frontendDir, 'components/Login.css');
const toastContextPath = path.resolve(frontendDir, 'context/ToastContext.jsx');

const loginCode = fs.readFileSync(loginFilePath, 'utf8');
const loginCss = fs.readFileSync(loginCssPath, 'utf8');
const toastContextCode = fs.readFileSync(toastContextPath, 'utf8');

// ============================================================================
// 1. SINGLE ERROR DISPATCH, NO DOUBLE NOTIFICATION
// ============================================================================
console.log('Test 1: Single error element, no double dispatch, no floating banner...');

// In Login.jsx, errorMessage state must be set, but toast.error must NOT be dispatched
assert(
  loginCode.includes('setErrorMessage('),
  'Login.jsx must set errorMessage state on failure'
);
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
const alertOccurrences = (loginCode.match(/className="lg-error-overlay"/g) || []).length;
assert.strictEqual(
  alertOccurrences,
  1,
  'Login.jsx must have exactly one error alert element'
);

console.log('   ✓ Single error dispatch confirmed; global floating banner suppressed on login\n');

// ============================================================================
// 2. ERROR POSITION: ABSOLUTE OVERLAY OUTSIDE CARD FLOW (ZERO LAYOUT SHIFT)
// ============================================================================
console.log('Test 2: Error overlay positioned outside card flow (zero layout shift)...');

const formPanelIndex = loginCode.indexOf('className="lg-form-panel"');
const cardWrapperIndex = loginCode.indexOf('className="lg-card-wrapper"');
const errorIndex = loginCode.indexOf('className="lg-error-overlay"');
const cardIndex = loginCode.indexOf('className="lg-card"');
const emailIndex = loginCode.indexOf('id="login-email"');
const passwordIndex = loginCode.indexOf('id="login-password"');
const buttonIndex = loginCode.indexOf('className="lg-submit-btn"');

assert(formPanelIndex !== -1, 'lg-form-panel must exist in Login.jsx');
assert(cardWrapperIndex !== -1, 'lg-card-wrapper must exist in Login.jsx');
assert(errorIndex !== -1, 'lg-error-overlay must exist in Login.jsx');
assert(cardIndex !== -1, 'lg-card must exist in Login.jsx');

// DOM order: inside card-wrapper, before card in DOM but absolutely positioned
assert(
  cardWrapperIndex < errorIndex,
  'Error element must be inside lg-card-wrapper'
);
assert(
  errorIndex < cardIndex,
  'Error element must precede lg-card in DOM tree'
);

// Form has NO reserved blank slot inside the card
assert(
  !loginCode.includes('lp-error-container') && !loginCode.includes('sap-login-error-slot'),
  'Blank reserved slot under subtitle must be removed'
);

// Verify nothing exists between password and Sign In button
const betweenPwdAndBtn = loginCode.slice(passwordIndex, buttonIndex);
assert(
  !betweenPwdAndBtn.includes('lg-error') &&
  !betweenPwdAndBtn.includes('Notification') &&
  !betweenPwdAndBtn.includes('role="alert"'),
  'No error box or notification must exist between password field and Sign in button'
);

console.log('   ✓ Error element positioned above card; blank reserved slot removed\n');

// ============================================================================
// 3. ZERO LAYOUT SHIFT CSS RULES
// ============================================================================
console.log('Test 3: Absolutely positioned overlay: takes no layout space, zero layout shift...');

assert.match(
  loginCss,
  /\.login-page\s+\.lg-error-overlay\s*\{[^}]*position:\s*absolute;/s,
  '.lg-error-overlay must have position: absolute for 0px layout shift'
);

assert.match(
  loginCss,
  /\.login-page\s+\.lg-card-wrapper\s*\{[^}]*position:\s*relative;/s,
  '.lg-card-wrapper must have position: relative'
);

console.log('   ✓ Error overlay CSS rules verified: position: absolute for 0px layout shift\n');

console.log('============================================================');
console.log('  ALL LOGIN ERROR FIX & PANEL OVERLAY TESTS PASSED!         ');
console.log('============================================================\n');
