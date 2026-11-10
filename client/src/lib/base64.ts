// In slices: `String.fromCharCode(...bytes)` of a whole 8 MiB font would overflow the stack.
const SLICE = 0x8000;

/** The bytes as standard base64 (the `data:` url of a template asset, the `.lksheet` asset).
 *
 *  Example: `bytesToBase64(new Uint8Array([0x77, 0x4f, 0x46, 0x32])) // 'd09GMg=='` */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let at = 0; at < bytes.length; at += SLICE)
    binary += String.fromCharCode(...bytes.subarray(at, at + SLICE));
  return btoa(binary);
}

/** The bytes of standard base64 text; text that is not base64 throws a `SyntaxError` (from
 *  `atob`), so callers validate it first.
 *
 *  Example: `base64ToBytes('d09GMg==') // Uint8Array [0x77, 0x4f, 0x46, 0x32]` */
export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
