import { coneOf, sightArea, type Cone } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { worldAreaOf } from '@/renderer/world-area';

const CELL = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };
const CENTER = { x: 5.5, y: 5.5 };

function cone(direction: number, angle: number): Cone {
  const value = coneOf(direction, angle);
  if (!value) throw new Error('a cone of 360° is every side');
  return value;
}

describe('worldAreaOf', () => {
  it('a reach of 0 has no area', () => {
    expect(worldAreaOf(CENTER, [], SCENE, 0)).toEqual([]);
  });

  it('a lantern of 90° gives its cone in world px, apex included, within the reach', () => {
    const area = worldAreaOf(CENTER, [], SCENE, 3, { cone: cone(0, 90), around: null });

    expect(area).toContainEqual({ x: 5.5 * CELL, y: 5.5 * CELL });
    for (const { x, y } of area) {
      expect(Math.hypot(x - 5.5 * CELL, y - 5.5 * CELL)).toBeLessThanOrEqual(3 * CELL + 1e-6);
      expect(x).toBeGreaterThanOrEqual(5.5 * CELL - 1e-6);
    }
  });

  it('without a field it is the sight area of the game-core, cell by cell × 64', () => {
    const expected = sightArea(CENTER, [], SCENE, 3).map(({ x, y }) => ({
      x: x * CELL,
      y: y * CELL,
    }));

    expect(worldAreaOf(CENTER, [], SCENE, 3)).toEqual(expected);
  });
});
