import { decodeDiceFrames, type DicePose } from '@lorkarium/game-core';
import type { DiceThrowDto, DiceThrowModelDto } from '@lorkarium/contracts';

/** One roll sound to play: when the dice first hit the table (in the throw's clock, 0 = the event
 *  arrived), how hard the throw is (0 to 1) and how many dice are in it. */
export interface DiceRollCue {
  readonly atMs: number;
  readonly strength: number;
  readonly dice: number;
}

/** Box units per second. Gravity alone changes the speed by 2 per frame (−60 at 30 frames per
 *  second), so free fall never counts as the landing. */
export const DICE_LANDING_MIN_SPEED_CHANGE = 8;
/** The speed change of a throw that sounds at full strength. */
export const DICE_LANDING_FULL_SPEED_CHANGE = 40;

/** A roll with nothing to follow (a secret notice, only d7…): one die, a fair throw, now. Nothing
 *  in it hints at the hidden result. */
export const DICE_PLAIN_ROLL_CUE: DiceRollCue = Object.freeze({ atMs: 0, strength: 0.7, dice: 1 });

type Landing = Readonly<{ atMs: number; strength: number }>;

function speedChangesOf(poses: readonly DicePose[], frameMs: number): number[] {
  const seconds = frameMs / 1000;
  const speeds = poses.slice(1).map((pose, index) => {
    const from = poses[index]?.position ?? pose.position;
    const { x, y, z } = pose.position;
    return { x: (x - from.x) / seconds, y: (y - from.y) / seconds, z: (z - from.z) / seconds };
  });
  return speeds.map((speed, index) => {
    const before = speeds[index - 1] ?? speed;
    return Math.hypot(speed.x - before.x, speed.y - before.y, speed.z - before.z);
  });
}

/** The first hit of a die (a die laid down without one lands at its launch) and its hardest one. */
function landingOf(model: DiceThrowModelDto, frameMs: number): Landing {
  const changes = speedChangesOf(decodeDiceFrames(model.frames), frameMs);
  const first = changes.findIndex((change) => change >= DICE_LANDING_MIN_SPEED_CHANGE);
  const hardest = Math.max(0, ...changes);
  return {
    atMs: model.startMs + Math.max(0, first) * frameMs,
    strength: Math.min(1, hardest / DICE_LANDING_FULL_SPEED_CHANGE),
  };
}

function cueOf(landings: readonly Landing[]): DiceRollCue {
  return {
    atMs: Math.min(...landings.map((landing) => landing.atMs)),
    strength: Math.max(...landings.map((landing) => landing.strength)),
    dice: landings.length,
  };
}

/** One roll sound per wave of a throw (the first throw, then each explosion or reroll), timed to
 *  the first die of the wave hitting the table, as hard as its hardest die, in time order.
 *
 *  Example: `diceRollCuesOf(event.throw) // [{ atMs: 66.7, strength: 0.75, dice: 2 }]` */
export function diceRollCuesOf(diceThrow: DiceThrowDto): DiceRollCue[] {
  const waves = new Map<number, Landing[]>();
  diceThrow.models.forEach((model) => {
    const wave = waves.get(model.startMs) ?? [];
    wave.push(landingOf(model, diceThrow.frameMs));
    waves.set(model.startMs, wave);
  });
  return [...waves.values()].map(cueOf).sort((a, b) => a.atMs - b.atMs);
}
