import { parseDiceParts, type ParsedDicePart } from './dice-advantage';
import {
  DICE_LIMITS,
  diceComparisonMatches,
  type DiceExpressionTerm,
  type DiceTerm,
  type NumberTerm,
} from './dice-notation';

/** One die the roller must throw: which part and term of the roll it belongs to, and its faces.
 *  A percentile die asks for `sides: 100`; how to throw it (two d10) is the roller's choice. */
export interface DieRequest {
  readonly part: number;
  readonly term: number;
  readonly sides: number;
}

/** `rerolled` was replaced and does not count; `dropped` lost the keep/drop selection; `exploded`
 *  counts and spawned an extra die; `kept` counts. */
export type DieStatus = 'kept' | 'dropped' | 'exploded' | 'rerolled';

export interface RolledDie {
  readonly sides: number;
  readonly value: number;
  readonly status: DieStatus;
  /** Only on a counted die (kept or exploded) of a term with a success comparison. */
  readonly success?: boolean;
}

export interface RolledDiceTerm {
  readonly kind: 'dice';
  readonly term: DiceTerm;
  readonly dice: readonly RolledDie[];
  readonly total: number;
}

export interface RolledNumberTerm {
  readonly kind: 'number';
  readonly term: NumberTerm;
  readonly total: number;
}

export type RolledTerm = RolledDiceTerm | RolledNumberTerm;

export interface RolledPart {
  readonly expression: string;
  readonly terms: readonly RolledTerm[];
  /** Every die of the part, term after term, in the order they were thrown. */
  readonly dice: readonly RolledDie[];
  readonly total: number;
}

export interface DiceRollResult {
  readonly parts: readonly RolledPart[];
  readonly total: number;
}

interface ThrownDie {
  readonly value: number;
  readonly rerolled: boolean;
  readonly exploded: boolean;
}

interface PendingDie extends DieRequest {
  /** A reroll's replacement cannot be rerolled again (`r` rerolls once). */
  readonly mayReroll: boolean;
}

/** The roll between two waves. Treat it as opaque: pass it back to `continueDiceRoll`. */
export interface DiceRollState {
  readonly parts: readonly ParsedDicePart[];
  /** The dice thrown so far, by part and then by term. */
  readonly thrown: readonly (readonly (readonly ThrownDie[])[])[];
  readonly pending: readonly PendingDie[];
  readonly explosions: number;
}

export type DiceRollStep =
  | { readonly kind: 'pending'; readonly state: DiceRollState; readonly requests: DieRequest[] }
  | { readonly kind: 'done'; readonly state: DiceRollState; readonly result: DiceRollResult };

interface Landing {
  readonly die: ThrownDie;
  readonly follow: PendingDie | null;
}

/** Starts a roll of several parts (validated by `parseDiceParts`) and asks for the first wave of
 *  dice; a roll of numbers only is done at once.
 *
 *  Example: `startDiceRoll(['2d20kh1+5'])` → `{ kind: 'pending', requests: [{ part: 0, term: 0, sides: 20 }, { part: 0, term: 0, sides: 20 }], state }` */
export function startDiceRoll(expressions: readonly string[]): DiceRollStep {
  const parts = parseDiceParts(expressions);
  const thrown = parts.map((part) => part.terms.map((): ThrownDie[] => []));
  const pending = parts.flatMap((part, partIndex) =>
    part.terms.flatMap((term, termIndex) => firstWaveOf(term, partIndex, termIndex)),
  );
  return stepOf({ parts, thrown, pending, explosions: 0 });
}

/** Lands one value per requested die (in the order of the requests) and asks for the next wave
 *  (explosions and rerolls) or closes the total. The given state is left untouched.
 *
 *  Example: `continueDiceRoll(state, [17, 4])` → `{ kind: 'done', result: { total: 22, parts: [...] }, state }` */
export function continueDiceRoll(state: DiceRollState, values: readonly number[]): DiceRollStep {
  checkWave(state.pending, values);
  const thrown = state.thrown.map((part) => part.map((term) => [...term]));
  const pending: PendingDie[] = [];
  let explosions = state.explosions;
  state.pending.forEach((request, index) => {
    const value = values[index] ?? 0;
    const landing = landDie(dieTermAt(state.parts, request), request, value, explosions);
    thrown[request.part]?.[request.term]?.push(landing.die);
    if (landing.follow === null) return;
    pending.push(landing.follow);
    if (landing.die.exploded) explosions += 1;
  });
  return stepOf({ parts: state.parts, thrown, pending, explosions });
}

function firstWaveOf(term: DiceExpressionTerm, part: number, index: number): PendingDie[] {
  if (term.kind === 'number') return [];
  const request: PendingDie = { part, term: index, sides: term.sides, mayReroll: true };
  return Array.from({ length: term.count }, () => request);
}

