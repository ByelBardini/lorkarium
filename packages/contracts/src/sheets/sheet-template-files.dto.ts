import { z } from 'zod';
import { utf8Length } from '../utf8-length';

export const SHEET_TEMPLATE_SOURCE_MAX_BYTES = 512 * 1024;
export const SHEET_TEMPLATE_FILES_MAX = 64;
export const SHEET_TEMPLATE_FILE_PATH_MAX_LENGTH = 120;
/** The page the frame shows: every template has it, and every `<lk-include>` starts from it. */
export const SHEET_TEMPLATE_ENTRY_PATH = 'index.html';
export const SHEET_TEMPLATE_FILE_KINDS = ['html', 'css', 'js'] as const;
export type SheetTemplateFileKind = (typeof SHEET_TEMPLATE_FILE_KINDS)[number];

// Plain segments only: no `..`, no leading `/`, no `\`, no space, so a path never escapes the
// template nor needs escaping where the host quotes it.
const PATH_SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/;
const SOURCE_EXTENSION = /\.(html|css|js)$/;

/** Whether `path` is made of plain segments separated by `/` and ends in one of `extensions`.
 *
 *  Example: `isPlainTemplatePath('paginas/perfil.html', /\.(html|css|js)$/) // true` */
export function isPlainTemplatePath(path: string, extensions: RegExp): boolean {
  if (path.length > SHEET_TEMPLATE_FILE_PATH_MAX_LENGTH || !extensions.test(path)) return false;
  return path.split('/').every((segment) => PATH_SEGMENT.test(segment));
}

/** The language of a template file, by its extension.
 *
 *  Example: `sheetTemplateFileKindOf('scripts/a.js') // 'js'` */
export function sheetTemplateFileKindOf(path: string): SheetTemplateFileKind {
  const kind = SOURCE_EXTENSION.exec(path)?.[1];
  if (kind === 'html' || kind === 'css' || kind === 'js') return kind;
  throw new RangeError(
    `file path ${JSON.stringify(path)}; expected one ending in .html, .css or .js`,
  );
}

/** Path of one template file, relative to the template.
 *
 *  Example: `sheetTemplateFilePathDto.parse('paginas/perfil.html')` */
export const sheetTemplateFilePathDto = z
  .string()
  .refine((path) => isPlainTemplatePath(path, SOURCE_EXTENSION), {
    error: (issue) =>
      `file path ${JSON.stringify(issue.input)}; expected plain segments (letters, digits, _, - and .) joined by /, at most ${SHEET_TEMPLATE_FILE_PATH_MAX_LENGTH} characters, ending in .html, .css or .js`,
  });

// Characters never outnumber UTF-8 bytes, so this cheap cap runs before the byte count.
export const sheetTemplateSourceTextDto = z.string().max(SHEET_TEMPLATE_SOURCE_MAX_BYTES);

/** One file of a template: its path and its text.
 *
 *  Example: `sheetTemplateSourceFileDto.parse({ path: 'index.html', content: '<p></p>' })` */
export const sheetTemplateSourceFileDto = z.strictObject({
  path: sheetTemplateFilePathDto,
  content: sheetTemplateSourceTextDto,
});
export type SheetTemplateSourceFileDto = z.infer<typeof sheetTemplateSourceFileDto>;

type PathEntry = Readonly<{ path: string }>;

/** Adds an issue when two paths are the same ignoring case (the file systems a template is
 *  exported to may not tell them apart).
 *
 *  Example: `checkRepeatedPaths(files, context, 'file')` */
export function checkRepeatedPaths(
  entries: readonly PathEntry[],
  context: z.RefinementCtx,
  noun: string,
): void {
  const keys = entries.map(({ path }) => path.toLowerCase());
  const second = keys.findIndex((key, index) => keys.indexOf(key) < index);
  if (second === -1) return;
  const first = entries[keys.indexOf(keys[second] as string)]?.path;
  context.addIssue({
    code: 'custom',
    message: `${noun} paths "${first}" and "${entries[second]?.path}" repeat; expected distinct paths, ignoring case`,
  });
}

function checkFiles(files: readonly SheetTemplateSourceFileDto[], context: z.RefinementCtx): void {
  checkRepeatedPaths(files, context, 'file');
  if (!files.some(({ path }) => path === SHEET_TEMPLATE_ENTRY_PATH))
    context.addIssue({
      code: 'custom',
      message: `files have no ${SHEET_TEMPLATE_ENTRY_PATH}; expected the entry page ${SHEET_TEMPLATE_ENTRY_PATH}`,
    });
  const bytes = files.reduce((sum, file) => sum + utf8Length(file.content), 0);
  if (bytes <= SHEET_TEMPLATE_SOURCE_MAX_BYTES) return;
  context.addIssue({
    code: 'custom',
    message: `files have ${bytes} bytes; expected at most ${SHEET_TEMPLATE_SOURCE_MAX_BYTES}`,
  });
}

/** The code of a template: an ordered list of files (CSS and JS run in this order), with
 *  `index.html`, distinct paths and at most 512 KiB of UTF-8 in total.
 *
 *  Example: `sheetTemplateFilesDto.parse([{ path: 'index.html', content: '<p></p>' }])` */
export const sheetTemplateFilesDto = z
  .array(sheetTemplateSourceFileDto)
  .min(1, { error: `files is empty; expected at least ${SHEET_TEMPLATE_ENTRY_PATH}` })
  .max(SHEET_TEMPLATE_FILES_MAX, {
    error: (issue) =>
      `files has ${Array.isArray(issue.input) ? issue.input.length : '?'}; expected at most ${SHEET_TEMPLATE_FILES_MAX}`,
  })
  .superRefine(checkFiles);
export type SheetTemplateFilesDto = z.infer<typeof sheetTemplateFilesDto>;
