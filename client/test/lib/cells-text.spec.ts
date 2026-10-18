import { describe, expect, it } from 'vitest';
import { cellsText } from '@/lib/cells-text';

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
