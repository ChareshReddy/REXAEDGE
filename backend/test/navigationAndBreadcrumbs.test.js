import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { MODULE_REGISTRY } from '../config/modules.js';
import { getBreadcrumbTrail, getBreadcrumbDescriptors } from '../../shared/breadcrumbs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('  RUNNING NAVIGATION & SHARED BREADCRUMB VERIFICATION TESTS ');
console.log('============================================================\n');

// 1. Home page breadcrumbs
console.log('Test 1: Home page breadcrumb trail...');
const homeTrail = getBreadcrumbTrail('home');
assert.strictEqual(homeTrail.length, 0, 'Home page must have no breadcrumbs');
console.log('✓ PASS: Home page has no breadcrumb (empty trail)\n');

// 2. Products page breadcrumbs
console.log('Test 2: Products page breadcrumb trail...');
const productsTrail = getBreadcrumbTrail('products', {
  onNavigateHome: () => 'nav_home'
});
assert.deepStrictEqual(
  productsTrail.map((b) => b.label),
  ['Home', 'Products'],
  'Products breadcrumb trail must be Home > Products'
);
assert.strictEqual(typeof productsTrail[0].onClick, 'function', 'Home must be a clickable link');
assert.strictEqual(productsTrail[1].onClick, undefined, 'Products must be current item (not a link)');
console.log('✓ PASS: Products page trail is Home (link) > Products (current)\n');

// 3. Bill of Materials Hub page breadcrumbs
console.log('Test 3: Bill of Materials Operations Hub breadcrumb trail...');
const bomHubTrail = getBreadcrumbTrail('bom_operations', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products'
});
assert.deepStrictEqual(
  bomHubTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials'],
  'BOM Hub trail must be Home > Products > Bill of Materials'
);
assert.strictEqual(typeof bomHubTrail[0].onClick, 'function', 'Home must be clickable');
assert.strictEqual(typeof bomHubTrail[1].onClick, 'function', 'Products must be clickable');
assert.strictEqual(bomHubTrail[2].onClick, undefined, 'Bill of Materials must be current (not a link)');
console.log('✓ PASS: BOM Hub trail is Home > Products > Bill of Materials\n');

// 4. Group Sub-Pages (Create BOM, Copy BOM)
console.log('Test 4: Group Sub-Page breadcrumb trails (Create BOM, Copy BOM)...');
const createGroupTrail = getBreadcrumbTrail('bom_create_operations', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  createGroupTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM']
);
assert.strictEqual(typeof createGroupTrail[0].onClick, 'function', 'Home is clickable');
assert.strictEqual(typeof createGroupTrail[1].onClick, 'function', 'Products is clickable');
assert.strictEqual(typeof createGroupTrail[2].onClick, 'function', 'Bill of Materials is clickable');
assert.strictEqual(createGroupTrail[3].onClick, undefined, 'Create BOM is current');

const copyGroupTrail = getBreadcrumbTrail('bom_copy_operations', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  copyGroupTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Copy BOM']
);
console.log('✓ PASS: Group Sub-Pages trail is Home > Products > Bill of Materials > [Group]\n');

// 5. Feature Pages (Single and Bulk)
console.log('Test 5: Feature Pages breadcrumb trails...');

// Create Single BOM
const createSingleTrail = getBreadcrumbTrail('create_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  createSingleTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM', 'Create Single BOM']
);
assert.strictEqual(typeof createSingleTrail[0].onClick, 'function', 'Home clickable');
assert.strictEqual(typeof createSingleTrail[1].onClick, 'function', 'Products clickable');
assert.strictEqual(typeof createSingleTrail[2].onClick, 'function', 'Bill of Materials clickable');
assert.strictEqual(typeof createSingleTrail[3].onClick, 'function', 'Create BOM clickable');
assert.strictEqual(createSingleTrail[4].onClick, undefined, 'Create Single BOM is current');

// Create Bulk BOM
const createBulkTrail = getBreadcrumbTrail('bulk_create_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  createBulkTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM', 'Create Bulk BOM']
);

