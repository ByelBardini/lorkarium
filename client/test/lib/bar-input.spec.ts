import { describe, expect, it } from 'vitest';
import { parseBarInput } from '@/lib/bar-input';

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
