import type { Initiative } from './initiative.vo';

/** A combatant as the order sees it: its initiative and its place among equals. */
export type OrderEntry = Readonly<{ id: string; initiative: Initiative; tieOrder: number }>;

export type TieDirection = 'up' | 'down';

/** The turn order (spec §3.5): highest initiative first, the ones without it at the end, and a
 *  tie broken by the order of entry (which the master can change within the tie).
 *
 *  Example: `orderCombatants(combatants).map(({ id }) => id)` */
export function orderCombatants<T extends OrderEntry>(combatants: readonly T[]): T[] {
  return [...combatants].sort(
    (a, b) => rankOf(b.initiative) - rankOf(a.initiative) || a.tieOrder - b.tieOrder,
  );
}

/** Swaps a combatant with its neighbour in the order when both have the same initiative
 *  ("↑" / "↓" of the master); against another initiative nothing changes.
 *
 *  Example: `moveWithinTie(combatants, lyraId, 'up')` */
export function moveWithinTie<T extends OrderEntry>(
  combatants: readonly T[],
  id: string,
  direction: TieDirection,
): readonly T[] {
  const ordered = orderCombatants(combatants);
  const index = ordered.findIndex((entry) => entry.id === id);
  const moving = ordered[index];
  const neighbour = ordered[direction === 'up' ? index - 1 : index + 1];
  if (!moving || !neighbour || neighbour.initiative !== moving.initiative) return combatants;
  return combatants.map((entry) => {
    if (entry.id === moving.id) return { ...entry, tieOrder: neighbour.tieOrder };
    if (entry.id === neighbour.id) return { ...entry, tieOrder: moving.tieOrder };
    return entry;
  });
}

// `null` sorts below every real roll, −999 included.
function rankOf(value: Initiative): number {
  return value ?? -Infinity;
}
