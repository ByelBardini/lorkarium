import { describe, expect, it } from 'vitest';
import { dieShapeOf, type Vector3 } from '../src/dice-shapes';
import {
  IDENTITY_QUATERNION,
  percentileValue,
  quaternionFromAxisAngle,
  restingValueOf,
  rotateVector,
  type Quaternion,
} from '../src/dice-rest';

const X_AXIS: Vector3 = { x: 1, y: 0, z: 0 };
const Y_AXIS: Vector3 = { x: 0, y: 1, z: 0 };
const Z_AXIS: Vector3 = { x: 0, y: 0, z: 1 };
const DOWN: Vector3 = { x: 0, y: -1, z: 0 };

/** The rotation that takes the unit vector `from` onto the unit vector `to` (never antiparallel here). */
function turning(from: Vector3, to: Vector3): Quaternion {
  const axis = {
    x: from.y * to.z - from.z * to.y,
    y: from.z * to.x - from.x * to.z,
    z: from.x * to.y - from.y * to.x,
  };
  const cosine = from.x * to.x + from.y * to.y + from.z * to.z;
  if (cosine > 1 - 1e-12) return IDENTITY_QUATERNION;
  return quaternionFromAxisAngle(axis, (Math.acos(cosine) * 180) / Math.PI);
}

describe('restingValueOf', () => {
  it('a d6 at identity reads the face facing up, 1, with no tilt', () => {
    expect(restingValueOf('d6', IDENTITY_QUATERNION)).toEqual({ value: 1, tiltDegrees: 0 });
  });

  it.each([
    ['180° around x', X_AXIS, 180, 6],
    ['90° around z', Z_AXIS, 90, 3],
    ['−90° around x', X_AXIS, -90, 5],
    ['−90° around z', Z_AXIS, -90, 4],
  ] as const)('a d6 turned %s reads %i', (_, axis, degrees, value) => {
    expect(restingValueOf('d6', quaternionFromAxisAngle(axis, degrees)).value).toBe(value);
  });

  it('a d6 tilted 30° still reads 1 and reports the tilt of 30° (the physics decides to rethrow)', () => {
    const resting = restingValueOf('d6', quaternionFromAxisAngle(X_AXIS, 30));
    expect(resting.value).toBe(1);
    expect(resting.tiltDegrees).toBeCloseTo(30, 9);
  });

  it('a d4 at identity reads the bottom face and returns 4, the value of the corner on top', () => {
    expect(restingValueOf('d4', IDENTITY_QUATERNION)).toEqual({ value: 4, tiltDegrees: 0 });
  });

  it('a d4 laid on each face returns the value of the corner left on top', () => {
    const shape = dieShapeOf('d4');
    for (const face of shape.faces) {
      const orientation = turning(face.normal, DOWN);
      const heights = shape.vertices.map((vertex) => rotateVector(orientation, vertex).y);
      const top = heights.indexOf(Math.max(...heights));
      const resting = restingValueOf('d4', orientation);
      expect(resting.value).toBe(shape.vertexValues?.[top]);
      expect(resting.tiltDegrees).toBeCloseTo(0, 4);
    }
  });

  it.each(['d8', 'd10', 'd100tens', 'd12', 'd20'] as const)(
    'a %s laid flat on any face reads the face turned up',
    (kind) => {
      for (const face of dieShapeOf(kind).faces) {
        const resting = restingValueOf(kind, turning(face.normal, Y_AXIS));
        expect(resting.value).toBe(face.value);
        expect(resting.tiltDegrees).toBeCloseTo(0, 4);
      }
    },
  );

  it('a quaternion of norm 2 is refused citing the norm and the unit expectation', () => {
    expect(() => restingValueOf('d6', { x: 0, y: 0, z: 0, w: 2 })).toThrow(
      /Quaternion norm 2 is invalid: expected a unit quaternion/,
    );
  });

  it('a quaternion with NaN is refused', () => {
    expect(() => restingValueOf('d6', { x: Number.NaN, y: 0, z: 0, w: 1 })).toThrow(RangeError);
  });

  it('a quaternion drifted by 0.0005 from unit is accepted (physics drift)', () => {
    expect(restingValueOf('d6', { x: 0, y: 0, z: 0, w: 1.0005 }).value).toBe(1);
  });
});

describe('rotateVector', () => {
  it('90° around y takes +x to −z (right-handed, y up)', () => {
    const turned = rotateVector(quaternionFromAxisAngle(Y_AXIS, 90), X_AXIS);
    expect(turned.x).toBeCloseTo(0, 9);
    expect(turned.y).toBeCloseTo(0, 9);
    expect(turned.z).toBeCloseTo(-1, 9);
  });
});

describe('quaternionFromAxisAngle', () => {
  it('normalizes the axis: 180° around (0, 2, 0) is (0, 1, 0, 0)', () => {
    const half = quaternionFromAxisAngle({ x: 0, y: 2, z: 0 }, 180);
    expect(half.y).toBeCloseTo(1, 9);
    expect(half.w).toBeCloseTo(0, 9);
  });

  it('a zero axis is refused citing the axis', () => {
    expect(() => quaternionFromAxisAngle({ x: 0, y: 0, z: 0 }, 90)).toThrow(
      /Rotation axis \(0, 0, 0\) is invalid: expected a non-zero vector/,
    );
  });
});

describe('percentileValue', () => {
  it.each([
    [0, 0, 100],
    [90, 5, 95],
    [0, 7, 7],
    [30, 0, 30],
    [90, 9, 99],
  ])('tens %i and units %i read %i', (tens, units, expected) => {
    expect(percentileValue(tens, units)).toBe(expected);
  });

  it.each([95, -10, 100, 1.5])('tens %s is refused citing the value and 0, 10, … 90', (tens) => {
    expect(() => percentileValue(tens, 0)).toThrow(
      new RegExp(`Percentile tens ${tens} is invalid: expected 0, 10, … 90`),
    );
  });

  it.each([10, -1, 2.5])('units %s is refused citing the value and 0 to 9', (units) => {
    expect(() => percentileValue(0, units)).toThrow(
      new RegExp(`Percentile units ${units} is invalid: expected a whole number from 0 to 9`),
    );
  });
});
