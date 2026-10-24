/** What a condition piles up: its stacks and up to how many (`maxStacks: null` = it does not). */
export type StackedCondition = Readonly<{ maxStacks: number | null; stacks: number }>;

/** The stack count a condition shows: its stacks when it stacks, `null` when it does not (a
 *  non-stacking condition is always 1 and shows no count).
 *
 *  Example: `shownStacksOf({ maxStacks: 5, stacks: 3 }) // 3` */
export function shownStacksOf(condition: StackedCondition): number | null {
  return condition.maxStacks === null ? null : condition.stacks;
}

/** The stacks as read: "3 stacks" or "1 stack".
 *
 *  Example: `stacksText(3) // '3 stacks'` */
export function stacksText(stacks: number): string {
  return stacks === 1 ? '1 stack' : `${stacks} stacks`;
}
