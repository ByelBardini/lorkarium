/** The box the dice are thrown in, in die units (a die's circumradius is 1): the floor is y = 0,
 *  x runs along the roller's window width and z along its height, both centered on 0. */
export interface DiceBox {
  readonly halfWidth: number;
  readonly halfDepth: number;
}

/** The short side of the box: the die is 1/8 of the window's short side on every screen. */
export const DICE_BOX_SHORT_SIDE = 16;
export const DICE_BOX_ASPECT_MIN = 0.5;
export const DICE_BOX_ASPECT_MAX = 3;

/** The box for a window of `aspect` = width / height (0.5 to 3); the long side grows with it, up
 *  to 48 units, which keeps every center inside the ±32 of `encodeDiceFrames`.
 *
 *  Example: `diceBoxOf(2) // { halfWidth: 16, halfDepth: 8 }` */
export function diceBoxOf(aspect: number): DiceBox {
  if (!(aspect >= DICE_BOX_ASPECT_MIN && aspect <= DICE_BOX_ASPECT_MAX)) {
    throw new RangeError(
      `Dice box aspect ${aspect} is invalid: expected ${DICE_BOX_ASPECT_MIN} to ${DICE_BOX_ASPECT_MAX}.`,
    );
  }
  const half = DICE_BOX_SHORT_SIDE / 2;
  return aspect >= 1
    ? { halfWidth: half * aspect, halfDepth: half }
    : { halfWidth: half, halfDepth: half / aspect };
}
