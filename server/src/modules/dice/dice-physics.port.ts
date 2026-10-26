import type { DieKind } from '@lorkarium/game-core';

/** One wave of modeled dice thrown together. `aspect` is the width / depth of the roller's window
 *  (0.5 to 3), which shapes the box; `startMs` is when the wave starts on the roll's timeline. */
export interface DiceThrowRequest {
  readonly kinds: readonly DieKind[];
  readonly aspect: number;
  readonly startMs: number;
}

/** The recorded throw of one die: `frames` from `encodeDiceFrames` (7 integers per pose, one pose
 *  every `DICE_FRAME_MS` from `startMs`), `settleMs` the instant of its last pose on the same
 *  timeline, and `value` the face read on that pose by `restingValueOf` (the `d100tens` gives 0 to
 *  90; joining it to the units `d10` is the caller's). `rethrows` counts the tilted landings thrown
 *  again before this one (0 to 3). */
export interface DieThrowModel {
  readonly kind: DieKind;
  readonly startMs: number;
  readonly settleMs: number;
  readonly frames: readonly number[];
  readonly value: number;
  readonly rethrows: number;
}

/** One model per requested die, in the order of `kinds`. */
export interface DiceThrowResult {
  readonly models: readonly DieThrowModel[];
}

/** Throws dice in a walled box and reads the face each one stops on. Dice never touch each
 *  other, so a die's throw does not depend on the others in the wave.
 *
 *  Example: `physics.throw({ kinds: ['d20'], aspect: 16 / 9, startMs: 0 }).models[0].value // 17` */
export interface DicePhysicsPort {
  throw(request: DiceThrowRequest): DiceThrowResult;
}
