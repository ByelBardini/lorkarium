import type { LightDto, WallDto } from '@lorkarium/contracts';
import { coneOf, insideCone, insidePolygon } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import {
  lightViewsOf,
  lightsInBand,
  topLightAt,
  type LightView,
  type LightViewInput,
} from '@/renderer/light-view';
import { sightGeometryOf } from '@/lib/sight-geometry';
import { statue } from '../support/sight-blocker-fixtures';
import { VHARN_SCENE } from '../support/table-session-fixtures';
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

describe('lightViewsOf of a spotlight', () => {
  const SPOTLIGHT = corridorTorch({ facing: 90, angle: 60 });

  it('with the lights tool, the areas of a spotlight of 60° lie in its cone', () => {
    const [view] = lightViewsOf(input({ lights: [SPOTLIGHT] }));
    const cone = coneOf(90, 60);

    for (const { x, y } of view?.areas?.dim ?? []) {
      expect(insideCone(cone, { x: 5, y: 5 }, { x: x / CELL, y: y / CELL })).toBe(true);
    }
    expect(insidePolygon({ x: 5 * CELL, y: 7 * CELL }, view?.areas?.dim ?? [])).toBe(true);
  });

  it('a player still gets no light drawn', () => {
    expect(lightViewsOf(input({ lights: [SPOTLIGHT], viewer: { isMaster: false } }))).toEqual([]);
  });
});

describe('lightViewsOf with a blocker', () => {
  // The torch at (5, 5) in the lights tool; a statue at (7, 3), four cells tall, cuts its right.
  const SCENE_DTO = { ...VHARN_SCENE, vision: 'dark' as const };
  const STATUE = statue({ col: 7, row: 3, height: 4 });
  const NO_WALL_DTOS: readonly WallDto[] = [];

  function areaWith(light: LightDto) {
    const tokens = [STATUE];
    const geometry = sightGeometryOf({ scene: SCENE_DTO, tokens, walls: NO_WALL_DTOS }, new Map());
    const [view] = lightViewsOf(input({ lights: [light], walls: NO_WALL_DTOS, geometry }));
    return view?.areas?.dim ?? [];
  }

  it('what the torch lights stops at the statue', () => {
    const beyond = { x: 9 * CELL, y: 5 * CELL };

    expect(insidePolygon(beyond, areaWith(corridorTorch()))).toBe(false);
  });

  it('the torch inside the statue lights past it', () => {
    const inside = corridorTorch({ x: 7.5, y: 5 });

    expect(Math.max(...areaWith(inside).map(({ x }) => x))).toBeCloseTo(15.5 * CELL, 6);
  });
});

describe('lightsInBand', () => {
  const BAND = { x: 0, y: 0, width: 640, height: 640 };
  const square = (left: number, top: number, side: number) => [
    { x: left, y: top },
    { x: left + side, y: top },
    { x: left + side, y: top + side },
    { x: left, y: top + side },
  ];
  const lightOf = (id: string, x: number, y: number, areas: LightView['areas']): LightView => ({
    id,
    x,
    y,
    lit: areas !== null,
    color: null,
    facing: 0,
    angle: 360,
    emphasis: 'full',
    selected: false,
    areas,
  });

  it('keeps a light whose icon is out but whose dim area reaches into the band', () => {
    const reaching = lightOf('reaching', 800, 300, {
      bright: square(760, 260, 80),
      dim: square(600, 100, 400),
    });

    expect(lightsInBand([reaching], BAND)).toEqual([reaching]);
  });

  it('drops a light whose icon and areas are all out of the band', () => {
    const far = lightOf('far', 1000, 1000, {
      bright: square(960, 960, 80),
      dim: square(900, 900, 200),
    });

    expect(lightsInBand([far], BAND)).toEqual([]);
  });

  it('keeps a light that is out (no areas) with its icon in the band', () => {
    const out = lightOf('out', 320, 320, null);

    expect(lightsInBand([out], BAND)).toEqual([out]);
  });

  it('gives back the very same array when no light falls out', () => {
    const lights = [lightOf('out', 320, 320, null)];

    expect(lightsInBand(lights, BAND)).toBe(lights);
  });

  it('a band of negative width throws, naming the band', () => {
    expect(() => lightsInBand([], { x: 0, y: 0, width: -2, height: 640 })).toThrow(/"width":-2/);
  });
});
