import type { UserPlan } from '@lorkarium/contracts';
import { PLAN_NAMES } from './plan-seal';

const DAY = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** The line of "Seu plano" that says which plan was bought and until when it holds (grace
 *  included, as the server counts it), in local time; null without a paid plan.
 *
 *  Example: `paidPlanLine('lenda', '2026-12-16T15:00:00.000Z') // 'Lenda até 16/12/2026'` */
export function paidPlanLine(
  paidPlan: UserPlan | null,
  paidPlanUntil: string | null,
): string | null {
  if (paidPlan === null || paidPlanUntil === null) return null;
  return `${PLAN_NAMES[paidPlan]} até ${dayOf(paidPlanUntil)}`;
}

/** An ISO instant as the day the screens write, in local time.
 *
 *  Example: `dayOf('2026-12-16T15:00:00.000Z') // '16/12/2026'` */
export function dayOf(iso: string): string {
  return DAY.format(new Date(iso));
}
