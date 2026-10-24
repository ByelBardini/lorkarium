import { describe, expect, it } from 'vitest';
import { COVER_DRAWINGS, COVER_TONES, defaultCoverOf } from '../src/campaign-cover';

const ANA_ID = '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01';

describe('defaultCoverOf', () => {
  // stableHash(ANA_ID) = 2853121278: % 3 = 0 (drawing), % 4 = 2 → tone 3.
  it('draws the drawing and the tone from the id hash', () => {
    expect(defaultCoverOf(ANA_ID)).toEqual({ drawing: 0, tone: 3 });
  });

  it('gives the same cover for the same id', () => {
    expect(defaultCoverOf(ANA_ID)).toEqual(defaultCoverOf(ANA_ID));
  });

  it.each(['', 'a', 'mesa', ANA_ID])('keeps %j inside the drawings and tones', (id) => {
    const cover = defaultCoverOf(id);
    expect(cover.drawing).toBeGreaterThanOrEqual(0);
    expect(cover.drawing).toBeLessThan(COVER_DRAWINGS);
    expect(cover.tone).toBeGreaterThanOrEqual(1);
    expect(cover.tone).toBeLessThanOrEqual(COVER_TONES);
  });
});
