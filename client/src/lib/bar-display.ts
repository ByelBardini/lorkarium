import type { BarColorDto, TokenBarDto } from '@lorkarium/contracts';

export type BarFillState = 'normal' | 'negative' | 'over';

/** `excess`: how far past an end the value went, as a share of the maximum (up to one whole
 *  bar): below zero when negative, above the maximum when over, 0 otherwise. `temp`: the temporary
 *  value, as a share of the maximum too (up to one whole bar). */
export type BarFill = Readonly<{
  fraction: number;
  state: BarFillState;
  excess: number;
  temp: number;
}>;

type BarValue = Pick<TokenBarDto, 'current' | 'max' | 'temp'>;
type ShownBar = Pick<TokenBarDto, 'current' | 'max' | 'temp' | 'display'>;

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
 *  second bar in its own color. The temp is a strip of its own over all of that.
 *
 *  Example: `barFill({ current: -10, max: 40, temp: 0 }) // { fraction: 0, state: 'negative', excess: 0.25, temp: 0 }` */
export function barFill({ current, max, temp }: BarValue): BarFill {
  const tempShare = shareOf(temp, max);
  if (current < 0) {
    return { fraction: 0, state: 'negative', excess: shareOf(-current, max), temp: tempShare };
  }
  if (current > max) {
    return { fraction: 1, state: 'over', excess: shareOf(current - max, max), temp: tempShare };
  }
  return { fraction: current / max, state: 'normal', excess: 0, temp: tempShare };
}

function shareOf(part: number, max: number): number {
  return Math.min(part / max, 1);
}

/** "32 / 45", or "71%" for a bar shown as percent; a negative value takes the typographic
 *  minus ("−4 / 38", "−11%") and a temp follows the current ("32 +5 / 45", "71% +11%").
 *  `withNumbers` (whoever controls the token) reads a percent bar with the numbers too,
 *  "71% · 32 / 45": the percent is how it shows, not a secret.
 *
 *  Example: `formatBarValue(bar, { withNumbers: token.canControl })` */
export function formatBarValue(
  { current, max, temp, display }: ShownBar,
  { withNumbers = false }: Readonly<{ withNumbers?: boolean }> = {},
): string {
  const numbers = `${signed(current)}${temp > 0 ? ` +${temp}` : ''} / ${max}`;
  if (display !== 'percent') return numbers;
  const tempPercent = temp > 0 ? ` +${percentOf(temp, max)}%` : '';
  const percent = `${signed(percentOf(current, max))}%${tempPercent}`;
  return withNumbers ? `${percent} · ${numbers}` : percent;
}

function percentOf(part: number, max: number): number {
  return Math.round((part / max) * 100);
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
