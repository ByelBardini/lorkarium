export type Combatant = { name: string; initiative: number };

/** Combatants sorted by initiative, highest first; ties keep the given order.
 *
 *  Example: `turnOrder([{ name: 'a', initiative: 1 }, { name: 'b', initiative: 9 }])[0].name // 'b'` */
export function turnOrder(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((first, second) => second.initiative - first.initiative);
}
