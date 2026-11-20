import rateLimit from '@fastify/rate-limit';
import {
  confirmMailBroadcastRequestDto,
  mailBroadcastAudienceRequestDto,
  mailBroadcastContentDto,
  mailBroadcastParamsDto,
  type ApiErrorDto,
  type MailBroadcastAudienceDto,
  type MailBroadcastDraftResponseDto,
  type MailBroadcastPreviewDto,
  type MailBroadcastResponseDto,
  type MailBroadcastsResponseDto,
  type MailBroadcastTestResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import {
  BroadcastsError,
  BroadcastsRateLimitedError,
  type BroadcastsErrorCode,
} from './broadcasts.error';
import type { BroadcastsService } from './broadcasts.service';

// A test goes to the admin's own inbox; a few per draft is plenty, a loop would hit the SMTP quota.
const TESTS_PER_10_MINUTES = 10;

const STATUS_BY_CODE: Readonly<Record<BroadcastsErrorCode, number>> = {
  BROADCAST_NOT_FOUND: 404,
  ALREADY_CONFIRMED: 409,
  TEST_REQUIRED: 409,
  TWO_FACTOR_REQUIRED: 403,
  CONFIRMATION_MISMATCH: 409,
  MAIL_DELIVERY_FAILED: 502,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<BroadcastsErrorCode, string>> = {
  BROADCAST_NOT_FOUND: 'Broadcast not found',
  ALREADY_CONFIRMED: 'This broadcast was already confirmed',
  TEST_REQUIRED: 'Send a test to yourself before confirming',
  TWO_FACTOR_REQUIRED: 'Turn on two-factor authentication to confirm a broadcast',
  CONFIRMATION_MISMATCH: 'The typed total does not match the audience',
  MAIL_DELIVERY_FAILED: 'The mail server did not accept the test',
  RATE_LIMITED: 'Too many test sends in a row',
};

/** HTTP edge of the backoffice notices; every route asks the admin role, the admin comes from
 *  the session.
 *
 *  Example: `app.register(broadcastsRoutes(service), { prefix: '/api' })` */
export function broadcastsRoutes(
  service: BroadcastsService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerDraftRoutes(app, service);
    registerSendRoutes(app, service);
  };
}

function registerDraftRoutes(app: FastifyInstance, service: BroadcastsService): void {
  const { requireRole, userOf } = app.authGuards;
  const admin = { preHandler: requireRole('admin') };
  app.get('/admin/broadcasts', admin, async () => {
    return (await service.list()) satisfies MailBroadcastsResponseDto;
  });
  app.post('/admin/broadcasts/audience', admin, async (request) => {
    const { segment } = mailBroadcastAudienceRequestDto.parse(request.body);
    return (await service.audienceOf(segment)) satisfies MailBroadcastAudienceDto;
  });
  app.post('/admin/broadcasts/preview', admin, async (request) => {
    const content = mailBroadcastContentDto.parse(request.body);
    return (await service.preview(userOf(request).id, content)) satisfies MailBroadcastPreviewDto;
  });
  app.post('/admin/broadcasts', admin, async (request, reply) => {
    const content = mailBroadcastContentDto.parse(request.body);
    const draft = await service.create(userOf(request).id, content);
    return reply.code(201).send(draft satisfies MailBroadcastDraftResponseDto);
  });
  app.put('/admin/broadcasts/:broadcastId', admin, async (request) => {
    const { broadcastId } = mailBroadcastParamsDto.parse(request.params);
    const content = mailBroadcastContentDto.parse(request.body);
    return (await service.rewrite(broadcastId, content)) satisfies MailBroadcastDraftResponseDto;
  });
}

function registerSendRoutes(app: FastifyInstance, service: BroadcastsService): void {
  const { requireRole, userOf } = app.authGuards;
  const admin = { preHandler: requireRole('admin') };
  const limit = perUserRateLimit(TESTS_PER_10_MINUTES, '10 minutes', userOf);
  app.post(
    '/admin/broadcasts/:broadcastId/test',
    { ...admin, config: { rateLimit: limit } },
    async (request) => {
      const { broadcastId } = mailBroadcastParamsDto.parse(request.params);
      const sent = await service.test(userOf(request).id, broadcastId);
      request.log.info({ adminId: userOf(request).id, broadcastId }, 'broadcast test sent');
      return sent satisfies MailBroadcastTestResponseDto;
    },
  );
  app.post('/admin/broadcasts/:broadcastId/confirm', admin, async (request) => {
    const { broadcastId } = mailBroadcastParamsDto.parse(request.params);
    const { total } = confirmMailBroadcastRequestDto.parse(request.body);
    const confirmed = await service.confirm(userOf(request).id, broadcastId, total);
    request.log.info({ adminId: userOf(request).id, broadcastId, total }, 'broadcast confirmed');
    return confirmed satisfies MailBroadcastResponseDto;
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): BroadcastsRateLimitedError {
  return new BroadcastsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function broadcastsErrorBody(error: BroadcastsError): ApiErrorDto {
  const retry =
    error instanceof BroadcastsRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof BroadcastsError) {
    if (error.code === 'MAIL_DELIVERY_FAILED') request.log.error({ err: error }, error.message);
    return reply.code(STATUS_BY_CODE[error.code]).send(broadcastsErrorBody(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the broadcasts module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
