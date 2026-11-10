import type { SheetTemplateDto, SheetTemplateSummaryDto } from '@lorkarium/contracts';
import type { TemplateFile } from '@/lib/sheet-template-files';
import { TORMENTA_TEMPLATE_ID } from './sheet-fixtures';

/** The three files of "Ficha Tormenta", as a migrated template has them. */
export function tormentaFiles(): { path: string; content: string }[] {
  return [
    { path: 'index.html', content: '<p id="pv">PV</p>' },
    { path: 'style.css', content: 'p { color: red; }' },
    { path: 'script.js', content: 'lorkarium.ready();' },
  ];
}

/** The text of `path` among `files` (`undefined` when there is no such file).
 *
 *  Example: `contentOf(draft.files, 'script.js') // 'lorkarium.ready();'` */
export function contentOf(files: readonly TemplateFile[], path: string): string | undefined {
  return files.find((file) => file.path === path)?.content;
}

/** `files` with the text of `path` replaced (the file added at the end when missing). */
export function withContent(
  files: readonly TemplateFile[],
  path: string,
  content: string,
): { path: string; content: string }[] {
  const changed = files.map((file) => (file.path === path ? { path, content } : { ...file }));
  return files.some((file) => file.path === path) ? changed : [...changed, { path, content }];
}

export const NEW_TEMPLATE_ID = '8d9e0f1a-2b3c-4d4e-9f5a-6b7c8d9e0f1a';
const EDITED_AT = '2026-10-30T12:00:00.000Z';

/** "Ficha Tormenta" with its code and a manifest that declares nothing, at version 3, in no
 *  folder. */
export function tormentaTemplate(overrides: Partial<SheetTemplateDto> = {}): SheetTemplateDto {
  return {
    id: TORMENTA_TEMPLATE_ID,
    folderId: null,
    name: 'Ficha Tormenta',
    version: 3,
    updatedAt: EDITED_AT,
    files: tormentaFiles(),
    manifest: { permissions: [], bars: [], assets: [] },
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
