import {
  SHEET_TEMPLATE_FILE_EXTENSION,
  SHEET_TEMPLATE_FILE_FORMAT,
  SHEET_TEMPLATE_FILE_LEGACY_VERSION,
  SHEET_TEMPLATE_FILE_MAX_BYTES,
  SHEET_TEMPLATE_FILE_VERSION,
  sheetTemplateFileDto,
  sheetTemplateFileHeaderDto,
  sheetTemplateFileV1Dto,
  type SheetTemplateDto,
  type SheetTemplateFileAssetDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { filesOfLegacySource } from './sheet-template-files';

/** What a `.lksheet` carries: the template, and the bytes of its assets when it has any (the
 *  manifest's asset ids belong to the table that exported it). */
export type SheetTemplateFileContent = Pick<SheetTemplateDto, 'name' | 'files' | 'manifest'> &
  Readonly<{ assets?: readonly SheetTemplateFileAssetDto[] }>;
export type SheetTemplateFileProblem =
  'not_json' | 'not_lksheet' | 'newer_version' | 'over_budget' | 'invalid';
export type SheetTemplateFileReading =
  | { ok: true; template: SheetTemplateFileContent }
  | { ok: false; problem: SheetTemplateFileProblem };

// Written by code: an invisible character in the source would be lost by an editor.
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const FALLBACK_FILE_NAME = 'modelo-de-ficha';
const SOURCE_KEYS: readonly PropertyKey[] = ['html', 'css', 'js', 'files', 'assets'];
// eslint-disable-next-line no-control-regex -- the control characters are what Windows refuses
const WINDOWS_REFUSED = /[<>:"/\\|?*\u0000-\u001f]/gu;

/** The `.lksheet` text (format 2) of a template: its name, files in order, manifest (without
 *  this table's asset ids) and the bytes of its assets, never its id, version or sheets.
 *
 *  Example: `downloadText(sheetTemplateFileText(template), sheetTemplateFileName(template.name))` */
export function sheetTemplateFileText(
  template: SheetTemplateFileContent,
  exportedAt: Date = new Date(),
): string {
  const { name, files } = template;
  const manifest = { ...template.manifest, assets: [] };
  const assets = template.assets ?? [];
  const file = {
    format: SHEET_TEMPLATE_FILE_FORMAT,
    formatVersion: SHEET_TEMPLATE_FILE_VERSION,
    exportedAt: exportedAt.toISOString(),
    ...{ name, files, manifest },
    ...(assets.length > 0 ? { assets } : {}),
  };
  return JSON.stringify(file, null, 2);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return {
      ok: true,
      value: JSON.parse(text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text) as unknown,
    };
  } catch {
    return { ok: false };
  }
}

const BUDGET_MESSAGE = /have \d+ bytes; expected at most/;

// The budget refine says "have N bytes"; a text past the cheap character cap is `too_big`.
function overBudget(issues: readonly z.core.$ZodIssue[]): boolean {
  return issues.some(
    (issue) =>
      (issue.code === 'custom' && BUDGET_MESSAGE.test(issue.message)) ||
      (issue.code === 'too_big' && SOURCE_KEYS.includes(issue.path[0] ?? '')),
  );
}

function bodyReading(value: unknown, formatVersion: number): SheetTemplateFileReading {
  if (formatVersion === SHEET_TEMPLATE_FILE_LEGACY_VERSION) {
    const legacy = sheetTemplateFileV1Dto.safeParse(value);
    if (!legacy.success) return refusalOf(legacy.error.issues);
    const { name, manifest } = legacy.data;
    return { ok: true, template: { name, files: [...filesOfLegacySource(legacy.data)], manifest } };
  }
  const body = sheetTemplateFileDto.safeParse(value);
  if (!body.success) return refusalOf(body.error.issues);
  const { name, files, manifest, assets } = body.data;
  const carried = assets.length > 0 ? { assets } : {};
  return { ok: true, template: { name, files, manifest: { ...manifest, assets: [] }, ...carried } };
}

function refusalOf(issues: readonly z.core.$ZodIssue[]): SheetTemplateFileReading {
  return { ok: false, problem: overBudget(issues) ? 'over_budget' : 'invalid' };
}

/** Reads a `.lksheet` text in two steps (header, then strict body), so a newer file says so
 *  instead of failing on a field it does not know; a file of the first format (one html, css and
 *  js) comes back as `index.html`, `style.css` and `script.js`.
 *
 *  Example: `const reading = readSheetTemplateFile(await file.text()); if (!reading.ok) show(reading.problem)` */
export function readSheetTemplateFile(text: string): SheetTemplateFileReading {
  const json = parseJson(text);
  if (!json.ok) return { ok: false, problem: 'not_json' };
  const header = sheetTemplateFileHeaderDto.safeParse(json.value);
  if (!header.success) return { ok: false, problem: 'not_lksheet' };
  if (header.data.formatVersion > SHEET_TEMPLATE_FILE_VERSION)
    return { ok: false, problem: 'newer_version' };
  return bodyReading(json.value, header.data.formatVersion);
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
