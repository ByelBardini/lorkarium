import { randomInt } from 'node:crypto';
import { DICE_LIMITS } from '@lorkarium/game-core';
import type { DiceRandomPort } from '../../modules/dice/dice-random.port';

// `randomInt` takes a range below 2^48; 2^47 steps keep `unit()` far finer than any throw needs.
const UNIT_STEPS = 2 ** 47;

/** Dice faces and uniform numbers drawn by `node:crypto` (the source is a parameter for the spec).
 *
 *  Example: `new CryptoDiceRandom().face(7) // 4` */
export class CryptoDiceRandom implements DiceRandomPort {
  constructor(private readonly nextInt: (exclusiveMax: number) => number = randomInt) {}

  face(sides: number): number {
    const { minSides, maxSides } = DICE_LIMITS;
    if (!Number.isInteger(sides) || sides < minSides || sides > maxSides) {
      throw new RangeError(
        `Die sides ${sides} is invalid: expected a whole number from ${minSides} to ${maxSides}.`,
      );
    }
    return this.nextInt(sides) + 1;
  }

  unit(): number {
    return this.nextInt(UNIT_STEPS) / UNIT_STEPS;
  }
}