function stepOf(state: DiceRollState): DiceRollStep {
  if (state.pending.length === 0) return { kind: 'done', state, result: resultOf(state) };
  const requests = state.pending.map(({ part, term, sides }) => ({ part, term, sides }));
  return { kind: 'pending', state, requests };
}

function checkWave(pending: readonly PendingDie[], values: readonly number[]): void {
  if (pending.length === 0) {
    throw new RangeError('Dice roll is already done: expected a roll that still asks for dice.');
  }
  if (values.length !== pending.length) {
    throw new RangeError(`Dice roll expected ${pending.length} values, got ${values.length}.`);
  }
  pending.forEach((request, index) => checkValue(values[index], request.sides, index));
}

function checkValue(value: number | undefined, sides: number, index: number): void {
  if (value !== undefined && Number.isInteger(value) && value >= 1 && value <= sides) return;
  throw new RangeError(
    `Die value ${String(value)} for request ${index} (d${sides}) is invalid: expected a whole number from 1 to ${sides}.`,
  );
}

function dieTermAt(parts: readonly ParsedDicePart[], request: DieRequest): DiceTerm {
  const term = parts[request.part]?.terms[request.term];
  if (term?.kind === 'dice') return term;
  throw new RangeError(
    `Die request for part ${request.part}, term ${request.term} has no die term: expected a request made by this roll.`,
  );
}

function landDie(term: DiceTerm, request: PendingDie, value: number, explosions: number): Landing {
  if (request.mayReroll && term.reroll && diceComparisonMatches(term.reroll, value)) {
    return {
      die: { value, rerolled: true, exploded: false },
      follow: { ...request, mayReroll: false },
    };
  }
  const explode = explosions < DICE_LIMITS.maxExplosions ? term.explode : undefined;
  const exploded = explode !== undefined && diceComparisonMatches(explode, value);
  const follow = exploded ? { ...request, mayReroll: true } : null;
  return { die: { value, rerolled: false, exploded }, follow };
}

function resultOf(state: DiceRollState): DiceRollResult {
  const parts = state.parts.map((part, index) => rolledPart(part, state.thrown[index] ?? []));
  return { parts, total: sumOf(parts.map((part) => part.total)) };
}

function rolledPart(part: ParsedDicePart, thrown: readonly (readonly ThrownDie[])[]): RolledPart {
  const terms = part.terms.map((term, index) => rolledTerm(term, thrown[index] ?? []));
  const dice = terms.flatMap((term) => (term.kind === 'dice' ? term.dice : []));
  return {
    expression: part.expression,
    terms,
    dice,
    total: sumOf(terms.map((term) => term.total)),
  };
}

function rolledTerm(term: DiceExpressionTerm, thrown: readonly ThrownDie[]): RolledTerm {
  if (term.kind === 'number') return { kind: 'number', term, total: term.sign * term.value };
  const dropped = droppedOf(term, thrown);
  const dice = thrown.map((die, index) => rolledDie(term, die, dropped.has(index)));
  const counted = dice.filter((die) => die.status === 'kept' || die.status === 'exploded');
  const amount = term.success
    ? counted.filter((die) => die.success === true).length
    : sumOf(counted.map((die) => die.value));
  return { kind: 'dice', term, dice, total: term.sign * amount };
}

function rolledDie(term: DiceTerm, die: ThrownDie, dropped: boolean): RolledDie {
  const status = statusOf(die, dropped);
  const base = { sides: term.sides, value: die.value, status };
  const counted = status === 'kept' || status === 'exploded';
  if (!term.success || !counted) return base;
  return { ...base, success: diceComparisonMatches(term.success, die.value) };
}

function statusOf(die: ThrownDie, dropped: boolean): DieStatus {
  if (die.rerolled) return 'rerolled';
  if (dropped) return 'dropped';
  return die.exploded ? 'exploded' : 'kept';
}

function droppedOf(term: DiceTerm, thrown: readonly ThrownDie[]): Set<number> {
  const selection = term.keep ?? term.drop;
  if (selection === undefined) return new Set();
  const active = thrown.flatMap((die, index) => (die.rerolled ? [] : [index]));
  const direction = selection.which === 'highest' ? -1 : 1;
  const valueAt = (index: number): number => thrown[index]?.value ?? 0;
  const ranked = [...active].sort((a, b) => direction * (valueAt(a) - valueAt(b)));
  const chosen = new Set(ranked.slice(0, selection.count));
  if (term.drop) return chosen;
  return new Set(active.filter((index) => !chosen.has(index)));
}

function sumOf(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0);
}
