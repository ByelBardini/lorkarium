import {
  DICE_POSE_STRIDE,
  decodeDiceFrames,
  poseAt,
  type DicePose,
  type DieKind,
} from '@lorkarium/game-core';
import type { DiceThrowDto, DiceThrowModelDto } from '@lorkarium/contracts';
import { DICE_VISIBLE_AFTER_SETTLE_MS, diceOpacityAt } from '@/dice-renderer/dice-fade';

interface PlayingDieModel {
  readonly kind: DieKind;
  readonly startMs: number;
  readonly poses: readonly DicePose[];
}

/** A throw decoded once and pinned to the local clock (`startedAtMs` = its time 0). */
export interface PlayingDiceThrow {
  readonly rollId: string;
  readonly startedAtMs: number;
  readonly aspect: number;
  readonly frameMs: number;
  readonly settleMs: number;
  readonly models: readonly PlayingDieModel[];
}

export interface DiceSceneDie {
  readonly modelIndex: number;
  readonly kind: DieKind;
  readonly pose: DicePose;
}

/** What one roll draws at an instant: its dice already launched and the opacity of the fade. */
export interface DiceSceneThrow {
  readonly rollId: string;
  readonly aspect: number;
  readonly opacity: number;
  readonly dice: readonly DiceSceneDie[];
}

function decodeModel(model: DiceThrowModelDto, index: number): PlayingDieModel {
  if (model.frames.length === 0) {
    throw new RangeError(
      `Dice model ${index} (${model.kind}) has no frames: expected at least 1 pose of ${DICE_POSE_STRIDE} integers.`,
    );
  }
  return { kind: model.kind, startMs: model.startMs, poses: decodeDiceFrames(model.frames) };
}

/** Decodes a throw once and pins it to the local clock, for `diceSceneAt` on every frame.
 *
 *  Example: `playDiceThrow('roll-1', event.throw, performance.now())` */
export function playDiceThrow(
  rollId: string,
  diceThrow: DiceThrowDto,
  startedAtMs: number,
): PlayingDiceThrow {
  const settleMs = Math.max(0, ...diceThrow.models.map((model) => model.settleMs));
  return {
    rollId,
    startedAtMs,
    aspect: diceThrow.aspect,
    frameMs: diceThrow.frameMs,
    settleMs,
    models: diceThrow.models.map(decodeModel),
  };
}

/** Whether the fade of a throw is over at `nowMs`, so it can be dropped.
 *
 *  Example: `throws.filter((played) => !isDiceThrowGone(played, now))` */
export function isDiceThrowGone(played: PlayingDiceThrow, nowMs: number): boolean {
  return nowMs - played.startedAtMs >= played.settleMs + DICE_VISIBLE_AFTER_SETTLE_MS;
}

function diceOf(played: PlayingDiceThrow, tMs: number): DiceSceneDie[] {
  return played.models.flatMap((model, modelIndex) => {
    const pose = poseAt(model.poses, tMs, model.startMs, played.frameMs);
    return pose === null ? [] : [{ modelIndex, kind: model.kind, pose }];
  });
}

function sceneOf(played: PlayingDiceThrow, nowMs: number): DiceSceneThrow | null {
  const tMs = nowMs - played.startedAtMs;
  if (tMs < 0) return null;
  const opacity = diceOpacityAt(played.settleMs, tMs);
  if (opacity === null) return null;
  return { rollId: played.rollId, aspect: played.aspect, opacity, dice: diceOf(played, tMs) };
}

/** What every live roll draws at `nowMs` (local clock): each launched die with the pose of
 *  `poseAt` (a later wave stays out until its `startMs`) and the roll's opacity; a roll not
 *  started yet or past `settleMs + 3600` is left out.
 *
 *  Example: `diceSceneAt([playDiceThrow('roll-1', track, 0)], 500)[0].dice[0].pose` */
export function diceSceneAt(throws: readonly PlayingDiceThrow[], nowMs: number): DiceSceneThrow[] {
  return throws.flatMap((played) => {
    const scene = sceneOf(played, nowMs);
    return scene === null ? [] : [scene];
  });
}
