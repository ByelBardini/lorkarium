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
