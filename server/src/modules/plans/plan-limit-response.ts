import type { ApiErrorDto } from '@lorkarium/contracts';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { PlanLimitError } from './plans.error';

/** The HTTP status of every `PLAN_LIMIT`: the request is understood, the plan refuses it. */
export const PLAN_LIMIT_STATUS = 403;

/** The error handler of a module's routes (`app.setErrorHandler(…)`). */
export type ApiErrorReply = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<FastifyReply>;

/** The body (and ack error) of a `PLAN_LIMIT`. The message carries only the resource, the counts
 *  and the plan, no id, so it goes out as is; the client builds its sentence from `planLimit`.
 *
 *  Example: `planLimitErrorBody(error).planLimit // { resource: 'scenes', limit: 5, plan: 'free' }` */
export function planLimitErrorBody(error: PlanLimitError): ApiErrorDto {
  const { code, message, resource, limit, plan } = error;
  return { code, message, planLimit: { resource, limit, plan } };
}

/** Wraps a module's error handler so a `PlanLimitError` thrown anywhere under it answers 403 with
 *  `planLimit`; every other error goes on to `next`, unchanged.
 *
 *  Example: `app.setErrorHandler(withPlanLimitReply(replyWithApiError))` */
export function withPlanLimitReply(next: ApiErrorReply): ApiErrorReply {
  return async (error, request, reply) => {
    if (!(error instanceof PlanLimitError)) return next(error, request, reply);
    return reply.code(PLAN_LIMIT_STATUS).send(planLimitErrorBody(error));
  };
}
