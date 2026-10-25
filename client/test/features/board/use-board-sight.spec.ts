import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { levelOf } from '@/lib/board-sight';
import { startRoute } from '@/lib/token-route';
import { sightNowOf, type SightInteraction } from '@/features/board/use-board-sight';
import { playerIdsOf } from '@/lib/table-role';
import type { TokenDrag } from '@/stores/board-interaction-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { northWall } from '../../support/wall-fixtures';
import { veiledTorch } from '../../support/light-fixtures';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  VHARN_SCENE,
  duda,
  kael,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

// Lyra (Bia's) at (3, 4) has no darkvision and a lit torch of 3 + 3 cells; the ogre at (11, 4) is
// hidden from her confirmed cell and seen with Lyra at (9, 4).
const OGRE_ID = 'aa11bb22-cc33-4d44-8e55-ff6677889900';
const LYRA = lyra({
  sight: null,
  light: { bright: 3, dim: 3, color: null, angle: 360 },
  lightLit: true,
});
const OGRE: TokenDto = kael({
  canControl: false,
  controllerIds: [],
  id: OGRE_ID,
  name: 'Ogro',
  col: 11,
  row: 4,
  side: 'enemy',
});
const BOARD: BoardStateDto = vharnBoard({
  viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
  scene: { ...VHARN_SCENE, vision: 'dark' },
  tokens: [LYRA, OGRE],
});
// Bia is a player: the table's players matter only to a spectator.
const NO_PLAYERS: readonly string[] = [];
const IDLE: SightInteraction = {
  sightPreview: false,
  selectedTokenIds: [],
  drag: null,
  preview: [],
  facingPreview: {},
};

function lyraDraggedTo(col: number, bendAt?: number): TokenDrag {
  const route = startRoute(cell(3, 4), 0);
  return {
    members: [{ tokenId: LYRA_ID, col: 3, row: 4, width: 1, height: 1 }],
    scene: { widthCells: VHARN_SCENE.widthCells, heightCells: VHARN_SCENE.heightCells },
    anchorId: LYRA_ID,
    route: bendAt === undefined ? route : { ...route, bends: [cell(bendAt, 4)] },
    landing: [{ tokenId: LYRA_ID, col, row: 4 }],
  };
}

