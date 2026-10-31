import type {
  SheetTemplateCodeDto,
  SheetTemplateDto,
  SheetTemplateSummaryDto,
  UpdateSheetTemplateRequestDto,
} from '@lorkarium/contracts';
import type {
  SheetTemplateChangesPo,
  SheetTemplatePo,
  SheetTemplateSummaryPo,
} from './sheet-templates.po';

/** The library row of a template, without the code.
 *
 *  Example: `toSheetTemplateSummaryDto(row).name // 'Ficha Tormenta'` */
export function toSheetTemplateSummaryDto(row: SheetTemplateSummaryPo): SheetTemplateSummaryDto {
  return {
    id: row.id,
    folderId: row.folderId,
    name: row.name,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** The template with its code, as the master's editor reads it. */
export function toSheetTemplateDto(row: SheetTemplatePo): SheetTemplateDto {
  return { ...toSheetTemplateSummaryDto(row), html: row.html, css: row.css, js: row.js };
}

/** The code a sheet runs, sent with the sheet. */
export function toSheetTemplateCodeDto(row: SheetTemplatePo): SheetTemplateCodeDto {
  const { name, version, html, css, js } = row;
  return { name, version, html, css, js };
}

/** Only the keys that came; the code comes whole or not at all (the DTO checks it). */
export function toSheetTemplateChangesPo(
  input: UpdateSheetTemplateRequestDto,
): SheetTemplateChangesPo {
  const { name, folderId, html, css, js } = input;
  return {
    ...(name === undefined ? {} : { name }),
    ...(folderId === undefined ? {} : { folderId }),
    ...(html === undefined ? {} : { html }),
    ...(css === undefined ? {} : { css }),
    ...(js === undefined ? {} : { js }),
  };
}
