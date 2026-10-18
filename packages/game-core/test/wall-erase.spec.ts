import { describe, expect, it } from 'vitest';
import { wallOutsideBox, wallWithoutSegment } from '../src/wall-erase';
import { wallSegments } from '../src/wall-segments';
import { wall, type Wall } from '../src/wall.vo';

function freehand(points: [number, number][], kind: Wall['kind'] = 'wall'): Wall {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return wall({
    kind,
    shape: 'freehand',
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
    points: points.map(([px, py]) => [px - x, py - y]),
    doorState: null,
  });
}

const BOX = wall({
  kind: 'grate',
  shape: 'rectangle',
  x: 2,
  y: 2,
  width: 4,
  height: 3,
  points: null,
  doorState: null,
});

describe('wallWithoutSegment', () => {
  it('the top side of a rectangle out leaves one freehand of the three other sides, same kind', () => {
    const [rest, ...more] = wallWithoutSegment(BOX, 0);

    expect(more).toEqual([]);
    expect(rest).toMatchObject({
      kind: 'grate',
      shape: 'freehand',
      x: 2,
      y: 2,
      width: 4,
      height: 3,
    });
    expect(wallSegments(rest!)).toEqual([
      { from: { x: 6, y: 2 }, to: { x: 6, y: 5 } },
      { from: { x: 6, y: 5 }, to: { x: 2, y: 5 } },
      { from: { x: 2, y: 5 }, to: { x: 2, y: 2 } },
    ]);
  });

  it('the middle piece of an open path out leaves the two ends as walls of their own', () => {
    const path = freehand([
      [0, 0],
      [2, 0],
      [4, 0],
      [6, 0],
    ]);

    const pieces = wallWithoutSegment(path, 1);

    expect(pieces.map(wallSegments)).toEqual([
      [{ from: { x: 0, y: 0 }, to: { x: 2, y: 0 } }],
      [{ from: { x: 4, y: 0 }, to: { x: 6, y: 0 } }],
    ]);
    expect(pieces.map(({ shape }) => shape)).toEqual(['line', 'line']);
  });

  it('the first piece of an open path out leaves only the rest', () => {
    const path = freehand([
      [0, 0],
      [2, 0],
      [4, 2],
    ]);

    expect(wallWithoutSegment(path, 0).map(wallSegments)).toEqual([
      [{ from: { x: 2, y: 0 }, to: { x: 4, y: 2 } }],
    ]);
  });

  it('the only piece of a straight wall out leaves nothing', () => {
    const line = freehand([
      [0, 0],
      [3, 0],
    ]);

    expect(wallWithoutSegment({ ...line, shape: 'line' }, 0)).toEqual([]);
  });

  it('a closed freehand path opens where the piece was taken', () => {
    const loop = freehand([
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 0],
    ]);

    const [rest] = wallWithoutSegment(loop, 1);

    expect(wallSegments(rest!)).toEqual([
      { from: { x: 4, y: 4 }, to: { x: 0, y: 0 } },
      { from: { x: 0, y: 0 }, to: { x: 4, y: 0 } },
    ]);
  });

  it('a piece of an ellipse out leaves 31 pieces, each vertex to the hundredth', () => {
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

    const [rest] = wallWithoutSegment(round, 3);

    expect(wallSegments(rest!)).toHaveLength(31);
    for (const [px] of rest!.points ?? []) expect(Math.round(px * 100)).toBeCloseTo(px * 100, 9);
  });

  it('the same wall and piece always give the same rest, so client and server agree', () => {
    expect(wallWithoutSegment(BOX, 2)).toEqual(wallWithoutSegment({ ...BOX }, 2));
  });

  it('a piece past the last one is refused citing the index and how many there are', () => {
    expect(() => wallWithoutSegment(BOX, 4)).toThrow(/segment 4 .*4 segments/);
  });
});

