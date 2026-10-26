import {
  DICE_ASPECT_MAX,
  DICE_ASPECT_MIN,
  type DiceRollPartDto,
  type SavedRollDto,
} from '@lorkarium/contracts';
import {
  DICE_LIMITS,
  DiceNotationError,
  advantageBlockOf,
  formatDiceExpression,
  parseDiceExpression,
  parseDiceParts,
  withAdvantage,
  type AdvantageBlock,
  type AdvantageMode,
  type DiceExpressionTerm,
  type NumberTerm,
} from '@lorkarium/game-core';

/** The roll being built: the formula (dice and numbers, as typed or clicked), rolled as one
 *  unlabeled part. Saved rolls roll on their own, never summed to it. */
export type DiceTray = Readonly<{ loose: string }>;

export type DiceRollMode = 'normal' | AdvantageMode;

/** Why the advantage buttons are off: the game-core's block, or a notation still unreadable. */
export type TrayAdvantageBlock = AdvantageBlock | 'unreadable';

export const EMPTY_TRAY: DiceTray = { loose: '' };

/** What the "Dados" tab keeps between the tray and the saved list: the roll being built, the
 *  advantage chosen and whether it is masters-only. */
export type TrayChoice = Readonly<{ tray: DiceTray; mode: DiceRollMode; secret: boolean }>;

export const EMPTY_TRAY_CHOICE: TrayChoice = { tray: EMPTY_TRAY, mode: 'normal', secret: false };

/** The dice of one click, in the order the tray shows them (`d100` is `d%`). */
export const TRAY_DICE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;

const ADVANTAGE_DIE_SIDES = 20;

/** One more die of `sides` on the loose piece: a plain die of the same sides grows (`1d20` →
 *  `2d20`), otherwise a new `1dN` comes before the numbers. An unreadable text gets it appended.
 *
 *  Example: `addDie(addDie(EMPTY_TRAY, 20), 6).loose // '1d20+1d6'` */
export function addDie(tray: DiceTray, sides: number): DiceTray {
  const terms = readableTermsOf(tray.loose);
  if (terms === null) return { ...tray, loose: `${tray.loose}+1d${sides}` };
  return { ...tray, loose: looseTextOf(withOneMoreDie(terms, sides)) };
}

/** A die of any sides (d2, d7, d1000) typed by the person; outside 2 to 1000 is a `RangeError`.
 *
 *  Example: `addCustomDie(addDie(EMPTY_TRAY, 20), 7).loose // '1d20+1d7'` */
export function addCustomDie(tray: DiceTray, sides: number): DiceTray {
  const { minSides, maxSides } = DICE_LIMITS;
  if (Number.isInteger(sides) && sides >= minSides && sides <= maxSides) {
    return addDie(tray, sides);
  }
  throw new RangeError(
    `Custom die sides ${sides} is invalid: expected a whole number from ${minSides} to ${maxSides}.`,
  );
}

/** Sums `delta` to the loose piece's number (all its numbers become one); zero drops it.
 *
 *  Example: `addModifier(addModifier(EMPTY_TRAY, 1), 1).loose // '+2'` */
export function addModifier(tray: DiceTray, delta: number): DiceTray {
  const terms = readableTermsOf(tray.loose);
  const text = `${delta < 0 ? '-' : '+'}${Math.abs(delta)}`;
  if (terms === null) return { ...tray, loose: tray.loose + text };
  const dice = terms.filter((term) => term.kind === 'dice');
  const sum = terms.reduce((total, term) => total + numberValueOf(term), 0) + delta;
  return { ...tray, loose: looseTextOf([...dice, ...numberTermsOf(sum)]) };
}

/** The loose piece as the person typed it (read only when rolling or clicking).
 *
 *  Example: `setLoose(EMPTY_TRAY, '4d6dl1')` */
export function setLoose(tray: DiceTray, loose: string): DiceTray {
  return { ...tray, loose };
}

/** The parts of a saved roll as it rolls: each unlabeled part takes the saved roll's name.
 *
 *  Example: `savedRollPartsOf(acerto) // [{ label: 'Acerto', expression: '1d20+5' }]` */
