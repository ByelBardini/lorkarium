import { isHexColor, type HexColorDto } from '@lorkarium/contracts';

const TYPED_HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/;

/** The number a custom color is painted with on the canvas.
 *
 *  Example: `colorNumberOf('#336699') // 0x336699` */
export function colorNumberOf(color: HexColorDto): number {
  return Number.parseInt(color.slice(1), 16);
}

/** What the person typed read as a color: with or without `#`, any case, short form allowed;
 *  `null` while it is not one (a half-typed code is not an error to throw).
 *
 *  Example: `hexFromTyped('#ABC') // '#aabbcc'` */
export function hexFromTyped(typed: string): HexColorDto | null {
  const digits = TYPED_HEX.exec(typed.trim().toLowerCase())?.[1];
  if (digits === undefined) return null;
  const full = digits.length === 3 ? digits.replace(/./g, '$&$&') : digits;
  const color = `#${full}`;
  return isHexColor(color) ? color : null;
}