describe('sightNowOf', () => {
  it('the light of a hidden wolf over the ogre lets Bia see him: veiled lights are part of the filter', () => {
    const before = sightNowOf({ board: BOARD, dragged: {} }, IDLE, NO_PLAYERS);
    const veiledLights = [veiledTorch({ x: 11.5, y: 4.5, bright: 2, dim: 0 })];
    const lit = sightNowOf({ board: { ...BOARD, veiledLights }, dragged: {} }, IDLE, NO_PLAYERS);

    expect(levelOf(before, OGRE_ID)).toBe('hidden');
    expect(levelOf(lit, OGRE_ID)).toBe('seen');
  });

  it('with the master dragging Lyra to (9, 4), Bia sees the ogre', () => {
    const sight = sightNowOf(
      { board: BOARD, dragged: { [LYRA_ID]: { col: 9, row: 4 } } },
      IDLE,
      NO_PLAYERS,
    );

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('with Bia dragging Lyra to (9, 4), she sees the ogre before dropping', () => {
    const sight = sightNowOf(
      { board: BOARD, dragged: {} },
      { ...IDLE, drag: lyraDraggedTo(9) },
      NO_PLAYERS,
    );

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('with Lyra dropped at (9, 4) and the server yet to answer, the ogre stays seen', () => {
    const preview = [{ tokenId: LYRA_ID, col: 9, row: 4 }];
    const sight = sightNowOf({ board: BOARD, dragged: {} }, { ...IDLE, preview }, NO_PLAYERS);

    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });

  it('the same board, preview and shown cells give back the very same sight', () => {
    const table = { board: BOARD, dragged: { [LYRA_ID]: { col: 9, row: 4 } } };
    const first = sightNowOf(table, IDLE, NO_PLAYERS);

    expect(sightNowOf({ ...table, dragged: { ...table.dragged } }, { ...IDLE }, NO_PLAYERS)).toBe(
      first,
    );
  });

  it('a drag whose route only bends, landing on the same cell, gives back the very same sight', () => {
    const table = { board: BOARD, dragged: {} };
    const straight = sightNowOf(table, { ...IDLE, drag: lyraDraggedTo(9) }, NO_PLAYERS);

    expect(sightNowOf(table, { ...IDLE, drag: lyraDraggedTo(9, 6) }, NO_PLAYERS)).toBe(straight);
  });

  it('a new cell in other people’s drags gives a new sight', () => {
    const at = (col: number) =>
      sightNowOf({ board: BOARD, dragged: { [LYRA_ID]: { col, row: 4 } } }, IDLE, NO_PLAYERS);
    const nine = at(9);

    expect(at(8)).not.toBe(nine);
  });

  it('without a board nothing is hidden', () => {
    const sight = sightNowOf({ board: null, dragged: {} }, IDLE, NO_PLAYERS);

    expect(sight.active).toBe(false);
    expect(levelOf(sight, OGRE_ID)).toBe('seen');
  });
});

describe('sightNowOf while Lyra turns', () => {
  const table = { board: BOARD, dragged: {} };

  it('another facing preview gives a new sight', () => {
    const still = sightNowOf(table, IDLE, NO_PLAYERS);
    const turning = sightNowOf(table, { ...IDLE, facingPreview: { [LYRA_ID]: 180 } }, NO_PLAYERS);

    expect(turning).not.toBe(still);
  });

  it('the same facing preview gives back the very same sight', () => {
    const first = sightNowOf(table, { ...IDLE, facingPreview: { [LYRA_ID]: 180 } }, NO_PLAYERS);
    const again = sightNowOf(table, { ...IDLE, facingPreview: { [LYRA_ID]: 180 } }, NO_PLAYERS);

    expect(again).toBe(first);
  });
});

describe('sightNowOf works the filter out again only when what it reads changes', () => {
  // A goblin at (6, 4) that is nobody's eye and carries no light; the ogre stays at (11, 4).
  const GOBLIN_ID = 'bb22cc33-dd44-4e55-8f66-0011223344aa';
  const GOBLIN: TokenDto = { ...OGRE, id: GOBLIN_ID, name: 'Goblin', col: 6, row: 4 };
  const WALLED = { ...BOARD, tokens: [LYRA, OGRE, GOBLIN], walls: [northWall()] };

  it('a new drawing (a new board, the same tokens, walls and lights) gives back the very same sight', () => {
    const before = sightNowOf({ board: WALLED, dragged: {} }, IDLE, NO_PLAYERS);
    const drawn = { ...WALLED, version: WALLED.version + 1, drawings: [] };

    expect(sightNowOf({ board: drawn, dragged: {} }, IDLE, NO_PLAYERS)).toBe(before);
  });

  it('a token moved gives a new sight', () => {
    const before = sightNowOf({ board: WALLED, dragged: {} }, IDLE, NO_PLAYERS);
    const tokens = [LYRA, { ...OGRE, col: 4 }, GOBLIN];

    expect(sightNowOf({ board: { ...WALLED, tokens }, dragged: {} }, IDLE, NO_PLAYERS)).not.toBe(
      before,
    );
  });

  it('a door opening (new walls) gives a new sight', () => {
    const before = sightNowOf({ board: WALLED, dragged: {} }, IDLE, NO_PLAYERS);
    const walls = [northWall({ kind: 'grate' })];

    expect(sightNowOf({ board: { ...WALLED, walls }, dragged: {} }, IDLE, NO_PLAYERS)).not.toBe(
      before,
    );
  });

  it('someone dragging the goblin into the dark changes only its level', () => {
    const before = sightNowOf({ board: WALLED, dragged: {} }, IDLE, NO_PLAYERS);
    const after = sightNowOf(
      { board: WALLED, dragged: { [GOBLIN_ID]: { col: 15, row: 4 } } },
      IDLE,
      NO_PLAYERS,
    );

    expect(levelOf(before, GOBLIN_ID)).toBe('seen');
    expect(levelOf(after, GOBLIN_ID)).toBe('hidden');
    expect(levelOf(after, OGRE_ID)).toBe(levelOf(before, OGRE_ID));
    expect(after.eyes).toBe(before.eyes);
  });
});

describe('sightNowOf for a spectator keys the players by their ids', () => {
  // Duda watches through Bia's Lyra and Caio's Kael, at (3, 4) and (5, 4).
  const DUDA_BOARD: BoardStateDto = vharnBoard({
    viewer: { userId: duda().userId, role: 'spectator' },
    scene: { ...VHARN_SCENE, vision: 'dark' },
    tokens: [
      lyra({ canControl: false }),
      kael({ canControl: false, controllerIds: [CAIO_AT_TABLE.userId] }),
      OGRE,
    ],
  });
  const PLAYERS = [BIA_AT_TABLE.userId, CAIO_AT_TABLE.userId];
  const table = { board: DUDA_BOARD, dragged: {} };

  it('the same players in a new array give back the very same sight', () => {
    const first = sightNowOf(table, IDLE, PLAYERS);

    expect(sightNowOf(table, IDLE, [...PLAYERS].reverse())).toBe(first);
  });

  it('a player demoted (Caio out of the players) gives a new sight without his Kael as an eye', () => {
    const both = sightNowOf(table, IDLE, PLAYERS);
    const onlyBia = sightNowOf(table, IDLE, [BIA_AT_TABLE.userId]);

    expect(onlyBia).not.toBe(both);
    expect(both.eyeTokenIds).toEqual([LYRA_ID, KAEL_ID]);
    expect(onlyBia.eyeTokenIds).toEqual([LYRA_ID]);
  });

  it('Bia going away (a new roster, the same players) does not work the filter out again', () => {
    const presence = createTablePresenceStore(VHARN.id);
    const members = [ANA_AT_TABLE, { ...BIA_AT_TABLE, online: true }, CAIO_AT_TABLE, duda()];
    presence.getState().apply({ kind: 'state', state: vharnState({ members }) });
    const before = sightNowOf(table, IDLE, playerIdsOf(presence.getState().members));
    const roster = presence.getState().members;
    presence.getState().apply({
      kind: 'memberActivity',
      event: {
        campaignId: VHARN.id,
        version: 2,
        userId: BIA_AT_TABLE.userId,
        awaySince: '2026-10-15T12:05:00.000Z',
        at: '2026-10-15T12:05:00.000Z',
      },
    });

    expect(presence.getState().members).not.toBe(roster);
    expect(sightNowOf(table, IDLE, playerIdsOf(presence.getState().members))).toBe(before);
  });

  it('for Bia, a player, other players never work the filter out again', () => {
    const bia = { board: BOARD, dragged: {} };
    const first = sightNowOf(bia, IDLE, PLAYERS);

    expect(sightNowOf(bia, IDLE, [BIA_AT_TABLE.userId])).toBe(first);
  });
});
