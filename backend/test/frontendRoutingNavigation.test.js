import assert from 'assert';
import {
  ROUTES,
  ROUTE_IDS,
  LEGACY_REDIRECTS,
  ACTION_TO_ROUTE_ID,
  SUBVIEW_TO_ROUTE_ID,
  normalizePath,
  isInternalPath,
  resolveLegacyRedirect,
  getRouteById,
  getRouteByPath,
  routeTo,
  getBreadcrumbsForRoute
} from '../../frontend/src/config/routes.js';

console.log('============================================================');
console.log('   RUNNING FRONTEND ROUTING & NAVIGATION UNIT TESTS          ');
console.log('============================================================\n');

let passedTests = 0;

// Test 1: Route Registry Integrity
console.log('Test 1: Route registry integrity and configuration completeness...');
assert(Object.keys(ROUTES).length >= 17, 'All expected routes must be registered in ROUTES');
for (const [id, route] of Object.entries(ROUTES)) {
  assert.strictEqual(route.id, id, `Route id ${id} must match its key`);
  assert(route.path.startsWith('/'), `Route path ${route.path} must start with /`);
  assert(route.title, `Route ${id} must have a page title`);
  assert(route.breadcrumb, `Route ${id} must have a breadcrumb label`);
  assert(['public', 'authenticated', 'admin'].includes(route.access), `Route ${id} has valid access rule`);
}
passedTests++;
console.log('✓ PASS: All routes in registry have required properties (id, path, title, breadcrumb, access)\n');

// Test 2: Normalization of paths
console.log('Test 2: Path normalization (case, trailing slash, empty)...');
assert.strictEqual(normalizePath(''), '/');
assert.strictEqual(normalizePath('/'), '/');
assert.strictEqual(normalizePath('/HOME'), '/home');
assert.strictEqual(normalizePath('/home/'), '/home');
assert.strictEqual(normalizePath('  /products/bom/  '), '/products/bom');
assert.strictEqual(normalizePath('/ADMIN/USERS/'), '/admin/users');
passedTests++;
console.log('✓ PASS: normalizePath correctly standardizes letter case, trimming, and trailing slashes\n');

// Test 3: Legacy URL Redirects
console.log('Test 3: Legacy URL redirects map verification (all 12 old paths)...');
const expectedLegacyMappings = {
  '/create_bom': '/products/bom/create/single',
  '/bulk_create_bom': '/products/bom/create/bulk',
  '/copy_bom': '/products/bom/copy/single',
  '/bulk_bom': '/products/bom/copy/bulk',
  '/bom_explorer': '/products/bom/display',
  '/validate_bom': '/products/bom/validate',
  '/delete_bom': '/products/bom/delete',
  '/bom': '/products/bom',
  '/launchpad': '/products',
  '/admin': '/admin/users',
  '/admin/logs': '/admin/logs/audit',
  '/admin/activity-logs': '/admin/logs/audit'
};

for (const [oldPath, expectedNewPath] of Object.entries(expectedLegacyMappings)) {
  const resolved = resolveLegacyRedirect(oldPath);
  assert.strictEqual(resolved, expectedNewPath, `Legacy redirect for ${oldPath} must resolve to ${expectedNewPath}`);
  // Also verify case-insensitive redirect
  const resolvedUpper = resolveLegacyRedirect(oldPath.toUpperCase());
  assert.strictEqual(resolvedUpper, expectedNewPath, `Uppercase legacy redirect for ${oldPath.toUpperCase()} must resolve`);
}
assert.strictEqual(resolveLegacyRedirect('/home'), null, 'Canonical path /home should not redirect');
assert.strictEqual(resolveLegacyRedirect('/unknown'), null, 'Unknown path should return null');
passedTests++;
console.log('✓ PASS: All legacy URLs resolve to canonical kebab-case routes\n');

// Test 4: Open Redirect Protection (isInternalPath)
console.log('Test 4: Open redirect protection (isInternalPath)...');
// Safe internal paths
assert.strictEqual(isInternalPath('/home'), true);
assert.strictEqual(isInternalPath('/products/bom/create/single'), true);
assert.strictEqual(isInternalPath('/admin/users'), true);
assert.strictEqual(isInternalPath('/products?server=srv1'), true);

// Dangerous or external paths that must be rejected
assert.strictEqual(isInternalPath('//evil.com'), false, 'Double-slash protocol-relative redirect must be rejected');
assert.strictEqual(isInternalPath('//evil.com/phish'), false);
assert.strictEqual(isInternalPath('https://evil.com'), false, 'Full HTTPS URL must be rejected');
assert.strictEqual(isInternalPath('http://malicious.org'), false, 'Full HTTP URL must be rejected');
assert.strictEqual(isInternalPath('javascript:alert(1)'), false, 'Javascript pseudo-protocol must be rejected');
assert.strictEqual(isInternalPath('data:text/html,...'), false, 'Data URI must be rejected');
assert.strictEqual(isInternalPath(''), false, 'Empty string must be rejected');
assert.strictEqual(isInternalPath(null), false, 'Null must be rejected');
assert.strictEqual(isInternalPath(undefined), false, 'Undefined must be rejected');
passedTests++;
console.log('✓ PASS: isInternalPath strictly permits internal routes and blocks open redirect vectors\n');

