import { insidePolygon } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { lightViewsOf, topLightAt, type LightViewInput } from '@/renderer/light-view';
import { BRAZIER_ID, CORRIDOR_TORCH_ID, brazier, corridorTorch } from '../support/light-fixtures';
import { northWall } from '../support/wall-fixtures';

const CELL = CELL_WORLD_SIZE;
const SCENE = { widthCells: 20, heightCells: 12 };

function input(overrides: Partial<LightViewInput> = {}): LightViewInput {
  return {
    lights: [corridorTorch(), brazier()],
    walls: [],
    scene: SCENE,
    viewer: { isMaster: true },
    tool: 'lights',
    selectedLightIds: [],
    ...overrides,
  };
}

describe('lightViewsOf', () => {
  it('a player gets no light drawn: only what they light shows, through the fog', () => {
    expect(lightViewsOf(input({ viewer: { isMaster: false } }))).toEqual([]);
  });

  it('the master sees the icons faint outside the lights tool, full with it', () => {
    expect(lightViewsOf(input({ tool: 'select' })).map(({ emphasis }) => emphasis)).toEqual([
      'faint',
      'faint',
    ]);
    expect(lightViewsOf(input()).map(({ emphasis }) => emphasis)).toEqual(['full', 'full']);
  });

  it('the icon stands on the point of the light, in world px, and knows whether it is selected', () => {
    const [torch] = lightViewsOf(input({ selectedLightIds: [CORRIDOR_TORCH_ID] }));

    expect(torch).toMatchObject({
      id: CORRIDOR_TORCH_ID,
      x: 5 * CELL,
      y: 5 * CELL,
      selected: true,
    });
  });

  it('the areas show only with the tool, already cut by the walls', () => {
    const wall = northWall({
      x: 7,
      y: 0,
      width: 0,
      height: 12,
      points: [
        [0, 0],
        [0, 12],
      ],
    } as never);
    const [torch] = lightViewsOf(input({ walls: [wall] }));
    const [outside] = lightViewsOf(input({ tool: 'select' }));

    expect(insidePolygon({ x: 6 * CELL, y: 5 * CELL }, torch?.areas?.dim ?? [])).toBe(true);
    expect(insidePolygon({ x: 8 * CELL, y: 5 * CELL }, torch?.areas?.dim ?? [])).toBe(false);
    expect(outside?.areas).toBeNull();
  });

  it('a light that is out comes with lit false and no areas', () => {
    const [torch] = lightViewsOf(input({ lights: [corridorTorch({ lit: false })] }));

    expect(torch).toMatchObject({ lit: false, areas: null });
  });
});

describe('topLightAt', () => {
  const views = () => lightViewsOf(input());

  it('at zoom 2, a point 15 screen px from the torch finds it', () => {
    const near = { x: 5 * CELL + 7.5, y: 5 * CELL };
    expect(topLightAt(views(), near, 2)?.id).toBe(CORRIDOR_TORCH_ID);
  });

  it('at zoom 2, a point 20 screen px away finds nothing', () => {
    const far = { x: 5 * CELL + 10, y: 5 * CELL };
    expect(topLightAt(views(), far, 2)).toBeNull();
  });

  it('where two lights overlap, the one drawn last wins', () => {
    const stacked = lightViewsOf(input({ lights: [corridorTorch(), brazier({ x: 5, y: 5 })] }));
    expect(topLightAt(stacked, { x: 5 * CELL, y: 5 * CELL }, 1)?.id).toBe(BRAZIER_ID);
  });
});

describe('lightViewsOf, the color of the light', () => {
  it('a fire torch carries the fire tone, 0xff6a2b', () => {
    const [torch] = lightViewsOf(input({ lights: [corridorTorch({ color: 'fire' })] }));

    expect(torch?.color).toBe(0xff6a2b);
  });

  it('a neutral torch carries no tone (null)', () => {
    const [torch] = lightViewsOf(input({ lights: [corridorTorch()] }));

    expect(torch?.color).toBeNull();
  });

  it('a fire torch that is out keeps its tone (the layer draws it ash)', () => {
    const [torch] = lightViewsOf(input({ lights: [corridorTorch({ color: 'fire', lit: false })] }));

    expect(torch).toMatchObject({ lit: false, color: 0xff6a2b });
  });
});
