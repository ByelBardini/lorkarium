import { describe, expect, it } from 'vitest';
import { boxFits, drawingBox, translateBox } from '../src/drawing-box.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

describe('drawingBox', () => {
  it('a box in fractional cells keeps its corner and size, frozen', () => {
    const box = drawingBox(2.5, 1, 3, 2);
    expect(box).toEqual({ x: 2.5, y: 1, width: 3, height: 2 });
    expect(Object.isFrozen(box)).toBe(true);
  });

  it('a zero width with some height is a straight freehand line and is accepted', () => {
    expect(drawingBox(4, 4, 0, 3)).toEqual({ x: 4, y: 4, width: 0, height: 3 });
  });

  it('the scene origin is a valid corner', () => {
    expect(drawingBox(0, 0, 1, 1)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it.each([
    ['x', -0.01, 0, 1, 1],
    ['y', 0, -2, 1, 1],
    ['width', 0, 0, -1, 1],
    ['height', 0, 0, 1, -0.5],
  ])(
    'a negative %s (%s, %s, %s, %s) is refused citing the axis and the value',
    (axis, x, y, w, h) => {
      expect(() => drawingBox(x, y, w, h)).toThrow(new RegExp(`${axis} -.*número finito ≥ 0`));
    },
  );

  it.each([
    ['width', Number.NaN, 'NaN'],
    ['width', Number.POSITIVE_INFINITY, 'Infinity'],
  ])('a %s of %s is refused as not a finite number ≥ 0', (axis, value, shown) => {
    expect(() => drawingBox(0, 0, value, 1)).toThrow(
      new RegExp(`${axis} ${shown}.*número finito ≥ 0`),
    );
  });
});

describe('boxFits', () => {
  it('a box touching the far edge of the scene fits', () => {
    expect(boxFits(SCENE_20_BY_12, drawingBox(17, 10, 3, 2))).toBe(true);
  });

  it('a box one hundredth past the right edge does not fit', () => {
    expect(boxFits(SCENE_20_BY_12, drawingBox(17.01, 0, 3, 2))).toBe(false);
  });

  it('a box past the bottom edge does not fit', () => {
    expect(boxFits(SCENE_20_BY_12, drawingBox(0, 11, 1, 1.5))).toBe(false);
  });

  it('hundredths that sum exactly to the edge fit despite floating point (19.9 + 0.1)', () => {
    expect(boxFits(SCENE_20_BY_12, drawingBox(19.9, 11.9, 0.1, 0.1))).toBe(true);
  });
});

describe('translateBox', () => {
  it('moving a box returns a new box and leaves the original untouched', () => {
    const original = drawingBox(2, 3, 2, 2);
    const moved = translateBox(original, 1.5, -1);
    expect(moved).toEqual({ x: 3.5, y: 2, width: 2, height: 2 });
    expect(original).toEqual({ x: 2, y: 3, width: 2, height: 2 });
  });

  it('a move that ends before the scene origin is refused citing the axis', () => {
    expect(() => translateBox(drawingBox(1, 1, 1, 1), -2, 0)).toThrow(/x -1/);
  });
});