export function savedRollPartsOf(saved: SavedRollDto): DiceRollPartDto[] {
  return saved.parts.map((part) => ({
    label: part.label ?? saved.name,
    expression: part.expression,
  }));
}

/** The part the tray rolls (the formula, unlabeled); `null` when there is nothing to roll. Advantage goes through the game-core's `withAdvantage` (on the first die).
 *
 *  Example: `toRollParts(addModifier(addDie(EMPTY_TRAY, 20), 5), 'advantage') // [{ label: null, expression: '2d20kh1+5' }]` */
export function toRollParts(tray: DiceTray, mode: DiceRollMode): DiceRollPartDto[] | null {
  const parts = trayPartsOf(tray);
  if (parts.length === 0) return null;
  if (mode === 'normal') return parts;
  const expressions = withAdvantage(
    parts.map((part) => part.expression),
    mode,
  );
  return parts.map((part, index) => ({ ...part, expression: expressions[index] ?? '' }));
}

/** Whether the tray has anything to roll.
 *
 *  Example: `isTrayEmpty(EMPTY_TRAY) // true` */
export function isTrayEmpty(tray: DiceTray): boolean {
  return trayPartsOf(tray).length === 0;
}

/** Whether the tray has something to roll and every part of it reads.
 *
 *  Example: `isTrayRollable(setLoose(EMPTY_TRAY, '1d')) // false` */
export function isTrayRollable(tray: DiceTray): boolean {
  return !isTrayEmpty(tray) && trayProblemOf(tray) === null;
}

/** The notation error that stops the roll (a part unreadable, too many parts or dice), if any.
 *
 *  Example: `trayProblemOf(setLoose(EMPTY_TRAY, '1d'))?.message // 'Expected the number of sides…'` */
export function trayProblemOf(tray: DiceTray): DiceNotationError | null {
  const parts = trayPartsOf(tray);
  if (parts.length === 0) return null;
  try {
    parseDiceParts(parts.map((part) => part.expression));
    return null;
  } catch (error) {
    if (error instanceof DiceNotationError) return error;
    throw error;
  }
}

/** Why advantage and disadvantage cannot apply to the tray now, or `null` when they can.
 *
 *  Example: `trayAdvantageBlockOf(setLoose(EMPTY_TRAY, '1d6!')) // 'modified'` */
export function trayAdvantageBlockOf(tray: DiceTray): TrayAdvantageBlock | null {
  const parts = trayPartsOf(tray);
  if (parts.length === 0) return 'no-dice';
  if (trayProblemOf(tray) !== null) return 'unreadable';
  return advantageBlockOf(parts.map((part) => part.expression));
}

/** How many loose plain dice of each sides the tray holds, read from its text (so it holds after
 *  typing too). A die with a modifier (`2d20kh1`) is not counted; an unreadable text counts none.
 *
 *  Example: `trayDieCountsOf(setLoose(EMPTY_TRAY, '2d20+1d6+5')).get(20) // 2` */
export function trayDieCountsOf(tray: DiceTray): ReadonlyMap<number, number> {
  const counts = new Map<number, number>();
  for (const term of readableTermsOf(tray.loose) ?? []) {
    if (term.kind !== 'dice' || !isPlainDieOf(term, term.sides)) continue;
    counts.set(term.sides, (counts.get(term.sides) ?? 0) + term.count);
  }
  return counts;
}

/** One loose plain die of `sides` less (`2d20` → `1d20`; the last one drops the die). Without
 *  such a die, or with an unreadable text, the same tray comes back.
 *
 *  Example: `removeDie(setLoose(EMPTY_TRAY, '1d20+5'), 20).loose // '+5'` */
export function removeDie(tray: DiceTray, sides: number): DiceTray {
  const terms = readableTermsOf(tray.loose) ?? [];
  const index = terms.findLastIndex((term) => isPlainDieOf(term, sides));
  const found = terms[index];
  if (found?.kind !== 'dice') return tray;
  const less = found.count === 1 ? [] : [{ ...found, count: found.count - 1 }];
  return {
    ...tray,
    loose: looseTextOf([...terms.slice(0, index), ...less, ...terms.slice(index + 1)]),
  };
}

