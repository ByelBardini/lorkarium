import {
  SHEET_TEMPLATE_ENTRY_PATH,
  SHEET_TEMPLATE_FILES_MAX,
  sheetTemplateFilePathDto,
} from '@lorkarium/contracts';

/** One file of a template being edited. */
export type TemplateFile = Readonly<{ path: string; content: string }>;

/** Why a change to the file list was refused: a path the contract refuses, one already taken
 *  (ignoring case), the entry page (never renamed nor removed) or the file cap. */
export type TemplateFilesProblem = 'invalid_path' | 'repeated_path' | 'entry_page' | 'too_many';

export type TemplateFilesChange =
  | Readonly<{ ok: true; files: readonly TemplateFile[] }>
  | Readonly<{ ok: false; problem: TemplateFilesProblem }>;

const encoder = new TextEncoder();

/** The UTF-8 bytes of every file, the measure of `SHEET_TEMPLATE_SOURCE_MAX_BYTES`.
 *
 *  Example: `templateFilesBytes([{ path: 'index.html', content: 'é' }]) // 2` */
export function templateFilesBytes(files: readonly TemplateFile[]): number {
  return files.reduce((sum, file) => sum + encoder.encode(file.content).byteLength, 0);
}

function pathProblem(
  files: readonly TemplateFile[],
  path: string,
  ignored?: string,
): TemplateFilesProblem | null {
  if (!sheetTemplateFilePathDto.safeParse(path).success) return 'invalid_path';
  const key = path.toLowerCase();
  const taken = files.some((file) => file.path !== ignored && file.path.toLowerCase() === key);
  return taken ? 'repeated_path' : null;
}

/** `files` with an empty file at `path` at the end (a script then runs last).
 *
 *  Example: `addTemplateFile(files, 'paginas/perfil.html')` */
export function addTemplateFile(files: readonly TemplateFile[], path: string): TemplateFilesChange {
  if (files.length >= SHEET_TEMPLATE_FILES_MAX) return { ok: false, problem: 'too_many' };
  const problem = pathProblem(files, path);
  if (problem) return { ok: false, problem };
  return { ok: true, files: [...files, { path, content: '' }] };
}

/** `files` with `from` renamed to `to`, in the same place; the entry page keeps its name.
 *
 *  Example: `renameTemplateFile(files, 'a.js', 'scripts/a.js')` */
export function renameTemplateFile(
  files: readonly TemplateFile[],
  from: string,
  to: string,
): TemplateFilesChange {
  if (from === SHEET_TEMPLATE_ENTRY_PATH) return { ok: false, problem: 'entry_page' };
  const problem = pathProblem(files, to, from);
  if (problem) return { ok: false, problem };
  return {
    ok: true,
    files: files.map((file) => (file.path === from ? { ...file, path: to } : file)),
  };
}

/** `files` without `path`; the entry page stays.
 *
 *  Example: `removeTemplateFile(files, 'b.js')` */
export function removeTemplateFile(
  files: readonly TemplateFile[],
  path: string,
): TemplateFilesChange {
  if (path === SHEET_TEMPLATE_ENTRY_PATH) return { ok: false, problem: 'entry_page' };
  return { ok: true, files: files.filter((file) => file.path !== path) };
}

/** `files` with `path` moved `offset` places (−1 up, +1 down), held at the ends: the order is
 *  the order CSS and JS run in.
 *
 *  Example: `moveTemplateFile(files, 'b.js', -1)` */
export function moveTemplateFile(
  files: readonly TemplateFile[],
  path: string,
  offset: number,
): readonly TemplateFile[] {
  const from = files.findIndex((file) => file.path === path);
  if (from === -1) return files;
  const to = Math.min(Math.max(from + offset, 0), files.length - 1);
  const moved = files.filter((_, at) => at !== from);
  moved.splice(to, 0, files[from] as TemplateFile);
  return moved;
}

/** `files` with the text of `path` replaced.
 *
 *  Example: `editTemplateFile(files, 'a.js', 'lorkarium.ready();')` */
export function editTemplateFile(
  files: readonly TemplateFile[],
  path: string,
  content: string,
): readonly TemplateFile[] {
  return files.map((file) => (file.path === path ? { path, content } : file));
}

/** Whether two lists hold the same files, with the same text, in the same order.
 *
 *  Example: `sameTemplateFiles(base.files, draft.files)` */
export function sameTemplateFiles(
  left: readonly TemplateFile[],
  right: readonly TemplateFile[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((file, at) => {
    const other = right[at];
    return other !== undefined && other.path === file.path && other.content === file.content;
  });
}

/** The three files an old single-source template (or a `.lksheet` of the first format) becomes,
 *  the same names the server migration gave the saved ones.
 *
 *  Example: `filesOfLegacySource({ html, css, js })[2] // { path: 'script.js', content: js }` */
export function filesOfLegacySource(
  source: Readonly<{ html: string; css: string; js: string }>,
): readonly TemplateFile[] {
  return [
    { path: SHEET_TEMPLATE_ENTRY_PATH, content: source.html },
    { path: 'style.css', content: source.css },
    { path: 'script.js', content: source.js },
  ];
}
