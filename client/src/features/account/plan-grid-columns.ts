import { PLAN_LIMITS, type PlanLimits, type UserPlan } from '@lorkarium/contracts';
import { PLAN_NAMES, planSealOf, type PlanSealHolder, type PlanSealLook } from '@/lib/plan-seal';

/** One column of the grid: whose limits it shows, its name and seal, and whether it is the
 *  account's own. */
export type PlanGridColumn = Readonly<{
  key: string;
  name: string;
  limits: PlanLimits;
  seal: PlanSealLook | null;
  current: boolean;
}>;

const OPEN_PLANS = ['free', 'apoiador', 'narrador', 'lenda'] as const;

function planColumn(plan: UserPlan, current: boolean): PlanGridColumn {
  const seal = planSealOf({ plan, admin: false, lorkariumOwner: false });
  return { key: plan, name: PLAN_NAMES[plan], limits: PLAN_LIMITS[plan], seal, current };
}

// The Dono and an admin get Amigo do Dono's numbers under their own seal: the plan is not theirs.
function specialColumn(holder: PlanSealHolder): PlanGridColumn {
  const limits = PLAN_LIMITS.amigo_do_dono;
  const seal = planSealOf(holder);
  return { key: 'special', name: 'Limites especiais', limits, seal, current: true };
}

/** The columns a person sees: the four open plans, plus Amigo do Dono only for who has it, or a
 *  "Limites especiais" column for the Dono and an admin.
 *
 *  Example: `planGridColumns({ plan: 'free', admin: true, lorkariumOwner: false }).at(-1)?.name // 'Limites especiais'` */
export function planGridColumns(holder: PlanSealHolder): readonly PlanGridColumn[] {
  const special = holder.admin || holder.lorkariumOwner;
  const columns = OPEN_PLANS.map((plan) => planColumn(plan, !special && holder.plan === plan));
  if (special) return [...columns, specialColumn(holder)];
  if (holder.plan !== 'amigo_do_dono') return columns;
  return [...columns, planColumn('amigo_do_dono', true)];
}

const MULTIPLIER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** How much a column gains over the one before it: "×4" for a multiple, "+5" from zero; `null`
 *  when there is no gain or either side is not a number.
 *
 *  Example: `planGain(5, 20) // '×4'` */
export function planGain(before: number | null, after: number | null): string | null {
  if (before === null || after === null || after <= before) return null;
  if (before === 0) return `+${MULTIPLIER.format(after)}`;
  return `×${MULTIPLIER.format(after / before)}`;
}
