import { describe, expect, it } from 'vitest';
import { continueDiceRoll, startDiceRoll, type DiceRollResult } from '../../src/dice-roll';
import { countNaturalTwenties } from '../../src/dice/natural-twenty';

function rolled(expressions: string[], values: number[]): DiceRollResult {
  const step = continueDiceRoll(expectPending(startDiceRoll(expressions)), values);
  if (step.kind !== 'done') throw new Error(`Expected a finished roll, got ${step.kind}`);
  return step.result;
}

function expectPending(step: ReturnType<typeof startDiceRoll>) {
  if (step.kind !== 'pending') throw new Error(`Expected a pending roll, got ${step.kind}`);
  return step.state;
}

describe('countNaturalTwenties', () => {
  it('counts a d20 that lands on 20', () => {
    expect(countNaturalTwenties(rolled(['1d20+5'], [20]))).toBe(1);
  });

  it('counts both 20s of an advantage roll, the dropped die included', () => {
    expect(countNaturalTwenties(rolled(['2d20kh1'], [20, 20]))).toBe(2);
  });

  it('ignores a d6 on its highest face', () => {
    expect(countNaturalTwenties(rolled(['1d6'], [6]))).toBe(0);
  });

  it('ignores a d100 showing 20', () => {
    expect(countNaturalTwenties(rolled(['1d100'], [20]))).toBe(0);
  });

  it('is zero for a roll without a d20', () => {
    expect(countNaturalTwenties(rolled(['2d8', '3'], [8, 8]))).toBe(0);
  });
});
