import type { PlanLimits } from '@lorkarium/contracts';
import { PlanLimitsBo } from '../plans/plan-limits.bo';

/** What the plan reads of a phase: whether it is one saved (its id) and its image. */
export type PhaseImageOf = Readonly<{ id?: string | undefined; imageAssetId: string | null }>;

/** The plan of the table's owner over its round cycles (spec §3.11): how many cycles a table
 *  keeps, how many phases one of them has, the image of a phase, and the cycles kept read only
 *  past the ceiling after the plan went down. `limits` is `effectiveLimitsOf(owner)`.
 *
 *  Example: `RoundCyclePlanBo.requirePhases(saved.phases, command.phases, limits)` */
export class RoundCyclePlanBo {
  /** One more cycle on a table that keeps `stored`.
   *
   *  Example: `RoundCyclePlanBo.requireCycleRoom(1, PLAN_LIMITS.free) // throws PLAN_LIMIT` */
  static requireCycleRoom(stored: number, limits: PlanLimits): void {
    PlanLimitsBo.requireRoom('roundCycles', stored, 1, limits);
  }

  /** The cycle at `rank` (how many of the table were born before it) keeps its setup editable.
   *
   *  Example: `RoundCyclePlanBo.requireEditable(1, PLAN_LIMITS.free) // throws readOnly` */
  static requireEditable(rank: number, limits: PlanLimits): void {
    PlanLimitsBo.requireEditable('roundCycles', rank, limits);
  }

  /** Whether the cycle at `rank` is read only: the `planLocked` of its DTO, by the same rule.
   *
   *  Example: `RoundCyclePlanBo.isLocked(0, PLAN_LIMITS.free) // false` */
  static isLocked(rank: number, limits: PlanLimits): boolean {
    return PlanLimitsBo.isReadOnly('roundCycles', rank, limits);
  }

  /** The phases replacing `saved` (`[]` on a new cycle): no more than the plan once they grow
   *  (a cycle past it keeps its phases and may shrink), and no new or swapped image without the
   *  feature (one a phase already has stays, and taking it out passes).
   *
   *  Example: `RoundCyclePlanBo.requirePhases([], fourPhases, PLAN_LIMITS.free) // throws PLAN_LIMIT` */
  static requirePhases(
    saved: readonly PhaseImageOf[],
    phases: readonly PhaseImageOf[],
    limits: PlanLimits,
  ): void {
    PlanLimitsBo.requireRoom(
      'roundCyclePhases',
      saved.length,
      phases.length - saved.length,
      limits,
    );
    const savedImages = new Map(saved.map(({ id, imageAssetId }) => [id, imageAssetId]));
    const newImage = phases.some(
      ({ id, imageAssetId }) =>
        imageAssetId !== null && (id === undefined || savedImages.get(id) !== imageAssetId),
    );
    PlanLimitsBo.requireFeature(
      'roundCyclePhaseImage',
      limits.roundCyclePhaseImage || !newImage,
      limits,
    );
  }
}
