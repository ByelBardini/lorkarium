import {
  coneOf,
  insideCone,
  insidePolygon,
  lightRange,
  wall,
  type LightSource,
  type Wall,
} from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { lightAreasOf } from '@/renderer/light-areas';

const CELL = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };
const TORCH: LightSource = { center: { x: 5, y: 5 }, range: lightRange(2, 2), cone: null };

function wallAtX(x: number): Wall {
  return wall({
    kind: 'wall',
    shape: 'line',
    x,
    y: 0,
    width: 0,
    height: 12,
    points: [
      [0, 0],
      [0, 12],
    ],
    doorState: null,
  });
}

function world(x: number, y: number) {
  return { x: x * CELL, y: y * CELL };
}

describe('lightAreasOf', () => {
  it('the bright area holds the point 1 cell away and the dim one the point 3 cells away', () => {
    const areas = lightAreasOf(TORCH, [], SCENE);

    expect(insidePolygon(world(6, 5), areas.bright)).toBe(true);
    expect(insidePolygon(world(8, 5), areas.bright)).toBe(false);
    expect(insidePolygon(world(8, 5), areas.dim)).toBe(true);
  });

  it('a wall at x = 7 cuts the dim area: the point 3 cells away behind it is dark', () => {
    const areas = lightAreasOf(TORCH, [wallAtX(7)], SCENE);

    expect(insidePolygon(world(8, 5), areas.dim)).toBe(false);
  });

  it('the same light with the same walls gives back the very same areas (kept in memory)', () => {
    const first = lightAreasOf(TORCH, [wallAtX(7)], SCENE);
    const again = lightAreasOf({ ...TORCH }, [wallAtX(7)], SCENE);

    expect(again).toBe(first);
  });

  it('moving the light works the areas out again', () => {
    const before = lightAreasOf(TORCH, [], SCENE);
    const moved = lightAreasOf({ ...TORCH, center: { x: 10, y: 5 } }, [], SCENE);

    expect(moved).not.toBe(before);
    expect(insidePolygon(world(11, 5), moved.bright)).toBe(true);
  });

  it('changing a wall works the areas out again', () => {
    const behindTheWall = lightAreasOf(TORCH, [wallAtX(7)], SCENE);
    const wallFurther = lightAreasOf(TORCH, [wallAtX(9)], SCENE);

    expect(wallFurther).not.toBe(behindTheWall);
    expect(insidePolygon(world(8, 5), wallFurther.dim)).toBe(true);
  });

  it('a light of bright 0 has no bright area', () => {
    const candle: LightSource = { center: { x: 5, y: 5 }, range: lightRange(0, 3), cone: null };

    expect(lightAreasOf(candle, [], SCENE).bright).toEqual([]);
  });
});

describe('lightAreasOf of a spotlight', () => {
  const spotlight = (facing: number): LightSource => ({
    center: { x: 5, y: 5 },
    range: lightRange(2, 2),
    cone: coneOf(facing, 60),
  });

  it('a spotlight of 60° lights only its cone, and a wall at x = 7 cuts it', () => {
    const light = spotlight(0);
    const areas = lightAreasOf(light, [wallAtX(7)], SCENE);

    for (const { x, y } of [...areas.bright, ...areas.dim]) {
      expect(insideCone(light.cone, light.center, { x: x / CELL, y: y / CELL })).toBe(true);
      expect(x).toBeLessThanOrEqual(7 * CELL + 1e-6);
    }
    expect(insidePolygon(world(6, 5), areas.bright)).toBe(true);
    expect(insidePolygon(world(4, 5), areas.dim)).toBe(false);
  });

  it('the same spotlight aimed elsewhere is another area, and aimed the same is the same instance', () => {
    const right = lightAreasOf(spotlight(0), [], SCENE);

    expect(lightAreasOf(spotlight(180), [], SCENE)).not.toBe(right);
    expect(lightAreasOf(spotlight(0), [], SCENE)).toBe(right);
  });
});
