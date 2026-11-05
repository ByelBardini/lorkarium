import type { SceneVisionDto, TokenDto, WallDto } from '@lorkarium/contracts';
import { coneOf, withinField } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { sightConeViewOf, type SightConeInput } from '@/renderer/sight-cone-view';
import { sightGeometryOf } from '@/lib/sight-geometry';
import {
  RIGHT_STRIP_OUTLINE,
  STATUE_ID,
  TRACED_ASSET_ID,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { KAEL_ID, LYRA_ID, VHARN_SCENE, kael, lyra } from '../support/table-session-fixtures';
import { northWall } from '../support/wall-fixtures';

const CELL = CELL_WORLD_SIZE;
// Lyra at (5, 5), center (5.5, 5.5), looks right in a field of 90°.
const NARROW = lyra({ col: 5, row: 5, sightAngle: 90 });
const FIELD = { cone: coneOf(0, 90)!, around: { x: 5, y: 5, width: 1, height: 1 } };

function input(
  overrides: Partial<SightConeInput> = {},
  vision: SceneVisionDto = 'dark',
): SightConeInput {
  return {
    viewer: { isMaster: true },
    scene: { ...VHARN_SCENE, vision },
    tokens: [NARROW],
    walls: [],
    selectedTokenIds: [LYRA_ID],
    landing: new Map(),
    ...overrides,
  };
}

function cells(view: ReturnType<typeof sightConeViewOf>) {
  return (view?.outline ?? []).map(({ x, y }) => ({ x: x / CELL, y: y / CELL }));
}

describe('sightConeViewOf', () => {
  it('Ana with the narrow Lyra selected alone sees the outline of her field, in the cone or the ring', () => {
    const outline = cells(sightConeViewOf(input()));

    expect(outline.length).toBeGreaterThan(3);
    for (const point of outline) expect(withinField(FIELD, { x: 5.5, y: 5.5 }, point)).toBe(true);
    expect(Math.max(...outline.map(({ x }) => x))).toBeCloseTo(VHARN_SCENE.widthCells, 6);
  });

  it('Bia, a player, gets no outline: her fog already shows her field', () => {
    expect(sightConeViewOf(input({ viewer: { isMaster: false } }))).toBeNull();
  });

  it('a Lyra of 360° shows no outline', () => {
    expect(sightConeViewOf(input({ tokens: [{ ...NARROW, sightAngle: 360 }] }))).toBeNull();
  });

  it('two tokens selected show no outline', () => {
    const tokens: TokenDto[] = [NARROW, kael({ col: 9, row: 9, sightAngle: 90 })];

    expect(sightConeViewOf(input({ tokens, selectedTokenIds: [LYRA_ID, KAEL_ID] }))).toBeNull();
  });

  it('with vision off there is no outline', () => {
    expect(sightConeViewOf(input({}, 'off'))).toBeNull();
  });

  it('a wall in front of her cuts the outline', () => {
    const wall: WallDto = northWall({
      x: 8,
      y: 0,
      width: 0,
      height: 20,
      points: [
        [0, 0],
        [0, 20],
      ],
    } as never);

    const outline = cells(sightConeViewOf(input({ walls: [wall] })));

    expect(Math.max(...outline.map(({ x }) => x))).toBeLessThanOrEqual(8 + 1e-6);
  });

  it('the pose turned or dragged moves the outline, and its key', () => {
    const still = sightConeViewOf(input());
    const turned = sightConeViewOf(
      input({ landing: new Map([[LYRA_ID, { col: 5, row: 5, facing: 180 }]]) }),
    );
    const dragged = sightConeViewOf(
      input({ landing: new Map([[LYRA_ID, { col: 8, row: 5, facing: 0 }]]) }),
    );

    expect(Math.min(...cells(turned).map(({ x }) => x))).toBeCloseTo(0, 6);
    expect(cells(dragged)).not.toEqual(cells(still));
    expect(turned?.key).not.toBe(still?.key);
    expect(sightConeViewOf(input())?.key).toBe(still?.key);
  });

  describe('the reach of the outline', () => {
    // Darkvision of 1 + 1 cells: in the dark she sees up to 2 cells from her center.
    const DARKVISION = { ...NARROW, sight: { bright: 1, dim: 1 } };
    const farthest = (view: ReturnType<typeof sightConeViewOf>) =>
      Math.max(...cells(view).map(({ x, y }) => Math.hypot(x - 5.5, y - 5.5)));

    it('in the dark, a Lyra with darkvision of 1 + 1 has her outline stop at 2 cells', () => {
      expect(farthest(sightConeViewOf(input({ tokens: [DARKVISION] })))).toBeLessThanOrEqual(
        2 + 1e-6,
      );
    });

    it('by daylight the same Lyra sees to the edge of the scene', () => {
      const view = sightConeViewOf(input({ tokens: [DARKVISION] }, 'daylight'));

      expect(Math.max(...cells(view).map(({ x }) => x))).toBeCloseTo(VHARN_SCENE.widthCells, 6);
    });
  });
});

describe('sightConeViewOf reuses the last view', () => {
  it('the same selection and pose give back the very same SightConeView', () => {
    const same = input({ walls: [northWall()] });
    expect(sightConeViewOf({ ...same })).toBe(sightConeViewOf(same));
  });

  it('the selected token turning gives a new outline', () => {
    const still = sightConeViewOf(input());
    const turned = sightConeViewOf(
      input({ landing: new Map([[LYRA_ID, { col: 5, row: 5, facing: 90 }]]) }),
    );
    expect(turned).not.toBe(still);
    expect(turned?.key).not.toBe(still?.key);
  });
});

describe('sightConeViewOf with a blocker', () => {
  // The field looks right from (5.5, 5.5); a statue at (8, 3), five cells tall, cuts it.
  const STATUE = statue({ col: 8, row: 3, height: 5 });
  const NO_WALL_DTOS: readonly WallDto[] = [];

  function outlineWith(tokens: readonly TokenDto[]) {
    const scene = { ...VHARN_SCENE, vision: 'dark' as const };
    const geometry = sightGeometryOf({ scene, tokens, walls: NO_WALL_DTOS }, new Map());
    return sightConeViewOf(input({ tokens: [...tokens], walls: NO_WALL_DTOS, geometry }));
  }

  it('the outline stops at the statue', () => {
    const farthest = Math.max(...cells(outlineWith([NARROW, STATUE])).map(({ x }) => x));

    expect(farthest).toBeLessThan(8.01);
  });

  it('a token standing inside the statue looks past it', () => {
    const inside = lyra({ col: 8, row: 5, sightAngle: 90 });

    const farthest = Math.max(...cells(outlineWith([inside, STATUE])).map(({ x }) => x));

    expect(farthest).toBeCloseTo(VHARN_SCENE.widthCells, 6);
  });

  it('the blocker and a token at its place look differently: the key tells them', () => {
    const traced = statue({ col: 5, row: 5, sightAngle: 90, imageAssetId: TRACED_ASSET_ID });
    const twin = lyra({ col: 5, row: 5, sightAngle: 90 });
    const scene = { ...VHARN_SCENE, vision: 'dark' as const };
    const tokens = [twin, traced];
    const outlines = tracedOutlines(RIGHT_STRIP_OUTLINE);
    const geometry = sightGeometryOf({ scene, tokens, walls: NO_WALL_DTOS }, outlines);
    const looking = (id: string) =>
      sightConeViewOf(input({ tokens, walls: NO_WALL_DTOS, selectedTokenIds: [id], geometry }));

    const byTwin = Math.max(...cells(looking(LYRA_ID)).map(({ x }) => x));
    const byStatue = Math.max(...cells(looking(STATUE_ID)).map(({ x }) => x));

    expect(byTwin).toBeLessThan(7);
    expect(byStatue).toBeCloseTo(VHARN_SCENE.widthCells, 6);
  });

  it('a statue moved hands a new outline; the same pose, the very same one', () => {
    const first = outlineWith([NARROW, STATUE]);

    expect(outlineWith([NARROW, { ...STATUE }])).toBe(first);
    expect(outlineWith([NARROW, { ...STATUE, col: 10 }])).not.toBe(first);
  });
});
