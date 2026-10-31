import type {
  SheetDto,
  SheetReceiptDto,
  SheetSummaryDto,
  SheetValuesDto,
  UpdateSheetRequestDto,
} from '@lorkarium/contracts';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { SceneAccessBo } from '../scenes/scene-access.bo';
import { SheetAccessBo } from './sheet-access.bo';
import type { TokenPlacePo } from './sheets.dao';
import type { SheetPo } from './sheets.po';

/** The access of one reader to a sheet, from the row and the place of its token (`null` = the
 *  sheet has no holder).
 *
 *  Example: `toSheetAccessBo(access, sheet, place).canEdit()` */
export function toSheetAccessBo(
  access: CampaignAccessBo,
  sheet: SheetPo,
  place: TokenPlacePo | null,
): SheetAccessBo {
  const reach = { sheetId: sheet.id, visibility: sheet.visibility };
  if (!place) return new SheetAccessBo(access, { ...reach, holder: null, holderSeen: false });
  const groupSceneId = place.isActive ? place.sceneId : null;
  const grid = { id: place.sceneId, visibility: place.visibility, kind: place.kind };
  const holderSeen = new SceneAccessBo(access, groupSceneId).canSee(grid);
  const holder = { tokenId: place.tokenId, controllerIds: place.controllerIds };
  return new SheetAccessBo(access, { ...reach, holder, holderSeen });
}

/** The library line of a sheet: who holds it, without the values.
 *
 *  Example: `toSheetSummaryDto(sheet, place) // { …, tokenId: lyraAnchorId, memberId: biaId }` */
export function toSheetSummaryDto(sheet: SheetPo, place: TokenPlacePo | null): SheetSummaryDto {
  return {
    id: sheet.id,
    name: sheet.name,
    folderId: sheet.folderId,
    templateId: sheet.templateId,
    tokenId: sheet.tokenId,
    memberId: place?.memberId ?? null,
    visibility: sheet.visibility,
    version: sheet.version,
  };
}

/** The sheet as this reader may read it, with what they may do. */
export function toSheetDto(
  sheet: SheetPo,
  place: TokenPlacePo | null,
  rules: SheetAccessBo,
): SheetDto {
  return {
    ...toSheetSummaryDto(sheet, place),
    values: sheet.values,
    canEdit: rules.canEdit(),
    canManage: rules.canManage(),
  };
}

/** The lines of the sheets this reader may read, each with the place of its token.
 *
 *  Example: `readableSheetSummaries(caioAccess, sheets, places) // only the table ones he sees` */
export function readableSheetSummaries(
  access: CampaignAccessBo,
  sheets: readonly SheetPo[],
  places: readonly TokenPlacePo[],
): SheetSummaryDto[] {
  return sheets.flatMap((sheet) => {
    const place = places.find(({ tokenId }) => tokenId === sheet.tokenId) ?? null;
    if (!toSheetAccessBo(access, sheet, place).canRead()) return [];
    return [toSheetSummaryDto(sheet, place)];
  });
}

/** The columns a manage write changes: only the keys the master sent, and the holder's token
 *  when `holder` was sent (`null` takes the sheet from its holder).
 *
 *  Example: `toSheetChangesPo({ actionId, holder: null }, null) // { tokenId: null }` */
export function toSheetChangesPo(
  input: UpdateSheetRequestDto,
  holder: TokenPlacePo | null,
): Partial<Pick<SheetPo, 'name' | 'folderId' | 'visibility' | 'templateId' | 'tokenId'>> {
  const { name, folderId, visibility, templateId } = input;
  return {
    ...(name === undefined ? {} : { name }),
    ...(folderId === undefined ? {} : { folderId }),
    ...(visibility === undefined ? {} : { visibility }),
    ...(templateId === undefined ? {} : { templateId }),
    ...(input.holder === undefined ? {} : { tokenId: holder?.tokenId ?? null }),
  };
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
