import { describe, expect, it } from 'vitest';
import {
  toSheetTemplateChangesPo,
  toSheetTemplateCodeDto,
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

  it('the code a sheet runs is the name, the version and the three sources', () => {
    expect(toSheetTemplateCodeDto(sheetTemplatePo({ js: 'x()' }))).toEqual({
      name: 'Ficha Tormenta',
      version: 0,
      html: '<p id="pv"></p>',
      css: 'p { color: red; }',
      js: 'x()',
    });
  });

  it('only the keys that came become changes; folderId null stays as the root', () => {
    expect(toSheetTemplateChangesPo({ expectedVersion: 1, folderId: null })).toEqual({
      folderId: null,
    });
    expect(
      toSheetTemplateChangesPo({ expectedVersion: 1, name: 'A', html: 'h', css: 'c', js: 'j' }),
    ).toEqual({ name: 'A', html: 'h', css: 'c', js: 'j' });
  });
});
