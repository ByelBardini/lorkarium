import {
  DiceNotationError,
  parseDiceExpression,
  parseDiceParts,
  percentileValue,
  type DieKind,
  type DieRequest,
} from '@lorkarium/game-core';
import type { DieThrowModel } from './dice-physics.port';
import { InvalidDiceExpressionError } from './dice.error';

/** A wave of explosions or rerolls is thrown this long after the previous one settles. */
export const DICE_WAVE_GAP_MS = 300;
/** How long the "…" lasts on a roll with no 3D model at all (only d7, d2…). */
export const DICE_REVEAL_WITHOUT_MODEL_MS = 800;

/** Who may see a roll whole: the whole table, or the masters (and the roller). */
export type DiceVisibility = 'public' | 'masters';

/** Who hears the full roll: the whole table, or the masters plus `userIds` (the roller, when they
 *  are not a master). Everyone else at a `masters` roll hears only that someone rolled. */
export type DiceAudience =
  Readonly<{ kind: 'table' }> | Readonly<{ kind: 'masters'; userIds: readonly string[] }>;

/** How each requested die is thrown: the physics models it takes (`[]` = drawn by crypto). */
export type DieThrowPlan = readonly DieKind[];

const MODELED_KINDS: Readonly<Record<number, DieThrowPlan>> = {
  4: ['d4'],
  6: ['d6'],
  8: ['d8'],
  10: ['d10'],
  12: ['d12'],
  20: ['d20'],
  100: ['d100tens', 'd10'],
};

/** Throws `INVALID_DICE_EXPRESSION` naming the piece (counted from 1, as the person sees the
 *  tray) with the game-core's reason, or the whole roll when the composition is refused (more
 *  than 10 pieces, more than 1000 dice summed). The roll and the saved rolls read the same way.
 *
 *  Example: `requireReadableDice(['1d20', '2d'])` → throws "part 2 ("2d") cannot be read: …" */
export function requireReadableDice(expressions: readonly string[]): void {
  expressions.forEach(requirePartReadable);
  try {
    parseDiceParts(expressions);
  } catch (error) {
    if (!(error instanceof DiceNotationError)) throw error;
    throw new InvalidDiceExpressionError(null, null, error.message);
  }
}

// One piece alone, so the reason is the game-core's own (without its 0-based part prefix).
function requirePartReadable(expression: string, index: number): void {
  try {
    parseDiceExpression(expression);
  } catch (error) {
    if (!(error instanceof DiceNotationError)) throw error;
    throw new InvalidDiceExpressionError(index + 1, expression, error.message);
  }
}

/** The models of one wave, in request order: a die with a 3D shape takes one model (the d100
 *  two: tens and units) while the roll stays within `max` (20, the contract's
 *  `DICE_THROW_MODELS_MAX`); the rest is drawn by crypto. `used` are the models of the earlier
 *  waves.
 *
 *  Example: `modeledOf([{ part: 0, term: 0, sides: 100 }], 19, 20) // [[]]` (one slot left, needs two) */
export function modeledOf(
  requests: readonly DieRequest[],
  used: number,
  max: number,
): DieThrowPlan[] {
  let taken = used;
  return requests.map(({ sides }) => {
    const kinds = MODELED_KINDS[sides] ?? [];
    if (kinds.length === 0 || taken + kinds.length > max) return [];
    taken += kinds.length;
    return kinds;
  });
}

/** Who hears the full roll. A public roll goes to the table; a masters-only one to the masters
 *  and the roller (a master rolling is already among them).
 *
 *  Example: `audienceOf('masters', biaId, false) // { kind: 'masters', userIds: [biaId] }` */
export function audienceOf(
  visibility: DiceVisibility,
  rollerId: string,
  rollerIsMaster: boolean,
): DiceAudience {
  if (visibility === 'public') return { kind: 'table' };
  return { kind: 'masters', userIds: rollerIsMaster ? [] : [rollerId] };
}

/** How long the result stays "…": until the last modeled die settles, or 800 ms without any.
 *
 *  Example: `revealDelayOf([]) // 800` */
export function revealDelayOf(models: readonly Pick<DieThrowModel, 'settleMs'>[]): number {
  if (models.length === 0) return DICE_REVEAL_WITHOUT_MODEL_MS;
  return Math.max(...models.map((model) => model.settleMs));
}

/** The waves of one roll: the models thrown so far and which die of which term each one shows.
 *  It decides where the next wave starts and turns a wave's models and crypto faces into the
 *  values the game-core lands, in request order.
 *
 *  Example: `const values = waves.land(requests, plans, physics.throw(…).models, faces)` */
export class DiceWavesBo {
  constructor(private readonly maxModels: number) {}

  private readonly models: DieThrowModel[] = [];
  // [part][term][die of the term] → the model indices that show it (undefined = no model).
  private readonly indices: (readonly number[] | undefined)[][][] = [];

  /** The plan of the next wave, counting the models already thrown. */
  planOf(requests: readonly DieRequest[]): DieThrowPlan[] {
    return modeledOf(requests, this.models.length, this.maxModels);
  }

  /** 0 for the first modeled wave; 300 ms after the last model settled for the next ones. */
  nextStartMs(): number {
    if (this.models.length === 0) return 0;
    return revealDelayOf(this.models) + DICE_WAVE_GAP_MS;
  }

  /** Records the wave and answers one value per request: the face of its model(s) (a d100 joins
   *  tens and units by `percentileValue`) or the next crypto face, in order. */
  land(
    requests: readonly DieRequest[],
    plans: readonly DieThrowPlan[],
    thrown: readonly DieThrowModel[],
    faces: readonly number[],
  ): number[] {
    let nextModel = 0;
    let nextFace = 0;
    return requests.map((request, index) => {
      const plan = plans[index] ?? [];
      if (plan.length === 0) return this.record(request, undefined, faces[nextFace++]);
      const own = thrown.slice(nextModel, nextModel + plan.length);
      nextModel += plan.length;
      return this.record(request, this.keep(own), valueOf(own));
    });
  }

  /** Every model thrown, on the roll's timeline. */
  modelsOf(): readonly DieThrowModel[] {
    return this.models;
  }

  /** The model indices of each die, by part and term, in the order the dice landed. */
  indicesOf(): readonly (readonly (readonly number[] | undefined)[])[][] {
    return this.indices;
  }

  private keep(own: readonly DieThrowModel[]): number[] {
    const first = this.models.length;
    this.models.push(...own);
    return own.map((_, offset) => first + offset);
  }

  private record(request: DieRequest, model: number[] | undefined, value?: number): number {
    const part = (this.indices[request.part] ??= []);
    (part[request.term] ??= []).push(model);
    if (value === undefined) throw new RangeError(missingValueOf(request));
    return value;
  }
}

function valueOf(own: readonly DieThrowModel[]): number {
  const [first, units] = own;
  if (!first) throw new RangeError('A modeled die got no model: expected one per kind.');
  if (!units) return first.value;
  return percentileValue(first.value, units.value % 10);
}

function missingValueOf(request: DieRequest): string {
  return `Die of part ${request.part} term ${request.term} (d${request.sides}) got no value: expected one face per request.`;
}