// Test 5: Route Helpers (routeTo, getRouteById, getRouteByPath)
console.log('Test 5: Central route helpers...');
assert.strictEqual(routeTo(ROUTE_IDS.HOME), '/home');
assert.strictEqual(routeTo(ROUTE_IDS.BOM_CREATE_SINGLE), '/products/bom/create/single');
assert.strictEqual(routeTo(ROUTE_IDS.ADMIN_USERS), '/admin/users');
assert.strictEqual(routeTo(ROUTE_IDS.ADMIN_LOGS_ERRORS), '/admin/logs/errors');

// Query params serialization in routeTo
assert.strictEqual(routeTo(ROUTE_IDS.HOME, { search: 'bolt' }), '/home?search=bolt');
assert.strictEqual(routeTo(ROUTE_IDS.ADMIN_USERS, { page: '2', role: 'admin' }), '/admin/users?page=2&role=admin');

// Lookup by path
const foundByPath = getRouteByPath('/products/bom/display');
assert(foundByPath, 'Should find route by path');
assert.strictEqual(foundByPath.id, ROUTE_IDS.BOM_DISPLAY);

const foundByLegacy = getRouteByPath('/bom_explorer');
assert(foundByLegacy, 'Should resolve legacy path via getRouteByPath');
assert.strictEqual(foundByLegacy.id, ROUTE_IDS.BOM_DISPLAY);
passedTests++;
console.log('✓ PASS: routeTo, getRouteById, and getRouteByPath function accurately with query support\n');

// Test 6: Breadcrumb generation from hierarchy
console.log('Test 6: Breadcrumb generation for deep route hierarchy...');
const singleBomCrumbs = getBreadcrumbsForRoute(ROUTE_IDS.BOM_CREATE_SINGLE);
assert.deepStrictEqual(
  singleBomCrumbs.map(c => c.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM', 'Create Single BOM'],
  'BOM Create Single breadcrumb trail must trace through entire hierarchy'
);
assert.strictEqual(singleBomCrumbs[0].path, '/home');
assert.strictEqual(singleBomCrumbs[1].path, '/products');
assert.strictEqual(singleBomCrumbs[2].path, '/products/bom');
assert.strictEqual(singleBomCrumbs[3].path, '/products/bom/create');
assert.strictEqual(singleBomCrumbs[4].path, '/products/bom/create/single');

const auditLogsCrumbs = getBreadcrumbsForRoute(ROUTE_IDS.ADMIN_LOGS_AUDIT);
assert.deepStrictEqual(
  auditLogsCrumbs.map(c => c.label),
  ['Home', 'Enterprise Administration', 'Audit Logs'],
  'Enterprise Administration breadcrumb must connect directly to Home and show sub-tab'
);
passedTests++;
console.log('✓ PASS: Breadcrumb generator accurately walks the parent hierarchy\n');

// Test 7: Action & Subview mappings
console.log('Test 7: Action and SubView mappings to Route IDs...');
assert.strictEqual(ACTION_TO_ROUTE_ID.create_bom, ROUTE_IDS.BOM_CREATE_SINGLE);
assert.strictEqual(ACTION_TO_ROUTE_ID.bulk_create_bom, ROUTE_IDS.BOM_CREATE_BULK);
assert.strictEqual(ACTION_TO_ROUTE_ID.copy_bom, ROUTE_IDS.BOM_COPY_SINGLE);
assert.strictEqual(ACTION_TO_ROUTE_ID.bulk_bom, ROUTE_IDS.BOM_COPY_BULK);
assert.strictEqual(ACTION_TO_ROUTE_ID.bom_explorer, ROUTE_IDS.BOM_DISPLAY);
assert.strictEqual(ACTION_TO_ROUTE_ID.validate_bom, ROUTE_IDS.BOM_VALIDATE);
assert.strictEqual(ACTION_TO_ROUTE_ID.delete_bom, ROUTE_IDS.BOM_DELETE);

assert.strictEqual(SUBVIEW_TO_ROUTE_ID.home, ROUTE_IDS.PRODUCTS);
assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_operations, ROUTE_IDS.BOM_OPERATIONS);
assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_create_operations, ROUTE_IDS.BOM_CREATE_HUB);
assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_copy_operations, ROUTE_IDS.BOM_COPY_HUB);
passedTests++;
console.log('✓ PASS: All legacy action and subview keys map unambiguously to route IDs\n');

console.log('============================================================');
console.log(`  ALL ${passedTests} FRONTEND ROUTING & NAVIGATION TESTS PASSED! `);
console.log('============================================================\n');
