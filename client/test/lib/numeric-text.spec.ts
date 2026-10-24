import { describe, expect, it } from 'vitest';
import { decimalText, digitsOnly, parseRounds } from '@/lib/numeric-text';

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

describe('parseRounds', () => {
  it.each([
    ['', 0],
    ['  ', 0],
    ['0', 0],
    ['2', 2],
    [' 3 ', 3],
    ['99', 99],
  ])('"%s" is %s rounds', (typed, rounds) => {
    expect(parseRounds(typed)).toBe(rounds);
  });

  it.each(['100', '-1', '2,5', '2.5', 'abc', '1e2'])('"%s" is invalid', (typed) => {
    expect(parseRounds(typed)).toBe('invalid');
  });
});
