import { lightRange, type Wall } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { gameWallOf } from '@/lib/wall-geometry';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { lightAreasOf } from '@/renderer/light-areas';
import { lightTintViewOf, type LightTintInput } from '@/renderer/light-tint-view';
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

    const torch = { center: { x: 5, y: 5 }, range: lightRange(4, 4) };
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

    const torch = { center: { x: 5, y: 5 }, range: lightRange(4, 4) };
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
        tokens: [lyra({ light: { bright: 2, dim: 0, color: 'necrotic' }, lightLit: true })],
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

  it('the light of a dragged Lyra tints from the cell where she would land', () => {
    const fire = lyra({
      col: 3,
      row: 4,
      light: { bright: 2, dim: 2, color: 'fire' },
      lightLit: true,
    });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2 }]]);

    const view = lightTintViewOf(input({ lights: [], tokens: [fire], landing }));

    const landed = { center: { x: 8.5, y: 2.5 }, range: lightRange(2, 2) };
    expect(view?.tints[0]?.dim).toBe(lightAreasOf(landed, NO_WALLS, SIZE).dim);
  });
});
