import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING NOTIFICATION PLACEMENT & INLINE VALIDATION TESTS  ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const indexCssPath = path.resolve(frontendDir, 'src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

// ============================================================================
// 1. SHARED NOTIFICATION MECHANISM & PLACEMENTS
// ============================================================================
console.log('Test 1: Shared Notification component supporting inline, banner, and popup placements...');

const notificationCompPath = path.resolve(frontendDir, 'src/components/Notification.jsx');
assert(fs.existsSync(notificationCompPath), 'Notification.jsx must exist');
const notificationComp = fs.readFileSync(notificationCompPath, 'utf8');

assert(
  notificationComp.includes('NotificationPlacementContext') &&
  notificationComp.includes('NotificationPlacementProvider') &&
  notificationComp.includes('useNotificationPlacement'),
  'Notification.jsx must export placement context, provider, and hook'
);

assert(
  notificationComp.includes('role={computedRole}') || notificationComp.includes('role="alert"'),
  'Notification must support role="alert" for error/warning notifications'
);

assert(
  notificationComp.includes('errorRef') && notificationComp.includes('handleCopyRef'),
  'Notification must preserve copyable error_ref line'
);

// Placement CSS classes
assert.match(
  indexCss,
  /\.sap-notification\s*\{[^}]*width:\s*100%;/s,
  '.sap-notification must be full width of container'
);

assert.match(
  indexCss,
  /\.sap-notification-inline\s*\{[^}]*box-shadow:/s,
  '.sap-notification-inline style block must exist'
);

assert.match(
  indexCss,
  /\.sap-notification-popup\s*\{[^}]*box-shadow:/s,
  '.sap-notification-popup style block must exist'
);

assert.match(
  indexCss,
  /\.sap-notification-banner\s*\{[^}]*box-shadow:/s,
  '.sap-notification-banner style block must exist'
);

console.log('   ✓ Shared Notification component and context-driven placement verified\n');

// ============================================================================
// 2. LOGIN & AUTH PAGES: OVERLAY ABOVE LOGO, ZERO CARD SHIFT & NO DUPLICATE
// ============================================================================
console.log('Test 2: Login page renders overlay notification above logo, no layout space, no double dispatch, no banner...');

const loginPath = path.resolve(frontendDir, 'src/components/Login.jsx');
const loginCode = fs.readFileSync(loginPath, 'utf8');

// 1. Error element positioned above logo inside right panel
const rightPanelIndex = loginCode.indexOf('sap-login-right-panel');
const errorIndex = loginCode.indexOf('sap-login-panel-error');
const logoIndex = loginCode.indexOf('sap-login-brand-center');
const canvasIndex = loginCode.indexOf('sap-login-canvas');
const emailIndex = loginCode.indexOf('id="sap-email"');
const pwdIndex = loginCode.indexOf('id="sap-password"');
const btnIndex = loginCode.indexOf('className="sap-btn-navy-login"');

assert(
  rightPanelIndex !== -1 && errorIndex !== -1 && logoIndex !== -1 && canvasIndex !== -1 &&
  rightPanelIndex < errorIndex && errorIndex < logoIndex && logoIndex < canvasIndex,
  'Error overlay must be placed inside right panel and above the RexaEdge logo'
);

// 2. Empty slot above email removed: tight layout
assert(
  !loginCode.includes('sap-login-error-slot'),
  'No reserved slot must exist inside form'
);

// 3. No error or notification element between password and Sign In button
assert(pwdIndex !== -1 && btnIndex !== -1, 'Password and button must exist');
const betweenPwdAndBtn = loginCode.slice(pwdIndex, btnIndex);
assert(
  !betweenPwdAndBtn.includes('sap-login-error') && !betweenPwdAndBtn.includes('Notification'),
  'No error box or spacer must exist between password field and Sign In button'
);

// 4. No double dispatch: Login.jsx must NOT call toast.error
assert(
  !loginCode.includes('toast.error(msg)'),
  'Login.jsx must NOT call toast.error; error must only be dispatched to the inline state'
);

// 5. Absolute positioning at top: 24px and right panel padding (80px - 96px)
assert.match(
  indexCss,
  /\.sap-login-panel-error\s*\{[^}]*position:\s*absolute;[^}]*top:\s*24px;/s,
  '.sap-login-panel-error must be absolutely positioned at top: 24px'
);
assert.match(
  indexCss,
  /\.sap-login-right-panel\s*\{[^}]*position:\s*relative;[^}]*padding:\s*(?:8[0-9]|9[0-6])px/s,
  '.sap-login-right-panel must have position: relative and top padding between 80px and 96px'
);

// 6. Amber styling: amber-50 bg, amber-300 border, amber-500 left accent, amber-900 text
assert.match(
  indexCss,
  /\.sap-login-error-alert\s*\{[^}]*background-color:\s*#FFFBEB;[^}]*border:\s*1px solid #FCD34D;[^}]*border-left:\s*3px solid #F59E0B;[^}]*color:\s*#78350F;/s,
  '.sap-login-error-alert must use Amber-50 bg, Amber-300 border, Amber-500 left accent (3px), and Amber-900 text'
);

