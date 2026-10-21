import { describe, expect, it } from 'vitest';
import { parseInitiative } from '@/lib/initiative-text';

describe('parseInitiative', () => {
  it.each([
    ['18', 18],
    ['−2', -2],
    ['-2', -2],
    [' 7 ', 7],
    ['999', 999],
  ])('%j is %i', (text, value) => {
    expect(parseInitiative(text)).toBe(value);
  });

  it.each(['', '  '])('%j is no initiative (null)', (text) => {
    expect(parseInitiative(text)).toBeNull();
  });

  it.each(['1000', '2,5', 'abc', '+-3'])('%j is invalid', (text) => {
    expect(parseInitiative(text)).toBe('invalid');
  });
});
