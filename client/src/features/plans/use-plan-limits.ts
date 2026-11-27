import {
  savedRollLimitsOf,
  savedTokenLimitsOf,
  type MemberPlanLimits,
  type PlanLimits,
  type UserPlan,
} from '@lorkarium/contracts';
import { createContext, useContext, useMemo } from 'react';
import type { PlanReadOnlyResource } from '@/lib/plan-limit-message';
import type { AccountLimits } from '@/stores/session-store';
import { planLockGate, type PlanGate } from './plan-gate';
/** The limits in force around a component: the signed-in account's and the table's (its owner's).
 *  Either is `null` where it is not known (signed out, outside a table): nothing is stopped. */
export type PlanLimitsInForce = Readonly<{
  account: AccountLimits | null;
  table: PlanLimits | null;
}>;

/** The signed-in account's plan, given by `AccountPlanProvider`. */
export const AccountPlanContext = createContext<AccountLimits | null>(null);
/** The table's limits, given by `TablePlanLimitsProvider`. */
export const TablePlanLimitsContext = createContext<PlanLimits | null>(null);

/** The account's and the table's limits around this component.
 *
 *  Example: `const { table } = usePlanLimits(); countGate(table, 'scenes', scenes.length)` */
export function usePlanLimits(): PlanLimitsInForce {
  const account = useContext(AccountPlanContext);
  const table = useContext(TablePlanLimitsContext);
  return useMemo(() => ({ account, table }), [account, table]);
}

/** Whether the configuration of `item` is editable under the table's limits around: closed, with
 *  the read-only sentence, when the server marked it `planLocked`. A saved roll is the person's:
 *  its ceiling is the greater of the table's and the account's own (`savedRollLimitsOf`).
 *
 *  Example: `const lock = usePlanLock('scenes', scene); <Button disabled={!lock.open} />` */
export function usePlanLock(
  resource: PlanReadOnlyResource,
  item: Readonly<{ planLocked: boolean }> | null,
): PlanGate {
  const table = useContext(TablePlanLimitsContext);
  const account = useContext(AccountPlanContext);
  return planLockGate(
    memberPlanOf(resource, table, account),
    resource,
    item ?? { planLocked: false },
  );
}

type MemberLimitsOf = (table: PlanLimits, personalPlan: UserPlan) => MemberPlanLimits;

// The saved rolls and tokens are the person's: the greater of the table's grid and their own.
const MEMBER_LIMITS: Readonly<Partial<Record<PlanReadOnlyResource, MemberLimitsOf>>> = {
  savedRolls: savedRollLimitsOf,
  savedTokens: savedTokenLimitsOf,
};

/** The limits a resource of the person is checked against around this component: the member's
 *  own items by the greater of the table's and the account's plan, the rest by the table's.
 *
 *  Example: `memberPlanOf('savedTokens', PLAN_LIMITS.free, apoiador)?.maxSavedTokens // 5` */
export function memberPlanOf(
  resource: PlanReadOnlyResource,
  table: PlanLimits | null,
  account: AccountLimits | null,
): PlanLimits | null {
  const limitsOf = MEMBER_LIMITS[resource];
  if (limitsOf === undefined || table === null || account === null) return table;
  return limitsOf(table, account.limits.plan).limits;
}
