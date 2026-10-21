import { facing, type Facing } from './facing.vo';

/** The widest opening, in degrees: a cone this wide is no cone (it sees or shines every side). */
export const CONE_ANGLE_MAX = 360;

/** How wide a cone opens, in whole degrees from 1 to 360; 360 = every side. */
export type ConeAngle = number;

/** A cone opening `angle` degrees around `facing` (its middle), from an apex given by whoever uses it. */
export type Cone = Readonly<{ facing: Facing; angle: ConeAngle }>;

/** Validates a cone opening: a whole number of degrees from 1 to 360. The message names the subject.
 *
 *  Example: `coneAngle('Sight', 90)` → `90` */
export function coneAngle(subject: 'Sight' | 'Light', value: number): ConeAngle {
  if (Number.isInteger(value) && value >= 1 && value <= CONE_ANGLE_MAX) return value;
  throw new RangeError(
    `${subject} angle ${String(value)} is invalid: expected a whole number from 1 to ${CONE_ANGLE_MAX}.`,
  );
}

/** The cone looking at `direction` and opening `angle` degrees, or `null` at 360 (every side), so
 *  callers keep the all-around rule untouched.
 *
 *  Example: `coneOf(90, 60)` → `{ facing: 90, angle: 60 }`; `coneOf(90, 360)` → `null` */
export function coneOf(direction: number, angle: number): Cone | null {
  const middle = facing(direction);
  const opening = coneAngle('Sight', angle);
  if (opening === CONE_ANGLE_MAX) return null;
  return Object.freeze({ facing: middle, angle: opening });
}
