import type { WallDto } from '@lorkarium/contracts';
import { coneOf, insidePolygon, lightRange, type Wall } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { gameWallOf } from '@/lib/wall-geometry';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { lightAreasOf } from '@/renderer/light-areas';
import {
  lightTintViewOf,
  type LightTintInput,
  type LightTintView,
} from '@/renderer/light-tint-view';
import { sightGeometryOf } from '@/lib/sight-geometry';
import {
  OGRE_ID,
  RIGHT_STRIP_OUTLINE,
  TRACED_ASSET_ID,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { brazier, corridorTorch } from '../support/light-fixtures';
import { LYRA_ID, VHARN_SCENE, lyra } from '../support/table-session-fixtures';
import { cellDoor } from '../support/wall-fixtures';

const DARK = { ...VHARN_SCENE, vision: 'dark' } as const;
const SIZE = { widthCells: DARK.widthCells, heightCells: DARK.heightCells };
const INFERNAL_TORCH = corridorTorch({ color: 'infernal' });
const NO_WALLS: readonly Wall[] = [];

function input(overrides: Partial<LightTintInput> = {}): LightTintInput {
  return {
    scene: DARK,
    walls: [],
    lights: [INFERNAL_TORCH],
    tokens: [],
    landing: new Map(),
    ...overrides,
  };
}

describe('lightTintViewOf', () => {
  it('an infernal torch at (5, 5) in a dark scene tints its bright and dim areas with 0xff3b3b', () => {
    const view = lightTintViewOf(input());

    const torch = { center: { x: 5, y: 5 }, range: lightRange(4, 4), cone: null };
    const areas = lightAreasOf(torch, NO_WALLS, SIZE);
    expect(view?.tints).toEqual([{ color: 0xff3b3b, bright: areas.bright, dim: areas.dim }]);
    expect(view?.tints[0]?.dim).toBe(areas.dim);
    expect([view?.width, view?.height]).toEqual([
      DARK.widthCells * CELL_WORLD_SIZE,
      DARK.heightCells * CELL_WORLD_SIZE,
    ]);
  });

  it('a closed door cuts the tinted area like it cuts the light', () => {
    const door = cellDoor();
    const view = lightTintViewOf(input({ walls: [door] }));

    const torch = { center: { x: 5, y: 5 }, range: lightRange(4, 4), cone: null };
    const cut = lightAreasOf(torch, [gameWallOf(door)], SIZE);
    expect(view?.tints[0]?.dim).toEqual(cut.dim);
    expect(view?.tints[0]?.dim).not.toEqual(lightAreasOf(torch, NO_WALLS, SIZE).dim);
  });

  it.each([
    ['a neutral light', input({ lights: [corridorTorch()] })],
    [
      'an infernal light that is out',
      input({ lights: [corridorTorch({ color: 'infernal', lit: false })] }),
    ],
    ['a daylight scene', input({ scene: { ...DARK, vision: 'daylight' } })],
    ['a scene with sight off', input({ scene: { ...DARK, vision: 'off' } })],
  ])('%s tints nothing (null)', (_name, given) => {
    expect(lightTintViewOf(given)).toBeNull();
  });

  it('two colored lights give two tints, the map lights first and then the tokens', () => {
    const view = lightTintViewOf(
      input({
        lights: [brazier({ color: 'moon' }), INFERNAL_TORCH],
        tokens: [
          lyra({ light: { bright: 2, dim: 0, color: 'necrotic', angle: 360 }, lightLit: true }),
        ],
      }),
    );

    expect(view?.tints.map(({ color }) => color)).toEqual([0x9ec3ff, 0xff3b3b, 0x7fd66b]);
  });

  it('the same input gives the same key, and another color another key', () => {
    const same = lightTintViewOf(input())?.key;
    const recolored = lightTintViewOf(input({ lights: [corridorTorch({ color: 'fire' })] }))?.key;

    expect(lightTintViewOf(input())?.key).toBe(same);
    expect(recolored).not.toBe(same);
  });

  it('a custom #336699 light tints with 0x336699', () => {
    const view = lightTintViewOf(input({ lights: [corridorTorch({ color: '#336699' })] }));

    expect(view?.tints.map(({ color }) => color)).toEqual([0x336699]);
  });

  it('#336699 and #336698, one digit apart, draw under different keys', () => {
    const first = lightTintViewOf(input({ lights: [corridorTorch({ color: '#336699' })] }));
    const nudged = lightTintViewOf(input({ lights: [corridorTorch({ color: '#336698' })] }));

    expect(nudged?.key).not.toBe(first?.key);
    expect(nudged).not.toBe(first);
    expect(nudged?.tints.map(({ color }) => color)).toEqual([0x336698]);
  });

  it('the light of a dragged Lyra tints from the cell where she would land', () => {
    const fire = lyra({
      col: 3,
      row: 4,
      light: { bright: 2, dim: 2, color: 'fire', angle: 360 },
      lightLit: true,
    });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2, facing: 0 }]]);

    const view = lightTintViewOf(input({ lights: [], tokens: [fire], landing }));

    const landed = { center: { x: 8.5, y: 2.5 }, range: lightRange(2, 2), cone: null };
    expect(view?.tints[0]?.dim).toBe(lightAreasOf(landed, NO_WALLS, SIZE).dim);
  });
});

