import { PLAN_LIMITS, USER_PLANS, type UserPlan } from '@lorkarium/contracts';
import { cn } from '@/lib/utils';
import { PLAN_GRID_ROWS } from './plan-grid';
import { PLAN_NAMES } from '@/lib/plan-seal';

/** The grid of the four plans side by side, the account's own column marked "Seu plano"
 *  (`aria-current`); the numbers come from `PLAN_LIMITS` of the contracts, never retyped.
 *
 *  Example: `<PlanGridTable current="free" />` */
export function PlanGridTable({ current }: Readonly<{ current: UserPlan }>): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <caption className="pb-3 text-left font-semibold">Limites por plano</caption>
        <thead>
          <tr className="border-b border-divider">
            <th scope="col" className="py-2 pr-4 text-left font-normal text-muted-foreground">
              Recurso
            </th>
            {USER_PLANS.map((plan) => (
              <PlanColumnHeader key={plan} plan={plan} current={plan === current} />
            ))}
          </tr>
        </thead>
        <tbody>
          {PLAN_GRID_ROWS.map((row) => (
            <tr key={row.label} className="border-b border-divider/60">
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                {row.label}
              </th>
              {USER_PLANS.map((plan) => (
                <td key={plan} className={cellClass(plan === current)}>
                  {row.cellOf(PLAN_LIMITS[plan])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanColumnHeader({
  plan,
  current,
}: Readonly<{ plan: UserPlan; current: boolean }>): React.JSX.Element {
  return (
    <th scope="col" aria-current={current || undefined} className={cellClass(current)}>
      <span className="block font-semibold">{PLAN_NAMES[plan]}</span>
      {current && (
        <span className="block text-[11px] font-semibold tracking-[0.12em] text-primary uppercase">
          Seu plano
        </span>
      )}
    </th>
  );
}

function cellClass(current: boolean): string {
  return cn('px-3 py-2 text-left align-top tabular-nums', current && 'bg-muted');
}
