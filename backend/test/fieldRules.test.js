import assert from 'assert';
import {
  FIELD_RULES,
  DEFAULT_BASE_UOM,
  isValidCalendarDate,
  sanitizeValidFromInput,
  isValidQuantity,
  isValidBaseQuantity,
  sanitizeBaseQuantityInput,
  validateField
} from '../../shared/fieldRules.js';

console.log('============================================================');
console.log('  RUNNING FIELD VALIDATION RULES TESTS                      ');
console.log('============================================================');

// Test 1: Field rule metadata existence
console.log('Test 1: Check rule keys and limits...');
assert.strictEqual(FIELD_RULES.material.minLength, 8);
assert.strictEqual(FIELD_RULES.material.maxLength, 19);
assert.strictEqual(FIELD_RULES.component.minLength, 8);
assert.strictEqual(FIELD_RULES.component.maxLength, 19);
assert.strictEqual(FIELD_RULES.plant.maxLength, 4);
assert.strictEqual(FIELD_RULES.storageLocation.maxLength, 4);
assert.strictEqual(FIELD_RULES.bomUsage.maxLength, 1);
assert.strictEqual(FIELD_RULES.alternativeBom.maxLength, 2);
assert.strictEqual(FIELD_RULES.bomStatus.maxLength, 2);
assert.strictEqual(FIELD_RULES.itemCategory.maxLength, 1);
assert.strictEqual(FIELD_RULES.unit.maxLength, 3);
assert.strictEqual(FIELD_RULES.altText.maxLength, 40);
assert.strictEqual(FIELD_RULES.validFrom.maxLength, 10);
console.log('   ✓ All field rules defined with expected bounds');

// Test 2: Valid From date validation
console.log('Test 2: Validate calendar dates...');
assert.strictEqual(isValidCalendarDate('06.11.2026'), true);
assert.strictEqual(isValidCalendarDate('29.02.2024'), true); // Leap year
assert.strictEqual(isValidCalendarDate('29.02.2026'), false); // Not leap year
assert.strictEqual(isValidCalendarDate('31.02.2026'), false); // Impossible date
assert.strictEqual(isValidCalendarDate('31.04.2026'), false); // April has 30 days
assert.strictEqual(isValidCalendarDate('31.12.2026'), true);
assert.strictEqual(isValidCalendarDate('invalid'), false);
assert.strictEqual(isValidCalendarDate('06/11/2026'), false); // Must be DD.MM.YYYY
console.log('   ✓ Calendar date and leap year logic passed');

// Test 3: Typing restriction for Valid From
console.log('Test 3: Sanitize typing in Valid From...');
assert.strictEqual(sanitizeValidFromInput('06.11.2026'), '06.11.2026');
assert.strictEqual(sanitizeValidFromInput('06.11.2026extra'), '06.11.2026'); // Capped at 10
assert.strictEqual(sanitizeValidFromInput('abc06.11.def'), '06.11.'); // Strips letters
console.log('   ✓ Valid From typing restriction passed');

// Test 4: Quantity validation
console.log('Test 4: Validate numeric quantity bounds...');
assert.strictEqual(isValidQuantity('1'), true);
assert.strictEqual(isValidQuantity('100.5'), true);
assert.strictEqual(isValidQuantity('0.001'), true);
assert.strictEqual(isValidQuantity('1234567890123.999'), true); // 13 digits, 3 decimals
assert.strictEqual(isValidQuantity('12345678901234.999'), false); // 14 digits
assert.strictEqual(isValidQuantity('1.1234'), false); // 4 decimals
assert.strictEqual(isValidQuantity('0'), false); // Must be > 0
assert.strictEqual(isValidQuantity('-5'), false); // Must be > 0
assert.strictEqual(isValidQuantity('abc'), false);
console.log('   ✓ Quantity 13 digits and 3 decimals validation passed');

// Test 5: validateField helper function
console.log('Test 5: validateField function behavior...');
// Material min/max
assert.strictEqual(validateField('material', 'A1BH02', true).valid, false); // Length 6 < 8
assert.strictEqual(validateField('material', 'A1BH0214C', true).valid, true); // Length 9
assert.strictEqual(validateField('material', '1234567890123456789', true).valid, true); // Length 19
assert.strictEqual(validateField('material', '12345678901234567890', true).valid, false); // Length 20

// Empty optional stays valid
assert.strictEqual(validateField('altText', '', false).valid, true);
assert.strictEqual(validateField('alternativeBom', '', false).valid, true);

// Required empty returns error
assert.strictEqual(validateField('material', '', true).valid, false);

// Base quantity validation
assert.strictEqual(DEFAULT_BASE_UOM, 'PAA');
assert.strictEqual(isValidBaseQuantity('1'), true);
assert.strictEqual(isValidBaseQuantity('99999'), true);
assert.strictEqual(isValidBaseQuantity('0'), false);
assert.strictEqual(isValidBaseQuantity('100000'), false);
assert.strictEqual(isValidBaseQuantity('1.5'), false);
assert.strictEqual(sanitizeBaseQuantityInput('12abc3456'), '12345');
assert.strictEqual(validateField('baseQty', '0', true).valid, false);
assert.strictEqual(validateField('baseQty', '0', true).error, 'Base quantity must be a whole number from 1 to 99999');
assert.strictEqual(validateField('baseQty', '', true).valid, false);
assert.strictEqual(validateField('baseQty', '', true).error, 'Base quantity must be a whole number from 1 to 99999');
assert.strictEqual(validateField('baseQty', '1', true).valid, true);

console.log('   ✓ validateField handles required, minLength, maxLength, date, and quantity');

console.log('============================================================');
console.log('  ALL FIELD VALIDATION RULES TESTS PASSED (100%)            ');
console.log('============================================================');
