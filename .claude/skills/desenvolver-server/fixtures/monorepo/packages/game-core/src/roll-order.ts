// Propositalmente errado: regra de jogo que depende de runtime (node:crypto).
import { randomInt } from 'node:crypto';

/** Breaks initiative ties with a die roll.
 *
 *  Example: `rollOrder(['hero', 'goblin']).length // 2` */
export function rollOrder(names: string[]): string[] {
  return [...names].sort(() => randomInt(3) - 1);
}
