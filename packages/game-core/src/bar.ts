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

/** A bar a cost may be charged to: its current value pays, its temp never does. */
export type SpendableBar = Readonly<{ id: string; label: string; current: number }>;

export type BarCost = Readonly<{ barId: string; amount: number }>;

export type BarsSpent<T extends SpendableBar> =
  | Readonly<{ ok: true; spent: T[] }>
  | Readonly<{ ok: false; bar: string; has: number; needs: number }>;

/** Charges every cost or none: each bar must hold, in its current value alone, the sum of its
 *  costs; else the first bar short comes back by label with what it has and needs. `spent` lists
 *  each bar that paid once, in the order of `bars`, with only `current` changed.
 *
 *  Example: `spendBars(bars, [{ barId: mp.id, amount: 6 }, { barId: ef.id, amount: 6 }])` */
export function spendBars<T extends SpendableBar>(
  bars: readonly T[],
  costs: readonly BarCost[],
): BarsSpent<T> {
  const due = dueByBar(bars, costs);
  const spent: T[] = [];
  for (const bar of bars) {
    const needs = due.get(bar.id);
    if (needs === undefined) continue;
    if (bar.current < needs) return { ok: false, bar: bar.label, has: bar.current, needs };
    spent.push({ ...bar, current: bar.current - needs });
  }
  return { ok: true, spent };
}

function dueByBar(bars: readonly SpendableBar[], costs: readonly BarCost[]): Map<string, number> {
  const due = new Map<string, number>();
  for (const { barId, amount } of costs) {
    requireCost(amount);
    if (!bars.some((bar) => bar.id === barId)) throw unknownCostBar(bars, barId);
    due.set(barId, (due.get(barId) ?? 0) + amount);
  }
  return due;
}

function requireCost(amount: number): void {
  if (Number.isInteger(amount) && amount >= 1) return;
  throw new RangeError(
    `Bar cost ${String(amount)} is invalid: expected a whole number of at least 1.`,
  );
}

function unknownCostBar(bars: readonly SpendableBar[], barId: string): RangeError {
  const ids = bars.map((bar) => `"${bar.id}"`).join(', ') || 'none';
  return new RangeError(`Bar cost on "${barId}" is invalid: expected the id of one of: ${ids}.`);
}
