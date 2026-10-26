import { describe, expect, it } from 'vitest';
import type { DiceThrowDto } from '@lorkarium/contracts';
import {
  DICE_FRAME_MS,
  IDENTITY_QUATERNION,
  decodeDiceFrames,
  encodeDiceFrames,
  poseAt,
  quaternionFromAxisAngle,
  type DicePose,
} from '@lorkarium/game-core';
import { diceSceneAt, isDiceThrowGone, playDiceThrow } from '@/dice-renderer/dice-playback';

const STARTED_AT_MS = 10_000;

function rollingPoses(count: number, fromX: number): DicePose[] {
  return Array.from({ length: count }, (_, index) => ({
    position: { x: fromX + index * 0.3, y: 1, z: 0 },
    quaternion: quaternionFromAxisAngle({ x: 0, y: 0, z: 1 }, index * 25),
  }));
}

// First wave: a d20 launched at 0 that stops at 1000 ms. Second wave (an explosion): a d6
// launched at 1300 ms (300 ms after the first stopped) that stops at 2000 ms.
const D20_FRAMES = encodeDiceFrames(rollingPoses(31, -2));
const D6_FRAMES = encodeDiceFrames(rollingPoses(22, 1));
const TWO_WAVES: DiceThrowDto = {
  aspect: 16 / 9,
  frameMs: DICE_FRAME_MS,
  models: [
    { kind: 'd20', startMs: 0, settleMs: 1000, frames: D20_FRAMES },
    { kind: 'd6', startMs: 1300, settleMs: 2000, frames: D6_FRAMES },
  ],
};

function sceneAt(elapsedMs: number) {
  return diceSceneAt(
    [playDiceThrow('roll-1', TWO_WAVES, STARTED_AT_MS)],
    STARTED_AT_MS + elapsedMs,
  );
}

describe('diceSceneAt', () => {
  it('each die shown carries the pose poseAt gives at the elapsed time of its throw', () => {
    const [scene] = sceneAt(1500);
    expect(scene?.dice).toEqual([
      { modelIndex: 0, kind: 'd20', pose: poseAt(decodeDiceFrames(D20_FRAMES), 1500, 0) },
      { modelIndex: 1, kind: 'd6', pose: poseAt(decodeDiceFrames(D6_FRAMES), 1500, 1300) },
    ]);
  });

  it('mid-flight the pose is interpolated between two recorded frames', () => {
    const [scene] = sceneAt(DICE_FRAME_MS * 2.5);
    expect(scene?.dice[0]?.pose.position.x).toBeCloseTo(-2 + 2.5 * 0.3, 2);
  });

  it('before the startMs of the second wave its dice are not in the scene', () => {
    const [scene] = sceneAt(1299);
    expect(scene?.dice.map((die) => die.kind)).toEqual(['d20']);
  });

  it('the scene carries the roll id, the aspect of the roller and the opacity of the fade', () => {
    const [scene] = sceneAt(2000 + 3300);
    expect(scene?.rollId).toBe('roll-1');
    expect(scene?.aspect).toBe(16 / 9);
    expect(scene?.opacity).toBeCloseTo(0.5, 9);
  });

  it('the fade waits for the last die of the roll, not the first to stop', () => {
    const [scene] = sceneAt(1000 + 3600);
    expect(scene?.opacity).toBe(1);
  });

  it('after the last settleMs + 3600 the roll leaves the scene', () => {
    expect(sceneAt(2000 + 3600)).toEqual([]);
  });

  it('before its own start a roll is not in the scene', () => {
    expect(sceneAt(-1)).toEqual([]);
  });

  it('two rolls are drawn side by side, each on its own clock', () => {
    const first = playDiceThrow('roll-1', TWO_WAVES, STARTED_AT_MS);
    const second = playDiceThrow('roll-2', TWO_WAVES, STARTED_AT_MS + 4000);
    const scene = diceSceneAt([first, second], STARTED_AT_MS + 2000 + 3600);
    expect(scene.map((roll) => roll.rollId)).toEqual(['roll-2']);
  });
});

describe('playDiceThrow', () => {
  it('a model with no frames is refused, naming the model', () => {
    const empty: DiceThrowDto = {
      ...TWO_WAVES,
      models: [{ kind: 'd4', startMs: 0, settleMs: 0, frames: [] }],
    };
    expect(() => playDiceThrow('roll-1', empty, 0)).toThrow(
      'Dice model 0 (d4) has no frames: expected at least 1 pose of 7 integers.',
    );
  });

  it('a die that only has one frame stays on it for the whole roll', () => {
    const still = encodeDiceFrames([
      { position: { x: 0, y: 1, z: 0 }, quaternion: IDENTITY_QUATERNION },
    ]);
    const track: DiceThrowDto = {
      ...TWO_WAVES,
      models: [{ kind: 'd8', startMs: 0, settleMs: 0, frames: still }],
    };
    const [scene] = diceSceneAt([playDiceThrow('roll-1', track, 0)], 2500);
    expect(scene?.dice[0]?.pose.position).toEqual({ x: 0, y: 1, z: 0 });
  });
});

describe('isDiceThrowGone', () => {
  const played = playDiceThrow('roll-1', TWO_WAVES, STARTED_AT_MS);

  it('a roll is still alive one millisecond before the end of its fade', () => {
    expect(isDiceThrowGone(played, STARTED_AT_MS + 2000 + 3599)).toBe(false);
  });

  it('a roll is gone once its fade is over', () => {
    expect(isDiceThrowGone(played, STARTED_AT_MS + 2000 + 3600)).toBe(true);
  });
});
