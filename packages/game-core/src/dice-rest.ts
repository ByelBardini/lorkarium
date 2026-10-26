import { DIE_UP, dieShapeOf, dot3, type DieKind, type Vector3 } from './dice-shapes';

/** A rotation as a unit quaternion (the `{ x, y, z, w }` of cannon-es and three). */
export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** The face read at rest and how far its normal leans away from vertical, in degrees. */
export interface RestingFace {
  readonly value: number;
  readonly tiltDegrees: number;
}

export const IDENTITY_QUATERNION: Quaternion = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

// Physics integrators drift off unit length; 0.001 accepts that and still refuses a non-rotation.
const NORM_TOLERANCE = 1e-3;
const DOWN: Vector3 = Object.freeze({ x: 0, y: -1, z: 0 });
const DEGREES_PER_RADIAN = 180 / Math.PI;
const PERCENTILE_TENS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

/** Checks that `q` is a rotation (norm 1 ± 0.001) and returns it renormalized.
 *
 *  Example: `unitQuaternion({ x: 0, y: 0, z: 0, w: 1.0004 }) // { x: 0, y: 0, z: 0, w: 1 }` */
export function unitQuaternion(q: Quaternion): Quaternion {
  const norm = Math.hypot(q.x, q.y, q.z, q.w);
  if (!(Math.abs(norm - 1) <= NORM_TOLERANCE)) {
    throw new RangeError(
      `Quaternion norm ${norm} is invalid: expected a unit quaternion (norm 1 ± ${NORM_TOLERANCE}).`,
    );
  }
  return { x: q.x / norm, y: q.y / norm, z: q.z / norm, w: q.w / norm };
}

/** The rotation of `degrees` around `axis` (right-handed; the axis does not need to be unit).
 *
 *  Example: `quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, 180) // { x: 0, y: 1, z: 0, w: ≈0 }` */
export function quaternionFromAxisAngle(axis: Vector3, degrees: number): Quaternion {
  const length = Math.hypot(axis.x, axis.y, axis.z);
  if (!(length > 0)) {
    throw new RangeError(
      `Rotation axis (${axis.x}, ${axis.y}, ${axis.z}) is invalid: expected a non-zero vector.`,
    );
  }
  const half = degrees / DEGREES_PER_RADIAN / 2;
  const factor = Math.sin(half) / length;
  return { x: axis.x * factor, y: axis.y * factor, z: axis.z * factor, w: Math.cos(half) };
}

/** `vector` turned by the unit quaternion `q`.
 *
 *  Example: `rotateVector(quaternionFromAxisAngle(Y, 90), { x: 1, y: 0, z: 0 }) // ≈ { x: 0, y: 0, z: -1 }` */
export function rotateVector(q: Quaternion, vector: Vector3): Vector3 {
  const tx = 2 * (q.y * vector.z - q.z * vector.y);
  const ty = 2 * (q.z * vector.x - q.x * vector.z);
  const tz = 2 * (q.x * vector.y - q.y * vector.x);
  return {
    x: vector.x + q.w * tx + (q.y * tz - q.z * ty),
    y: vector.y + q.w * ty + (q.z * tx - q.x * tz),
    z: vector.z + q.w * tz + (q.x * ty - q.y * tx),
  };
}

function indexOfLargest(values: readonly number[]): number {
  return values.reduce(
    (best, value, index) => (value > (values[best] ?? -Infinity) ? index : best),
    0,
  );
}

/** The value of a die at rest in `orientation`: the face turned up (the face turned down on the
 *  d4, whose value is the corner on top) and its tilt. Deciding to rethrow a leaning die is the
 *  physics' call.
 *
 *  Example: `restingValueOf('d6', IDENTITY_QUATERNION) // { value: 1, tiltDegrees: 0 }` */
export function restingValueOf(kind: DieKind, orientation: Quaternion): RestingFace {
  const unit = unitQuaternion(orientation);
  const shape = dieShapeOf(kind);
  const target = shape.reads === 'top' ? DIE_UP : DOWN;
  const alignments = shape.faces.map((face) => dot3(rotateVector(unit, face.normal), target));
  const best = indexOfLargest(alignments);
  const cosine = Math.min(1, Math.max(-1, alignments[best] ?? -1));
  return {
    value: shape.faces[best]?.value ?? 0,
    tiltDegrees: Math.acos(cosine) * DEGREES_PER_RADIAN,
  };
}

/** The d100 from its two d10: `tens` from the `d100tens` (0 to 90) and `units` from the `d10`
 *  read as 0 to 9 (its face 10 is 0, so pass `d10 % 10`); 00 + 0 is 100.
 *
 *  Example: `percentileValue(90, 5) // 95` · `percentileValue(0, 0) // 100` */
export function percentileValue(tens: number, units: number): number {
  if (!PERCENTILE_TENS.includes(tens)) {
    throw new RangeError(`Percentile tens ${tens} is invalid: expected 0, 10, … 90.`);
  }
  if (!Number.isInteger(units) || units < 0 || units > 9) {
    throw new RangeError(
      `Percentile units ${units} is invalid: expected a whole number from 0 to 9.`,
    );
  }
  const total = tens + units;
  return total === 0 ? 100 : total;
}
