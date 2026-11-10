import assert from 'assert';
import { getBreadcrumbTrail, getBreadcrumbDescriptors } from '../../shared/breadcrumbs.js';

console.log('============================================================');
console.log('  RUNNING NAVIGATION & SHARED BREADCRUMB VERIFICATION TESTS ');
console.log('============================================================\n');

// 1. Home page breadcrumbs
console.log('Test 1: Home page breadcrumb trail...');
const homeTrail = getBreadcrumbTrail('home');
assert.deepStrictEqual(homeTrail, [], 'Home page must have empty breadcrumb trail');
console.log('✓ PASS: Home page has no breadcrumb (empty trail)\n');

// 2. Products page breadcrumbs (redirect target)
console.log('Test 2: Products page breadcrumb trail...');
const productsTrail = getBreadcrumbTrail('products', {
  onNavigateHome: () => 'nav_home'
});
assert.deepStrictEqual(
  productsTrail.map((b) => b.label),
  ['Home'],
  'Products breadcrumb trail must be Home'
);
assert.strictEqual(typeof productsTrail[0].onClick, 'function', 'Home must be a clickable link');
console.log('✓ PASS: Products page trail resolves cleanly to Home\n');

// 3. Bill of Materials Hub page breadcrumbs
console.log('Test 3: Bill of Materials Operations Hub breadcrumb trail...');
const bomHubTrail = getBreadcrumbTrail('bom_operations', {
  onNavigateHome: () => 'nav_home'
});
assert.deepStrictEqual(
  bomHubTrail.map((b) => b.label),
  ['Home', 'BOM management'],
  'BOM Hub trail must be Home > BOM management (no Products crumb)'
);
assert.strictEqual(typeof bomHubTrail[0].onClick, 'function', 'Home must be clickable');
assert.strictEqual(bomHubTrail[1].onClick, undefined, 'BOM management must be current (not a link)');
console.log('✓ PASS: BOM Hub trail is Home > BOM management\n');

// 4. Group Sub-Pages (Create BOM, Copy BOM)
console.log('Test 4: Group Sub-Page breadcrumb trails (Create BOM, Copy BOM)...');
const createGroupTrail = getBreadcrumbTrail('bom_create_operations', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  createGroupTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Create BOM']
);
assert.strictEqual(typeof createGroupTrail[0].onClick, 'function', 'Home is clickable');
assert.strictEqual(typeof createGroupTrail[1].onClick, 'function', 'BOM management is clickable');
assert.strictEqual(createGroupTrail[2].onClick, undefined, 'Create BOM is current');

const copyGroupTrail = getBreadcrumbTrail('bom_copy_operations', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  copyGroupTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Copy BOM']
);
console.log('✓ PASS: Group Sub-Pages trail is Home > BOM management > [Group]\n');

// 5. Feature Pages (Single and Bulk)
console.log('Test 5: Feature Pages breadcrumb trails...');

// Create Single BOM
const createSingleTrail = getBreadcrumbTrail('create_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  createSingleTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Create BOM', 'Create Single BOM']
);
assert.strictEqual(typeof createSingleTrail[0].onClick, 'function', 'Home clickable');
assert.strictEqual(typeof createSingleTrail[1].onClick, 'function', 'BOM management clickable');
assert.strictEqual(typeof createSingleTrail[2].onClick, 'function', 'Create BOM clickable');
assert.strictEqual(createSingleTrail[3].onClick, undefined, 'Create Single BOM is current');

// Create Bulk BOM
const createBulkTrail = getBreadcrumbTrail('bulk_create_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  createBulkTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Create BOM', 'Create Bulk BOM']
);
assert.strictEqual(typeof createBulkTrail[2].onClick, 'function', 'Create BOM clickable in bulk');
assert.strictEqual(createBulkTrail[3].onClick, undefined, 'Create Bulk BOM is current');

// Copy Single BOM
const copySingleTrail = getBreadcrumbTrail('copy_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  copySingleTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Copy BOM', 'Copy Single BOM']
);

// Copy Bulk BOM
const copyBulkTrail = getBreadcrumbTrail('bulk_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom',
  onBack: () => 'nav_group'
});
assert.deepStrictEqual(
  copyBulkTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Copy BOM', 'Copy Bulk BOM']
);
assert.strictEqual(typeof copyBulkTrail[2].onClick, 'function', 'Copy BOM clickable in bulk');
assert.strictEqual(copyBulkTrail[3].onClick, undefined, 'Copy Bulk BOM is current');

// Display BOM (direct action)
const displayTrail = getBreadcrumbTrail('bom_explorer', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  displayTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Display BOM']
);

// Validate BOM (direct action)
const validateTrail = getBreadcrumbTrail('validate_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  validateTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Validate BOM']
);

// Delete BOM (direct action)
const deleteTrail = getBreadcrumbTrail('delete_bom', {
  onNavigateHome: () => 'nav_home',
  onNavigateBom: () => 'nav_bom'
});
assert.deepStrictEqual(
  deleteTrail.map((b) => b.label),
  ['Home', 'BOM management', 'Delete BOM']
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
console.log('✓ PASS: Enterprise Administration is Home > Enterprise Administration\n');

// 7. Future Modules automatic inheritance
console.log('Test 7: Future module breadcrumbs via MODULE_REGISTRY...');
const routingTrail = getBreadcrumbTrail('routing', {
  onNavigateHome: () => 'nav_home'
});
assert.deepStrictEqual(
  routingTrail.map((b) => b.label),
  ['Home', 'Routing'],
  'Future module Routing automatically receives Home > Routing'
);
console.log('✓ PASS: Future module Routing automatically inherits Home > Routing\n');

// 8. Descriptors helper for pure data validation
console.log('Test 8: getBreadcrumbDescriptors data output...');
const descriptors = getBreadcrumbDescriptors('bom_operations');
assert.strictEqual(descriptors.length, 2);
assert.strictEqual(descriptors[0].label, 'Home');
assert.strictEqual(descriptors[0].hasLink, true);
assert.strictEqual(descriptors[0].isCurrent, false);
assert.strictEqual(descriptors[1].label, 'BOM management');
assert.strictEqual(descriptors[1].hasLink, false);
assert.strictEqual(descriptors[1].isCurrent, true);
console.log('✓ PASS: getBreadcrumbDescriptors returns correct descriptors\n');

console.log('============================================================');
console.log('  ALL NAVIGATION & BREADCRUMB TESTS PASSED (100%)           ');
console.log('============================================================\n');
