import type { BoardStateDto, SessionMemberDto, TokenDto } from '@lorkarium/contracts';
import { characterNameOf } from './table-roster';

const UNNAMED_CHARACTER = 'Sem nome';

/** A player whose card a token can be linked to; `characterName` once the card has a character
 *  (an anchor), whose bars and conditions the token would adopt. */
export type CardLinkTarget = Readonly<{
  memberId: string;
  memberName: string;
  characterName: string | null;
}>;

/** The players of the table, in the server's order, each with the character of their card (from
 *  the cast: the nickname written on it, else the anchor's name). The master's "Ligar à ficha
 *  de…".
 *
 *  Example: `cardLinkTargetsOf(members, cast) // [{ memberId, memberName: 'Bia', characterName: 'Lyra' }]` */
export function cardLinkTargetsOf(
  members: readonly SessionMemberDto[],
  cast: Pick<BoardStateDto, 'memberCards' | 'tokens'> | null,
): CardLinkTarget[] {
  return members
    .filter(({ role }) => role === 'player')
    .map(({ userId, name }) => ({
      memberId: userId,
      memberName: name,
      characterName: characterOf(cast, userId),
    }));
}

/** The name of the player whose character `token` is linked to, or `null` for a loose token (or
 *  a card not known yet).
 *
 *  Example: `cardOwnerOf(linkedLyra, board.memberCards, members) // 'Bia'` */
export function cardOwnerOf(
  token: Pick<TokenDto, 'anchorTokenId'>,
  cards: BoardStateDto['memberCards'],
  members: readonly SessionMemberDto[],
): string | null {
  if (token.anchorTokenId === null) return null;
  const card = cards.find(({ anchorTokenId }) => anchorTokenId === token.anchorTokenId);
  return members.find(({ userId }) => userId === card?.userId)?.name ?? null;
}

function characterOf(
  cast: Pick<BoardStateDto, 'memberCards' | 'tokens'> | null,
  userId: string,
): string | null {
  const card = cast?.memberCards.find((each) => each.userId === userId);
  if (!cast || !card?.anchorTokenId) return null;
  const anchor = cast.tokens.find(({ id }) => id === card.anchorTokenId) ?? null;
  // An anchor the cast does not carry yet still makes the link adopt it: it needs a name.
  return characterNameOf(card, anchor) ?? UNNAMED_CHARACTER;
}
