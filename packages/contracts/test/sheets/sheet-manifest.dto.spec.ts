import { describe, expect, it } from 'vitest';
import {
  emptySheetTemplateManifest,
  SHEET_MANIFEST_PERMISSIONS,
  sheetTemplateManifestDto,
} from '../../src';

function issueOf(parsed: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return parsed.success ? 'accepted' : (parsed.error?.issues[0]?.message ?? '');
}

function barsNamed(count: number): { label: string; color: 'gold'; max: number }[] {
  return Array.from({ length: count }, (_, index) => ({
    label: `B${index}`,
    color: 'gold',
    max: 5,
  }));
}

const lork = {
  permissions: ['character:stats', 'character:portrait', 'sheet:images'],
  bars: [{ label: 'HP', color: 'ember', max: 12 }],
  assets: [{ path: 'fontes/cormorant.woff2', assetId: '00000000-0000-4000-8000-000000000001' }],
};

function assetsNamed(count: number): { path: string; assetId: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    path: `img/a${index}.png`,
    assetId: '00000000-0000-4000-8000-000000000001',
  }));
}

describe('sheet template manifest', () => {
  it('accepts the three known permissions and a palette bar', () =>
    expect(sheetTemplateManifestDto.parse(lork)).toEqual(lork));
  it('names the known permissions', () =>
    expect(SHEET_MANIFEST_PERMISSIONS).toEqual([
      'character:stats',
      'character:portrait',
      'sheet:images',
      'documents:read',
      'character:bars',
    ]));
  it('accepts empty lists and reads a missing list as empty', () => {
    expect(sheetTemplateManifestDto.parse({ permissions: [], bars: [] })).toEqual({
      permissions: [],
      bars: [],
      assets: [],
    });
    expect(sheetTemplateManifestDto.parse({})).toEqual(emptySheetTemplateManifest());
  });
  it('gives a new empty manifest each call', () =>
    expect(emptySheetTemplateManifest()).not.toBe(emptySheetTemplateManifest()));
  it('accepts 8 bars and refuses 9 citing the count', () => {
    expect(issueOf(sheetTemplateManifestDto.safeParse({ bars: barsNamed(8) }))).toBe('accepted');
    expect(issueOf(sheetTemplateManifestDto.safeParse({ bars: barsNamed(9) }))).toBe(
      'bars has 9; expected at most 8',
    );
  });
  it('trims a bar label and accepts 24 characters but refuses 25 or a blank one', () => {
    const bar = (label: string) => ({ bars: [{ label, color: 'moss', max: 3 }] });
    expect(sheetTemplateManifestDto.parse(bar(' MP ')).bars[0]?.label).toBe('MP');
    expect(sheetTemplateManifestDto.safeParse(bar('l'.repeat(24))).success).toBe(true);
    expect(sheetTemplateManifestDto.safeParse(bar('l'.repeat(25))).success).toBe(false);
    expect(sheetTemplateManifestDto.safeParse(bar('  ')).success).toBe(false);
  });
  it('refuses an unknown permission citing it and the known ones', () =>
    expect(issueOf(sheetTemplateManifestDto.safeParse({ permissions: ['network'] }))).toBe(
      'permission "network"; expected one of character:stats, character:portrait, sheet:images, documents:read, character:bars',
    ));
  it('refuses a permission declared twice', () =>
    expect(
      issueOf(
        sheetTemplateManifestDto.safeParse({ permissions: ['sheet:images', 'sheet:images'] }),
      ),
    ).toBe('permission "sheet:images" repeats; expected each permission once'));
  it('takes a hex color like a token bar, lowercased', () =>
    expect(
      sheetTemplateManifestDto.parse({ bars: [{ label: 'Essência', color: '#FFFFFF', max: 15 }] })
        .bars[0]?.color,
    ).toBe('#ffffff'));
  it('refuses a color neither in the palette nor a hex, citing it', () =>
    expect(
      issueOf(
        sheetTemplateManifestDto.safeParse({ bars: [{ label: 'HP', color: 'purple', max: 1 }] }),
      ),
    ).toBe('bar color "purple"; expected one of gold, steel, ember, moss, ash or a hex #rrggbb'));
  it('refuses labels repeated ignoring case and accents, citing both', () => {
    const bars = [
      { label: 'Ação', color: 'gold', max: 2 },
      { label: 'HP', color: 'ember', max: 12 },
      { label: ' acao ', color: 'steel', max: 2 },
    ];
    expect(issueOf(sheetTemplateManifestDto.safeParse({ bars }))).toBe(
      'bar labels "Ação" and "acao" repeat; expected distinct labels, ignoring case and accents',
    );
    const hp = [lork.bars[0], { label: 'hp', color: 'gold', max: 1 }];
    expect(issueOf(sheetTemplateManifestDto.safeParse({ bars: hp }))).toContain('"HP" and "hp"');
  });
  it.each([0, 100_000, 1.5])('refuses a bar max of %s', (max) =>
    expect(
      sheetTemplateManifestDto.safeParse({ bars: [{ label: 'HP', color: 'gold', max }] }).success,
    ).toBe(false),
  );
  it('refuses a field beyond permissions and bars, and a bar with a current value', () => {
    expect(sheetTemplateManifestDto.safeParse({ ...lork, network: true }).success).toBe(false);
    const withCurrent = { bars: [{ label: 'HP', color: 'gold', max: 3, current: 3 }] };
    expect(sheetTemplateManifestDto.safeParse(withCurrent).success).toBe(false);
  });
});

describe('the assets of a sheet template manifest', () => {
  it('accepts a font and images by path, and 32 of them', () => {
    expect(sheetTemplateManifestDto.parse(lork).assets).toEqual(lork.assets);
    expect(issueOf(sheetTemplateManifestDto.safeParse({ assets: assetsNamed(32) }))).toBe(
      'accepted',
    );
  });
  it('refuses a 33rd asset citing the count', () =>
    expect(issueOf(sheetTemplateManifestDto.safeParse({ assets: assetsNamed(33) }))).toBe(
      'assets has 33; expected at most 32',
    ));
  it.each(['fontes/x.ttf', '../x.png', 'img/a b.png', 'x.svg'])(
    'refuses the path %s citing it',
    (path) =>
      expect(
        issueOf(sheetTemplateManifestDto.safeParse({ assets: [{ ...lork.assets[0], path }] })),
      ).toContain(`asset path ${JSON.stringify(path)}`),
  );
  it('refuses a path that repeats ignoring case', () => {
    const [font] = lork.assets;
    const twice = [font, { ...font, path: 'Fontes/Cormorant.woff2' }];
    expect(issueOf(sheetTemplateManifestDto.safeParse({ assets: twice }))).toBe(
      'asset path "Fontes/Cormorant.woff2" repeats; expected distinct paths, ignoring case',
    );
  });
  it('refuses an asset id that is not a uuid', () =>
    expect(
      sheetTemplateManifestDto.safeParse({ assets: [{ path: 'a.png', assetId: 'x' }] }).success,
    ).toBe(false));
});
