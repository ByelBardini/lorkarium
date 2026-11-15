import rateLimit from '@fastify/rate-limit';
import { profileCardParamsDto, reputationVoteDto, type ApiErrorDto } from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import {
  ReputationError,
  ReputationRateLimitedError,
  type ReputationErrorCode,
} from './reputation.error';
import type { ReputationService } from './reputation.service';

const REPUTATION_URL = '/users/:userId/reputation';
// One count per voter, summed over voting and removing (spec §8.4).
const REPUTATION_WRITES_PER_MINUTE = 30;

const STATUS_BY_CODE: Readonly<Record<ReputationErrorCode, number>> = {
  REPUTATION_SELF: 400,
  REPUTATION_NOT_ALLOWED: 403,
  REPUTATION_TARGET_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<ReputationErrorCode, string>> = {
  REPUTATION_SELF: 'You cannot vote on yourself',
  REPUTATION_NOT_ALLOWED: 'Only someone who shares a table can vote',
  REPUTATION_TARGET_NOT_FOUND: 'Account not found',
  RATE_LIMITED: 'Too many votes in a row',
};

/** HTTP edge of the reputation: the voter is always the session's account, never the body's.
 *
 *  Example: `app.register(reputationRoutes(service), { prefix: '/api' })` */
export function reputationRoutes(
  service: ReputationService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerReputationRoutes(app, service);
  };
}

function registerReputationRoutes(app: FastifyInstance, service: ReputationService): void {
  const { requireAuth, userOf } = app.authGuards;
  const writes = app.rateLimit(perUserRateLimit(REPUTATION_WRITES_PER_MINUTE, '1 minute', userOf));
  app.put(REPUTATION_URL, { preHandler: [requireAuth, writes] }, async (request, reply) => {
    const { userId } = profileCardParamsDto.parse(request.params);
    const { value } = reputationVoteDto.parse(request.body);
    await service.vote(userOf(request).id, userId, value);
    return reply.code(204).send();
  });
  app.delete(REPUTATION_URL, { preHandler: [requireAuth, writes] }, async (request, reply) => {
    const { userId } = profileCardParamsDto.parse(request.params);
    await service.removeVote(userOf(request).id, userId);
    return reply.code(204).send();
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): ReputationRateLimitedError {
  return new ReputationRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function reputationErrorBody(error: ReputationError): ApiErrorDto {
  const retry =
    error instanceof ReputationRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof ReputationError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(reputationErrorBody(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the reputation module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
