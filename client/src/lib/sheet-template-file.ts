import {
  SHEET_TEMPLATE_FILE_EXTENSION,
  SHEET_TEMPLATE_FILE_FORMAT,
  SHEET_TEMPLATE_FILE_MAX_BYTES,
  SHEET_TEMPLATE_FILE_VERSION,
  sheetTemplateFileDto,
  sheetTemplateFileHeaderDto,
  type SheetTemplateDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';

export type SheetTemplateFileContent = Pick<SheetTemplateDto, 'name' | 'html' | 'css' | 'js'>;
export type SheetTemplateFileProblem =
  'not_json' | 'not_lksheet' | 'newer_version' | 'over_budget' | 'invalid';
export type SheetTemplateFileReading =
  | { ok: true; template: SheetTemplateFileContent }
  | { ok: false; problem: SheetTemplateFileProblem };

const FALLBACK_FILE_NAME = 'modelo-de-ficha';
const SOURCE_KEYS: readonly PropertyKey[] = ['html', 'css', 'js'];
// eslint-disable-next-line no-control-regex -- the control characters are what Windows refuses
const WINDOWS_REFUSED = /[<>:"/\\|?*\u0000-\u001f]/gu;

/** The `.lksheet` text of a template: its name and code, never its id, version or sheets.
 *
 *  Example: `downloadText(sheetTemplateFileText(template), sheetTemplateFileName(template.name))` */
export function sheetTemplateFileText(
  template: SheetTemplateFileContent,
  exportedAt: Date = new Date(),
): string {
  const { name, html, css, js } = template;
  const file = {
    format: SHEET_TEMPLATE_FILE_FORMAT,
    formatVersion: SHEET_TEMPLATE_FILE_VERSION,
    exportedAt: exportedAt.toISOString(),
    ...{ name, html, css, js },
  };
  return JSON.stringify(file, null, 2);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text.replace(/^FEFF/u, '')) as unknown };
  } catch {
    return { ok: false };
  }
}

function overBudget(issues: readonly z.core.$ZodIssue[]): boolean {
  return issues.some(
    (issue) =>
      issue.code === 'custom' ||
      (issue.code === 'too_big' && SOURCE_KEYS.includes(issue.path[0] ?? '')),
  );
}

/** Reads a `.lksheet` text in two steps (header, then strict body), so a newer file says so
 *  instead of failing on a field it does not know.
 *
 *  Example: `const reading = readSheetTemplateFile(await file.text()); if (!reading.ok) show(reading.problem)` */
export function readSheetTemplateFile(text: string): SheetTemplateFileReading {
  const json = parseJson(text);
  if (!json.ok) return { ok: false, problem: 'not_json' };
  const header = sheetTemplateFileHeaderDto.safeParse(json.value);
  if (!header.success) return { ok: false, problem: 'not_lksheet' };
  if (header.data.formatVersion > SHEET_TEMPLATE_FILE_VERSION)
    return { ok: false, problem: 'newer_version' };
  const body = sheetTemplateFileDto.safeParse(json.value);
  if (body.success) {
    const { name, html, css, js } = body.data;
    return { ok: true, template: { name, html, css, js } };
  }
  return { ok: false, problem: overBudget(body.error.issues) ? 'over_budget' : 'invalid' };
}

/** The download name of a template: the characters Windows refuses become `-`.
 *
 *  Example: `sheetTemplateFileName('Ficha: Tormenta') // 'Ficha- Tormenta.lksheet'` */
export function sheetTemplateFileName(name: string): string {
  const safe = name.replace(WINDOWS_REFUSED, '-').trim();
  const base = safe.replace(/-/gu, '') === '' ? FALLBACK_FILE_NAME : safe;
  return `${base}${SHEET_TEMPLATE_FILE_EXTENSION}`;
}

/** Whether a picked file is refused before reading it (beyond the HTTP body cap).
 *
 *  Example: `if (sheetTemplateFileTooLarge(file.size)) return refuse('over_budget')` */
export function sheetTemplateFileTooLarge(size: number): boolean {
  return size > SHEET_TEMPLATE_FILE_MAX_BYTES;
}
