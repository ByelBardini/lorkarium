import {
  SHEET_TEMPLATE_FILE_MAX_BYTES,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
} from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  readSheetTemplateFile,
  sheetTemplateFileName,
  sheetTemplateFileText,
  sheetTemplateFileTooLarge,
} from '@/lib/sheet-template-file';
import { tormentaTemplate } from '../support/sheet-template-fixtures';

const EXPORTED_AT = new Date('2026-10-31T12:00:00.000Z');

function envelope(overrides: Record<string, unknown> = {}): string {
  const { name, html, css, js } = tormentaTemplate();
  const file = { format: 'lorkarium.sheet-template', formatVersion: 1, name, html, css, js };
  return JSON.stringify({ ...file, ...overrides });
}

describe('sheet template file text', () => {
  it('reads back the exported template with the same name and code', () => {
    const { name, html, css, js } = tormentaTemplate();
    expect(readSheetTemplateFile(sheetTemplateFileText(tormentaTemplate(), EXPORTED_AT))).toEqual({
      ok: true,
      template: { name, html, css, js },
    });
  });

  it('carries the format, its version and the export date, never the template id or version', () => {
    const file: unknown = JSON.parse(sheetTemplateFileText(tormentaTemplate(), EXPORTED_AT));
    expect(file).toMatchObject({
      format: 'lorkarium.sheet-template',
      formatVersion: 1,
      exportedAt: '2026-10-31T12:00:00.000Z',
    });
    expect(file).not.toHaveProperty('id');
    expect(file).not.toHaveProperty('version');
  });

  it('keeps a js with a closing script tag and quotes identical', () => {
    const js = 'const s = "</script>"; lorkarium.ready();';
    const reading = readSheetTemplateFile(sheetTemplateFileText(tormentaTemplate({ js })));
    expect(reading.ok && reading.template.js).toBe(js);
  });

  it('reads a file that starts with a UTF-8 BOM', () =>
    expect(readSheetTemplateFile(`FEFF${envelope()}`).ok).toBe(true));
});

describe('sheet template file refusals', () => {
  it('a text that is not JSON is not_json', () =>
    expect(readSheetTemplateFile('não é json')).toEqual({ ok: false, problem: 'not_json' }));

  it('JSON without the format is not_lksheet', () =>
    expect(readSheetTemplateFile('{"a":1}')).toEqual({ ok: false, problem: 'not_lksheet' }));

  it('a newer format version is newer_version', () =>
    expect(readSheetTemplateFile(envelope({ formatVersion: 2, extra: 1 }))).toEqual({
      ok: false,
      problem: 'newer_version',
    }));

  it('code beyond 512 KiB is over_budget', () =>
    expect(
      readSheetTemplateFile(envelope({ js: 'j'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES + 1) })),
    ).toEqual({ ok: false, problem: 'over_budget' }));

  it('a file without js is invalid', () =>
    expect(readSheetTemplateFile(envelope({ js: undefined }))).toEqual({
      ok: false,
      problem: 'invalid',
    }));
});

describe('sheet template file name and size', () => {
  it('swaps the characters Windows refuses for a dash', () =>
    expect(sheetTemplateFileName('Ficha: "Tormenta"?')).toBe('Ficha- -Tormenta--.lksheet'));

  it('falls back to a default name when nothing is left', () =>
    expect(sheetTemplateFileName('<>:"/\\|?*')).toBe('modelo-de-ficha.lksheet'));

  it('a file of 2 MiB fits and one byte more is too large', () => {
    expect(sheetTemplateFileTooLarge(SHEET_TEMPLATE_FILE_MAX_BYTES)).toBe(false);
    expect(sheetTemplateFileTooLarge(SHEET_TEMPLATE_FILE_MAX_BYTES + 1)).toBe(true);
  });
});
