import type { CombatDto } from '@lorkarium/contracts';
import { orderCombatants } from '@lorkarium/game-core';
import type { CombatState } from './combat.bo';
import type { CombatRow } from './combat.dao';

/** Combat rows + who controls each token → the state the rule decides on.
 *
 *  Example: `toCombatState(row, (tokenId) => controllersByToken.get(tokenId) ?? [])` */
export function toCombatState(
  row: CombatRow,
  controllersOf: (tokenId: string) => readonly string[],
): CombatState {
  const { id, round, currentCombatantId } = row.combat;
  const combatants = row.combatants.map(({ id: combatantId, tokenId, initiative, tieOrder }) => ({
    id: combatantId,
    tokenId,
    initiative,
    tieOrder,
    controllerIds: controllersOf(tokenId),
  }));
  return { id, round, currentCombatantId, combatants };
}

/** The combat clients see, with the combatants already in turn order.
 *
 *  Example: `toCombatDto(await combat.findOfScene(scene.id))` */
export function toCombatDto(row: CombatRow): CombatDto {
  const { id, round, currentCombatantId } = row.combat;
  const combatants = orderCombatants(row.combatants).map(
    ({ id: combatantId, tokenId, initiative, tieOrder }) => ({
      id: combatantId,
      tokenId,
      initiative,
      tieOrder,
    }),
  );
  return { id, round, currentCombatantId, combatants };
}
