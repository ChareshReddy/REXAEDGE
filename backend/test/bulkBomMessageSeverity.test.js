import assert from 'assert';
import {
  deriveMessageSeverity,
  getBomRowMessages,
  normalizeBomStatus
} from '../../frontend/src/utils/bulkBomStatusUtils.js';

console.log('============================================================');
console.log('  TESTING BULK BOM MESSAGE SEVERITY HELPER                  ');
console.log('============================================================\n');

// --------------------------------------------------------------------------
// CASE 1: Skipped row with existing-alternative message
// --------------------------------------------------------------------------
console.log('1. Testing skipped row with existing-alternative message:');
{
  const row = {
    sequenceNum: '1',
    material: 'A1PSB001B',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '10',
    status: 'Skipped',
    reason: 'Skipped: alternative 10 of A1PSB001B already exists in SAP.'
  };

  const normStatus = normalizeBomStatus(row);
  assert.strictEqual(normStatus, 'skipped', 'Row status must normalize to skipped');

  const severity = deriveMessageSeverity(row.reason, row);
  assert.strictEqual(severity, 'skipped', 'Existing-alternative message on skipped row must have severity "skipped"');

  const messages = getBomRowMessages(row);
  assert.strictEqual(messages.total, 1, 'Total messages count must be 1');
  assert.strictEqual(messages.all[0].severity, 'skipped', 'Message item severity must be "skipped"');
  assert.strictEqual(messages.all[0].type, 'skipped', 'Message item type alias must be "skipped"');
  assert.strictEqual(messages.skipped.length, 1, 'Skipped messages list must have length 1');
  assert.strictEqual(messages.errors.length, 0, 'Errors list must be empty');
  assert.strictEqual(messages.warnings.length, 0, 'Warnings list must be empty');
  assert.ok(messages.all[0].text.includes('already exists'), 'Message text must mention already exists');
  console.log('   ✓ Skipped row with existing-alternative message correctly assigned severity "skipped"');
}

// --------------------------------------------------------------------------
// CASE 2: Skipped child with parent-exists message
// --------------------------------------------------------------------------
console.log('\n2. Testing skipped child with parent-exists message:');
{
  const childRow = {
    sequenceNum: '1',
    material: 'SUB_BOM_01',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '01',
    status: 'Skipped',
    reason: 'Skipped: not created because the parent BOM A1PSB001B already exists.'
  };

  const normStatus = normalizeBomStatus(childRow);
  assert.strictEqual(normStatus, 'skipped', 'Child row status must normalize to skipped');

  const severity = deriveMessageSeverity(childRow.reason, childRow);
  assert.strictEqual(severity, 'skipped', 'Parent-exists message on skipped child must have severity "skipped"');

  const messages = getBomRowMessages(childRow);
  assert.strictEqual(messages.total, 1, 'Total messages count must be 1');
  assert.strictEqual(messages.all[0].severity, 'skipped', 'Message item severity must be "skipped"');
  assert.strictEqual(messages.skipped.length, 1, 'Skipped messages list must have length 1');
  assert.strictEqual(messages.errors.length, 0, 'Errors list must be empty');
  assert.strictEqual(messages.warnings.length, 0, 'Warnings list must be empty');
  assert.ok(messages.all[0].text.includes('parent BOM'), 'Message text must mention parent BOM');
  console.log('   ✓ Skipped child with parent-exists message correctly assigned severity "skipped"');
}

