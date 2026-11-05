import type { TokenDto } from '@lorkarium/contracts';
import { blockerIgnoresOf, sightGeometryOf } from '@/lib/sight-geometry';
import {
  OGRE_ID,
  RIGHT_STRIP_OUTLINE,
  STATUE_ID,
  TRACED_ASSET_ID,
  blockerBoard,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { describe, expect, it } from 'vitest';
import { lightSourcesOf, shiningLightsOf } from '@/lib/light-sources';
import { brazier, corridorTorch, veiledTorch } from '../support/light-fixtures';
import { LYRA_ID, kael, lyra, vharnBoard } from '../support/table-session-fixtures';

const TORCH = { bright: 4, dim: 4, color: null, angle: 360 };

describe('lightSourcesOf', () => {
  it('gives the lit map lights and the lit token lights, from their point and footprint center', () => {
    const board = vharnBoard({
      lights: [corridorTorch()],
      tokens: [
        lyra({
          col: 3,
          row: 4,
          light: { bright: 2, dim: 1, color: null, angle: 360 },
          lightLit: true,
        }),
      ],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 5, y: 5 }, range: { bright: 4, dim: 4 }, cone: null },
      { center: { x: 3.5, y: 4.5 }, range: { bright: 2, dim: 1 }, cone: null },
    ]);
  });

  it('leaves out a map light that is out, a token light that is out and a token without light', () => {
    const board = vharnBoard({
      lights: [corridorTorch({ lit: false }), brazier()],
      tokens: [lyra({ light: TORCH, lightLit: false }), kael({ light: null })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 12, y: 8 }, range: { bright: 2, dim: 6 }, cone: null },
    ]);
  });

  it('the light of a dragged Lyra shines from the cell where she would land', () => {
    const board = vharnBoard({ tokens: [lyra({ col: 3, row: 4, light: TORCH, lightLit: true })] });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2, facing: 0 }]]);

    expect(lightSourcesOf(board, landing)).toEqual([
      { center: { x: 8.5, y: 2.5 }, range: { bright: 4, dim: 4 }, cone: null },
    ]);
  });
});

describe('shiningLightsOf', () => {
  it('gives each lit light with its color: a fire torch and a moon Lyra', () => {
    const board = vharnBoard({
      lights: [corridorTorch({ color: 'fire' })],
      tokens: [lyra({ col: 3, row: 4, light: { ...TORCH, color: 'moon' }, lightLit: true })],
    });

    expect(shiningLightsOf(board)).toEqual([
      {
        source: { center: { x: 5, y: 5 }, range: { bright: 4, dim: 4 }, cone: null },
        color: 'fire',
      },
      {
        source: { center: { x: 3.5, y: 4.5 }, range: { bright: 4, dim: 4 }, cone: null },
        color: 'moon',
      },
    ]);
  });

  it('leaves out a colored light that is out', () => {
    const board = vharnBoard({ lights: [corridorTorch({ color: 'fire', lit: false })] });

    expect(shiningLightsOf(board)).toEqual([]);
  });

  it('the colored light of a dragged Lyra shines from where she would land', () => {
    const board = vharnBoard({
      tokens: [lyra({ col: 3, row: 4, light: { ...TORCH, color: 'moon' }, lightLit: true })],
    });
    const landing = new Map([[LYRA_ID, { col: 8, row: 2, facing: 0 }]]);

    expect(shiningLightsOf(board, landing).map(({ source }) => source.center)).toEqual([
      { x: 8.5, y: 2.5 },
    ]);
  });
});

describe('lightSourcesOf in a cone', () => {
  const LANTERN = { bright: 6, dim: 0, color: null, angle: 60 };

  it('the lantern of Lyra shines in the direction she shows, turned before the ack', () => {
    const board = vharnBoard({ tokens: [lyra({ light: LANTERN, lightLit: true, facing: 0 })] });
    const turned = new Map([[LYRA_ID, { col: 3, row: 4, facing: 180 }]]);

    expect(lightSourcesOf(board).map(({ cone }) => cone)).toEqual([{ facing: 0, angle: 60 }]);
    expect(lightSourcesOf(board, turned).map(({ cone }) => cone)).toEqual([
      { facing: 180, angle: 60 },
    ]);
  });

  it('a spotlight of the map shines with its own facing and angle', () => {
    const board = vharnBoard({ lights: [corridorTorch({ facing: 90, angle: 45 })] });

    expect(lightSourcesOf(board)[0]?.cone).toEqual({ facing: 90, angle: 45 });
  });

  it('a light of 360° shines every side (cone null)', () => {
    const board = vharnBoard({ lights: [corridorTorch({ facing: 90 })] });

    expect(lightSourcesOf(board)[0]?.cone).toBeNull();
  });
});

