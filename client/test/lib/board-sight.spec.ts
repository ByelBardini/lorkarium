import type { BoardStateDto, SceneVisionDto, TokenDto, WallDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { boardSightOf, levelOf, seenTokensOf } from '@/lib/board-sight';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  VHARN_SCENE,
  kael,
  lyra,
  vharnBoard,
} from '../support/table-session-fixtures';
import { corridorTorch } from '../support/light-fixtures';
import { CELL_DOOR_ID, cellDoor, northWall } from '../support/wall-fixtures';

const OGRE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const TREE_ID = 'bb22cc33-dd44-4e55-8f66-007788990011';

// Lyra (Bia's) stands at (3, 4), center (3.5, 4.5), and sees 3 cells fully and 3 more dimly.
function biaBoard(vision: SceneVisionDto, tokens: TokenDto[], walls = [cellDoor()]): BoardStateDto {
  return vharnBoard({
    viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
    scene: { ...VHARN_SCENE, vision },
    tokens,
    walls,
  });
}

const LYRA = lyra({ sight: { bright: 3, dim: 3 } });
const someoneElse = { canControl: false, controllerIds: [] };
const KAEL_AT_2 = kael({ ...someoneElse, col: 5, row: 4 });

function ogreAt(col: number, row = 4): TokenDto {
  return kael({ ...someoneElse, id: OGRE_ID, name: 'Ogro', col, row, side: 'enemy' });
}

describe('boardSightOf for Bia in the dark', () => {
  it.each([
    ['her own Lyra', LYRA_ID, 'seen'],
    ['Kael at 2', KAEL_ID, 'seen'],
  ] as const)('%s is seen', (_name, tokenId, level) => {
    const sight = boardSightOf(biaBoard('dark', [LYRA, KAEL_AT_2]), { previewEyeIds: null });
    expect(levelOf(sight, tokenId)).toBe(level);
  });

  it('an ogre at 5 is a silhouette, and one at 8 is hidden', () => {
    const near = boardSightOf(biaBoard('dark', [LYRA, ogreAt(8)]), { previewEyeIds: null });
    const far = boardSightOf(biaBoard('dark', [LYRA, ogreAt(11)]), { previewEyeIds: null });

    expect(levelOf(near, OGRE_ID)).toBe('silhouette');
    expect(levelOf(far, OGRE_ID)).toBe('hidden');
  });

  it('an ogre at 2 behind a wall is hidden', () => {
    const wall = northWall({
      x: 4.8,
      y: 0,
      width: 0,
      height: 12,
      points: [
        [0, 0],
        [0, 12],
      ],
    } as never);
    const sight = boardSightOf(biaBoard('dark', [LYRA, ogreAt(5)], [wall]), {
      previewEyeIds: null,
    });

    expect(levelOf(sight, OGRE_ID)).toBe('hidden');
  });

  it('a tree of the Background layer at 5 is seen whole, as part of the map', () => {
    const tree = kael({ ...someoneElse, id: TREE_ID, col: 8, row: 4, layer: 'background' });
    const sight = boardSightOf(biaBoard('dark', [LYRA, tree]), { previewEyeIds: null });

    expect(levelOf(sight, TREE_ID)).toBe('seen');
  });

  it('the door of the cell, 3.5 away, is among the doors she sees', () => {
    const sight = boardSightOf(biaBoard('dark', [LYRA]), { previewEyeIds: null });

    expect(sight.seenDoorIds).toEqual(new Set([CELL_DOOR_ID]));
  });

  // Plan 2026-10-18-iluminacao: every token is an eye; without darkvision and light, it sees nothing.
  it('with Lyra without darkvision and no light, she is still an eye and only her tokens are seen', () => {
    const blind = lyra({ sight: null });
    const sight = boardSightOf(biaBoard('dark', [blind, KAEL_AT_2]), { previewEyeIds: null });

    expect(sight.noEyes).toBe(false);
    expect(seenTokensOf(biaBoard('dark', [blind, KAEL_AT_2]), sight).map(({ id }) => id)).toEqual([
      LYRA_ID,
    ]);
  });

  it('only when Bia controls no token on the scene she has no eyes', () => {
    const sight = boardSightOf(biaBoard('dark', [KAEL_AT_2]), { previewEyeIds: null });

    expect(sight.noEyes).toBe(true);
  });
});

