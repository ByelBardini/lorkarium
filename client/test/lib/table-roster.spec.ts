import { describe, expect, it } from 'vitest';
import { tableRosterOf } from '@/lib/table-roster';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  kael,
  lyra,
  duda,
  rootJuggernaut,
  vharnBoard,
} from '../support/table-session-fixtures';
import {
  kaelCharacter,
  linkedKael,
  linkedLyra,
  lyraCharacter,
} from '../support/character-fixtures';

const BIA_ONLINE = { ...BIA_AT_TABLE, online: true };
const CAIO_OFFLINE = { ...CAIO_AT_TABLE, online: false };
const caioKael = kael({ controllerIds: [CAIO_AT_TABLE.userId] });

function boardWith(overrides: Parameters<typeof vharnBoard>[0] = {}) {
  return vharnBoard({ tokens: [lyra(), caioKael], ...overrides });
}

describe('tableRosterOf', () => {
  it('Ana goes to the masters and Bia and Caio to the players, in the order of the server', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, BIA_ONLINE, CAIO_AT_TABLE],
      board: boardWith(),
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana']);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia', 'Caio']);
  });

  it('Caio offline goes to the end of the players', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, CAIO_OFFLINE, BIA_ONLINE],
      board: boardWith(),
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia', 'Caio']);
  });

  it('two masters are both among the masters', () => {
    const caioMaster = { ...CAIO_AT_TABLE, role: 'master' as const };
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, BIA_ONLINE, caioMaster],
      board: boardWith(),
      characters: null,
      viewerId: BIA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana', 'Caio']);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia']);
  });

  it('the viewer is marked as such, in either section', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, BIA_ONLINE],
      board: boardWith(),
      characters: null,
      viewerId: BIA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
    expect(roster.masters[0]?.isViewer).toBe(false);
    expect(roster.players[0]?.isViewer).toBe(true);
  });
});

describe('tableRosterOf, with the characters', () => {
  const characters = [lyraCharacter(), kaelCharacter()];

  it('each player carries their character and its token in the group grid', () => {
    const board = vharnBoard({ tokens: [linkedKael(), linkedLyra()] });
    const [bia, caio] = tableRosterOf({
      members: [BIA_ONLINE, CAIO_AT_TABLE],
      board,
      characters,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    }).players;
    expect(bia?.character?.name).toBe('Lyra');
    expect(bia?.token).toBe(board.tokens[1]);
    expect(caio?.character?.name).toBe('Kael');
    expect(caio?.token).toBe(board.tokens[0]);
  });

  it('a character with no token in the group grid still comes, with token null; a free token she controls is not hers', () => {
    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board: boardWith(),
      characters,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    }).players;
    expect(bia?.character?.armorClass).toBe(15);
    expect(bia?.token).toBeNull();
  });

  it('with the board still loading the character comes, without token', () => {
    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board: null,
      characters,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    }).players;
    expect(bia).toMatchObject({ character: lyraCharacter(), token: null });
  });

  it('with the characters still loading, a player comes without character nor token', () => {
    const [bia] = tableRosterOf({
      members: [BIA_ONLINE],
      board: vharnBoard({ tokens: [linkedLyra()] }),
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    }).players;
    expect(bia).toMatchObject({ character: null, token: null });
  });

  it('a character nobody plays (its player left) makes no card and breaks nothing', () => {
    const orphan = lyraCharacter({ userId: null });
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, CAIO_AT_TABLE],
      board: vharnBoard({ tokens: [linkedLyra()] }),
      characters: [orphan, kaelCharacter()],
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
    expect(roster.players.map(({ character }) => character?.name)).toEqual(['Kael']);
  });
});

describe('tableRosterOf, spectators', () => {
  it('Duda online goes to the spectators, without a card, and to no other section', () => {
    const members = [ANA_AT_TABLE, BIA_ONLINE, duda()];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      characters: null,
      viewerId: duda().userId,
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.spectators).toEqual([{ member: duda(), isViewer: true, assignable: [] }]);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia']);
    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana']);
  });

  it('a spectator offline is in no section', () => {
    const members = [ANA_AT_TABLE, BIA_ONLINE, duda({ online: false })];

    const roster = tableRosterOf({
      members,
      board: boardWith(),
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.spectators).toEqual([]);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Bia']);
  });

  it('Bia moved to the spectators and online goes to the spectators, her card left out', () => {
    const biaSpectator = { ...BIA_ONLINE, role: 'spectator' as const };
    const board = boardWith();

    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, biaSpectator, CAIO_AT_TABLE],
      board,
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.spectators).toEqual([
      { member: biaSpectator, isViewer: false, assignable: ['master', 'player'] },
    ]);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Caio']);
  });

  it('a table without spectators has the section empty', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, BIA_ONLINE],
      board: null,
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.spectators).toEqual([]);
  });
});

describe('tableRosterOf, owner and juggernaut', () => {
  const biaMaster = { ...BIA_ONLINE, role: 'master' as const };

  function rosterOf(members: Parameters<typeof tableRosterOf>[0]['members']) {
    return tableRosterOf({
      members,
      board: boardWith(),
      characters: null,
      viewerId: BIA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });
  }

  it('Ana the owner comes first among the masters, marked owner, and Bia the co-master after', () => {
    const roster = rosterOf([biaMaster, CAIO_AT_TABLE, ANA_AT_TABLE]);

    expect(roster.masters).toEqual([
      { member: ANA_AT_TABLE, isViewer: false, owner: true, assignable: [] },
      { member: biaMaster, isViewer: true, owner: false, assignable: [] },
    ]);
  });

  it('Root the juggernaut online goes to the juggernauts and not to the masters', () => {
    const roster = rosterOf([ANA_AT_TABLE, rootJuggernaut(), CAIO_AT_TABLE]);

    expect(roster.juggernauts).toEqual([
      { member: rootJuggernaut(), isViewer: false, assignable: [] },
    ]);
    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana']);
  });

  it('each row carries the roles the viewer may give it: Ana the owner, over a co-master and a player', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, biaMaster, CAIO_AT_TABLE],
      board: boardWith(),
      characters: null,
      viewerId: ANA_AT_TABLE.userId,
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.masters.map(({ assignable }) => assignable)).toEqual([
      [],
      ['player', 'spectator'],
    ]);
    expect(roster.players.map(({ assignable }) => assignable)).toEqual([['master', 'spectator']]);
  });

  it('a viewer not in the roster yet gives no role to anyone', () => {
    const roster = tableRosterOf({
      members: [ANA_AT_TABLE, CAIO_AT_TABLE],
      board: null,
      characters: null,
      viewerId: '',
      ownerId: ANA_AT_TABLE.userId,
    });

    expect(roster.players.map(({ assignable }) => assignable)).toEqual([[]]);
  });

  it('Root the juggernaut offline is in no section', () => {
    const roster = rosterOf([ANA_AT_TABLE, rootJuggernaut({ online: false }), CAIO_AT_TABLE]);

    expect(roster.juggernauts).toEqual([]);
    expect(roster.masters.map(({ member }) => member.name)).toEqual(['Ana']);
    expect(roster.players.map(({ member }) => member.name)).toEqual(['Caio']);
  });
});
