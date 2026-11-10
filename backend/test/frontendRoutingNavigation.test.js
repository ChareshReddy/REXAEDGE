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
  assert(['public', 'authenticated', 'admin', 'dev'].includes(route.access), `Route ${id} has valid access rule`);
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
console.log('Test 3: Legacy URL redirects map verification (all old paths)...');
const expectedLegacyMappings = {
  '/create_bom': '/products/bom/create/single',
  '/bulk_create_bom': '/products/bom/create/bulk',
  '/copy_bom': '/products/bom/copy/single',
  '/bulk_bom': '/products/bom/copy/bulk',
  '/bom_explorer': '/products/bom/display',
  '/validate_bom': '/products/bom/validate',
  '/delete_bom': '/products/bom/delete',
  '/bom': '/products/bom',
  '/products': '/home',
  '/launchpad': '/home',
  '/admin': '/admin/users',
  '/admin/logs': '/admin/logs/audit',
  '/admin/activity-logs': '/admin/logs/audit'
};
for (const [legacy, target] of Object.entries(expectedLegacyMappings)) {
  assert.strictEqual(
    LEGACY_REDIRECTS[legacy],
    target,
    `Legacy path ${legacy} must resolve to canonical path ${target}`
  );
  assert.strictEqual(
    resolveLegacyRedirect(legacy),
    target,
    `resolveLegacyRedirect(${legacy}) must return ${target}`
  );
}
passedTests++;
console.log('✓ PASS: All legacy URLs mapped and verified for automatic canonical redirection\n');

// Test 4: Internal path security validation
console.log('Test 4: Open redirect security check (isInternalPath)...');
assert.strictEqual(isInternalPath('/home'), true);
assert.strictEqual(isInternalPath('/admin/users'), true);
assert.strictEqual(isInternalPath('/products/bom/create/single'), true);
assert.strictEqual(isInternalPath('/products?server=srv1'), true);
assert.strictEqual(isInternalPath('//evil.com'), false);
assert.strictEqual(isInternalPath('//google.com/path'), false);
assert.strictEqual(isInternalPath('https://evil.com'), false);
assert.strictEqual(isInternalPath('http://malicious.com'), false);
assert.strictEqual(isInternalPath('javascript:alert(1)'), false);
assert.strictEqual(isInternalPath(''), false);
assert.strictEqual(isInternalPath(null), false);
passedTests++;
console.log('✓ PASS: Open redirect security validation prevents malicious external protocols and protocol-relative URLs\n');

// Test 5: Route Helpers (routeTo, getRouteById, getRouteByPath)
console.log('Test 5: Route helpers (routeTo, getRouteById, getRouteByPath)...');
assert.strictEqual(routeTo(ROUTE_IDS.HOME), '/home');
assert.strictEqual(routeTo(ROUTE_IDS.BOM_CREATE_SINGLE), '/products/bom/create/single');
assert.strictEqual(routeTo(ROUTE_IDS.ADMIN_USERS), '/admin/users');
assert.strictEqual(
  routeTo(ROUTE_IDS.BOM_OPERATIONS, { server: 'hana1', mode: 'compact' }),
  '/products/bom?server=hana1&mode=compact'
);

const foundById = getRouteById(ROUTE_IDS.BOM_OPERATIONS);
assert(foundById, 'Should find route by ID');
assert.strictEqual(foundById.path, '/products/bom');

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
  ['Home', 'BOM management', 'Create BOM', 'Create Single BOM'],
  'BOM Create Single breadcrumb trail must trace through entire hierarchy without Products'
);
assert.strictEqual(singleBomCrumbs[0].path, '/home');
assert.strictEqual(singleBomCrumbs[1].path, '/products/bom');
assert.strictEqual(singleBomCrumbs[2].path, '/products/bom/create');
assert.strictEqual(singleBomCrumbs[3].path, '/products/bom/create/single');

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

assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_operations, ROUTE_IDS.BOM_OPERATIONS);
assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_create_operations, ROUTE_IDS.BOM_CREATE_HUB);
assert.strictEqual(SUBVIEW_TO_ROUTE_ID.bom_copy_operations, ROUTE_IDS.BOM_COPY_HUB);
passedTests++;
console.log('✓ PASS: Action and subview mappings correctly align with Canonical Route IDs\n');

console.log('============================================================');
console.log(`  ALL ${passedTests} ROUTING & NAVIGATION TEST SUITES PASSED (100%) `);
console.log('============================================================\n');
