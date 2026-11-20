import {
  PLAN_LIMIT_CODE,
  type PlanLimitHolder,
  type PlanLimitReason,
  type PlanLimitResource,
  type UserPlan,
} from '@lorkarium/contracts';

/** What passed the plan: `stored + adding` against `limit` (0 for a feature the plan lacks).
 *  `reason` says which rule refused: `room` (creating past the ceiling, or a missing feature) or
 *  `readOnly` (editing an item kept past the ceiling; there `stored` is its 1-based position and
 *  `adding` is 0). `holder` says whose plan gave the ceiling when it is not the resource's
 *  usual one (the saved rolls take the greater of the table's and the person's). */
export type PlanLimitRefusal = Readonly<{
  reason: PlanLimitReason;
  resource: PlanLimitResource;
  stored: number;
  adding: number;
  limit: number;
  plan: UserPlan;
  holder?: PlanLimitHolder;
}>;

/** The one refusal for passing the plan, HTTP and Socket.IO alike: the edge answers 403 (or the
 *  ack) with `planLimit` through `plan-limit-response.ts`, so a service only throws it. */
export class PlanLimitError extends Error {
  readonly code = PLAN_LIMIT_CODE;
  readonly reason: PlanLimitReason;
  readonly resource: PlanLimitResource;
  readonly stored: number;
  readonly adding: number;
  readonly limit: number;
  readonly plan: UserPlan;
  readonly holder: PlanLimitHolder | undefined;

  constructor(refusal: PlanLimitRefusal, message: string) {
    super(message);
    this.name = 'PlanLimitError';
    this.reason = refusal.reason;
    this.resource = refusal.resource;
    this.stored = refusal.stored;
    this.adding = refusal.adding;
    this.limit = refusal.limit;
    this.plan = refusal.plan;
    this.holder = refusal.holder;
  }
}
