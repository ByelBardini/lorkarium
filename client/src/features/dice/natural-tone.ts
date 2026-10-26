import type { RollNatural } from '@/lib/dice-breakdown';

/** The total's color, in the history and in the notice: gold on a natural 20, the error text on a
 *  natural 1. */
export const NATURAL_TOTAL_CLASS: Readonly<Record<RollNatural, string>> = {
  twenty: 'text-primary',
  one: 'text-destructive-text',
};
