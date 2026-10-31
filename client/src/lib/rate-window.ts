/** At most `limit` admitted events in any `windowMs` (a sliding window). */
export type RateWindowRule = Readonly<{ limit: number; windowMs: number }>;

/** `stamps`: the moments admitted inside the window, the new one included when `admitted`. */
export type RateWindowAnswer = Readonly<{ admitted: boolean; stamps: readonly number[] }>;

/** Counts the events admitted in the last `windowMs` and admits one more only below `limit`; a
 *  refused event does not count. Pure: the caller keeps `stamps` for the next call.
 *
 *  Example: `admitInWindow([0, 4000], 9000, { limit: 2, windowMs: 10_000 }).admitted // false` */
export function admitInWindow(
  stamps: readonly number[],
  nowMs: number,
  rule: RateWindowRule,
): RateWindowAnswer {
  if (!Number.isInteger(rule.limit) || rule.limit < 1 || !(rule.windowMs > 0)) {
    throw new RangeError(
      `Invalid rate window ${JSON.stringify(rule)}; expected an integer limit ≥ 1 and windowMs > 0`,
    );
  }
  const recent = stamps.filter((stamp) => nowMs - stamp < rule.windowMs);
  if (recent.length >= rule.limit) return { admitted: false, stamps: recent };
  return { admitted: true, stamps: [...recent, nowMs] };
}
