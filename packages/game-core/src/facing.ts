import { facing, type Facing } from './facing.vo';

export interface Vector2 {
  x: number;
  y: number;
}

const FULL_TURN = 360;
const RADIANS_PER_DEGREE = Math.PI / 180;

/** Rounds any angle in degrees and wraps it into 0…359.
 *
 *  Example: `normalizeFacing(-90) // 270` */
export function normalizeFacing(degrees: number): Facing {
  const whole = Math.round(degrees);
  return facing(((whole % FULL_TURN) + FULL_TURN) % FULL_TURN);
}

/** The facing that looks from `from` to `to` (screen coordinates, y down); `null` when they coincide.
 *
 *  Example: `facingToward({ x: 0, y: 0 }, { x: -3, y: 0 }) // 180` */
export function facingToward(from: Vector2, to: Vector2): Facing | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return normalizeFacing(Math.atan2(dy, dx) / RADIANS_PER_DEGREE);
}

/** Snaps an angle to the nearest multiple of `step` degrees, wrapping 360 back to 0.
 *
 *  Example: `snapFacing(23, 45) // 45` */
export function snapFacing(degrees: number, step: number): Facing {
  return normalizeFacing(Math.round(degrees / step) * step);
}

/** Turns a facing by `delta` degrees (positive = clockwise on screen).
 *
 *  Example: `turnFacing(315, 90) // 45` */
export function turnFacing(current: Facing, delta: number): Facing {
  return normalizeFacing(current + delta);
}

/** The unit vector a facing points to, in screen coordinates (y down).
 *
 *  Example: `facingVector(0) // { x: 1, y: 0 }` */
export function facingVector(value: Facing): Vector2 {
  const radians = value * RADIANS_PER_DEGREE;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}
