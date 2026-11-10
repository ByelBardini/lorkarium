import { describe, expect, it } from 'vitest';
import {
  SHEET_TEMPLATE_ASSETS_MAX_BYTES,
  SHEET_TEMPLATE_FILE_MAX_BYTES,
  sheetTemplateAssetDto,
  sheetTemplateFileAssetDto,
  sheetTemplateFileDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const v2 = {
  format: 'lorkarium.sheet-template',
  formatVersion: 2,
  name: 'Ficha de Lork',
  files: [{ path: 'index.html', content: '<p></p>' }],
};

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

// base64 data that decodes to `bytes` bytes, padded as base64 pads.
function dataOf(bytes: number): string {
  const tail = ['', 'AA==', 'AAA='][bytes % 3] ?? '';
  return 'A'.repeat(Math.floor(bytes / 3) * 4) + tail;
}

describe('template asset answer', () => {
  it('a woff2 font carries its size and no pixels', () =>
    expect(sheetTemplateAssetDto.parse({ id, mimeType: 'font/woff2', sizeBytes: 41_220 })).toEqual({
      id,
      mimeType: 'font/woff2',
      sizeBytes: 41_220,
    }));
  it('refuses a GIF or a TTF type citing it', () => {
    expect(
      issueOf(sheetTemplateAssetDto.safeParse({ id, mimeType: 'font/ttf', sizeBytes: 1 })),
    ).toContain('asset type "font/ttf"');
    expect(
      sheetTemplateAssetDto.safeParse({ id, mimeType: 'image/gif', sizeBytes: 1 }).success,
    ).toBe(false);
  });
});

describe('assets inside a .lksheet', () => {
  it('keeps each asset path, type and base64 bytes, and reads a file without them as none', () => {
    const asset = { path: 'img/brasao.png', type: 'image/png', data: 'iVBORw==' };
    expect(sheetTemplateFileDto.parse({ ...v2, assets: [asset] }).assets).toEqual([asset]);
    expect(sheetTemplateFileDto.parse(v2).assets).toEqual([]);
  });
  it('refuses data that is not base64', () =>
    expect(
      issueOf(
        sheetTemplateFileAssetDto.safeParse({ path: 'a.png', type: 'image/png', data: 'não!' }),
      ),
    ).toContain('not base64'));
  it('accepts 8 MiB of assets in total and refuses one byte more', () => {
    const first = 3_000_000;
    const assets = (extra: number) => [
      { path: 'a.png', type: 'image/png', data: dataOf(first) },
      {
        path: 'b.png',
        type: 'image/png',
        data: dataOf(SHEET_TEMPLATE_ASSETS_MAX_BYTES - first + extra),
      },
    ];
    expect(issueOf(sheetTemplateFileDto.safeParse({ ...v2, assets: assets(0) }))).toBe('accepted');
    expect(issueOf(sheetTemplateFileDto.safeParse({ ...v2, assets: assets(1) }))).toBe(
      `assets have ${SHEET_TEMPLATE_ASSETS_MAX_BYTES + 1} bytes; expected at most ${SHEET_TEMPLATE_ASSETS_MAX_BYTES}`,
    );
  });
  it('refuses two assets with the same path ignoring case', () => {
    const asset = { path: 'img/a.png', type: 'image/png', data: 'iVBORw==' };
    expect(
      issueOf(
        sheetTemplateFileDto.safeParse({ ...v2, assets: [asset, { ...asset, path: 'IMG/a.png' }] }),
      ),
    ).toContain('asset paths "img/a.png" and "IMG/a.png" repeat');
  });
  it('the file may reach 12 MiB', () =>
    expect(SHEET_TEMPLATE_FILE_MAX_BYTES).toBe(12 * 1024 * 1024));
});
