import { describe, expect, it } from 'vitest';
import { frameBoxOf } from '../../../src/infrastructure/image-processor/frame-box';

const WIDE = { width: 1000, height: 500 };
const SQUARE = { width: 1, height: 1 };
const BANNER = { width: 3, height: 1 };

describe('frameBoxOf', () => {
  it('a square crop of the middle half of a 1000×500 image is its own 500×500 box', () => {
    const crop = { x: 25, y: 0, w: 50, h: 100 };

    expect(frameBoxOf(WIDE, SQUARE, crop)).toEqual({ left: 250, top: 0, width: 500, height: 500 });
  });

  it('with no crop a 3:1 box is centred in the whole 1000×500 image', () => {
    expect(frameBoxOf(WIDE, BANNER, null)).toEqual({ left: 0, top: 83, width: 1000, height: 333 });
  });

  it('with no crop a 1:1 box is centred across a 1000×500 image', () => {
    expect(frameBoxOf(WIDE, SQUARE, null)).toEqual({ left: 250, top: 0, width: 500, height: 500 });
  });

  it('a crop rounded a pixel past the right edge gives the largest 1:1 box inside the image', () => {
    const crop = { x: 49.9, y: 0, w: 50.2, h: 100 };

    expect(frameBoxOf(WIDE, SQUARE, crop)).toEqual({ left: 499, top: 0, width: 500, height: 500 });
  });

  it('a 0.1 % crop of a 1000×1 image is still a 1×1 box, never empty', () => {
    const crop = { x: 0, y: 0, w: 0.1, h: 0.1 };

    expect(frameBoxOf({ width: 1000, height: 1 }, SQUARE, crop)).toEqual({
      ...{ left: 0, top: 0 },
      ...{ width: 1, height: 1 },
    });
  });

  it('a 3:1 box in a 1×1000 image keeps at least 1 px of height', () => {
    expect(frameBoxOf({ width: 1, height: 1000 }, BANNER, null)).toEqual({
      ...{ left: 0, top: 499 },
      ...{ width: 1, height: 1 },
    });
  });

  it('a crop that starts at the far edge still keeps the last pixel', () => {
    const crop = { x: 100, y: 100, w: 0, h: 0 };

    expect(frameBoxOf(WIDE, SQUARE, crop)).toEqual({ left: 999, top: 499, width: 1, height: 1 });
  });
});
