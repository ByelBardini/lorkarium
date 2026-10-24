import type {
  BoardStateDto,
  MemberCardDto,
  SessionMemberDto,
  TokenDto,
} from '@lorkarium/contracts';
import { mainTokenIdOfMember } from './main-token';

/** A master on the party board: the compact row, no card. */
export type RosterMaster = Readonly<{ member: SessionMemberDto; isViewer: boolean }>;

/** A player on the party board. `card` and `token` are `null` while the board is loading (they
 *  come with the `board:sync`); a player who never had a card written gets an empty one. */
export type RosterPlayer = Readonly<{
  member: SessionMemberDto;
  isViewer: boolean;
  card: MemberCardDto | null;
  token: TokenDto | null;
  characterName: string | null;
}>;

export type TableRoster = Readonly<{ masters: RosterMaster[]; players: RosterPlayer[] }>;

export type TableRosterInput = Readonly<{
  members: readonly SessionMemberDto[];
  /** The group grid's board (`null` while it loads). */
  board: BoardStateDto | null;
  /** The table's cast: the cards in the table's version and the characters' anchors (`null`
   *  while it loads: the grid's copy of the cards stands in). */
  cast: BoardStateDto | null;
  viewerId: string;
}>;

/** Who goes in which section of the "Na mesa" tab: the masters apart, then the players online
 *  first (in the server's order) and the offline ones after, each with card and main token —
 *  the group grid's, else the anchor of their character (who is in no grid of the group yet).
 *
 *  Example: `tableRosterOf({ members, board, cast, viewerId: user.id }).players[0].characterName` */
export function tableRosterOf(input: TableRosterInput): TableRoster {
  const { members, viewerId } = input;
  const masters = members
    .filter(({ role }) => role === 'master')
    .map((member) => ({ member, isViewer: member.userId === viewerId }));
  const players = members.filter(({ role }) => role !== 'master');
  const ordered = [
    ...players.filter(({ online }) => online),
    ...players.filter(({ online }) => !online),
  ];
  return { masters, players: ordered.map((member) => playerOf(member, input)) };
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

function playerOf(
  member: SessionMemberDto,
  { board, cast, viewerId }: TableRosterInput,
): RosterPlayer {
  const isViewer = member.userId === viewerId;
  if (!board) return { member, isViewer, card: null, token: null, characterName: null };
  const memberCards = (cast ?? board).memberCards;
  const card =
    memberCards.find(({ userId }) => userId === member.userId) ?? emptyCard(member.userId);
  const tokenId = mainTokenIdOfMember({ ...board, memberCards }, member.userId);
  const token = board.tokens.find(({ id }) => id === tokenId) ?? anchorOf(cast, card);
  return { member, isViewer, card, token, characterName: characterNameOf(card, token) };
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
