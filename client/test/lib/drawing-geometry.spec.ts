import { describe, expect, it } from 'vitest';
import {
  boxTouches,
  clampToScene,
  hitsDrawing,
  shapeBox,
  simplifyPath,
  sketchOf,
  type DrawingGeometry,
} from '@/lib/drawing-geometry';

const SCENE = { widthCells: 20, heightCells: 12 };

describe('shapeBox', () => {
  it('a drag from (1, 1) to (3, 4) is the box of its two corners', () => {
    expect(shapeBox({ x: 1, y: 1 }, { x: 3, y: 4 }, false)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 3,
    });
  });

  it('a drag up and to the left is normalized to the same box', () => {
    expect(shapeBox({ x: 3, y: 4 }, { x: 1, y: 1 }, false)).toEqual({
      x: 1,
      y: 1,
      width: 2,
      height: 3,
    });
  });

  it('with Shift every edge snaps to the nearest half cell', () => {
    expect(shapeBox({ x: 1.2, y: 0.9 }, { x: 3.4, y: 2.8 }, true)).toEqual({
      x: 1,
      y: 1,
      width: 2.5,
      height: 2,
    });
  });

  it('without Shift the corners keep their hundredths', () => {
    expect(shapeBox({ x: 1.234, y: 1 }, { x: 2, y: 2.5 }, false)).toEqual({
      x: 1.23,
      y: 1,
      width: 0.77,
      height: 1.5,
    });
  });

  it('a drag of no size makes no shape', () => {
    expect(shapeBox({ x: 2, y: 2 }, { x: 2, y: 2 }, false)).toBeNull();
  });

  it('a drag along one line only (no height) makes no fixed shape', () => {
    expect(shapeBox({ x: 1, y: 2 }, { x: 4, y: 2 }, false)).toBeNull();
  });
});

describe('simplifyPath', () => {
  it('200 points on one straight line keep only the two ends', () => {
    const line = Array.from({ length: 200 }, (_, index) => ({ x: index / 10, y: index / 20 }));

    expect(simplifyPath(line, 0.05)).toEqual([
      { x: 0, y: 0 },
      { x: 19.9, y: 9.95 },
    ]);
  });

  it('a corner farther than the tolerance is kept', () => {
    const corner = [
      { x: 0, y: 0 },
      { x: 1, y: 0.5 },
      { x: 2, y: 0 },
    ];

    expect(simplifyPath(corner, 0.05)).toEqual(corner);
  });

  it('a bump closer than the tolerance is dropped', () => {
    const bump = [
      { x: 0, y: 0 },
      { x: 1, y: 0.01 },
      { x: 2, y: 0 },
    ];

    expect(simplifyPath(bump, 0.05)).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
  });
});

describe('sketchOf', () => {
  it('a freehand sketch is its simplified points relative to the corner of its box', () => {
    const points = [
      { x: 2, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 3.5 },
    ];

    expect(sketchOf('freehand', points, false)).toEqual({
      kind: 'freehand',
      x: 2,
      y: 3,
      width: 2,
      height: 1,
      points: [
        [0, 0],
        [1, 1],
        [2, 0.5],
      ],
    });
  });

  it('a freehand sketch never snaps, even with Shift', () => {
    const points = [
      { x: 1.2, y: 1.1 },
      { x: 2.3, y: 1.9 },
    ];

    expect(sketchOf('freehand', points, true)).toMatchObject({ x: 1.2, y: 1.1 });
  });

  it('a rectangle sketch is the box from the first to the last point', () => {
    const points = [
      { x: 1, y: 1 },
      { x: 5, y: 5 },
      { x: 3, y: 4 },
    ];

    expect(sketchOf('rectangle', points, false)).toEqual({
      kind: 'rectangle',
      x: 1,
      y: 1,
      width: 2,
      height: 3,
    });
  });

  it('a press with no move draws nothing', () => {
    expect(sketchOf('freehand', [{ x: 2, y: 2 }], false)).toBeNull();
    expect(sketchOf('ellipse', [{ x: 2, y: 2 }], false)).toBeNull();
  });
});

describe('clampToScene', () => {
  it('a point past the edge is brought back onto it, so no box leaves the scene', () => {
    expect(clampToScene({ x: 23, y: -1 }, SCENE)).toEqual({ x: 20, y: 0 });
  });

  it('a point inside the scene stays where it is', () => {
    expect(clampToScene({ x: 4.5, y: 7 }, SCENE)).toEqual({ x: 4.5, y: 7 });
  });
});

describe('hitsDrawing', () => {
  const path: DrawingGeometry = {
    kind: 'freehand',
    x: 1,
    y: 1,
    width: 4,
    height: 0,
    points: [
      [0, 0],
      [4, 0],
    ],
  };
  const hollow: DrawingGeometry = {
    kind: 'rectangle',
    x: 2,
    y: 2,
    width: 4,
    height: 4,
    fill: null,
  };

  it('a click 0.1 cell off a freehand line hits it, 0.3 cell off does not', () => {
    expect(hitsDrawing(path, { x: 3, y: 1.1 })).toBe(true);
    expect(hitsDrawing(path, { x: 3, y: 1.3 })).toBe(false);
  });

  it('a shape with no fill is hit only near its outline, not in the middle', () => {
    expect(hitsDrawing(hollow, { x: 2.05, y: 4 })).toBe(true);
    expect(hitsDrawing(hollow, { x: 4, y: 4 })).toBe(false);
  });

  it('a filled shape is hit anywhere inside', () => {
    expect(hitsDrawing({ ...hollow, fill: 'moss' }, { x: 4, y: 4 })).toBe(true);
  });

  it('a filled ellipse is hit at its center and missed at the corner of its box', () => {
    const ellipse: DrawingGeometry = { ...hollow, kind: 'ellipse', fill: 'gold' };

    expect(hitsDrawing(ellipse, { x: 4, y: 4 })).toBe(true);
    expect(hitsDrawing(ellipse, { x: 2.2, y: 2.2 })).toBe(false);
  });

  it('a hollow ellipse is hit on its outline', () => {
    const ellipse: DrawingGeometry = { ...hollow, kind: 'ellipse' };

    expect(hitsDrawing(ellipse, { x: 4, y: 2.05 })).toBe(true);
  });

  it('a filled triangle is hit below its apex and missed at the top corners of its box', () => {
    const triangle: DrawingGeometry = { ...hollow, kind: 'triangle', fill: 'ember' };

    expect(hitsDrawing(triangle, { x: 4, y: 5 })).toBe(true);
    expect(hitsDrawing(triangle, { x: 2.3, y: 2.3 })).toBe(false);
  });
});

describe('boxTouches', () => {
  const box = { x: 2, y: 2, width: 2, height: 2 };

  it('a selection rectangle that only touches the box takes the drawing', () => {
    expect(boxTouches(box, { x: 3.5, y: 3.5, width: 5, height: 5 })).toBe(true);
  });

  it('a selection rectangle beside the box does not', () => {
    expect(boxTouches(box, { x: 5, y: 2, width: 2, height: 2 })).toBe(false);
  });

  it('a straight vertical freehand line is taken by a rectangle across it', () => {
    expect(
      boxTouches({ x: 3, y: 1, width: 0, height: 4 }, { x: 2, y: 2, width: 2, height: 1 }),
    ).toBe(true);
  });
});
