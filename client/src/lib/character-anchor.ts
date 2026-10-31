import type { MemberCardDto, TokenDto } from '@lorkarium/contracts';

/** The anchor of a player's character in the cast, where their sheets live: the card's, else (a
 *  card read before it named one) the main token's own anchor, or the token itself when it is the
 *  anchor; `null` = no character yet.
 *
 *  Example: `characterAnchorOf(player.card, player.token) // LYRA_ANCHOR_ID` */
export function characterAnchorOf(
  card: Pick<MemberCardDto, 'anchorTokenId'>,
  token: Pick<TokenDto, 'id' | 'anchorTokenId'> | null,
): string | null {
  if (card.anchorTokenId !== undefined) return card.anchorTokenId;
  return token ? (token.anchorTokenId ?? token.id) : null;
}
