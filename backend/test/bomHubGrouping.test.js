import assert from 'assert';
import {
  MODULE_REGISTRY,
  hasCardPermission,
  getModuleKeyForAction
} from '../config/modules.js';

console.log('============================================================');
console.log('  RUNNING BILL OF MATERIALS HUB GROUPING TESTS              ');
console.log('============================================================\n');

// 1. Hub Card Count & Structure Verification
console.log('Test 1: BOM Hub structure and card count verification...');
const bomModule = MODULE_REGISTRY.find((m) => m.key === 'bom');
assert(bomModule, 'Bill of Materials module must exist in MODULE_REGISTRY');
assert.strictEqual(bomModule.kpiNum, '5', 'BOM module KPI number should be 5 cards');
assert.strictEqual(bomModule.subApps.length, 5, 'BOM module subApps must contain exactly 5 top-level cards');

const expectedTopLevelIds = ['create_group', 'copy_group', 'display', 'validate', 'delete'];
const actualTopLevelIds = bomModule.subApps.map((sa) => sa.id);
assert.deepStrictEqual(
  actualTopLevelIds,
  expectedTopLevelIds,
  `Top-level card IDs should be ${expectedTopLevelIds.join(', ')}`
);

// Verify Card 1: Create BOM group card
const createGroupCard = bomModule.subApps.find((sa) => sa.id === 'create_group');
assert.strictEqual(createGroupCard.title, 'Create BOM');
assert.strictEqual(createGroupCard.desc, 'Create a single BOM or many from a file');
assert.strictEqual(createGroupCard.iconName, 'FolderPlus');
assert.strictEqual(createGroupCard.isGroup, true);
assert.strictEqual(createGroupCard.subView, 'bom_create_operations');
assert.strictEqual(createGroupCard.children.length, 2, 'Create BOM group must have 2 child cards');

// Verify Card 2: Copy BOM group card
const copyGroupCard = bomModule.subApps.find((sa) => sa.id === 'copy_group');
assert.strictEqual(copyGroupCard.title, 'Copy BOM');
assert.strictEqual(copyGroupCard.desc, 'Copy a single BOM or many at once');
assert.strictEqual(copyGroupCard.iconName, 'Files');
assert.strictEqual(copyGroupCard.isGroup, true);
assert.strictEqual(copyGroupCard.subView, 'bom_copy_operations');
assert.strictEqual(copyGroupCard.children.length, 2, 'Copy BOM group must have 2 child cards');

// Verify Unchanged Cards (Display, Validate, Delete)
const displayCard = bomModule.subApps.find((sa) => sa.id === 'display');
assert.strictEqual(displayCard.title, 'Display BOM');
assert.strictEqual(displayCard.action, 'bom_explorer');

const validateCard = bomModule.subApps.find((sa) => sa.id === 'validate');
assert.strictEqual(validateCard.title, 'Validate BOM');
assert.strictEqual(validateCard.action, 'validate_bom');

const deleteCard = bomModule.subApps.find((sa) => sa.id === 'delete');
assert.strictEqual(deleteCard.title, 'Delete BOM');
assert.strictEqual(deleteCard.action, 'delete_bom');
assert.strictEqual(deleteCard.danger, true);
console.log('✓ PASS: BOM Hub has 5 cards with correct metadata and group definitions\n');


// 2. Sub-Page Card Definitions
console.log('Test 2: Sub-page card definitions and icons...');
// Create Sub-Page cards
const [createSingle, createBulk] = createGroupCard.children;
assert.strictEqual(createSingle.id, 'create');
assert.strictEqual(createSingle.title, 'Create Single BOM');
assert.strictEqual(createSingle.iconName, 'PlusSquare');
assert.strictEqual(createSingle.action, 'create_bom');

assert.strictEqual(createBulk.id, 'bulk_create');
assert.strictEqual(createBulk.title, 'Create Bulk BOM');
assert.strictEqual(createBulk.iconName, 'FilePlus');
assert.strictEqual(createBulk.action, 'bulk_create_bom');

// Copy Sub-Page cards
const [copySingle, copyBulk] = copyGroupCard.children;
assert.strictEqual(copySingle.id, 'copy');
assert.strictEqual(copySingle.title, 'Copy Single BOM');
assert.strictEqual(copySingle.iconName, 'Copy');
assert.strictEqual(copySingle.action, 'copy_bom');

assert.strictEqual(copyBulk.id, 'bulk');
assert.strictEqual(copyBulk.title, 'Copy Bulk BOM');
assert.strictEqual(copyBulk.iconName, 'FileSpreadsheet');
assert.strictEqual(copyBulk.action, 'bulk_bom');
console.log('✓ PASS: Sub-pages have matching single and bulk card pairs with distinct group icons\n');


