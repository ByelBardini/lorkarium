import { describe, expect, it } from 'vitest';
import {
  ROUND_CYCLE_PHASES_MAX,
  ROUND_CYCLE_PHASES_MIN,
  roundCyclePhases,
} from '../src/round-cycle-phases.vo';

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `phase-${i}`);

describe('roundCyclePhases', () => {
  it('2 to 12 distinct phases are kept in order', () => {
    expect(roundCyclePhases(['nova', 'cheia'])).toEqual(['nova', 'cheia']);
    expect(roundCyclePhases(ids(12))).toHaveLength(12);
    expect([ROUND_CYCLE_PHASES_MIN, ROUND_CYCLE_PHASES_MAX]).toEqual([2, 12]);
  });

  it.each([0, 1, 13])('%s phases are refused citing the count and the range', (count) => {
    expect(() => roundCyclePhases(ids(count))).toThrow(
      new RegExp(`got ${count} phases.*expected 2–12 phases`),
    );
  });

  it('a repeated phase is refused citing its id', () => {
    expect(() => roundCyclePhases(['nova', 'cheia', 'nova'])).toThrow(/phase nova.*more than once/);
  });
});