// 7. Alert has role="alert", close button, and title tooltip for full message
assert(
  loginCode.includes('role="alert"') && loginCode.includes('title={errorMessage}'),
  'Alert must include role="alert" and full text in title tooltip'
);
assert(
  loginCode.includes('className="sap-login-error-close"'),
  'Alert must include a close (x) button'
);

// 8. Cleared on field edit or submit
assert(
  loginCode.includes('handleEmailChange') && loginCode.includes('clearErrors'),
  'Login must clear errors on email change'
);
assert(
  loginCode.includes('handlePasswordChange') && loginCode.includes('clearErrors'),
  'Login must clear errors on password change'
);
assert(
  loginCode.includes('handleSubmit') && loginCode.includes('clearErrors'),
  'Login must clear errors on form submission'
);

// 9. Extra vertical gap between password field and Sign In button removed
assert.match(
  indexCss,
  /\.sap-btn-navy-login\s*\{[^}]*margin-top:\s*0;/s,
  '.sap-btn-navy-login must have margin-top: 0 to remove extra gap'
);

// 10. ToastContainer suppresses global floating banner on auth pages
const toastContextPath = path.resolve(frontendDir, 'src/context/ToastContext.jsx');
const toastContextCode = fs.readFileSync(toastContextPath, 'utf8');
assert(
  toastContextCode.includes('isAuthPage') || toastContextCode.includes('suppressBanner'),
  'ToastContainer must suppress global floating banner on auth pages'
);

console.log('   ✓ Login error displays only once as overlay above logo, zero card shift, no double dispatch, no banner\n');

// ============================================================================
// 3. APP BANNER POSITIONING & ZERO LAYOUT SHIFT
// ============================================================================
console.log('Test 3: App pages banner floating under top bar without layout shift...');

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*position:\s*fixed;[^}]*top:\s*calc\(var\(--topbar-height,\s*60px\)\s*\+\s*12px\);/s,
  'Toast banner must be fixed under top bar'
);

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*right:\s*var\(--page-gutter,\s*32px\);/s,
  'Toast banner must be right-aligned under top bar'
);

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*max-width:\s*440px;/s,
  'Toast banner max-width must be 440px'
);

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*min-width:\s*320px;/s,
  'Toast banner min-width must be 320px'
);

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*z-index:\s*10000[0-9];/s,
  'Toast banner must have high z-index to overlay content without layout shift'
);

console.log('   ✓ App banner overlaying content under top bar with zero layout shift verified\n');

// ============================================================================
// 4. POPUPS, MODALS, AND F4 DIALOGS: ERRORS INSIDE POPUP
// ============================================================================
console.log('Test 4: Popups and modals contain errors inside the popup body...');

const modalPath = path.resolve(frontendDir, 'src/components/Modal.jsx');
const modalCode = fs.readFileSync(modalPath, 'utf8');

assert(
  modalCode.includes('NotificationPlacementProvider placement="popup"') ||
  modalCode.includes("NotificationPlacementProvider placement='popup'"),
  'Modal component must provide popup notification placement context'
);

assert(
  modalCode.includes('<NotificationOutlet placement="popup" />'),
  'Modal must render popup NotificationOutlet inside modal body'
);

const pwdModalPath = path.resolve(frontendDir, 'src/components/PasswordModal.jsx');
const pwdModalCode = fs.readFileSync(pwdModalPath, 'utf8');
assert(
  pwdModalCode.includes('placement="popup"'),
  'PasswordModal must render error with placement="popup" inside dialog'
);

const f4OverlayPath = path.resolve(frontendDir, 'src/components/F4PopupOverlay.jsx');
const f4OverlayCode = fs.readFileSync(f4OverlayPath, 'utf8');
assert(
  f4OverlayCode.includes('NotificationPlacementProvider placement="popup"') ||
  f4OverlayCode.includes("NotificationPlacementProvider placement='popup'"),
  'F4PopupOverlay must wrap children in popup notification placement provider'
);

console.log('   ✓ Popup errors and empty states contained inside popup body verified\n');

// ============================================================================
// 5. FORM VALIDATION: AMBER BORDERS, RESERVED ERROR MESSAGE SPACE, FOCUS MOVEMENT
// ============================================================================
console.log('Test 5: Form validation reserved space (.sap-field-error-msg) and focus movement...');

// CSS reserved space check
assert.match(
  indexCss,
  /\.sap-field-error-msg\s*\{[^}]*min-height:\s*18px;/s,
  '.sap-field-error-msg must reserve 18px height to eliminate layout shift'
);

