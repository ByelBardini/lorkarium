import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@lorkarium/contracts';

const ACCEPTED: ReadonlySet<string> = new Set(AVATAR_MIME_TYPES);

/** The `accept` of the photo input: the types the server reads (GIF included, animated or not). */
export const AVATAR_ACCEPT = AVATAR_MIME_TYPES.join(',');

/** Why a chosen photo cannot go (before sending anything), or `null` when it can. The server still
 *  decodes it; this only spares a request that would be refused.
 *
 *  Example: `avatarFileProblem(bigPng) // 'avatar_too_large'` */
export function avatarFileProblem(
  file: Pick<Blob, 'type' | 'size'>,
): 'avatar_too_large' | 'unsupported_image' | null {
  if (!ACCEPTED.has(file.type)) return 'unsupported_image';
  if (file.size > AVATAR_MAX_BYTES) return 'avatar_too_large';
  return null;
}
