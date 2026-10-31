import { describe, expect, it } from 'vitest';
import { cell } from '../src/cell.vo';
import { cellDistance, footprintFits, pathCells, pathDistance } from '../src/grid';
import { tokenSize } from '../src/token-size.vo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };

describe('cellDistance', () => {
  it('a diagonal step counts as one cell, so (0,0) to (3,2) is 3', () => {
    expect(cellDistance(cell(0, 0), cell(3, 2))).toBe(3);
  });

  it('the distance is the same in both directions', () => {
    expect(cellDistance(cell(3, 2), cell(0, 0))).toBe(3);
  });

  it('a straight line counts every cell it crosses', () => {
    expect(cellDistance(cell(1, 5), cell(1, 0))).toBe(5);
  });

  it('a cell to itself is 0', () => {
    expect(cellDistance(cell(7, 7), cell(7, 7))).toBe(0);
  });
});

describe('pathDistance', () => {
  it('a path with a bend sums its legs: (0,0) → (3,0) → (3,4) is 7', () => {
    expect(pathDistance([cell(0, 0), cell(3, 0), cell(3, 4)])).toBe(7);
  });

  it('the bend costs more than the straight diagonal it replaces', () => {
    const bent = pathDistance([cell(0, 0), cell(3, 0), cell(3, 3)]);
    expect(bent).toBeGreaterThan(cellDistance(cell(0, 0), cell(3, 3)));
  });

  it('each leg counts a diagonal step as one cell', () => {
    expect(pathDistance([cell(0, 0), cell(2, 2), cell(4, 0)])).toBe(4);
  });

  it('one cell or an empty path is 0', () => {
    expect(pathDistance([cell(5, 5)])).toBe(0);
    expect(pathDistance([])).toBe(0);
  });
});

describe('pathCells', () => {
  it('a straight leg passes through every cell between its ends', () => {
    const cells = pathCells([cell(0, 0), cell(3, 0)]);
    expect(cells).toEqual([cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)]);
  });

  it('a diagonal leg steps one diagonal cell at a time', () => {
    expect(pathCells([cell(0, 0), cell(2, 2)])).toEqual([cell(0, 0), cell(1, 1), cell(2, 2)]);
  });

  it('a leg off the axes spreads its diagonal steps along the way: (0,0) → (3,1)', () => {
    const cells = pathCells([cell(0, 0), cell(3, 1)]);
    expect(cells).toEqual([cell(0, 0), cell(1, 0), cell(2, 1), cell(3, 1)]);
  });

  it('walking the leg backwards passes through the same cells', () => {
    const cells = pathCells([cell(3, 1), cell(0, 0)]);
    expect(cells).toEqual([cell(3, 1), cell(2, 1), cell(1, 0), cell(0, 0)]);
  });

  it('a bend is one cell of the trail, not two', () => {
    const cells = pathCells([cell(0, 0), cell(2, 0), cell(2, 2)]);
    expect(cells).toEqual([cell(0, 0), cell(1, 0), cell(2, 0), cell(2, 1), cell(2, 2)]);
  });

  it('the trail has one cell per cell counted by pathDistance, plus the start', () => {
    const path = [cell(1, 1), cell(6, 3), cell(4, 9), cell(4, 9), cell(0, 2)];
    expect(pathCells(path)).toHaveLength(pathDistance(path) + 1);
  });

  it('every step of the trail is one cell away from the one before', () => {
    const cells = pathCells([cell(0, 0), cell(7, 3), cell(2, 5)]);
    const steps = cells.slice(1).map((step, index) => cellDistance(cells[index]!, step));
    expect(new Set(steps)).toEqual(new Set([1]));
  });

  it('a token on a half cell keeps the half on the axis that started with it', () => {
    const cells = pathCells([cell(0.5, 0), cell(2.5, 1)]);
    expect(cells).toEqual([cell(0.5, 0), cell(1.5, 1), cell(2.5, 1)]);
  });

  it('a leg of half a cell is one step', () => {
    expect(pathCells([cell(0, 0), cell(0.5, 0)])).toEqual([cell(0, 0), cell(0.5, 0)]);
  });

  it('one cell is the trail itself, and an empty path has none', () => {
    expect(pathCells([cell(5, 5)])).toEqual([cell(5, 5)]);
    expect(pathCells([])).toEqual([]);
  });
});

describe('footprintFits', () => {
  it('a 2×2 token at (18, 10) fits a 20×12 scene', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(18, 10), tokenSize(2, 2))).toBe(true);
  });

  it('a token touching the last column fits, and one cell past it does not', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(19, 0), tokenSize(1, 1))).toBe(true);
    expect(footprintFits(SCENE_20_BY_12, cell(20, 0), tokenSize(1, 1))).toBe(false);
  });

  it('width and height are checked on their own axis: a 1×2 token at the bottom row spills', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(19, 10), tokenSize(1, 2))).toBe(true);
    expect(footprintFits(SCENE_20_BY_12, cell(19, 11), tokenSize(1, 2))).toBe(false);
  });

  it('a 1.5-wide token at 18.5 ends exactly on the edge, half a cell more spills', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(18.5, 0), tokenSize(1.5, 0.5))).toBe(true);
    expect(footprintFits(SCENE_20_BY_12, cell(19, 0), tokenSize(1.5, 0.5))).toBe(false);
  });
});
