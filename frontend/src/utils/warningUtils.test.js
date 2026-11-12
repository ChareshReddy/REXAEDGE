import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatWarnings } from './warningUtils.js';

describe('formatWarnings utility', () => {
  it('converts simple strings cleanly', () => {
    const input = ['Header material is not extended', 'Component missing'];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Header material is not extended', 'Component missing']);
  });

  it('converts { message } objects into readable text', () => {
    const input = [{ message: 'Storage location PR67 is not valid' }];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Storage location PR67 is not valid']);
  });

  it('converts { text } objects (from backend engine) into readable text', () => {
    const input = [{ text: 'Component D4PSB001B is not extended to plant 1010 (MARC)', type: 'warning' }];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component D4PSB001B is not extended to plant 1010 (MARC)']);
  });

  it('converts { code, message } into combined readable line without duplicate code', () => {
    const input = [
      { code: 'W_MARC_01', message: 'Header not in plant' },
      { code: 'W_MARC_02', message: 'W_MARC_02: Already contains code' }
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, [
      'W_MARC_01: Header not in plant',
      'W_MARC_02: Already contains code'
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

  it('filters out noise and purely informational messages', () => {
    const input = [
      'Pre-flight passed',
      'Simulation successful',
      'Ready for creation',
      'Ready for creation (2 warnings)',
      { type: 'info', message: 'General info note' },
      { severity: 'success', text: 'Pre-flight verified' },
      { message: 'Component "D4PSB001B" is not extended to plant 1010 (MARC)' }
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component "D4PSB001B" is not extended to plant 1010 (MARC)']);
  });

  it('deduplicates identical warning messages', () => {
    const input = [
      'Component not extended',
      { message: 'Component not extended' },
      { text: 'Component not extended' },
      'Another warning'
    ];
    const result = formatWarnings(input);
    assert.deepStrictEqual(result, ['Component not extended', 'Another warning']);
  });
});
