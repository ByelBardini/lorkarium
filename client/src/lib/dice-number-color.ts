import type { MemberColor } from '@lorkarium/game-core';
import { memberColorCss } from '@/lib/member-color';

/** What decides the color of the numbers: the profile color, the texture and the person's
 *  choice (only used with a texture). Same shape as the appearance of the dice event. */
export interface DiceNumberLook {
  readonly color: MemberColor;
  readonly textureId: string | null;
  readonly numberColor: string | null;
}

const DARK_NUMBER = '#1a1a1a';
const LIGHT_NUMBER = '#ffffff';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function channelLuminance(byte: number): number {
  const channel = byte / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  if (!HEX_COLOR.test(color)) {
    throw new RangeError(`Color "${color}" is invalid: expected #rrggbb.`);
  }
  const [red, green, blue] = [1, 3, 5].map((at) =>
    channelLuminance(Number.parseInt(color.slice(at, at + 2), 16)),
  );
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** The WCAG contrast ratio of two `#rrggbb` colors, from 1 (same) to 21 (black on white).
 *
 *  Example: `contrastRatioOf('#000000', '#ffffff') // 21` */
export function contrastRatioOf(first: string, second: string): number {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** The color of the numbers on a die: without texture, the one of dark or white that reads
 *  best on the profile color; with a texture, the person's choice or else white.
 *
 *  Example: `diceNumberColorOf({ color: 'gold', textureId: null, numberColor: null }) // '#1a1a1a'` */
export function diceNumberColorOf(look: DiceNumberLook): string {
  if (look.textureId !== null) return look.numberColor ?? LIGHT_NUMBER;
  const base = memberColorCss(look.color);
  const darkWins = contrastRatioOf(DARK_NUMBER, base) >= contrastRatioOf(LIGHT_NUMBER, base);
  return darkWins ? DARK_NUMBER : LIGHT_NUMBER;
}
