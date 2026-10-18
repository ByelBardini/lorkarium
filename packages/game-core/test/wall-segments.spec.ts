import { describe, expect, it } from 'vitest';
import { ELLIPSE_WALL_SEGMENTS, wallSegments } from '../src/wall-segments';
import { wall } from '../src/wall.vo';

describe('wallSegments', () => {
  it('a line from (2, 2) to (6, 2) is one segment in absolute cells', () => {
    const line = wall({
      kind: 'wall',
      shape: 'line',
      x: 2,
      y: 2,
      width: 4,
      height: 0,
      points: [
        [0, 0],
        [4, 0],
      ],
      doorState: null,
    });
    expect(wallSegments(line)).toEqual([{ from: { x: 2, y: 2 }, to: { x: 6, y: 2 } }]);
  });

  it('a rectangle at (2, 2) 4 × 3 is four closed sides, the last back at (2, 2)', () => {
    const box = wall({
      kind: 'grate',
      shape: 'rectangle',
      x: 2,
      y: 2,
      width: 4,
      height: 3,
      points: null,
      doorState: null,
    });
    expect(wallSegments(box)).toEqual([
      { from: { x: 2, y: 2 }, to: { x: 6, y: 2 } },
      { from: { x: 6, y: 2 }, to: { x: 6, y: 5 } },
      { from: { x: 6, y: 5 }, to: { x: 2, y: 5 } },
      { from: { x: 2, y: 5 }, to: { x: 2, y: 2 } },
    ]);
  });

  it('an ellipse at (0, 0) 4 × 2 is 32 segments on the ellipse, closing on the first vertex', () => {
    const round = wall({
      kind: 'curtain',
      shape: 'ellipse',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      points: null,
      doorState: null,
    });
    const segments = wallSegments(round);
    expect(ELLIPSE_WALL_SEGMENTS).toBe(32);
    expect(segments).toHaveLength(32);
    for (const { from } of segments) {
      expect(Math.abs(((from.x - 2) / 2) ** 2 + (from.y - 1) ** 2 - 1)).toBeLessThan(1e-9);
    }
    expect(segments[31]?.to).toEqual(segments[0]?.from);
  });

  it('a freehand [[0,0],[1,1],[2,0]] at (3, 3) chains (3,3)–(4,4) and (4,4)–(5,3)', () => {
    const zigzag = wall({
      kind: 'wall',
      shape: 'freehand',
      x: 3,
      y: 3,
      width: 2,
      height: 1,
      points: [
        [0, 0],
        [1, 1],
        [2, 0],
      ],
      doorState: null,
    });
    expect(wallSegments(zigzag)).toEqual([
      { from: { x: 3, y: 3 }, to: { x: 4, y: 4 } },
      { from: { x: 4, y: 4 }, to: { x: 5, y: 3 } },
    ]);
  });

  it('the same ellipse always gives the same segments, so client and server agree', () => {
    const round = wall({
      kind: 'wall',
      shape: 'ellipse',
      x: 1,
      y: 1,
      width: 3,
      height: 3,
      points: null,
      doorState: null,
    });
    expect(wallSegments(round)).toEqual(wallSegments({ ...round }));
  });
});
