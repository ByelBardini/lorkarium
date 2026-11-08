import rateLimit from '@fastify/rate-limit';
import {
  SAVED_COLORS_MAX,
  saveColorRequestDto,
  savedColorParamsDto,
  type ApiErrorDto,
  type SavedColorsResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import {
  SavedColorsError,
  SavedColorsRateLimitedError,
  type SavedColorsErrorCode,
} from './saved-colors.error';
import type { SavedColorsService } from './saved-colors.service';

const SAVED_COLORS_URL = '/account/saved-colors';
// One count per user, summed over saving and deleting (spec §8.4).
const SAVED_COLOR_WRITES_PER_MINUTE = 30;

const STATUS_BY_CODE: Readonly<Record<SavedColorsErrorCode, number>> = {
  SAVED_COLORS_LIMIT: 409,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<SavedColorsErrorCode, string>> = {
  SAVED_COLORS_LIMIT: `You already keep ${SAVED_COLORS_MAX} saved colors`,
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the saved colors. The account is always the session's, never the body's.
 *
 *  Example: `app.register(savedColorsRoutes(service), { prefix: '/api' })` */
export function savedColorsRoutes(
  service: SavedColorsService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerSavedColorRoutes(app, service);
  };
}

function registerSavedColorRoutes(app: FastifyInstance, service: SavedColorsService): void {
  const { requireAuth, userOf } = app.authGuards;
  const writes = app.rateLimit(perUserRateLimit(SAVED_COLOR_WRITES_PER_MINUTE, '1 minute', userOf));
  app.get(SAVED_COLORS_URL, { preHandler: requireAuth }, async (request) => {
    return (await service.list(userOf(request).id)) satisfies SavedColorsResponseDto;
  });
  app.post(SAVED_COLORS_URL, { preHandler: [requireAuth, writes] }, async (request) => {
    const { color } = saveColorRequestDto.parse(request.body);
    return (await service.save(userOf(request).id, color)) satisfies SavedColorsResponseDto;
  });
  const oneColorUrl = `${SAVED_COLORS_URL}/:color`;
  app.delete(oneColorUrl, { preHandler: [requireAuth, writes] }, async (request) => {
    const { color } = savedColorParamsDto.parse(request.params);
    return (await service.remove(userOf(request).id, color)) satisfies SavedColorsResponseDto;
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): SavedColorsRateLimitedError {
  return new SavedColorsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function savedColorsErrorBody(error: SavedColorsError): ApiErrorDto {
  const retry =
    error instanceof SavedColorsRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof SavedColorsError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(savedColorsErrorBody(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the saved colors module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
