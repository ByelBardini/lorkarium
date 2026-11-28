import type { TurnState } from '@lorkarium/game-core';
import {
  requireCharactersLock,
  type LockedGridMaybeCharacters,
} from '../characters/locked-characters-grid';
import { effectiveLimitsOf } from '../plans/plan-limits.bo';
import type { CombatMoment } from '../round-cycles/combat-cycles.bo';
import {
  syncCombatCycles,
  tableHasCycles,
  type CombatCycleDaos,
  type CombatCyclesSynced,
} from '../round-cycles/combat-cycles.service';
import type { ScenePo } from '../scenes/scenes.po';
import type { TokenControlPo } from '../tokens/tokens.dao';
import type { CombatDao, CombatRow } from './combat.dao';

/** What the cycles of a combat command read: the grid, its tokens and the combat. */
export type CombatForCycles = Readonly<{
  daos: CombatCycleDaos & Readonly<{ combat: Pick<CombatDao, 'findOfScene'> }>;
  scene: ScenePo;
  tokens: readonly TokenControlPo[];
  row: CombatRow | undefined;
}>;

// The combat as the turn left it: same entries, new round and turn.
/** Example: `turnedRow(row, turn)` */
export function turnedRow(row: CombatRow | undefined, turn: TurnState): CombatRow | undefined {
  if (!row) return undefined;
  return {
    ...row,
    combat: { ...row.combat, round: turn.round, currentCombatantId: turn.currentId },
  };
}

// The cycles of the combat after `moment`: the end reads the combat as it was (before it goes);
// the rest read it again, as the command left it.
/** Example: `await cyclesIn(locked, inCombat, 'round')` */
export async function cyclesIn<Daos>(
  locked: LockedGridMaybeCharacters<Daos>,
  inCombat: CombatForCycles,
  moment: CombatMoment,
): Promise<CombatCyclesSynced | null> {
  const row =
    moment === 'end' ? inCombat.row : await inCombat.daos.combat.findOfScene(inCombat.scene.id);
  if (!row) return null;
  const inEntries = new Set(row.combatants.flatMap(({ tokenIds }) => tokenIds));
  const holders = inCombat.tokens.filter(({ tokenId }) => inEntries.has(tokenId));
  return syncCombatCycles(inCombat.daos, {
    campaignId: inCombat.scene.campaignId,
    combatId: row.combat.id,
    round: row.combat.round,
    holders,
    moment,
    limits: effectiveLimitsOf(locked.scene.owner),
    requireTableLock: () => {
      requireCharactersLock(locked);
    },
  });
}

/** Locks the table stream first when the table keeps cycles (a combat command may change them)
 *  and says whether it does: a table without cycles reads nothing more of them.
 *
 *  Example: `const cycles = await lockTableIfCycles(locked, daos, campaignId)` */
export async function lockTableIfCycles<Daos>(
  locked: LockedGridMaybeCharacters<Daos>,
  daos: CombatCycleDaos,
  campaignId: string,
): Promise<boolean> {
  if (!(await tableHasCycles(daos, campaignId))) return false;
  requireCharactersLock(locked);
  return true;
}
