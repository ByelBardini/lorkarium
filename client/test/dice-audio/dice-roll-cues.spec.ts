import { describe, expect, it } from 'vitest';
import { encodeDiceFrames, IDENTITY_QUATERNION, type DicePose } from '@lorkarium/game-core';
import type { DiceThrowDto, DiceThrowModelDto } from '@lorkarium/contracts';
import { DICE_PLAIN_ROLL_CUE, diceRollCuesOf } from '@/dice-audio/dice-roll-cues';

const FRAME_MS = 1000 / 30;

function at(y: number): DicePose {
  return { position: { x: 0, y, z: 0 }, quaternion: IDENTITY_QUATERNION };
}

function model(heights: readonly number[], overrides: Partial<DiceThrowModelDto> = {}) {
  const frames = encodeDiceFrames(heights.map(at));
  return { kind: 'd6' as const, startMs: 0, settleMs: 2000, frames, ...overrides };
}

function throwOf(...models: DiceThrowModelDto[]): DiceThrowDto {
  return { aspect: 1.5, frameMs: FRAME_MS, models };
}

describe('diceRollCuesOf', () => {
  it('one die is one roll, timed to its first hit and as hard as it', () => {
    const cues = diceRollCuesOf(throwOf(model([3, 2, 1, 1, 1])));

    expect(cues).toHaveLength(1);
    expect(cues[0]?.atMs).toBeCloseTo(2 * FRAME_MS);
    expect(cues[0]?.strength).toBeCloseTo(30 / 40);
    expect(cues[0]?.dice).toBe(1);
  });

  it('a die bouncing many times is still one roll: the sound never restarts per hit', () => {
    const bouncing = model([3, 2, 1, 2, 1, 2, 1, 1.5, 1, 1, 1]);
    expect(diceRollCuesOf(throwOf(bouncing))).toHaveLength(1);
  });

  it('dice of the same wave are one roll: the first to land, the hardest hit, all of them', () => {
    const late = model([5, 4, 3, 2, 1, 1]);
    const early = model([20, 10, 0, 0]);
    const [cue, ...rest] = diceRollCuesOf(throwOf(late, early));

    expect(rest).toEqual([]);
    expect(cue?.atMs).toBeCloseTo(2 * FRAME_MS);
    expect(cue?.strength).toBe(1);
    expect(cue?.dice).toBe(2);
  });

  it('an explosion (a later wave) is a roll of its own, in time order', () => {
    const exploded = model([3, 2, 1, 1], { startMs: 1800 });
    const cues = diceRollCuesOf(throwOf(exploded, model([3, 2, 1, 1])));

    expect(cues.map((cue) => Math.round(cue.atMs))).toEqual([67, 1867]);
  });

  it('free fall under gravity alone (2 units/s more each frame) is no landing', () => {
    const [cue] = diceRollCuesOf(throwOf(model([10, 9.9, 9.73, 9.5, 9.2, 8.83])));
    expect(cue?.atMs).toBe(0);
    expect(cue?.strength).toBeLessThan(0.2);
  });

  it('a die standing still from its launch lands then, softly', () => {
    expect(diceRollCuesOf(throwOf(model([0], { startMs: 500 })))).toEqual([
      { atMs: 500, strength: 0, dice: 1 },
    ]);
  });
});

describe('DICE_PLAIN_ROLL_CUE', () => {
  it('is one die thrown fairly, now', () => {
    expect(DICE_PLAIN_ROLL_CUE).toEqual({ atMs: 0, strength: 0.7, dice: 1 });
  });
});
