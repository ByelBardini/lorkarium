import { describe, expect, it } from 'vitest';
import { decimalText, digitsOnly } from '@/lib/numeric-text';

describe('digitsOnly', () => {
  it.each([
    ['2a1', '21'],
    ['-3', '3'],
    ['1,5', '15'],
    ['', ''],
  ])('"%s" keeps "%s"', (typed, kept) => {
    expect(digitsOnly(typed)).toBe(kept);
  });
});

describe('decimalText', () => {
  it.each([
    ['1,5', '1,5'],
    ['1.5', '1.5'],
    ['1,5,2', '1,52'],
    ['1,,5a', '1,5'],
    ['-2e3', '23'],
    [',5', ',5'],
    ['', ''],
  ])('"%s" keeps "%s"', (typed, kept) => {
    expect(decimalText(typed)).toBe(kept);
  });
});
