import type { DiceRollResult } from '../dice-roll';

/** How many d20 landed on 20 in a roll, every thrown die counted (the dropped one of an
 *  advantage too: the player saw it fall). A d100 showing 20 is not a natural 20.
 *  Example: `countNaturalTwenties(step.result) // 2 for 2d20kh1 → [20, 20]` */
export function countNaturalTwenties(result: DiceRollResult): number {
  return result.parts
    .flatMap((part) => part.dice)
    .filter((die) => die.sides === 20 && die.value === 20).length;
}
