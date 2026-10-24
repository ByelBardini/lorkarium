import type { BoardStateDto, SceneVisionDto, WallDto } from '@lorkarium/contracts';
import { coneOf, insidePolygon, withinField } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { boardSightOf } from '@/lib/board-sight';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { fogViewOf, type FogView } from '@/renderer/fog-view';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  LYRA_ID,
  VHARN_SCENE,
  lyra,
  vharnBoard,
} from '../support/table-session-fixtures';
import { corridorTorch } from '../support/light-fixtures';
import { cellDoor, northWall } from '../support/wall-fixtures';

const CELL = CELL_WORLD_SIZE;
// Lyra (Bia's) stands at (5, 5), center (5.5, 5.5), and sees 3 cells fully and 3 more dimly.
const LYRA = lyra({ col: 5, row: 5, sight: { bright: 3, dim: 3 } });

function boardOf(vision: SceneVisionDto, walls: WallDto[] = [], master = false): BoardStateDto {
  const viewer = master
    ? { userId: ANA_AT_TABLE.userId, role: 'master' as const }
    : { userId: BIA_AT_TABLE.userId, role: 'player' as const };
  return vharnBoard({ viewer, scene: { ...VHARN_SCENE, vision }, tokens: [LYRA], walls });
}

function fogOf(board: BoardStateDto, landing = new Map()): FogView | null {
  const sight = boardSightOf(board, { previewEyeIds: null });
  return fogViewOf({
    sight,
    scene: board.scene,
    walls: board.walls,
    lights: board.lights,
    tokens: board.tokens,
    landing,
  });
}

function cellCenter(col: number, row: number) {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

function seesAt(polygons: FogView['dim'], col: number, row: number): boolean {
  return polygons.some((polygon) => insidePolygon(cellCenter(col, row), polygon));
}

describe('fogViewOf', () => {
  it('there is no fog with vision off, nor for Ana without a preview', () => {
    expect(fogOf(boardOf('off'))).toBeNull();
    expect(fogOf(boardOf('dark', [], true))).toBeNull();
  });

  it('in the dark, the dim area holds the cell 5 away and not the one 8 away', () => {
    const fog = fogOf(boardOf('dark'));

    expect(seesAt(fog?.dim ?? [], 10, 5)).toBe(true);
    expect(seesAt(fog?.dim ?? [], 13, 5)).toBe(false);
  });

  it('the bright area holds the cell 2 away and not the one 5 away', () => {
    const fog = fogOf(boardOf('dark'));

    expect(seesAt(fog?.bright ?? [], 7, 5)).toBe(true);
    expect(seesAt(fog?.bright ?? [], 10, 5)).toBe(false);
  });

  it('Lyra herself is a hole in the fog: her own token never sits in the dark', () => {
    expect(fogOf(boardOf('dark'))?.holes).toEqual([
      { x: 5 * CELL, y: 5 * CELL, width: CELL, height: CELL },
    ]);
  });

  it('dragging Lyra to (8, 5) moves her eye there', () => {
    const fog = fogOf(boardOf('dark'), new Map([[LYRA_ID, { col: 8, row: 5, facing: 0 }]]));

    expect(seesAt(fog?.bright ?? [], 10, 5)).toBe(true);
    expect(fog?.holes[0]).toMatchObject({ x: 8 * CELL });
  });

  it('by daylight the bright area reaches the edge of an empty room, and a wall cuts it', () => {
    const open = fogOf(boardOf('daylight'));
    const wall = northWall({
      x: 12,
      y: 0,
      width: 0,
      height: 12,
      points: [
        [0, 0],
        [0, 12],
      ],
    } as never);
    const cut = fogOf(boardOf('daylight', [wall]));

    expect(seesAt(open?.bright ?? [], 19, 11)).toBe(true);
    expect(seesAt(cut?.bright ?? [], 15, 5)).toBe(false);
  });

  it('the same board gives the same drawing key, so the canvas does not redraw for nothing', () => {
    expect(fogOf(boardOf('dark'))?.key).toBe(fogOf(boardOf('dark'))?.key);
    expect(fogOf(boardOf('dark'))?.key).not.toBe(
      fogOf(boardOf('dark'), new Map([[LYRA_ID, { col: 8, row: 5, facing: 0 }]]))?.key,
    );
  });
});

describe('fogViewOf with lights', () => {
  // Lyra (Bia's) at (5, 5) without darkvision; the torch at (12, 5) lights 2 cells and 2 more dimly.
  const BLIND_LYRA = lyra({ col: 5, row: 5, sight: null });
  const TORCH = corridorTorch({ x: 12, y: 5, bright: 2, dim: 2 });

  function litBoard(vision: SceneVisionDto, lights = [TORCH]): BoardStateDto {
    return vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision },
      tokens: [BLIND_LYRA],
      lights,
    });
  }

  it('Lyra without darkvision has no areas of her own, the torch lights its area and she sees to the walls', () => {
    const fog = fogOf(litBoard('dark'));

    expect(fog?.bright).toEqual([]);
    expect(fog?.dim).toEqual([]);
    expect(fog?.lit.dim).toHaveLength(1);
    expect(seesAt(fog?.lit.dim ?? [], 12, 5)).toBe(true);
    expect(seesAt(fog?.lit.dim ?? [], 16, 5)).toBe(false);
    expect(fog?.sightLines).toHaveLength(1);
    expect(seesAt(fog?.sightLines ?? [], 19, 11)).toBe(true);
  });

  it('Lyra without darkvision is still a hole in the fog', () => {
    expect(fogOf(litBoard('dark'))?.holes).toEqual([
      { x: 5 * CELL, y: 5 * CELL, width: CELL, height: CELL },
    ]);
  });

  it('with the torch out nothing is lit', () => {
    const fog = fogOf(litBoard('dark', [{ ...TORCH, lit: false }]));

    expect(fog?.lit).toEqual({ bright: [], dim: [] });
  });

  it('by daylight the lights add nothing', () => {
    expect(fogOf(litBoard('daylight'))?.lit).toEqual({ bright: [], dim: [] });
  });

  it('putting out the torch changes the drawing key, and nothing changing keeps it', () => {
    const lit = fogOf(litBoard('dark'))?.key;

    expect(fogOf(litBoard('dark'))?.key).toBe(lit);
    expect(fogOf(litBoard('dark', [{ ...TORCH, lit: false }]))?.key).not.toBe(lit);
  });
});

