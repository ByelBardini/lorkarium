import { PLAN_LIMITS, apiErrorDto, type ApiErrorDto } from '@lorkarium/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { PlanLimitsBo } from '../../../src/modules/plans/plan-limits.bo';
import {
  planLimitErrorBody,
  withPlanLimitReply,
  type ApiErrorReply,
} from '../../../src/modules/plans/plan-limit-response';
import { PlanLimitError } from '../../../src/modules/plans/plans.error';

const MODULE_REFUSAL: ApiErrorDto = { code: 'MODULE_ERROR', message: 'the module answered' };

// The module's own handler: answers 409 to anything that reaches it.
const replyAsTheModule: ApiErrorReply = async (_error, _request, reply) =>
  reply.code(409).send(MODULE_REFUSAL);

function refusalOfScenes(): PlanLimitError {
  try {
    PlanLimitsBo.requireRoom('scenes', 5, 1, PLAN_LIMITS.free);
  } catch (error) {
    if (error instanceof PlanLimitError) return error;
  }
  throw new Error('expected requireRoom to refuse the 6th scene of free');
}

async function appThrowing(error: Error): Promise<FastifyInstance> {
  const app = Fastify();
  app.setErrorHandler(withPlanLimitReply(replyAsTheModule));
  app.get('/boom', async () => {
    throw error;
  });
  await app.ready();
  return app;
}

describe('planLimitErrorBody', () => {
  it('is an ApiErrorDto with the code, the message and the planLimit', () => {
    const body = planLimitErrorBody(refusalOfScenes());
    expect(apiErrorDto.parse(body)).toEqual({
      code: 'PLAN_LIMIT',
      message: 'would have 6 scenes; plan free allows at most 5',
      planLimit: { resource: 'scenes', limit: 5, plan: 'free' },
    });
  });
});

describe('withPlanLimitReply', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('answers a PlanLimitError with 403 and the planLimit', async () => {
    app = await appThrowing(refusalOfScenes());
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect(response.statusCode).toBe(403);
    expect(response.json<ApiErrorDto>().planLimit).toEqual({
      resource: 'scenes',
      limit: 5,
      plan: 'free',
    });
  });

  it('hands every other error to the module handler, unchanged', async () => {
    app = await appThrowing(new Error('something else'));
    const response = await app.inject({ method: 'GET', url: '/boom' });
    expect({ status: response.statusCode, body: response.json() }).toEqual({
      status: 409,
      body: MODULE_REFUSAL,
    });
  });
});
