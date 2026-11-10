import { describe, expect, it } from 'vitest';
import {
  toSheetTemplateChangesPo,
  toSheetTemplateCodeDto,
  toSheetTemplateDto,
  toSheetTemplateSummaryDto,
} from '../../../src/modules/sheets/sheet-templates.mapper';
import { TORMENTA_ID, sheetTemplatePo } from '../../support/sheet-templates-fakes';

describe('sheet templates mapper', () => {
  it('the library row carries no code and the time as ISO', () => {
    expect(toSheetTemplateSummaryDto(sheetTemplatePo({ version: 4 }))).toEqual({
      id: TORMENTA_ID,
      folderId: null,
      name: 'Ficha Tormenta',
      version: 4,
      updatedAt: '2026-10-31T12:00:00.000Z',
    });
  });

  it('the code a sheet runs is the name, the version, the files in order and the manifest', () => {
    const manifest = { permissions: ['character:portrait'], bars: [], assets: [] };
    const files = [
      { path: 'index.html', content: '<p id="pv"></p>' },
      { path: 'b.js', content: 'x()' },
      { path: 'a.js', content: '' },
    ];
    expect(toSheetTemplateCodeDto(sheetTemplatePo({ files, manifest }))).toEqual({
      name: 'Ficha Tormenta',
      version: 0,
      files,
      manifest,
    });
  });

  it('the files read are a copy: changing them leaves the row alone', () => {
    const row = sheetTemplatePo();
    const read = toSheetTemplateDto(row);
    read.files[0] = { path: 'index.html', content: 'mudou' };
    expect(row.files[0]?.content).toBe('<p id="pv"></p>');
  });

  it('a stored manifest missing a list reads it as empty', () => {
    const stored = { permissions: ['sheet:images'] } as unknown as {
      permissions: string[];
      bars: [];
    };
    expect(toSheetTemplateDto(sheetTemplatePo({ manifest: stored })).manifest).toEqual({
      permissions: ['sheet:images'],
      bars: [],
      assets: [],
    });
  });

  it('only the keys that came become changes; folderId null stays as the root', () => {
    expect(toSheetTemplateChangesPo({ expectedVersion: 1, folderId: null })).toEqual({
      folderId: null,
    });
    expect(
      toSheetTemplateChangesPo({
        expectedVersion: 1,
        name: 'A',
        files: [{ path: 'index.html', content: 'h' }],
      }),
    ).toEqual({ name: 'A', files: [{ path: 'index.html', content: 'h' }] });
    expect(
      toSheetTemplateChangesPo({
        expectedVersion: 1,
        manifest: { permissions: [], bars: [], assets: [] },
      }),
    ).toEqual({ manifest: { permissions: [], bars: [], assets: [] } });
  });
});
