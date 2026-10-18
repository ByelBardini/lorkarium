import { describe, expect, it } from 'vitest';
import { artBox, flipSigns } from '@/renderer/token-art';

const PORTRAIT = { width: 400, height: 600 };

describe('artBox', () => {
  it('a square frame fits a 400×600 image whole in 64 px: 42.67 × 64, centered', () => {
    const box = artBox('square', PORTRAIT, 64);

    expect(box.width).toBeCloseTo(42.67, 2);
    expect(box.height).toBe(64);
    expect(box.x).toBeCloseTo(10.67, 2);
    expect(box.y).toBe(0);
  });

  it('a round frame covers the token with the same image: 64 × 96, 16 px above', () => {
    expect(artBox('round', PORTRAIT, 64)).toEqual({ x: 0, y: -16, width: 64, height: 96 });
  });

  it('a square image fills a square token exactly', () => {
    expect(artBox('square', { width: 1024, height: 1024 }, 128)).toEqual({
      x: 0,
      y: 0,
      width: 128,
      height: 128,
    });
  });
});

describe('flipSigns', () => {
  it('flipping horizontally mirrors x only', () => {
    expect(flipSigns(true, false)).toEqual({ x: -1, y: 1 });
  });

  it('no flip keeps both signs positive, and both flips mirror both', () => {
    expect(flipSigns(false, false)).toEqual({ x: 1, y: 1 });
    expect(flipSigns(true, true)).toEqual({ x: -1, y: -1 });
  });
});
