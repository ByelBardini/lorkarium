import { isHexColor, type MemberColorDto } from '@lorkarium/contracts';
import type { MemberColor } from '@lorkarium/game-core';
import { colorNumberOf } from '@/lib/custom-color';

/** The hex of each member color, bright enough on the dark board. Numbers because the canvas
 *  cannot read CSS; the DOM reads the same numbers through `memberColorCss`. A custom color has
 *  no entry here: read any color through `memberColorNumber`. */
export const MEMBER_COLOR_HEX: Readonly<Record<MemberColor, number>> = {
  gold: 0xe0b25c,
  steel: 0x6fa8dc,
  ember: 0xe0704f,
  moss: 0x8cc084,
  violet: 0xb39ddb,
  rose: 0xe58fb4,
  teal: 0x5cc8c0,
  bone: 0xf0e6d2,
};

/** The number a member color is painted with on a canvas.
 *
 *  Example: `memberColorNumber('#336699') // 0x336699` */
export function memberColorNumber(color: MemberColorDto): number {
  return isHexColor(color) ? colorNumberOf(color) : MEMBER_COLOR_HEX[color];
}

/** The CSS color of a member color, for a `style` in the DOM.
 *
 *  Example: `memberColorCss('gold') // '#e0b25c'` */
export function memberColorCss(color: MemberColorDto): string {
  return isHexColor(color) ? color : `#${MEMBER_COLOR_HEX[color].toString(16).padStart(6, '0')}`;
}
