/** Bytes of `value` in UTF-8 without `TextEncoder` (the contracts compile without the DOM lib).
 *
 *  Example: `utf8Length('ação') // 6` */
export function utf8Length(value: string): number {
  let length = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    length += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
  }
  return length;
}
