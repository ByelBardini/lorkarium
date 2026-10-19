import { describe, expect, it } from 'vitest';
import { assertReach } from '../src/reach';

describe('assertReach', () => {
  it('a reach of 100.01 is refused naming the subject, the side and the value', () => {
    expect(() => assertReach('Torch', 'bright', 100.01)).toThrow(
      'Torch bright 100.01 is invalid: expected 0 to 100 cells.',
    );
  });

  it.each([
    [-0.5, '-0.5'],
    [Number.NaN, 'NaN'],
    [Number.NEGATIVE_INFINITY, '-Infinity'],
  ])('a reach of %s is refused citing it', (value, shown) => {
    expect(() => assertReach('Sight', 'dim', value)).toThrow(`Sight dim ${shown} is invalid`);
  });
});