describe('lightTintViewOf of a spotlight', () => {
  const SPOTLIGHT = corridorTorch({ color: 'infernal', facing: 90, angle: 60 });

  it('an infernal spotlight of 60° tints the areas of its cone', () => {
    const view = lightTintViewOf(input({ lights: [SPOTLIGHT] }));

    const source = { center: { x: 5, y: 5 }, range: lightRange(4, 4), cone: coneOf(90, 60) };
    expect(view?.tints[0]?.dim).toBe(lightAreasOf(source, NO_WALLS, SIZE).dim);
  });

  it('aiming the spotlight elsewhere changes the drawing key', () => {
    const down = lightTintViewOf(input({ lights: [SPOTLIGHT] }))?.key;
    const left = lightTintViewOf(input({ lights: [{ ...SPOTLIGHT, facing: 180 }] }))?.key;

    expect(left).not.toBe(down);
  });
});

describe('lightTintViewOf reuses the last view', () => {
  it('the same lights, walls and landing give back the very same LightTintView', () => {
    const same = input({ walls: [cellDoor()] });
    expect(lightTintViewOf({ ...same })).toBe(lightTintViewOf(same));
  });

  it('the colored light moved gives a new view', () => {
    const before = lightTintViewOf(input());
    const moved = lightTintViewOf(input({ lights: [{ ...INFERNAL_TORCH, x: 9 }] }));
    expect(moved).not.toBe(before);
    expect(moved?.key).not.toBe(before?.key);
  });
});

describe('lightTintViewOf with a blocker', () => {
  // The torch at (5, 5) lights across (8, 5); the statue at (7, 4) stands between.
  const WIDE_STATUE = statue({ col: 7, row: 4, width: 1, height: 2 });
  const TOKENS = [WIDE_STATUE];
  const NO_WALL_DTOS: readonly WallDto[] = [];

  function tintWith(tokens: LightTintInput['tokens'], lights = [INFERNAL_TORCH]) {
    const geometry = sightGeometryOf({ scene: DARK, tokens, walls: NO_WALL_DTOS }, new Map());
    return lightTintViewOf(input({ tokens, lights, walls: NO_WALL_DTOS, geometry }));
  }

  function lightsAt(view: LightTintView | null, x: number, y: number): boolean {
    const point = { x: x * CELL_WORLD_SIZE, y: y * CELL_WORLD_SIZE };
    return insidePolygon(point, view?.tints[0]?.dim ?? []);
  }

  it('the tint stops at the statue, whoever looks (no sight goes in)', () => {
    expect(lightsAt(tintWith(TOKENS), 9, 5)).toBe(false);
    expect(lightsAt(tintWith([]), 9, 5)).toBe(true);
  });

  it('a torch inside the statue tints past it', () => {
    const inside = [corridorTorch({ x: 7.5, y: 5, color: 'infernal' })];

    expect(lightsAt(tintWith(TOKENS, inside), 11, 5)).toBe(true);
  });

  it('the statue moved hands a new tint; the same pose, the very same one', () => {
    const first = tintWith(TOKENS);

    expect(tintWith([{ ...WIDE_STATUE }])).toBe(first);
    expect(tintWith([{ ...WIDE_STATUE, row: 8 }])).not.toBe(first);
  });

  it('the torch of a blocker and a torch at its place tint differently: the key tells them', () => {
    const light = { bright: 4, dim: 4, color: 'infernal' as const, angle: 360 };
    const traced = { imageAssetId: TRACED_ASSET_ID, col: 7, row: 5 };
    const outlines = tracedOutlines(RIGHT_STRIP_OUTLINE);
    const tintOf = (tokens: LightTintInput['tokens'], lights: LightTintInput['lights']) =>
      lightTintViewOf(
        input({
          tokens,
          lights,
          geometry: sightGeometryOf({ scene: DARK, tokens, walls: NO_WALL_DTOS }, outlines),
        }),
      );

    const byToken = tintOf([statue({ ...traced, light, lightLit: true })], []);
    const byMap = tintOf([statue(traced)], [corridorTorch({ x: 7.5, y: 5.5, color: 'infernal' })]);

    expect(lightsAt(byToken, 10.5, 5.5)).toBe(true);
    expect(lightsAt(byMap, 10.5, 5.5)).toBe(false);
  });

  it('a torch inside two statues in the same place keeps the very same tint', () => {
    const inside = [corridorTorch({ x: 7.5, y: 5, color: 'infernal' })];
    const twin = statue({ id: OGRE_ID, col: 7, row: 4, width: 1, height: 2 });
    const tokens = [WIDE_STATUE, twin];

    const first = tintWith(tokens, inside);

    expect(tintWith(tokens, inside)).toBe(first);
  });
});
