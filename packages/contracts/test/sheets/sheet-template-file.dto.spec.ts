import { describe, expect, it } from 'vitest';
import {
  SHEET_TEMPLATE_FILE_FORMAT,
  SHEET_TEMPLATE_FILE_LEGACY_VERSION,
  SHEET_TEMPLATE_FILE_VERSION,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  sheetTemplateFileDto,
  sheetTemplateFileHeaderDto,
  sheetTemplateFileV1Dto,
} from '../../src';

const quarter = SHEET_TEMPLATE_SOURCE_MAX_BYTES / 4;
const header = { format: 'lorkarium.sheet-template', formatVersion: 1 };
const files = [
  { path: 'index.html', content: '<p id="pv">PV</p>' },
  { path: 'paginas/perfil.html', content: '<h2>Perfil</h2>' },
  { path: 'a.js', content: 'lorkarium.ready()' },
];
const tormentaV2 = {
  format: 'lorkarium.sheet-template',
  formatVersion: 2,
  exportedAt: '2026-11-10T12:00:00.000Z',
  name: ' Ficha Tormenta ',
  files,
  manifest: { permissions: ['sheet:images'], bars: [] },
};
const tormenta = {
  ...header,
  exportedAt: '2026-10-31T12:00:00.000Z',
  name: '  Ficha Tormenta ',
  html: '<p id="pv">PV</p>',
  css: 'p{color:red}',
  js: 'lorkarium.ready()',
};

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

function fileOf(bytes: number): typeof tormenta {
  const js = 'j'.repeat(bytes - 2 * quarter - 4);
  return { ...tormenta, html: 'ç'.repeat(quarter / 2), css: 'c'.repeat(quarter + 4), js };
}

describe('sheet template file, format 2', () => {
  it('names the format, its version and the legacy one', () => {
    expect(SHEET_TEMPLATE_FILE_FORMAT).toBe('lorkarium.sheet-template');
    expect(SHEET_TEMPLATE_FILE_VERSION).toBe(2);
    expect(SHEET_TEMPLATE_FILE_LEGACY_VERSION).toBe(1);
  });
  it('keeps the files in order, the manifest and a trimmed name', () =>
    expect(sheetTemplateFileDto.parse(tormentaV2)).toMatchObject({
      name: 'Ficha Tormenta',
      files,
      manifest: { permissions: ['sheet:images'], bars: [] },
    }));
  it('reads a missing manifest as one that declares nothing', () =>
    expect(
      sheetTemplateFileDto.parse({ ...tormentaV2, manifest: undefined }).manifest,
    ).toMatchObject({ permissions: [], bars: [] }));
  it('refuses the old html, css and js fields and files without index.html', () => {
    expect(sheetTemplateFileDto.safeParse({ ...tormentaV2, html: '' }).success).toBe(false);
    const withoutIndex = { ...tormentaV2, files: files.slice(1) };
    expect(issueOf(sheetTemplateFileDto.safeParse(withoutIndex))).toContain('no index.html');
  });
  it('refuses a version 1 body, citing the version', () =>
    expect(issueOf(sheetTemplateFileDto.safeParse({ ...tormentaV2, formatVersion: 1 }))).toBe(
      'formatVersion 1; expected 2',
    ));
});

describe('sheet template file, format 1', () => {
  const sheetTemplateFileDto = sheetTemplateFileV1Dto;
  it('accepts the template, trims its name and reads a missing manifest as empty', () =>
    expect(sheetTemplateFileDto.parse(tormenta)).toMatchObject({
      ...tormenta,
      name: 'Ficha Tormenta',
      manifest: { permissions: [], bars: [] },
    }));
  it('keeps the manifest of the file', () => {
    const manifest = {
      permissions: ['sheet:images'],
      bars: [{ label: 'MP', color: 'steel', max: 6 }],
    };
    expect(sheetTemplateFileDto.parse({ ...tormenta, manifest }).manifest).toMatchObject(manifest);
  });
  it('refuses a file whose manifest declares an unknown permission', () =>
    expect(
      issueOf(
        sheetTemplateFileDto.safeParse({ ...tormenta, manifest: { permissions: ['network'] } }),
      ),
    ).toContain('permission "network"'));
  it('accepts a file without exportedAt', () => {
    const withoutDate = { ...tormenta, exportedAt: undefined };
    expect(issueOf(sheetTemplateFileDto.safeParse(withoutDate))).toBe('accepted');
  });
  it('accepts code of exactly 512 KiB counting accents as 2 bytes and refuses one byte more', () => {
    const max = SHEET_TEMPLATE_SOURCE_MAX_BYTES;
    expect(issueOf(sheetTemplateFileDto.safeParse(fileOf(max)))).toBe('accepted');
    expect(issueOf(sheetTemplateFileDto.safeParse(fileOf(max + 1)))).toBe(
      'html + css + js have 524289 bytes; expected at most 524288',
    );
  });
  it('accepts a name of 60 characters and refuses 61', () => {
    expect(sheetTemplateFileDto.safeParse({ ...tormenta, name: 'n'.repeat(60) }).success).toBe(
      true,
    );
    expect(sheetTemplateFileDto.safeParse({ ...tormenta, name: 'n'.repeat(61) }).success).toBe(
      false,
    );
  });
  it('refuses another format citing the value received', () =>
    expect(issueOf(sheetTemplateFileDto.safeParse({ ...tormenta, format: 'outra.coisa' }))).toBe(
      'format "outra.coisa"; expected lorkarium.sheet-template',
    ));
  it('lets a newer version through the header and refuses it in the strict body', () => {
    const newer = { ...tormenta, formatVersion: 3, extra: true };
    expect(sheetTemplateFileHeaderDto.parse(newer)).toEqual({ ...header, formatVersion: 3 });
    expect(issueOf(sheetTemplateFileDto.safeParse({ ...tormenta, formatVersion: 2 }))).toBe(
      'formatVersion 2; expected 1',
    );
  });
  it('refuses a header without the format or with a version below 1', () => {
    expect(sheetTemplateFileHeaderDto.safeParse({ a: 1 }).success).toBe(false);
    expect(sheetTemplateFileHeaderDto.safeParse({ ...header, formatVersion: 0 }).success).toBe(
      false,
    );
  });
  it('refuses a field beyond the template, such as sheet values', () =>
    expect(sheetTemplateFileDto.safeParse({ ...tormenta, values: { pv: 10 } }).success).toBe(
      false,
    ));
  it('refuses a file without js or with html that is not a string', () => {
    const withoutJs = { ...tormenta, js: undefined };
    expect(sheetTemplateFileDto.safeParse(withoutJs).success).toBe(false);
    expect(sheetTemplateFileDto.safeParse({ ...tormenta, html: 42 }).success).toBe(false);
  });
});
