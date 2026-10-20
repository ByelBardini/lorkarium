import { describe, expect, it } from 'vitest';
import { sideRingVar } from '@/lib/token-side';

describe('sideRingVar', () => {
  it.each([
    ['ally', 'var(--label)'],
    ['enemy', 'var(--chart-3)'],
    ['neutral', 'var(--chart-2)'],
  ] as const)('the ring of an %s token is %s, the tone the canvas draws', (side, tone) => {
    expect(sideRingVar(side)).toBe(tone);
  });
});
