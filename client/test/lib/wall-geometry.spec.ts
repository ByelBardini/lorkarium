import { describe, expect, it } from 'vitest';
import { wallAreaEraseOf, wallRestOf } from '@/lib/wall-geometry';
import { grateBox, northWall } from '../support/wall-fixtures';

describe('wallRestOf', () => {
  it('taking the top side of the grate box leaves the other three as one freehand grate', () => {
    expect(wallRestOf(grateBox(), 0)).toEqual([
      {
        kind: 'grate',
        shape: 'freehand',
        x: 8,
        y: 3,
        width: 2,
        height: 2,
        points: [
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      },
    ]);
  });

  it('taking the only piece of a straight wall leaves nothing', () => {
    expect(wallRestOf(northWall(), 0)).toEqual([]);
  });
});

describe('wallAreaEraseOf', () => {
  it('a box over the middle of the north wall names it and leaves its two ends; the box stays', () => {
    const erase = wallAreaEraseOf([northWall(), grateBox()], { x: 3, y: 1, width: 2, height: 2 });

    expect(erase.erased.map(({ id }) => id)).toEqual([northWall().id]);
    expect(erase.rest.map(({ shape, x, width }) => [shape, x, width])).toEqual([
      ['line', 2, 1],
      ['line', 5, 1],
    ]);
  });

  it('a box over nothing erases nothing', () => {
    expect(wallAreaEraseOf([northWall()], { x: 0, y: 8, width: 1, height: 1 })).toEqual({
      erased: [],
      rest: [],
    });
  });
});
