import type { SideLimits } from './asset-upload.bo';

/** The sides a plan lets a table keep (the `maxMapSide`/`maxBackgroundSide` of its `PlanLimits`). */
export type PlanSides = Readonly<{ maxMapSide: number; maxBackgroundSide: number }>;

// The time to attach a file after sending it: a file nothing uses yet still counts and stays.
export const LOOSE_ASSET_GRACE_MS = 24 * 60 * 60 * 1000;

/** The sides kept per purpose on a table of this plan: the map and the background never pass
 *  the plan's side, nor the technical one; every other purpose keeps the technical side.
 *
 *  Example: `planSidesOf(ASSET_MAX_SIDE, PLAN_LIMITS.free).library_map // 4096` */
export function planSidesOf(base: SideLimits, plan: PlanSides): SideLimits {
  return {
    ...base,
    library_map: Math.min(base.library_map, plan.maxMapSide),
    background: Math.min(base.background, plan.maxBackgroundSide),
  };
}

/** The instant before which a file that nothing references is loose: it stops counting against
 *  the owner's storage and the sweep deletes it.
 *
 *  Example: `looseCutoffOf(new Date('2026-11-11T12:00:00Z')) // 2026-11-10T12:00:00Z` */
export function looseCutoffOf(now: Date): Date {
  return new Date(now.getTime() - LOOSE_ASSET_GRACE_MS);
}
