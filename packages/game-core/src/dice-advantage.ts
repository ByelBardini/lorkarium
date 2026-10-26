import {
  DICE_LIMITS,
  DiceNotationError,
  formatDiceExpression,
  parseDiceExpression,
  type DiceExpressionTerm,
  type DiceTerm,
} from './dice-notation';

/** How many parts (dice, numbers, saved rolls) one roll sums. */
export const DICE_PARTS_MAX = 10;

export type AdvantageMode = 'advantage' | 'disadvantage';
/** Why advantage cannot apply: no die at all, the first die term already has a modifier, or one
 *  more die would pass `DICE_LIMITS.maxDice`. */
export type AdvantageBlock = 'no-dice' | 'modified' | 'too-many-dice';

export interface ParsedDicePart {
  readonly expression: string;
  readonly terms: readonly DiceExpressionTerm[];
}

interface FirstDieTerm {
  readonly part: number;
  readonly term: number;
  readonly die: DiceTerm;
}

/** Reads every part of a roll and checks the whole composition: 1 to 10 parts and at most 1000
 *  dice summed over them. A notation error inside a part names the part.
 *
 *  Example: `parseDiceParts(['1d20+5', '1d4'])` → `[{ expression: '1d20+5', terms: [...] }, { expression: '1d4', terms: [...] }]` */
export function parseDiceParts(expressions: readonly string[]): ParsedDicePart[] {
  const count = expressions.length;
  if (count < 1 || count > DICE_PARTS_MAX) {
    throw new DiceNotationError(
      `Dice roll has ${count} parts: expected 1 to ${DICE_PARTS_MAX}.`,
      0,
    );
  }
  const parts = expressions.map((expression, index) => parsePart(expression, index));
  checkDiceCount(diceCountOf(parts));
  return parts;
}

/** Why advantage or disadvantage cannot apply to this composition, or `null` when it can.
 *  Throws the `DiceNotationError` of `parseDiceParts` when a part cannot be read.
 *
 *  Example: `advantageBlockOf(['1d6!'])` → `'modified'`; `advantageBlockOf(['1d20'])` → `null` */
export function advantageBlockOf(expressions: readonly string[]): AdvantageBlock | null {
  const parts = parseDiceParts(expressions);
  const first = firstDieTermOf(parts);
  if (first === null) return 'no-dice';
  if (hasModifier(first.die)) return 'modified';
  if (diceCountOf(parts) + 1 > DICE_LIMITS.maxDice) return 'too-many-dice';
  return null;
}

/** Rewrites the first die term of the roll for advantage (`kh`) or disadvantage (`kl`): one more
 *  die, keeping as many as before. Only that part is rewritten (in the canonical notation).
 *
 *  Example: `withAdvantage(['1d20+5', '1d4'], 'advantage')` → `['2d20kh1+5', '1d4']` */
export function withAdvantage(expressions: readonly string[], mode: AdvantageMode): string[] {
  const block = advantageBlockOf(expressions);
  const first = firstDieTermOf(parseDiceParts(expressions));
  if (block !== null || first === null) {
    throw new RangeError(
      `Cannot apply ${mode} to ${JSON.stringify(expressions)}: blocked by '${block ?? 'no-dice'}'; expected a first die term without modifiers and room for one more die.`,
    );
  }
  return expressions.map((expression, index) =>
    index === first.part ? rewritePart(expression, first, mode) : expression,
  );
}

function parsePart(expression: string, index: number): ParsedDicePart {
  try {
    return { expression, terms: parseDiceExpression(expression) };
  } catch (error) {
    if (!(error instanceof DiceNotationError)) throw error;
    throw new DiceNotationError(
      `Dice part ${index} ('${expression}'): ${error.message}`,
      error.position,
      index,
    );
  }
}

function diceCountOf(parts: readonly ParsedDicePart[]): number {
  return parts
    .flatMap((part) => part.terms)
    .reduce((sum, term) => sum + (term.kind === 'dice' ? term.count : 0), 0);
}

function checkDiceCount(count: number): void {
  if (count <= DICE_LIMITS.maxDice) return;
  throw new DiceNotationError(
    `Dice roll has ${count} dice: expected at most ${DICE_LIMITS.maxDice}.`,
    0,
  );
}

function firstDieTermOf(parts: readonly ParsedDicePart[]): FirstDieTerm | null {
  for (const [part, { terms }] of parts.entries()) {
    const term = terms.findIndex((candidate) => candidate.kind === 'dice');
    const die = terms[term];
    if (die?.kind === 'dice') return { part, term, die };
  }
  return null;
}

function hasModifier(die: DiceTerm): boolean {
  return [die.keep, die.drop, die.explode, die.reroll, die.success].some(
    (modifier) => modifier !== undefined,
  );
}

function rewritePart(expression: string, first: FirstDieTerm, mode: AdvantageMode): string {
  const which = mode === 'advantage' ? 'highest' : 'lowest';
  const { die } = first;
  const advantaged: DiceTerm = { ...die, count: die.count + 1, keep: { which, count: die.count } };
  const terms = parseDiceExpression(expression);
  return formatDiceExpression(
    terms.map((term, index) => (index === first.term ? advantaged : term)),
  );
}
