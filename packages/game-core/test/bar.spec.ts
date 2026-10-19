import { describe, expect, it } from 'vitest';
import { adjustBarValues, applyBarChange } from '../src/bar';

const LIMIT = 99_999;

describe('applyBarChange', () => {
  it('adding -7 to 32 gives 25', () => {
    expect(applyBarChange(32, { op: 'add', amount: -7 }, LIMIT)).toBe(25);
  });

  it('setting 12 gives 12 whatever the current value', () => {
    expect(applyBarChange(32, { op: 'set', value: 12 }, LIMIT)).toBe(12);
  });

  it('a bar may go negative: 3 minus 10 is -7', () => {
    expect(applyBarChange(3, { op: 'add', amount: -10 }, LIMIT)).toBe(-7);
  });

  it('a bar may go above any maximum: nothing here knows the maximum', () => {
    expect(applyBarChange(40, { op: 'add', amount: 20 }, LIMIT)).toBe(60);
  });

  it.each([
    [99_990, { op: 'add', amount: 50 }, 99_999],
    [-99_990, { op: 'add', amount: -50 }, -99_999],
    [0, { op: 'set', value: 200_000 }, 99_999],
  ] as const)('from %s, %o stops at the limit %s', (current, change, expected) => {
    expect(applyBarChange(current, change, LIMIT)).toBe(expected);
  });

  it.each([
    [{ op: 'add', amount: 1.5 }, '1.5'],
    [{ op: 'set', value: Number.NaN }, 'NaN'],
  ] as const)('%o is refused citing the value and "inteiro"', (change, shown) => {
    expect(() => applyBarChange(10, change, LIMIT)).toThrow(new RegExp(`${shown}.*inteiro`));
  });
});

describe('adjustBarValues', () => {
  it('a current change keeps the maximum: 32/45 minus 7 is 25/45', () => {
    const bar = { current: 32, max: 45 };
    expect(adjustBarValues(bar, { op: 'add', amount: -7 }, LIMIT)).toEqual({
      current: 25,
      max: 45,
    });
  });

  it('a new maximum keeps the current, even when it ends above it: 40/45 to max 30 is 40/30', () => {
    const bar = { current: 40, max: 45 };
    expect(adjustBarValues(bar, { op: 'max', value: 30 }, LIMIT)).toEqual({ current: 40, max: 30 });
  });

  it.each([0, -3, 1.5, 100_000])('a maximum of %s is refused citing it and "1 to"', (value) => {
    const bar = { current: 10, max: 10 };
    const change = { op: 'max', value } as const;
    expect(() => adjustBarValues(bar, change, LIMIT)).toThrow(new RegExp(`${value}.*1 to 99999`));
  });
});
