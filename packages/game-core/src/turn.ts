/** Whose turn it is and in which round; the turn follows the combatant, not a position. */
export type TurnState = Readonly<{ round: number; currentId: string | null }>;

export type AdvancedTurn = TurnState & Readonly<{ endedTurnOf: string | null }>;

/** A condition counting rounds down; `null` lasts until removed. */
export type Timed = Readonly<{ remainingRounds: number | null }>;

/** "Próximo turno" / "Passar a vez": the next combatant in the current order, and a new round
 *  after the last. `endedTurnOf` is whose conditions count down now.
 *
 *  Example: `advanceTurn(order.map(({ id }) => id), { round, currentId })` */
export function advanceTurn(order: readonly string[], state: TurnState): AdvancedTurn {
  const first = order[0] ?? null;
  const index = state.currentId === null ? -1 : order.indexOf(state.currentId);
  if (index === -1) return { round: state.round, currentId: first, endedTurnOf: null };
  const next = order[index + 1];
  const ended = state.currentId;
  if (next) return { round: state.round, currentId: next, endedTurnOf: ended };
  return { round: state.round + 1, currentId: first, endedTurnOf: ended };
}

/** "Turno anterior" (master): the previous combatant, back across a round; the first turn of
 *  round 1 stays. It does not give back conditions that already expired (spec §12).
 *
 *  Example: `retreatTurn(ids, { round: 2, currentId: kaelId })` */
export function retreatTurn(order: readonly string[], state: TurnState): TurnState {
  const index = state.currentId === null ? -1 : order.indexOf(state.currentId);
  if (index > 0) return { round: state.round, currentId: order[index - 1] ?? null };
  if (index === 0 && state.round > 1) {
    return { round: state.round - 1, currentId: order.at(-1) ?? null };
  }
  return state;
}

/** The turn after `removedId` leaves the combat (taken out, or its token deleted): whoever was on
 *  turn keeps it, unless it was the one removed — then the next one plays.
 *
 *  Example: `nextAfterRemoval(idsBefore, goblinId, { round, currentId })` */
export function nextAfterRemoval(
  orderBefore: readonly string[],
  removedId: string,
  state: TurnState,
): TurnState {
  if (state.currentId !== removedId) return state;
  const remaining = orderBefore.filter((id) => id !== removedId);
  if (remaining.length === 0) return { round: state.round, currentId: null };
  const index = orderBefore.indexOf(removedId);
  const next = orderBefore.slice(index + 1).find((id) => id !== removedId);
  if (next) return { round: state.round, currentId: next };
  return { round: state.round + 1, currentId: remaining[0] ?? null };
}

/** The end of a combatant's turn for its conditions: each one counts down a round, and the ones
 *  at their last round expire ("Atordoado 1" takes exactly the next turn of whoever got it).
 *
 *  Example: `const { kept, expired } = tickAtTurnEnd(conditionsOf(endedTurnOf))` */
export function tickAtTurnEnd<T extends Timed>(
  conditions: readonly T[],
): Readonly<{ kept: T[]; expired: T[] }> {
  const kept: T[] = [];
  const expired: T[] = [];
  for (const condition of conditions) {
    const left = condition.remainingRounds;
    if (left === null) kept.push(condition);
    else if (left <= 1) expired.push(condition);
    else kept.push({ ...condition, remainingRounds: left - 1 });
  }
  return { kept, expired };
}
