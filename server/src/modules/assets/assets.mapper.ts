import {
  assetMimeTypeDto,
  type AssetDto,
  type AssetOutlineResponseDto,
  type AssetPurposeDto,
  type SheetTemplateAssetDto,
  type UploadAssetQueryDto,
} from '@lorkarium/contracts';
import type { AssetPo, NewAssetPo } from './assets.po';
import type { ImageCrop, NormalizedImage } from './image-processor.port';

/** The S3 key of an asset: its id alone, never the name the file had (§8.5).
 *
 *  Example: `storageKeyOf(id) // 'assets/<id>'` */
export function storageKeyOf(assetId: string): string {
  return `assets/${assetId}`;
}

/** The crop rectangle of the upload query, in percent of the upright image; `null` = none sent
 *  (the DTO already refused a partial one).
 *
 *  Example: `toImageCrop({ purpose: 'cover', cropX: 0, cropY: 10, cropW: 100, cropH: 50 }) // { x: 0, y: 10, w: 100, h: 50 }` */
export function toImageCrop(query: UploadAssetQueryDto): ImageCrop | null {
  const { cropX: x, cropY: y, cropW: w, cropH: h } = query;
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null;
  return { x, y, w, h };
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
    sightOutline: image.outline,
  };
}

/** A WOFF2 font already put in the storage → its row: a font has no pixels (0 × 0).
 *
 *  Example: `await assets.insert(toNewFontAssetPo({ assetId, campaignId, ownerId, bytes }))` */
export function toNewFontAssetPo(
  stored: Readonly<{ assetId: string; campaignId: string; ownerId: string; bytes: Uint8Array }>,
): NewAssetPo {
  const { assetId, campaignId, ownerId, bytes } = stored;
  return {
    ...{ id: assetId, campaignId, ownerId, purpose: 'sheet_template_asset' },
    ...{ mimeType: 'font/woff2', sizeBytes: bytes.byteLength, width: 0, height: 0 },
    storageKey: storageKeyOf(assetId),
    sightOutline: null,
  };
}

/** Image row → what the client sees (no key, no owner). Only images get here: a font row (the
 *  one type outside `assetMimeTypeDto`) throws, citing its type.
 *
 *  Example: `toAssetDto(row).width // 1400` */
export function toAssetDto(row: AssetPo): AssetDto {
  const mimeType = assetMimeTypeDto.parse(row.mimeType);
  return { id: row.id, mimeType, width: row.width, height: row.height };
}

/** Template asset row → the upload answer: its type and stored size.
 *
 *  Example: `toSheetTemplateAssetDto(row).sizeBytes // 41_220` */
export function toSheetTemplateAssetDto(row: AssetPo): SheetTemplateAssetDto {
  if (row.mimeType === 'image/gif')
    throw new RangeError(`template asset ${row.id} is a GIF; expected PNG, JPEG, WebP or WOFF2`);
  return { id: row.id, mimeType: row.mimeType, sizeBytes: row.sizeBytes };
}

/** Asset row → its silhouette as the client sees it; `null` = none was traced.
 *
 *  Example: `toAssetOutlineDto(row).outline?.length // 1` */
export function toAssetOutlineDto(row: AssetPo): AssetOutlineResponseDto {
  return { outline: row.sightOutline };
}
