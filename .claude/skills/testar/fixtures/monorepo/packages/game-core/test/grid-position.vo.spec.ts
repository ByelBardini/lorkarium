import { describe, expect, it } from 'vitest';
import { gridPosition } from '../src/grid-position.vo';

describe('gridPosition', () => {
  it('keeps the given column and row', () => {
    expect(gridPosition(2, 3)).toEqual({ column: 2, row: 3 });
  });

  it('a negative column is refused citing the received pair', () => {
    expect(() => gridPosition(-1, 0)).toThrow('got (-1, 0)');
  });
});
