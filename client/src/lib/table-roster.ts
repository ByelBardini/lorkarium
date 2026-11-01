import type { BoardStateDto, CharacterDto, SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { assignableRolesOf, type TableRole, type TableSeat } from '@lorkarium/game-core';
import { characterTokenOf } from './main-token';

/** Someone on the party board. `assignable`: the roles the viewer may give them, by the
 *  game-core `assignableRolesOf` (empty: no role control on their row). A spectator (only while
 *  online) and a juggernaut (an admin with owner powers, only while online) are only this. */
export type RosterRow = Readonly<{
  member: SessionMemberDto;
  isViewer: boolean;
  assignable: readonly TableRole[];
}>;

export type RosterSpectator = RosterRow;

/** A master on the party board: the compact row; `owner` is the campaign's creator. */
export type RosterMaster = RosterRow & Readonly<{ owner: boolean }>;

/** A player on the party board. `character` is `null` while the characters load (or, briefly,
 *  before the server made theirs); `token` is their character's token in the group grid, `null`
 *  while the board loads or with none of it there. */
export type RosterPlayer = RosterRow &
  Readonly<{
    character: CharacterDto | null;
    token: TokenDto | null;
  }>;

export type TableRoster = Readonly<{
  /** Admins in juggernaut mode online: their own section, above the masters. */
  juggernauts: RosterRow[];
  masters: RosterMaster[];
  players: RosterPlayer[];
  spectators: RosterSpectator[];
}>;

export type TableRosterInput = Readonly<{
  members: readonly SessionMemberDto[];
  /** The group grid's board (`null` while it loads). */
  board: BoardStateDto | null;
  /** The table's characters (`null` until their first `character:sync`). */
  characters: readonly CharacterDto[] | null;
  viewerId: string;
  /** The campaign's creator (`campaign.ownerId`): first among the masters. */
  ownerId: string;
}>;

/** Who goes in which section of the "Na mesa" tab: the juggernauts online apart, the masters
 *  (the owner first), then the players online first (in the server's order) and the offline ones
 *  after, each with their character and its token in the group grid, and the spectators online (the table keeps no trace
 *  of one who left, nor of a juggernaut).
 *
 *  Example: `tableRosterOf({ members, board, characters, viewerId: user.id, ownerId }).players[0].character?.name` */
export function tableRosterOf(input: TableRosterInput): TableRoster {
  const { members } = input;
  const rowOf = rowsOf(input);
  const players = members.filter(({ role }) => role === 'player');
  const ordered = [
    ...players.filter(({ online }) => online),
    ...players.filter(({ online }) => !online),
  ];
  return {
    juggernauts: members.filter(({ juggernaut, online }) => juggernaut && online).map(rowOf),
    masters: mastersOf(input).map((member) => ({
      ...rowOf(member),
      owner: member.userId === input.ownerId,
    })),
    players: ordered.map((member) => playerOf(rowOf(member), input)),
    spectators: members.filter(({ role, online }) => role === 'spectator' && online).map(rowOf),
  };
}

/** Where `member` sits: their role, whether they created the campaign, whether they are a
 *  juggernaut.
 *
 *  Example: `seatOfMember(ana, ana.userId) // { role: 'master', owner: true, juggernaut: false }` */
export function seatOfMember(member: SessionMemberDto, ownerId: string): TableSeat {
  return { role: member.role, owner: member.userId === ownerId, juggernaut: member.juggernaut };
}

// Not in the roster yet (the board still loading): the viewer gives no role to anyone.
function rowsOf({ members, viewerId, ownerId }: TableRosterInput) {
  const viewer = members.find(({ userId }) => userId === viewerId);
  const viewerSeat: TableSeat = viewer
    ? seatOfMember(viewer, ownerId)
    : { role: 'spectator', owner: false, juggernaut: false };
  return (member: SessionMemberDto): RosterRow => ({
    member,
    isViewer: member.userId === viewerId,
    assignable: assignableRolesOf(viewerSeat, seatOfMember(member, ownerId)),
  });
}

function mastersOf({ members, ownerId }: TableRosterInput): SessionMemberDto[] {
  const masters = members.filter(({ role, juggernaut }) => role === 'master' && !juggernaut);
  return [
    ...masters.filter(({ userId }) => userId === ownerId),
    ...masters.filter(({ userId }) => userId !== ownerId),
  ];
}

// A character with no player (who left the table) has no card: only a member has one.
function playerOf(row: RosterRow, { board, characters }: TableRosterInput): RosterPlayer {
  const character = characters?.find(({ userId }) => userId === row.member.userId) ?? null;
  const token = board ? characterTokenOf(board.tokens, character) : null;
  return { ...row, character, token };
}
