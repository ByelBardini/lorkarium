import type { AssetDto, AssetPurposeDto } from '@lorkarium/contracts';
import type { AssetPo, NewAssetPo } from './assets.po';
import type { NormalizedImage } from './image-processor.port';

/** The S3 key of an asset: its id alone, never the name the file had (§8.5).
 *
 *  Example: `storageKeyOf(id) // 'assets/<id>'` */
export function storageKeyOf(assetId: string): string {
  return `assets/${assetId}`;
}

export type StoredImage = Readonly<{
  assetId: string;
  campaignId: string;
  ownerId: string;
  purpose: AssetPurposeDto;
  image: NormalizedImage;
}>;

/** The normalized image already put in the storage → its row; sizes are the stored ones.
 *
 *  Example: `await assets.insert(toNewAssetPo({ assetId, campaignId, ownerId, purpose, image }))` */
export function toNewAssetPo(stored: StoredImage): NewAssetPo {
  const { assetId, campaignId, ownerId, purpose, image } = stored;
  return {
    id: assetId,
    campaignId,
    ownerId,
    purpose,
    mimeType: image.mimeType,
    sizeBytes: image.bytes.byteLength,
    width: image.width,
    height: image.height,
    storageKey: storageKeyOf(assetId),
  };
}

/** Asset row → what the client sees (no key, no owner).
 *
 *  Example: `toAssetDto(row).width // 1400` */
export function toAssetDto(row: AssetPo): AssetDto {
  return { id: row.id, mimeType: row.mimeType, width: row.width, height: row.height };
}
