import type { CampaignRole } from '../campaigns/campaign-access.bo';
import { MemberNotFoundError } from '../campaigns/campaigns.error';
import { CharacterAlreadyPlacedError, TokenNotLinkedError } from './tokens.error';

/** What the link rules read of a token: which one and the character it wears, if any. */
export type LinkedTokenRef = Readonly<{ id: string; characterId: string | null }>;

/** Who and what may become a character: a token wears one character at most, and a grid holds
 *  one token per character.
 *
 *  Example: `new CharacterLinkBo(campaignId).requireFree(kael.token)` */
export class CharacterLinkBo {
  constructor(private readonly campaignId: string) {}

  /** Only a player of the table has a character to hand a sheet to (a master has none). Still
   *  read by the sheet holder until the sheets go by the character (phase 9 of the plan).
   *
   *  Example: `rules.requirePlayer(memberId, membership?.role ?? null)` */
  requirePlayer(memberId: string, role: CampaignRole | null): void {
    if (role === 'player') return;
    throw new MemberNotFoundError(this.campaignId, memberId);
  }

  /** A token that already wears a character must be unlinked before it wears another one.
   *
   *  Example: `rules.requireFree({ id: kaelId, characterId: null })` */
  requireFree(token: LinkedTokenRef): void {
    if (token.characterId === null) return;
    throw new CharacterAlreadyPlacedError(token.id, token.id, token.characterId);
  }

  /** The grid must not already hold a token of the character (`placed`).
   *
   *  Example: `rules.requireNotPlaced(kaelId, lyraId, await links.placedOn(sceneId, lyraId))` */
  requireNotPlaced(
    tokenId: string,
    characterId: string,
    placed: Readonly<{ id: string }> | undefined,
  ): void {
    if (!placed) return;
    throw new CharacterAlreadyPlacedError(tokenId, placed.id, characterId);
  }

  /** The character a token being unlinked wears; an unlinked token is TOKEN_NOT_LINKED.
   *
   *  Example: `const characterId = rules.linkedOf(lyra.token)` */
  linkedOf(token: LinkedTokenRef): string {
    if (token.characterId !== null) return token.characterId;
    throw new TokenNotLinkedError(token.id);
  }
}