assert.match(
  indexCss,
  /\.input-error[^{]*\{[^}]*border-color:\s*#F59E0B/s,
  'input-error must use amber border (#F59E0B), strictly no red'
);

// Check CreateBomView.jsx
const createBomPath = path.resolve(frontendDir, 'src/components/CreateBomView.jsx');
const createBomCode = fs.readFileSync(createBomPath, 'utf8');
assert(
  createBomCode.includes('sap-field-error-msg'),
  'CreateBomView must use reserved space .sap-field-error-msg under header fields'
);
assert(
  createBomCode.includes('headerFieldMap[firstInvalidHeader]') && createBomCode.includes('.focus()'),
  'CreateBomView must focus first invalid header field'
);

// Check ValidateBomView.jsx
const validateBomPath = path.resolve(frontendDir, 'src/components/ValidateBomView.jsx');
const validateBomCode = fs.readFileSync(validateBomPath, 'utf8');
assert(
  validateBomCode.includes('sap-field-error-msg'),
  'ValidateBomView must use reserved space .sap-field-error-msg under fields'
);
assert(
  validateBomCode.includes('document.getElementById(\'valMaterial\')?.focus()'),
  'ValidateBomView must move focus to first invalid field'
);

// Check DeleteBomForm.jsx
const deleteBomPath = path.resolve(frontendDir, 'src/components/DeleteBomForm.jsx');
const deleteBomCode = fs.readFileSync(deleteBomPath, 'utf8');
assert(
  deleteBomCode.includes('sap-field-error-msg'),
  'DeleteBomForm must use reserved space .sap-field-error-msg under fields'
);
assert(
  deleteBomCode.includes('fieldIdMap[firstInvalid]') && deleteBomCode.includes('.focus()'),
  'DeleteBomForm must move focus to first invalid field'
);

// Check CreateBomForm.jsx (Copy BOM)
const copyBomPath = path.resolve(frontendDir, 'src/components/CreateBomForm.jsx');
const copyBomCode = fs.readFileSync(copyBomPath, 'utf8');
assert(
  copyBomCode.includes('sap-field-error-msg'),
  'CreateBomForm must use reserved space .sap-field-error-msg under fields'
);
assert(
  copyBomCode.includes('fieldIdMap[firstInvalid]') && copyBomCode.includes('.focus()'),
  'CreateBomForm must move focus to first invalid field'
);

console.log('   ✓ Form validation banner, amber input-error, 18px reserved space, and focus movement verified\n');

// ============================================================================
// 6. ADMIN PAGES: CARD-LEVEL INLINE ERRORS
// ============================================================================
console.log('Test 6: Admin pages render errors inline at top of card/table...');

const adminViewPath = path.resolve(frontendDir, 'src/components/AdminView.jsx');
const adminViewCode = fs.readFileSync(adminViewPath, 'utf8');

assert(
  adminViewCode.includes('usersError') && adminViewCode.includes('Notification') && adminViewCode.includes('placement="inline"'),
  'AdminView must render inline error for Users tab'
);
assert(
  adminViewCode.includes('serversError') && adminViewCode.includes('Notification') && adminViewCode.includes('placement="inline"'),
  'AdminView must render inline error for Servers tab'
);
assert(
  adminViewCode.includes('permissionsError') && adminViewCode.includes('Notification') && adminViewCode.includes('placement="inline"'),
  'AdminView must render inline error for Permissions tab'
);

const logsViewPath = path.resolve(frontendDir, 'src/components/AdminActivityLogsView.jsx');
const logsViewCode = fs.readFileSync(logsViewPath, 'utf8');
assert(
  logsViewCode.includes('errorMsg') && logsViewCode.includes('Notification') && logsViewCode.includes('placement="inline"'),
  'AdminActivityLogsView must render inline error at top of logs card'
);

console.log('   ✓ Admin table/card inline amber errors verified\n');

// ============================================================================
// 7. SUCCESS & INFO AUTO-CLOSE (~4 SECONDS)
// ============================================================================
console.log('Test 7: Success and Info auto-close duration (~4 seconds)...');

assert.match(
  toastContextCode,
  /if\s*\(\s*type\s*===\s*'success'\s*\|\|\s*type\s*===\s*'info'\s*\)\s*\{\s*duration\s*=\s*4000;/,
  'Success and Info toasts must auto-close after 4000ms'
);

console.log('   ✓ Success and info auto-close duration verified\n');

// ============================================================================
// 8. STRICT NO-RED THEME INTEGRITY
// ============================================================================
console.log('Test 8: Strict No-Red Theme Integrity across notification components and styles...');

// Check notification CSS for any prohibited red colors
const redHexRegex = /#(?:f00|ff0000|e53e3e|dc2626|ef4444|b91c1c|991b1b|f87171|fca5a5|fee2e2|fef2f2|fde8e8|f8b4b4|9b1c1c)\b/i;
const notificationCssMatch = indexCss.match(/\.sap-notification[^}]*\{[^}]*\}/g) || [];
notificationCssMatch.forEach((block) => {
  assert(
    !redHexRegex.test(block),
    `Prohibited red color found in notification CSS: ${block}`
  );
});

console.log('   ✓ Zero red color violations verified across notification styles\n');

console.log('============================================================');
console.log('  ALL NOTIFICATION PLACEMENT TESTS PASSED (100%)            ');
console.log('============================================================\n');
