import { z } from 'zod';
import { USER_PLANS, userPlanDto, type UserPlan } from './user-plan.dto';

/** The plan that applies between the admin's and the paid one in force: the higher, in the order
 *  of `USER_PLANS`. Server and client rank the same way (the seal, "Seu plano").
 *
 *  Example: `higherPlanOf('free', 'lenda') // 'lenda'` */
export function higherPlanOf(plan: UserPlan, paidPlan: UserPlan | null): UserPlan {
  if (paidPlan === null) return plan;
  return USER_PLANS.indexOf(paidPlan) > USER_PLANS.indexOf(plan) ? paidPlan : plan;
}

/** The paid plan in force and until when it holds (grace days included); both null without one.
 *  Spread into a strict object and close it with `checkPaidPlanPair`. */
export const paidPlanFields = {
  paidPlan: userPlanDto.nullable(),
  paidPlanUntil: z.iso.datetime().nullable(),
};

type PaidPlanCheck = {
  value: { paidPlan: UserPlan | null; paidPlanUntil: string | null };
  issues: { push(issue: z.core.$ZodRawIssue): void };
};

/** The `.check` of an object with `paidPlanFields`: the plan and its date come together.
 *
 *  Example: `z.strictObject({ ...paidPlanFields }).check(checkPaidPlanPair)` */
export function checkPaidPlanPair(ctx: PaidPlanCheck): void {
  const { paidPlan, paidPlanUntil } = ctx.value;
  if ((paidPlan === null) === (paidPlanUntil === null)) return;
  const message = `paidPlanUntil ${JSON.stringify(paidPlanUntil)}: expected a date exactly when paidPlan is set (paidPlan ${JSON.stringify(paidPlan)})`;
  ctx.issues.push({ code: 'custom', message, input: ctx.value, path: ['paidPlanUntil'] });
}
