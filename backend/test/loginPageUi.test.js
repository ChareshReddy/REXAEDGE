import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  TESTING LOGIN PAGE UI TEXT, BRANDING & FOOTER            ');
console.log('============================================================\n');

const loginFilePath = path.resolve(__dirname, '../../frontend/src/components/Login.jsx');
const loginContent = fs.readFileSync(loginFilePath, 'utf8');

// Test 1: Branding updates
console.log('Test 1: Verify branding heading and subtitle...');
assert(
  loginContent.includes('<h2>Welcome to RexaEdge</h2>'),
  'Login card header must be "Welcome to RexaEdge"'
);
assert(
  loginContent.includes('<p>Sign in to continue</p>'),
  'Login card subtitle must be "Sign in to continue"'
);
console.log('   ✓ Card title is "Welcome to RexaEdge" and subtitle is "Sign in to continue"');

// Test 2: Elimination of Supabase and old portal text
console.log('\nTest 2: Ensure old portal title and Supabase text are completely removed...');
assert(
  !loginContent.includes('SAP Enterprise Portal'),
  'Old title "SAP Enterprise Portal" must not exist in Login.jsx'
);
assert(
  !loginContent.includes('Protected by Supabase Auth'),
  'Supabase Auth text must not exist in Login.jsx'
);
assert(
  !loginContent.includes('Sign in with your Next IT Point credentials'),
  'Old subtitle must not exist in Login.jsx'
);
assert(
  !loginContent.toLowerCase().includes('supabase'),
  'No mention of Supabase should remain in Login.jsx'
);
console.log('   ✓ No Supabase or legacy portal text found anywhere in Login.jsx');

// Test 3: Footer verification with dynamic current year
console.log('\nTest 3: Verify subtle centered footer with current year calculation...');
const currentYear = new Date().getFullYear();
assert(
  loginContent.includes('new Date().getFullYear()'),
  'Current year must be computed dynamically from current date'
);
assert(
  /RexaEdge\s*·\s*a\s+product\s+of\s+Next\s+IT\s+Point/i.test(loginContent),
  'Footer must contain "RexaEdge · a product of Next IT Point"'
);
assert(
  loginContent.includes('sap-login-footer'),
  'Footer must have class "sap-login-footer"'
);
console.log(`   ✓ Footer correctly computes dynamic year (${currentYear}) and branding: "© ${currentYear} RexaEdge · a product of Next IT Point"`);

// Test 4: Verify CSS classes and layout balance
console.log('\nTest 4: Verify CSS layout definitions for viewport, canvas, and footer...');
const cssFilePath = path.resolve(__dirname, '../../frontend/src/index.css');
const cssContent = fs.readFileSync(cssFilePath, 'utf8');

assert(cssContent.includes('.sap-login-viewport'), '.sap-login-viewport must be defined in index.css');
assert(cssContent.includes('.sap-login-canvas'), '.sap-login-canvas must be defined in index.css');
assert(cssContent.includes('.sap-login-footer'), '.sap-login-footer must be defined in index.css');
console.log('   ✓ Viewport, canvas, and sticky bottom footer classes cleanly defined in index.css');

// Test 5: Verify two-panel split screen, wireframe window illustration, and hero lines
console.log('\nTest 5: Verify split-screen panels, wireframe illustration, and hero lines...');
assert(
  loginContent.includes('sap-login-left-panel'),
  'Login page must contain left brand panel'
);
assert(
  loginContent.includes('sap-login-right-panel'),
  'Login page must contain right card panel'
);
assert(
  loginContent.includes('sap-login-window-illustration') || loginContent.includes('sapSignInHero') || loginContent.includes('sap-login-bg-overlay'),
  'Left panel must contain hero presentation (image or illustration)'
);
assert(
  !loginContent.includes('sap-login-bom-card'),
  'Old BOM tree mock card must be removed'
);
assert(
  loginContent.includes('SAP modules, one portal.'),
  'Hero heading must be "SAP modules, one portal."'
);
assert(
  loginContent.includes('Work in the SAP modules your administrator has enabled for you, with access set per module and per feature.'),
  'Hero line must match expected copy'
);
assert(
  loginContent.includes('Accounts are created and managed by your administrators.'),
  'Must include administrator note below button'
);
assert(
  loginContent.includes('sap-btn-navy-login'),
  'Button must use dark navy button class sap-btn-navy-login'
);
assert(
  cssContent.includes('.sap-login-left-panel'),
  '.sap-login-left-panel must be defined in index.css'
);
assert(
  cssContent.includes('.sap-login-right-panel'),
  '.sap-login-right-panel must be defined in index.css'
);
console.log('   ✓ Two-panel split layout, wireframe illustration, and hero value proposition verified');

console.log('\n============================================================');
console.log('  ALL LOGIN PAGE UI TESTS PASSED SUCCESSFULLY! (100%)       ');
console.log('============================================================\n');