describe('wallOutsideBox', () => {
  const line = (from: [number, number], to: [number, number], kind: Wall['kind'] = 'wall') =>
    freehand([from, to], kind);

  it('a box over the middle of a line cuts it at both edges and keeps the two ends', () => {
    const rest = wallOutsideBox(line([0, 0], [10, 0]), { x: 3, y: -1, width: 2, height: 2 });

    expect(rest?.map(wallSegments)).toEqual([
      [{ from: { x: 0, y: 0 }, to: { x: 3, y: 0 } }],
      [{ from: { x: 5, y: 0 }, to: { x: 10, y: 0 } }],
    ]);
    expect(rest?.every(({ shape, kind }) => shape === 'line' && kind === 'wall')).toBe(true);
  });

  it('a box away from the wall touches nothing: null, the wall stays as it is', () => {
    expect(wallOutsideBox(BOX, { x: 10, y: 10, width: 2, height: 2 })).toBeNull();
  });

  it('a box around the whole wall leaves nothing', () => {
    expect(wallOutsideBox(BOX, { x: 2, y: 2, width: 4, height: 3 })).toEqual([]);
  });

  it('a box over a corner of the rectangle opens it there: one freehand from cut to cut', () => {
    const [rest, ...more] = wallOutsideBox(BOX, { x: 1, y: 1, width: 2, height: 2 }) ?? [];

    expect(more).toEqual([]);
    expect(rest?.kind).toBe('grate');
    expect(wallSegments(rest!)).toEqual([
      { from: { x: 3, y: 2 }, to: { x: 6, y: 2 } },
      { from: { x: 6, y: 2 }, to: { x: 6, y: 5 } },
      { from: { x: 6, y: 5 }, to: { x: 2, y: 5 } },
      { from: { x: 2, y: 5 }, to: { x: 2, y: 3 } },
    ]);
  });

  it('a box over the middle of the bottom side opens the rectangle there, in one freehand', () => {
    const [rest, ...more] = wallOutsideBox(BOX, { x: 3, y: 4, width: 2, height: 2 }) ?? [];

    expect(more).toEqual([]);
    expect(wallSegments(rest!)).toEqual([
      { from: { x: 3, y: 5 }, to: { x: 2, y: 5 } },
      { from: { x: 2, y: 5 }, to: { x: 2, y: 2 } },
      { from: { x: 2, y: 2 }, to: { x: 6, y: 2 } },
      { from: { x: 6, y: 2 }, to: { x: 6, y: 5 } },
      { from: { x: 6, y: 5 }, to: { x: 5, y: 5 } },
    ]);
  });

  it('a box across a path cuts each piece it covers, and what is left on each side stays joined', () => {
    const path = freehand([
      [0, 0],
      [4, 0],
      [4, 4],
      [8, 4],
    ]);

    const rest = wallOutsideBox(path, { x: 3, y: 1, width: 2, height: 2 });

    expect(rest?.map(wallSegments)).toEqual([
      [
        { from: { x: 0, y: 0 }, to: { x: 4, y: 0 } },
        { from: { x: 4, y: 0 }, to: { x: 4, y: 1 } },
      ],
      [
        { from: { x: 4, y: 3 }, to: { x: 4, y: 4 } },
        { from: { x: 4, y: 4 }, to: { x: 8, y: 4 } },
      ],
    ]);
  });

  it('a door cut in the middle leaves two plain walls', () => {
    const door = wall({
      kind: 'door',
      shape: 'line',
      x: 0,
      y: 0,
      width: 4,
      height: 0,
      points: [
        [0, 0],
        [4, 0],
      ],
      doorState: 'open',
    });

    const rest = wallOutsideBox(door, { x: 1, y: -1, width: 2, height: 2 });

    expect(rest?.map(({ kind, doorState }) => [kind, doorState])).toEqual([
      ['wall', null],
      ['wall', null],
    ]);
  });

  it('a box that only touches the end point of a line leaves it whole: null', () => {
    expect(wallOutsideBox(line([0, 0], [4, 0]), { x: 4, y: -1, width: 2, height: 2 })).toBeNull();
  });
});
