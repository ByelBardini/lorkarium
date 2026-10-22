import { BAR_VALUE_LIMIT, type BarChangeDto } from '@lorkarium/contracts';

export type ParsedBarInput =
  Readonly<{ kind: 'change'; change: BarChangeDto }> | Readonly<{ kind: 'invalid' }>;

// A sign (ASCII or the typographic minus) then digits; whole numbers only.
const BAR_INPUT = /^([+\-−])?(\d+)$/;

/** What the bar field means: "−7" or "-7" subtracts, "+5" adds and "12" sets the value. Enter
 *  applies it; anything else is invalid and nothing is sent.
 *
 *  Example: `parseBarInput('−7') // { kind: 'change', change: { op: 'add', amount: -7 } }` */
export function parseBarInput(text: string): ParsedBarInput {
  const match = BAR_INPUT.exec(text.trim());
  if (!match) return { kind: 'invalid' };
  const [, sign, digits] = match;
  const number = Number(digits);
  if (!sign) return { kind: 'change', change: { op: 'set', value: number } };
  const amount = sign === '+' ? number : -number;
  return { kind: 'change', change: { op: 'add', amount } };
}

/** What the "Máx." field means: a whole number from 1 to `BAR_VALUE_LIMIT`, or `null` (nothing
 *  is sent). No sign: the maximum is set, never stepped.
 *
 *  Example: `parseBarMax('50') // 50` */
export function parseBarMax(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const max = Number(trimmed);
  return max >= 1 && max <= BAR_VALUE_LIMIT ? max : null;
}
