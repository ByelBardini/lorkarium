import { describe, expect, it } from 'vitest';
import { gameWallOf, gameWallsOf, wallAreaEraseOf, wallRestOf } from '@/lib/wall-geometry';
import { cellDoor, grateBox, northWall } from '../support/wall-fixtures';

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

describe('gameWallsOf', () => {
  it('the same array of walls gives back the very same Wall[]', () => {
    const walls = [northWall(), cellDoor()];
    expect(gameWallsOf(walls)).toBe(gameWallsOf(walls));
  });

  it('a new array with the same walls gives a new Wall[] with the same content', () => {
    const walls = [northWall(), cellDoor()];
    const again = [...walls];
    expect(gameWallsOf(again)).not.toBe(gameWallsOf(walls));
    expect(gameWallsOf(again)).toEqual(gameWallsOf(walls));
  });

  it('converts each kind as gameWallOf does: a wall, an open door, a grate', () => {
    const walls = [northWall(), cellDoor({ doorState: 'open' }), grateBox()];
    expect(gameWallsOf(walls)).toEqual(walls.map(gameWallOf));
    expect(gameWallsOf(walls)[1]).toMatchObject({ kind: 'door', doorState: 'open' });
  });
});
