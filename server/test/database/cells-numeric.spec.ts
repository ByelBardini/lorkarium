import { describe, expect, it } from 'vitest';
import { cellsHundredth, cellsNumeric } from '../../src/database/cells-numeric';

describe('cellsHundredth', () => {
  it.each([
    [10 / 3, 3.33],
    [7.125, 7.13],
    [4, 4],
  ])('%s cells round to %s', (value, rounded) => {
    expect(cellsHundredth(value)).toBe(rounded);
  });
});

describe('cellsNumeric', () => {
  it.each([
    [10 / 3, '3.33'],
    [4, '4.00'],
    [0.5, '0.50'],
  ])('%s cells are saved as the numeric string %s', (value, saved) => {
    expect(cellsNumeric(value)).toBe(saved);
  });
});
