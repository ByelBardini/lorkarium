import { ASSET_MAX_BYTES, ASSET_MIME_TYPES } from '@lorkarium/contracts';

const ACCEPTED: ReadonlySet<string> = new Set(ASSET_MIME_TYPES);

export const IMAGE_TYPE_PROBLEM = 'Use PNG, JPEG ou WebP.';
export const IMAGE_SIZE_PROBLEM = 'A imagem passa de 20 MB.';

/** The `accept` of the file input: the types the server keeps. */
export const IMAGE_ACCEPT = ASSET_MIME_TYPES.join(',');

/** Why a chosen file cannot go (before sending anything), or `null` when it can. The server still
 *  decodes it; this only spares a request that would be refused.
 *
 *  Example: `imageFileProblem(gif) // 'Use PNG, JPEG ou WebP.'` */
export function imageFileProblem(file: Pick<Blob, 'type' | 'size'>): string | null {
  if (!ACCEPTED.has(file.type)) return IMAGE_TYPE_PROBLEM;
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
