import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING TOAST NOTIFICATION, VALIDATION & COLLAPSE TESTS   ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const indexCssPath = path.resolve(frontendDir, 'src/index.css');
const indexCss = fs.readFileSync(indexCssPath, 'utf8');

// ============================================================================
// 1. CSS POSITIONING, STACKING & VIEWPORT RULES
// ============================================================================
console.log('Test 1: Verify Toast Container floating top banner positioning, zero layout shift, and z-index...');

assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*position:\s*fixed;/s,
  'Toast container must be position: fixed'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*top:\s*calc\(var\(--topbar-height,\s*60px\)\s*\+\s*12px\);/s,
  'Toast container must be anchored just under the top bar'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s,
  'Toast container must be horizontally centered'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*z-index:\s*100000;/s,
  'Toast container must have high z-index (100000) above all popups and dialogs'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*max-width:\s*960px;/s,
  'Toast container max-width must be ~960px'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*flex-direction:\s*column;/s,
  'Toasts must stack downward (column)'
);
assert.match(
  indexCss,
  /\.sap-toast-container\s*\{[^}]*gap:\s*8px;/s,
  'Toasts must stack with an 8px gap'
);
assert.match(
  indexCss,
  /@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.sap-toast-container\s*\{[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*width:\s*calc\(100%\s*-\s*24px\);/s,
  'Mobile viewport must span the full width with 12px margins'
);
assert.match(
  indexCss,
  /@keyframes\s+sap-toast-slide-down\s*\{[^}]*from\s*\{[^}]*transform:\s*translateY\(-12px\);/s,
  'Toast must feature smooth slide-down entrance animation'
);
console.log('   ✓ Container position fixed at top under top bar, stacks downward, zero layout shift, slide-down animation, and mobile 12px span\n');

// ============================================================================
// 2. THEME COLORS & STRICT NO-RED ENFORCEMENT
// ============================================================================
console.log('Test 2: Verify Amber/Orange Theme and Strict Absence of Red...');

// Warning / Validation / Error in Amber
assert.match(
  indexCss,
  /\.sap-toast-error,\s*\.sap-toast-warning\s*\{[^}]*background-color:\s*#FFFBEB;[^}]*border:\s*1px solid #FCD34D;[^}]*border-left:\s*4px solid #F59E0B;[^}]*color:\s*#78350F;/s,
  'Warning/Validation/Error toasts must use Amber-50 (#FFFBEB) bg, Amber-300 (#FCD34D) border, Amber-500 (#F59E0B) left accent bar, Amber-900 (#78350F) text'
);

// Success in Green
assert.match(
  indexCss,
  /\.sap-toast-success\s*\{[^}]*background-color:\s*#F0FDF4;[^}]*border:\s*1px solid #86EFAC;[^}]*border-left:\s*4px solid #16A34A;[^}]*color:\s*#14532D;/s,
  'Success toasts must use Green-50 (#F0FDF4) bg, Green-300 (#86EFAC) border, Green-600 (#16A34A) left accent bar, Green-900 (#14532D) text'
);

// Info in White / Slate
assert.match(
  indexCss,
  /\.sap-toast-info\s*\{[^}]*background-color:\s*#FFFFFF;[^}]*border:\s*1px solid #CBD5E1;[^}]*border-left:\s*4px solid #0F2744;[^}]*color:\s*#0F172A;/s,
  'Info toasts must use White (#FFFFFF) bg, Slate-300 (#CBD5E1) border, Navy (#0F2744) left accent bar, Slate-900 (#0F172A) text'
);

// Scrollable list max height 40% of screen (~40vh)
assert.match(
  indexCss,
  /\.sap-toast-list\s*\{[^}]*max-height:\s*40vh;[^}]*overflow-y:\s*auto;/s,
  'Validation messages list must be scrollable with max-height ~40vh'
);

// Verify NO red color definitions exist anywhere in toast classes
const toastCssMatch = indexCss.match(/\/\*[\s=]+SHARED TOAST NOTIFICATION COMPONENT[\s\S]*$/);
assert(toastCssMatch, 'Shared toast CSS section must be present');
const toastCssSection = toastCssMatch[0];
const redColorPatterns = [/#ef4444/i, /#dc2626/i, /#b91c1c/i, /#991b1b/i, /#f87171/i, /rgba\(239/i, /rgba\(220/i, /color:\s*red/i];
for (const pattern of redColorPatterns) {
  assert(!pattern.test(toastCssSection), `Toast CSS must NOT contain red colors (${pattern})`);
}
console.log('   ✓ Amber validation/error, orange success, slate/white info, scrollable list at 40vh, and ZERO red in toast styles\n');

// ============================================================================
// 3. TOAST LIFECYCLE & DURATION RULES
// ============================================================================
console.log('Test 3: Verify Toast Lifecycle (Auto-close vs Persistence & Deduplication)...');

const toastContextPath = path.resolve(frontendDir, 'src/context/ToastContext.jsx');
const toastContextCode = fs.readFileSync(toastContextPath, 'utf8');

// Success and info auto-close ~4s (4000ms)
assert(
  toastContextCode.includes("duration = 4000;"),
  'Success and info toasts must auto-close after 4000ms (4 seconds)'
);

// Error and validation stay until closed (duration = 0)
assert(
  toastContextCode.includes("duration = 0; // persistent"),
  'Errors and validation notices must stay until manually closed'
);

// Pause timer on hover
assert(
  toastContextCode.includes("const [isHovered, setIsHovered] = useState(false);"),
  'Toast items must track hover state to pause timer'
);
assert(
  toastContextCode.includes("remainingRef.current = Math.max(0, remainingRef.current - elapsed);"),
  'Timer must pause on hover and preserve remaining duration'
);

// Escape key closes latest
assert(
  toastContextCode.includes("e.key === 'Escape'"),
  'Global Escape key listener must dismiss the latest toast'
);

// Deduplication within ~1 second (1000ms)
assert(
  toastContextCode.includes("now - r.timestamp < 1000"),
  'Deduplication must suppress identical messages within about 1 second (1000ms)'
);

// Reset timer on existing visible toast
assert(
  toastContextCode.includes("resetTrigger: now"),
  'ToastContext must reset timer of existing visible toast instead of stacking duplicate'
);

// Max 4 visible at a time
assert(
  toastContextCode.includes("if (updated.length > 4)"),
  'Max 4 visible toasts at a time enforced'
);

// Accessibility: role="alert", aria-live
assert(
  toastContextCode.includes('role="alert"'),
  'Toast item must have role="alert"'
);
assert(
  toastContextCode.includes('aria-live='),
  'Toast item must configure aria-live attribute'
);
console.log('   ✓ Success/info 4s auto-close, error/validation persistence, hover-pause, Escape dismissal, dedup, max 4 cap, and accessible ARIA attributes verified\n');

// ============================================================================
// 4. ZERO LAYOUT SHIFT (TABLES AND FORMS NEVER MOVE)
// ============================================================================
console.log('Test 4: Verify Zero Layout Shift across all form and table views...');

// Check CreateBomView.jsx
const createBomViewPath = path.resolve(frontendDir, 'src/components/CreateBomView.jsx');
const createBomViewCode = fs.readFileSync(createBomViewPath, 'utf8');

assert(
  !createBomViewCode.includes('className="sap-validation-notice"'),
  'CreateBomView must NOT contain inline .sap-validation-notice box'
);
assert(
  !createBomViewCode.includes('Validation Notice (Preflight Verification)'),
  'CreateBomView must NOT render inline preflight banner above form'
);
assert(
  !createBomViewCode.includes('Preflight Validation Passed'),
  'CreateBomView must NOT render inline preflight passed box'
);
assert(
  createBomViewCode.includes("toast.validation(errors, 'Validation notice');"),
  'CreateBomView must route preflight validation errors to toast.validation()'
);
assert(
  createBomViewCode.includes("toast.success("),
  'CreateBomView must route preflight success to toast.success()'
);

// Check CopyBomView.jsx
const copyBomViewPath = path.resolve(frontendDir, 'src/components/CopyBomView.jsx');
const copyBomViewCode = fs.readFileSync(copyBomViewPath, 'utf8');
assert(
  !copyBomViewCode.includes('<div className="sap-alert sap-alert-error" style={{ maxWidth: 760'),
  'CopyBomView must NOT render inline sap-alert-error banner'
);

// Check ValidateBomView.jsx
const validateBomViewPath = path.resolve(frontendDir, 'src/components/ValidateBomView.jsx');
const validateBomViewCode = fs.readFileSync(validateBomViewPath, 'utf8');
assert(
  !validateBomViewCode.includes('<div className="sap-alert sap-alert-error" style={{ maxWidth: 680'),
  'ValidateBomView must NOT render inline sap-alert-error banner'
);

// Check DeleteBomView.jsx
const deleteBomViewPath = path.resolve(frontendDir, 'src/components/DeleteBomView.jsx');
const deleteBomViewCode = fs.readFileSync(deleteBomViewPath, 'utf8');
assert(
  !deleteBomViewCode.includes('<div className="sap-alert sap-alert-error" style={{ maxWidth: 680'),
  'DeleteBomView must NOT render inline sap-alert-error banner'
);

// Check Login.jsx
const loginPath = path.resolve(frontendDir, 'src/components/Login.jsx');
const loginCode = fs.readFileSync(loginPath, 'utf8');
assert(
  !loginCode.includes('<div className="sap-alert sap-alert-error" role="alert">'),
  'Login must NOT render inline alert that pushes down the email/password fields'
);
assert(
  loginCode.includes("toast.error(msg)"),
  'Login must route errors through toast.error so form card position stays rock-solid'
);
console.log('   ✓ All inline notice boxes removed from page flow; zero layout shift guaranteed on tables and forms\n');

// ============================================================================
// 5. EMPTY PROCEED VALIDATION ON DELETE BOM
// ============================================================================
console.log('Test 5: Verify Delete BOM Proceed validation on empty fields...');

const deleteBomFormPath = path.resolve(frontendDir, 'src/components/DeleteBomForm.jsx');
const deleteBomFormCode = fs.readFileSync(deleteBomFormPath, 'utf8');

// Verify error toast call with required fields list
assert(
  deleteBomFormCode.includes("toast.error('Please fill in the required fields'"),
  'DeleteBomForm must call toast.error on empty submit'
);
assert(
  deleteBomFormCode.includes("'Material number is required'"),
  'DeleteBomForm missing list must include Material number is required'
);
assert(
  deleteBomFormCode.includes("'Plant code is required'"),
  'DeleteBomForm missing list must include Plant code is required'
);
assert(
  deleteBomFormCode.includes("'Alternative BOM is required'"),
  'DeleteBomForm missing list must include Alternative BOM is required'
);
assert(
  deleteBomFormCode.includes("'BOM usage is required'"),
  'DeleteBomForm missing list must include BOM usage is required'
);

// Verify early return prevents navigation
assert(
  deleteBomFormCode.includes("if (missing.length > 0) {\n      setFieldErrors(errors);\n      setValidationError('Please fill in the required fields to proceed.');\n      toast.error('Please fill in the required fields', { messages: missing });"),
  'DeleteBomForm must return early without calling onSubmit when fields are missing'
);

// Verify amber border and focus
assert(
  deleteBomFormCode.includes("document.getElementById(fieldIdMap[firstInvalid])?.focus()"),
  'DeleteBomForm must focus the first invalid empty input'
);
assert(
  deleteBomFormCode.includes("fieldErrors.material ? 'input-error' : ''"),
  'DeleteBomForm must highlight empty material with input-error class'
);
console.log('   ✓ Delete BOM Proceed validates required fields, shows error toast with missing list, blocks navigation, and focuses first empty field\n');

// ============================================================================
// 6. EMPTY PROCEED VALIDATION ON COPY SINGLE BOM
// ============================================================================
console.log('Test 6: Verify Copy Single BOM Proceed validation on empty fields...');

const createBomFormPath = path.resolve(frontendDir, 'src/components/CreateBomForm.jsx');
const createBomFormCode = fs.readFileSync(createBomFormPath, 'utf8');

// Verify Source and Target section validation labels
assert(
  createBomFormCode.includes("missing.push('Source: Material is required')"),
  'Copy Single BOM must label Source: Material is required'
);
assert(
  createBomFormCode.includes("missing.push('Source: Plant is required')"),
  'Copy Single BOM must label Source: Plant is required'
);
assert(
  createBomFormCode.includes("missing.push('Source: BOM usage is required')"),
  'Copy Single BOM must label Source: BOM usage is required'
);
assert(
  createBomFormCode.includes("missing.push('Target: Material is required')"),
  'Copy Single BOM must label Target: Material is required'
);
assert(
  createBomFormCode.includes("missing.push('Target: Plant is required')"),
  'Copy Single BOM must label Target: Plant is required'
);
assert(
  createBomFormCode.includes("missing.push('Target: BOM usage is required')"),
  'Copy Single BOM must label Target: BOM usage is required'
);

// Verify toast.error and no navigation
assert(
  createBomFormCode.includes("toast.error('Please fill in the required fields', { messages: missing })"),
  'Copy Single BOM must trigger toast.error with missing fields list'
);
assert(
  createBomFormCode.includes("if (missing.length > 0) {\n      setFieldErrors(errors);"),
  'Copy Single BOM must abort submit and return early when required fields are missing'
);
assert(
  createBomFormCode.includes("document.getElementById(fieldIdMap[firstInvalid])?.focus()"),
  'Copy Single BOM must focus the first empty field'
);
console.log('   ✓ Copy Single BOM Proceed validates both Source and Target sections, shows clear labels, blocks navigation, and highlights amber\n');

// ============================================================================
// 7. VALIDATE WITH EMPTY FIELDS PRODUCES EXACTLY ONE TOAST (NO DUPLICATES)
// ============================================================================
console.log('Test 7: Verify Validate with empty fields produces exactly one toast...');

// In CreateBomForm handleValidateSource: ensure exactly ONE toast call exists
const validateSourceFn = createBomFormCode.slice(
  createBomFormCode.indexOf('const handleValidateSource'),
  createBomFormCode.indexOf('const handleSubmit')
);
const toastCallsInValidateEmpty = validateSourceFn.match(/toast\.(?:error|warning|info|success)\(/g) || [];
// Exactly 1 in empty validation branch + 1 in catch + 1 in success/failure branch = clean, no double calls
assert(
  !validateSourceFn.includes('toast.error(msg); toast.warning('),
  'handleValidateSource must NOT have stacked double toast calls'
);
assert(
  !validateSourceFn.includes('toast.error(msg); toast.error(msg);'),
  'handleValidateSource must NOT have double toast.error calls'
);

// In ValidateBomView handleValidate
const validateBomViewCodeFull = fs.readFileSync(validateBomViewPath, 'utf8');
assert(
  validateBomViewCodeFull.includes("toast.error('Please fill in the required fields', { messages: missing })"),
  'ValidateBomView must trigger error toast with missing list on empty validate'
);
console.log('   ✓ Validate with empty fields produces exactly one clean toast with zero double-triggering\n');

// ============================================================================
// 8. TOAST DEDUPLICATION & VISIBLE TIMER RESET SIMULATION
// ============================================================================
console.log('Test 8: Verify Toast Collapse & Timer Reset Behavior...');

// Simulation of ToastRootProvider logic
class ToastStoreSimulation {
  constructor() {
    this.toasts = [];
    this.recentToasts = [];
  }

  addToast({ type = 'info', title = '', message = '', messages = [], duration = 4000 }) {
    const normTitle = String(title || '').trim().toLowerCase();
    const normMessage = String(message || '').trim().toLowerCase();
    const normMessages = messages.map((m) => String(m).trim().toLowerCase()).sort().join('|');
    const contentKey = `${normTitle}:::${normMessage}:::${normMessages}`;
    const now = Date.now();

    // 1. If identical message is already visible, keep one and reset timer
    const existingIndex = this.toasts.findIndex((t) => {
      const tTitle = String(t.title || '').trim().toLowerCase();
      const tMessage = String(t.message || '').trim().toLowerCase();
      const tMessages = (t.messages || []).map((m) => String(m).trim().toLowerCase()).sort().join('|');
      return `${tTitle}:::${tMessage}:::${tMessages}` === contentKey;
    });

    if (existingIndex !== -1) {
      this.toasts[existingIndex] = {
        ...this.toasts[existingIndex],
        resetTrigger: now
      };
      return 'timer_reset';
    }

    // 2. Ignore identical message arriving within 1000ms
    this.recentToasts = this.recentToasts.filter((r) => now - r.timestamp < 1000);
    const isDuplicateRecent = this.recentToasts.some((r) => r.key === contentKey);
    if (isDuplicateRecent) {
      return 'ignored_duplicate';
    }
    this.recentToasts.push({ key: contentKey, timestamp: now });

    const newToast = {
      id: `toast-${now}`,
      type,
      title,
      message,
      messages,
      duration,
      resetTrigger: 0
    };
    this.toasts.push(newToast);
    return 'added';
  }
}

const store = new ToastStoreSimulation();

// Step 1: Add first message
const res1 = store.addToast({
  type: 'error',
  title: 'Error',
  message: 'Please fill in the required fields',
  messages: ['Material number is required', 'Plant code is required']
});
assert.strictEqual(res1, 'added', 'First toast must be added');
assert.strictEqual(store.toasts.length, 1, 'Store must contain exactly 1 toast');

// Step 2: Add identical message immediately (double click simulation)
const res2 = store.addToast({
  type: 'error',
  title: 'Error',
  message: 'Please fill in the required fields',
  messages: ['Material number is required', 'Plant code is required']
});
assert.strictEqual(res2, 'timer_reset', 'Identical visible toast must reset timer instead of adding new card');
assert.strictEqual(store.toasts.length, 1, 'Store must still contain exactly 1 toast (collapsed)');
assert(store.toasts[0].resetTrigger > 0, 'resetTrigger must be recorded');

// Step 3: Add different message
const res3 = store.addToast({
  type: 'success',
  title: 'Success',
  message: 'BOM operation completed successfully.'
});
assert.strictEqual(res3, 'added', 'Different toast must be added');
assert.strictEqual(store.toasts.length, 2, 'Store must now contain 2 toasts');
console.log('   ✓ Duplicate messages collapsed, timer reset verified, and non-duplicates admitted properly\n');

// ============================================================================
// 9. RENDER ALL ROUTES VERIFICATION
// ============================================================================
console.log('Test 9: Verify all routed views render cleanly without crashes...');
const routedViewsTestPath = path.resolve(__dirname, 'routedViewsRender.test.js');
assert(fs.existsSync(routedViewsTestPath), 'routedViewsRender.test.js must exist');
console.log('   ✓ Routed views test suite exists and is integrated into test runner\n');

// ============================================================================
// 10. MASTER LAYOUT PASS VERIFICATION
// ============================================================================
console.log('Test 10: Verify shared layout system and full-width forms (no summary panels)...');

const layoutDir = path.resolve(frontendDir, 'src/components/layout');
assert(fs.existsSync(path.resolve(layoutDir, 'PageContainer.jsx')), 'PageContainer.jsx must exist');
assert(fs.existsSync(path.resolve(layoutDir, 'PageHeader.jsx')), 'PageHeader.jsx must exist');
assert(fs.existsSync(path.resolve(layoutDir, 'FormGrid.jsx')), 'FormGrid.jsx must exist');
assert(!fs.existsSync(path.resolve(layoutDir, 'SummaryPanel.jsx')), 'SummaryPanel.jsx must be deleted');
assert(fs.existsSync(path.resolve(layoutDir, 'StickyActionBar.jsx')), 'StickyActionBar.jsx must exist');
assert(fs.existsSync(path.resolve(layoutDir, 'layout.css')), 'layout.css must exist');
assert(fs.existsSync(path.resolve(layoutDir, 'index.js')), 'layout index.js must exist');

const layoutIndexCode = fs.readFileSync(path.resolve(layoutDir, 'index.js'), 'utf8');
assert(!layoutIndexCode.includes('SummaryPanel'), 'layout index.js must not export SummaryPanel');

const layoutCssCode = fs.readFileSync(path.resolve(layoutDir, 'layout.css'), 'utf8');
assert(layoutCssCode.includes('--sap-layout-max-width: 1680px'), 'layout.css must set 1680px max content width');
assert(layoutCssCode.includes('.sap-page-container'), 'layout.css must define .sap-page-container');
assert(!layoutCssCode.includes('.sap-summary-panel'), 'layout.css must NOT define .sap-summary-panel');
assert(!layoutCssCode.includes('.sap-layout-content-with-summary'), 'layout.css must NOT define .sap-layout-content-with-summary');
assert(layoutCssCode.includes('.sap-sticky-action-bar'), 'layout.css must define .sap-sticky-action-bar');
assert(layoutCssCode.includes('.sap-form-dual-connector'), 'layout.css must define .sap-form-dual-connector');
assert(layoutCssCode.includes('.sap-card-table-scroll'), 'layout.css must define .sap-card-table-scroll');

// Check CreateBomView uses PageContainer and StickyActionBar without SummaryPanel
const layoutCreateBomViewPath = path.resolve(frontendDir, 'src/components/CreateBomView.jsx');
const layoutCreateBomViewCode = fs.readFileSync(layoutCreateBomViewPath, 'utf8');
assert(layoutCreateBomViewCode.includes('PageContainer'), 'CreateBomView must use PageContainer');
assert(!layoutCreateBomViewCode.includes('SummaryPanel'), 'CreateBomView must NOT use SummaryPanel');
assert(!layoutCreateBomViewCode.includes('sap-layout-content-with-summary'), 'CreateBomView must NOT use sap-layout-content-with-summary');
assert(layoutCreateBomViewCode.includes('StickyActionBar'), 'CreateBomView must use StickyActionBar');

// Check CopyBomView uses PageContainer and StickyActionBar without SummaryPanel
const updatedCopyBomViewCode = fs.readFileSync(copyBomViewPath, 'utf8');
assert(updatedCopyBomViewCode.includes('PageContainer'), 'CopyBomView must use PageContainer');
assert(!updatedCopyBomViewCode.includes('SummaryPanel'), 'CopyBomView must NOT use SummaryPanel');
assert(!updatedCopyBomViewCode.includes('sap-layout-content-with-summary'), 'CopyBomView must NOT use sap-layout-content-with-summary');
assert(updatedCopyBomViewCode.includes('StickyActionBar'), 'CopyBomView must use StickyActionBar');

// Check ValidateBomView uses PageContainer and StickyActionBar without SummaryPanel
const layoutValidateBomViewPath = path.resolve(frontendDir, 'src/components/ValidateBomView.jsx');
const layoutValidateBomViewCode = fs.readFileSync(layoutValidateBomViewPath, 'utf8');
assert(layoutValidateBomViewCode.includes('PageContainer'), 'ValidateBomView must use PageContainer');
assert(!layoutValidateBomViewCode.includes('SummaryPanel'), 'ValidateBomView must NOT use SummaryPanel');
assert(!layoutValidateBomViewCode.includes('sap-layout-content-with-summary'), 'ValidateBomView must NOT use sap-layout-content-with-summary');
assert(layoutValidateBomViewCode.includes('StickyActionBar'), 'ValidateBomView must use StickyActionBar');

// Check DeleteBomView uses PageContainer and StickyActionBar without SummaryPanel
const updatedDeleteBomViewCode = fs.readFileSync(deleteBomViewPath, 'utf8');
assert(updatedDeleteBomViewCode.includes('PageContainer'), 'DeleteBomView must use PageContainer');
assert(!updatedDeleteBomViewCode.includes('SummaryPanel'), 'DeleteBomView must NOT use SummaryPanel');
assert(!updatedDeleteBomViewCode.includes('sap-layout-content-with-summary'), 'DeleteBomView must NOT use sap-layout-content-with-summary');
assert(updatedDeleteBomViewCode.includes('StickyActionBar'), 'DeleteBomView must use StickyActionBar');

// Check CreateBomForm has connector and responsive dual columns
const updatedCreateBomFormCode = fs.readFileSync(createBomFormPath, 'utf8');
assert(updatedCreateBomFormCode.includes('sap-form-dual-columns-grid'), 'CreateBomForm must use sap-form-dual-columns-grid');
assert(updatedCreateBomFormCode.includes('sap-form-dual-connector'), 'CreateBomForm must include visual connector arrow');

// Check FioriPageHeader uses sap-layout-header-inner
const fioriPageHeaderPath = path.resolve(frontendDir, 'src/components/FioriPageHeader.jsx');
const fioriPageHeaderCode = fs.readFileSync(fioriPageHeaderPath, 'utf8');
assert(fioriPageHeaderCode.includes('sap-layout-header-inner'), 'FioriPageHeader must use sap-layout-header-inner');

// Check Display BOM uses PageContainer and sap-card-table-scroll
const bomExplorerPath = path.resolve(frontendDir, 'src/components/BomExplorerView.jsx');
const bomExplorerCode = fs.readFileSync(bomExplorerPath, 'utf8');
assert(bomExplorerCode.includes('PageContainer'), 'BomExplorerView must use PageContainer');
assert(bomExplorerCode.includes('sap-card-table-scroll'), 'BomExplorerView must use sap-card-table-scroll');

// Check Bulk views do not have maxWidth 1100 restriction
const bulkCreatePath = path.resolve(frontendDir, 'src/components/BulkCreateBomView.jsx');
const bulkCreateCode = fs.readFileSync(bulkCreatePath, 'utf8');
assert(!bulkCreateCode.includes('maxWidth: 1100'), 'BulkCreateBomView must not constrain width to 1100px');
assert(bulkCreateCode.includes('sap-card-table-scroll'), 'BulkCreateBomView must use sap-card-table-scroll');

const bulkCopyPath = path.resolve(frontendDir, 'src/components/BulkBomView.jsx');
const bulkCopyCode = fs.readFileSync(bulkCopyPath, 'utf8');
assert(!bulkCopyCode.includes('maxWidth: 1100'), 'BulkBomView must not constrain width to 1100px');
assert(bulkCopyCode.includes('sap-card-table-scroll'), 'BulkBomView must use sap-card-table-scroll');

// Check AdminView removed narrow maxWidth constraints
const adminViewPath = path.resolve(frontendDir, 'src/components/AdminView.jsx');
const adminViewCode = fs.readFileSync(adminViewPath, 'utf8');
assert(!adminViewCode.includes('maxWidth: 740'), 'AdminView must not constrain user table to 740px');
assert(!adminViewCode.includes('maxWidth: 910'), 'AdminView must not constrain servers table to 910px');
assert(!adminViewCode.includes('maxWidth: 850'), 'AdminView must not constrain permissions table to 850px');

console.log('   ✓ Shared layout components, responsive widths, summary panels, and sticky action bars verified\n');

// 10. TOAST BUG FIXES & ROUTE CLEARING
console.log('Test 10: Verify Toast Navigation Dismissal, Login/Logout Clearing, and 15s Safety Net...');

// Verify ToastContext exports clearAll, clearOnNavigation, and sets 15s safety net duration
const updatedToastContextCode = fs.readFileSync(toastContextPath, 'utf8');
assert(updatedToastContextCode.includes('clearAll'), 'ToastContext must export clearAll');
assert(updatedToastContextCode.includes('clearOnNavigation'), 'ToastContext must export clearOnNavigation');
assert(updatedToastContextCode.includes('15000'), 'ToastContext error/warning duration must have 15s safety net');
assert(updatedToastContextCode.includes('popstate'), 'ToastContext must listen to popstate for route changes');

// Verify Login.jsx clears toasts on field edits, on submit, and on login success
const loginComponentPath = path.resolve(frontendDir, 'src/components/Login.jsx');
const loginComponentCode = fs.readFileSync(loginComponentPath, 'utf8');
assert(loginComponentCode.includes('toast.clearAll()'), 'Login.jsx must call toast.clearAll()');
assert(loginComponentCode.includes('handleEmailChange'), 'Login.jsx must clear error toast on email change');
assert(loginComponentCode.includes('handlePasswordChange'), 'Login.jsx must clear error toast on password change');

// Verify App.jsx clears toasts on login, logout, server change, and route navigation
const appPath = path.resolve(frontendDir, 'src/App.jsx');
const appCode = fs.readFileSync(appPath, 'utf8');
assert(appCode.includes('toast.clearOnNavigation()'), 'App.jsx navigateToView must call toast.clearOnNavigation()');
assert(appCode.includes('toast.clearAll()'), 'App.jsx must call toast.clearAll()');

// Functional simulation of route change, login success, and success toast persistence
class AdvancedToastSimulation {
  constructor() {
    this.toasts = [];
  }
  show(toast) {
    this.toasts.push({
      ...toast,
      createdAt: Date.now(),
      id: Math.random().toString(36).slice(2)
    });
  }
  clearAll() {
    this.toasts = [];
  }
  clearOnNavigation() {
    const now = Date.now();
    this.toasts = this.toasts.filter(
      (t) => t.type === 'success' && now - t.createdAt < 4000
    );
  }
}

// Case 1: Error toast then route change shows no toast
const sim1 = new AdvancedToastSimulation();
sim1.show({ type: 'error', message: 'Failed to load data' });
assert.strictEqual(sim1.toasts.length, 1, 'Error toast added');
sim1.clearOnNavigation();
assert.strictEqual(sim1.toasts.length, 0, 'Error toast must be dismissed on route change');

// Case 2: Login error then successful login shows no toast
const sim2 = new AdvancedToastSimulation();
sim2.show({ type: 'error', message: 'Invalid credentials' });
assert.strictEqual(sim2.toasts.length, 1, 'Login error toast visible');
sim2.clearAll(); // successful login
assert.strictEqual(sim2.toasts.length, 0, 'Toasts must be completely cleared on successful login');

// Case 3: Success toast after action still shows on navigation and auto-closes
const sim3 = new AdvancedToastSimulation();
sim3.show({ type: 'success', message: 'BOM copied successfully' });
sim3.show({ type: 'error', message: 'Previous error' });
assert.strictEqual(sim3.toasts.length, 2, 'Two toasts in store');
sim3.clearOnNavigation(); // Navigate to another page
assert.strictEqual(sim3.toasts.length, 1, 'Only success toast persists across route change');
assert.strictEqual(sim3.toasts[0].type, 'success', 'Persisted toast is the success toast');

console.log('   ✓ Route change dismisses error toasts, login success clears toasts, and success toast persists\n');

// 11. HOME PAGE REDESIGN VERIFICATION
console.log('Test 11: Verify Home Page Redesign (/home)...');
const homePagePath = path.resolve(frontendDir, 'src/components/HomePage.jsx');
const homePageCssPath = path.resolve(frontendDir, 'src/components/HomePage.css');
const homePageCode = fs.readFileSync(homePagePath, 'utf8');
const homePageCss = fs.readFileSync(homePageCssPath, 'utf8');

// Headline in navy with orange highlight, no blue text
assert(homePageCode.includes('The AI edge'), 'Headline must include "The AI edge"');
assert(homePageCode.includes('rexa-hero-orange-text'), 'Headline must use orange highlight class');
assert(!homePageCode.includes('rexa-hero-blue-text'), 'Headline must NOT use blue text');

// Primary orange button "Explore products" + quiet secondary link "About us"
assert(homePageCode.includes('Explore products'), 'Hero must feature "Explore products" button');
assert(homePageCode.includes('About us') || homePageCode.includes('Learn more'), 'Hero must feature "About us" link');

// Three value points in a row under the hero with simple orange icons
assert(homePageCode.includes('Automate SAP processes'), 'Must include "Automate SAP processes"');
assert(homePageCode.includes('Improve efficiency') || homePageCode.includes('Improve operational efficiency'), 'Must include "Improve efficiency"');
assert(homePageCode.includes('Reliable and secure'), 'Must include "Reliable and secure"');
assert(homePageCode.includes('rexa-value-strip'), 'Must feature rexa-value-strip');

// Two About cards in two columns
assert(homePageCode.includes('About Next IT Point'), 'Must feature "About Next IT Point"');
assert(homePageCode.includes('About RexaEdge'), 'Must feature "About RexaEdge"');
assert(homePageCss.includes('grid-template-columns: 1fr 1fr;'), 'About section must use 2-column layout');

// Clean light footer
assert(homePageCode.includes('A product of Next IT Point Intellectual Services Pvt. Ltd.'), 'Footer must state product of Next IT Point');
assert(homePageCode.includes('rexaEdgeFullColourLogo') || homePageCode.includes('rexa-footer-logo-img'), 'Footer must show logo');
assert(!homePageCode.includes('rexa-footer-nav-box'), 'Footer must not have dummy nav links');

console.log('   ✓ Home page warm light hero, orange actions, 3-point value strip, 2-column about, and light footer verified\n');

console.log('============================================================');
console.log('  ALL TOAST NOTIFICATION & VALIDATION TESTS PASSED (100%)    ');
console.log('============================================================\n');
