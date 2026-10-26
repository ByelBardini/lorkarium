import {
  DICE_FRAME_MS,
  DIE_KINDS,
  decodeDiceFrames,
  diceBoxOf,
  dieShapeOf,
  restingValueOf,
  type DicePose,
  type DieKind,
} from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  CannonDicePhysics,
  type CannonDicePhysicsOptions,
} from '../../../src/infrastructure/dice-physics/cannon-dice-physics';
import { DIE_LAUNCH_DRAWS } from '../../../src/infrastructure/dice-physics/die-launch';
import type { DieThrowModel } from '../../../src/modules/dice/dice-physics.port';
import { SeededDiceRandomFake } from '../../support/dice-fakes';

const WIDE = 16 / 9;
// Seed 23 lands its first d6 leaning on the front wall (31°) and its second on an edge (45°).
const TILTED_SEED = 23;

function physicsOf(seed: number, options: CannonDicePhysicsOptions = {}): CannonDicePhysics {
  return new CannonDicePhysics(new SeededDiceRandomFake(seed), options);
}

function throwOf(seed: number, kinds: readonly DieKind[], aspect = WIDE): DieThrowModel[] {
  return [...physicsOf(seed).throw({ kinds, aspect, startMs: 0 }).models];
}

function lastPosesOf(model: DieThrowModel): [DicePose, DicePose] {
  const poses = decodeDiceFrames(model.frames);
  const last = poses[poses.length - 1];
  const before = poses[poses.length - 2];
  if (last === undefined || before === undefined) throw new Error('expected at least 2 poses');
  return [before, last];
}

function poseGap(a: DicePose, b: DicePose): number {
  const position = Math.hypot(
    ...(['x', 'y', 'z'] as const).map((k) => a.position[k] - b.position[k]),
  );
  const rotation = Math.hypot(
    ...(['x', 'y', 'z', 'w'] as const).map((k) => a.quaternion[k] - b.quaternion[k]),
  );
  return Math.max(position, rotation);
}

