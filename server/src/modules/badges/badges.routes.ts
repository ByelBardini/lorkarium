import rateLimit from '@fastify/rate-limit';
import {
  AVATAR_MIME_TYPES,
  BADGE_IMAGE_MAX_BYTES,
  adminUserParamsDto,
  badgeImageParamsDto,
  badgeImageUploadQueryDto,
  badgeOrderRequestDto,
  badgeParamsDto,
  createBadgeRequestDto,
  updateBadgeRequestDto,
  userBadgesRequestDto,
  type AdminBadgeResponseDto,
  type AdminBadgesResponseDto,
  type ApiErrorDto,
  type UserBadgeIdsResponseDto,
  type UserBadgesResponseDto,
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
import { toImageCrop } from '../assets/assets.mapper';
import {
  BadgeImageMediaTypeError,
  BadgeImageNotFoundError,
  BadgeImageTooLargeError,
  BadgesError,
  BadgesRateLimitedError,
  type BadgesErrorCode,
} from './badges.error';
import { BADGE_IMAGE_CONTENT_TYPE } from './badges.mapper';
import type { BadgesService } from './badges.service';

// Spec §8.4, keyed by the admin: a catalog edit is a click; an image send decodes a file.
const BADGE_WRITES_PER_MINUTE = 60;
const IMAGE_SENDS_PER_MINUTE = 10;
const IMAGE_SEND_URL = '/admin/badges/:badgeId/image';
// An image id never changes content (a new send is a new id), so the browser may keep it a year.
const IMAGE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

const STATUS_BY_CODE: Readonly<Record<BadgesErrorCode, number>> = {
  BADGE_NAME_TAKEN: 409,
  BADGE_NOT_FOUND: 404,
  BADGE_ORDER_STALE: 409,
  BADGE_WITHOUT_IMAGE: 409,
  BADGE_IMAGE_TOO_LARGE: 413,
  BADGE_IMAGE_NOT_FOUND: 404,
  UNSUPPORTED_IMAGE: 422,
  USER_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and sizes and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<BadgesErrorCode, string>> = {
  BADGE_NAME_TAKEN: 'Another badge already has this name',
  BADGE_NOT_FOUND: 'Badge not found',
  BADGE_ORDER_STALE: 'The badge list changed meanwhile',
  BADGE_WITHOUT_IMAGE: 'A badge without an image cannot be granted',
  BADGE_IMAGE_TOO_LARGE: 'The badge image is larger than 2 MB',
  BADGE_IMAGE_NOT_FOUND: 'Badge image not found',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG, WebP or GIF image',
  USER_NOT_FOUND: 'Account not found',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the badges: the catalog and the grants for an admin, the image for any session.
 *
 *  Example: `await app.register(badgesRoutes(service), { prefix: '/api' })` */
export function badgesRoutes(service: BadgesService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser([...AVATAR_MIME_TYPES], { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    app.setErrorHandler(replyWithBadgesError);
    registerCatalogRoutes(app, service);
    registerOrderAndDeleteRoutes(app, service);
    registerImageSend(app, service);
    registerImageRead(app, service);
    registerGrantRoutes(app, service);
  };
}

function adminWrite(app: FastifyInstance): object {
  const { requireRole, userOf } = app.authGuards;
  const limit = perUserRateLimit(BADGE_WRITES_PER_MINUTE, '1 minute', userOf);
  return { preHandler: requireRole('admin'), config: { rateLimit: limit } };
}

function registerCatalogRoutes(app: FastifyInstance, service: BadgesService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.get('/admin/badges', admin, async () => {
    return { badges: await service.catalog() } satisfies AdminBadgesResponseDto;
  });
  app.post('/admin/badges', adminWrite(app), async (request, reply) => {
    const badge = await service.create(createBadgeRequestDto.parse(request.body));
    logAction(request, 'create badge', badge.id);
    return reply.code(201).send({ badge } satisfies AdminBadgeResponseDto);
  });
  app.patch('/admin/badges/:badgeId', adminWrite(app), async (request) => {
    const { badgeId } = badgeParamsDto.parse(request.params);
    const badge = await service.update(badgeId, updateBadgeRequestDto.parse(request.body));
    logAction(request, 'edit badge', badgeId);
    return { badge } satisfies AdminBadgeResponseDto;
  });
}

function registerOrderAndDeleteRoutes(app: FastifyInstance, service: BadgesService): void {
  app.put('/admin/badges/order', adminWrite(app), async (request) => {
    const { badgeIds } = badgeOrderRequestDto.parse(request.body);
    const badges = await service.reorder(badgeIds);
    logAction(request, 'reorder badges', null);
    return { badges } satisfies AdminBadgesResponseDto;
  });
  app.delete('/admin/badges/:badgeId', adminWrite(app), async (request, reply) => {
    const { badgeId } = badgeParamsDto.parse(request.params);
    await service.delete(badgeId);
    logAction(request, 'delete badge', badgeId);
    return reply.code(204).send();
  });
}

// onRequest: who is not an admin is refused before a 2 MiB body is read; the limit runs on
// preParsing, after the guard (the key is the admin) and before the body.
function registerImageSend(app: FastifyInstance, service: BadgesService): void {
  const { requireRole, userOf } = app.authGuards;
  const keyGenerator = (request: FastifyRequest): string => userOf(request).id;
  const options = {
    onRequest: requireRole('admin') as onRequestAsyncHookHandler,
    bodyLimit: BADGE_IMAGE_MAX_BYTES,
    config: {
      rateLimit: {
        max: IMAGE_SENDS_PER_MINUTE,
        timeWindow: '1 minute',
        hook: 'preParsing' as const,
        keyGenerator,
      },
    },
  };
  app.put(IMAGE_SEND_URL, options, async (request) => {
    const { badgeId } = badgeParamsDto.parse(request.params);
    const crop = toImageCrop(badgeImageUploadQueryDto.parse(request.query));
    const badge = await service.uploadImage(badgeId, imageBytesOf(request), crop);
    logAction(request, 'send badge image', badgeId);
    return { badge } satisfies AdminBadgeResponseDto;
  });
}

// Session required, admin not: every card shows the badges of its account.
function registerImageRead(app: FastifyInstance, service: BadgesService): void {
  const { requireAuth } = app.authGuards;
  app.get('/badge-images/:imageId', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = badgeImageParamsDto.safeParse(request.params);
    if (!parsed.success) throw new BadgeImageNotFoundError(JSON.stringify(request.params));
    const stored = await service.openImage(parsed.data.imageId);
    return reply
      .header('content-type', BADGE_IMAGE_CONTENT_TYPE)
      .header('content-length', stored.size)
      .header('cache-control', IMAGE_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(stored.body);
  });
}

function registerGrantRoutes(app: FastifyInstance, service: BadgesService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.get('/admin/users/:userId/badges', admin, async (request) => {
    const { userId } = adminUserParamsDto.parse(request.params);
    return { badgeIds: await service.grantsOf(userId) } satisfies UserBadgeIdsResponseDto;
  });
  app.put('/admin/users/:userId/badges', adminWrite(app), async (request) => {
    const { userId } = adminUserParamsDto.parse(request.params);
    const { badgeIds } = userBadgesRequestDto.parse(request.body);
    const badges = await service.grant(userId, badgeIds);
    logAction(request, 'grant badges', null, userId);
    return { badges } satisfies UserBadgesResponseDto;
  });
}

// The trail of the backoffice: who did what to which badge or account (never an e-mail).
function logAction(
  request: FastifyRequest,
  action: string,
  badgeId: string | null,
  targetUserId: string | null = null,
): void {
  const adminId = request.server.authGuards.userOf(request).id;
  request.log.info({ adminId, badgeId, targetUserId, action }, 'backoffice action');
}

// JSON and text keep their parsers: such a body on the image route is a 415.
function imageBytesOf(request: FastifyRequest): Uint8Array {
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  throw new BadgeImageMediaTypeError(String(request.headers['content-type']));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): BadgesRateLimitedError {
  return new BadgesRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

// Fastify refuses a body before any handler runs; on the image route those are the image's codes.
// Compared by suffix, so the prefix the module is registered under does not matter.
function fastifyBodyError(error: FastifyError, request: FastifyRequest): BadgesError | null {
  if (!request.routeOptions.url?.endsWith(IMAGE_SEND_URL)) return null;
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new BadgeImageTooLargeError(BADGE_IMAGE_MAX_BYTES, null);
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new BadgeImageMediaTypeError(String(request.headers['content-type']));
  }
  return null;
}

function badgesErrorBody(error: BadgesError): ApiErrorDto {
  const retry =
    error instanceof BadgesRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

function statusOf(error: BadgesError): number {
  return error instanceof BadgeImageMediaTypeError ? 415 : STATUS_BY_CODE[error.code];
}

async function replyWithBadgesError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = fastifyBodyError(error, request) ?? (error instanceof BadgesError ? error : null);
  if (known !== null) {
    request.log.info({ code: known.code, detail: known.message }, 'badges request refused');
    return reply.code(statusOf(known)).send(badgesErrorBody(known));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the badges module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
