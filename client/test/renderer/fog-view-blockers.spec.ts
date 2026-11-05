import type { BoardStateDto, TokenDto, WallDto } from '@lorkarium/contracts';
import { insidePolygon } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { boardSightOf, type BoardSight } from '@/lib/board-sight';
import type { TokenLanding } from '@/lib/light-sources';
import { sightGeometryOf, type SightOutlines } from '@/lib/sight-geometry';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { fogViewOf, type FogView } from '@/renderer/fog-view';
import { corridorTorch } from '../support/light-fixtures';
import {
  RIGHT_STRIP_OUTLINE,
  STATUE_ID,
  TRACED_ASSET_ID,
  blockerBoard,
  lookout,
  ogre,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { LYRA_ID } from '../support/table-session-fixtures';

const CELL = CELL_WORLD_SIZE;
const NO_LANDING: TokenLanding = new Map();
const NO_OUTLINES: SightOutlines = new Map();
const STATUE_CELL = [
  { x: 4 * CELL, y: 5 * CELL },
  { x: 5 * CELL, y: 5 * CELL },
  { x: 5 * CELL, y: 6 * CELL },
  { x: 4 * CELL, y: 6 * CELL },
];
// Lyra sees the statue in the penumbra only: her plain reach ends before it and the dim one past it.
const PENUMBRA_EYE = lookout({ sight: { bright: 1, dim: 9 } });

type Reading = Readonly<{
  outlines?: SightOutlines;
  landing?: TokenLanding;
  sight?: BoardSight;
}>;

function fogOf(board: BoardStateDto, reading: Reading = {}): FogView | null {
  const { outlines = NO_OUTLINES, landing = NO_LANDING } = reading;
  const sight = reading.sight ?? boardSightOf(board, { previewEyeIds: null, outlines, landing });
  const geometry = sightGeometryOf(board, outlines, landing);
  return fogViewOf({
    sight,
    scene: board.scene,
    walls: board.walls,
    lights: board.lights,
    tokens: board.tokens,
    landing,
    geometry,
  });
}

function reaches(areas: FogView['dim'] | undefined, x: number, y: number): boolean {
  const point = { x: x * CELL, y: y * CELL };
  return (areas ?? []).some((area) => insidePolygon(point, area));
}

function boardWith(...tokens: TokenDto[]): BoardStateDto {
  return blockerBoard([lookout(), ...tokens]);
}

describe('fogViewOf with a statue in the way', () => {
  it('the area of Lyra ends at the statue', () => {
    const fog = fogOf(boardWith(statue()));

    expect(reaches(fog?.dim, 3.5, 5.5)).toBe(true);
    expect(reaches(fog?.dim, 7.5, 5.5)).toBe(false);
  });

  it('the seen statue opens its own body on both sheets, in world px', () => {
    const fog = fogOf(boardWith(statue()));

    expect(fog?.blockerHoles.dim).toEqual([STATUE_CELL]);
    expect(fog?.blockerHoles.bright).toEqual([STATUE_CELL]);
  });

  it('the statue in the penumbra opens only the dim sheet', () => {
    const fog = fogOf(blockerBoard([PENUMBRA_EYE, statue()]));

    expect(fog?.blockerHoles.dim).toEqual([STATUE_CELL]);
    expect(fog?.blockerHoles.bright).toEqual([]);
  });

  it('a statue hidden behind the first opens nothing', () => {
    const behind = statue({ id: 'bb44cc55-dd66-4e77-8f88-99aabbccddee', col: 7, row: 5 });

    const fog = fogOf(boardWith(statue(), behind));

    expect(fog?.blockerHoles.dim).toEqual([STATUE_CELL]);
  });

  it('a statue with two islands opens both', () => {
    const outline = [
      [
        [0, 0],
        [0.4, 0],
        [0.4, 1],
      ],
      [
        [0.6, 0],
        [1, 0],
        [1, 1],
      ],
    ] as const;
    const board = boardWith(statue({ imageAssetId: TRACED_ASSET_ID }));

    const fog = fogOf(board, { outlines: tracedOutlines(outline) });

    expect(fog?.blockerHoles.dim).toHaveLength(2);
  });

  it('Lyra standing inside the statue sees past its outline', () => {
    const big = statue({ col: 3, row: 4, width: 3, height: 3 });
    const board = blockerBoard([lookout({ col: 4, row: 5 }), big]);

    expect(reaches(fogOf(board)?.dim, 9.5, 5.5)).toBe(true);
  });

  it('a Lyra who blocks looks past herself', () => {
    const board = blockerBoard([lookout({ blocksSight: true })]);

    expect(reaches(fogOf(board)?.dim, 9.5, 5.5)).toBe(true);
  });

  it('what the torch lights stops at the statue too', () => {
    const torch = corridorTorch({ x: 2.5, y: 5.5, bright: 6, dim: 0 });
    const board = blockerBoard([lookout({ sight: null }), statue()], { lights: [torch] });

    const fog = fogOf(board);

    expect(reaches(fog?.lit.dim, 3.5, 5.5)).toBe(true);
    expect(reaches(fog?.lit.dim, 6.5, 5.5)).toBe(false);
  });

  it('the line of sight that opens what is lit stops at the statue', () => {
    const torch = corridorTorch({ x: 7.5, y: 3.5, bright: 6, dim: 0 });
    const board = blockerBoard([lookout({ sight: null }), statue()], { lights: [torch] });

    expect(reaches(fogOf(board)?.sightLines, 7.5, 5.5)).toBe(false);
  });
});

describe('fogViewOf and its key with a statue', () => {
  it('the ruler or a new board with the same pose hand back the very same fog', () => {
    const board = boardWith(statue());
    const first = fogOf(board);

    expect(fogOf({ ...board, tokens: [...board.tokens] })).toBe(first);
  });

  it('two statues over Lyra (a list of her own) hand back the very same fog', () => {
    const twin = statue({ id: 'bb44cc55-dd66-4e77-8f88-99aabbccddee' });
    const board = blockerBoard([lookout({ col: 4, row: 5 }), statue(), twin]);

    const first = fogOf(board);

    expect(fogOf(board)).toBe(first);
  });

  it('moving the statue hands a new fog', () => {
    const board = boardWith(statue());
    const first = fogOf(board);
    const landing = new Map([[STATUE_ID, { col: 4, row: 9, facing: 0 }]]);

    const moved = fogOf(board, { landing });

    expect(moved).not.toBe(first);
    expect(reaches(moved?.dim, 7.5, 5.5)).toBe(true);
  });

  it('the level of the statue changing hands a new fog', () => {
    const board = boardWith(statue());
    const sight = boardSightOf(board, { previewEyeIds: null });
    const first = fogOf(board, { sight });
    const levels = new Map([[STATUE_ID, 'silhouette' as const]]);

    const dimmed = fogOf(board, { sight: { ...sight, levels } });

    expect(dimmed).not.toBe(first);
    expect(dimmed?.blockerHoles.bright).toEqual([]);
  });

  it('an outline that arrives hands a new fog', () => {
    const board = boardWith(statue({ imageAssetId: TRACED_ASSET_ID }));
    const first = fogOf(board);

    const traced = fogOf(board, { outlines: tracedOutlines() });

    expect(traced).not.toBe(first);
    expect(reaches(traced?.dim, 7.5, 5.5)).toBe(true);
  });
});

describe('fogViewOf and what each one looks through', () => {
  // The statue, traced at its right tenth, and a Lyra at the very same pose: the eye of the statue
  // looks past that strip and the eye of Lyra does not.
  const TRACED = statue({
    col: 1,
    imageAssetId: TRACED_ASSET_ID,
    sight: { bright: 10, dim: 0 },
    canControl: true,
  });
  const BOARD = blockerBoard([lookout(), TRACED]);
  const OUTLINES = tracedOutlines(RIGHT_STRIP_OUTLINE);

  it('the eye of the blocker and the eye at its place see differently: the key tells them', () => {
    const seen = boardSightOf(BOARD, { previewEyeIds: null, outlines: OUTLINES });

    const byLyra = fogOf(BOARD, {
      outlines: OUTLINES,
      sight: { ...seen, eyeTokenIds: [LYRA_ID] },
    });
    const byStatue = fogOf(BOARD, {
      outlines: OUTLINES,
      sight: { ...seen, eyeTokenIds: [STATUE_ID] },
    });

    expect(reaches(byLyra?.dim, 5.5, 5.5)).toBe(false);
    expect(reaches(byStatue?.dim, 5.5, 5.5)).toBe(true);
  });

  it('the torch of the blocker and a torch at its place light differently: the key tells them', () => {
    const light = { bright: 6, dim: 0, color: null, angle: 360 };
    const carrier = statue({ col: 1, imageAssetId: TRACED_ASSET_ID, light, lightLit: true });
    const blind = lookout({ col: 0, sight: null });
    const mapTorch = corridorTorch({ x: 1.5, y: 5.5, bright: 6, dim: 0 });
    const carrierOut = { ...carrier, lightLit: false };

    const walls: WallDto[] = [];
    const byToken = fogOf(blockerBoard([blind, carrier], { walls }), { outlines: OUTLINES });
    const byMap = fogOf(blockerBoard([blind, carrierOut], { walls, lights: [mapTorch] }), {
      outlines: OUTLINES,
    });

    expect(reaches(byToken?.lit.dim, 5.5, 5.5)).toBe(true);
    expect(reaches(byMap?.lit.dim, 5.5, 5.5)).toBe(false);
  });
});

describe('fogViewOf with no blocker', () => {
  it('there is no body to open, and the eyes have no list', () => {
    const fog = fogOf(boardWith(ogre()));

    expect(fog?.blockerHoles).toEqual({ bright: [], dim: [] });
  });

  it('without a geometry given, the walls of the input cut as before', () => {
    const board = boardWith(ogre());

    const fog = fogViewOf({
      sight: boardSightOf(board, { previewEyeIds: null }),
      scene: board.scene,
      walls: board.walls,
      lights: board.lights,
      tokens: board.tokens,
      landing: NO_LANDING,
    });

    expect(fog?.blockerHoles).toEqual({ bright: [], dim: [] });
    expect(reaches(fog?.dim, 7.5, 5.5)).toBe(true);
  });
});
