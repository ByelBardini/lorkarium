import type { MemberColorDto } from '@lorkarium/contracts';
import { legibleInkOn } from '@/lib/color-contrast';
import { memberColorCss } from '@/lib/member-color';

/** What decides the color of the numbers: the profile color, the texture and the person's
 *  choice (only used with a texture). Same shape as the appearance of the dice event. */
export interface DiceNumberLook {
  readonly color: MemberColorDto;
  readonly textureId: string | null;
  readonly numberColor: string | null;
}

const LIGHT_NUMBER = '#ffffff';

/** The color of the numbers on a die: without texture, the one of dark or white that reads
 *  best on the profile color; with a texture, the person's choice or else white.
 *
 *  Example: `diceNumberColorOf({ color: 'gold', textureId: null, numberColor: null }) // '#1a1a1a'` */
export function diceNumberColorOf(look: DiceNumberLook): string {
  if (look.textureId !== null) return look.numberColor ?? LIGHT_NUMBER;
  return legibleInkOn(memberColorCss(look.color));
}
