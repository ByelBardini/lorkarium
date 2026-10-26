import { describe, expect, it } from 'vitest';
import { diceBoxOf } from '@lorkarium/game-core';
import { DIE_LAUNCH_DRAWS, dieLaunchOf } from '../../../src/infrastructure/dice-physics/die-launch';
import { SeededDiceRandomFake } from '../../support/dice-fakes';

const BOX = diceBoxOf(16 / 9);

describe('dieLaunchOf', () => {
  it('takes exactly 12 draws, whatever the numbers are', () => {
    for (const seed of [1, 2, 3]) {
      const random = new SeededDiceRandomFake(seed);
      dieLaunchOf(random, BOX);
      expect(random.draws).toBe(DIE_LAUNCH_DRAWS);
    }
  });

  it('spawns 100 dice one diameter away from every wall, 4 to 6 units high', () => {
    const random = new SeededDiceRandomFake(9);
    const spawns = Array.from({ length: 100 }, () => dieLaunchOf(random, BOX).position);
    const misplaced = spawns.filter(
      (p) =>
        Math.abs(p.x) > BOX.halfWidth - 2 ||
        Math.abs(p.z) > BOX.halfDepth - 2 ||
        p.y < 4 ||
        p.y > 6,
    );
    expect(misplaced).toEqual([]);
  });

  it('throws each die fast (18 to 28 units/s across the floor) and never upward', () => {
    const random = new SeededDiceRandomFake(9);
    const velocities = Array.from({ length: 100 }, () => dieLaunchOf(random, BOX).velocity);
    const speeds = velocities.map((v) => Math.hypot(v.x, v.z));
    expect(Math.min(...speeds)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...speeds)).toBeLessThanOrEqual(28);
    expect(velocities.every((v) => v.y <= 0)).toBe(true);
  });

  it('starts every die on a unit quaternion', () => {
    const random = new SeededDiceRandomFake(4);
    const norms = Array.from({ length: 50 }, () => {
      const { x, y, z, w } = dieLaunchOf(random, BOX).quaternion;
      return Math.hypot(x, y, z, w);
    });
    expect(norms.every((norm) => Math.abs(norm - 1) < 1e-9)).toBe(true);
  });

  it('the same random state gives the same launch', () => {
    expect(dieLaunchOf(new SeededDiceRandomFake(5), BOX)).toEqual(
      dieLaunchOf(new SeededDiceRandomFake(5), BOX),
    );
  });
});
