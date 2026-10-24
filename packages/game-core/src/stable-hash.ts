/** A small, stable, unsigned 32-bit hash (`×31`) of a text: the same id looks the same on every
 *  screen and on the server (the cover of a table, the color of a person). Not for security.
 *
 *  Example: `stableHash('ab') // 3105` */
export function stableHash(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}
