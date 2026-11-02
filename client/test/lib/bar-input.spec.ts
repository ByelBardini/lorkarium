import { describe, expect, it } from 'vitest';
import { parseBarInput, parseBarMax, parseBarTemp } from '@/lib/bar-input';

describe('parseBarInput', () => {
  it.each([
    ['-7', { op: 'add', amount: -7 }],
    ['−7', { op: 'add', amount: -7 }],
    ['+5', { op: 'add', amount: 5 }],
    ['12', { op: 'set', value: 12 }],
    [' 12 ', { op: 'set', value: 12 }],
    ['0', { op: 'set', value: 0 }],
  ] as const)('"%s" is %o', (text, change) => {
    expect(parseBarInput(text)).toEqual({ kind: 'change', change });
  });

  it.each(['', '  ', 'abc', '1,5', '1.5', '--3', '+'])('"%s" is invalid', (text) => {
    expect(parseBarInput(text)).toEqual({ kind: 'invalid' });
  });
});

describe('parseBarMax', () => {
  it.each([
    ['50', 50],
    [' 1 ', 1],
    ['99999', 99_999],
  ])('"%s" is the maximum %s', (text, max) => {
    expect(parseBarMax(text)).toBe(max);
  });

  it.each(['', '0', '-5', '+5', '2,5', '100000', 'abc'])('"%s" is not a maximum', (text) => {
    expect(parseBarMax(text)).toBeNull();
  });
});

describe('parseBarTemp', () => {
  it.each([
    ['5', 5],
    [' 0 ', 0],
    ['', 0],
    ['99999', 99_999],
  ])('"%s" is the temp %s', (text, temp) => {
    expect(parseBarTemp(text)).toBe(temp);
  });

  it.each(['-5', '+5', '2,5', '100000', 'abc'])('"%s" is not a temp', (text) => {
    expect(parseBarTemp(text)).toBeNull();
  });
});
