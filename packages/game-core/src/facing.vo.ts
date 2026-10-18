/** Where a token looks, in whole degrees: 0 = right, growing clockwise on screen (90 = down, 180 = left, 270 = up): the handle
 *  and the mark start on the right, clear of the name under the token. */
export type Facing = number;

const FULL_TURN = 360;

/** Validates a facing: a whole angle from 0 to 359.
 *
 *  Example: `facing(90) // 90, looking left` */
export function facing(value: number): Facing {
  if (Number.isInteger(value) && value >= 0 && value < FULL_TURN) return value;
  throw new RangeError(
    `Facing ${String(value)} is invalid: expected a whole number from 0 to ${FULL_TURN - 1}.`,
  );
}
