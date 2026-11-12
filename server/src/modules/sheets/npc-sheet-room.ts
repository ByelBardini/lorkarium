import type { PlanLimits } from '@lorkarium/contracts';
import { PlanLimitsBo } from '../plans/plan-limits.bo';
import type { SheetHolderPlacePo, SheetsDao } from './sheets.dao';
import { toHolderColumns } from './sheets.mapper';

/** Where a sheet goes: the token holding it now (`null` for nobody or a character) and its new
 *  holder (`null` for nobody). */
export type NpcSheetMove = Readonly<{
  campaignId: string;
  from: string | null;
  to: SheetHolderPlacePo | null;
}>;

/** Refuses with `PLAN_LIMIT` (`npcSheets`) a sheet a token comes to hold past the owner's plan.
 *  Only a sheet that no token held counts: moving one between tokens adds no NPC sheet, and a
 *  character's sheet (a player's) is never one. Runs under the table's lock, before the write.
 *
 *  Example: `await requireNpcSheetRoom(daos, { campaignId, from: null, to: holder }, limits)` */
export async function requireNpcSheetRoom(
  daos: Readonly<{ sheets: Pick<SheetsDao, 'countHeldByTokens'> }>,
  move: NpcSheetMove,
  limits: PlanLimits,
): Promise<void> {
  if (move.from !== null || toHolderColumns(move.to).tokenId === null) return;
  const stored = await daos.sheets.countHeldByTokens(move.campaignId);
  PlanLimitsBo.requireRoom('npcSheets', stored, 1, limits);
}
