import type { SightBlocker, SightOutline } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  tokenBlockerOf,
  tokenEyeOf,
  tokenLightOf,
} from '../../../src/modules/tokens/tokens.mapper';
import type { TokenPo } from '../../../src/modules/tokens/tokens.po';
import { lyraPo, lyraRow, statueRow } from '../../support/tokens-factories';

const SCENE = { widthCells: 20, heightCells: 12 };
const SQUARE_2X2 = { col: 3, row: 3, width: 2, height: 2, imageAssetId: 'image-1' };
const TRIANGLE: SightOutline = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
];
const RECTANGLE_2X2 = [
  { x: 3, y: 3 },
  { x: 5, y: 3 },
  { x: 5, y: 5 },
  { x: 3, y: 5 },
];
// The strip on the right of a 1×1 token: its center stays out of the shape.
const RIGHT_STRIP: SightOutline = [
  [
    [0.7, 0],
    [1, 0],
    [1, 1],
    [0.7, 1],
  ],
];

function polygonsOf(
  token: Partial<TokenPo>,
  outline: SightOutline | null,
): readonly (readonly { x: number; y: number }[])[] {
  const { polygons } = tokenBlockerOf(statueRow({ ...SQUARE_2X2, ...token }), outline, SCENE);
  return polygons.map((polygon) =>
    polygon.map(({ x, y }) => ({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })),
  );
}

describe('tokenBlockerOf', () => {
  it('an image on the square frame blocks by its outline, as one closed curtain', () => {
    const blocker = tokenBlockerOf(statueRow(SQUARE_2X2), TRIANGLE, SCENE);

    expect(blocker.tokenId).toBe(statueRow().token.id);
    expect(blocker.polygons).toEqual([
      [
        { x: 3, y: 3 },
        { x: 5, y: 3 },
        { x: 3, y: 5 },
      ],
    ]);
    expect(blocker.walls).toHaveLength(1);
    expect(blocker.walls[0]).toMatchObject({
      kind: 'curtain',
      shape: 'freehand',
      x: 3,
      y: 3,
      points: [
        [0, 0],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    });
  });

  it('flipX mirrors the outline', () => {
    expect(polygonsOf({ flipX: true }, TRIANGLE)).toEqual([
      [
        { x: 5, y: 3 },
        { x: 3, y: 3 },
        { x: 5, y: 5 },
      ],
    ]);
  });

  it('flipY mirrors the outline', () => {
    expect(polygonsOf({ flipY: true }, TRIANGLE)).toEqual([
      [
        { x: 3, y: 5 },
        { x: 5, y: 5 },
        { x: 3, y: 3 },
      ],
    ]);
  });

  it('facing 90 turns the outline around the center', () => {
    expect(polygonsOf({ facing: 90 }, TRIANGLE)).toEqual([
      [
        { x: 5, y: 3 },
        { x: 5, y: 5 },
        { x: 3, y: 3 },
      ],
    ]);
  });

  it.each([
    ['sent before the feature (null)', null],
    ['fully transparent ([])', []],
  ])('an image %s blocks by the footprint', (_case, outline) => {
    expect(polygonsOf({}, outline)).toEqual([RECTANGLE_2X2]);
  });

  it('with no image the square frame blocks by the disc drawn, not turned, ignoring the outline', () => {
    const [disc] = polygonsOf({ imageAssetId: null, facing: 45 }, TRIANGLE);

    expect(disc).toHaveLength(32);
    expect(disc?.[0]).toEqual({ x: 4.84, y: 4 });
  });

  it('the round frame blocks by the disc of 32 sides, ignoring the outline', () => {
    const [disc] = polygonsOf({ frame: 'round' }, TRIANGLE);

    expect(disc).toHaveLength(32);
    expect(disc?.[0]).toEqual({ x: 4.84, y: 4 });
  });

  it('a token past the edge of the scene is held on the border', () => {
    expect(polygonsOf({ col: 19 }, null)).toEqual([
      [
        { x: 19, y: 3 },
        { x: 20, y: 3 },
        { x: 20, y: 5 },
        { x: 19, y: 5 },
      ],
    ]);
  });

  it('a token left wholly out by a scene that shrank collapses on the corner, without throwing', () => {
    const corner = { x: 20, y: 12 };

    expect(polygonsOf({ col: 25, row: 15 }, null)).toEqual([[corner, corner, corner, corner]]);
  });

  it('an outline saved broken throws citing the token and the value', () => {
    const broken: SightOutline = [
      [
        [1.5, 0],
        [1, 1],
        [0, 1],
      ],
    ];
    const id = statueRow().token.id;

    expect(() => polygonsOf({}, broken)).toThrow(
      new RegExp(`token ${id} has an outline saved broken: .*\\(1\\.5, 0\\)`),
    );
  });
});

describe('what a token leaves out of its sight and of its light', () => {
  const statue: SightBlocker = tokenBlockerOf(
    statueRow({ col: 2, row: 3, width: 3, height: 3 }),
    null,
    SCENE,
  );
  const farStatue: SightBlocker = tokenBlockerOf(statueRow({ col: 12 }), null, SCENE);
  const torch = { lightBright: '4.00', lightDim: '0.00', lightLit: true };

  it('the eye inside a blocker leaves out its walls', () => {
    expect(tokenEyeOf(lyraRow(), [statue]).ignores).toBe(statue.walls);
  });

  it('the eye outside every blocker leaves nothing out and has no such key', () => {
    expect(tokenEyeOf(lyraRow(), [farStatue])).not.toHaveProperty('ignores');
  });

  it('the eye with no blocker around is the same as before', () => {
    expect(tokenEyeOf(lyraRow())).not.toHaveProperty('ignores');
  });

  it('the eye of a blocker leaves itself out, with its center out of its own shape', () => {
    const row = lyraRow({ token: lyraPo({ imageAssetId: 'image-1' }) });
    const own = tokenBlockerOf(row, RIGHT_STRIP, SCENE);

    expect(tokenEyeOf(row, [own]).ignores).toBe(own.walls);
  });

  it('the light inside a blocker leaves out its walls', () => {
    const row = lyraRow({ token: lyraPo(torch) });

    expect(tokenLightOf(row, [statue])?.ignores).toBe(statue.walls);
  });

  it('the light outside every blocker has no such key', () => {
    const row = lyraRow({ token: lyraPo(torch) });

    expect(tokenLightOf(row, [farStatue])).not.toHaveProperty('ignores');
  });

  it('the light of a blocker leaves itself out, with its center out of its own shape', () => {
    const row = lyraRow({ token: lyraPo({ ...torch, imageAssetId: 'image-1' }) });
    const own = tokenBlockerOf(row, RIGHT_STRIP, SCENE);

    expect(tokenLightOf(row, [own])?.ignores).toBe(own.walls);
  });

  it('a token without a light is still no light source among blockers', () => {
    expect(tokenLightOf(lyraRow(), [statue])).toBeNull();
  });
});
