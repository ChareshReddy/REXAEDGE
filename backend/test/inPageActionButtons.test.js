import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING IN-PAGE ACTION BUTTONS & FOOTER REMOVAL TESTS     ');
console.log('============================================================\n');

const frontendDir = path.resolve(__dirname, '../../frontend');
const layoutDir = path.resolve(frontendDir, 'src/components/layout');

// 1. Shared StickyActionBar component deletion and index cleanup
console.log('1. Verifying StickyActionBar component deletion & layout index...');
assert(!fs.existsSync(path.resolve(layoutDir, 'StickyActionBar.jsx')), 'StickyActionBar.jsx must be deleted');
const layoutIndex = fs.readFileSync(path.resolve(layoutDir, 'index.js'), 'utf8');
assert(!layoutIndex.includes('StickyActionBar'), 'layout/index.js must NOT export StickyActionBar');
console.log('   ✓ StickyActionBar.jsx cleanly deleted and removed from exports');

// 2. CSS verification - no sticky/fixed bottom bar and no reserved clearance
console.log('\n2. Verifying layout.css and index.css action row styling...');
const layoutCss = fs.readFileSync(path.resolve(layoutDir, 'layout.css'), 'utf8');
const indexCss = fs.readFileSync(path.resolve(frontendDir, 'src/index.css'), 'utf8');

assert(!layoutCss.includes('.sap-sticky-action-bar'), 'layout.css must NOT define .sap-sticky-action-bar');
assert(!layoutCss.includes('.has-sticky-bar'), 'layout.css must NOT define .has-sticky-bar reserved padding');
assert(!layoutCss.includes('--sap-sticky-bar-height'), 'layout.css must NOT define --sap-sticky-bar-height');
assert(layoutCss.includes('.sap-card-action-row'), 'layout.css must define .sap-card-action-row');
assert(layoutCss.includes('border-top: 1px solid var(--sap-border, #D9E2EC)') || layoutCss.includes('border-top: 1px solid var(--sap-border, #FED7AA)'), 'Action row must have 1px top divider');
assert(layoutCss.includes('padding-top: 16px'), 'Action row must have 16px padding-top');
assert(layoutCss.includes('justify-content: flex-end'), 'Action row buttons must be right-aligned');
assert(layoutCss.includes('gap: 12px'), 'Action row buttons must have 12px gap');

// Verify responsive stacking on phones
assert(layoutCss.includes('flex-direction: column-reverse'), 'Action row buttons must stack with primary on top on mobile');

// Verify bulk footer is non-sticky
assert(indexCss.includes('.bulk-preview-sticky-footer'), 'index.css must style bulk-preview-sticky-footer');
assert(indexCss.includes('position: static !important'), 'bulk footer must be static, not sticky');
console.log('   ✓ CSS rules cleanly define .sap-card-action-row with divider, 16px padding, 12px gap, right-alignment, and mobile stacking');

// 3. PageContainer has no reserved sticky footer padding
console.log('\n3. Verifying PageContainer bottom padding...');
const pageContainerCode = fs.readFileSync(path.resolve(layoutDir, 'PageContainer.jsx'), 'utf8');
assert(!pageContainerCode.includes("'has-sticky-bar'"), 'PageContainer must not add has-sticky-bar class');
console.log('   ✓ PageContainer provides normal bottom padding without reserved footer strip');

// 4. Validate BOM View verification
console.log('\n4. Verifying Validate BOM view action buttons...');
const validateViewCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/ValidateBomView.jsx'), 'utf8');
assert(!validateViewCode.includes('StickyActionBar'), 'ValidateBomView must NOT use StickyActionBar');
assert(!validateViewCode.includes('hasStickyBar'), 'ValidateBomView must NOT use hasStickyBar');
assert(validateViewCode.includes('sap-card-action-row'), 'ValidateBomView must contain sap-card-action-row inside card');
assert(validateViewCode.includes('Clear'), 'ValidateBomView must contain Clear button');
assert(validateViewCode.includes('Validate in SAP'), 'ValidateBomView must contain Validate in SAP button');
console.log('   ✓ Validate BOM action buttons cleanly placed inside form card');

