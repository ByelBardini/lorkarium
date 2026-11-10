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
import { tormentaFiles, tormentaTemplate, withContent } from '../support/sheet-template-fixtures';

const EXPORTED_AT = new Date('2026-10-31T12:00:00.000Z');
const LORK_MANIFEST = {
  permissions: ['character:stats' as const, 'sheet:images' as const],
  bars: [{ label: 'HP', color: 'ember' as const, max: 12 }],
  assets: [],
};
const LORK_FILES = [
  { path: 'index.html', content: '<lk-include src="paginas/perfil.html">' },
  { path: 'paginas/perfil.html', content: '<h2>Perfil</h2>' },
  { path: 'estilo.css', content: 'h2 { color: gold; }' },
  { path: 'b.js', content: 'b();' },
  { path: 'a.js', content: 'lorkarium.ready();' },
];
const LEGACY_CODE = {
  html: '<p id="pv">PV</p>',
  css: 'p { color: red; }',
  js: 'lorkarium.ready();',
};

// A `.lksheet` of the first format: one html, css and js.
function envelope(overrides: Record<string, unknown> = {}): string {
  const file = { format: 'lorkarium.sheet-template', formatVersion: 1, name: 'Ficha Tormenta' };
  return JSON.stringify({ ...file, ...LEGACY_CODE, ...overrides });
}

function scriptOf(template: Readonly<{ files: readonly { path: string; content: string }[] }>) {
  return template.files.find(({ path }) => path === 'script.js')?.content;
}

describe('sheet template file text', () => {
  it('reads back the exported files in order, the name and the manifest', () => {
    const lork = tormentaTemplate({ files: LORK_FILES, manifest: LORK_MANIFEST });
    expect(readSheetTemplateFile(sheetTemplateFileText(lork, EXPORTED_AT))).toEqual({
      ok: true,
      template: { name: 'Ficha Tormenta', files: LORK_FILES, manifest: LORK_MANIFEST },
    });
  });

  it('writes the files and the manifest into the file, not html, css or js', () => {
    const file: unknown = JSON.parse(
      sheetTemplateFileText(tormentaTemplate({ manifest: LORK_MANIFEST }), EXPORTED_AT),
    );
    expect(file).toMatchObject({ manifest: LORK_MANIFEST, files: tormentaTemplate().files });
    expect(file).not.toHaveProperty('html');
  });

  it('a file of the first format becomes index.html, style.css and script.js', () => {
    expect(readSheetTemplateFile(envelope())).toEqual({
      ok: true,
      template: {
        name: 'Ficha Tormenta',
        files: [
          { path: 'index.html', content: LEGACY_CODE.html },
          { path: 'style.css', content: LEGACY_CODE.css },
          { path: 'script.js', content: LEGACY_CODE.js },
        ],
        manifest: { permissions: [], bars: [], assets: [] },
      },
    });
  });

  it('a file of the first format keeps its manifest', () => {
    const reading = readSheetTemplateFile(envelope({ manifest: LORK_MANIFEST }));
    expect(reading.ok && reading.template.manifest).toEqual(LORK_MANIFEST);
  });

  it('carries the format, its version 2 and the export date, never the template id or version', () => {
    const file: unknown = JSON.parse(sheetTemplateFileText(tormentaTemplate(), EXPORTED_AT));
    expect(file).toMatchObject({
      format: 'lorkarium.sheet-template',
      formatVersion: 2,
      exportedAt: '2026-10-31T12:00:00.000Z',
    });
    expect(file).not.toHaveProperty('id');
    expect(file).not.toHaveProperty('version');
  });

  it('keeps a js with a closing script tag and quotes identical', () => {
    const js = 'const s = "</script>"; lorkarium.ready();';
    const files = withContent(tormentaFiles(), 'script.js', js);
    const reading = readSheetTemplateFile(sheetTemplateFileText(tormentaTemplate({ files })));
    expect(reading.ok && scriptOf(reading.template)).toBe(js);
  });

  it('reads a file that starts with a UTF-8 BOM', () =>
    expect(readSheetTemplateFile(`${String.fromCharCode(0xfeff)}${envelope()}`).ok).toBe(true));
});

