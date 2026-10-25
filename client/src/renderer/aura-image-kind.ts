// "GIF87a" and "GIF89a": the url `/api/assets/<id>` has no extension, so the kind is in the bytes.
const GIF_SIGNATURES = ['GIF87a', 'GIF89a'] as const;

/** Whether the bytes of an image are a GIF (which may animate), by its signature.
 *
 *  Example: `isGifBytes(new Uint8Array(await response.arrayBuffer()))` */
export function isGifBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const head = String.fromCharCode(...bytes.subarray(0, 6));
  return GIF_SIGNATURES.some((signature) => signature === head);
}
