import { z } from 'zod';
import { barChangeDto } from '../board/token.dto';
import { stateVersionDto } from '../http/realtime-ack.dto';
import { sheetTemplateCodeDto } from './sheet-template.dto';
import { sheetValuesDto } from './sheet-values.dto';

export const SHEET_NAME_MAX_LENGTH = 60;
const SHEET_CHANGE_KEYS = ['name', 'folderId', 'visibility', 'templateId', 'holder'] as const;

/** The name of a sheet in the library, trimmed, 1–60. */
export const sheetNameDto = z.string().trim().min(1).max(SHEET_NAME_MAX_LENGTH);

/** Who reads a sheet besides the masters and the token's controllers: only them
 *  (`controllers`, the default) or every member of the table (`table`, read-only for them). */
export const sheetVisibilityDto = z.enum(['controllers', 'table']);
export type SheetVisibilityDto = z.infer<typeof sheetVisibilityDto>;

/** Who holds a sheet: a token (a linked one gives it to its anchor) or a player of the table (it
 *  goes to the anchor of their character, created in the cast when they have none yet).
 *
 *  Example: `sheetHolderDto.parse({ memberId: biaId })` */
export const sheetHolderDto = z.union([
  z.strictObject({ tokenId: z.uuid() }),
  z.strictObject({ memberId: z.uuid() }),
]);
export type SheetHolderDto = z.infer<typeof sheetHolderDto>;

/** A sheet in the library, without its values: `tokenId` is the token that holds it (the anchor
 *  of a character), `memberId` the player whose character that anchor is; both `null` = no holder
 *  (only masters see it).
 *
 *  Example: `sheetSummaryDto.parse({ id, name: 'Lyra', folderId: null, templateId, tokenId: null, memberId: null, visibility: 'controllers', version: 0 })` */
export const sheetSummaryDto = z.strictObject({
  id: z.uuid(),
  name: sheetNameDto,
  folderId: z.uuid().nullable(),
  templateId: z.uuid(),
  tokenId: z.uuid().nullable(),
  memberId: z.uuid().nullable(),
  visibility: sheetVisibilityDto,
  version: stateVersionDto,
});
export type SheetSummaryDto = z.infer<typeof sheetSummaryDto>;

/** A sheet as one viewer may read it: the summary plus the values, `canEdit` ("may write values
 *  and bars") and `canManage` ("may rename, move, give, change visibility or template, or delete":
 *  masters).
 *
 *  Example: `sheetDto.parse(response.sheet).values.forca // 16` */
export const sheetDto = sheetSummaryDto.extend({
  values: sheetValuesDto,
  canEdit: z.boolean(),
  canManage: z.boolean(),
});
export type SheetDto = z.infer<typeof sheetDto>;

/** Answer of `GET …/sheets/:sheetId`. */
export const sheetResponseDto = z.strictObject({
  sheet: sheetDto,
  template: sheetTemplateCodeDto,
});
export type SheetResponseDto = z.infer<typeof sheetResponseDto>;

/** Answer of `GET …/tokens/:tokenId/sheets`: the sheets of the token (a linked token's are its
 *  anchor's) that the reader may read. */
export const tokenSheetsResponseDto = z.strictObject({ sheets: z.array(sheetSummaryDto) });
export type TokenSheetsResponseDto = z.infer<typeof tokenSheetsResponseDto>;

/** Body of `POST /campaigns/:campaignId/sheets` (master only): a sheet of `templateId` in the
 *  library; no `holder` = nobody's (only masters see it), no visibility = `controllers`.
 *
 *  Example: `createSheetRequestDto.parse({ actionId, templateId, name: 'Lyra', holder: { memberId: biaId } })` */
export const createSheetRequestDto = z.strictObject({
  actionId: z.uuid(),
  templateId: z.uuid(),
  name: sheetNameDto,
  folderId: z.uuid().nullable().optional(),
  visibility: sheetVisibilityDto.optional(),
  holder: sheetHolderDto.optional(),
});
export type CreateSheetRequestDto = z.infer<typeof createSheetRequestDto>;

/** Body of `PATCH /campaigns/:campaignId/sheets/:sheetId` (master only); at least one change.
 *  `folderId: null` is the root, `holder: null` takes the sheet from its holder.
 *
 *  Example: `updateSheetRequestDto.parse({ actionId, holder: { memberId: biaId } })` */
export const updateSheetRequestDto = z
  .strictObject({
    actionId: z.uuid(),
    name: sheetNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    visibility: sheetVisibilityDto.optional(),
    templateId: z.uuid().optional(),
    holder: sheetHolderDto.nullable().optional(),
  })
  .superRefine((changes, context) => {
    if (SHEET_CHANGE_KEYS.some((key) => changes[key] !== undefined)) return;
    context.addIssue({
      code: 'custom',
      message: `changes is empty; expected at least one of ${SHEET_CHANGE_KEYS.join(', ')}`,
    });
  });
export type UpdateSheetRequestDto = z.infer<typeof updateSheetRequestDto>;

/** Body of `DELETE /campaigns/:campaignId/sheets/:sheetId` (master only). */
export const deleteSheetRequestDto = z.strictObject({ actionId: z.uuid() });
export type DeleteSheetRequestDto = z.infer<typeof deleteSheetRequestDto>;

export const sheetParamsDto = z.strictObject({ campaignId: z.uuid(), sheetId: z.uuid() });
export const tokenSheetParamsDto = z.strictObject({ campaignId: z.uuid(), tokenId: z.uuid() });

/** What a write did, without the values: a repeated `actionId` gets the same receipt back. */
export const sheetReceiptDto = z.strictObject({
  actionId: z.uuid(),
  sheetId: z.uuid(),
  version: stateVersionDto,
  operation: z.enum(['create', 'update', 'values', 'delete']),
});
export type SheetReceiptDto = z.infer<typeof sheetReceiptDto>;

export const sheetWriteResponseDto = z.strictObject({ sheet: sheetDto, receipt: sheetReceiptDto });
export type SheetWriteResponseDto = z.infer<typeof sheetWriteResponseDto>;

/** `sheet:changed` (to the table's room): no values, so a `controllers` sheet never leaks; each
 *  client that shows it reads it again by the route.
 *
 *  Example: `sheetChangedEventDto.parse({ campaignId, sheetId, version: 4, at })` */
export const sheetChangedEventDto = z.strictObject({
  campaignId: z.uuid(),
  sheetId: z.uuid(),
  version: stateVersionDto,
  at: z.iso.datetime(),
});
export type SheetChangedEventDto = z.infer<typeof sheetChangedEventDto>;

/** `sheet:adjustBar`: the server finds the sheet's token (never a `tokenId` from the frame) and
 *  applies the same rule as `token:adjustBar`; a sheet without a holder is SHEET_HAS_NO_TOKEN.
 *
 *  Example: `sheetAdjustBarCommandDto.parse({ actionId, campaignId, sheetId, barId, change: { op: 'add', amount: -7 } })` */
export const sheetAdjustBarCommandDto = z.strictObject({
  actionId: z.uuid(),
  campaignId: z.uuid(),
  sheetId: z.uuid(),
  barId: z.uuid(),
  change: barChangeDto,
});
export type SheetAdjustBarCommandDto = z.infer<typeof sheetAdjustBarCommandDto>;
