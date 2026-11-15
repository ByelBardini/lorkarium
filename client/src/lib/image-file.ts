import {
  ASSET_FRAME,
  ASSET_MAX_BYTES,
  ASSET_MIME_TYPES,
  type AssetPurposeDto,
  type FramedAssetPurposeDto,
} from '@lorkarium/contracts';

// A GIF goes where it can play (the aura; the table photo, cover and banner, which move on a paid
// owner and keep their first frame on Grátis); elsewhere the picker refuses it before sending.
const ANIMATED_TYPES: readonly string[] = ASSET_MIME_TYPES;
const STILL_TYPES: readonly string[] = ASSET_MIME_TYPES.filter((type) => type !== 'image/gif');

export const IMAGE_TYPE_PROBLEM = 'Use PNG, JPEG ou WebP.';
export const ANIMATED_IMAGE_TYPE_PROBLEM = 'Use PNG, JPEG, WebP ou GIF.';
export const IMAGE_SIZE_PROBLEM = 'A imagem passa de 20 MB.';

/** Whether the place that takes the image may animate it (a GIF is accepted). */
export type ImageFileOptions = Readonly<{ animated?: boolean }>;

/** Whether a purpose may keep the image animated, so its picker takes a GIF: the aura, and the
 *  three table images (they play when the table owner's plan has the customizations).
 *
 *  Example: `animatesImage('cover') // true` */
export function animatesImage(purpose: AssetPurposeDto): boolean {
  return purpose === 'aura' || isFramedPurpose(purpose);
}

/** Whether the server keeps a purpose in a fixed aspect (the three campaign images), so a chosen
 *  file is framed before it goes.
 *
 *  Example: `isFramedPurpose('campaign_banner') // true` */
export function isFramedPurpose(purpose: AssetPurposeDto): purpose is FramedAssetPurposeDto {
  return Object.hasOwn(ASSET_FRAME, purpose);
}

/** The `accept` of the file input: the types the server keeps for that place.
 *
 *  Example: `imageAcceptOf({ animated: true }) // 'image/png,image/jpeg,image/webp,image/gif'` */
export function imageAcceptOf({ animated = false }: ImageFileOptions = {}): string {
  return (animated ? ANIMATED_TYPES : STILL_TYPES).join(',');
}

/** Why a chosen file cannot go (before sending anything), or `null` when it can. The server still
 *  decodes it; this only spares a request that would be refused.
 *
 *  Example: `imageFileProblem(gif) // 'Use PNG, JPEG ou WebP.'` */
export function imageFileProblem(
  file: Pick<Blob, 'type' | 'size'>,
  { animated = false }: ImageFileOptions = {},
): string | null {
  const accepted = animated ? ANIMATED_TYPES : STILL_TYPES;
  if (!accepted.includes(file.type)) {
    return animated ? ANIMATED_IMAGE_TYPE_PROBLEM : IMAGE_TYPE_PROBLEM;
  }
  if (file.size > ASSET_MAX_BYTES) return IMAGE_SIZE_PROBLEM;
  return null;
}

/** The first image file of a paste or a drop ("Copiar imagem" in the browser + Ctrl+V), or `null`.
 *
 *  Example: `imageOfClipboard(event.clipboardData)` */
export function imageOfClipboard(data: Pick<DataTransfer, 'files'> | null): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}
