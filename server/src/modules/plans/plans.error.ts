import { PLAN_LIMIT_CODE, type PlanLimitResource, type UserPlan } from '@lorkarium/contracts';

/** What passed the plan: `stored + adding` against `limit` (0 for a feature the plan lacks). */
export type PlanLimitRefusal = Readonly<{
  resource: PlanLimitResource;
  stored: number;
  adding: number;
  limit: number;
  plan: UserPlan;
}>;

/** The one refusal for passing the plan, HTTP and Socket.IO alike: the edge answers 403 (or the
 *  ack) with `planLimit` through `plan-limit-response.ts`, so a service only throws it. */
export class PlanLimitError extends Error {
  readonly code = PLAN_LIMIT_CODE;
  readonly resource: PlanLimitResource;
  readonly stored: number;
  readonly adding: number;
  readonly limit: number;
  readonly plan: UserPlan;

  constructor(refusal: PlanLimitRefusal, message: string) {
    super(message);
    this.name = 'PlanLimitError';
    this.resource = refusal.resource;
    this.stored = refusal.stored;
    this.adding = refusal.adding;
    this.limit = refusal.limit;
    this.plan = refusal.plan;
  }
}
