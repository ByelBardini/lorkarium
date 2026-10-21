import { describe, expect, it } from 'vitest';
import { CONE_ANGLE_MAX, coneAngle, coneOf } from '../src/cone.vo';

describe('coneAngle', () => {
  it('a whole angle from 1 to 360 is kept', () => {
    expect(coneAngle('Sight', 90)).toBe(90);
    expect(coneAngle('Light', 1)).toBe(1);
    expect(coneAngle('Light', CONE_ANGLE_MAX)).toBe(360);
  });

  it.each([0, 361, 12.5, Number.NaN])('sight angle %s is refused citing the value', (value) => {
    expect(() => coneAngle('Sight', value)).toThrow(
      new RangeError(
        `Sight angle ${String(value)} is invalid: expected a whole number from 1 to 360.`,
      ),
    );
  });

  it('a refused light angle names the light', () => {
    expect(() => coneAngle('Light', 0)).toThrow(/^Light angle 0 is invalid/);
  });
});

describe('coneOf', () => {
  it('a facing and an angle below 360 make a frozen cone', () => {
    const cone = coneOf(90, 60);

    expect(cone).toEqual({ facing: 90, angle: 60 });
    expect(Object.isFrozen(cone)).toBe(true);
  });

  it('360 degrees is no cone at all (every side)', () => {
    expect(coneOf(90, 360)).toBeNull();
  });

  it('a facing out of 0–359 is refused with the facing error', () => {
    expect(() => coneOf(360, 60)).toThrow(/Facing 360 is invalid/);
  });
});
