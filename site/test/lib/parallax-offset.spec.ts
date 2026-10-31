import { describe, expect, it } from 'vitest';
import { parallaxOffsetOf } from '@/lib/parallax-offset';

const STILL_POINTER = { x: 0, y: 0 };

describe('parallaxOffsetOf', () => {
  it('a half-deep layer scrolls half as far as the page', () => {
    const offset = parallaxOffsetOf({
      scrollY: 300,
      viewportHeight: 900,
      depth: 0.5,
      pointer: STILL_POINTER,
    });

    expect(offset).toEqual({ x: 0, y: 150 });
  });

  it.each([
    [1, 1, -24],
    [-1, 1, 24],
    [1, 0.5, -12],
    [0.5, 0.5, -6],
    [3, 0.5, -12],
    [-3, 0.5, 12],
  ])('pointer x %s on a layer of depth %s shifts it %s px', (pointerX, depth, shift) => {
    const offset = parallaxOffsetOf({
      scrollY: 0,
      viewportHeight: 900,
      depth,
      pointer: { x: pointerX, y: 1 },
    });

    expect(offset).toEqual({ x: shift, y: 0 });
  });

  it('a layer of depth 0 stays put', () => {
    const offset = parallaxOffsetOf({
      scrollY: 500,
      viewportHeight: 900,
      depth: 0,
      pointer: { x: 1, y: 1 },
    });

    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it('scrolling past the hero height stops at the deepest offset', () => {
    const offset = parallaxOffsetOf({
      scrollY: 4_000,
      viewportHeight: 900,
      depth: 0.5,
      pointer: STILL_POINTER,
    });

    expect(offset).toEqual({ x: 0, y: 450 });
  });

  it('an overscroll above the top does not lift the layer', () => {
    const offset = parallaxOffsetOf({
      scrollY: -80,
      viewportHeight: 900,
      depth: 0.5,
      pointer: STILL_POINTER,
    });

    expect(offset).toEqual({ x: 0, y: 0 });
  });

  it.each([1.5, -0.1, Number.NaN])(
    'depth %s is refused citing the value and the range',
    (depth) => {
      const offset = (): unknown =>
        parallaxOffsetOf({ scrollY: 0, viewportHeight: 900, depth, pointer: STILL_POINTER });

      expect(offset).toThrow(
        new RangeError(`parallax depth ${depth} is invalid: expected a number from 0 to 1`),
      );
    },
  );

  it.each([0, -900])('viewport height %s is refused citing the value and the shape', (height) => {
    const offset = (): unknown =>
      parallaxOffsetOf({ scrollY: 0, viewportHeight: height, depth: 0.5, pointer: STILL_POINTER });

    expect(offset).toThrow(
      new RangeError(`viewport height ${height} is invalid: expected a positive number of pixels`),
    );
  });
});
