import { MemberNotFoundError } from '../campaigns/campaigns.error';
import { isSeenByTable } from '../characters/character.bo';
import { FolderNotFoundError } from '../library/library.error';
import { TokenNotFoundError } from '../tokens/tokens.error';
import type { CharacterPlacePo, TokenPlacePo } from './sheets.dao';
import { SheetHasNoTokenError } from './sheets.error';

/** What holds a sheet's bars: a token on its grid, or a character. */
export type SheetBarsHolder = Readonly<{ tokenId: string }> | Readonly<{ characterId: string }>;

/** A character as its main sheet reads it: which one and its main sheet now. */
export type CharacterMainRef = Readonly<{ characterId: string; mainSheetId: string | null }>;

/** One write of a character's main sheet (`null` = it has none). */
export type MainSheetWrite = Readonly<{ characterId: string; mainSheetId: string | null }>;

/** The rules of a sheet as an item of the library: its folder must be the table's, a token of the
 *  cast holds none, a player hands it to their character, only a held sheet has bars, and a
 *  character's first sheet becomes its main one.
 *
 *  Example: `new SheetItemBo(campaignId).requireFolder(folderIds, folderId)` */
export class SheetItemBo {
  constructor(private readonly campaignId: string) {}

  /** `null` is the root; any other id must be one of the table's folders. */
  requireFolder(folderIds: readonly string[], folderId: string | null): void {
    if (folderId === null || folderIds.includes(folderId)) return;
    throw new FolderNotFoundError(this.campaignId, folderId);
  }

  /** A token of a grid of the table; one of the cast (an anchor, until the cast goes) or of
   *  another table is TOKEN_NOT_FOUND.
   *
   *  Example: `rules.requireGridToken(lyraId, await sheets.placeOf(campaignId, lyraId))` */
  requireGridToken(tokenId: string, place: TokenPlacePo | undefined): TokenPlacePo {
    if (place && place.kind === 'grid') return place;
    throw new TokenNotFoundError(this.campaignId, tokenId);
  }

  /** The character of a member the table sees play (a player, or a master who kept theirs); a
   *  stored one (a spectator's), none (a master's) or a stranger's is MEMBER_NOT_FOUND.
   *
   *  Example: `rules.requirePlayerCharacter(biaId, await sheets.characterPlaceOfUser(campaignId, biaId))` */
  requirePlayerCharacter(
    memberId: string,
    character: CharacterPlacePo | undefined,
  ): CharacterPlacePo {
    if (character && isSeenByTable(character.holderRole)) return character;
    throw new MemberNotFoundError(this.campaignId, memberId);
  }

  /** What a sheet changes the bars of; a sheet nobody holds has none.
   *
   *  Example: `rules.requireHolder(sheet) // { characterId: lyraId }` */
  requireHolder(
    sheet: Readonly<{ id: string; tokenId: string | null; characterId: string | null }>,
  ): SheetBarsHolder {
    if (sheet.tokenId) return { tokenId: sheet.tokenId };
    if (sheet.characterId) return { characterId: sheet.characterId };
    throw new SheetHasNoTokenError(sheet.id);
  }

  /** The main sheets a move of `sheetId` from one character to another writes: the one that loses
   *  its main sheet has none, the one that gets a sheet with no main yet makes it the main. The
   *  same character on both ends writes nothing.
   *
   *  Example: `rules.mainSheetWritesOf(sheetId, null, { characterId: kaelId, mainSheetId: null }) // [{ characterId: kaelId, mainSheetId: sheetId }]` */
  mainSheetWritesOf(
    sheetId: string,
    from: CharacterMainRef | null,
    to: CharacterMainRef | null,
  ): MainSheetWrite[] {
    if (from?.characterId === to?.characterId) return [];
    const lost = from?.mainSheetId === sheetId ? [{ ...from, mainSheetId: null }] : [];
    const gained = to && to.mainSheetId === null ? [{ ...to, mainSheetId: sheetId }] : [];
    return [...lost, ...gained];
  }
}