describe('fogViewOf with Lyra looking in a cone', () => {
  // Lyra (Bia's) at (5, 5), center (5.5, 5.5), looks right in a field of 90° (sight 3 + 3).
  const NARROW = lyra({ col: 5, row: 5, sight: { bright: 3, dim: 3 }, sightAngle: 90 });
  const FIELD = { cone: coneOf(0, 90)!, around: { x: 5, y: 5, width: 1, height: 1 } };
  const APEX = { x: 5.5, y: 5.5 };

  function narrowFog(
    vision: SceneVisionDto,
    landing = new Map(),
    more: Partial<BoardStateDto> = {},
  ) {
    const board = vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision },
      tokens: [NARROW],
      ...more,
    });
    return fogOf(board, landing);
  }

  function inField(polygons: FogView['dim']): boolean {
    return polygons.every((polygon) =>
      polygon.every(({ x, y }) => withinField(FIELD, APEX, { x: x / CELL, y: y / CELL })),
    );
  }

  it('every vertex of the dim area lies in the cone or the ring', () => {
    expect(inField(narrowFog('dark')?.dim ?? [])).toBe(true);
  });

  it('the area straight back stops at the ring: the cell behind is seen, two behind are not', () => {
    const fog = narrowFog('dark');

    expect(seesAt(fog?.dim ?? [], 4, 5)).toBe(true);
    expect(seesAt(fog?.dim ?? [], 3, 5)).toBe(false);
  });

  it('the line of sight that opens what a torch lights is cut to the field too', () => {
    const fog = narrowFog('dark', new Map(), { lights: [corridorTorch({ x: 2, y: 5.5 })] });

    expect(fog?.sightLines.length).toBeGreaterThan(0);
    expect(inField(fog?.sightLines ?? [])).toBe(true);
  });

  it('Lyra turned to 180 before the ack looks left', () => {
    const fog = narrowFog('dark', new Map([[LYRA_ID, { col: 5, row: 5, facing: 180 }]]));

    expect(seesAt(fog?.dim ?? [], 2, 5)).toBe(true);
    expect(seesAt(fog?.dim ?? [], 8, 5)).toBe(false);
  });

  it('the drawing key changes with the facing and with the angle, and not without a change', () => {
    const still = narrowFog('dark')?.key;
    const turned = narrowFog('dark', new Map([[LYRA_ID, { col: 5, row: 5, facing: 90 }]]))?.key;
    const wider = fogOf(
      vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [{ ...NARROW, sightAngle: 120 }],
      }),
    )?.key;

    expect(narrowFog('dark')?.key).toBe(still);
    expect(turned).not.toBe(still);
    expect(wider).not.toBe(still);
  });

  it('by daylight the bright area reaches the edge only in the field', () => {
    const fog = narrowFog('daylight');

    expect(seesAt(fog?.bright ?? [], 19, 5)).toBe(true);
    expect(seesAt(fog?.bright ?? [], 1, 5)).toBe(false);
  });
});

describe('fogViewOf works the geometry out only when what it reads changes', () => {
  // Lyra at (5, 5) sees 3 + 3; the closed door at x = 7 (y 5 to 6) shuts the cell east of it.
  const DOOR_CLOSED = [cellDoor()];
  const DOOR_OPEN = [cellDoor({ doorState: 'open' })];

  function fogWith(board: BoardStateDto, landing = new Map()): FogView | null {
    return fogOf(board, landing);
  }

  it('the same sight, walls, lights and tokens give back the very same FogView', () => {
    const board = boardOf('dark', DOOR_CLOSED);
    expect(fogWith(board)).toBe(fogWith(board));
  });

  it('Lyra stepping one cell gives a new FogView, its dim area moved with her', () => {
    const board = boardOf('dark');
    const before = fogWith(board);
    const after = fogWith(board, new Map([[LYRA_ID, { col: 6, row: 5, facing: 0 }]]));
    expect(after).not.toBe(before);
    expect(seesAt(before?.dim ?? [], 11, 5)).toBe(false);
    expect(seesAt(after?.dim ?? [], 11, 5)).toBe(true);
  });

  it('the door opening (a new array of walls) gives a new key, and the area passes through it', () => {
    const closed = fogWith(boardOf('dark', DOOR_CLOSED));
    const open = fogWith(boardOf('dark', DOOR_OPEN));
    expect(open?.key).not.toBe(closed?.key);
    expect(seesAt(closed?.dim ?? [], 8, 5)).toBe(false);
    expect(seesAt(open?.dim ?? [], 8, 5)).toBe(true);
  });

  it('the torch going out leaves it out of what is lit', () => {
    const blind = { ...LYRA, sight: null };
    const lit = vharnBoard({
      viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens: [blind],
      lights: [corridorTorch()],
    });
    const out = { ...lit, lights: [corridorTorch({ lit: false })] };
    expect(fogWith(lit)?.lit.dim).toHaveLength(1);
    expect(fogWith(out)?.lit.dim).toEqual([]);
  });
});
