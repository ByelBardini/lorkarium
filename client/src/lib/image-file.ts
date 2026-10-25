import { ASSET_MAX_BYTES, ASSET_MIME_TYPES, type AssetPurposeDto } from '@lorkarium/contracts';

// Only the aura keeps a GIF animated; every other place stores a still image (the server refuses
// GIF outside the purpose `aura`), so the picker refuses it before sending.
const ANIMATED_TYPES: readonly string[] = ASSET_MIME_TYPES;
const STILL_TYPES: readonly string[] = ASSET_MIME_TYPES.filter((type) => type !== 'image/gif');

export const IMAGE_TYPE_PROBLEM = 'Use PNG, JPEG ou WebP.';
export const ANIMATED_IMAGE_TYPE_PROBLEM = 'Use PNG, JPEG, WebP ou GIF.';
export const IMAGE_SIZE_PROBLEM = 'A imagem passa de 20 MB.';

/** Whether the place that takes the image animates it (only the aura does). */
export type ImageFileOptions = Readonly<{ animated?: boolean }>;

/** Whether a purpose keeps the image animated (a GIF plays): only the aura.
 *
 *  Example: `animatesImage('aura') // true` */
export function animatesImage(purpose: AssetPurposeDto): boolean {
  return purpose === 'aura';
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