// 3. Navigation and View Routing Simulation
console.log('Test 3: Navigation flow and view routing...');
class AppNavigationSimulator {
  constructor() {
    this.activeTab = 'launchpad';
    this.launchpadSubView = 'home';
    this.history = [];
  }

  navigate(tab, subView = null) {
    this.history.push({ activeTab: this.activeTab, launchpadSubView: this.launchpadSubView });
    this.activeTab = tab;
    if (subView !== null) {
      this.launchpadSubView = subView;
    }
  }

  // Open BOM module from Launchpad Home
  openBomHub() {
    this.navigate('launchpad', 'bom_operations');
  }

  // Click card on BOM hub
  clickHubCard(card) {
    if (card.isGroup && card.subView) {
      this.navigate('launchpad', card.subView);
    } else if (card.action) {
      this.navigate(card.action);
    }
  }

  // Click card on Group Sub-Page
  clickSubPageCard(card) {
    if (card.action) {
      this.navigate(card.action);
    }
  }

  // Back button from view
  goBackFromView(currentView) {
    if (['create_bom', 'bulk_create_bom'].includes(currentView)) {
      this.navigate('launchpad', 'bom_create_operations');
    } else if (['copy_bom', 'bulk_bom'].includes(currentView)) {
      this.navigate('launchpad', 'bom_copy_operations');
    } else {
      this.navigate('launchpad', 'bom_operations');
    }
  }

  // Back button from sub-page
  goBackFromSubPage(subView) {
    if (['bom_create_operations', 'bom_copy_operations'].includes(subView)) {
      this.navigate('launchpad', 'bom_operations');
    } else {
      this.navigate('launchpad', 'home');
    }
  }

  // Back button from hub
  goBackFromHub() {
    this.navigate('launchpad', 'home');
  }
}

const nav = new AppNavigationSimulator();

// Step A: Home -> Hub
nav.openBomHub();
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_operations');

// Step B: Hub -> Create BOM Sub-page
nav.clickHubCard(createGroupCard);
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_create_operations');

// Step C: Sub-page -> Create Single BOM View
nav.clickSubPageCard(createSingle);
assert.strictEqual(nav.activeTab, 'create_bom');

// Step D: Back from Create Single BOM -> returns to Create BOM Sub-page
nav.goBackFromView('create_bom');
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_create_operations');

// Step E: Back from Create BOM Sub-page -> returns to BOM Hub
nav.goBackFromSubPage('bom_create_operations');
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_operations');

// Step F: Hub -> Copy BOM Sub-page
nav.clickHubCard(copyGroupCard);
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_copy_operations');

// Step G: Sub-page -> Copy Bulk BOM View
nav.clickSubPageCard(copyBulk);
assert.strictEqual(nav.activeTab, 'bulk_bom');

// Step H: Back from Copy Bulk BOM -> returns to Copy BOM Sub-page
nav.goBackFromView('bulk_bom');
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_copy_operations');

// Step I: Back from Copy BOM Sub-page -> returns to BOM Hub
nav.goBackFromSubPage('bom_copy_operations');
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'bom_operations');

// Step J: Back from BOM Hub -> returns to Home
nav.goBackFromHub();
assert.strictEqual(nav.activeTab, 'launchpad');
assert.strictEqual(nav.launchpadSubView, 'home');
console.log('✓ PASS: 4-level navigation flows forward and backward level-by-level cleanly\n');


// 4. Breadcrumb Path Generation Validation
console.log('Test 4: Breadcrumb path representation...');
function getBreadcrumbsForView(view) {
  const bc = [{ label: 'Home', target: 'home' }, { label: 'Products', target: 'products' }];
  const parentGroup = MODULE_REGISTRY.flatMap((m) =>
    (m.subApps || []).map((sa) => ({ ...sa, moduleLabel: m.label, moduleSubView: m.subView }))
  ).find((sa) => sa.subView === view || (sa.children || []).some((c) => c.action === view));

  if (view === 'bom_operations') {
    bc.push({ label: 'Bill of Materials', target: 'bom_operations', isCurrent: true });
  } else if (parentGroup) {
    bc.push({ label: parentGroup.moduleLabel, target: parentGroup.moduleSubView });
    if (view === parentGroup.subView) {
      bc.push({ label: parentGroup.title, target: parentGroup.subView, isCurrent: true });
    } else {
      bc.push({ label: parentGroup.title, target: parentGroup.subView });
      const child = (parentGroup.children || []).find((c) => c.action === view);
      if (child) {
        bc.push({ label: child.title, target: child.action, isCurrent: true });
      }
    }
  }
  return bc;
}

