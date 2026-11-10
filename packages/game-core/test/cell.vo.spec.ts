import { describe, expect, it } from 'vitest';
import { cell, isPositionStep, POSITION_STEP, sameCell } from '../src/cell.vo';

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

  it('a half cell is a position, so a 0.5 token can stand at (1.5, 2.5)', () => {
    expect(cell(1.5, 2.5)).toEqual({ col: 1.5, row: 2.5 });
  });

  it('a step of 1/64 is a position, so a token can stand off the cells at (1.015625, 2.5)', () => {
    expect(cell(1.015625, 2.5)).toEqual({ col: 1.015625, row: 2.5 });
  });

  it('the origin of the scene is a position', () => {
    expect(cell(0, 0)).toEqual({ col: 0, row: 0 });
  });

  it('two positions one step of 1/64 apart are not the same cell', () => {
    expect(sameCell(cell(1, 2), cell(1.015625, 2))).toBe(false);
  });

  it.each([
    ['col', -1, 0, '-1'],
    ['col', 0.01, 0, '0.01'],
    ['col', -1 / 64, 0, '-0.015625'],
    ['row', 0, -0.5, '-0.5'],
    ['row', 0, Number.NaN, 'NaN'],
    ['row', 0, Number.POSITIVE_INFINITY, 'Infinity'],
  ])('a %s out of the steps in cell(%s, %s) is refused citing %s', (axis, col, row, shown) => {
    const build = (): unknown => cell(col, row);
    expect(build).toThrow(RangeError);
    expect(build).toThrow(`Cell ${axis} ${shown} is invalid: expected a multiple of 1/64 ≥ 0.`);
  });
});

describe('isPositionStep', () => {
  it('the step is 1/64 of a cell, one world pixel at 100%', () => {
    expect(POSITION_STEP).toBe(0.015625);
  });

  it.each([0, 0.5, 3, 1.015625, 99.984375])('%s is on the steps', (value) => {
    expect(isPositionStep(value)).toBe(true);
  });

  it.each([0.01, 1.02, -1 / 64, Number.NaN, Number.POSITIVE_INFINITY])(
    '%s is off the steps',
    (value) => {
      expect(isPositionStep(value)).toBe(false);
    },
  );
});
