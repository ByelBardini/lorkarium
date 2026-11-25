import rateLimit from '@fastify/rate-limit';
import {
  CUSTOM_EMOJI_MAX_BYTES,
  CUSTOM_EMOJI_MIME_TYPES,
  adminCustomEmojiParamsDto,
  adminUserParamsDto,
  customEmojiCreateQueryDto,
  customEmojiParamsDto,
  customEmojiRenameDto,
  type ApiErrorDto,
  type CustomEmojiListDto,
} from '@lorkarium/contracts';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  onRequestAsyncHookHandler,
} from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { withPlanLimitReply } from '../plans/plan-limit-response';
import {
  CustomEmojiError,
  CustomEmojiMediaTypeError,
  CustomEmojiNotFoundError,
  CustomEmojiRateLimitedError,
  CustomEmojiTooLargeError,
  type CustomEmojiErrorCode,
} from './custom-emoji.error';
import { CUSTOM_EMOJI_CONTENT_TYPE } from './custom-emojis.mapper';
import type { CustomEmojisService } from './custom-emojis.service';

const OWN_URL = '/account/custom-emojis';
const OWN_ONE_URL = `${OWN_URL}/:emojiId`;
const PICTURE_URL = '/custom-emojis/:emojiId';
const ADMIN_URL = '/admin/users/:userId/custom-emojis';
// Each send decodes a picture twice (still and moving): the tighter limit of the profile images.
const SENDS_PER_MINUTE = 10;
const CHANGES_PER_MINUTE = 30;
// The picture follows the owner's plan (a GIF stops moving without the Lenda): not immutable.
const PICTURE_CACHE_CONTROL = 'private, max-age=300';

const STATUS_BY_CODE: Readonly<Record<CustomEmojiErrorCode, number>> = {
  CUSTOM_EMOJI_NOT_FOUND: 404,
  CUSTOM_EMOJI_NAME_TAKEN: 409,
  CUSTOM_EMOJI_TOO_LARGE: 413,
  UNSUPPORTED_IMAGE: 415,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<CustomEmojiErrorCode, string>> = {
  CUSTOM_EMOJI_NOT_FOUND: 'Emoji not found',
  CUSTOM_EMOJI_NAME_TAKEN: 'You already have an emoji with this name',
  CUSTOM_EMOJI_TOO_LARGE: 'The image is too large',
  UNSUPPORTED_IMAGE: 'Unsupported image',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the custom emojis: one's own (list, send, rename, remove), the picture by id for
 *  any signed-in account, and the admin's view of an account. The account is the session's.
 *
 *  Example: `app.register(customEmojisRoutes(service), { prefix: '/api' })` */
export function customEmojisRoutes(
  service: CustomEmojisService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser(
      [...CUSTOM_EMOJI_MIME_TYPES],
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );
    app.setErrorHandler(withPlanLimitReply(replyWithApiError));
    registerOwnRoutes(app, service);
    registerSend(app, service);
    registerPicture(app, service);
    registerAdminRoutes(app, service);
  };
}

function registerOwnRoutes(app: FastifyInstance, service: CustomEmojisService): void {
  const { requireAuth, userOf } = app.authGuards;
  const changes = perUserRateLimit(CHANGES_PER_MINUTE, '1 minute', userOf);
  const writes = { preHandler: requireAuth, config: { rateLimit: changes } };
  app.get(OWN_URL, { preHandler: requireAuth }, async (request) => {
    return (await service.list(userOf(request).id)) satisfies CustomEmojiListDto;
  });
  app.patch(OWN_ONE_URL, writes, async (request) => {
    const { emojiId } = emojiParamsOf(request);
    const { name } = customEmojiRenameDto.parse(request.body);
    return (await service.rename(userOf(request).id, emojiId, name)) satisfies CustomEmojiListDto;
  });
  app.delete(OWN_ONE_URL, writes, async (request) => {
    const { emojiId } = emojiParamsOf(request);
    return (await service.remove(userOf(request).id, emojiId)) satisfies CustomEmojiListDto;
  });
}

// onRequest: who is not signed in is refused before a 2 MiB body is read; the limit runs on
// preParsing, after the guard (the key is the user) and before the body.
function registerSend(app: FastifyInstance, service: CustomEmojisService): void {
  const { requireAuth, userOf } = app.authGuards;
  const keyGenerator = (request: FastifyRequest): string => userOf(request).id;
  const hook = 'preParsing' as const;
  const limit = { max: SENDS_PER_MINUTE, timeWindow: '1 minute', hook, keyGenerator };
  const options = {
    onRequest: requireAuth as onRequestAsyncHookHandler,
    bodyLimit: CUSTOM_EMOJI_MAX_BYTES,
    config: { rateLimit: limit },
  };
  app.post(OWN_URL, options, async (request, reply) => {
    const { name } = customEmojiCreateQueryDto.parse(request.query);
    const list = await service.create(userOf(request).id, name, pictureBytesOf(request));
    return reply.code(201).send(list satisfies CustomEmojiListDto);
  });
}

// Session required, sharing a table not: the emoji belongs to the account, and its id only
// reaches whoever got a message with it.
function registerPicture(app: FastifyInstance, service: CustomEmojisService): void {
  const { requireAuth } = app.authGuards;
  app.get(PICTURE_URL, { preHandler: requireAuth }, async (request, reply) => {
    const stored = await service.open(emojiParamsOf(request).emojiId);
    return reply
      .header('content-type', CUSTOM_EMOJI_CONTENT_TYPE)
      .header('content-length', stored.size)
      .header('cache-control', PICTURE_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(stored.body);
  });
}

function registerAdminRoutes(app: FastifyInstance, service: CustomEmojisService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.get(ADMIN_URL, admin, async (request) => {
    const { userId } = adminUserParamsDto.parse(request.params);
    return (await service.list(userId)) satisfies CustomEmojiListDto;
  });
  app.delete(`${ADMIN_URL}/:emojiId`, admin, async (request) => {
    const { userId, emojiId } = adminCustomEmojiParamsDto.parse(request.params);
    return (await service.remove(userId, emojiId)) satisfies CustomEmojiListDto;
  });
}

function emojiParamsOf(request: FastifyRequest): { emojiId: string } {
  const parsed = customEmojiParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data;
  throw new CustomEmojiNotFoundError(JSON.stringify(request.params));
}

// JSON keeps its parser here (the PATCH needs it): a JSON body on the send is a 415.
function pictureBytesOf(request: FastifyRequest): Uint8Array {
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  throw new CustomEmojiMediaTypeError(String(request.headers['content-type']));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): CustomEmojiRateLimitedError {
  return new CustomEmojiRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function customEmojiErrorBody(error: CustomEmojiError): ApiErrorDto {
  const retry =
    error instanceof CustomEmojiRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof CustomEmojiError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(customEmojiErrorBody(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    const tooLarge = new CustomEmojiTooLargeError(CUSTOM_EMOJI_MAX_BYTES, null);
    return reply.code(413).send(customEmojiErrorBody(tooLarge));
  }
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the custom emojis module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
