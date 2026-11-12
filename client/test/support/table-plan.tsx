import type { PlanLimits } from '@lorkarium/contracts';
import { TablePlanLimitsProvider } from '@/features/plans/plan-limits-providers';
import { testDependencies } from './app-dependencies';
import { VHARN } from './campaigns-api-fake';

/** `node` inside VHARN's table on a plan with `limits` (the route's limits: no table opened).
 *
 *  Example: `render(onTablePlan(PLAN_LIMITS.free, <AuraEditor … />))` */
export function onTablePlan(limits: PlanLimits, node: React.ReactNode): React.JSX.Element {
  return (
    <TablePlanLimitsProvider
      openTables={testDependencies().openTables}
      campaign={{ id: VHARN.id, limits }}
    >
      {node}
    </TablePlanLimitsProvider>
  );
}