describe('boardSightOf in the other modes and for the master', () => {
  it('with vision off every token is seen and every door shows', () => {
    const sight = boardSightOf(biaBoard('off', [LYRA, ogreAt(11)]), { previewEyeIds: null });

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
    expect(sight.seenDoorIds).toBeNull();
    expect(sight.active).toBe(false);
  });

  it('by daylight an ogre 15 cells away in an empty room is seen', () => {
    const sight = boardSightOf(biaBoard('daylight', [LYRA, ogreAt(18.5)], []), {
      previewEyeIds: null,
    });

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('Ana, the master, sees every token in the dark', () => {
    const board = vharnBoard({
      viewer: { userId: ANA_AT_TABLE.userId, role: 'master' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens: [LYRA, ogreAt(11)],
    });

    expect(levelOf(boardSightOf(board, { previewEyeIds: null }), OGRE_ID)).toBe('seen');
  });
});

describe('boardSightOf, the master previewing the selected tokens', () => {
  const anaDark = (tokens: TokenDto[]) =>
    vharnBoard({
      viewer: { userId: ANA_AT_TABLE.userId, role: 'master' },
      scene: { ...VHARN_SCENE, vision: 'dark' },
      tokens,
    });

  it('with Lyra selected, Ana gets the same levels as Bia', () => {
    const tokens = [LYRA, ogreAt(8), kael({ ...someoneElse, id: TREE_ID, col: 11, row: 4 })];
    const ana = boardSightOf(anaDark(tokens), { previewEyeIds: [LYRA_ID] });
    const bia = boardSightOf(biaBoard('dark', tokens), { previewEyeIds: null });

    expect([levelOf(ana, OGRE_ID), levelOf(ana, TREE_ID)]).toEqual([
      levelOf(bia, OGRE_ID),
      levelOf(bia, TREE_ID),
    ]);
    expect(levelOf(ana, OGRE_ID)).toBe('silhouette');
  });

  it('with no token selected, every token is seen and the preview is blind', () => {
    const sight = boardSightOf(anaDark([lyra({ sight: null }), ogreAt(11)]), {
      previewEyeIds: [],
    });

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
    expect(sight.previewBlind).toBe(true);
  });

  it('with a Lyra without darkvision selected, the preview is on and the unlit ogre is hidden', () => {
    const sight = boardSightOf(anaDark([lyra({ sight: null }), ogreAt(11)]), {
      previewEyeIds: [LYRA_ID],
    });

    expect(sight.previewBlind).toBe(false);
    expect(levelOf(sight, OGRE_ID)).toBe('hidden');
  });
});

describe('boardSightOf for Bia with lights', () => {
  // Lyra (Bia's) at (3, 4) has no darkvision; the ogre stands 8 cells away, at column 11.
  const BLIND_LYRA = lyra({ sight: null });
  const TORCH_ON_OGRE = corridorTorch({ x: 11.5, y: 4.5, bright: 2, dim: 0 });

  function litBoard(
    vision: SceneVisionDto,
    tokens: TokenDto[],
    lights = [TORCH_ON_OGRE],
    walls: WallDto[] = [],
  ): BoardStateDto {
    return { ...biaBoard(vision, tokens, walls), lights };
  }

  function levelOfOgre(board: BoardStateDto): string {
    return levelOf(boardSightOf(board, { previewEyeIds: null }), OGRE_ID);
  }

  it('a lit torch over the ogre shows him to a Lyra without darkvision', () => {
    expect(levelOfOgre(litBoard('dark', [BLIND_LYRA, ogreAt(11)]))).toBe('seen');
  });

  it('with that torch out the ogre is hidden', () => {
    const out = [{ ...TORCH_ON_OGRE, lit: false }];
    expect(levelOfOgre(litBoard('dark', [BLIND_LYRA, ogreAt(11)], out))).toBe('hidden');
  });

  it('an ogre in the half-light of a torch is a silhouette', () => {
    const halfLight = [corridorTorch({ x: 8, y: 4.5, bright: 1, dim: 4 })];
    expect(levelOfOgre(litBoard('dark', [BLIND_LYRA, ogreAt(11)], halfLight))).toBe('silhouette');
  });

  it('the lantern of Bram, a token of Caio, shows the ogre to Bia', () => {
    const bram = kael({
      ...someoneElse,
      col: 10,
      row: 4,
      light: { bright: 2, dim: 0, color: null },
      lightLit: true,
    });
    expect(levelOfOgre(litBoard('dark', [BLIND_LYRA, bram, ogreAt(11)], []))).toBe('seen');
  });

  it('a wall between Lyra and the lit ogre hides him', () => {
    const wall = northWall({
      x: 6,
      y: 0,
      width: 0,
      height: 12,
      points: [
        [0, 0],
        [0, 12],
      ],
    } as never);
    expect(levelOfOgre(litBoard('dark', [BLIND_LYRA, ogreAt(11)], [TORCH_ON_OGRE], [wall]))).toBe(
      'hidden',
    );
  });

  it('by daylight a light that is out changes nothing: the ogre in line of sight is seen', () => {
    const out = [{ ...TORCH_ON_OGRE, lit: false }];
    expect(levelOfOgre(litBoard('daylight', [BLIND_LYRA, ogreAt(11)], out))).toBe('seen');
  });

  it('the door a torch lights is among the doors she sees', () => {
    const byTheDoor = [corridorTorch({ x: 8, y: 5.5, bright: 2, dim: 0 })];
    const sight = boardSightOf(litBoard('dark', [BLIND_LYRA], byTheDoor, [cellDoor()]), {
      previewEyeIds: null,
    });

    expect(sight.seenDoorIds).toEqual(new Set([CELL_DOOR_ID]));
  });
});
