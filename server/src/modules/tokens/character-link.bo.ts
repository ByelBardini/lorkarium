import type { CampaignRole } from '../campaigns/campaign-access.bo';
import { MemberNotFoundError } from '../member-cards/member-cards.error';
import { CharacterAlreadyPlacedError, TokenNotLinkedError } from './tokens.error';

/** What the link rules read of a token: which one and the anchor it follows, if any. */
export type LinkedTokenRef = Readonly<{ id: string; anchorTokenId: string | null }>;

/** Who and what may become a character: only a player of the table has a character card; a
 *  token is the character of one card at most, and a grid holds one token per character.
 *
 *  Example: `new CharacterLinkBo(campaignId).requirePlayer(biaId, 'player')` */
export class CharacterLinkBo {
  constructor(private readonly campaignId: string) {}

  /** The card linked to must be of a player of the table (a master has no character).
   *
   *  Example: `rules.requirePlayer(memberId, membership?.role ?? null)` */
  requirePlayer(memberId: string, role: CampaignRole | null): void {
    if (role === 'player') return;
    throw new MemberNotFoundError(this.campaignId, memberId);
  }

  /** A token that already is a character must be unlinked before it becomes another one.
   *
   *  Example: `rules.requireFree({ id: lyraId, anchorTokenId: null })` */
  requireFree(token: LinkedTokenRef): void {
    if (token.anchorTokenId === null) return;
    throw new CharacterAlreadyPlacedError(token.id, token.id, null);
  }

  /** The grid must not already hold a token of the character (`placed`).
   *
   *  Example: `rules.requireNotPlaced(kaelId, biaId, await tokens.findLinkedInScene(sceneId, anchorId))` */
  requireNotPlaced(tokenId: string, memberId: string, placed: { id: string } | undefined): void {
    if (!placed) return;
    throw new CharacterAlreadyPlacedError(tokenId, placed.id, memberId);
  }

  /** The anchor of a token being unlinked; an unlinked token is refused.
   *
   *  Example: `const anchorId = rules.anchorOf(lyra.token)` */
  anchorOf(token: LinkedTokenRef): string {
    if (token.anchorTokenId !== null) return token.anchorTokenId;
    throw new TokenNotLinkedError(token.id);
  }
}
