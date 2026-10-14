import { describe, expect, it } from 'vitest';
import { gridPosition } from '../src/grid-position.vo';

describe('gridPosition', () => {
  it('a negative column is refused citing the received pair', () => {
    expect(() => gridPosition(-1, 0)).toThrow('got (-1, 0)');
  });
});
