import { describe, expect, it } from 'vitest';
import { facing } from '../src/facing.vo';

describe('facing', () => {
  it('a whole angle from 0 to 359 is kept', () => {
    expect(facing(90)).toBe(90);
    expect(facing(0)).toBe(0);
    expect(facing(359)).toBe(359);
  });

  it.each([360, -1, 12.5, Number.NaN])('%s is refused citing the value and the range', (value) => {
    expect(() => facing(value)).toThrow(RangeError);
    expect(() => facing(value)).toThrow(new RegExp(`${String(value)}.*whole number from 0 to 359`));
  });
});
