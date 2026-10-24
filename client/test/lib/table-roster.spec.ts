import { describe, expect, it } from 'vitest';
import { characterNameOf, tableRosterOf } from '@/lib/table-roster';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  kael,
  lyra,
  memberCard,
  vharnBoard,
} from '../support/table-session-fixtures';
import { LYRA_ANCHOR_ID, castBoard, linkedLyra } from '../support/cast-fixtures';

const BIA_ONLINE = { ...BIA_AT_TABLE, online: true };
const CAIO_OFFLINE = { ...CAIO_AT_TABLE, online: false };
const EMPTY_CAIO_CARD = memberCard({ userId: CAIO_AT_TABLE.userId });
const caioKael = kael({ controllerIds: [CAIO_AT_TABLE.userId] });

function boardWith(overrides: Parameters<typeof vharnBoard>[0] = {}) {
  return vharnBoard({ tokens: [lyra(), caioKael], ...overrides });
}

describe('tableRosterOf', () => {
  it('Ana goes to the masters and Bia and Caio to the players, in the order of the server', () => {
    const members = [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      cast: null,
      viewerId: ANA_AT_TABLE.userId,
    });

    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana']);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia', 'Caio']);
  });

  it('Caio offline goes to the end of the players', () => {
    const members = [ANA_AT_TABLE, CAIO_OFFLINE, BIA_ONLINE];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      cast: null,
      viewerId: ANA_AT_TABLE.userId,
    });

    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia', 'Caio']);
  });

  it('two masters are both among the masters', () => {
    const caioMaster = { ...CAIO_AT_TABLE, role: 'master' as const };
    const members = [ANA_AT_TABLE, BIA_ONLINE, caioMaster];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      cast: null,
      viewerId: BIA_AT_TABLE.userId,
    });

    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana', 'Caio']);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia']);
  });

  it('each player carries their card and main token; a player without a card gets an empty one', () => {
    const board = boardWith({ memberCards: [memberCard({ armorClass: 15 })] });
    const members = [BIA_ONLINE, CAIO_AT_TABLE];

    const [bia, caio] = tableRosterOf({
      members,
      board,
      cast: null,
      viewerId: ANA_AT_TABLE.userId,
    }).players;

    expect(bia).toMatchObject({ card: memberCard({ armorClass: 15 }), token: { id: LYRA_ID } });
    expect(caio).toMatchObject({ card: EMPTY_CAIO_CARD, token: { id: KAEL_ID } });
  });

  it('a player without a main token on the scene has token null', () => {
    const board = vharnBoard({ tokens: [lyra()] });

    const roster = tableRosterOf({
      members: [CAIO_AT_TABLE],
      board,
      cast: null,
      viewerId: ANA_AT_TABLE.userId,
    });

    expect(roster.players[0]?.token).toBeNull();
  });

  it('the viewer is marked as such, in either section', () => {
    const members = [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      cast: null,
      viewerId: BIA_AT_TABLE.userId,
    });

    expect(roster.masters.map(({ isViewer }) => isViewer)).toEqual([false]);
    expect(roster.players.map(({ isViewer }) => isViewer)).toEqual([true, false]);
  });

  it('with the board still loading, the players come without token, card or character name', () => {
    const roster = tableRosterOf({
      members: [BIA_ONLINE],
      board: null,
      cast: null,
      viewerId: ANA_AT_TABLE.userId,
    });

    expect(roster.players).toEqual([
      { member: BIA_ONLINE, isViewer: false, card: null, token: null, characterName: null },
    ]);
  });

  it('the character name of each player is resolved from the card and the token', () => {
    const board = boardWith({ memberCards: [memberCard({ characterName: 'Lyra Vandel' })] });
    const members = [BIA_ONLINE, CAIO_AT_TABLE];

    const roster = tableRosterOf({ members, board, cast: null, viewerId: ANA_AT_TABLE.userId });

    expect(roster.players.map(({ characterName }) => characterName)).toEqual([
      'Lyra Vandel',
      'Kael',
    ]);
  });
});

describe('tableRosterOf, with the cast', () => {
  const biaCard = memberCard({ armorClass: 17, anchorTokenId: LYRA_ANCHOR_ID });

  it("the card comes from the cast (the table's version), not from the grid's snapshot", () => {
    const board = boardWith({ memberCards: [memberCard({ armorClass: 12 })] });
    const cast = castBoard({ memberCards: [biaCard] });

    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board,
      cast,
      viewerId: ANA_AT_TABLE.userId,
    }).players;

    expect(bia?.card).toEqual(biaCard);
  });

  it("without Lyra on the group grid, Bia's card shows the anchor: its portrait, bars and name", () => {
    const board = vharnBoard({ tokens: [caioKael] });
    const cast = castBoard({ memberCards: [biaCard] });

    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board,
      cast,
      viewerId: ANA_AT_TABLE.userId,
    }).players;

    expect(bia?.token).toBe(cast.tokens[0]);
    expect(bia?.characterName).toBe('Lyra');
  });

  it("the linked Lyra of the grid is Bia's main token, before an older token she controls", () => {
    const board = vharnBoard({ tokens: [kael(), linkedLyra()], memberCards: [biaCard] });
    const cast = castBoard({ memberCards: [biaCard] });

    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board,
      cast,
      viewerId: ANA_AT_TABLE.userId,
    }).players;

    expect(bia?.token?.id).toBe(LYRA_ID);
  });

  it('without an anchor, the main token of the group grid as before', () => {
    const cast = castBoard({ memberCards: [memberCard()] });

    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board: boardWith(),
      cast,
      viewerId: ANA_AT_TABLE.userId,
    }).players;

    expect(bia?.token?.id).toBe(LYRA_ID);
  });
});

describe('characterNameOf', () => {
  it('the nickname wins over the token name', () => {
    expect(characterNameOf(memberCard({ characterName: 'Lyra Vandel' }), lyra())).toBe(
      'Lyra Vandel',
    );
  });

  it('without a nickname, the token name', () => {
    expect(characterNameOf(memberCard(), lyra())).toBe('Lyra');
  });

  it('without either, null', () => {
    expect(characterNameOf(memberCard(), null)).toBeNull();
  });
});
