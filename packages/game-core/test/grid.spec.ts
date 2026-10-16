import { describe, expect, it } from 'vitest';
import { cell } from '../src/cell.vo';
import { cellDistance, footprintFits, pathDistance } from '../src/grid';

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

describe('footprintFits', () => {
  it('a size 2 token at (18, 10) fits a 20×12 scene', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(18, 10), 2)).toBe(true);
  });

  it('a token touching the last column fits, and one cell past it does not', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(19, 0), 1)).toBe(true);
    expect(footprintFits(SCENE_20_BY_12, cell(20, 0), 1)).toBe(false);
  });

  it('a size 2 token one cell from the bottom edge spills out', () => {
    expect(footprintFits(SCENE_20_BY_12, cell(0, 11), 2)).toBe(false);
  });

  it('a size 4 token at (0, 0) fills a 4×4 scene exactly', () => {
    expect(footprintFits({ widthCells: 4, heightCells: 4 }, cell(0, 0), 4)).toBe(true);
  });

  it.each([0, 1.5, -1])('size %s is refused citing the value and the expected shape', (size) => {
    expect(() => footprintFits(SCENE_20_BY_12, cell(0, 0), size)).toThrow(
      new RegExp(`${size}.*inteiro ≥ 1`),
    );
  });
});
