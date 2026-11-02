/** A change to a bar's current value: relative ("-7", "+5") or absolute ("12"). */
export type BarChange =
  Readonly<{ op: 'add'; amount: number }> | Readonly<{ op: 'set'; value: number }>;

/** The new current value of a bar. Free on purpose (spec §2.1): it may go negative or above the
 *  maximum, and nothing happens on its own at zero; it only stops at ±`limit`.
 *
 *  Example: `applyBarChange(32, { op: 'add', amount: -7 }, BAR_VALUE_LIMIT) // 25` */
export function applyBarChange(current: number, change: BarChange, limit: number): number {
  const amount = change.op === 'add' ? change.amount : change.value;
  requireWholeChange(amount);
  const next = change.op === 'add' ? current + amount : amount;
  return Math.min(Math.max(next, -limit), limit);
}

function requireWholeChange(amount: number): void {
  if (Number.isInteger(amount)) return;
  throw new RangeError(`Bar change ${String(amount)} is invalid: expected inteiro.`);
}

/** What a bar's adjust field may send: a change to the current value, a new maximum, or a new
 *  temporary value. */
export type BarAdjustment =
  BarChange | Readonly<{ op: 'max'; value: number }> | Readonly<{ op: 'temp'; value: number }>;

export type BarValues = Readonly<{ current: number; max: number; temp: number }>;

/** The bar after one adjustment. A new maximum leaves the current alone, even above it (the
 *  bar is free, spec §2.1); a new temp replaces it; a subtraction spends the temp first and only
 *  what passes it comes out of the current; any other current change never touches the temp.
 *
 *  Example: `adjustBarValues({ current: 20, max: 45, temp: 5 }, { op: 'add', amount: -8 }, BAR_VALUE_LIMIT) // { current: 17, max: 45, temp: 0 }` */
export function adjustBarValues(bar: BarValues, change: BarAdjustment, limit: number): BarValues {
  if (change.op === 'max') return { ...valuesOf(bar), max: wholeMaximum(change.value, limit) };
  if (change.op === 'temp') return { ...valuesOf(bar), temp: wholeTemp(change.value, limit) };
  if (change.op === 'set' || change.amount >= 0) {
    return { ...valuesOf(bar), current: applyBarChange(bar.current, change, limit) };
  }
  return subtracted(bar, change.amount, limit);
}

function valuesOf({ current, max, temp }: BarValues): BarValues {
  return { current, max, temp };
}

function subtracted({ current, max, temp }: BarValues, amount: number, limit: number): BarValues {
  requireWholeChange(amount);
  const spent = Math.min(temp, -amount);
  const rest = applyBarChange(current, { op: 'add', amount: amount + spent }, limit);
  return { current: rest, max, temp: temp - spent };
}

function wholeMaximum(value: number, limit: number): number {
  if (Number.isInteger(value) && value >= 1 && value <= limit) return value;
  throw new RangeError(
    `Bar maximum ${String(value)} is invalid: expected a whole number from 1 to ${limit}.`,
  );
}

function wholeTemp(value: number, limit: number): number {
  if (Number.isInteger(value) && value >= 0 && value <= limit) return value;
  throw new RangeError(
    `Bar temp ${String(value)} is invalid: expected a whole number from 0 to ${limit}.`,
  );
}
