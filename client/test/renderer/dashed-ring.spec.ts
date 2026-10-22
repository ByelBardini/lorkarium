import { describe, expect, it } from 'vitest';
import { dashedRingArcs } from '@/renderer/dashed-ring';

describe('dashedRingArcs', () => {
  it('a ring of radius 10 with dashes and gaps of 4 is dashed over half its length, inside one turn', () => {
    const arcs = dashedRingArcs(10, 4, 4);
    const drawn = arcs.reduce((sum, { start, end }) => sum + (end - start) * 10, 0);
    expect(drawn).toBeCloseTo(Math.PI * 10);
    expect(arcs.every(({ start, end }) => start >= 0 && end <= 2 * Math.PI && end > start)).toBe(
      true,
    );
  });

  it('a ring of radius 0 has no dash', () => {
    expect(dashedRingArcs(0, 4, 4)).toEqual([]);
  });
});
