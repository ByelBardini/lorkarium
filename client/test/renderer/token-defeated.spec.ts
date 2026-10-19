import { describe, expect, it } from 'vitest';
import { defeatedCross } from '@/renderer/token-defeated';

describe('defeatedCross', () => {
  it('on a 64 px token, two strokes cross at the center, reaching past the disc', () => {
    const cross = defeatedCross({ width: 64, height: 64 });

    expect(cross.strokes).toEqual([
      [
        { x: 6.4, y: 6.4 },
        { x: 57.6, y: 57.6 },
      ],
      [
        { x: 57.6, y: 6.4 },
        { x: 6.4, y: 57.6 },
      ],
    ]);
    expect(cross.width).toBeCloseTo(7.68, 2);
  });

  it('a stretched 128 × 64 token gets a stretched cross, as thick as its short side asks', () => {
    const cross = defeatedCross({ width: 128, height: 64 });

    expect(cross.strokes[0]).toEqual([
      { x: 12.8, y: 6.4 },
      { x: 115.2, y: 57.6 },
    ]);
    expect(cross.width).toBeCloseTo(7.68, 2);
  });

  it('a half cell token keeps a stroke thick enough to read', () => {
    expect(defeatedCross({ width: 16, height: 16 }).width).toBe(3);
  });
});
