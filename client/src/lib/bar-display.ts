import type { BarColorDto, TokenBarDto } from '@lorkarium/contracts';

export type BarFillState = 'normal' | 'negative' | 'over';

/** `excess`: how far past an end the value went, as a share of the maximum (up to one whole
 *  bar): below zero when negative, above the maximum when over, 0 otherwise. */
export type BarFill = Readonly<{ fraction: number; state: BarFillState; excess: number }>;

type BarValue = Pick<TokenBarDto, 'current' | 'max'>;
type ShownBar = Pick<TokenBarDto, 'current' | 'max' | 'display'>;

const TONE_VAR: Readonly<Record<BarColorDto, string>> = {
  gold: 'var(--chart-1)',
  steel: 'var(--chart-2)',
  ember: 'var(--chart-3)',
  moss: 'var(--chart-4)',
  ash: 'var(--chart-5)',
};

/** The name of each bar color, as the bar editor offers it. */
export const BAR_COLOR_LABEL: Readonly<Record<BarColorDto, string>> = {
  gold: 'Ouro',
  steel: 'Aço',
  ember: 'Brasa',
  moss: 'Musgo',
  ash: 'Cinza',
};

const MINUS = '−';

/** How much of the bar to paint: it draws from 0 to the maximum, so a negative value is empty
 *  and one above the maximum is full; the part past either end is the `excess`, drawn as a
 *  second bar in its own color.
 *
 *  Example: `barFill({ current: -10, max: 40 }) // { fraction: 0, state: 'negative', excess: 0.25 }` */
export function barFill({ current, max }: BarValue): BarFill {
  if (current < 0) return { fraction: 0, state: 'negative', excess: excessOf(-current, max) };
  if (current > max) return { fraction: 1, state: 'over', excess: excessOf(current - max, max) };
  return { fraction: current / max, state: 'normal', excess: 0 };
}

function excessOf(beyond: number, max: number): number {
  return Math.min(beyond / max, 1);
}

/** "32 / 45", or "71%" for a bar shown as percent; a negative value takes the typographic
 *  minus ("−4 / 38", "−11%").
 *
 *  Example: `formatBarValue(bar)` */
export function formatBarValue({ current, max, display }: ShownBar): string {
  if (display === 'percent') return `${signed(Math.round((current / max) * 100))}%`;
  return `${signed(current)} / ${max}`;
}

function signed(value: number): string {
  return value < 0 ? `${MINUS}${Math.abs(value)}` : String(value);
}

/** The CSS variable of a bar color, for an inline `style` (the canvas reads the hex itself).
 *
 *  Example: `<span style={{ background: barToneVar(bar.color) }} />` */
export function barToneVar(color: BarColorDto): string {
  return TONE_VAR[color];
}
