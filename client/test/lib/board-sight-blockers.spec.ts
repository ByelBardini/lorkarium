import { blockedPassage, tokenCenter } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  boardSightOf,
  eyeOfToken,
  levelOf,
  poseShapingIdsOf,
  seenTokensOf,
  sightWithMovedOf,
} from '@/lib/board-sight';
import type { TokenLanding } from '@/lib/light-sources';
import { sightGeometryOf } from '@/lib/sight-geometry';
import { gameWallsOf } from '@/lib/wall-geometry';
import { corridorTorch } from '../support/light-fixtures';
import {
  GOBLIN_ID,
  OGRE_ID,
  RIGHT_STRIP_OUTLINE,
  STATUE_ID,
  TRACED_ASSET_ID,
  blockerBoard,
  goblin,
  lookout,
  ogre,
  statue,
  tracedOutlines,
} from '../support/sight-blocker-fixtures';
import { ANA_AT_TABLE, LYRA_ID } from '../support/table-session-fixtures';
import { CELL_DOOR_ID, cellDoor } from '../support/wall-fixtures';

const NO_LANDING: TokenLanding = new Map();
const ANA = { userId: ANA_AT_TABLE.userId, role: 'master' as const };
const PLAYER_VIEW = { previewEyeIds: null };

function moved(id: string, col: number, row: number, facing = 0): TokenLanding {
  return new Map([[id, { col, row, facing }]]);
}