describe('CannonDicePhysics', () => {
  describe('a wave of a d20 and a d6', () => {
    const models = throwOf(7, ['d20', 'd6']);

    it('gives one model per die, in the order asked, starting at the wave start', () => {
      expect(models.map((model) => [model.kind, model.startMs])).toEqual([
        ['d20', 0],
        ['d6', 0],
      ]);
    });

    it('stops every die within 5 s, settleMs being the instant of its last frame', () => {
      for (const model of models) {
        const frames = decodeDiceFrames(model.frames).length;
        expect(model.settleMs).toBeLessThanOrEqual(5000);
        expect(model.settleMs).toBe(Math.ceil((frames - 1) * DICE_FRAME_MS));
      }
    });

    it('ends every die at rest: its last two frames are equal to 1e-3', () => {
      for (const model of models) {
        const [before, last] = lastPosesOf(model);
        expect(poseGap(before, last)).toBeLessThanOrEqual(1e-3);
      }
    });

    it('reads the value from the last pose sent, lying flat (tilt up to 10°)', () => {
      for (const model of models) {
        const [, last] = lastPosesOf(model);
        const face = restingValueOf(model.kind, last.quaternion);
        expect(model.value).toBe(face.value);
        expect(face.tiltDegrees).toBeLessThanOrEqual(10);
      }
    });
  });

  it.each([0.5, WIDE, 3])(
    'keeps every frame inside the box of aspect %s (walls hold the dice)',
    (aspect) => {
      const box = diceBoxOf(aspect);
      const kinds: DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
      const poses = [1, 2, 3].flatMap((seed) =>
        throwOf(seed, kinds, aspect).flatMap((model) => decodeDiceFrames(model.frames)),
      );
      const outside = poses.filter(
        ({ position: p }) =>
          Math.abs(p.x) > box.halfWidth || Math.abs(p.z) > box.halfDepth || p.y < 0,
      );
      expect(outside).toEqual([]);
    },
  );

  it('gives the first die the same flight alone or among 20 dice (dice never collide)', () => {
    const alone = throwOf(7, ['d20']);
    const crowded = throwOf(
      7,
      Array.from({ length: 20 }, (): DieKind => 'd20'),
    );
    expect(crowded[0]).toEqual(alone[0]);
  });

  it('repeats the same throw for the same seed, and another one for another seed', () => {
    expect(throwOf(11, ['d12', 'd8'])).toEqual(throwOf(11, ['d12', 'd8']));
    expect(throwOf(12, ['d12', 'd8'])[0]?.frames).not.toEqual(throwOf(11, ['d12'])[0]?.frames);
  });

  it('shifts the whole timeline by startMs, with the same frames', () => {
    const atZero = throwOf(5, ['d10'])[0];
    const later = physicsOf(5).throw({ kinds: ['d10'], aspect: WIDE, startMs: 1500 }).models[0];
    expect(later?.startMs).toBe(1500);
    expect(later?.settleMs).toBe((atZero?.settleMs ?? 0) + 1500);
    expect(later?.frames).toEqual(atZero?.frames);
  });

  it('lands the seed-23 d6 leaning on a wall when rethrowing is off', () => {
    const [model] = physicsOf(TILTED_SEED, { maxRethrows: 0 }).throw({
      kinds: ['d6'],
      aspect: WIDE,
      startMs: 0,
    }).models;
    const [, last] = lastPosesOf(model as DieThrowModel);
    expect(model?.rethrows).toBe(0);
    expect(restingValueOf('d6', last.quaternion).tiltDegrees).toBeGreaterThan(10);
  });

  it('rethrows the leaning seed-23 d6 until it lies flat (2 rethrows)', () => {
    const [model] = throwOf(TILTED_SEED, ['d6']);
    const [, last] = lastPosesOf(model as DieThrowModel);
    expect(model?.rethrows).toBe(2);
    expect(restingValueOf('d6', last.quaternion).tiltDegrees).toBeLessThanOrEqual(10);
  });

  it('stops after 3 rethrows when no landing is ever flat enough, keeping the 4th', () => {
    const random = new SeededDiceRandomFake(7);
    const physics = new CannonDicePhysics(random, { maxTiltDegrees: -1 });
    const [model] = physics.throw({ kinds: ['d20'], aspect: WIDE, startMs: 0 }).models;
    expect(model?.rethrows).toBe(3);
    expect(random.draws).toBe(4 * DIE_LAUNCH_DRAWS);
  });

  it.each(DIE_KINDS.map((kind) => [kind]))('%s stops on one of its own face values', (kind) => {
    const values = new Set(dieShapeOf(kind).faces.map((face) => face.value));
    const models = [1, 2, 3, 4].flatMap((seed) => throwOf(seed, [kind]));
    expect(models.every((model) => values.has(model.value))).toBe(true);
  });

  it('an empty wave gives no model and draws nothing', () => {
    const random = new SeededDiceRandomFake(1);
    const result = new CannonDicePhysics(random).throw({ kinds: [], aspect: WIDE, startMs: 0 });
    expect(result.models).toEqual([]);
    expect(random.draws).toBe(0);
  });

  it.each([0, 0.4, 3.5, Number.NaN])(
    'aspect %s is refused with a RangeError citing 0.5 to 3',
    (aspect) => {
      const physics = physicsOf(1);
      expect(() => physics.throw({ kinds: ['d6'], aspect, startMs: 0 })).toThrow(
        new RangeError(`Dice box aspect ${aspect} is invalid: expected 0.5 to 3.`),
      );
    },
  );
});

function chiSquareOf(values: readonly number[], faces: readonly number[]): number {
  const expected = values.length / faces.length;
  return faces.reduce((sum, face) => {
    const observed = values.filter((value) => value === face).length;
    return sum + (observed - expected) ** 2 / expected;
  }, 0);
}

function valuesOf(kind: DieKind, throws: number, seed: number): number[] {
  const physics = physicsOf(seed);
  return Array.from({ length: throws }, () => {
    const [model] = physics.throw({ kinds: [kind], aspect: WIDE, startMs: 0 }).models;
    return model?.value ?? 0;
  });
}

describe('CannonDicePhysics fairness (chi-square at p 0.01)', () => {
  it('600 d6 throws stay below 15.09 (5 degrees of freedom)', () => {
    expect(chiSquareOf(valuesOf('d6', 600, 101), [1, 2, 3, 4, 5, 6])).toBeLessThan(15.09);
  });

  it('1000 d20 throws stay below 36.19 (19 degrees of freedom)', () => {
    const faces = Array.from({ length: 20 }, (_, index) => index + 1);
    expect(chiSquareOf(valuesOf('d20', 1000, 202), faces)).toBeLessThan(36.19);
  });
});
