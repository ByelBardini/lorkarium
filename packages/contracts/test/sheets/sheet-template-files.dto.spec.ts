import { describe, expect, it } from 'vitest';
import {
  SHEET_TEMPLATE_FILES_MAX,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  sheetTemplateFileKindOf,
  sheetTemplateFilesDto,
} from '../../src';

const index = { path: 'index.html', content: '<p>PV</p>' };
const fiveFiles = [
  index,
  { path: 'paginas/perfil.html', content: '<h2>Perfil</h2>' },
  { path: 'estilo.css', content: 'p{}' },
  { path: 'a.js', content: 'lorkarium.ready()' },
  { path: 'b.js', content: '' },
];

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

function filesOf(bytes: number): { path: string; content: string }[] {
  const half = SHEET_TEMPLATE_SOURCE_MAX_BYTES / 2;
  return [
    { path: 'index.html', content: 'ç'.repeat(half / 2) },
    { path: 'a.js', content: 'j'.repeat(bytes - half) },
  ];
}

describe('template files', () => {
  it('keeps pages, styles and scripts in the order they came', () =>
    expect(sheetTemplateFilesDto.parse(fiveFiles)).toEqual(fiveFiles));
  it('accepts 512 KiB in total counting accents as 2 bytes and refuses one byte more', () => {
    const max = SHEET_TEMPLATE_SOURCE_MAX_BYTES;
    expect(issueOf(sheetTemplateFilesDto.safeParse(filesOf(max)))).toBe('accepted');
    expect(issueOf(sheetTemplateFilesDto.safeParse(filesOf(max + 1)))).toBe(
      'files have 524289 bytes; expected at most 524288',
    );
  });
  it('refuses a template without index.html', () =>
    expect(issueOf(sheetTemplateFilesDto.safeParse([{ path: 'a.js', content: '' }]))).toBe(
      'files have no index.html; expected the entry page index.html',
    ));
  it('refuses an empty list', () =>
    expect(issueOf(sheetTemplateFilesDto.safeParse([]))).toContain('files is empty'));
  it.each([
    '../a.js',
    '/a.js',
    'paginas\\a.html',
    'minha ficha.html',
    'a.ts',
    'a',
    'a//b.js',
    '.a.js',
    'paginas/../a.js',
    'A.JS',
  ])('refuses the path %s citing it', (path) =>
    expect(issueOf(sheetTemplateFilesDto.safeParse([index, { path, content: '' }]))).toContain(
      `file path ${JSON.stringify(path)}`,
    ),
  );
  it('refuses a path longer than 120 characters', () =>
    expect(
      sheetTemplateFilesDto.safeParse([index, { path: `${'a'.repeat(118)}.js`, content: '' }])
        .success,
    ).toBe(false));
  it('refuses a path that repeats ignoring case, naming both', () =>
    expect(
      issueOf(
        sheetTemplateFilesDto.safeParse([
          index,
          { path: 'Estilo.css', content: '' },
          { path: 'estilo.css', content: '' },
        ]),
      ),
    ).toBe(
      'file paths "Estilo.css" and "estilo.css" repeat; expected distinct paths, ignoring case',
    ));
  it('accepts 64 files and refuses 65', () => {
    const scripts = (count: number): { path: string; content: string }[] =>
      Array.from({ length: count }, (_, at) => ({ path: `s${at}.js`, content: '' }));
    expect(
      sheetTemplateFilesDto.safeParse([index, ...scripts(SHEET_TEMPLATE_FILES_MAX - 1)]).success,
    ).toBe(true);
    expect(
      issueOf(sheetTemplateFilesDto.safeParse([index, ...scripts(SHEET_TEMPLATE_FILES_MAX)])),
    ).toBe('files has 65; expected at most 64');
  });
  it('refuses a field beyond path and content', () =>
    expect(sheetTemplateFilesDto.safeParse([{ ...index, kind: 'html' }]).success).toBe(false));
});

describe('template file kind', () => {
  it('reads the language from the extension', () => {
    expect(sheetTemplateFileKindOf('paginas/perfil.html')).toBe('html');
    expect(sheetTemplateFileKindOf('estilo.css')).toBe('css');
    expect(sheetTemplateFileKindOf('scripts/a.js')).toBe('js');
  });
  it('throws citing a path of another extension', () =>
    expect(() => sheetTemplateFileKindOf('a.ts')).toThrow('file path "a.ts"'));
});