describe('boardSightOf for Bia with a statue in the way', () => {
  it('in the dark with Lyra, the ogre behind the statue is hidden', () => {
    const sight = boardSightOf(blockerBoard([lookout(), statue(), ogre()]), PLAYER_VIEW);

    expect(levelOf(sight, OGRE_ID)).toBe('hidden');
  });

  it('the same ogre is seen when the statue does not block', () => {
    const tokens = [lookout(), statue({ blocksSight: false }), ogre()];

    expect(levelOf(boardSightOf(blockerBoard(tokens), PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });

  it('the statue itself is seen, with its center behind its own outline', () => {
    const sight = boardSightOf(blockerBoard([lookout(), statue(), ogre()]), PLAYER_VIEW);

    expect(levelOf(sight, STATUE_ID)).toBe('seen');
  });

  it('a second statue behind the first is hidden, even leaving itself out', () => {
    const second = statue({ id: OGRE_ID, col: 7, row: 5 });

    const sight = boardSightOf(blockerBoard([lookout(), statue(), second]), PLAYER_VIEW);

    expect(levelOf(sight, OGRE_ID)).toBe('hidden');
  });

  it('a hidden statue does not block: its place would be given away', () => {
    const tokens = [lookout(), statue({ hidden: true }), ogre()];

    expect(levelOf(boardSightOf(blockerBoard(tokens), PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });

  it('the lists leave the ogre out and keep the statue', () => {
    const board = blockerBoard([lookout(), statue(), ogre()]);

    const seen = seenTokensOf(board, boardSightOf(board, PLAYER_VIEW)).map(({ id }) => id);

    expect(seen).toEqual([LYRA_ID, STATUE_ID]);
  });

  it('the statue shown elsewhere stops hiding the ogre before the move is confirmed', () => {
    const board = blockerBoard([lookout(), statue(), ogre()]);

    const sight = boardSightOf(board, { ...PLAYER_VIEW, landing: moved(STATUE_ID, 4, 9) });

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('the outline decides: a strip at the top of the art lets the line pass', () => {
    const board = blockerBoard([lookout(), statue({ imageAssetId: TRACED_ASSET_ID }), ogre()]);

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('hidden');
    const traced = { ...PLAYER_VIEW, outlines: tracedOutlines() };
    expect(levelOf(boardSightOf(board, traced), OGRE_ID)).toBe('seen');
  });
});

describe('boardSightOf with the eye on a blocker', () => {
  const BIG_STATUE = statue({ col: 3, row: 4, width: 3, height: 3 });

  it('Lyra standing inside the statue sees past it', () => {
    const board = blockerBoard([lookout({ col: 4, row: 5 }), BIG_STATUE, ogre()]);

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });

  it('the same Lyra outside it, on the far side, does not', () => {
    const board = blockerBoard([lookout({ col: 1, row: 5 }), BIG_STATUE, ogre()]);

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('hidden');
  });

  it('a Lyra who blocks sees past her own shape, even with her center out of it', () => {
    const own = lookout({ blocksSight: true, imageAssetId: TRACED_ASSET_ID });
    const options = { ...PLAYER_VIEW, outlines: tracedOutlines(RIGHT_STRIP_OUTLINE) };

    const sight = boardSightOf(blockerBoard([own, ogre()]), options);

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('eyeOfToken leaves out the very walls of the blocker she stands on', () => {
    const board = blockerBoard([lookout({ col: 4, row: 5 }), BIG_STATUE]);
    const { blockers } = sightGeometryOf(board, new Map());

    const eye = eyeOfToken(board.tokens[0]!, undefined, blockers);

    expect(eye.ignores).toBe(blockers[0]?.walls);
  });

  it('with no blocker around, the eye has no list at all', () => {
    expect(eyeOfToken(lookout(), undefined)).not.toHaveProperty('ignores');
  });
});

describe('boardSightOf and the light with a blocker', () => {
  // Lyra has no darkvision and sees (7, 5) across the room only by the torch at (7.5, 9.5), whose
  // line up to the ogre crosses (7, 7).
  const BLIND = lookout({ sight: null });
  const STATUE_BY_THE_TORCH = statue({ col: 7, row: 7 });
  const TORCH = corridorTorch({ x: 7.5, y: 9.5, bright: 6, dim: 0 });

  it('the torch behind the statue does not light the ogre', () => {
    const board = blockerBoard([BLIND, STATUE_BY_THE_TORCH, ogre()], { lights: [TORCH] });

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('hidden');
  });

  it('the same torch lights him with the statue not blocking', () => {
    const statueAside = statue({ col: 7, row: 7, blocksSight: false });
    const board = blockerBoard([BLIND, statueAside, ogre()], { lights: [TORCH] });

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });

  it('a torch inside the statue gets out of it', () => {
    const inside = corridorTorch({ x: 7.5, y: 7.5, bright: 6, dim: 0 });
    const board = blockerBoard([BLIND, STATUE_BY_THE_TORCH, ogre()], { lights: [inside] });

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });

  it('the statue that carries the torch lights what is around it', () => {
    const light = { bright: 6, dim: 0, color: null, angle: 360 };
    const board = blockerBoard([BLIND, statue({ col: 7, row: 7, light, lightLit: true }), ogre()]);

    expect(levelOf(boardSightOf(board, PLAYER_VIEW), OGRE_ID)).toBe('seen');
  });
});

describe('boardSightOf and the doors with a blocker', () => {
  it('the door behind the statue is not seen, the rule the server applies', () => {
    const board = blockerBoard([lookout(), statue()], { walls: [cellDoor()] });

    expect(boardSightOf(board, PLAYER_VIEW).seenDoorIds).toEqual(new Set());
  });

  it('the statue moved aside shows the door again', () => {
    const board = blockerBoard([lookout(), statue({ row: 9 })], { walls: [cellDoor()] });

    expect(boardSightOf(board, PLAYER_VIEW).seenDoorIds).toEqual(new Set([CELL_DOOR_ID]));
  });
});

describe('boardSightOf for the master and a blocker', () => {
  const TOKENS = [lookout({ canControl: false }), statue(), ogre()];

  it('the master without a preview is not filtered', () => {
    const sight = boardSightOf(blockerBoard(TOKENS, { viewer: ANA }), PLAYER_VIEW);

    expect(sight.active).toBe(false);
    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('with "Ver como os selecionados", the master is', () => {
    const board = blockerBoard(TOKENS, { viewer: ANA });

    const sight = boardSightOf(board, { previewEyeIds: [LYRA_ID] });

    expect(levelOf(sight, OGRE_ID)).toBe('hidden');
  });
});

describe('poseShapingIdsOf with blockers', () => {
  it('a blocker shapes everyone else: moving it redoes the filter', () => {
    const board = blockerBoard([lookout(), statue(), ogre()]);

    const ids = poseShapingIdsOf(board, null);

    expect([...ids].sort()).toEqual([LYRA_ID, STATUE_ID].sort());
  });

  it('a hidden blocker shapes nothing', () => {
    const board = blockerBoard([lookout(), statue({ hidden: true })]);

    expect(poseShapingIdsOf(board, null).has(STATUE_ID)).toBe(false);
  });
});

describe('sightWithMovedOf with a blocker', () => {
  const BOARD = blockerBoard([lookout(), statue(), goblin()]);

  it('a goblin dragged behind the statue is hidden from there', () => {
    const previous = boardSightOf(BOARD, PLAYER_VIEW);
    expect(levelOf(previous, GOBLIN_ID)).toBe('seen');

    const landing = moved(GOBLIN_ID, 7, 5);
    const sight = sightWithMovedOf(previous, BOARD, { ...PLAYER_VIEW, landing }, [GOBLIN_ID]);

    expect(levelOf(sight, GOBLIN_ID)).toBe('hidden');
  });

  it('a goblin dragged under a torch inside a statue is lit: the torch still gets out of it', () => {
    const torch = corridorTorch({ x: 7.5, y: 7.5, bright: 6, dim: 0 });
    const tokens = [lookout({ sight: null }), statue({ col: 7, row: 7 }), goblin({ col: 18 })];
    const board = blockerBoard(tokens, { lights: [torch] });
    const previous = boardSightOf(board, PLAYER_VIEW);
    const landing = moved(GOBLIN_ID, 7, 5);

    const sight = sightWithMovedOf(previous, board, { ...PLAYER_VIEW, landing }, [GOBLIN_ID]);

    expect(levelOf(sight, GOBLIN_ID)).toBe('seen');
  });

  it('a blocker worked out again still does not hide itself', () => {
    const previous = boardSightOf(BOARD, PLAYER_VIEW);

    const sight = sightWithMovedOf(previous, BOARD, { ...PLAYER_VIEW, landing: NO_LANDING }, [
      STATUE_ID,
    ]);

    expect(levelOf(sight, STATUE_ID)).toBe('seen');
  });
});

describe('the passage and the blocker', () => {
  it('the walls of the route do not hold the statue, which hides without barring', () => {
    const board = blockerBoard([lookout(), statue()]);
    const center = tokenCenter({ col: 7, row: 5 }, { width: 1, height: 1 });
    const from = { x: 1.5, y: 5.5 };

    expect(gameWallsOf(board.walls)).toEqual([]);
    expect(blockedPassage([from, center], sightGeometryOf(board, new Map()).walls)).toBeNull();
  });
});
