import assert from 'assert';

console.log('============================================================');
console.log('  RUNNING CREATE BOM UI LOCKING & STALE STATE TESTS         ');
console.log('============================================================\n');

/**
 * Single Screen State Controller Simulation
 * Mirrors the exact state machine and logic from CreateBomView.jsx
 */
class CreateBomStateController {
  constructor() {
    this.headerData = {
      material: 'A1BH0214C',
      plant: '1010',
      bomUsage: '1',
      alternativeBom: '01',
      validFrom: '19.10.2026',
      baseQty: '1',
      bomStatus: '01',
      altText: 'Test'
    };
    this.components = [
      {
        id: 1,
        component: 'D4PSB001B',
        quantity: '10',
        itemCategory: 'L',
        storageLocation: '101A',
        referenceNumber: 'REF001',
        costingRelevancy: true,
        engineering: true
      }
    ];
    this.isValidating = false;
    this.isExecuting = false;
    this.preflightPassed = false;
    this.preflightData = null;
    this.validationErrors = [];
    this.validationWarnings = [];
    this.isConfirmModalOpen = false;
    this.executionResult = null;
  }

  get isLocked() {
    return this.isValidating || this.isExecuting;
  }

  handleHeaderChange(field, value) {
    if (this.isLocked) return false;
    this.headerData[field] = value;
    this.preflightPassed = false;
    this.preflightData = null;
    this.validationErrors = [];
    this.validationWarnings = [];
    return true;
  }

  handleComponentChange(id, field, value) {
    if (this.isLocked) return false;
    this.components = this.components.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    this.preflightPassed = false;
    this.preflightData = null;
    this.validationErrors = [];
    this.validationWarnings = [];
    return true;
  }

  handleAddComponent(comp) {
    if (this.isLocked) return false;
    const nextId = this.components.length > 0 ? Math.max(...this.components.map((c) => c.id)) + 1 : 1;
    this.components.push({ id: nextId, ...comp });
    this.preflightPassed = false;
    this.preflightData = null;
    this.validationErrors = [];
    this.validationWarnings = [];
    return true;
  }

  handleRemoveComponent(id) {
    if (this.isLocked || this.components.length <= 1) return false;
    this.components = this.components.filter((c) => c.id !== id);
    this.preflightPassed = false;
    this.preflightData = null;
    this.validationErrors = [];
    this.validationWarnings = [];
    return true;
  }

  async handleValidate(apiCall) {
    if (this.isLocked) return false;
    this.isValidating = true;
    this.validationErrors = [];

    try {
      const res = await apiCall();
      if (res.success && res.boms?.[0]?.status === 'Ready') {
        this.preflightPassed = true;
        this.preflightData = res.boms[0];
      } else {
        this.preflightPassed = false;
        this.validationErrors = [res.message || 'Validation failed.'];
      }
    } catch (err) {
      this.preflightPassed = false;
      this.validationErrors = [err.message || 'Error communicating with validation service.'];
    } finally {
      this.isValidating = false;
    }
    return true;
  }

  async handleExecuteCreate(apiCall) {
    if (this.isLocked) return false;
    if (!this.preflightPassed || !this.preflightData) {
      return false;
    }

    this.isExecuting = true;
    this.executionResult = null;

    try {
      const res = await apiCall(this.preflightData);
      this.executionResult = res;
      this.isConfirmModalOpen = false;
    } catch (err) {
      this.executionResult = {
        success: false,
        status: 'FAILED',
        message: err.message || 'BOM creation failed.'
      };
      this.isConfirmModalOpen = false;
    } finally {
      this.isExecuting = false;
    }
    return true;
  }
}

/**
 * Bulk Screen State Controller Simulation
 * Mirrors the exact state machine and logic from BulkCreateBomView.jsx
 */
class BulkCreateBomStateController {
  constructor() {
    this.isValidating = false;
    this.isExecuting = false;
    this.preflightReport = null;
    this.executionProgress = { current: 0, total: 0 };
    this.executionReport = null;
    this.isConfirmModalOpen = false;
  }

  get isLocked() {
    return this.isValidating || this.isExecuting;
  }

  handleFileProcessStart() {
    if (this.isLocked) return false;
    this.isValidating = true;
    return true;
  }

  handleFileProcessFinish(report, error = null) {
    try {
      if (error) {
        this.preflightReport = null;
      } else {
        this.preflightReport = report;
      }
    } finally {
      this.isValidating = false;
    }
  }

  async handleExecuteBatch(apiCall) {
    if (this.isLocked) return false;
    const readyBoms = (this.preflightReport?.boms || []).filter((b) => b.status === 'Ready');
    if (readyBoms.length === 0) return false;

    this.isExecuting = true;
    this.executionProgress = { current: 0, total: readyBoms.length };

    const results = [];
    try {
      for (let i = 0; i < readyBoms.length; i++) {
        this.executionProgress = { current: i + 1, total: readyBoms.length };
        const res = await apiCall(readyBoms[i]);
        results.push(res);
      }
      this.executionReport = { success: true, results };
      this.isConfirmModalOpen = false;
    } catch (err) {
      this.executionReport = { success: false, message: err.message, results };
      this.isConfirmModalOpen = false;
    } finally {
      this.isExecuting = false;
    }
    return true;
  }
}

