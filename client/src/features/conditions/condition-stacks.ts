import { CONDITION_STACKS_MAX } from '@lorkarium/contracts';

/** The stacking of a condition as the form holds it: the switch and the maximum as typed. */
export type StacksDraft = Readonly<{ on: boolean; text: string }>;

/** The fewest stacks a stacking condition piles up to (the contract's `conditionMaxStacksDto`). */
export const CONDITION_STACKS_MIN = 2;

/** Where the maximum starts when the master turns stacking on: a small pile reads better than 99. */
export const DEFAULT_MAX_STACKS = 5;

/** The maximum after − or + from what the field holds, kept within 2..99; a value being typed
 *  out of range steps from the nearest end.
 *
 *  Example: `steppedMaxStacks(5, 1) // 6` · `steppedMaxStacks('invalid', -1) // 2` */
export function steppedMaxStacks(current: number | null | 'invalid', by: number): number {
  const from = typeof current === 'number' ? current : CONDITION_STACKS_MIN;
  return Math.min(CONDITION_STACKS_MAX, Math.max(CONDITION_STACKS_MIN, from + by));
}

/** The form's stacking from a saved `maxStacks` (`null` = it does not stack).
 *
 *  Example: `stacksDraftOf(5) // { on: true, text: '5' }` */
export function stacksDraftOf(maxStacks: number | null): StacksDraft {
  return maxStacks === null ? { on: false, text: '' } : { on: true, text: String(maxStacks) };
}

/** The `maxStacks` the form sends: off → `null`, empty → 99, a whole number from 2 to 99 → it;
 *  anything else is `'invalid'`.
 *
 *  Example: `maxStacksOf({ on: true, text: '' }) // 99` · `maxStacksOf({ on: true, text: '1' }) // 'invalid'` */
export function maxStacksOf(draft: StacksDraft): number | null | 'invalid' {
  if (!draft.on) return null;
  const text = draft.text.trim();
  if (text === '') return CONDITION_STACKS_MAX;
  const stacks = Number(text);
  if (!Number.isInteger(stacks) || stacks < CONDITION_STACKS_MIN || stacks > CONDITION_STACKS_MAX) {
    return 'invalid';
  }
  return stacks;
}