// --------------------------------------------------------------------------
// CASE 3: Failed row with a primary error and follow-on messages
// --------------------------------------------------------------------------
console.log('\n3. Testing failed row with a primary error and follow-on messages:');
{
  const failedRow = {
    sequenceNum: '2',
    material: 'MAT_FAIL_01',
    plant: '1010',
    status: 'Failed',
    errors: [
      'Component RAW_MAT_01 does not exist in plant 1010',
      'Consistency check when creating BOM item failed',
      'No instance of object type BOMGroup found'
    ]
  };

  const normStatus = normalizeBomStatus(failedRow);
  assert.strictEqual(normStatus, 'error', 'Failed row status must normalize to error');

  // Direct deriveMessageSeverity checks
  const primarySev = deriveMessageSeverity('Component RAW_MAT_01 does not exist in plant 1010', failedRow);
  assert.strictEqual(primarySev, 'error', 'Primary error message must have severity "error"');

  const followOn1Sev = deriveMessageSeverity('Consistency check when creating BOM item failed', failedRow);
  assert.strictEqual(followOn1Sev, 'info', 'Consistency check follow-on message must have severity "info"');

  const followOn2Sev = deriveMessageSeverity('No instance of object type BOMGroup found', failedRow);
  assert.strictEqual(followOn2Sev, 'info', 'No instance follow-on message must have severity "info"');

  // Row extraction
  const messages = getBomRowMessages(failedRow);
  assert.strictEqual(messages.total, 3, 'Total messages count must be 3');
  assert.strictEqual(messages.all[0].severity, 'error', 'First message must be primary "error"');
  assert.strictEqual(messages.all[1].severity, 'info', 'Second message must be follow-on "info"');
  assert.strictEqual(messages.all[2].severity, 'info', 'Third message must be follow-on "info"');
  assert.strictEqual(messages.errors.length, 1, 'Errors list must contain only the primary error');
  assert.strictEqual(messages.info.length, 2, 'Info list must contain both follow-on technical messages');
  console.log('   ✓ Failed row correctly partitions primary error ("error") and technical cascade ("info")');
}

// --------------------------------------------------------------------------
// CASE 4: Ready row with a warning
// --------------------------------------------------------------------------
console.log('\n4. Testing ready row with a warning:');
{
  const readyRow = {
    sequenceNum: '3',
    material: 'A1PSB001B',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '01',
    status: 'Ready',
    warnings: [
      'Header material A1PSB001B is not extended to plant 1010 (MARC).'
    ]
  };

  const normStatus = normalizeBomStatus(readyRow);
  assert.strictEqual(normStatus, 'ready', 'Ready row with warning must still normalize to ready');

  const severity = deriveMessageSeverity(readyRow.warnings[0], readyRow);
  assert.strictEqual(severity, 'warning', 'Non-blocking warning on ready row must have severity "warning"');

  const messages = getBomRowMessages(readyRow);
  assert.strictEqual(messages.total, 1, 'Total messages count must be 1');
  assert.strictEqual(messages.all[0].severity, 'warning', 'Message severity must be "warning"');
  assert.strictEqual(messages.warnings.length, 1, 'Warnings list must have length 1');
  assert.strictEqual(messages.errors.length, 0, 'Errors list must be 0');
  assert.strictEqual(messages.skipped.length, 0, 'Skipped list must be 0');
  console.log('   ✓ Ready row with warning correctly assigned severity "warning" without blocking ready status');
}

// --------------------------------------------------------------------------
// CASE 5: Ready row with success notes ("Ready to copy...")
// --------------------------------------------------------------------------
console.log('\n5. Testing ready row with success notes (must never be rendered):');
{
  const cleanReadyRow = {
    sequenceNum: '4',
    material: 'CLEAN_MAT_01',
    plant: '1010',
    bomUsage: '1',
    alternativeBom: '19',
    status: 'Ready',
    message: 'Ready to copy (Alternative 19 auto-selected, 16 components).',
    messageType: 'success',
    errors: [],
    warnings: []
  };

  const normStatus = normalizeBomStatus(cleanReadyRow);
  assert.strictEqual(normStatus, 'ready', 'Clean row must normalize to ready');

  // deriveMessageSeverity directly on success message
  const sev1 = deriveMessageSeverity(cleanReadyRow.message, cleanReadyRow);
  assert.strictEqual(sev1, 'success', 'Success message must have severity "success"');

  const sev2 = deriveMessageSeverity({ text: 'Custom note', type: 'success' }, cleanReadyRow);
  assert.strictEqual(sev2, 'success', 'Explicit type: "success" must have severity "success"');

  const messages = getBomRowMessages(cleanReadyRow);
  assert.strictEqual(messages.total, 0, 'Total rendered messages count must be 0 for ready row with only success note');
  assert.strictEqual(messages.all.length, 0, 'Messages all array must be empty (success notes are NEVER rendered as lines)');
  assert.strictEqual(messages.errors.length, 0, 'Errors list must be empty');
  assert.strictEqual(messages.warnings.length, 0, 'Warnings list must be empty');
  assert.strictEqual(messages.skipped.length, 0, 'Skipped list must be empty');
  assert.strictEqual(messages.info.length, 0, 'Info list must be empty');
  assert.strictEqual(messages.success.length, 1, 'Success list captures the note internally without rendering');
  console.log('   ✓ Ready row with success notes returns total 0 and never renders message lines');
}