describe('sheet template file assets', () => {
  const FONT_ID = '00000000-0000-4000-8000-000000000001';
  const font = { path: 'fontes/x.woff2', type: 'font/woff2' as const, data: 'd09GMg==' };

  it('carries the bytes of the assets and leaves the manifest ids of this table out', () => {
    const manifest = { ...LORK_MANIFEST, assets: [{ path: font.path, assetId: FONT_ID }] };
    const text = sheetTemplateFileText(
      { ...tormentaTemplate({ manifest }), assets: [font] },
      EXPORTED_AT,
    );
    const file: unknown = JSON.parse(text);
    expect(file).toMatchObject({ assets: [font], manifest: { assets: [] } });
    expect(text).not.toContain(FONT_ID);
  });

  it('reads the assets back with the template', () => {
    const text = sheetTemplateFileText({ ...tormentaTemplate(), assets: [font] });
    const reading = readSheetTemplateFile(text);
    expect(reading.ok && reading.template.assets).toEqual([font]);
  });

  it('a file without assets reads with none and writes none', () => {
    const text = sheetTemplateFileText(tormentaTemplate());
    expect(JSON.parse(text)).not.toHaveProperty('assets');
    const reading = readSheetTemplateFile(text);
    expect(reading.ok && reading.template).not.toHaveProperty('assets');
  });

  it('assets past 8 MiB are over_budget', () => {
    const huge = { ...font, data: 'A'.repeat((Math.ceil((8 * 1024 * 1024) / 3) + 1) * 4) };
    const text = sheetTemplateFileText({ ...tormentaTemplate(), assets: [huge] });
    expect(readSheetTemplateFile(text)).toEqual({ ok: false, problem: 'over_budget' });
  });
});

describe('sheet template file refusals', () => {
  it('a text that is not JSON is not_json', () =>
    expect(readSheetTemplateFile('não é json')).toEqual({ ok: false, problem: 'not_json' }));

  it('JSON without the format is not_lksheet', () =>
    expect(readSheetTemplateFile('{"a":1}')).toEqual({ ok: false, problem: 'not_lksheet' }));

  it('a newer format version is newer_version', () =>
    expect(readSheetTemplateFile(envelope({ formatVersion: 3, extra: 1 }))).toEqual({
      ok: false,
      problem: 'newer_version',
    }));

  it('a manifest with an unknown permission or a repeated bar is invalid, not over_budget', () => {
    const repeated = [
      { label: 'HP', color: 'ember', max: 12 },
      { label: 'hp', color: 'gold', max: 3 },
    ];
    expect(readSheetTemplateFile(envelope({ manifest: { permissions: ['network'] } }))).toEqual({
      ok: false,
      problem: 'invalid',
    });
    expect(readSheetTemplateFile(envelope({ manifest: { bars: repeated } }))).toEqual({
      ok: false,
      problem: 'invalid',
    });
  });

  it('code beyond 512 KiB is over_budget', () =>
    expect(
      readSheetTemplateFile(envelope({ js: 'j'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES + 1) })),
    ).toEqual({ ok: false, problem: 'over_budget' }));

  it('files of the second format past 512 KiB are over_budget', () => {
    const files = [
      { path: 'index.html', content: 'h'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES + 1) },
    ];
    const text = sheetTemplateFileText(tormentaTemplate({ files }));
    expect(readSheetTemplateFile(text)).toEqual({ ok: false, problem: 'over_budget' });
  });

  it('a file of the first format without js is invalid', () =>
    expect(readSheetTemplateFile(envelope({ js: undefined }))).toEqual({
      ok: false,
      problem: 'invalid',
    }));

  it('a file of the second format with a path that leaves the template or no index.html is invalid', () => {
    const outside = [...tormentaFiles(), { path: '../x.js', content: '' }];
    const noEntry = tormentaFiles().slice(1);
    for (const files of [outside, noEntry])
      expect(readSheetTemplateFile(sheetTemplateFileText(tormentaTemplate({ files })))).toEqual({
        ok: false,
        problem: 'invalid',
      });
  });
});

describe('sheet template file name and size', () => {
  it('swaps the characters Windows refuses for a dash', () =>
    expect(sheetTemplateFileName('Ficha: "Tormenta"?')).toBe('Ficha- -Tormenta--.lksheet'));

  it('falls back to a default name when nothing is left', () =>
    expect(sheetTemplateFileName('<>:"/\\|?*')).toBe('modelo-de-ficha.lksheet'));

  it('a file of 12 MiB fits and one byte more is too large', () => {
    expect(sheetTemplateFileTooLarge(SHEET_TEMPLATE_FILE_MAX_BYTES)).toBe(false);
    expect(sheetTemplateFileTooLarge(SHEET_TEMPLATE_FILE_MAX_BYTES + 1)).toBe(true);
  });
});
