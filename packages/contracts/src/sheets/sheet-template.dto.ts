import { z } from 'zod';
import { stateVersionDto } from '../http/realtime-ack.dto';
import { sheetTemplateManifestDto } from './sheet-manifest.dto';
import { sheetTemplateFilesDto } from './sheet-template-files.dto';

export const SHEET_TEMPLATE_NAME_MAX_LENGTH = 60;
export const UNNAMED_SHEET_TEMPLATE_NAME = 'Modelo sem nome';
const CHANGE_KEYS = ['name', 'folderId', 'files', 'manifest'] as const;

export const sheetTemplateNameDto = z.string().trim().min(1).max(SHEET_TEMPLATE_NAME_MAX_LENGTH);

/** A template as the library lists it (master only): no code, so the aggregate stays small.
 *
 *  Example: `sheetTemplateSummaryDto.parse({ id, folderId: null, name: 'Ficha Tormenta', version: 3, updatedAt })` */
export const sheetTemplateSummaryDto = z.strictObject({
  id: z.uuid(),
  folderId: z.uuid().nullable(),
  name: sheetTemplateNameDto,
  version: stateVersionDto,
  updatedAt: z.iso.datetime(),
});
export type SheetTemplateSummaryDto = z.infer<typeof sheetTemplateSummaryDto>;

/** A template with its files and manifest, as the master's editor reads it.
 *
 *  Example: `sheetTemplateDto.parse({ ...summary, files: [{ path: 'index.html', content: '<p></p>' }], manifest })` */
export const sheetTemplateDto = z.strictObject({
  ...sheetTemplateSummaryDto.shape,
  files: sheetTemplateFilesDto,
  manifest: sheetTemplateManifestDto,
});
export type SheetTemplateDto = z.infer<typeof sheetTemplateDto>;

/** The code a sheet runs and the manifest the host enforces, sent with the sheet so one read
 *  mounts the frame.
 *
 *  Example: `sheetTemplateCodeDto.parse({ name: 'Ficha Tormenta', version: 3, files, manifest })` */
export const sheetTemplateCodeDto = z.strictObject({
  name: sheetTemplateNameDto,
  version: stateVersionDto,
  files: sheetTemplateFilesDto,
  manifest: sheetTemplateManifestDto,
});
export type SheetTemplateCodeDto = z.infer<typeof sheetTemplateCodeDto>;

/** Body of `POST /campaigns/:campaignId/sheet-templates` (master only): no name =
 *  `UNNAMED_SHEET_TEMPLATE_NAME`, no folder = the root, no manifest = one that declares nothing.
 *
 *  Example: `createSheetTemplateRequestDto.parse({ name: ' Ficha Tormenta ', files })` */
export const createSheetTemplateRequestDto = z.strictObject({
  name: sheetTemplateNameDto.optional(),
  folderId: z.uuid().nullable().optional(),
  files: sheetTemplateFilesDto,
  manifest: sheetTemplateManifestDto.optional(),
});
export type CreateSheetTemplateRequestDto = z.infer<typeof createSheetTemplateRequestDto>;

interface TemplateChanges {
  name?: string;
  folderId?: string | null;
  files?: unknown;
  manifest?: unknown;
}

function checkTemplateChanges(changes: TemplateChanges, context: z.RefinementCtx): void {
  if (CHANGE_KEYS.some((key) => changes[key] !== undefined)) return;
  context.addIssue({
    code: 'custom',
    message: `changes is empty; expected at least one of ${CHANGE_KEYS.join(', ')}`,
  });
}

/** Body of `PATCH /campaigns/:campaignId/sheet-templates/:templateId`: the files go as a whole
 *  list (a reorder is a change too) so the budget is checked at the edge; the manifest goes whole
 *  too; `folderId: null` takes it to the root; `expectedVersion` refuses saving over another
 *  master's save.
 *
 *  Example: `updateSheetTemplateRequestDto.parse({ expectedVersion: 3, files })` */
export const updateSheetTemplateRequestDto = z
  .strictObject({
    expectedVersion: stateVersionDto,
    name: sheetTemplateNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    files: sheetTemplateFilesDto.optional(),
    manifest: sheetTemplateManifestDto.optional(),
  })
  .superRefine(checkTemplateChanges);
export type UpdateSheetTemplateRequestDto = z.infer<typeof updateSheetTemplateRequestDto>;

/** Params of the routes of one sheet template. */
export const sheetTemplateParamsDto = z.strictObject({
  campaignId: z.uuid(),
  templateId: z.uuid(),
});

export const sheetTemplateResponseDto = z.strictObject({ template: sheetTemplateDto });
export type SheetTemplateResponseDto = z.infer<typeof sheetTemplateResponseDto>;
