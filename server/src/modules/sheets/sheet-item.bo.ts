import { initialsOf } from '@lorkarium/game-core';
import { FolderNotFoundError } from '../library/library.error';
import type { TokenPo } from '../tokens/tokens.po';
import { SheetHasNoTokenError } from './sheets.error';

/** What a new anchor shows of the character before anyone styles it. */
export type AnchorIdentity = Readonly<{ name: string; initials: string; side: TokenPo['side'] }>;

/** The rules of a sheet as an item of the library: its folder must be the table's, a sheet given
 *  to a player without a character makes the character's anchor from their card, and only a held
 *  sheet has bars.
 *
 *  Example: `new SheetItemBo(campaignId).anchorIdentityOf('Lyra', 'Bia') // { name: 'Lyra', initials: 'LY', side: 'ally' }` */
export class SheetItemBo {
  constructor(private readonly campaignId: string) {}

  /** `null` is the root; any other id must be one of the table's folders. */
  requireFolder(folderIds: readonly string[], folderId: string | null): void {
    if (folderId === null || folderIds.includes(folderId)) return;
    throw new FolderNotFoundError(this.campaignId, folderId);
  }

  /** The card's character name, else the member's nickname; the initials of that name (its
   *  first letters when it is all connectives); on the players' side.
   *
   *  Example: `rules.anchorIdentityOf(null, 'Bia') // { name: 'Bia', initials: 'BI', side: 'ally' }` */
  anchorIdentityOf(characterName: string | null, memberName: string): AnchorIdentity {
    // Both fit a token name: a character name has at most 40 characters, a nickname 32.
    const name = characterName?.trim() || memberName.trim();
    const initials = initialsOf(name) || name.slice(0, 2).toLocaleUpperCase('pt-BR');
    return { name, initials, side: 'ally' };
  }

  /** The token whose bars a sheet changes; a sheet nobody holds has none. */
  requireToken(sheet: Readonly<{ id: string; tokenId: string | null }>): string {
    if (sheet.tokenId) return sheet.tokenId;
    throw new SheetHasNoTokenError(sheet.id);
  }
}