// Copy Single BOM
const copySingleTrail = getBreadcrumbTrail('copy_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  copySingleTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Copy BOM', 'Copy Single BOM']
);

// Copy Bulk BOM
const copyBulkTrail = getBreadcrumbTrail('bulk_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  copyBulkTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Copy BOM', 'Copy Bulk BOM']
);

// Display BOM (direct action)
const displayTrail = getBreadcrumbTrail('bom_explorer', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  displayTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Display BOM']
);

// Validate BOM (direct action)
const validateTrail = getBreadcrumbTrail('validate_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  validateTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Validate BOM']
);

// Delete BOM (direct action)
const deleteTrail = getBreadcrumbTrail('delete_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  deleteTrail.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Delete BOM']
);
console.log('✓ PASS: All BOM feature pages generate exact hierarchical breadcrumb trails\n');

// 6. Enterprise Administration breadcrumbs
console.log('Test 6: Enterprise Administration breadcrumb trail...');
const adminTrail = getBreadcrumbTrail('admin', {
  onNavigateHome: () => 'nav_home'
});
assert.deepStrictEqual(
  adminTrail.map((b) => b.label),
  ['Home', 'Enterprise Administration'],
  'Enterprise Administration must be directly under Home, NOT under Products'
);
assert.strictEqual(typeof adminTrail[0].onClick, 'function', 'Home must be clickable');
assert.strictEqual(adminTrail[1].onClick, undefined, 'Enterprise Administration is current');
console.log('✓ PASS: Enterprise Administration is Home > Enterprise Administration (not under Products)\n');

// 7. Locking during execution
console.log('Test 7: Locked breadcrumbs during async execution...');
const lockedTrail = getBreadcrumbTrail('create_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
}, { isLocked: true });
assert(lockedTrail.every((b) => b.onClick === undefined), 'All breadcrumb links must be disabled when isLocked: true');
console.log('✓ PASS: Breadcrumb links correctly lock when an operation is executing\n');

// 8. Automatic inheritance for future modules (e.g. Routing, Material Master)
console.log('Test 8: Automatic breadcrumb generation for future modules...');
const routingModule = MODULE_REGISTRY.find((m) => m.key === 'routing');
assert(routingModule, 'Routing module exists in MODULE_REGISTRY');
const routingTrail = getBreadcrumbTrail('routing', {
  onNavigateHome: () => 'nav_home',
  onNavigateProducts: () => 'nav_products'
});
assert.deepStrictEqual(
  routingTrail.map((b) => b.label),
  ['Home', 'Products', 'Routing'],
  'Future module Routing automatically receives Home > Products > Routing'
);
console.log('✓ PASS: Future module Routing automatically inherits Home > Products > Routing\n');

// 9. Verify absence of "Home | About Us | Contact" links in App.jsx and CSS
console.log('Test 9: Verifying header links removed and index.css clean...');
const appCode = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/App.jsx'), 'utf8');
const indexCss = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/index.css'), 'utf8');

assert(!appCode.includes('sap-top-nav-links'), 'App.jsx must not contain sap-top-nav-links');
assert(!appCode.includes('sap-nav-bottom-indicator'), 'App.jsx must not contain sap-nav-bottom-indicator');
assert(!indexCss.includes('.sap-top-nav-links'), 'index.css must not contain .sap-top-nav-links');
assert(!indexCss.includes('.sap-nav-bottom-indicator'), 'index.css must not contain .sap-nav-bottom-indicator');
assert(appCode.includes('navigateToView'), 'App.jsx must use centralized navigateToView helper');
assert(appCode.includes('getPathForView'), 'App.jsx must map routes to /home, /products, /admin');
assert(appCode.includes("window.addEventListener('popstate'"), 'App.jsx must listen to popstate for browser navigation');
console.log('✓ PASS: Header links and underline CSS eliminated, route synchronization verified\n');

console.log('============================================================');
console.log('  ALL NAVIGATION & BREADCRUMB VERIFICATION TESTS PASSED!    ');
console.log('============================================================\n');