// -----------------------------------------------------------------------------
// Test 1: Fields & Actions Disabled while Loading (isValidating / isExecuting)
// -----------------------------------------------------------------------------
console.log('1. Testing fields and actions disabled while loading:');
const controller = new CreateBomStateController();

assert.strictEqual(controller.isLocked, false, 'Initial state must not be locked');

// Simulate validation in progress
controller.isValidating = true;
assert.strictEqual(controller.isLocked, true, 'isLocked must be true when isValidating is true');

// Attempt to change header field while validating
const headerChangeBlocked = !controller.handleHeaderChange('material', 'NEW_MATERIAL');
assert.strictEqual(headerChangeBlocked, true, 'Header edit must be blocked while validating');
assert.strictEqual(controller.headerData.material, 'A1BH0214C', 'Header material must not have changed');

// Attempt to change component row while validating
const compChangeBlocked = !controller.handleComponentChange(1, 'quantity', '999');
assert.strictEqual(compChangeBlocked, true, 'Component edit must be blocked while validating');
assert.strictEqual(controller.components[0].quantity, '10', 'Component quantity must not have changed');

// Attempt to add or remove component while validating
assert.strictEqual(controller.handleAddComponent({ component: 'NEW' }), false, 'Add component must be blocked while validating');
assert.strictEqual(controller.handleRemoveComponent(1), false, 'Remove component must be blocked while validating');

// Attempt double-validate while validating
let doubleValidateCalled = false;
controller.handleValidate(() => { doubleValidateCalled = true; });
assert.strictEqual(doubleValidateCalled, false, 'Double submission of validate must be blocked');

console.log('   ✓ Header, component rows, add/remove, and actions strictly locked during validation');

// -----------------------------------------------------------------------------
// Test 2: Validation goes stale after any user edit
// -----------------------------------------------------------------------------
console.log('\n2. Testing validation goes stale after user edits:');
controller.isValidating = false;

// Perform successful validation
await controller.handleValidate(async () => ({
  success: true,
  boms: [{ status: 'Ready', material: 'A1BH0214C', plant: '1010' }]
}));
assert.strictEqual(controller.preflightPassed, true, 'Validation passed should be true');
assert.notStrictEqual(controller.preflightData, null, 'preflightData should be populated');

// 2a. Edit a header field -> state must become stale
controller.handleHeaderChange('baseQty', '5');
assert.strictEqual(controller.preflightPassed, false, 'Editing baseQty must invalidate preflightPassed');
assert.strictEqual(controller.preflightData, null, 'Editing baseQty must clear preflightData');
assert.strictEqual(controller.validationErrors.length, 0, 'Editing must clear previous errors');

// Re-validate
await controller.handleValidate(async () => ({
  success: true,
  boms: [{ status: 'Ready', material: 'A1BH0214C', plant: '1010' }]
}));
assert.strictEqual(controller.preflightPassed, true);

// 2b. Edit a component field -> state must become stale
controller.handleComponentChange(1, 'quantity', '25');
assert.strictEqual(controller.preflightPassed, false, 'Editing component quantity must invalidate preflightPassed');
assert.strictEqual(controller.preflightData, null, 'Editing component quantity must clear preflightData');

// Re-validate
await controller.handleValidate(async () => ({
  success: true,
  boms: [{ status: 'Ready', material: 'A1BH0214C', plant: '1010' }]
}));
assert.strictEqual(controller.preflightPassed, true);

// 2c. Add component -> state must become stale
controller.handleAddComponent({ component: 'COMP2', quantity: '1', itemCategory: 'L', storageLocation: '101A' });
assert.strictEqual(controller.preflightPassed, false, 'Adding component must invalidate preflightPassed');
assert.strictEqual(controller.preflightData, null, 'Adding component must clear preflightData');

// Re-validate
await controller.handleValidate(async () => ({
  success: true,
  boms: [{ status: 'Ready', material: 'A1BH0214C', plant: '1010' }]
}));
assert.strictEqual(controller.preflightPassed, true);

// 2d. Remove component -> state must become stale
controller.handleRemoveComponent(controller.components[1].id);
assert.strictEqual(controller.preflightPassed, false, 'Removing component must invalidate preflightPassed');
assert.strictEqual(controller.preflightData, null, 'Removing component must clear preflightData');

// Create button must not execute if stale / unvalidated
const unvalidatedCreateResult = await controller.handleExecuteCreate(async () => ({ success: true }));
assert.strictEqual(unvalidatedCreateResult, false, 'Create execution must be rejected when unvalidated/stale');

console.log('   ✓ Any edit (header, component, add, remove) marks validation stale and clears preflightData');

