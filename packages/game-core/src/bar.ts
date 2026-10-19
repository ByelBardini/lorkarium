/** A change to a bar's current value: relative ("-7", "+5") or absolute ("12"). */
export type BarChange =
  Readonly<{ op: 'add'; amount: number }> | Readonly<{ op: 'set'; value: number }>;

/** The new current value of a bar. Free on purpose (spec §2.1): it may go negative or above the
 *  maximum, and nothing happens on its own at zero; it only stops at ±`limit`.
 *
 *  Example: `applyBarChange(32, { op: 'add', amount: -7 }, BAR_VALUE_LIMIT) // 25` */
export function applyBarChange(current: number, change: BarChange, limit: number): number {
  const amount = change.op === 'add' ? change.amount : change.value;
  if (!Number.isInteger(amount)) {
    throw new RangeError(`Bar change ${String(amount)} is invalid: expected inteiro.`);
  }
  const next = change.op === 'add' ? current + amount : amount;
  return Math.min(Math.max(next, -limit), limit);
}

/** What a bar's adjust field may send: a change to the current value, or a new maximum. */
export type BarAdjustment = BarChange | Readonly<{ op: 'max'; value: number }>;

export type BarValues = Readonly<{ current: number; max: number }>;

/** The bar after one adjustment. A new maximum leaves the current alone, even above it (the
 *  bar is free, spec §2.1); a current change goes through `applyBarChange`.
 *
 *  Example: `adjustBarValues({ current: 40, max: 45 }, { op: 'max', value: 50 }, BAR_VALUE_LIMIT) // { current: 40, max: 50 }` */
export function adjustBarValues(bar: BarValues, change: BarAdjustment, limit: number): BarValues {
  if (change.op !== 'max')
    return { current: applyBarChange(bar.current, change, limit), max: bar.max };
  const { value } = change;
  if (!Number.isInteger(value) || value < 1 || value > limit) {
    throw new RangeError(
      `Bar maximum ${String(value)} is invalid: expected a whole number from 1 to ${limit}.`,
    );
  }
  return { current: bar.current, max: value };
}
