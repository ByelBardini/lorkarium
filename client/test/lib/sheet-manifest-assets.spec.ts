import { describe, expect, it } from 'vitest';
import {
  declaredAssetsOf,
  templateAssetTypeOf,
  withManifestAsset,
  withoutManifestAsset,
} from '@/lib/sheet-manifest-assets';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';

const FONT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const EMPTY = '{"permissions":["sheet:images"],"bars":[]}';

function assetsOf(text: string | null): unknown {
  const reading = readSheetManifestText(text ?? '');
  return reading.ok ? reading.manifest.assets : reading.problem;
}

describe('templateAssetTypeOf', () => {
  it.each([
    ['fontes/cormorant.woff2', 'font/woff2'],
    ['img/a.png', 'image/png'],
    ['img/a.jpg', 'image/jpeg'],
    ['img/a.jpeg', 'image/jpeg'],
    ['img/a.webp', 'image/webp'],
  ])('%s is sent as %s', (path, type) => expect(templateAssetTypeOf(path)).toBe(type));
  it('a TTF or an SVG has no type', () => {
    expect(templateAssetTypeOf('fontes/x.ttf')).toBeNull();
    expect(templateAssetTypeOf('img/x.svg')).toBeNull();
  });
});

describe('the assets of a manifest text', () => {
  it('declares an asset and keeps the rest of the manifest', () => {
    const text = withManifestAsset(EMPTY, { path: 'fontes/x.woff2', assetId: FONT_ID });
    expect(assetsOf(text)).toEqual([{ path: 'fontes/x.woff2', assetId: FONT_ID }]);
    expect(text).toContain('sheet:images');
  });
  it('a new asset at a path already declared, ignoring case, takes its place', () => {
    const first = withManifestAsset(EMPTY, { path: 'img/A.png', assetId: FONT_ID }) ?? '';
    const second = withManifestAsset(first, { path: 'img/a.png', assetId: OTHER_ID });
    expect(assetsOf(second)).toEqual([{ path: 'img/a.png', assetId: OTHER_ID }]);
  });
  it('takes an asset away by its path', () => {
    const declared = withManifestAsset(EMPTY, { path: 'img/a.png', assetId: FONT_ID }) ?? '';
    expect(assetsOf(withoutManifestAsset(declared, 'img/a.png'))).toEqual([]);
    expect(declaredAssetsOf(declared)).toEqual([{ path: 'img/a.png', assetId: FONT_ID }]);
  });
  it('a text that does not read changes nothing and declares nothing', () => {
    expect(withManifestAsset('{ quebrado', { path: 'a.png', assetId: FONT_ID })).toBeNull();
    expect(withoutManifestAsset('{ quebrado', 'a.png')).toBeNull();
    expect(declaredAssetsOf('{ quebrado')).toEqual([]);
  });
});
