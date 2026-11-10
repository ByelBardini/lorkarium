import { SHEET_TEMPLATE_FILES_MAX } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  addTemplateFile,
  editTemplateFile,
  filesOfLegacySource,
  moveTemplateFile,
  removeTemplateFile,
  renameTemplateFile,
  sameTemplateFiles,
  templateFilesBytes,
  type TemplateFile,
} from '@/lib/sheet-template-files';

const FILES: readonly TemplateFile[] = [
  { path: 'index.html', content: '<p></p>' },
  { path: 'estilo.css', content: 'p{}' },
  { path: 'a.js', content: 'a();' },
];

function pathsOf(change: ReturnType<typeof addTemplateFile>): string[] | string {
  return change.ok ? change.files.map(({ path }) => path) : change.problem;
}

describe('addTemplateFile', () => {
  it('adds an empty file at the end', () => {
    const change = addTemplateFile(FILES, 'paginas/perfil.html');
    expect(pathsOf(change)).toEqual(['index.html', 'estilo.css', 'a.js', 'paginas/perfil.html']);
    expect(change.ok && change.files.at(-1)?.content).toBe('');
  });
  it('refuses a path the contract refuses and one already taken ignoring case', () => {
    expect(pathsOf(addTemplateFile(FILES, '../x.js'))).toBe('invalid_path');
    expect(pathsOf(addTemplateFile(FILES, 'A.js'))).toBe('repeated_path');
  });
  it(`refuses a file past ${SHEET_TEMPLATE_FILES_MAX}`, () => {
    const full = Array.from({ length: SHEET_TEMPLATE_FILES_MAX }, (_, at) => ({
      path: `s${at}.js`,
      content: '',
    }));
    expect(pathsOf(addTemplateFile(full, 'mais.js'))).toBe('too_many');
  });
});

describe('renameTemplateFile', () => {
  it('renames in place and keeps the text', () => {
    const change = renameTemplateFile(FILES, 'a.js', 'scripts/a.js');
    expect(change.ok && change.files[2]).toEqual({ path: 'scripts/a.js', content: 'a();' });
  });
  it('a file may change only the case of its own name', () =>
    expect(pathsOf(renameTemplateFile(FILES, 'a.js', 'A.js'))).toEqual([
      'index.html',
      'estilo.css',
      'A.js',
    ]));
  it('refuses renaming index.html and renaming over another file', () => {
    expect(pathsOf(renameTemplateFile(FILES, 'index.html', 'inicio.html'))).toBe('entry_page');
    expect(pathsOf(renameTemplateFile(FILES, 'a.js', 'Estilo.css'))).toBe('repeated_path');
    expect(pathsOf(renameTemplateFile(FILES, 'estilo.css', 'ESTILO.css'))).toEqual([
      'index.html',
      'ESTILO.css',
      'a.js',
    ]);
  });
});

describe('removeTemplateFile and moveTemplateFile', () => {
  it('removes a file but never index.html', () => {
    expect(pathsOf(removeTemplateFile(FILES, 'estilo.css'))).toEqual(['index.html', 'a.js']);
    expect(pathsOf(removeTemplateFile(FILES, 'index.html'))).toBe('entry_page');
  });
  it('moves a file up and down, held at the ends', () => {
    const paths = (files: readonly TemplateFile[]): string[] => files.map(({ path }) => path);
    expect(paths(moveTemplateFile(FILES, 'a.js', -1))).toEqual([
      'index.html',
      'a.js',
      'estilo.css',
    ]);
    expect(paths(moveTemplateFile(FILES, 'index.html', -1))).toEqual(paths(FILES));
    expect(paths(moveTemplateFile(FILES, 'index.html', 5))).toEqual([
      'estilo.css',
      'a.js',
      'index.html',
    ]);
    expect(moveTemplateFile(FILES, 'sumiu.js', 1)).toBe(FILES);
  });
});

describe('the text of the files', () => {
  it('edits one file and leaves the others', () =>
    expect(editTemplateFile(FILES, 'a.js', 'b();')).toEqual([
      FILES[0],
      FILES[1],
      { path: 'a.js', content: 'b();' },
    ]));
  it('counts UTF-8 bytes of every file', () =>
    expect(
      templateFilesBytes([
        { path: 'index.html', content: 'é€' },
        { path: 'a.js', content: 'a' },
      ]),
    ).toBe(6));
  it('the same files in another order are not the same', () => {
    expect(sameTemplateFiles(FILES, [...FILES])).toBe(true);
    expect(sameTemplateFiles(FILES, [...FILES].reverse())).toBe(false);
    expect(sameTemplateFiles(FILES, editTemplateFile(FILES, 'a.js', 'x'))).toBe(false);
  });
  it('an old single source becomes index.html, style.css and script.js', () =>
    expect(filesOfLegacySource({ html: 'h', css: 'c', js: 'j' })).toEqual([
      { path: 'index.html', content: 'h' },
      { path: 'style.css', content: 'c' },
      { path: 'script.js', content: 'j' },
    ]));
});
