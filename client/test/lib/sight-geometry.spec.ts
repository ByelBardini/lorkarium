import type { TokenDto } from '@lorkarium/contracts';
import type { SightOutline } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  blockerAssetIdsOf,
  blockerTokensOf,
  sightGeometryOf,
  type SightOutlines,
} from '@/lib/sight-geometry';
import type { TokenLanding } from '@/lib/light-sources';
import { gameWallsOf } from '@/lib/wall-geometry';
import { KAEL_ID, LYRA_ID, VHARN_SCENE, kael, lyra } from '../support/table-session-fixtures';
import { cellDoor, northWall } from '../support/wall-fixtures';

const IMAGE_ID = '11112222-3333-4444-8555-666677778888';
const OTHER_IMAGE_ID = '99990000-aaaa-4bbb-8ccc-ddddeeeeffff';
const TRIANGLE: SightOutline = [
  [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
];
const NO_OUTLINES: SightOutlines = new Map();
const NO_LANDING: TokenLanding = new Map();
const SCENE = { ...VHARN_SCENE, widthCells: 20, heightCells: 20 };

// A 2×2 statue at (3, 3); its rectangle goes from (3, 3) to (5, 5).
function statue(overrides: Partial<TokenDto> = {}): TokenDto {
  return lyra({ col: 3, row: 3, width: 2, height: 2, blocksSight: true, ...overrides });
}

function boardWith(tokens: readonly TokenDto[]) {
  return { scene: SCENE, tokens, walls: [northWall(), cellDoor()] };
}

describe('sightGeometryOf with no blocker on the scene', () => {
  it('gives the very array of gameWallsOf, so a table without the feature changes nothing', () => {
    const board = boardWith([lyra()]);

    const { walls, blockers } = sightGeometryOf(board, NO_OUTLINES);

    expect(walls).toBe(gameWallsOf(board.walls));
    expect(blockers).toEqual([]);
  });

  it('the list of blockers is the same instance on every board and pose', () => {
    const first = sightGeometryOf(boardWith([lyra()]), NO_OUTLINES);
    const second = sightGeometryOf(boardWith([kael()]), NO_OUTLINES);

    expect(second.blockers).toBe(first.blockers);
  });
});

describe('sightGeometryOf with a blocker', () => {
  it('lists the real walls first, the same instances in the same order, then its curtain', () => {
    const board = boardWith([lyra(), statue({ id: KAEL_ID })]);
    const real = gameWallsOf(board.walls);

    const { walls, blockers } = sightGeometryOf(board, NO_OUTLINES);

    expect(walls).toHaveLength(3);
    expect(walls[0]).toBe(real[0]);
    expect(walls[1]).toBe(real[1]);
    expect(walls[2]).toBe(blockers[0]?.walls[0]);
    expect(walls[2]?.kind).toBe('curtain');
    expect(blockers.map(({ tokenId }) => tokenId)).toEqual([KAEL_ID]);
  });

  it('two blockers keep the order of the tokens, one wall each', () => {
    const other = statue({ id: KAEL_ID, col: 8, row: 8 });

    const { walls, blockers } = sightGeometryOf(boardWith([statue(), other]), NO_OUTLINES);

    expect(blockers.map(({ tokenId }) => tokenId)).toEqual([LYRA_ID, KAEL_ID]);
    expect(walls[2]).toBe(blockers[0]?.walls[0]);
    expect(walls[3]).toBe(blockers[1]?.walls[0]);
  });

  it('a hidden token stays out: it would give its place away', () => {
    const board = boardWith([statue({ hidden: true })]);

    const { walls, blockers } = sightGeometryOf(board, NO_OUTLINES);

    expect(walls).toBe(gameWallsOf(board.walls));
    expect(blockers).toEqual([]);
  });

  it('a token with no image blocks by the disc drawn, even on the square frame', () => {
    const { blockers } = sightGeometryOf(boardWith([statue({ frame: 'square' })]), NO_OUTLINES);

    expect(blockers[0]?.polygons[0]).toHaveLength(32);
    expect(blockers[0]?.polygons[0]?.[0]).toEqual({ x: 4.84, y: 4 });
  });

  it('an image with no outline yet blocks by the rectangle of its footprint', () => {
    const board = boardWith([statue({ imageAssetId: IMAGE_ID })]);

    expect(sightGeometryOf(board, NO_OUTLINES).blockers[0]?.polygons).toEqual([
      [
        { x: 3, y: 3 },
        { x: 5, y: 3 },
        { x: 5, y: 5 },
        { x: 3, y: 5 },
      ],
    ]);
  });

  it('an image blocks by the outline of its asset', () => {
    const board = boardWith([statue({ imageAssetId: IMAGE_ID })]);

    const { blockers } = sightGeometryOf(board, new Map([[IMAGE_ID, TRIANGLE]]));

    expect(blockers[0]?.polygons).toEqual([
      [
        { x: 4, y: 3 },
        { x: 5, y: 5 },
        { x: 3, y: 5 },
      ],
    ]);
  });

  it('a token wholly out of a shrunken scene leaves a curtain held on the border, with no error', () => {
    const board = { ...boardWith([statue({ col: 30, row: 30 })]), scene: SCENE };

    const { blockers } = sightGeometryOf(board, NO_OUTLINES);

    expect(blockers[0]?.polygons[0]?.[0]).toEqual({ x: 20, y: 20 });
  });
});

describe('sightGeometryOf keeps the array while the geometry stays', () => {
  const tokens = [statue({ imageAssetId: IMAGE_ID }), kael()];
  const outlines: SightOutlines = new Map([[IMAGE_ID, TRIANGLE]]);

  it('a new array of tokens with the same pose gives the same geometry, walls and blockers', () => {
    const board = boardWith(tokens);
    const first = sightGeometryOf(board, outlines);

    const second = sightGeometryOf({ ...board, tokens: [...tokens] }, outlines);

    expect(second).toBe(first);
    expect(second.walls).toBe(first.walls);
    expect(second.blockers).toBe(first.blockers);
  });

  it('a new map of outlines with the same one in it gives the same geometry', () => {
    const board = boardWith(tokens);
    const first = sightGeometryOf(board, outlines);

    expect(sightGeometryOf(board, new Map(outlines))).toBe(first);
  });

  it('another token moving does not touch it', () => {
    const board = boardWith(tokens);
    const first = sightGeometryOf(board, outlines);
    const moved = [tokens[0] as TokenDto, kael({ col: 9 })];

    expect(sightGeometryOf({ ...board, tokens: moved }, outlines).walls).toBe(first.walls);
  });

  it.each<[string, Partial<TokenDto>]>([
    ['moving a column', { col: 4 }],
    ['moving a row', { row: 4 }],
    ['turning', { facing: 90 }],
    ['flipping across', { flipX: true }],
    ['flipping down', { flipY: true }],
    ['changing the frame', { frame: 'round' }],
    ['stretching', { width: 3 }],
    ['heightening', { height: 3 }],
    ['changing the image', { imageAssetId: null }],
  ])('%s gives a new array', (_change, changed) => {
    const board = boardWith(tokens);
    const first = sightGeometryOf(board, outlines);
    const next = [statue({ imageAssetId: IMAGE_ID, ...changed }), kael()];

    const second = sightGeometryOf({ ...board, tokens: next }, outlines);

    expect(second.walls).not.toBe(first.walls);
    expect(second.blockers).not.toBe(first.blockers);
    expect(second.blockers[0]?.polygons).not.toEqual(first.blockers[0]?.polygons);
  });

  it('a blocker with no outline changing the frame goes from the rectangle to the disc', () => {
    const board = boardWith([statue()]);
    const square = sightGeometryOf(board, NO_OUTLINES);

    const round = sightGeometryOf({ ...board, tokens: [statue({ frame: 'round' })] }, NO_OUTLINES);

    expect(round.walls).not.toBe(square.walls);
    expect(round.blockers[0]?.polygons[0]).toHaveLength(32);
  });

  it('turning a token with no image keeps the array: its initials never turn', () => {
    const board = boardWith([statue()]);
    const first = sightGeometryOf(board, NO_OUTLINES);

    const turned = sightGeometryOf({ ...board, tokens: [statue({ facing: 90 })] }, NO_OUTLINES);

    expect(turned.walls).toBe(first.walls);
  });

  it('a blocker switched off gives back the array of gameWallsOf', () => {
    const board = boardWith([statue()]);
    sightGeometryOf(board, NO_OUTLINES);

    const off = sightGeometryOf(
      { ...board, tokens: [statue({ blocksSight: false })] },
      NO_OUTLINES,
    );

    expect(off.walls).toBe(gameWallsOf(board.walls));
  });

  it('new real walls give a new array with them in it', () => {
    const board = boardWith([statue()]);
    const first = sightGeometryOf(board, NO_OUTLINES);
    const walls = [northWall()];

    const second = sightGeometryOf({ ...board, walls }, NO_OUTLINES);

    expect(second.walls).not.toBe(first.walls);
    expect(second.walls[0]).toBe(gameWallsOf(walls)[0]);
    expect(second.walls).toHaveLength(2);
  });

  it('a scene that shrinks over the blocker gives the shape held on the new border', () => {
    const board = boardWith([statue({ imageAssetId: IMAGE_ID })]);
    sightGeometryOf(board, NO_OUTLINES);
    const scene = { ...SCENE, widthCells: 4, heightCells: 4 };

    const { blockers } = sightGeometryOf({ ...board, scene }, NO_OUTLINES);

    expect(blockers[0]?.polygons[0]).toEqual([
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
    ]);
  });

  it('going back and forth between two boards keeps each one its own geometry', () => {
    const shown = boardWith([statue()]);
    const group = boardWith([statue({ col: 9 })]);
    const first = sightGeometryOf(shown, NO_OUTLINES);
    sightGeometryOf(group, NO_OUTLINES);

    expect(sightGeometryOf(shown, NO_OUTLINES)).toBe(first);
  });
});

describe('sightGeometryOf when an outline arrives', () => {
  const tokens = [statue({ imageAssetId: IMAGE_ID })];

  it('the outline with points gives a new array in its shape', () => {
    const board = boardWith(tokens);
    const before = sightGeometryOf(board, NO_OUTLINES);

    const after = sightGeometryOf(board, new Map([[IMAGE_ID, TRIANGLE]]));

    expect(after.walls).not.toBe(before.walls);
    expect(after.blockers[0]?.polygons[0]).toHaveLength(3);
  });

  it.each<[string, SightOutline | null]>([
    ['no outline (an older image)', null],
    ['an empty outline (a transparent image)', []],
  ])('%s keeps the rectangle and the array', (_case, outline) => {
    const board = boardWith(tokens);
    const before = sightGeometryOf(board, NO_OUTLINES);

    expect(sightGeometryOf(board, new Map([[IMAGE_ID, outline]]))).toBe(before);
  });

  it('on the round frame the outline changes nothing: the disc blocks', () => {
    const board = boardWith([statue({ imageAssetId: IMAGE_ID, frame: 'round' })]);
    const before = sightGeometryOf(board, NO_OUTLINES);

    expect(sightGeometryOf(board, new Map([[IMAGE_ID, TRIANGLE]]))).toBe(before);
  });

  it('the outline of another asset changes nothing', () => {
    const board = boardWith(tokens);
    const before = sightGeometryOf(board, NO_OUTLINES);

    expect(sightGeometryOf(board, new Map([[OTHER_IMAGE_ID, TRIANGLE]]))).toBe(before);
  });
});

describe('sightGeometryOf with the pose shown', () => {
  const tokens = [statue({ imageAssetId: IMAGE_ID }), kael()];
  const outlines: SightOutlines = new Map([[IMAGE_ID, TRIANGLE]]);

  it('the dragged blocker blocks from where it shows', () => {
    const landing: TokenLanding = new Map([[LYRA_ID, { col: 7, row: 8, facing: 0 }]]);

    const { blockers } = sightGeometryOf(boardWith(tokens), outlines, landing);

    expect(blockers[0]?.polygons[0]).toEqual([
      { x: 8, y: 8 },
      { x: 9, y: 10 },
      { x: 7, y: 10 },
    ]);
  });

  it('the turn shown before the ack turns the shape around its center', () => {
    const landing: TokenLanding = new Map([[LYRA_ID, { col: 3, row: 3, facing: 180 }]]);

    const { blockers } = sightGeometryOf(boardWith(tokens), outlines, landing);

    const apex = blockers[0]?.polygons[0]?.[0];
    expect(apex?.x).toBeCloseTo(4);
    expect(apex?.y).toBeCloseTo(5);
  });

  it('the drag of another token keeps the same geometry', () => {
    const board = boardWith(tokens);
    const before = sightGeometryOf(board, outlines, NO_LANDING);
    const landing: TokenLanding = new Map([[KAEL_ID, { col: 9, row: 9, facing: 0 }]]);

    expect(sightGeometryOf(board, outlines, landing)).toBe(before);
  });

  it('a landing on the confirmed pose is the same geometry as no landing', () => {
    const board = boardWith(tokens);
    const before = sightGeometryOf(board, outlines);
    const landing: TokenLanding = new Map([[LYRA_ID, { col: 3, row: 3, facing: 0 }]]);

    expect(sightGeometryOf(board, outlines, landing)).toBe(before);
  });
});

describe('blockerAssetIdsOf', () => {
  it('lists the image of a blocker on the square frame', () => {
    expect(blockerAssetIdsOf([statue({ imageAssetId: IMAGE_ID })])).toEqual([IMAGE_ID]);
  });

  it('lists an image shared by two blockers once', () => {
    const both = [
      statue({ imageAssetId: IMAGE_ID }),
      statue({ id: KAEL_ID, imageAssetId: IMAGE_ID }),
    ];

    expect(blockerAssetIdsOf(both)).toEqual([IMAGE_ID]);
  });

  it.each<[string, TokenDto]>([
    ['a token that does not block', lyra({ imageAssetId: IMAGE_ID })],
    ['a hidden blocker', statue({ imageAssetId: IMAGE_ID, hidden: true })],
    [
      'a blocker on the round frame, which ignores the outline',
      statue({ imageAssetId: IMAGE_ID, frame: 'round' }),
    ],
    ['a blocker with no image', statue()],
  ])('leaves out %s', (_case, token) => {
    expect(blockerAssetIdsOf([token])).toEqual([]);
  });
});

describe('blockerTokensOf', () => {
  it('keeps those that cut sight now: not the hidden one, nor the one without the switch', () => {
    const blocker = statue();
    const hidden = statue({ id: KAEL_ID, hidden: true });
    expect(blockerTokensOf([blocker, hidden, kael()])).toEqual([blocker]);
  });

  it('gives no one on a table without the feature', () => {
    expect(blockerTokensOf([lyra(), kael()])).toEqual([]);
  });

  it('sweeps an array once: the same array hands back the very same list', () => {
    const tokens = [statue(), kael()];
    expect(blockerTokensOf(tokens)).toBe(blockerTokensOf(tokens));
  });

  it('sweeps a new array again: the reducer hands one when a token changes', () => {
    const before = [statue()];
    const after = [statue({ hidden: true })];
    expect(blockerTokensOf(before)).toHaveLength(1);
    expect(blockerTokensOf(after)).toEqual([]);
  });
});
