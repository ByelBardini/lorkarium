import type { LightColorDto } from '@lorkarium/contracts';

/** A palette name, or `null` for a neutral light (it reveals without tinting). */
export type LightColor = LightColorDto | null;

/** The light palette in order, with its pt-BR name and tone: each one tuned to tint the map
 *  without hiding it. Hex because the canvas cannot read CSS. */
export const LIGHT_COLOR_TONES: ReadonlyArray<
  Readonly<{ color: LightColorDto; label: string; hex: string }>
> = [
  { color: 'torch', label: 'Tocha', hex: '#ff9f43' },
  { color: 'candle', label: 'Vela', hex: '#ffd27a' },
  { color: 'fire', label: 'Fogo', hex: '#ff6a2b' },
  { color: 'moon', label: 'Lua', hex: '#9ec3ff' },
  { color: 'arcane', label: 'Arcana', hex: '#8b7bff' },
  { color: 'necrotic', label: 'Necrótica', hex: '#7fd66b' },
  { color: 'infernal', label: 'Infernal', hex: '#ff3b3b' },
];

/** The name of the light without a color. */
export const NEUTRAL_LIGHT_LABEL = 'Neutra';

/** The tone a light tints with, as the canvas number; `null` for a neutral light.
 *
 *  Example: `lightColorHex('fire') // 0xff6a2b` */
export function lightColorHex(color: LightColor): number | null {
  const tone = LIGHT_COLOR_TONES.find((entry) => entry.color === color);
  return tone ? Number.parseInt(tone.hex.slice(1), 16) : null;
}

/** The tone of a light as CSS, for the panels; `null` for a neutral light.
 *
 *  Example: `lightColorCss('moon') // '#9ec3ff'` */
export function lightColorCss(color: LightColor): string | null {
  return LIGHT_COLOR_TONES.find((entry) => entry.color === color)?.hex ?? null;
}
