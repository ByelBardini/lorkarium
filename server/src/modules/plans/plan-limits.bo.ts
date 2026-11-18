import {
  PLAN_COUNT_LIMIT_KEY,
  PLAN_LIMITS,
  type PlanCountResource,
  type PlanFeatureResource,
  type PlanLimits,
  type UserPlan,
  higherPlanOf,
} from '@lorkarium/contracts';
import { PlanLimitError } from './plans.error';

/** What decides the limits of an account: its global role, the plan set by the admin, the paid
 *  plan still in force (`activePaidPlanSql`; absent or null: none) and whether it is the Dono do
 *  Lorkarium (`OWNER_USERNAME`, read by `lorkariumOwnerSql`). */
export type PlanAccount = Readonly<{
  role: 'user' | 'admin';
  plan: UserPlan;
  activePaidPlan?: UserPlan | null;
  lorkariumOwner: boolean;
}>;

/** The plan that applies to an account: the higher of the admin's and the paid one, ranked by
 *  the order of `USER_PLANS`. Neither writer touches the other's column, so a courtesy never
 *  shrinks a purchase nor the other way round.
 *
 *  Example: `effectivePlanOf({ plan: 'free', activePaidPlan: 'lenda' }) // 'lenda'` */
export function effectivePlanOf(account: Pick<PlanAccount, 'plan' | 'activePaidPlan'>): UserPlan {
  return higherPlanOf(account.plan, account.activePaidPlan ?? null);
}

/** The paid plan of a whole `users` row while its end is ahead of `now`, null after: what
 *  `activePaidPlanSql` answers in a query, for the reads that already hold the row (`/me`).
 *
 *  Example: `activePaidPlanOf({ paidPlan: 'lenda', paidPlanUntil: tomorrow }, now) // 'lenda'` */
export function activePaidPlanOf(
  row: Readonly<{ paidPlan: UserPlan | null; paidPlanUntil: Date | null }>,
  now: Date,
): UserPlan | null {
  if (row.paidPlan === null || row.paidPlanUntil === null) return null;
  return row.paidPlanUntil.getTime() > now.getTime() ? row.paidPlan : null;
}

/** The limits that apply to an account (to every table it owns, too): the admin and the Dono do
 *  Lorkarium have no plan limit, so they get the grid of `amigo_do_dono` (only the technical
 *  ceilings) whatever the plan.
 *
 *  Example: `effectiveLimitsOf({ role: 'user', plan: 'free', lorkariumOwner: false }).maxCampaigns // 1` */
export function effectiveLimitsOf(account: PlanAccount): PlanLimits {
  if (account.role === 'admin' || account.lorkariumOwner) return PLAN_LIMITS.amigo_do_dono;
  return PLAN_LIMITS[effectivePlanOf(account)];
}

/** Whether the account of `username` is the Dono do Lorkarium, `ownerUsername` being the
 *  server's OWNER_USERNAME (null: nobody). The queries ask the same with `lorkariumOwnerSql`.
 *
 *  Example: `isLorkariumOwner('byel', 'byel') // true` */
export function isLorkariumOwner(username: string, ownerUsername: string | null): boolean {
  return ownerUsername !== null && username === ownerUsername;
}

/** Whether the account's own customizations are open (custom color on the profile, the dice and
 *  the saved colors; dice texture; animated photo): every plan above free (the Apoiador included),
 *  the admin and the Dono do Lorkarium.
 *
 *  Example: `customizationAllowed({ role: 'user', plan: 'apoiador', lorkariumOwner: false }) // true` */
export function customizationAllowed(account: PlanAccount): boolean {
  // The Apoiador's tables keep the Grátis palette (`customColor: false`); its own account opens.
  return effectivePlanOf(account) === 'apoiador' || effectiveLimitsOf(account).customColor;
}

/** The counted resources whose excess goes read only when the plan goes down (the NPC sheets,
 *  the tables and the members only refuse the new one). */
export type PlanEditableResource = Extract<
  PlanCountResource,
  | 'scenes'
  | 'libraryMaps'
  | 'sheetTemplates'
  | 'documentTabs'
  | 'savedRolls'
  | 'lights'
  | 'tokenBars'
  | 'tokenForms'
  | 'patrols'
  | 'sightBlockers'
>;

