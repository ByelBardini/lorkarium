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
    const bar = { current: 32, max: 45, temp: 0 };
    expect(adjustBarValues(bar, { op: 'add', amount: -7 }, LIMIT)).toEqual({
      current: 25,
      max: 45,
      temp: 0,
    });
  });

  it('a new maximum keeps the current, even when it ends above it: 40/45 to max 30 is 40/30', () => {
    const bar = { current: 40, max: 45, temp: 3 };
    expect(adjustBarValues(bar, { op: 'max', value: 30 }, LIMIT)).toEqual({
      current: 40,
      max: 30,
      temp: 3,
    });
  });

  it.each([0, -3, 1.5, 100_000])('a maximum of %s is refused citing it and "1 to"', (value) => {
    const bar = { current: 10, max: 10, temp: 0 };
    const change = { op: 'max', value } as const;
    expect(() => adjustBarValues(bar, change, LIMIT)).toThrow(new RegExp(`${value}.*1 to 99999`));
  });

  describe('the temporary value', () => {
    const PV = { current: 20, max: 45, temp: 5 };

    it('a subtraction smaller than the temp only spends the temp: −3 on 20 +5 is 20 +2', () => {
      expect(adjustBarValues(PV, { op: 'add', amount: -3 }, LIMIT)).toEqual({ ...PV, temp: 2 });
    });

    it('a subtraction equal to the temp empties it and keeps the current: −5 on 20 +5', () => {
      expect(adjustBarValues(PV, { op: 'add', amount: -5 }, LIMIT)).toEqual({ ...PV, temp: 0 });
    });

    it('what passes the temp comes out of the current: −8 on 20 +5 is 17 +0', () => {
      expect(adjustBarValues(PV, { op: 'add', amount: -8 }, LIMIT)).toEqual({
        ...PV,
        current: 17,
        temp: 0,
      });
    });

    it('an addition goes to the current and never to the temp: +4 on 20 +5 is 24 +5', () => {
      expect(adjustBarValues(PV, { op: 'add', amount: 4 }, LIMIT)).toEqual({ ...PV, current: 24 });
    });

    it('setting the current leaves the temp: "12" on 20 +5 is 12 +5', () => {
      expect(adjustBarValues(PV, { op: 'set', value: 12 }, LIMIT)).toEqual({ ...PV, current: 12 });
    });

    it('the temp field replaces it and touches nothing else: temp 9 on 20 +5 is 20 +9', () => {
      expect(adjustBarValues(PV, { op: 'temp', value: 9 }, LIMIT)).toEqual({ ...PV, temp: 9 });
    });

    it('the temp field may empty it', () => {
      expect(adjustBarValues(PV, { op: 'temp', value: 0 }, LIMIT)).toEqual({ ...PV, temp: 0 });
    });

    it.each([-1, 1.5, 100_000])('a temp of %s is refused citing it and "0 to"', (value) => {
      const change = { op: 'temp', value } as const;
      expect(() => adjustBarValues(PV, change, LIMIT)).toThrow(new RegExp(`${value}.*0 to 99999`));
    });

    it('a broken subtraction is refused citing what came, not what the temp left of it', () => {
      const change = { op: 'add', amount: -2.5 } as const;
      expect(() => adjustBarValues(PV, change, LIMIT)).toThrow(/-2\.5.*inteiro/);
    });
  });
});
