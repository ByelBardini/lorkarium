import { describe, expect, it } from 'vitest';
import { wallSketchOf, wallVerticesOf, WALL_GLUE_DISTANCE } from '@/lib/wall-sketch';
import type { WallStyle } from '@/lib/wall-style';
import { cellDoor, grateBox, northWall } from '../support/wall-fixtures';

const SCENE = { widthCells: 20, heightCells: 12 };
const LINE: WallStyle = { kind: 'wall', shape: 'line' };

function sketch(style: WallStyle, points: { x: number; y: number }[], snap = false, vertices = []) {
  return wallSketchOf({ style, points, snap, vertices, scene: SCENE });
}

describe('wallSketchOf, the line', () => {
  it('from (2.13, 3.08) to (6.4, 3.1) without Shift keeps the points as drawn', () => {
    const pointer = [
      { x: 2.13, y: 3.08 },
      { x: 4, y: 5 },
      { x: 6.4, y: 3.1 },
    ];
    expect(sketch(LINE, pointer)).toEqual({
      kind: 'wall',
      shape: 'line',
      x: 2.13,
      y: 3.08,
      width: 4.27,
      height: 0.02,
      points: [
        [0, 0],
        [4.27, 0.02],
      ],
    });
  });

  it('with Shift the ends go to the nearest half cell: (2, 3) to (6.5, 3)', () => {
    const pointer = [
      { x: 2.13, y: 3.08 },
      { x: 6.4, y: 3.1 },
    ];
    expect(sketch(LINE, pointer, true)).toEqual({
      kind: 'wall',
      shape: 'line',
      x: 2,
      y: 3,
      width: 4.5,
      height: 0,
      points: [
        [0, 0],
        [4.5, 0],
      ],
    });
  });

  it('an end 0.15 from a vertex of another wall glues onto it; one 0.3 away stays', () => {
    const vertices = [{ x: 6, y: 2 }];
    const glued = sketch(
      LINE,
      [
        { x: 6, y: 5 },
        { x: 6.15, y: 2 },
      ],
      false,
      vertices as never,
    );
    const kept = sketch(
      LINE,
      [
        { x: 9, y: 5 },
        { x: 6.3, y: 2 },
      ],
      false,
      vertices as never,
    );

    expect(WALL_GLUE_DISTANCE).toBe(0.2);
    expect(glued).toMatchObject({ x: 6, y: 2, width: 0, height: 3 });
    expect(kept).toMatchObject({ x: 6.3, y: 2, width: 2.7, height: 3 });
  });

  it('a line of zero length is no wall', () => {
    expect(
      sketch(LINE, [
        { x: 3, y: 3 },
        { x: 3, y: 3 },
      ]),
    ).toBeNull();
  });

  it('a door is always a line, whatever shape was chosen', () => {
    const door: WallStyle = { kind: 'door', shape: 'rectangle' };
    expect(
      sketch(door, [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
      ]),
    ).toMatchObject({
      kind: 'door',
      shape: 'line',
      points: [
        [0, 0],
        [0, 1],
      ],
    });
  });
});

describe('wallSketchOf, the other shapes', () => {
  it('a freehand path whose end comes back 0.1 from its start is closed', () => {
    const pointer = [
      { x: 2, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 5 },
      { x: 2.1, y: 2 },
    ];
    const closed = sketch({ kind: 'curtain', shape: 'freehand' }, pointer);

    expect(closed).toMatchObject({ kind: 'curtain', shape: 'freehand', x: 2, y: 2 });
    const points = closed && 'points' in closed ? closed.points : [];
    expect(points.at(-1)).toEqual(points[0]);
  });

  it('a rectangle is the box of the drag, snapped to half cells with Shift', () => {
    const pointer = [
      { x: 2.2, y: 2.1 },
      { x: 5.9, y: 4.8 },
    ];
    expect(sketch({ kind: 'grate', shape: 'rectangle' }, pointer, true)).toEqual({
      kind: 'grate',
      shape: 'rectangle',
      x: 2,
      y: 2,
      width: 4,
      height: 3,
    });
  });

  it('an ellipse is the box of the drag', () => {
    const pointer = [
      { x: 1, y: 1 },
      { x: 4, y: 3 },
    ];
    expect(sketch({ kind: 'wall', shape: 'ellipse' }, pointer)).toEqual({
      kind: 'wall',
      shape: 'ellipse',
      x: 1,
      y: 1,
      width: 3,
      height: 2,
    });
  });
});

describe('wallVerticesOf', () => {
  it('lists the ends of the lines and the corners of the boxes, in cells', () => {
    expect(wallVerticesOf([northWall(), cellDoor(), grateBox()])).toEqual([
      { x: 2, y: 2 },
      { x: 6, y: 2 },
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      { x: 8, y: 3 },
      { x: 10, y: 3 },
      { x: 10, y: 5 },
      { x: 8, y: 5 },
    ]);
  });
});
