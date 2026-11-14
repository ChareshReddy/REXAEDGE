import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatWarnings, formatNotes, formatMarcNote, isMarcExtensionMessage } from './warningUtils.js';

describe('formatWarnings utility', () => {
  it('converts simple strings cleanly', () => {
    const input = ['Component quantity is zero', 'Component missing'];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component quantity is zero', 'Component missing']);
  });

  it('converts { message } objects into readable text', () => {
    const input = [{ message: 'Storage location PR67 is not valid' }];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Storage location PR67 is not valid']);
  });

  it('converts { text } objects (from backend engine) into readable text', () => {
    const input = [{ text: 'Component unit mismatch with MARA definition', type: 'warning' }];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component unit mismatch with MARA definition']);
  });

  it('converts { code, message } into combined readable line without duplicate code', () => {
    const input = [
      { code: 'W_LOC_01', message: 'Storage location not in plant' },
      { code: 'W_LOC_02', message: 'W_LOC_02: Already contains code' }
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, [
      'W_LOC_01: Storage location not in plant',
      'W_LOC_02: Already contains code'
    ]);
  });

  it('handles nested warnings structures', () => {
    const input = {
      warnings: [
        { message: 'Nested warning 1' },
        { details: [{ text: 'Deeply nested warning 2' }] }
      ]
    };
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Nested warning 1', 'Deeply nested warning 2']);
  });

  it('drops empty items, null, undefined and [object Object] artifacts', () => {
    const input = [
      '',
      '   ',
      null,
      undefined,
      {},
      '[object Object]',
      'Some text with [object Object]',
      { message: '' },
      { text: '   ' },
      { message: 'Valid warning message' }
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Valid warning message']);
  });

  it('filters out noise and purely informational messages (including MARC notes)', () => {
    const input = [
      'Pre-flight passed',
      'Simulation successful',
      'Ready for creation',
      'Ready for creation (2 warnings)',
      { type: 'info', message: 'General info note' },
      { severity: 'success', text: 'Pre-flight verified' },
      { message: 'Component "D4PSB001B" is not extended to plant 1010 (MARC)' },
      { message: 'Storage location PR67 is not valid for plant 1010' }
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Storage location PR67 is not valid for plant 1010']);
  });

  it('deduplicates identical warning messages', () => {
    const input = [
      'Component not found',
      { message: 'Component not found' },
      { text: 'Component not found' },
      'Another warning'
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component not found', 'Another warning']);
  });
});

describe('formatNotes and MARC classification', () => {
  it('correctly identifies MARC plant extension messages as info notes', () => {
    assert.strictEqual(isMarcExtensionMessage('Header material "A1PSB001B" is not extended to plant 1010 (MARC)'), true);
    assert.strictEqual(isMarcExtensionMessage('Component "D4PSB001B" is not extended to plant 1010 (MARC)'), true);
    assert.strictEqual(isMarcExtensionMessage('A1PSB001B is not extended to plant 1010 (MARC)'), true);
    assert.strictEqual(isMarcExtensionMessage('Storage location PR67 is not valid for plant 1010'), false);
  });

  it('formats MARC messages cleanly as informational notes', () => {
    assert.strictEqual(
      formatMarcNote('Header material "A1PSB001B" is not extended to plant 1010 (MARC)'),
      'Note: A1PSB001B is not extended to plant 1010 (MARC).'
    );
    assert.strictEqual(
      formatMarcNote('Component "D4PSB001B" is not extended to plant 1010 (MARC)'),
      'Note: D4PSB001B is not extended to plant 1010 (MARC).'
    );
  });

  it('extracts and formats notes while excluding real warnings', () => {
    const mixed = [
      { text: 'Header material "A1PSB001B" is not extended to plant 1010 (MARC)', type: 'info' },
      { message: 'Storage location PR67 is not valid for plant 1010' },
      'Component "D4PSB001B" is not extended to plant 1010 (MARC)'
    ];

    const notes = formatNotes(mixed);
    assert.deepStrictEqual(notes, [
      'Note: A1PSB001B is not extended to plant 1010 (MARC).',
      'Note: D4PSB001B is not extended to plant 1010 (MARC).'
    ]);

    const warnings = formatWarnings(mixed);
    assert.deepStrictEqual(warnings, [
      'Storage location PR67 is not valid for plant 1010'
    ]);
  });
});
