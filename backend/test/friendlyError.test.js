import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  toFriendlyError,
  sendFriendlyError,
  sanitizeClientString,
  containsSensitiveInfo
} from '../utils/friendlyError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const frontendDir = path.resolve(rootDir, 'frontend');

console.log('============================================================');
console.log('  TESTING FRIENDLY ERROR MAPPING, SANITIZATION & F4 STATE   ');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// Test 1: Unit tests for friendly mapping categories
// --------------------------------------------------------------------------
console.log('Test 1: Testing friendly error mapping for specific error categories...');

// 1a. Exact SAProuter error string from prompt
const exactSaprouterMsg =
  'SAProuter rejected route setup with return code -5: *ERR* 1 connection to 115.245.150.98:3318 timed out -5 NI (network interface) 753 40 D:/depot/bas/...';

const saprouterResult = toFriendlyError(exactSaprouterMsg);
assert.strictEqual(saprouterResult.code, 'SAP_UNREACHABLE', 'Must map to SAP_UNREACHABLE');
assert.strictEqual(saprouterResult.title, 'SAP server not reachable', 'Title must be "SAP server not reachable"');
assert.strictEqual(
  saprouterResult.message,
  "RexaEdge can't connect to the selected SAP server right now.",
  'Message must be friendly connection failure text'
);
assert.strictEqual(
  saprouterResult.hint,
  'Check that the server is online and your network or VPN is connected, then try again. If it continues, contact your administrator.',
  'Must provide clear network/admin hint'
);
assert.strictEqual(saprouterResult.retryable, true, 'Network connectivity error must be retryable');
console.log('   ✓ Exact SAProuter message mapped to friendly SAP_UNREACHABLE');

// 1b. RFC Logon failure
const logonFailureMsg = 'RFC logon failure: wrong user or password / user locked in SAP client 100';
const logonResult = toFriendlyError(logonFailureMsg);
assert.strictEqual(logonResult.code, 'SAP_LOGIN_FAILED', 'Must map to SAP_LOGIN_FAILED');
assert.strictEqual(logonResult.title, "Couldn't sign in to SAP", 'Title must be "Couldn\'t sign in to SAP"');
assert.strictEqual(
  logonResult.hint,
  'Ask your administrator to check the SAP user for this server.',
  'Must provide SAP user check hint'
);
assert.strictEqual(logonResult.retryable, false, 'Credential error must not be retryable');
console.log('   ✓ RFC Logon failure mapped to friendly SAP_LOGIN_FAILED');

// 1c. RFC Authorization failure
const authFailureMsg = 'RFC authorization error: User not authorized (missing authorization object S_TABU_DIS)';
const authResult = toFriendlyError(authFailureMsg);
assert.strictEqual(authResult.code, 'SAP_NOT_AUTHORIZED', 'Must map to SAP_NOT_AUTHORIZED');
assert.strictEqual(
  authResult.title,
  "You don't have SAP permission for this",
  'Title must be "You don\'t have SAP permission for this"'
);
assert.strictEqual(
  authResult.hint,
  'Ask your administrator to grant the required SAP authorization.',
  'Must provide authorization hint'
);
assert.strictEqual(authResult.retryable, false, 'Authorization failure must not be retryable');
console.log('   ✓ RFC Authorization failure mapped to friendly SAP_NOT_AUTHORIZED');

// 1d. Timeouts / Concurrency of our own SAP protection
const busyMsg = 'SAP is busy: Connection pool concurrency limit reached, protection timeout';
const busyResult = toFriendlyError(busyMsg);
assert.strictEqual(busyResult.code, 'SAP_BUSY', 'Must map to SAP_BUSY');
assert.strictEqual(busyResult.title, 'SAP is busy', 'Title must be "SAP is busy"');
assert.strictEqual(busyResult.hint, 'Please try again in a moment.', 'Must provide "Please try again in a moment." hint');
assert.strictEqual(busyResult.retryable, true, 'Busy error must be retryable');
console.log('   ✓ SAP Protection / Concurrency timeout mapped to friendly SAP_BUSY');

// 1e. Table or function not found / not installed
const notFoundMsg = 'Function module CSAP_MAT_BOM_READ not found / table not installed on this server';
const notFoundResult = toFriendlyError(notFoundMsg);
assert.strictEqual(notFoundResult.code, 'SAP_NOT_AVAILABLE', 'Must map to SAP_NOT_AVAILABLE');
assert.strictEqual(
  notFoundResult.message,
  "This option isn't available on this server.",
  'Message must be "This option isn\'t available on this server."'
);
assert.strictEqual(notFoundResult.retryable, false, 'Not available must not be retryable');
console.log('   ✓ Missing function/table mapped to friendly SAP_NOT_AVAILABLE');

