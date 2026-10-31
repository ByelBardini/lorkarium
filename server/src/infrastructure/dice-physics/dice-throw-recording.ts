import { DICE_THROW_MODELS_MAX, type DiceThrowDto } from '@lorkarium/contracts';
import {
  DIE_KINDS,
  decodeDiceFrames,
  diceBoxOf,
  isDieKind,
  type DieKind,
} from '@lorkarium/game-core';
import type { DicePhysicsPort } from '../../modules/dice/dice-physics.port';
import { toDiceThrowDto } from '../../modules/dice/dice.mapper';

/** One throw recorded for a replay outside a table: the throw as `dice:rolled` carries it and the
 *  face each model stopped on, in the order of `throw.models`. */
export type RecordedDiceThrow = Readonly<{ throw: DiceThrowDto; values: readonly number[] }>;

/** `sets` are the dice thrown together (unchecked text, so a script can pass any list), each
 *  thrown `perSet` times in a box of `aspect`. */
export type DiceThrowRecordingRequest = Readonly<{
  physics: DicePhysicsPort;
  sets: readonly (readonly string[])[];
  perSet: number;
  aspect: number;
}>;

/** Throws every set `perSet` times, each throw on its own from 0 ms, set by set, and keeps what a
 *  replay needs; every set is checked before the first die flies.
 *
 *  Example: `diceThrowRecordingOf({ physics, sets: [['d20']], perSet: 12, aspect: 16 / 9 })` */
export function diceThrowRecordingOf(request: DiceThrowRecordingRequest): RecordedDiceThrow[] {
  const sets = request.sets.map(modeledSetOf);
  requireThrowCount(request.perSet);
  return sets.flatMap((kinds) =>
    Array.from({ length: request.perSet }, () => recordedThrowOf(request, kinds)),
  );
}

function recordedThrowOf(request: DiceThrowRecordingRequest, kinds: DieKind[]): RecordedDiceThrow {
  const { models } = request.physics.throw({ kinds, aspect: request.aspect, startMs: 0 });
  return {
    throw: toDiceThrowDto(request.aspect, models),
    values: models.map((model) => model.value),
  };
}

function modeledSetOf(set: readonly string[], index: number): DieKind[] {
  if (set.length === 0 || set.length > DICE_THROW_MODELS_MAX) {
    throw new RangeError(
      `Dice set ${index + 1} has ${set.length} dice: expected 1 to ${DICE_THROW_MODELS_MAX} modeled dice.`,
    );
  }
  return set.map((kind) => {
    if (isDieKind(kind)) return kind;
    throw new RangeError(
      `Die kind "${kind}" in set ${index + 1} has no 3D model: expected one of ${DIE_KINDS.join(', ')}.`,
    );
  });
}

function requireThrowCount(perSet: number): void {
  if (Number.isInteger(perSet) && perSet >= 0) return;
  throw new RangeError(`Throws per set ${perSet} is invalid: expected a whole number from 0.`);
}

/**
 * True when every die of the throw comes to rest inside the central `share` of its box (on each
 * axis), so a stage that zooms into the middle of the box still shows where the dice stopped.
 * Example: `settlesNearCentre(recorded, 0.45) // false for a d20 resting against a side`
 */
export function settlesNearCentre(recorded: RecordedDiceThrow, share: number): boolean {
  if (!(share > 0 && share <= 1)) {
    throw new RangeError(`The central share must be in (0, 1], got ${share}`);
  }
  const box = diceBoxOf(recorded.throw.aspect);
  return recorded.throw.models.every((model) => {
    const rest = decodeDiceFrames(model.frames).at(-1)?.position;
    if (rest === undefined) return false;
    return Math.abs(rest.x) <= box.halfWidth * share && Math.abs(rest.z) <= box.halfDepth * share;
  });
}
