import { describe, expect, it } from 'vitest';
import {
  createSheetTemplateRequestDto,
  sheetTemplateCodeDto,
  sheetTemplateDto,
  sheetTemplateSummaryDto,
  updateSheetTemplateRequestDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const files = [
  { path: 'index.html', content: '<p>PV</p>' },
  { path: 'estilo.css', content: 'p{}' },
  { path: 'a.js', content: 'lorkarium.ready()' },
];
const emptySource = { files: [{ path: 'index.html', content: '' }] };
const statsManifest = { permissions: ['character:stats'], bars: [] };

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

describe('sheet template creation', () => {
  it('trims the name and keeps the files in order', () =>
    expect(createSheetTemplateRequestDto.parse({ name: '  Ficha Tormenta ', files })).toEqual({
      name: 'Ficha Tormenta',
      files,
    }));
  it('accepts a name of 60 characters and refuses 61 or a blank one', () => {
    const source = emptySource;
    expect(
      createSheetTemplateRequestDto.safeParse({ ...source, name: 'n'.repeat(60) }).success,
    ).toBe(true);
    expect(
      createSheetTemplateRequestDto.safeParse({ ...source, name: 'n'.repeat(61) }).success,
    ).toBe(false);
    expect(createSheetTemplateRequestDto.safeParse({ ...source, name: '   ' }).success).toBe(false);
  });
  it('refuses a template without files, and the old html, css and js fields', () => {
    expect(createSheetTemplateRequestDto.safeParse({}).success).toBe(false);
    const old = { html: '', css: '', js: '' };
    expect(createSheetTemplateRequestDto.safeParse({ ...emptySource, ...old }).success).toBe(false);
  });
  it('refuses files without index.html', () =>
    expect(
      issueOf(createSheetTemplateRequestDto.safeParse({ files: [{ path: 'a.js', content: '' }] })),
    ).toContain('no index.html'));
  it('keeps a declared manifest and leaves a missing one absent', () => {
    const declared = createSheetTemplateRequestDto.parse({
      ...emptySource,
      manifest: statsManifest,
    });
    expect(declared.manifest).toMatchObject(statsManifest);
    expect(createSheetTemplateRequestDto.parse(emptySource).manifest).toBeUndefined();
  });
  it('refuses a manifest with an unknown permission', () =>
    expect(
      issueOf(
        createSheetTemplateRequestDto.safeParse({
          ...emptySource,
          manifest: { permissions: ['network'], bars: [] },
        }),
      ),
    ).toContain('permission "network"'));
});

describe('sheet template update', () => {
  it('accepts the files and a move to the root', () =>
    expect(
      updateSheetTemplateRequestDto.parse({ expectedVersion: 3, folderId: null, files }),
    ).toEqual({ expectedVersion: 3, folderId: null, files }));
  it('accepts the same files in another order as a change', () =>
    expect(
      updateSheetTemplateRequestDto.parse({ expectedVersion: 3, files: [...files].reverse() })
        .files?.[0]?.path,
    ).toBe('a.js'));
  it('refuses an update with nothing to change', () =>
    expect(issueOf(updateSheetTemplateRequestDto.safeParse({ expectedVersion: 3 }))).toBe(
      'changes is empty; expected at least one of name, folderId, files, manifest',
    ));
  it('accepts only the manifest as a change', () =>
    expect(
      updateSheetTemplateRequestDto.parse({ expectedVersion: 3, manifest: statsManifest }),
    ).toMatchObject({ expectedVersion: 3, manifest: statsManifest }));
  it('refuses a file path that leaves the template', () =>
    expect(
      issueOf(
        updateSheetTemplateRequestDto.safeParse({
          expectedVersion: 0,
          files: [...files, { path: '../x.js', content: '' }],
        }),
      ),
    ).toContain('file path "../x.js"'));
});

describe('sheet template summary', () => {
  it('refuses code in the library summary', () =>
    expect(
      sheetTemplateSummaryDto.safeParse({
        id,
        folderId: null,
        name: 'Ficha Tormenta',
        version: 0,
        updatedAt: '2026-10-31T12:00:00.000Z',
        js: 'x',
      }).success,
    ).toBe(false));
});

describe('sheet template with code', () => {
  const summary = {
    id,
    folderId: null,
    name: 'Ficha Tormenta',
    version: 3,
    updatedAt: '2026-10-31T12:00:00.000Z',
  };
  it('the editor read carries the manifest and refuses one without it', () => {
    const template = { ...summary, files, manifest: statsManifest };
    expect(sheetTemplateDto.parse(template).files).toEqual(files);
    expect(sheetTemplateDto.safeParse({ ...summary, ...emptySource }).success).toBe(false);
  });
  it('the code a sheet runs carries the manifest and refuses one without it', () => {
    const code = { name: 'Ficha Tormenta', version: 3, ...emptySource };
    expect(sheetTemplateCodeDto.parse({ ...code, manifest: statsManifest }).manifest).toMatchObject(
      statsManifest,
    );
    expect(sheetTemplateCodeDto.safeParse(code).success).toBe(false);
  });
});
