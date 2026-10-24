import { coneOf, insidePolygon, sightArea, wall, type Cone } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { REMEMBERED_AREAS_MAX, rememberedWorldAreaOf, worldAreaOf } from '@/renderer/world-area';

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

describe('rememberedWorldAreaOf', () => {
  // A wall down x = 7 from top to bottom, two cells right of the center.
  const BLOCKER = wall({
    kind: 'wall',
    shape: 'line',
    x: 7,
    y: 0,
    width: 0,
    height: 12,
    points: [
      [0, 0],
      [0, 12],
    ],
    doorState: null,
  });

  it('the same center, reach, field and walls give back the very same polygon', () => {
    const walls = [BLOCKER];
    const first = rememberedWorldAreaOf(CENTER, walls, SCENE, 4);
    expect(rememberedWorldAreaOf(CENTER, walls, SCENE, 4)).toBe(first);
  });

  it('a new array of walls, now with a wall in the way, works the polygon out again, smaller', () => {
    const open = rememberedWorldAreaOf(CENTER, [], SCENE, 4);
    const cut = rememberedWorldAreaOf(CENTER, [BLOCKER], SCENE, 4);
    const beyond = { x: 8 * CELL, y: 5.5 * CELL };
    expect(insidePolygon(beyond, open)).toBe(true);
    expect(insidePolygon(beyond, cut)).toBe(false);
  });

  it('past its limit the memory starts over: the first area is worked out again', () => {
    const walls = [BLOCKER];
    const first = rememberedWorldAreaOf({ x: 1.5, y: 1.5 }, walls, SCENE, 2);
    for (let index = 0; index < REMEMBERED_AREAS_MAX; index += 1) {
      rememberedWorldAreaOf({ x: 2 + index / 1000, y: 1.5 }, walls, SCENE, 2);
    }
    const again = rememberedWorldAreaOf({ x: 1.5, y: 1.5 }, walls, SCENE, 2);
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});
