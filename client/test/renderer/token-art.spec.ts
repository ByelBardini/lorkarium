import { describe, expect, it } from 'vitest';
import { artBox, flipSigns } from '@/renderer/token-art';

const PORTRAIT = { width: 400, height: 600 };
const SQUARE_64 = { width: 64, height: 64 };

describe('artBox', () => {
  it('a square frame fits a 400×600 image whole in 64 px: 42.67 × 64, centered', () => {
    const box = artBox('square', PORTRAIT, SQUARE_64);

    expect(box.width).toBeCloseTo(42.67, 2);
    expect(box.height).toBe(64);
    expect(box.x).toBeCloseTo(10.67, 2);
    expect(box.y).toBe(0);
  });

  it('a round frame covers the token with the same image: 64 × 96, 16 px above', () => {
    expect(artBox('round', PORTRAIT, SQUARE_64)).toEqual({ x: 0, y: -16, width: 64, height: 96 });
  });

  it('a square image fills a square token exactly', () => {
    expect(artBox('square', { width: 1024, height: 1024 }, { width: 128, height: 128 })).toEqual({
      x: 0,
      y: 0,
      width: 128,
      height: 128,
    });
  });
});

describe('artBox on a stretched token', () => {
  it('a square image on a 128 × 64 token stretches with it (a side handle stretches the image)', () => {
    const box = artBox('square', { width: 512, height: 512 }, { width: 128, height: 64 });
    expect(box).toEqual({ x: 0, y: 0, width: 128, height: 64 });
  });

  it('a 400×600 portrait on a 128 × 128 token keeps its proportion, centered', () => {
    const box = artBox('square', PORTRAIT, { width: 128, height: 128 });
    expect(box.width).toBeCloseTo(85.33, 2);
    expect(box.height).toBe(128);
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
