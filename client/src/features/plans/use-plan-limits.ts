import type { PlanLimits } from '@lorkarium/contracts';
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
 *  the read-only sentence, when the server marked it `planLocked`.
 *
 *  Example: `const lock = usePlanLock('scenes', scene); <Button disabled={!lock.open} />` */
export function usePlanLock(
  resource: PlanReadOnlyResource,
  item: Readonly<{ planLocked: boolean }> | null,
): PlanGate {
  const table = useContext(TablePlanLimitsContext);
  return planLockGate(table, resource, item ?? { planLocked: false });
}
