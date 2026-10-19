import type { CombatDto } from '@lorkarium/contracts';
import { orderCombatants } from '@lorkarium/game-core';
import type { CombatState } from './combat.bo';
import type { CombatRow } from './combat.dao';

/** Combat rows + who controls each token → the state the rule decides on, each entry with its
 *  tokens and their controllers.
 *
 *  Example: `toCombatState(row, (tokenId) => controllersByToken.get(tokenId) ?? [])` */
export function toCombatState(
  row: CombatRow,
  controllersOf: (tokenId: string) => readonly string[],
): CombatState {
  const { id, round, currentCombatantId } = row.combat;
  const combatants = row.combatants.map(({ id: combatantId, tokenIds, initiative, tieOrder }) => ({
    id: combatantId,
    tokens: tokenIds.map((tokenId) => ({ tokenId, controllerIds: controllersOf(tokenId) })),
    initiative,
    tieOrder,
  }));
  return { id, round, currentCombatantId, combatants };
}

/** The combat clients see, with the combatants already in turn order.
 *
 *  Example: `toCombatDto(await combat.findOfScene(scene.id))` */
export function toCombatDto(row: CombatRow): CombatDto {
  const { id, round, currentCombatantId } = row.combat;
  const combatants = orderCombatants(row.combatants).map(
    ({ id: combatantId, name, tokenIds, initiative, tieOrder }) => ({
      id: combatantId,
      name,
      tokenIds: [...tokenIds],
      initiative,
      tieOrder,
    }),
  );
  return { id, round, currentCombatantId, combatants };
}
