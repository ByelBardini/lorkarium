import type {
  SheetDto,
  SheetReceiptDto,
  SheetSummaryDto,
  SheetValuesDto,
  UpdateSheetRequestDto,
} from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { SceneAccessBo } from '../scenes/scene-access.bo';
import type { TokenControl } from '../tokens/token-access.bo';
import { SheetAccessBo, type SheetHolderReach } from './sheet-access.bo';
import type { SheetHolderPlacePo, SheetPlacesPo, TokenPlacePo } from './sheets.dao';
import type { SheetPo } from './sheets.po';

/** The access of one reader to a sheet, from the row and the place of its holder (`null` = the
 *  sheet has no holder).
 *
 *  Example: `toSheetAccessBo(access, sheet, { character: lyraPlace }).canEdit()` */
export function toSheetAccessBo(
  access: CampaignAccessBo,
  sheet: SheetPo,
  place: SheetHolderPlacePo | null,
): SheetAccessBo {
  const holder = place ? toHolderReach(access, place) : null;
  return new SheetAccessBo(access, { sheetId: sheet.id, visibility: sheet.visibility, holder });
}

function toHolderReach(access: CampaignAccessBo, place: SheetHolderPlacePo): SheetHolderReach {
  if ('character' in place) return { character: place.character };
  return { token: toTokenControl(place.token), seen: isTokenSeen(access, place.token) };
}

function toTokenControl(place: TokenPlacePo): TokenControl {
  return { tokenId: place.tokenId, controllerIds: place.controllerIds };
}

function isTokenSeen(access: CampaignAccessBo, place: TokenPlacePo): boolean {
  const groupSceneId = place.isActive ? place.sceneId : null;
  const grid = { id: place.sceneId, visibility: place.visibility, kind: place.kind };
  return new SceneAccessBo(access, groupSceneId).canSee(grid);
}

/** The holder of `sheet` among places read in bulk (`null` = nobody, or not among them).
 *
 *  Example: `holderPlaceIn(sheet, await sheets.holdersOf(campaignId, [sheet]))` */
export function holderPlaceIn(sheet: SheetPo, places: SheetPlacesPo): SheetHolderPlacePo | null {
  const token = places.tokens.find(({ tokenId }) => tokenId === sheet.tokenId);
  if (token) return { token };
  const character = places.characters.find(({ characterId: id }) => id === sheet.characterId);
  return character ? { character } : null;
}

/** The library line of a sheet: who holds it, without the values. A character's sheet names its
 *  player (`memberId`) and no token.
 *
 *  Example: `toSheetSummaryDto(sheet, { character: lyraPlace }) // { …, tokenId: null, memberId: biaId }` */
export function toSheetSummaryDto(
  sheet: SheetPo,
  place: SheetHolderPlacePo | null,
): SheetSummaryDto {
  return {
    id: sheet.id,
    name: sheet.name,
    folderId: sheet.folderId,
    templateId: sheet.templateId,
    tokenId: sheet.tokenId,
    memberId: place && 'character' in place ? place.character.userId : null,
    visibility: sheet.visibility,
    version: sheet.version,
  };
}

/** The sheet as this reader may read it, with what they may do. */
export function toSheetDto(
  sheet: SheetPo,
  place: SheetHolderPlacePo | null,
  rules: SheetAccessBo,
): SheetDto {
  return {
    ...toSheetSummaryDto(sheet, place),
    values: sheet.values,
    canEdit: rules.canEdit(),
    canManage: rules.canManage(),
  };
}

/** The lines of the sheets this reader may read, each with the place of its holder.
 *
 *  Example: `readableSheetSummaries(caioAccess, sheets, places) // only the table ones he sees` */
export function readableSheetSummaries(
  access: CampaignAccessBo,
  sheets: readonly SheetPo[],
  places: SheetPlacesPo,
): SheetSummaryDto[] {
  return sheets.flatMap((sheet) => readableLineOf(access, sheet, holderPlaceIn(sheet, places)));
}

/** The lines of the sheets of one holder this reader may read.
 *
 *  Example: `readableHolderSheets(caioAccess, lyraSheets, { character: lyraPlace })` */
export function readableHolderSheets(
  access: CampaignAccessBo,
  sheets: readonly SheetPo[],
  place: SheetHolderPlacePo,
): SheetSummaryDto[] {
  return sheets.flatMap((sheet) => readableLineOf(access, sheet, place));
}

function readableLineOf(
  access: CampaignAccessBo,
  sheet: SheetPo,
  place: SheetHolderPlacePo | null,
): SheetSummaryDto[] {
  if (!toSheetAccessBo(access, sheet, place).canRead()) return [];
  return [toSheetSummaryDto(sheet, place)];
}

/** The columns a manage write changes: only the keys the master sent, and the holder's token or
 *  character when `holder` was sent (`null` takes the sheet from its holder).
 *
 *  Example: `toSheetChangesPo({ actionId, holder: null }, null) // { tokenId: null, characterId: null }` */
export function toSheetChangesPo(
  input: UpdateSheetRequestDto,
  holder: SheetHolderPlacePo | null,
): Partial<
  Pick<SheetPo, 'name' | 'folderId' | 'visibility' | 'templateId' | 'tokenId' | 'characterId'>
> {
  const { name, folderId, visibility, templateId } = input;
  return {
    ...(name === undefined ? {} : { name }),
    ...(folderId === undefined ? {} : { folderId }),
    ...(visibility === undefined ? {} : { visibility }),
    ...(templateId === undefined ? {} : { templateId }),
    ...(input.holder === undefined ? {} : toHolderColumns(holder)),
  };
}

/** The holder columns of a sheet: a token's id or a character's, never both.
 *
 *  Example: `toHolderColumns({ character: lyraPlace }) // { tokenId: null, characterId: lyraId }` */
export function toHolderColumns(
  holder: SheetHolderPlacePo | null,
): Pick<SheetPo, 'tokenId' | 'characterId'> {
  if (holder && 'token' in holder) return { tokenId: holder.token.tokenId, characterId: null };
  return { tokenId: null, characterId: holder?.character.characterId ?? null };
}

export function toSheetReceiptDto(
  actionId: string,
  sheet: Pick<SheetPo, 'id' | 'version'>,
  operation: SheetReceiptDto['operation'],
): SheetReceiptDto {
  return { actionId, sheetId: sheet.id, version: sheet.version, operation };
}

/** A patch split as the DAO writes it: the keys set and the keys `null` removes.
 *
 *  Example: `toValuesChange({ forca: 16, notas: null }) // { set: { forca: 16 }, removed: ['notas'] }` */
export function toValuesChange(
  changes: SheetValuesDto,
): Readonly<{ set: SheetValuesDto; removed: string[] }> {
  const entries = Object.entries(changes);
  const removed = entries.filter(([, value]) => value === null).map(([key]) => key);
  const set = Object.fromEntries(entries.filter(([, value]) => value !== null));
  return { set, removed };
}
