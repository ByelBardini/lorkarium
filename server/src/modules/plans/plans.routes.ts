import type { AccountPlanDto, ApiErrorDto } from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { withPlanLimitReply } from './plan-limit-response';
import type { PlansService } from './plans.service';

const ACCOUNT_PLAN_URL = '/account/plan';

/** HTTP edge of the plans: the session's own plan, limits and usage.
 *
 *  Example: `app.register(plansRoutes(service), { prefix: '/api' })` */
export function plansRoutes(service: PlansService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    app.setErrorHandler(withPlanLimitReply(replyWithApiError));
    const { requireAuth, userOf } = app.authGuards;
    app.get(ACCOUNT_PLAN_URL, { preHandler: requireAuth }, async (request) => {
      return (await service.accountPlanOf(userOf(request).id)) satisfies AccountPlanDto;
    });
  };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the plans module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
