import type { SheetHolderDto } from '@lorkarium/contracts';
import { CharacterNotFoundError } from '../characters/characters.error';
import { SheetItemBo } from './sheet-item.bo';
import type { CharacterPlacePo, SheetHolderPlacePo, SheetsDao } from './sheets.dao';
import type { SheetPo } from './sheets.po';

/** What resolving a holder reads, on the sheet's transaction (or snapshot). */
export type SheetHolderDaos = Readonly<{
  sheets: Pick<
    SheetsDao,
    'placeOf' | 'characterPlacesOf' | 'characterPlaceOfUser' | 'listOfToken' | 'listOfCharacter'
  >;
}>;

/** Who holds a sheet, resolved inside the sheet's transaction: a token of a grid keeps it, a
 *  token linked to a character hands it to the character, a player hands it to their character
 *  (every player has one). Nothing is created.
 *
 *  Example: `const place = await holders.resolve(daos, campaignId, { memberId: biaId })` */
export class SheetHolderService {
  /** `null` = nobody. A token of another table is TOKEN_NOT_FOUND; a member
   *  without a character the table sees is MEMBER_NOT_FOUND. */
  async resolve(
    daos: SheetHolderDaos,
    campaignId: string,
    holder: SheetHolderDto | null,
  ): Promise<SheetHolderPlacePo | null> {
    if (!holder) return null;
    const rules = new SheetItemBo(campaignId);
    if ('memberId' in holder) {
      const found = await daos.sheets.characterPlaceOfUser(campaignId, holder.memberId);
      return { character: rules.requirePlayerCharacter(holder.memberId, found) };
    }
    const found = await daos.sheets.placeOf(campaignId, holder.tokenId);
    const token = rules.requireGridToken(holder.tokenId, found);
    if (!token.characterId) return { token };
    return { character: await characterPlaceIn(daos, campaignId, token.characterId) };
  }

  /** Where a saved sheet hangs now (`null` = nobody's).
   *
   *  Example: `const place = await holders.placeOfSheet(daos, sheet)` */
  async placeOfSheet(daos: SheetHolderDaos, sheet: SheetPo): Promise<SheetHolderPlacePo | null> {
    if (sheet.characterId)
      return { character: await characterPlaceIn(daos, sheet.campaignId, sheet.characterId) };
    if (!sheet.tokenId) return null;
    const token = await daos.sheets.placeOf(sheet.campaignId, sheet.tokenId);
    if (!token) throw new Error(`Sheet ${sheet.id} hangs on token ${sheet.tokenId}, not found`);
    return { token };
  }

  /** The sheets the holder keeps, in creation order.
   *
   *  Example: `await holders.sheetsOf(daos, campaignId, { character: lyraPlace })` */
  async sheetsOf(
    daos: SheetHolderDaos,
    campaignId: string,
    place: SheetHolderPlacePo,
  ): Promise<SheetPo[]> {
    if ('character' in place)
      return daos.sheets.listOfCharacter(campaignId, place.character.characterId);
    return daos.sheets.listOfToken(campaignId, place.token.tokenId);
  }
}

/** The character of the table, as a holder; another table's (or one gone) is CHARACTER_NOT_FOUND.
 *
 *  Example: `const lyra = await characterPlaceIn(daos, vharnId, lyraId)` */
export async function characterPlaceIn(
  daos: SheetHolderDaos,
  campaignId: string,
  characterId: string,
): Promise<CharacterPlacePo> {
  const [found] = await daos.sheets.characterPlacesOf(campaignId, [characterId]);
  if (!found) throw new CharacterNotFoundError(campaignId, characterId);
  return found;
}
