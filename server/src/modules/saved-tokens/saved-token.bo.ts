import { PlanLimitsBo, type MemberSavedRollLimits } from '../plans/plan-limits.bo';
import { SavedTokenFoldersLimitError, SavedTokensLimitError } from './saved-tokens.error';

/** The technical ceilings, passed in by the plugin: the BO does not read the contract. */
export type SavedTokenMaximums = Readonly<{ tokens: number; folders: number }>;

/** The ceilings of one member's saved tokens at a table: the greater of the table owner's plan and
 *  the member's own (`memberSavedTokenLimitsOf`), never past the technical ceilings.
 *
 *  Example: `new SavedTokenRulesBo({ tokens: 50, folders: 20 }).requireRoomFor(4, ceiling)` */
export class SavedTokenRulesBo {
  constructor(private readonly maximums: SavedTokenMaximums) {}

  /** Throws `PLAN_LIMIT` (`savedTokens`, with the holder of the ceiling) when one more token would
   *  pass the plan, and `SAVED_TOKENS_LIMIT` when it would pass the technical ceiling.
   *
   *  Example: `rules.requireRoomFor(0, { limits: PLAN_LIMITS.free, holder: 'table' })` → throws "would have 1 savedTokens; …" */
  requireRoomFor(keptCount: number, ceiling: MemberSavedRollLimits): void {
    PlanLimitsBo.requireRoom('savedTokens', keptCount, 1, ceiling.limits, ceiling.holder);
    const wanted = keptCount + 1;
    if (wanted <= this.maximums.tokens) return;
    throw new SavedTokensLimitError(wanted, this.maximums.tokens);
  }

  /** Throws `PLAN_LIMIT` (`savedTokenFolders`) when one more folder would pass the plan, and
   *  `SAVED_TOKEN_FOLDERS_LIMIT` when it would pass the technical ceiling.
   *
   *  Example: `rules.requireFolderRoom(20, ceiling)` → throws "saving would keep 21 of 20 …" */
  requireFolderRoom(keptCount: number, ceiling: MemberSavedRollLimits): void {
    PlanLimitsBo.requireRoom('savedTokenFolders', keptCount, 1, ceiling.limits, ceiling.holder);
    const wanted = keptCount + 1;
    if (wanted <= this.maximums.folders) return;
    throw new SavedTokenFoldersLimitError(wanted, this.maximums.folders);
  }

  /** Throws `PLAN_LIMIT` (`readOnly`) when the token at `rank` (born after `rank` others of the
   *  member at the table) is past the ceiling: its name and token are read only; spawning it,
   *  moving it to a folder and deleting it never come here.
   *
   *  Example: `rules.requireConfigurable(5, { limits: apoiadorLimits, holder: 'account' })` → throws "saved token 6 … is read only" */
  requireConfigurable(rank: number, ceiling: MemberSavedRollLimits): void {
    PlanLimitsBo.requireEditable('savedTokens', rank, ceiling.limits, ceiling.holder);
  }

  /** Whether the token at `rank` is past the ceiling, the `planLocked` of its DTO.
   *
   *  Example: `rules.isPlanLocked(5, { limits: apoiadorLimits, holder: 'account' }) // true` */
  isPlanLocked(rank: number, ceiling: MemberSavedRollLimits): boolean {
    return PlanLimitsBo.isReadOnly('savedTokens', rank, ceiling.limits);
  }
}