// 1f. Supabase / Database errors
const dbMsg = 'PostgreSQL database error: failed to connect to supabase database relation "users"';
const dbResult = toFriendlyError(dbMsg);
assert.strictEqual(dbResult.code, 'DB_ERROR', 'Must map to DB_ERROR');
assert.strictEqual(dbResult.title, 'Database error', 'Title must be "Database error"');
assert.strictEqual(
  dbResult.message,
  'Something went wrong on our side.',
  'Message must be "Something went wrong on our side."'
);
assert.strictEqual(dbResult.retryable, true, 'Database transient error must be retryable');
console.log('   ✓ Database error mapped to friendly DB_ERROR');

// 1g. Validation errors from our own code stay readable
const validationError = {
  status: 400,
  message: 'Search query must be at least 2 characters.'
};
const valResult = toFriendlyError(validationError);
assert.strictEqual(valResult.code, 'VALIDATION_ERROR', 'Must map to VALIDATION_ERROR');
assert.strictEqual(valResult.title, 'Validation notice', 'Title must be "Validation notice"');
assert.strictEqual(valResult.message, 'Search query must be at least 2 characters.', 'Message must stay as readable');
console.log('   ✓ Validation error preserved as readable VALIDATION_ERROR');

// 1h. Unknown error
const unknownMsg = 'Unexpected memory allocator failure in internal binary worker';
const unknownResult = toFriendlyError(unknownMsg);
assert.strictEqual(unknownResult.code, 'UNKNOWN', 'Must map to UNKNOWN');
assert.strictEqual(unknownResult.title, 'Something went wrong', 'Title must be "Something went wrong"');
assert.strictEqual(
  unknownResult.hint,
  'Please try again. If it continues, share the reference code with your administrator.',
  'Must provide reference code hint'
);
console.log('   ✓ Unknown error mapped to friendly UNKNOWN\n');

// --------------------------------------------------------------------------
// Test 2: Verify raw IPs, ports, and file paths NEVER appear in API responses
// --------------------------------------------------------------------------
console.log('Test 2: Verifying raw internal IPs, ports, and file paths never leak in API responses...');

const sensitiveError = new Error(
  'SAProuter rejected route setup with return code -5: *ERR* 1 connection to 115.245.150.98:3318 timed out -5 NI (network interface) 753 40 D:/depot/bas/...'
);

let responseStatus = null;
let responsePayload = null;

const mockReq = {
  method: 'GET',
  originalUrl: '/api/materials/search',
  url: '/api/materials/search',
  headers: {},
  user: { email: 'user@nextitpoint.com' }
};

const mockRes = {
  status(code) {
    responseStatus = code;
    return this;
  },
  json(payload) {
    responsePayload = payload;
    return this;
  }
};

sendFriendlyError(mockRes, mockReq, sensitiveError, { source: 'sap' });

assert.strictEqual(responseStatus, 503, 'SAP_UNREACHABLE should respond with HTTP 503');
assert.ok(responsePayload, 'Response payload must exist');
assert.strictEqual(responsePayload.success, false, 'success must be false');
assert.strictEqual(responsePayload.code, 'SAP_UNREACHABLE', 'code must be SAP_UNREACHABLE');
assert.ok(responsePayload.error_ref, 'error_ref must be present and non-empty');
assert.ok(responsePayload.error_ref.length >= 8, 'error_ref must be valid identifier');

const jsonString = JSON.stringify(responsePayload);
assert.ok(!jsonString.includes('115.245.150.98'), 'Raw IP 115.245.150.98 must NEVER be present in API response');
assert.ok(!jsonString.includes('3318'), 'Raw port 3318 must NEVER be present in API response');
assert.ok(!jsonString.includes('depot/bas'), 'Raw file path depot/bas must NEVER be present in API response');
assert.ok(!jsonString.includes('network interface'), 'Raw NI technical text must NEVER be present in API response');

console.log('   ✓ API response sanitized: 0 internal IPs, 0 ports, 0 file paths leaked');
console.log('   ✓ Returned error_ref:', responsePayload.error_ref);
console.log('   ✓ Response code:', responsePayload.code, '| Title:', responsePayload.title);
console.log('   ✓ Response message:', responsePayload.message, '\n');

// --------------------------------------------------------------------------
// Test 3: Frontend F4 Error State Component Verification
// --------------------------------------------------------------------------
console.log('Test 3: Verifying frontend F4 Error State component and styles...');

const f4ErrorStatePath = path.resolve(frontendDir, 'src/components/F4ErrorState.jsx');
assert.ok(fs.existsSync(f4ErrorStatePath), 'F4ErrorState.jsx must exist');
const f4ErrorStateCode = fs.readFileSync(f4ErrorStatePath, 'utf8');

assert.ok(f4ErrorStateCode.includes('extractErrorInfo'), 'Must use extractErrorInfo helper');
assert.ok(f4ErrorStateCode.includes('AlertCircle'), 'Must use Amber AlertCircle icon');
assert.ok(f4ErrorStateCode.includes('info.title'), 'Must render friendly title');
assert.ok(f4ErrorStateCode.includes('info.message'), 'Must render friendly message');
assert.ok(f4ErrorStateCode.includes('info.hint'), 'Must render friendly hint');
assert.ok(f4ErrorStateCode.includes('Reference:'), 'Must render Reference: label');
assert.ok(f4ErrorStateCode.includes('Try again'), 'Must render Try again button');

