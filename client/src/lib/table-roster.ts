import type {
  BoardStateDto,
  MemberCardDto,
  SessionMemberDto,
  TokenDto,
} from '@lorkarium/contracts';
import { assignableRolesOf, type TableRole, type TableSeat } from '@lorkarium/game-core';
import { mainTokenIdOfMember } from './main-token';

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

/** A player on the party board. `card` and `token` are `null` while the board is loading (they
 *  come with the `board:sync`); a player who never had a card written gets an empty one. */
export type RosterPlayer = RosterRow &
  Readonly<{
    card: MemberCardDto | null;
    token: TokenDto | null;
    characterName: string | null;
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
  /** The table's cast: the cards in the table's version and the characters' anchors (`null`
   *  while it loads: the grid's copy of the cards stands in). */
  cast: BoardStateDto | null;
  viewerId: string;
  /** The campaign's creator (`campaign.ownerId`): first among the masters. */
  ownerId: string;
}>;

/** Who goes in which section of the "Na mesa" tab: the juggernauts online apart, the masters
 *  (the owner first), then the players online first (in the server's order) and the offline ones
 *  after, each with card and main token — the group grid's, else the anchor of their character
 *  (who is in no grid of the group yet) —, and the spectators online (the table keeps no trace
 *  of one who left, nor of a juggernaut).
 *
 *  Example: `tableRosterOf({ members, board, cast, viewerId: user.id, ownerId }).players[0].characterName` */
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

/** The name the card shows: the nickname written on it, else the main token's name.
 *
 *  Example: `characterNameOf({ characterName: null, … }, lyra) // 'Lyra'` */
export function characterNameOf(
  card: Pick<MemberCardDto, 'characterName'> | null,
  token: Pick<TokenDto, 'name'> | null,
): string | null {
  return card?.characterName ?? token?.name ?? null;
}

function playerOf(row: RosterRow, { board, cast }: TableRosterInput): RosterPlayer {
  const { member } = row;
  if (!board) return { ...row, card: null, token: null, characterName: null };
  const memberCards = (cast ?? board).memberCards;
  const card =
    memberCards.find(({ userId }) => userId === member.userId) ?? emptyCard(member.userId);
  const tokenId = mainTokenIdOfMember({ ...board, memberCards }, member.userId);
  const token = board.tokens.find(({ id }) => id === tokenId) ?? anchorOf(cast, card);
  return { ...row, card, token, characterName: characterNameOf(card, token) };
}

function anchorOf(cast: BoardStateDto | null, card: MemberCardDto): TokenDto | null {
  if (!cast || !card.anchorTokenId) return null;
  return cast.tokens.find(({ id }) => id === card.anchorTokenId) ?? null;
}

function emptyCard(userId: string): MemberCardDto {
  return {
    userId,
    characterName: null,
    armorClass: null,
    difficultyClass: null,
    noteOne: null,
    noteTwo: null,
    anchorTokenId: null,
  };
}
