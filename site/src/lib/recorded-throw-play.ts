import type { RecordedThrow } from '@/lib/recorded-throws';

// Plain arithmetic over an already validated recording: kept apart from recorded-throws.ts so the
// landing's first script does not carry the dice contract (Zod), which only the lazy chunk needs.

/** The pick of `pickThrow`: where it sits in the list, so the next pick can avoid it. */
export interface RecordedThrowPick {
  index: number;
  recorded: RecordedThrow;
}

/**
 * One throw of the list for `random()` in [0, 1): the same value picks the same throw, and with
 * more than one the `previousIndex` (null on the first pick) is never picked again.
 * Example: `pickThrow(throws, Math.random, last?.index ?? null).recorded`
 */
export function pickThrow(
  list: readonly RecordedThrow[],
  random: () => number,
  previousIndex: number | null,
): RecordedThrowPick {
  const index = pickedIndexOf(list.length, random(), previousIndex);
  const recorded = list[index];
  if (recorded === undefined) {
    throw new RangeError(`Cannot pick from ${list.length} recorded throws: expected at least 1.`);
  }
  return { index, recorded };
}

function pickedIndexOf(count: number, value: number, previousIndex: number | null): number {
  const avoids = previousIndex !== null && count > 1;
  const choices = avoids ? count - 1 : count;
  const slot = Math.min(Math.floor(value * choices), choices - 1);
  if (!avoids || slot < previousIndex) return slot;
  return slot + 1;
}

/**
 * The total the landing shows once the dice settle: the faces of every model added up.
 * Example: `throwTotalOf(recorded) // 17`
 */
export function throwTotalOf(recorded: RecordedThrow): number {
  return recorded.values.reduce((total, value) => total + value, 0);
}

/**
 * When the last model of the throw comes to rest, in ms from the start of the throw.
 * Example: `timer.after(throwSettleMsOf(recorded), showTotal)`
 */
export function throwSettleMsOf(recorded: RecordedThrow): number {
  return Math.max(...recorded.throw.models.map((model) => model.settleMs));
}
