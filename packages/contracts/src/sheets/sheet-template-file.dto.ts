import { z } from 'zod';
import {
  checkSheetTemplateSourceBudget,
  sheetTemplateNameDto,
  sheetTemplateSourceShape,
} from './sheet-template.dto';

export const SHEET_TEMPLATE_FILE_FORMAT = 'lorkarium.sheet-template';
export const SHEET_TEMPLATE_FILE_VERSION = 1;
export const SHEET_TEMPLATE_FILE_EXTENSION = '.lksheet';
// The JSON escape inflates the 512 KiB of code, so the file cap is the HTTP body cap.
export const SHEET_TEMPLATE_FILE_MAX_BYTES = 2 * 1024 * 1024;

const sheetTemplateFileFormatDto = z.literal(SHEET_TEMPLATE_FILE_FORMAT, {
  error: (issue) => `format ${JSON.stringify(issue.input)}; expected ${SHEET_TEMPLATE_FILE_FORMAT}`,
});

/** First read of a `.lksheet`: only the format and its version, loose, so a newer file is told
 *  apart from a broken one before the strict body is checked.
 *
 *  Example: `sheetTemplateFileHeaderDto.parse(JSON.parse(text)).formatVersion > SHEET_TEMPLATE_FILE_VERSION` */
export const sheetTemplateFileHeaderDto = z.object({
  format: sheetTemplateFileFormatDto,
  formatVersion: z.int().min(1),
});
export type SheetTemplateFileHeaderDto = z.infer<typeof sheetTemplateFileHeaderDto>;

/** A `.lksheet` file: the name and code of one template, never its sheets, values or version;
 *  html + css + js fit the template budget.
 *
 *  Example: `sheetTemplateFileDto.parse({ format: SHEET_TEMPLATE_FILE_FORMAT, formatVersion: 1, name, html, css, js })` */
export const sheetTemplateFileDto = z
  .strictObject({
    format: sheetTemplateFileFormatDto,
    formatVersion: z.literal(SHEET_TEMPLATE_FILE_VERSION, {
      error: (issue) =>
        `formatVersion ${JSON.stringify(issue.input)}; expected ${SHEET_TEMPLATE_FILE_VERSION}`,
    }),
    exportedAt: z.iso.datetime().optional(),
    name: sheetTemplateNameDto,
    ...sheetTemplateSourceShape,
  })
  .superRefine(checkSheetTemplateSourceBudget);
export type SheetTemplateFileDto = z.infer<typeof sheetTemplateFileDto>;
