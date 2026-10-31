import { describe, expect, it } from 'vitest';
import { pickThrow, throwSettleMsOf, throwTotalOf } from '@/lib/recorded-throw-play';
import { recordedThrow } from '../support/recorded-throw-factory';
import { UnitRandomFake } from '../support/unit-random-fake';

const THREE = [recordedThrow([17]), recordedThrow([3]), recordedThrow([20])];

describe('pickThrow', () => {
  it('the same random value always picks the same throw', () => {
    const first = pickThrow(THREE, new UnitRandomFake([0.4]).next, null);
    const second = pickThrow(THREE, new UnitRandomFake([0.4]).next, null);

    expect(first).toEqual({ index: 1, recorded: THREE[1] });
    expect(second).toEqual(first);
  });

  it('never repeats the previous throw when there is more than one', () => {
    const sweep = Array.from({ length: 100 }, (_, step) => step / 100);
    const picked = new Set(sweep.map((value) => pickThrow(THREE, () => value, 1).index));

    expect([...picked].sort()).toEqual([0, 2]);
  });

  it('a single throw is picked again, the only one there is', () => {
    const only = [recordedThrow()];

    expect(pickThrow(only, new UnitRandomFake([0.9]).next, 0)).toEqual({
      index: 0,
      recorded: only[0],
    });
  });

  it('an empty list is refused with the shape expected', () => {
    expect(() => pickThrow([], new UnitRandomFake([0.1]).next, null)).toThrow(
      'Cannot pick from 0 recorded throws: expected at least 1.',
    );
  });
});

describe('throwTotalOf', () => {
  it('adds the faces every model stopped on', () => {
    expect(throwTotalOf(recordedThrow([17, 4]))).toBe(21);
  });
});

describe('throwSettleMsOf', () => {
  it('waits for the last model to settle', () => {
    const recorded = recordedThrow([17, 4]);
    const [first, second] = recorded.throw.models;
    if (!first || !second) throw new Error('fixture: expected two models');
    const late = {
      ...recorded,
      throw: { ...recorded.throw, models: [first, { ...second, settleMs: 2900 }] },
    };

    expect(throwSettleMsOf(late)).toBe(2900);
  });
});
