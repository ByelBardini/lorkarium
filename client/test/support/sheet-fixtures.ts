import type {
  SheetDto,
  SheetReceiptDto,
  SheetResponseDto,
  SheetSummaryDto,
  SheetTemplateCodeDto,
  SheetWriteResponseDto,
} from '@lorkarium/contracts';
import { LYRA_ANCHOR_ID } from './cast-fixtures';
import { BIA_AT_TABLE } from './table-session-fixtures';

export const TORMENTA_TEMPLATE_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
export const LYRA_SHEET_ID = '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e';
export const SHEET_ACTION_ID = '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f';
export const GOBLIN_SHEET_ID = '8e9f0a1b-2c3d-4e4f-8a5b-6c7d8e9f0a1b';
export const SPARE_SHEET_ID = '9f0a1b2c-3d4e-4f5a-9b6c-7d8e9f0a1b2c';

/** "Lyra de Vharn" (a "Ficha Tormenta" given to Bia) as Bia (a controller) reads it at version
 *  1: Força 14, on Lyra's anchor. */
export function lyraSheet(overrides: Partial<SheetDto> = {}): SheetDto {
  return {
    id: LYRA_SHEET_ID,
    name: 'Lyra de Vharn',
    folderId: null,
    templateId: TORMENTA_TEMPLATE_ID,
    tokenId: LYRA_ANCHOR_ID,
    memberId: BIA_AT_TABLE.userId,
    visibility: 'controllers',
    values: { forca: 14 },
    version: 1,
    canEdit: true,
    canManage: false,
    ...overrides,
  };
}

/** The library line of `lyraSheet()` (no values). */
export function lyraSummary(overrides: Partial<SheetSummaryDto> = {}): SheetSummaryDto {
  const { id, name, folderId, templateId, tokenId, memberId, visibility, version } = lyraSheet();
  return { id, name, folderId, templateId, tokenId, memberId, visibility, version, ...overrides };
}

/** A sheet nobody holds yet (the masters' only): "Ficha reserva". */
export function spareSummary(overrides: Partial<SheetSummaryDto> = {}): SheetSummaryDto {
  return lyraSummary({
    id: SPARE_SHEET_ID,
    name: 'Ficha reserva',
    tokenId: null,
    memberId: null,
    ...overrides,
  });
}

/** The code of "Ficha Tormenta" at version 1. */
export function tormentaCode(overrides: Partial<SheetTemplateCodeDto> = {}): SheetTemplateCodeDto {
  return { name: 'Ficha Tormenta', version: 1, html: '<p>PV</p>', css: '', js: '', ...overrides };
}

/** What `GET …/sheets/:sheetId` answers for `sheet`. */
export function sheetResponse(
  sheet: SheetDto = lyraSheet(),
  template: SheetTemplateCodeDto = tormentaCode(),
): SheetResponseDto {
  return { sheet, template };
}

/** What a values patch answers: the sheet after it, with its receipt. */
export function sheetValuesWrite(
  sheet: SheetDto,
  actionId = SHEET_ACTION_ID,
): SheetWriteResponseDto {
  return sheetWrite(sheet, 'values', actionId);
}

/** What a sheet command answers: the sheet after it, with the receipt of `operation`. */
export function sheetWrite(
  sheet: SheetDto,
  operation: SheetReceiptDto['operation'],
  actionId = SHEET_ACTION_ID,
): SheetWriteResponseDto {
  return { sheet, receipt: { actionId, sheetId: sheet.id, version: sheet.version, operation } };
}
