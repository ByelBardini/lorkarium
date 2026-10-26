import type { DieStatusDto, RolledDieDto, RolledPartDto } from '@lorkarium/contracts';
import {
  parseDiceExpression,
  type AdvantageMode,
  type DiceExpressionTerm,
  type DiceTerm,
} from '@lorkarium/game-core';

/** How many dice of one part the history draws; the rest is a count ("+250"). */
export const SHOWN_DICE_MAX = 50;

/** One die as the history draws it: `extreme` marks the highest face (`max`) and the 1 (`min`);
 *  `success` is null when the part counts no successes. */
export type DieMark = Readonly<{
  value: number;
  sides: number;
  status: DieStatusDto;
  extreme: 'max' | 'min' | null;
  success: boolean | null;
}>;

/** One part of a roll: at most `SHOWN_DICE_MAX` dice and how many were left out; `successes`
 *  only when the part counts them (`8d10>=7`); `modifier` is the sum of its numbers (`+5`),
 *  null when it is zero, the part counts successes or its expression cannot be read. */
export type PartBreakdown = Readonly<{
  label: string | null;
  expression: string;
  total: number;
  dice: readonly DieMark[];
  hiddenDice: number;
  successes: number | null;
  modifier: number | null;
}>;

/** A d20 that counts landed on 20 (`twenty`) or on 1 (`one`). */
export type RollNatural = 'twenty' | 'one';

/** `summary` sums the parts ("Acerto 17 + Bênção 3 + 2 = 22") when there is more than one. */
export type RollBreakdown = Readonly<{
  summary: string | null;
  parts: readonly PartBreakdown[];
}>;

type RolledRoll = Readonly<{ parts: readonly RolledPartDto[]; total: number }>;

/** What the history shows of a revealed roll: the sum of the parts and each part's dice.
 *
 *  Example: `breakdownOf(event).summary // 'Acerto 17 + Bênção 3 + 2 = 22'` */
export function breakdownOf(roll: RolledRoll): RollBreakdown {
  const parts = roll.parts.map(partBreakdownOf);
  if (parts.length < 2) return { summary: null, parts };
  const sum = parts.map((part, index) => partTermText(part, index === 0)).join('');
  return { summary: `${sum} = ${roll.total}`, parts };
}

/** "1 sucesso", "4 sucessos".
 *
 *  Example: `successesText(4) // '4 sucessos'` */
export function successesText(count: number): string {
  return `${count} ${count === 1 ? 'sucesso' : 'sucessos'}`;
}

/** The count of the dice left out, as the history writes it.
 *
 *  Example: `hiddenDiceText(250) // '+250'` */
export function hiddenDiceText(count: number): string {
  return `+${count}`;
}

/** Whether a d20 that counts (kept or exploded; never the one advantage dropped) landed on 20
 *  or on 1, in any part. A 20 wins over a 1. Never "crítico": that margin is the system's.
 *
 *  Example: `naturalOf(event) // 'twenty'` */
export function naturalOf(roll: Readonly<{ parts: readonly RolledPartDto[] }>): RollNatural | null {
  const counted = roll.parts.flatMap((part) => part.dice).filter(countsAsNatural);
  if (counted.some((die) => die.value === 20)) return 'twenty';
  return counted.some((die) => die.value === 1) ? 'one' : null;
}

/** The mode a roll was made with, read from its first die: one more die keeping the highest
 *  (`2d20kh1`, `4d6kh3`) is advantage, keeping the lowest is disadvantage — what the game-core's
 *  `withAdvantage` writes. Anything else, or a part that cannot be read, is null.
 *
 *  Example: `rollModeOf(['2d20kh1+5']) // 'advantage'` */
export function rollModeOf(expressions: readonly string[]): AdvantageMode | null {
  const die = expressions.flatMap(termsOrEmpty).find(isDieTerm);
  if (die?.keep === undefined || die.keep.count !== die.count - 1) return null;
  return die.keep.which === 'highest' ? 'advantage' : 'disadvantage';
}

function countsAsNatural(die: RolledDieDto): boolean {
  return die.sides === 20 && (die.status === 'kept' || die.status === 'exploded');
}

function termsOrEmpty(expression: string): readonly DiceExpressionTerm[] {
  try {
    return parseDiceExpression(expression);
  } catch {
    return [];
  }
}

function isDieTerm(term: DiceExpressionTerm): term is DiceTerm {
  return term.kind === 'dice';
}

function modifierOf(part: RolledPartDto, countsSuccesses: boolean): number | null {
  if (countsSuccesses) return null;
  const sum = termsOrEmpty(part.expression).reduce(
    (total, term) => (term.kind === 'number' ? total + term.sign * term.value : total),
    0,
  );
  return sum === 0 ? null : sum;
}

function partBreakdownOf(part: RolledPartDto): PartBreakdown {
  const counts = part.dice.some((die) => die.success !== undefined);
  return {
    label: part.label,
    expression: part.expression,
    total: part.total,
    dice: part.dice.slice(0, SHOWN_DICE_MAX).map(dieMarkOf),
    hiddenDice: Math.max(0, part.dice.length - SHOWN_DICE_MAX),
    successes: counts ? part.dice.filter((die) => die.success === true).length : null,
    modifier: modifierOf(part, counts),
  };
}

function dieMarkOf(die: RolledDieDto): DieMark {
  return {
    value: die.value,
    sides: die.sides,
    status: die.status,
    extreme: extremeOf(die),
    success: die.success ?? null,
  };
}

function extremeOf(die: RolledDieDto): DieMark['extreme'] {
  if (die.value === die.sides) return 'max';
  return die.value === 1 ? 'min' : null;
}

// An unlabeled negative part reads as a subtraction ("− 2"); a labeled one keeps its sign.
function partTermText(part: PartBreakdown, first: boolean): string {
  const named = part.label === null ? `${part.total}` : `${part.label} ${part.total}`;
  if (first) return named;
  if (part.label === null && part.total < 0) return ` − ${Math.abs(part.total)}`;
  return ` + ${named}`;
}