/** The sum of the loose piece's numbers (`1d20+5-2` → 3); `null` while the text is unreadable.
 *
 *  Example: `trayModifierOf(setLoose(EMPTY_TRAY, '1d20+5')) // 5` */
export function trayModifierOf(tray: DiceTray): number | null {
  const terms = readableTermsOf(tray.loose);
  if (terms === null) return null;
  return terms.reduce((total, term) => total + numberValueOf(term), 0);
}

/** Picks the roll's mode. Advantage or disadvantage on a tray without dice (empty, or only
 *  numbers) puts a d20 first, the common case in one click; otherwise only the mode changes.
 *
 *  Example: `chooseMode(EMPTY_TRAY_CHOICE, 'advantage').tray.loose // '1d20'` */
export function chooseMode(choice: TrayChoice, mode: DiceRollMode): TrayChoice {
  const needsD20 = mode !== 'normal' && trayAdvantageBlockOf(choice.tray) === 'no-dice';
  const tray = needsD20 ? addDie(choice.tray, ADVANTAGE_DIE_SIDES) : choice.tray;
  return { ...choice, tray, mode };
}

/** The physics box's aspect of this window (width ÷ height), held to 0.5–3 like the command.
 *
 *  Example: `rollAspectOf({ width: 1920, height: 1080 }) // 1.777…` */
export function rollAspectOf(size: Readonly<{ width: number; height: number }>): number {
  const aspect = size.width / size.height;
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return Math.min(DICE_ASPECT_MAX, Math.max(DICE_ASPECT_MIN, aspect));
}

/** The mode that actually applies: a chosen advantage falls back to a plain roll while blocked.
 *
 *  Example: `appliedModeOf({ tray: setLoose(EMPTY_TRAY, '1d6!'), mode: 'advantage', secret: false }) // 'normal'` */
export function appliedModeOf(choice: TrayChoice): DiceRollMode {
  return trayAdvantageBlockOf(choice.tray) === null ? choice.mode : 'normal';
}

function trayPartsOf(tray: DiceTray): DiceRollPartDto[] {
  const loose = tray.loose.trim();
  return loose === '' ? [] : [{ label: null, expression: loose }];
}

function readableTermsOf(text: string): DiceExpressionTerm[] | null {
  if (text.trim() === '') return [];
  try {
    return parseDiceExpression(text);
  } catch (error) {
    if (error instanceof DiceNotationError) return null;
    throw error;
  }
}

// A plain die has only its kind, sign, count and sides: absent modifiers do not exist.
function isPlainDieOf(term: DiceExpressionTerm, sides: number): boolean {
  if (term.kind !== 'dice' || term.sign !== 1 || term.sides !== sides) return false;
  return Object.keys(term).length === 4;
}

function withOneMoreDie(terms: DiceExpressionTerm[], sides: number): DiceExpressionTerm[] {
  const index = terms.findIndex((term) => isPlainDieOf(term, sides));
  const found = terms[index];
  if (found?.kind === 'dice') {
    return terms.map((term, at) => (at === index ? { ...found, count: found.count + 1 } : term));
  }
  const firstNumber = terms.findIndex((term) => term.kind === 'number');
  const at = firstNumber === -1 ? terms.length : firstNumber;
  const die: DiceExpressionTerm = { kind: 'dice', sign: 1, count: 1, sides };
  return [...terms.slice(0, at), die, ...terms.slice(at)];
}

function numberValueOf(term: DiceExpressionTerm): number {
  return term.kind === 'number' ? term.sign * term.value : 0;
}

function numberTermsOf(sum: number): NumberTerm[] {
  if (sum === 0) return [];
  return [{ kind: 'number', sign: sum < 0 ? -1 : 1, value: Math.abs(sum) }];
}

// A number alone still reads as a modifier: "+2", not "2".
function looseTextOf(terms: readonly DiceExpressionTerm[]): string {
  const text = formatDiceExpression(terms);
  const first = terms[0];
  return first?.kind === 'number' && first.sign === 1 ? `+${text}` : text;
}
