const DARK_INK = '#1a1a1a';
const LIGHT_INK = '#ffffff';
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

/** The ink that reads best on a `#rrggbb` background: near-black or white.
 *
 *  Example: `legibleInkOn('#101010') // '#ffffff'` */
export function legibleInkOn(background: string): string {
  const darkWins = contrastRatioOf(DARK_INK, background) >= contrastRatioOf(LIGHT_INK, background);
  return darkWins ? DARK_INK : LIGHT_INK;
}
