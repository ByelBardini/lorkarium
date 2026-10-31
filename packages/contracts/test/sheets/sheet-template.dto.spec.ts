import { describe, expect, it } from 'vitest';
import {
  createSheetTemplateRequestDto,
  SHEET_TEMPLATE_SOURCE_MAX_BYTES,
  sheetTemplateSummaryDto,
  updateSheetTemplateRequestDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const quarter = SHEET_TEMPLATE_SOURCE_MAX_BYTES / 4;
const emptySource = { html: '', css: '', js: '' };

function sourceOf(bytes: number): { html: string; css: string; js: string } {
  return {
    html: 'h'.repeat(quarter),
    css: 'c'.repeat(quarter),
    js: 'j'.repeat(bytes - 2 * quarter),
  };
}

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

describe('sheet template creation', () => {
  it('trims the name and keeps the three sources', () =>
    expect(
      createSheetTemplateRequestDto.parse({
        name: '  Ficha Tormenta ',
        html: '<p>PV</p>',
        css: 'p{}',
        js: 'lorkarium.ready()',
      }),
    ).toEqual({ name: 'Ficha Tormenta', html: '<p>PV</p>', css: 'p{}', js: 'lorkarium.ready()' }));
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
  it('accepts html + css + js of exactly 512 KiB and refuses one byte more', () => {
    const max = SHEET_TEMPLATE_SOURCE_MAX_BYTES;
    expect(issueOf(createSheetTemplateRequestDto.safeParse(sourceOf(max)))).toBe('accepted');
    expect(issueOf(createSheetTemplateRequestDto.safeParse(sourceOf(max + 1)))).toBe(
      'html + css + js have 524289 bytes; expected at most 524288',
    );
  });
  it('counts multi-byte characters by their UTF-8 size', () =>
    expect(
      issueOf(
        createSheetTemplateRequestDto.safeParse({
          html: 'ç'.repeat(SHEET_TEMPLATE_SOURCE_MAX_BYTES / 2 + 1),
          css: '',
          js: '',
        }),
      ),
    ).toContain('expected at most 524288'));
  it('refuses a template without js', () =>
    expect(createSheetTemplateRequestDto.safeParse({ html: '', css: '' }).success).toBe(false));
});

describe('sheet template update', () => {
  it('accepts the three sources together and a move to the root', () =>
    expect(
      updateSheetTemplateRequestDto.parse({ expectedVersion: 3, folderId: null, ...emptySource }),
    ).toEqual({ expectedVersion: 3, folderId: null, html: '', css: '', js: '' }));
  it('refuses only part of the source, naming what came', () =>
    expect(issueOf(updateSheetTemplateRequestDto.safeParse({ expectedVersion: 3, js: 'x' }))).toBe(
      'source has only js; expected html, css and js together',
    ));
  it('refuses an update with nothing to change', () =>
    expect(issueOf(updateSheetTemplateRequestDto.safeParse({ expectedVersion: 3 }))).toBe(
      'changes is empty; expected at least one of name, folderId, html, css, js',
    ));
  it('refuses source over the budget', () =>
    expect(
      updateSheetTemplateRequestDto.safeParse({
        expectedVersion: 0,
        ...sourceOf(SHEET_TEMPLATE_SOURCE_MAX_BYTES + 1),
      }).success,
    ).toBe(false));
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
