import type {
  DiceAppearanceDto,
  DiceRollCommandDto,
  DiceRolledDto,
  DiceRolledSecretlyDto,
  DiceThrowDto,
  RolledDieDto,
  RolledPartDto,
} from '@lorkarium/contracts';
import {
  DICE_FRAME_MS,
  memberColorOf,
  type DiceRollResult,
  type RolledDie,
  type RolledPart,
} from '@lorkarium/game-core';
import type { ProfileRow } from '../profiles/profiles.dao';
import type { DieThrowModel } from './dice-physics.port';

/** The model indices of each die, by part, term and die of the term (`DiceWavesBo.indicesOf`). */
export type DiceModelIndices = readonly (readonly (readonly number[] | undefined)[])[][];

/** Everything a full roll event is built from. */
export type DiceRollOutcome = Readonly<{
  rollId: string;
  rollerId: string;
  command: DiceRollCommandDto;
  result: DiceRollResult;
  appearance: DiceAppearanceDto;
  models: readonly DieThrowModel[];
  indices: DiceModelIndices;
  settlesInMs: number;
  at: string;
}>;

type ProfileLook = Pick<ProfileRow, 'color' | 'diceTextureId' | 'diceNumberColor'>;

/** How the roller's dice look: the effective profile color (the ping's), the texture and the
 *  number color; an account without a row falls back to its automatic color.
 *
 *  Example: `toDiceAppearanceDto(biaId, profile) // { color: 'rose', textureId: null, numberColor: null }` */
export function toDiceAppearanceDto(
  userId: string,
  profile: ProfileLook | undefined,
): DiceAppearanceDto {
  return {
    color: memberColorOf(userId, profile?.color ?? null),
    textureId: profile?.diceTextureId ?? null,
    numberColor: profile?.diceNumberColor ?? null,
  };
}

/** `dice:rolled`: the parts with their labels, every die (`model` only on the modeled ones), the
 *  recorded throw (`null` without models) and when the result shows.
 *
 *  Example: `publisher.rolled(toDiceRolledDto(outcome), audience)` */
export function toDiceRolledDto(outcome: DiceRollOutcome): DiceRolledDto {
  const { command, result } = outcome;
  return {
    campaignId: command.campaignId,
    rollId: outcome.rollId,
    rollerId: outcome.rollerId,
    visibility: command.visibility,
    label: command.label,
    parts: result.parts.map((part, index) => toRolledPartDto(outcome, part, index)),
    total: result.total,
    appearance: outcome.appearance,
    throw: outcome.models.length === 0 ? null : toDiceThrowDto(command.aspect, outcome.models),
    settlesInMs: outcome.settlesInMs,
    at: outcome.at,
  };
}

/** `dice:rolledSecretly`: who rolled and when it shows, nothing of the result (no total, label,
 *  parts nor throw: the final pose would reveal the face).
 *
 *  Example: `publisher.rolledSecretly(toDiceRolledSecretlyDto(event), audience)` */
export function toDiceRolledSecretlyDto(event: DiceRolledDto): DiceRolledSecretlyDto {
  const { campaignId, rollId, rollerId, settlesInMs, at } = event;
  return { campaignId, rollId, rollerId, settlesInMs, at };
}

/** The recorded throw everyone replays: the box aspect, the frame step and each model's frames
 *  (the `value` stays on the server; the event carries it in the parts).
 *
 *  Example: `toDiceThrowDto(16 / 9, physics.throw(request).models).models[0].kind // 'd20'` */
export function toDiceThrowDto(aspect: number, models: readonly DieThrowModel[]): DiceThrowDto {
  return {
    aspect,
    frameMs: DICE_FRAME_MS,
    models: models.map(({ kind, startMs, settleMs, frames }) => ({
      kind,
      startMs,
      settleMs,
      frames: [...frames],
    })),
  };
}

function toRolledPartDto(outcome: DiceRollOutcome, part: RolledPart, index: number): RolledPartDto {
  const terms = outcome.indices[index] ?? [];
  const dice = part.terms.flatMap((term, termIndex) => {
    if (term.kind === 'number') return [];
    return term.dice.map((die, dieIndex) => toRolledDieDto(die, terms[termIndex]?.[dieIndex]));
  });
  const label = outcome.command.parts[index]?.label ?? null;
  return { label, expression: part.expression, total: part.total, dice };
}

function toRolledDieDto(die: RolledDie, model: readonly number[] | undefined): RolledDieDto {
  const { sides, value, status, success } = die;
  return {
    sides,
    value,
    status,
    ...(success === undefined ? {} : { success }),
    ...(model === undefined ? {} : { model: [...model] }),
  };
}
