import { requireReadableDice } from '../dice/dice-roll.bo';
import { PlanLimitsBo, type MemberSavedRollLimits } from '../plans/plan-limits.bo';
import { SavedRollFoldersLimitError, SavedRollsLimitError } from './saved-rolls.error';

/** The rules of one member's saved rolls: every piece reads as dice notation (the game-core's,
 *  the same the roll uses) and a member keeps at most what the greater of the table owner's plan
 *  and its own allows (`memberMemberSavedRollLimitsOf`), never
 *  past `maxSaved` (the technical ceiling) per table.
 *
 *  Example: `new SavedRollRulesBo(SAVED_ROLLS_MAX).requireReadable(['1d20+5', '1d4'])` */
export class SavedRollRulesBo {
  constructor(private readonly maxSaved: number) {}

  /** Throws `INVALID_DICE_EXPRESSION` naming the piece (counted from 1, as the person sees the
   *  tray) with the game-core's reason, or the whole roll when the composition is refused
   *  (more than 10 pieces, more than 1000 dice summed).
   *
   *  Example: `rules.requireReadable(['1d20', '2d'])` → throws "part 2 ("2d") cannot be read: …" */
  requireReadable(expressions: readonly string[]): void {
    requireReadableDice(expressions);
  }

  /** Throws `PLAN_LIMIT` (`savedRolls`, with the holder of the ceiling) when one more roll would
   *  pass the plan, and `SAVED_ROLLS_LIMIT` when it would pass the technical ceiling.
   *
   *  Example: `rules.requireRoomFor(5, { limits: PLAN_LIMITS.free, holder: 'table' })` → throws "would have 6 savedRolls; …" */
  requireRoomFor(keptCount: number, ceiling: MemberSavedRollLimits): void {
    PlanLimitsBo.requireRoom('savedRolls', keptCount, 1, ceiling.limits, ceiling.holder);
    const wanted = keptCount + 1;
    if (wanted <= this.maxSaved) return;
    throw new SavedRollsLimitError(wanted, this.maxSaved);
  }

  /** Throws `PLAN_LIMIT` (`readOnly`) when the roll at `rank` (born after `rank` others of the
   *  member at the table) is past the ceiling: its name and parts are read only; moving it to a
   *  folder and deleting it never come here.
   *
   *  Example: `rules.requireConfigurable(3, { limits: PLAN_LIMITS.free, holder: 'table' })` → throws "saved roll 4 of plan free is read only …" */
  requireConfigurable(rank: number, ceiling: MemberSavedRollLimits): void {
    PlanLimitsBo.requireEditable('savedRolls', rank, ceiling.limits, ceiling.holder);
  }

  /** Whether the roll at `rank` is past the ceiling, the `planLocked` of its DTO.
   *
   *  Example: `rules.isPlanLocked(3, { limits: PLAN_LIMITS.free, holder: 'table' }) // true` */
  isPlanLocked(rank: number, ceiling: MemberSavedRollLimits): boolean {
    return PlanLimitsBo.isReadOnly('savedRolls', rank, ceiling.limits);
  }
}

/** Throws `PLAN_LIMIT` (`savedRollFolders`) when one more folder would pass the plan (free keeps
 *  none), and `SAVED_ROLL_FOLDERS_LIMIT` when it would pass the technical ceiling.
 *
 *  Example: `requireFolderRoom(50, SAVED_ROLL_FOLDERS_MAX, ceiling)` → throws "saving would keep 51 of 50 …" */
export function requireFolderRoom(
  keptCount: number,
  maxFolders: number,
  ceiling: MemberSavedRollLimits,
): void {
  PlanLimitsBo.requireRoom('savedRollFolders', keptCount, 1, ceiling.limits, ceiling.holder);
  const wanted = keptCount + 1;
  if (wanted <= maxFolders) return;
  throw new SavedRollFoldersLimitError(wanted, maxFolders);
}
