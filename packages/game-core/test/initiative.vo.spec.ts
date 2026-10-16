import { describe, expect, it } from 'vitest';
import { INITIATIVE_LIMIT, initiative } from '../src/initiative.vo';

describe('initiative', () => {
  it('a whole value within ±999 is kept, and null means "not rolled yet"', () => {
    expect(initiative(-2)).toBe(-2);
    expect(initiative(999)).toBe(999);
    expect(initiative(null)).toBeNull();
    expect(INITIATIVE_LIMIT).toBe(999);
  });

  it.each([1000, -1000, 1.5])('%s is refused citing the value and the range', (value) => {
    expect(() => initiative(value)).toThrow(new RegExp(`${value}.*−999…999`));
  });
});