const bcCreateSingle = getBreadcrumbsForView('create_bom');
assert.deepStrictEqual(
  bcCreateSingle.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM', 'Create Single BOM']
);

const bcBulkCreate = getBreadcrumbsForView('bulk_create_bom');
assert.deepStrictEqual(
  bcBulkCreate.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM', 'Create Bulk BOM']
);

const bcCopySingle = getBreadcrumbsForView('copy_bom');
assert.deepStrictEqual(
  bcCopySingle.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Copy BOM', 'Copy Single BOM']
);

const bcBulkCopy = getBreadcrumbsForView('bulk_bom');
assert.deepStrictEqual(
  bcBulkCopy.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Copy BOM', 'Copy Bulk BOM']
);

const bcCreateGroup = getBreadcrumbsForView('bom_create_operations');
assert.deepStrictEqual(
  bcCreateGroup.map((b) => b.label),
  ['Home', 'Products', 'Bill of Materials', 'Create BOM']
);
console.log('✓ PASS: Breadcrumbs accurately reflect Home > Products > Bill of Materials > [Group] > [Single/Bulk]\n');


// 5. Permission Filtering Tests
console.log('Test 5: Permission filtering on hub and group sub-pages...');

// Case A: Admin sees everything
const adminVisibleHubCards = bomModule.subApps.filter((card) =>
  hasCardPermission(card, [], 'admin')
);
assert.strictEqual(adminVisibleHubCards.length, 5, 'Admin must see all 5 cards on hub');

// Case B: User with ONLY 'bulk' (or 'bulk_bom') permission
// On Hub:
// - create_group has children ['create', 'bulk_create'], none permitted -> should be HIDDEN
// - copy_group has children ['copy', 'bulk'], 'bulk' is permitted -> should be VISIBLE
// - display, validate, delete -> HIDDEN
const bulkOnlyUserPermissions = ['bulk'];
const bulkOnlyHubCards = bomModule.subApps.filter((card) =>
  hasCardPermission(card, bulkOnlyUserPermissions, 'user')
);

assert.strictEqual(bulkOnlyHubCards.length, 1, 'Bulk-only user should see only Copy BOM on hub');
assert.strictEqual(bulkOnlyHubCards[0].id, 'copy_group');

// On Copy BOM Sub-page:
// - copy is HIDDEN
// - bulk is VISIBLE
const bulkOnlySubPageCards = copyGroupCard.children.filter((child) =>
  hasCardPermission(child, bulkOnlyUserPermissions, 'user')
);
assert.strictEqual(bulkOnlySubPageCards.length, 1, 'Bulk-only user should see only Copy Bulk BOM on sub-page');
assert.strictEqual(bulkOnlySubPageCards[0].id, 'bulk');
assert.strictEqual(bulkOnlySubPageCards[0].title, 'Copy Bulk BOM');

// Case C: User with ONLY 'bulk_create_bom' permission
const bulkCreateOnlyPermissions = ['bulk_create_bom'];
const bulkCreateHubCards = bomModule.subApps.filter((card) =>
  hasCardPermission(card, bulkCreateOnlyPermissions, 'user')
);
assert.strictEqual(bulkCreateHubCards.length, 1, 'Bulk-create user should see only Create BOM on hub');
assert.strictEqual(bulkCreateHubCards[0].id, 'create_group');

const bulkCreateSubPageCards = createGroupCard.children.filter((child) =>
  hasCardPermission(child, bulkCreateOnlyPermissions, 'user')
);
assert.strictEqual(bulkCreateSubPageCards.length, 1, 'Bulk-create user should see only Create Bulk BOM on sub-page');
assert.strictEqual(bulkCreateSubPageCards[0].id, 'bulk_create');

// Case D: User with ONLY 'display' permission
const displayOnlyPermissions = ['display'];
const displayHubCards = bomModule.subApps.filter((card) =>
  hasCardPermission(card, displayOnlyPermissions, 'user')
);
assert.strictEqual(displayHubCards.length, 1, 'Display-only user should see only Display BOM on hub');
assert.strictEqual(displayHubCards[0].id, 'display');

// Case E: Wildcard '*' permission
const wildcardHubCards = bomModule.subApps.filter((card) =>
  hasCardPermission(card, ['*'], 'user')
);
assert.strictEqual(wildcardHubCards.length, 5, 'Wildcard permission must show all 5 cards on hub');

console.log('✓ PASS: Permission filtering works accurately across groups and sub-pages\n');

console.log('============================================================');
console.log('  ALL BILL OF MATERIALS HUB GROUPING TESTS PASSED (100%)    ');
console.log('============================================================\n');