describe('lightSourcesOf with the lights of hidden tokens', () => {
  it('a veiled light shines from the center the server sent, after the map and token lights', () => {
    const board = vharnBoard({
      lights: [corridorTorch()],
      tokens: [lyra({ col: 3, row: 4, light: TORCH, lightLit: true })],
      veiledLights: [veiledTorch({ x: 8, y: 2.5, color: 'infernal' })],
    });

    expect(shiningLightsOf(board).map(({ source, color }) => [source.center, color])).toEqual([
      [{ x: 5, y: 5 }, null],
      [{ x: 3.5, y: 4.5 }, null],
      [{ x: 8, y: 2.5 }, 'infernal'],
    ]);
  });

  it('a veiled lantern shines in its own cone, with its range', () => {
    const board = vharnBoard({
      veiledLights: [veiledTorch({ bright: 6, dim: 0, facing: 90, angle: 60 })],
    });

    expect(lightSourcesOf(board)).toEqual([
      { center: { x: 4, y: 5 }, range: { bright: 6, dim: 0 }, cone: { facing: 90, angle: 60 } },
    ]);
  });
});

describe('lightSourcesOf with blockers', () => {
  const BIG_STATUE = statue({ col: 3, row: 3, width: 3, height: 3 });
  const light = { bright: 4, dim: 0, color: null, angle: 360 };

  function blockersOf(tokens: readonly TokenDto[]) {
    return sightGeometryOf(blockerBoard(tokens), new Map()).blockers;
  }

  it('a map light inside a blocker leaves its very walls out', () => {
    const blockers = blockersOf([BIG_STATUE]);
    const board = { lights: [corridorTorch({ x: 4.5, y: 4.5 })], tokens: [BIG_STATUE] };

    const [source] = lightSourcesOf(board, undefined, blockers);

    expect(source?.ignores).toBe(blockers[0]?.walls);
  });

  it('a map light outside it leaves nothing out', () => {
    const blockers = blockersOf([BIG_STATUE]);
    const board = { lights: [corridorTorch({ x: 10, y: 10 })], tokens: [BIG_STATUE] };

    expect(lightSourcesOf(board, undefined, blockers)[0]).not.toHaveProperty('ignores');
  });

  it('the light a blocker carries leaves itself out, with its center off its own shape', () => {
    const carrier = statue({ light, lightLit: true, imageAssetId: TRACED_ASSET_ID });
    const outlines = tracedOutlines(RIGHT_STRIP_OUTLINE);
    const { blockers } = sightGeometryOf(blockerBoard([carrier]), outlines);

    const [source] = lightSourcesOf({ lights: [], tokens: [carrier] }, undefined, blockers);

    expect(source?.ignores).toBe(blockers[0]?.walls);
  });

  it('the light of a token on a blocker follows where the token shows', () => {
    const blockers = blockersOf([BIG_STATUE]);
    const carried = lyra({ col: 9, row: 9, light, lightLit: true });
    const landing = new Map([[LYRA_ID, { col: 4, row: 4, facing: 0 }]]);
    const board = { lights: [], tokens: [BIG_STATUE, carried] };

    const [source] = lightSourcesOf(board, landing, blockers);

    expect(source?.ignores).toBe(blockers[0]?.walls);
  });

  it('a veiled light inside a blocker gets out of it too', () => {
    const blockers = blockersOf([BIG_STATUE]);
    const board = {
      lights: [],
      tokens: [BIG_STATUE],
      veiledLights: [veiledTorch({ x: 4.5, y: 4.5 })],
    };

    expect(lightSourcesOf(board, undefined, blockers)[0]?.ignores).toBe(blockers[0]?.walls);
  });

  it('with no blockers given, nothing changes', () => {
    const board = { lights: [corridorTorch()], tokens: [] };

    expect(lightSourcesOf(board)[0]).not.toHaveProperty('ignores');
  });
});

describe('blockerIgnoresOf', () => {
  it('two blockers on the same point give back the very same list, for the keys of the fog', () => {
    const tokens = [
      statue({ col: 3, row: 3, width: 3, height: 3 }),
      statue({ id: OGRE_ID, col: 3, row: 3, width: 3, height: 3 }),
    ];
    const { blockers } = sightGeometryOf(blockerBoard(tokens), new Map());
    const point = { x: 4.5, y: 4.5 };

    const first = blockerIgnoresOf(blockers, point);

    expect(first).toHaveLength(2);
    expect(blockerIgnoresOf(blockers, { ...point })).toBe(first);
  });

  it('another token on the same point has its own list', () => {
    const tokens = [statue(), statue({ id: OGRE_ID, col: 9, row: 9 })];
    const { blockers } = sightGeometryOf(blockerBoard(tokens), new Map());
    const point = { x: 15, y: 11 };

    expect(blockerIgnoresOf(blockers, point, STATUE_ID)).toBe(blockers[0]?.walls);
    expect(blockerIgnoresOf(blockers, point, OGRE_ID)).toBe(blockers[1]?.walls);
    expect(blockerIgnoresOf(blockers, point)).toEqual([]);
  });

  it('with no blocker, the empty list', () => {
    expect(blockerIgnoresOf([], { x: 1, y: 1 }, STATUE_ID)).toEqual([]);
  });
});