// 5. Delete BOM View & Form verification
console.log('\n5. Verifying Delete BOM view & form action buttons...');
const deleteViewCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/DeleteBomView.jsx'), 'utf8');
const deleteFormCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/DeleteBomForm.jsx'), 'utf8');
assert(!deleteViewCode.includes('StickyActionBar'), 'DeleteBomView must NOT use StickyActionBar');
assert(!deleteViewCode.includes('hasStickyBar'), 'DeleteBomView must NOT use hasStickyBar');
assert(deleteFormCode.includes('sap-card-action-row'), 'DeleteBomForm must contain sap-card-action-row inside card');
assert(deleteFormCode.includes('Cancel'), 'DeleteBomForm must contain Cancel button');
assert(/Proceed to [Cc]onfirmation/.test(deleteFormCode), 'DeleteBomForm must contain Proceed to Confirmation button');
console.log('   ✓ Delete BOM action buttons cleanly placed inside form card');

// 6. Create Single BOM View verification
console.log('\n6. Verifying Create Single BOM view action buttons...');
const createViewCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/CreateBomView.jsx'), 'utf8');
assert(!createViewCode.includes('StickyActionBar'), 'CreateBomView must NOT use StickyActionBar');
assert(!createViewCode.includes('hasStickyBar'), 'CreateBomView must NOT use hasStickyBar');
assert(createViewCode.includes('sap-card-action-row'), 'CreateBomView must contain sap-card-action-row');
assert(createViewCode.includes('Reset'), 'CreateBomView must contain Reset button');
assert(createViewCode.includes('Validate Master Data'), 'CreateBomView must contain Validate Master Data button');
assert(createViewCode.includes('Preview & Create BOM'), 'CreateBomView must contain Preview & Create BOM button');
assert(createViewCode.includes('disabled={!preflightPassed || isLocked}'), 'Preview & Create BOM must preserve preflightPassed disabled check');
console.log('   ✓ Create Single BOM action buttons placed at bottom of last card (components card)');

// 7. Copy Single BOM View & Form verification
console.log('\n7. Verifying Copy Single BOM view & form action buttons...');
const copyViewCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/CopyBomView.jsx'), 'utf8');
const copyFormCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/CreateBomForm.jsx'), 'utf8');
assert(!copyViewCode.includes('StickyActionBar'), 'CopyBomView must NOT use StickyActionBar');
assert(!copyViewCode.includes('hasStickyBar'), 'CopyBomView must NOT use hasStickyBar');
assert(copyFormCode.includes('sap-card-action-row'), 'CreateBomForm must contain sap-card-action-row');
assert(copyFormCode.includes('Cancel'), 'CreateBomForm must contain Cancel button');
assert(copyFormCode.includes('Proceed'), 'CreateBomForm must contain Proceed button');
console.log('   ✓ Copy Single BOM action buttons placed at bottom of outer card below Source and Target panels');

// 8. Bulk Create BOM & Bulk Copy BOM verification
console.log('\n8. Verifying Bulk Create & Bulk Copy BOM footers...');
const bulkCreateCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/BulkCreateBomView.jsx'), 'utf8');
const bulkCopyCode = fs.readFileSync(path.resolve(frontendDir, 'src/components/BulkBomView.jsx'), 'utf8');
assert(!bulkCreateCode.includes("position: 'sticky'"), 'BulkCreateBomView must NOT have sticky footer');
assert(!bulkCopyCode.includes("position: 'sticky'"), 'BulkBomView must NOT have sticky footer');
assert(bulkCreateCode.includes('sap-card-action-row'), 'BulkCreateBomView must use sap-card-action-row');
assert(bulkCopyCode.includes('sap-card-action-row'), 'BulkBomView must use sap-card-action-row');
console.log('   ✓ Bulk Create & Copy BOM action rows are non-sticky within the card');

console.log('\n============================================================');
console.log('  ALL IN-PAGE ACTION BUTTON TESTS PASSED (100%)             ');
console.log('============================================================\n');