// --------------------------------------------------------------------------
// CASE 6: Unknown or missing type falls back to info
// --------------------------------------------------------------------------
console.log('\n6. Testing unknown or missing type fallback:');
{
  const unknownSev1 = deriveMessageSeverity('Generic note with no status context', {});
  assert.strictEqual(unknownSev1, 'info', 'Missing type must fall back to "info"');

  const unknownSev2 = deriveMessageSeverity({ text: 'Some text', type: 'unknown_type' }, {});
  assert.strictEqual(unknownSev2, 'info', 'Unknown explicit type must fall back to "info"');

  const unknownSev3 = deriveMessageSeverity('', {});
  assert.strictEqual(unknownSev3, 'info', 'Empty message must fall back to "info"');
  console.log('   ✓ Unknown or missing message type correctly falls back to "info"');
}

// --------------------------------------------------------------------------
// CASE 7: Not validated row produces no messages and no error status
// --------------------------------------------------------------------------
console.log('\n7. Testing not-validated row right after upload:');
{
  const unvalidatedRow = {
    id: 1,
    sourceMaterial: 'MAT_001',
    sourcePlant: '1010',
    targetPlant: '1001',
    targetAltBom: '02',
    status: 'PENDING',
    message: 'Not validated yet.'
  };

  const normStatus = normalizeBomStatus(unvalidatedRow);
  assert.strictEqual(normStatus, 'not_validated', 'Pending row must normalize to not_validated');

  const messages = getBomRowMessages(unvalidatedRow);
  assert.strictEqual(messages.total, 0, 'Not-validated row must have 0 messages');
  assert.strictEqual(messages.all.length, 0, 'Not-validated row all messages must be empty');
  assert.strictEqual(messages.errors.length, 0, 'Not-validated row must not count errors');
  console.log('   ✓ Not-validated row produces 0 messages and does not count as error');
}

// --------------------------------------------------------------------------
// CASE 8: Ready row with BOTH a real warning and a success note
// --------------------------------------------------------------------------
console.log('\n8. Testing ready row with both a real warning and a success note:');
{
  const rowWithBoth = {
    sequenceNum: '5',
    material: 'MAT_WARN_01',
    plant: '1010',
    status: 'Ready',
    message: 'Ready to copy (Alternative 02 auto-selected, 12 components).',
    messageType: 'success',
    warnings: [
      { text: 'Header material MAT_WARN_01 is not extended to plant 1010 (MARC)', type: 'warning' }
    ]
  };

  const normStatus = normalizeBomStatus(rowWithBoth);
  assert.strictEqual(normStatus, 'ready', 'Row must remain ready');

  const messages = getBomRowMessages(rowWithBoth);
  assert.strictEqual(messages.total, 1, 'Only the warning is rendered (total 1)');
  assert.strictEqual(messages.all.length, 1, 'all array has length 1');
  assert.strictEqual(messages.all[0].severity, 'warning', 'Rendered line is warning');
  assert.strictEqual(messages.warnings.length, 1, 'warnings list has length 1');
  assert.strictEqual(messages.errors.length, 0, 'errors list is 0');
  assert.ok(messages.all[0].text.includes('not extended to plant'), 'Warning text matches');
  console.log('   ✓ Only the warning line is rendered; success note is stripped from output');
}

console.log('\n============================================================');
console.log('  ALL 8 SEVERITY HELPER UNIT TESTS PASSED SUCCESSFULLY!     ');
console.log('============================================================');
