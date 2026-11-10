import { describe, expect, it } from 'vitest';
import { cellsText, positionText } from '@/lib/cells-text';

describe('positionText', () => {
  it.each([
    [4, '4'],
    [4.5, '4,5'],
    [4.015625, '4,02'],
    [4.0078125, '4,01'],
  ])('%s reads "%s"', (position, text) => {
    expect(positionText(position)).toBe(text);
  });
});

describe('cellsText', () => {
  it.each([
    [1, '1'],
    [1.5, '1,5'],
    [0.5, '0,5'],
    [10, '10'],
  ])('%s cells read "%s"', (cells, text) => {
    expect(cellsText(cells)).toBe(text);
  });
});
