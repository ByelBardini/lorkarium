import type { SheetFrameRequestDto } from '@lorkarium/contracts';
import type { SheetsApi } from '@/services/sheets-api';
import { refusedByKind, refusedWith, type SheetBridgeAnswer } from './sheet-bridge-answer';

type FrameImage = Extract<SheetFrameRequestDto, { type: 'assets.upload' }>['image'];

/** `assets.upload`: the bytes go to the sheet's own image route (who reads the sheet reads the
 *  image); the frame gets the new asset id.
 *
 *  Example: `await uploadSheetImage(images, campaignId, sheetId, { type: 'image/png', bytes })` */
export async function uploadSheetImage(
  images: Pick<SheetsApi, 'uploadImage'>,
  campaignId: string,
  sheetId: string,
  image: FrameImage,
): Promise<SheetBridgeAnswer> {
  const result = await images.uploadImage(campaignId, sheetId, image.bytes, image.type);
  if (!result.ok) return refusedByKind('assets.upload', result.failure.kind);
  return { ok: true, value: { assetId: result.value.id } };
}

/** `assets.read`: the bytes of an image the viewer could open by hand, read with the viewer's own
 *  session (the frame never gets a URL); one it may not read is ASSET_NOT_FOUND.
 *
 *  Example: `await readSheetAsset(images, assetId)` */
export async function readSheetAsset(
  images: Pick<SheetsApi, 'image'>,
  assetId: string,
): Promise<SheetBridgeAnswer> {
  const result = await images.image(assetId);
  if (result.ok) return { ok: true, value: { type: result.value.type, bytes: result.value.bytes } };
  if (result.failure.kind === 'not_found' || result.failure.kind === 'forbidden')
    return refusedWith('ASSET_NOT_FOUND', `assets.read: no image ${assetId} this sheet may read`);
  return refusedByKind('assets.read', result.failure.kind);
}