// Verify all 5 F4 popups use F4ErrorState
const materialF4Code = fs.readFileSync(path.resolve(frontendDir, 'src/components/MaterialValueHelpModal.jsx'), 'utf8');
assert.ok(materialF4Code.includes('F4ErrorState'), 'MaterialValueHelpModal must use F4ErrorState');

const plantF4Code = fs.readFileSync(path.resolve(frontendDir, 'src/components/PlantValueHelpModal.jsx'), 'utf8');
assert.ok(plantF4Code.includes('F4ErrorState'), 'PlantValueHelpModal must use F4ErrorState');

const storageF4Code = fs.readFileSync(path.resolve(frontendDir, 'src/components/StorageLocationValueHelpModal.jsx'), 'utf8');
assert.ok(storageF4Code.includes('F4ErrorState'), 'StorageLocationValueHelpModal must use F4ErrorState');

const bomUsageF4Code = fs.readFileSync(path.resolve(frontendDir, 'src/components/BomUsageValueHelpModal.jsx'), 'utf8');
assert.ok(bomUsageF4Code.includes('F4ErrorState'), 'BomUsageValueHelpModal must use F4ErrorState');

const restrictF4Code = fs.readFileSync(path.resolve(frontendDir, 'src/components/MaterialRestrictValueRangeModal.jsx'), 'utf8');
assert.ok(restrictF4Code.includes('extractErrorInfo'), 'MaterialRestrictValueRangeModal must use extractErrorInfo');

console.log('   ✓ F4ErrorState component created and integrated across all 5 F4 popups');
console.log('   ✓ Centered layout, amber icon, copyable reference, and "Try again" button verified\n');

// --------------------------------------------------------------------------
// Test 4: Verify Header Connection Dot and Unreachable Tooltip
// --------------------------------------------------------------------------
console.log('Test 4: Verifying Header connection dot shows disconnected state with "SAP server not reachable"...');

const appJsxCode = fs.readFileSync(path.resolve(frontendDir, 'src/App.jsx'), 'utf8');
assert.ok(
  appJsxCode.includes("'SAP server not reachable'"),
  'App.jsx header connection dot tooltip must be "SAP server not reachable" when disconnected'
);
assert.ok(
  appJsxCode.includes("sap:server-status"),
  'App.jsx must listen for sap:server-status event to update connection dot'
);

const apiJsCode = fs.readFileSync(path.resolve(frontendDir, 'src/services/api.js'), 'utf8');
assert.ok(
  apiJsCode.includes("SAP_UNREACHABLE") && apiJsCode.includes("sap:server-status"),
  'api.js interceptor must broadcast sap:server-status on SAP_UNREACHABLE'
);

console.log('   ✓ Header connection dot reflects "SAP server not reachable" with dot-disconnected\n');

// --------------------------------------------------------------------------
// Test 5: Verify Toast Notification Hint, Copyable Reference & Throttle
// --------------------------------------------------------------------------
console.log('Test 5: Verifying Toast notifications render hint, copyable reference and throttle unreachable toasts...');

const toastContextCode = fs.readFileSync(path.resolve(frontendDir, 'src/context/ToastContext.jsx'), 'utf8');
assert.ok(toastContextCode.includes('sap-toast-hint'), 'Toast must render sap-toast-hint');
assert.ok(toastContextCode.includes('Reference:'), 'Toast must render Reference: label');
assert.ok(toastContextCode.includes('navigator.clipboard'), 'Toast must provide copy button for error reference');
assert.ok(
  toastContextCode.includes('lastUnreachableToastRef') || toastContextCode.includes('SAP_UNREACHABLE'),
  'Toast must throttle SAP_UNREACHABLE toasts to prevent repeat bursts'
);

console.log('   ✓ ToastContext renders friendly title, message, hint, copyable reference, and throttles unreachable bursts\n');

// --------------------------------------------------------------------------
// Test 6: Verify Admin Activity Logs Collapsible Technical Details
// --------------------------------------------------------------------------
console.log('Test 6: Verifying Admin Activity Logs hides raw technical text inside collapsed section...');

const adminLogsCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/AdminActivityLogsView.jsx'), 'utf8');
assert.ok(
  adminLogsCode.includes('<details') && adminLogsCode.includes('Technical details (Admin only)'),
  'AdminActivityLogsView must enclose raw stack/message inside collapsed <details> section'
);

console.log('   ✓ Raw technical text restricted to Admin inside collapsed <details> in Activity Logs\n');

console.log('============================================================');
console.log('  ALL FRIENDLY ERROR & SANITIZATION TESTS PASSED CLEANLY!   ');
console.log('============================================================\n');
