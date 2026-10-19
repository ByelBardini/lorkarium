import { describe, expect, it } from 'vitest';
import { barSegments } from '@/renderer/token-bar';

const WIDTH = 100;

describe('barSegments', () => {
  it('a normal bar is the track and the fill up to its fraction', () => {
    const bar = { fraction: 0.5, state: 'normal', excess: 0 } as const;
    expect(barSegments(bar, WIDTH)).toEqual([
      { tone: 'track', left: 0, width: 100 },
      { tone: 'fill', left: 0, width: 50 },
    ]);
  });

  it('an empty bar is only the track', () => {
    const bar = { fraction: 0, state: 'normal', excess: 0 } as const;
    expect(barSegments(bar, WIDTH)).toEqual([{ tone: 'track', left: 0, width: 100 }]);
  });

  it('below zero, the negative bar grows from the left on the empty track', () => {
    const bar = { fraction: 0, state: 'negative', excess: 0.25 } as const;
    expect(barSegments(bar, WIDTH)).toEqual([
      { tone: 'track', left: 0, width: 100 },
      { tone: 'negative', left: 0, width: 25 },
    ]);
  });

  it('above the maximum, the over bar grows from the left on top of the full fill', () => {
    const bar = { fraction: 1, state: 'over', excess: 0.4 } as const;
    expect(barSegments(bar, WIDTH)).toEqual([
      { tone: 'track', left: 0, width: 100 },
      { tone: 'fill', left: 0, width: 100 },
      { tone: 'over', left: 0, width: 40 },
    ]);
  });
});
