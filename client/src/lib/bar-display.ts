import type { BarColorDto, TokenBarDto } from '@lorkarium/contracts';

export type BarFillState = 'normal' | 'negative' | 'over';

export type BarFill = Readonly<{ fraction: number; state: BarFillState }>;

type BarValue = Pick<TokenBarDto, 'current' | 'max'>;

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
 *  (with its own state for the red mark) and one above the maximum is full.
 *
 *  Example: `barFill({ current: 32, max: 45 }) // { fraction: 0.71…, state: 'normal' }` */
export function barFill({ current, max }: BarValue): BarFill {
  if (current < 0) return { fraction: 0, state: 'negative' };
  if (current > max) return { fraction: 1, state: 'over' };
  return { fraction: current / max, state: 'normal' };
}

/** "32 / 45", with a typographic minus for a negative value ("−4 / 38").
 *
 *  Example: `formatBarValue(bar)` */
export function formatBarValue({ current, max }: BarValue): string {
  const shown = current < 0 ? `${MINUS}${Math.abs(current)}` : String(current);
  return `${shown} / ${max}`;
}

/** The CSS variable of a bar color, for an inline `style` (the canvas reads the hex itself).
 *
 *  Example: `<span style={{ background: barToneVar(bar.color) }} />` */
export function barToneVar(color: BarColorDto): string {
  return TONE_VAR[color];
}
