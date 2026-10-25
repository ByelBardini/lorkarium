import { describe, expect, it } from 'vitest';
import { auraOpacity, auraRadius } from '../src/aura.vo';

describe('auraRadius', () => {
  it('a radius of 2.5 cells is kept as given', () => {
    expect(auraRadius(2.5)).toBe(2.5);
  });

  it.each([0, 20])('a radius of %s cells is at the edge of the range and passes', (radius) => {
    expect(auraRadius(radius)).toBe(radius);
  });

  it('a radius of 20.01 is refused citing the value and the range', () => {
    expect(() => auraRadius(20.01)).toThrow(
      new RangeError('Aura radius 20.01 is invalid: expected 0 to 20 cells.'),
    );
  });

  it.each([
    [-1, '-1'],
    [Number.NaN, 'NaN'],
    [Number.POSITIVE_INFINITY, 'Infinity'],
  ])('a radius of %s is refused citing it', (radius, shown) => {
    expect(() => auraRadius(radius)).toThrow(
      `Aura radius ${shown} is invalid: expected 0 to 20 cells.`,
    );
  });
});

describe('auraOpacity', () => {
  it('an opacity of 50 percent is kept as given', () => {
    expect(auraOpacity(50)).toBe(50);
  });

  it.each([10, 100])('an opacity of %s percent is at the edge of the range and passes', (value) => {
    expect(auraOpacity(value)).toBe(value);
  });

  it.each([9, 101, 50.5])('an opacity of %s is refused citing the value', (value) => {
    expect(() => auraOpacity(value)).toThrow(
      new RangeError(
        `Aura opacity ${String(value)} is invalid: expected a whole percent from 10 to 100.`,
      ),
    );
  });
});
