import type { ConditionColorDto, ConditionToneDto } from '@lorkarium/contracts';

type ConditionColorEntry = Readonly<{ hex: string; label: string }>;

/** Each contract color key with its value and its name in pt-BR (the swatch's accessible name).
 *  Every hue reads at 4.5:1 or more on the card (`#15181D`), the panels and the board's badge. */
export const CONDITION_COLOR_ENTRIES: Readonly<Record<ConditionColorDto, ConditionColorEntry>> = {
  gold: { hex: '#d9b45a', label: 'Ouro' },
  amber: { hex: '#e89b3c', label: 'Âmbar' },
  ember: { hex: '#ec7a45', label: 'Brasa' },
  crimson: { hex: '#ee6670', label: 'Carmim' },
  rose: { hex: '#ec7fae', label: 'Rosa' },
  violet: { hex: '#b194f2', label: 'Violeta' },
  indigo: { hex: '#8fa0f5', label: 'Índigo' },
  sky: { hex: '#5cbcee', label: 'Céu' },
  teal: { hex: '#3fc4b2', label: 'Verde-água' },
  moss: { hex: '#9bb86a', label: 'Musgo' },
  lime: { hex: '#b9da5c', label: 'Lima' },
  bone: { hex: '#e4dbc6', label: 'Osso' },
};

// The tone's colors as `--primary` and `--destructive` in client/src/index.css: the canvas and an
// inline style cannot read a Tailwind class.
const TONE_HEX: Readonly<Record<ConditionToneDto, string>> = {
  benefit: '#c5a46d',
  harm: '#b5654f',
  incapacitating: '#b5654f',
};

/** The color a condition is painted with: its own from the palette, else its tone's.
 *
 *  Example: `conditionColorOf(null, 'benefit') // '#c5a46d'` */
export function conditionColorOf(color: ConditionColorDto | null, tone: ConditionToneDto): string {
  return color === null ? TONE_HEX[tone] : CONDITION_COLOR_ENTRIES[color].hex;
}

/** The same color as a number, for the board's canvas.
 *
 *  Example: `conditionColorNumberOf('sky', 'harm') // 0x5cbcee` */
export function conditionColorNumberOf(
  color: ConditionColorDto | null,
  tone: ConditionToneDto,
): number {
  return Number.parseInt(conditionColorOf(color, tone).slice(1), 16);
}

/** A palette color at an alpha (0 to 1) as a CSS color, for borders and fills.
 *
 *  Example: `paletteColorAt('sky', 0.15) // 'rgb(92 188 238 / 0.15)'` */
export function paletteColorAt(color: ConditionColorDto, alpha: number): string {
  const value = conditionColorNumberOf(color, 'harm');
  return `rgb(${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255} / ${alpha})`;
}
