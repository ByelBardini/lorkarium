import { AssetNotFoundError } from '../assets/assets.error';
export type LibraryImageAsset = Readonly<{ id: string; purpose: string }>;
export function requireLibraryImageAsset(
  asset: LibraryImageAsset | undefined,
  assetId: string,
): void {
  if (asset?.purpose === 'library_image') return;
  throw new AssetNotFoundError(assetId);
}
export function canReadLibraryImage(
  isMaster: boolean,
  visibility: string | null,
  isCurrent: boolean,
): boolean {
  return isMaster || visibility === 'public' || isCurrent;
}
