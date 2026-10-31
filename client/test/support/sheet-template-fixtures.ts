import type { SheetTemplateDto, SheetTemplateSummaryDto } from '@lorkarium/contracts';
import { TORMENTA_TEMPLATE_ID } from './sheet-fixtures';

export const NEW_TEMPLATE_ID = '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a';
const EDITED_AT = '2026-10-30T12:00:00.000Z';

/** "Ficha Tormenta" with its code, at version 3, in no folder. */
export function tormentaTemplate(overrides: Partial<SheetTemplateDto> = {}): SheetTemplateDto {
  return {
    id: TORMENTA_TEMPLATE_ID,
    folderId: null,
    name: 'Ficha Tormenta',
    version: 3,
    updatedAt: EDITED_AT,
    html: '<p id="pv">PV</p>',
    css: 'p { color: red; }',
    js: 'lorkarium.ready();',
    ...overrides,
  };
}

/** The library line of `tormentaTemplate()`: the same template without its code. */
export function tormentaSummary(
  overrides: Partial<SheetTemplateSummaryDto> = {},
): SheetTemplateSummaryDto {
  const { id, folderId, name, version, updatedAt } = tormentaTemplate();
  return { id, folderId, name, version, updatedAt, ...overrides };
}
