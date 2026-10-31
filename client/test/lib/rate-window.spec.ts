import { describe, expect, it } from 'vitest';
import { admitInWindow } from '@/lib/rate-window';

const TEN_IN_TEN_SECONDS = { limit: 10, windowMs: 10_000 };
const tenRolls = Array.from({ length: 10 }, (_, index) => index * 500);

describe('admitInWindow', () => {
  it('the tenth event inside the window is admitted and counted', () => {
    const answer = admitInWindow(tenRolls.slice(0, 9), 4500, TEN_IN_TEN_SECONDS);
    expect(answer).toEqual({ admitted: true, stamps: tenRolls });
  });

  it('an eleventh event inside the window is refused and not counted', () => {
    const answer = admitInWindow(tenRolls, 9999, TEN_IN_TEN_SECONDS);
    expect(answer).toEqual({ admitted: false, stamps: tenRolls });
  });

  it('an event exactly windowMs after the oldest admits again, dropping the oldest', () => {
    const answer = admitInWindow(tenRolls, 10_000, TEN_IN_TEN_SECONDS);
    expect(answer).toEqual({ admitted: true, stamps: [...tenRolls.slice(1), 10_000] });
  });

  it('stamps older than the window are forgotten', () => {
    const answer = admitInWindow([0, 1000], 30_000, { limit: 1, windowMs: 10_000 });
    expect(answer).toEqual({ admitted: true, stamps: [30_000] });
  });

  it.each([
    ['a zero limit', { limit: 0, windowMs: 1000 }],
    ['a fractional limit', { limit: 1.5, windowMs: 1000 }],
    ['an empty window', { limit: 1, windowMs: 0 }],
  ])('%s is refused with a RangeError citing the rule', (_, rule) => {
    expect(() => admitInWindow([], 0, rule)).toThrow(
      /Invalid rate window .*expected an integer limit/,
    );
  });
});
