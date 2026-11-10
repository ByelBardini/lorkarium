import type { SheetManifestAssetDto, SheetTemplateAssetMimeTypeDto } from '@lorkarium/contracts';
import { readSheetManifestText, sheetManifestText } from './sheet-template-manifest';

const TYPE_OF_EXTENSION: Readonly<Record<string, SheetTemplateAssetMimeTypeDto>> = {
  woff2: 'font/woff2',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** The type a template asset is sent as, from its path's extension (the browser often gives no
 *  type for a font); `null` for any other extension.
 *
 *  Example: `templateAssetTypeOf('fontes/cormorant.woff2') // 'font/woff2'` */
export function templateAssetTypeOf(path: string): SheetTemplateAssetMimeTypeDto | null {
  const extension = /\.([a-z0-9]+)$/.exec(path)?.[1] ?? '';
  return TYPE_OF_EXTENSION[extension] ?? null;
}

/** The manifest text with `asset` declared (one already at that path, ignoring case, is
 *  replaced); `null` when the text does not read as a manifest.
 *
 *  Example: `withManifestAsset(draft.manifest, { path: 'fontes/x.woff2', assetId })` */
export function withManifestAsset(text: string, asset: SheetManifestAssetDto): string | null {
  const reading = readSheetManifestText(text);
  if (!reading.ok) return null;
  const key = asset.path.toLowerCase();
  const kept = reading.manifest.assets.filter(({ path }) => path.toLowerCase() !== key);
  return sheetManifestText({ ...reading.manifest, assets: [...kept, asset] });
}

/** The manifest text without the asset at `path`; `null` when the text does not read.
 *
 *  Example: `withoutManifestAsset(draft.manifest, 'fontes/x.woff2')` */
export function withoutManifestAsset(text: string, path: string): string | null {
  const reading = readSheetManifestText(text);
  if (!reading.ok) return null;
  const assets = reading.manifest.assets.filter((asset) => asset.path !== path);
  return sheetManifestText({ ...reading.manifest, assets });
}

/** The assets a manifest text declares; none when it does not read (the save is blocked then).
 *
 *  Example: `declaredAssetsOf(draft.manifest).map(({ path }) => path)` */
export function declaredAssetsOf(text: string): readonly SheetManifestAssetDto[] {
  const reading = readSheetManifestText(text);
  return reading.ok ? reading.manifest.assets : [];
}
