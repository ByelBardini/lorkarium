/** Where a round cycle stands in a combat: the phase of this round and the one somebody chose for
 *  the next (`null` = the cycle follows its order). Ids are the cycle's phases. */
export type CycleState = Readonly<{ currentId: string | null; chosenId: string | null }>;

/** Whose a round cycle is: the table (every combat) or one character or loose token (the combats
 *  it is in). */
export type CycleHolder =
  | Readonly<{ kind: 'table' }>
  | Readonly<{ kind: 'character'; characterId: string }>
  | Readonly<{ kind: 'token'; tokenId: string }>;

/** The characters and loose tokens a combat holds, to tell which cycles play in it. */
export type CycleHoldersPresent = Readonly<{
  characterIds: ReadonlySet<string>;
  tokenIds: ReadonlySet<string>;
}>;

/** Every combat starts a cycle at its first phase, with nothing chosen.
 *
 *  Example: `cycleStart(['nova', 'crescente']) // { currentId: 'nova', chosenId: null }` */
export function cycleStart(phaseIds: readonly string[]): CycleState {
  return { currentId: phaseIds[0] ?? null, chosenId: null };
}

/** The phase the next round plays: the chosen one while it is still in the cycle, else the one
 *  after the current (the first after the last, or when the current one is gone).
 *
 *  Example: `nextPhaseOf(moon, { currentId: 'cheia', chosenId: null }) // 'minguante'` */
export function nextPhaseOf(phaseIds: readonly string[], state: CycleState): string | null {
  if (state.chosenId !== null && phaseIds.includes(state.chosenId)) return state.chosenId;
  const index = state.currentId === null ? -1 : phaseIds.indexOf(state.currentId);
  if (index === -1) return phaseIds[0] ?? null;
  return phaseIds[(index + 1) % phaseIds.length] ?? null;
}

/** The start of a new round: the cycle moves to its next phase and the choice is spent, so the
 *  round after goes on from the chosen phase.
 *
 *  Example: `turnCycle(moon, { currentId: 'nova', chosenId: 'cheia' }) // { currentId: 'cheia', chosenId: null }` */
export function turnCycle(phaseIds: readonly string[], state: CycleState): CycleState {
  return { currentId: nextPhaseOf(phaseIds, state), chosenId: null };
}

/** The cycles that play in a combat: the table's, and those whose holder is in it, in list order.
 *
 *  Example: `activeCyclesOf(cycles, { characterIds: new Set([lyraId]), tokenIds: new Set() })` */
export function activeCyclesOf<T extends Readonly<{ holder: CycleHolder }>>(
  cycles: readonly T[],
  present: CycleHoldersPresent,
): T[] {
  return cycles.filter(({ holder }) => {
    if (holder.kind === 'table') return true;
    if (holder.kind === 'character') return present.characterIds.has(holder.characterId);
    return present.tokenIds.has(holder.tokenId);
  });
}