const EDITABLE_ITEM_NAME: Readonly<Record<PlanEditableResource, string>> = {
  scenes: 'scene',
  libraryMaps: 'library map',
  sheetTemplates: 'sheet template',
  documentTabs: 'document tab',
  savedRolls: 'saved roll',
  lights: 'light',
  tokenBars: 'token bar',
  tokenForms: 'token form',
  patrols: 'patrol',
  sightBlockers: 'sight blocker',
};

/** The checks of the plan a service runs after its lock, before writing. */
export class PlanLimitsBo {
  /** Throws `PLAN_LIMIT` when `stored + adding` passes the plan's ceiling of `resource`. Adding
   *  nothing always passes (who is already past keeps what it has), and so does a ceiling equal to
   *  the technical one: that one keeps its own error of today, the same for every plan.
   *
   *  Example: `PlanLimitsBo.requireRoom('scenes', countOfScenes, 1, limits)` */
  static requireRoom(
    resource: PlanCountResource,
    stored: number,
    adding: number,
    limits: PlanLimits,
  ): void {
    const key = PLAN_COUNT_LIMIT_KEY[resource];
    const limit = limits[key];
    if (limit === null || adding <= 0 || stored + adding <= limit) return;
    if (isTechnicalCeiling(limit, PLAN_LIMITS.amigo_do_dono[key])) return;
    const refusal = { reason: 'room', resource, stored, adding, limit, plan: limits.plan } as const;
    const message = `would have ${stored + adding} ${resource}; plan ${limits.plan} allows at most ${limit}`;
    throw new PlanLimitError(refusal, message);
  }

  /** Whether the item at `rank` is kept read only by the plan: the `planLocked` of a list DTO,
   *  by the same rule `requireEditable` refuses with.
   *
   *  Example: `PlanLimitsBo.isReadOnly('scenes', 3, PLAN_LIMITS.free) // true` */
  static isReadOnly(resource: PlanEditableResource, rank: number, limits: PlanLimits): boolean {
    const key = PLAN_COUNT_LIMIT_KEY[resource];
    const limit = limits[key];
    if (limit === null || rank < limit) return false;
    return !isTechnicalCeiling(limit, PLAN_LIMITS.amigo_do_dono[key]);
  }

  /** Throws `PLAN_LIMIT` (`reason: 'readOnly'`) when the item is past the plan's ceiling of
   *  `resource`: after the plan went down, the oldest ones keep their configuration and the rest
   *  is read only. `rank` is how many items of the same group (table, document, scene, token or
   *  member) were born before this one, by `(created_at, id)`, from 0. A rank under the ceiling
   *  passes, and so do a null ceiling and one equal to the technical one (as in `requireRoom`).
   *  Call it only on a change of configuration: play and deleting never pass through here.
   *
   *  Example: `PlanLimitsBo.requireEditable('scenes', 3, PLAN_LIMITS.free) // throws: scene 4 of plan free is read only (plan allows 3)` */
  static requireEditable(resource: PlanEditableResource, rank: number, limits: PlanLimits): void {
    if (!PlanLimitsBo.isReadOnly(resource, rank, limits)) return;
    const limit = limits[PLAN_COUNT_LIMIT_KEY[resource]] as number;
    const refusal = {
      reason: 'readOnly',
      resource,
      stored: rank + 1,
      adding: 0,
      limit,
      plan: limits.plan,
    } as const;
    const item = `${EDITABLE_ITEM_NAME[resource]} ${rank + 1}`;
    const message = `${item} of plan ${limits.plan} is read only (plan allows ${limit})`;
    throw new PlanLimitError(refusal, message);
  }

  /** Throws `PLAN_LIMIT` (limit 0) when the plan lacks `resource`; `allowed` is the flag read
   *  from the limits (`limits.sceneCopy`, `limits.auraKinds.includes(kind)`) or
   *  `customizationAllowed(account)` for the account's own.
   *
   *  Example: `PlanLimitsBo.requireFeature('sceneCopy', limits.sceneCopy, limits)` */
  static requireFeature(resource: PlanFeatureResource, allowed: boolean, limits: PlanLimits): void {
    if (allowed) return;
    const refusal = {
      reason: 'room',
      resource,
      stored: 0,
      adding: 1,
      limit: 0,
      plan: limits.plan,
    } as const;
    throw new PlanLimitError(refusal, `plan ${limits.plan} does not include ${resource}`);
  }
}

function isTechnicalCeiling(limit: number, technical: number | null): boolean {
  return technical !== null && limit >= technical;
}
