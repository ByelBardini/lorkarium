import { describe, expect, it } from 'vitest';
import { cell, sameCell } from '../src/cell.vo';

describe('cell', () => {
  it('two cells built from the same column and row are equal by value', () => {
    expect(cell(3, 4)).toEqual({ col: 3, row: 4 });
    expect(sameCell(cell(3, 4), cell(3, 4))).toBe(true);
  });

  it('cells with a different row are not the same cell', () => {
    expect(sameCell(cell(3, 4), cell(3, 5))).toBe(false);
  });

  it('a built cell is frozen, so it cannot be moved in place', () => {
    expect(Object.isFrozen(cell(0, 0))).toBe(true);
  });

  it.each([
    [-1, 0, '-1'],
    [1.5, 0, '1.5'],
    [0, -2, '-2'],
    [0, Number.NaN, 'NaN'],
  ])('cell(%s, %s) is refused citing %s and the expected shape', (col, row, shown) => {
    expect(() => cell(col, row)).toThrow(new RegExp(`${shown}.*inteiro ≥ 0`));
  });
});
