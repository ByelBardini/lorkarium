import { z } from 'zod';
import { stateVersionDto } from '../http/realtime-ack.dto';
import { utf8Length } from '../utf8-length';

export const SHEET_TEMPLATE_SOURCE_MAX_BYTES = 512 * 1024;
export const SHEET_TEMPLATE_NAME_MAX_LENGTH = 60;
export const UNNAMED_SHEET_TEMPLATE_NAME = 'Modelo sem nome';
const SOURCE_KEYS = ['html', 'css', 'js'] as const;
const CHANGE_KEYS = ['name', 'folderId', ...SOURCE_KEYS] as const;

export const sheetTemplateNameDto = z.string().trim().min(1).max(SHEET_TEMPLATE_NAME_MAX_LENGTH);
// Characters never outnumber UTF-8 bytes, so this cheap cap runs before the byte count.
const sourceTextDto = z.string().max(SHEET_TEMPLATE_SOURCE_MAX_BYTES);
export const sheetTemplateSourceShape = {
  html: sourceTextDto,
  css: sourceTextDto,
  js: sourceTextDto,
};

interface PartialSource {
  html?: string;
  css?: string;
  js?: string;
}

export function checkSheetTemplateSourceBudget(
  source: PartialSource,
  context: z.RefinementCtx,
): void {
  const bytes = SOURCE_KEYS.reduce((sum, key) => sum + utf8Length(source[key] ?? ''), 0);
  if (bytes <= SHEET_TEMPLATE_SOURCE_MAX_BYTES) return;
  context.addIssue({
    code: 'custom',
    message: `html + css + js have ${bytes} bytes; expected at most ${SHEET_TEMPLATE_SOURCE_MAX_BYTES}`,
  });
}

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

/** A template with its code, as the master's editor reads it; html + css + js fit the budget.
 *
 *  Example: `sheetTemplateDto.parse({ ...summary, html: '<p></p>', css: '', js: '' })` */
export const sheetTemplateDto = z
  .strictObject({ ...sheetTemplateSummaryDto.shape, ...sheetTemplateSourceShape })
  .superRefine(checkSheetTemplateSourceBudget);
export type SheetTemplateDto = z.infer<typeof sheetTemplateDto>;

/** The code a sheet runs, sent with the sheet so one read mounts the frame.
 *
 *  Example: `sheetTemplateCodeDto.parse({ name: 'Ficha Tormenta', version: 3, html, css, js })` */
export const sheetTemplateCodeDto = z
  .strictObject({
    name: sheetTemplateNameDto,
    version: stateVersionDto,
    ...sheetTemplateSourceShape,
  })
  .superRefine(checkSheetTemplateSourceBudget);
export type SheetTemplateCodeDto = z.infer<typeof sheetTemplateCodeDto>;

/** Body of `POST /campaigns/:campaignId/sheet-templates` (master only): no name =
 *  `UNNAMED_SHEET_TEMPLATE_NAME`, no folder = the root.
 *
 *  Example: `createSheetTemplateRequestDto.parse({ name: ' Ficha Tormenta ', html, css, js })` */
export const createSheetTemplateRequestDto = z
  .strictObject({
    name: sheetTemplateNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    ...sheetTemplateSourceShape,
  })
  .superRefine(checkSheetTemplateSourceBudget);
export type CreateSheetTemplateRequestDto = z.infer<typeof createSheetTemplateRequestDto>;

interface TemplateChanges extends PartialSource {
  name?: string;
  folderId?: string | null;
}

function checkTemplateChanges(changes: TemplateChanges, context: z.RefinementCtx): void {
  const present = SOURCE_KEYS.filter((key) => changes[key] !== undefined);
  if (present.length > 0 && present.length < SOURCE_KEYS.length)
    context.addIssue({
      code: 'custom',
      message: `source has only ${present.join(', ')}; expected html, css and js together`,
    });
  if (CHANGE_KEYS.some((key) => changes[key] !== undefined)) return;
  context.addIssue({
    code: 'custom',
    message: `changes is empty; expected at least one of ${CHANGE_KEYS.join(', ')}`,
  });
}

/** Body of `PATCH /campaigns/:campaignId/sheet-templates/:templateId`: the code goes as a whole
 *  (html, css and js together) so the budget is checked at the edge; `folderId: null` takes it to
 *  the root; `expectedVersion` refuses saving over another master's save.
 *
 *  Example: `updateSheetTemplateRequestDto.parse({ expectedVersion: 3, html, css, js })` */
export const updateSheetTemplateRequestDto = z
  .strictObject({
    expectedVersion: stateVersionDto,
    name: sheetTemplateNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    html: sourceTextDto.optional(),
    css: sourceTextDto.optional(),
    js: sourceTextDto.optional(),
  })
  .superRefine((changes, context) => {
    checkTemplateChanges(changes, context);
    checkSheetTemplateSourceBudget(changes, context);
  });
export type UpdateSheetTemplateRequestDto = z.infer<typeof updateSheetTemplateRequestDto>;

/** Params of the routes of one sheet template. */
export const sheetTemplateParamsDto = z.strictObject({
  campaignId: z.uuid(),
  templateId: z.uuid(),
});

export const sheetTemplateResponseDto = z.strictObject({ template: sheetTemplateDto });
export type SheetTemplateResponseDto = z.infer<typeof sheetTemplateResponseDto>;