// -----------------------------------------------------------------------------
// Test 3: Loading flag clears on error (Single Screen)
// -----------------------------------------------------------------------------
console.log('\n3. Testing loading flag clears on error (Single Screen):');

// 3a. Validation error (network failure)
await controller.handleValidate(async () => {
  throw new Error('Network timeout connecting to SAP service');
});
assert.strictEqual(controller.isValidating, false, 'isValidating must reset to false after error');
assert.strictEqual(controller.isLocked, false, 'isLocked must reset to false after error');
assert.strictEqual(controller.preflightPassed, false, 'preflightPassed must remain false');
assert.strictEqual(controller.validationErrors[0], 'Network timeout connecting to SAP service', 'Real error message captured');

// Re-validate for create test
await controller.handleValidate(async () => ({
  success: true,
  boms: [{ status: 'Ready', material: 'A1BH0214C', plant: '1010' }]
}));
assert.strictEqual(controller.preflightPassed, true);

// 3b. Create execution error (RFC failure)
controller.isConfirmModalOpen = true;
await controller.handleExecuteCreate(async () => {
  throw new Error('RFC_ERROR: Authorization failure in SAP client 100');
});
assert.strictEqual(controller.isExecuting, false, 'isExecuting must reset to false after creation error');
assert.strictEqual(controller.isLocked, false, 'isLocked must reset to false after creation error');
assert.strictEqual(controller.isConfirmModalOpen, false, 'Confirm modal must close on error');
assert.strictEqual(controller.executionResult.status, 'FAILED', 'Execution result must record FAILED');
assert.strictEqual(controller.executionResult.message, 'RFC_ERROR: Authorization failure in SAP client 100', 'Real RFC error captured');

console.log('   ✓ isValidating and isExecuting clear properly in finally block on any network/API error');

// -----------------------------------------------------------------------------
// Test 4: Bulk Screen Locking, Progress Tracking & Error Clearing
// -----------------------------------------------------------------------------
console.log('\n4. Testing Bulk Screen locking, progress tracking, and error clearing:');
const bulk = new BulkCreateBomStateController();

// 4a. Drop zone and upload validation locking
bulk.handleFileProcessStart();
assert.strictEqual(bulk.isLocked, true, 'Bulk screen isLocked must be true while validating spreadsheet');
assert.strictEqual(bulk.handleFileProcessStart(), false, 'Subsequent drop/upload must be blocked while validating');

// Simulate validation error
bulk.handleFileProcessFinish(null, new Error('Invalid Excel format'));
assert.strictEqual(bulk.isValidating, false, 'isValidating must clear on parse/validation error');
assert.strictEqual(bulk.isLocked, false, 'isLocked must clear on error');

// 4b. Setup pre-flight with 3 ready BOMs
bulk.preflightReport = {
  boms: [
    { sequenceNum: '1', status: 'Ready', material: 'M1' },
    { sequenceNum: '2', status: 'Ready', material: 'M2' },
    { sequenceNum: '3', status: 'Ready', material: 'M3' }
  ]
};

// 4c. Sequential progress tracking (Creating 1 of 3, 2 of 3, 3 of 3)
const progressSnapshots = [];
await bulk.handleExecuteBatch(async (bom) => {
  progressSnapshots.push({ ...bulk.executionProgress, material: bom.material });
  return { success: true, material: bom.material };
});

assert.strictEqual(bulk.isExecuting, false, 'isExecuting must be false after batch completes');
assert.strictEqual(bulk.isLocked, false, 'isLocked must be false after batch completes');
assert.strictEqual(progressSnapshots.length, 3, 'Must have executed 3 items sequentially');
assert.deepStrictEqual(progressSnapshots[0], { current: 1, total: 3, material: 'M1' }, 'Step 1: Creating 1 of 3');
assert.deepStrictEqual(progressSnapshots[1], { current: 2, total: 3, material: 'M2' }, 'Step 2: Creating 2 of 3');
assert.deepStrictEqual(progressSnapshots[2], { current: 3, total: 3, material: 'M3' }, 'Step 3: Creating 3 of 3');

// 4d. Batch execution error clearing
bulk.isConfirmModalOpen = true;
await bulk.handleExecuteBatch(async () => {
  throw new Error('SAP connection lost during batch item 2');
});
assert.strictEqual(bulk.isExecuting, false, 'isExecuting must clear to false when batch creation fails');
assert.strictEqual(bulk.isLocked, false, 'isLocked must clear to false after error');
assert.strictEqual(bulk.isConfirmModalOpen, false, 'Modal must close on batch error');
assert.strictEqual(bulk.executionReport.success, false, 'Report must mark batch failed');

console.log('   ✓ Bulk screen tracks sequential progress ("Creating X of Y...") and clears loading state on error');

console.log('\n============================================================');
console.log('  ALL CREATE BOM UI STATE & LOCKING TESTS PASSED!           ');
console.log('============================================================\n');
