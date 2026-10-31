import { describe, expect, it } from 'vitest';
import { sceneCenterOf } from '@/lib/hero-scene';

describe('sceneCenterOf', () => {
  it('puts a one-cell token in the middle of its cell', () => {
    expect(sceneCenterOf({ col: 16, row: 10, size: 1 })).toEqual({ cx: 1056, cy: 672 });
  });

  it('puts a 2×2 token on the crossing of its four cells', () => {
    expect(sceneCenterOf({ col: 18, row: 6, size: 2 })).toEqual({ cx: 1216, cy: 448 });
  });

  it.each([
    [{ col: 1.5, row: 2, size: 1 }, 'col'],
    [{ col: 1, row: -1, size: 1 }, 'row'],
    [{ col: 1, row: 2, size: 0 }, 'size'],
  ])('refuses a placement off the grid (%o) naming %s', (placement, field) => {
    expect(() => sceneCenterOf(placement)).toThrow(new RegExp(`${field}.*non-negative integer`));
  });
});
