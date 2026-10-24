import rateLimit from '@fastify/rate-limit';
import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  avatarParamsDto,
  updateProfileRequestDto,
  type ApiErrorDto,
  type ProfileResponseDto,
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
import {
  AvatarMediaTypeError,
  AvatarNotFoundError,
  AvatarTooLargeError,
  ProfileError,
  ProfileRateLimitedError,
  type ProfileErrorCode,
} from './profiles.error';
import { AVATAR_CONTENT_TYPE } from './profiles.mapper';
import type { ProfilesService } from './profiles.service';

// Spec §8.4, keyed by the signed-in user: a profile save reaches every live table of the person.
const PROFILE_SAVES_PER_MINUTE = 30;
// Each photo send decodes an image (maybe 120 frames): the costly route gets the tighter limit.
const AVATAR_SENDS_PER_MINUTE = 10;
// A photo id never changes content (a new send is a new id), so the browser may keep it a year.
const AVATAR_CACHE_CONTROL = 'private, max-age=31536000, immutable';
const PROFILE_URL = '/account/profile';
const AVATAR_URL = '/account/avatar';

const STATUS_BY_CODE: Readonly<Record<ProfileErrorCode, number>> = {
  AVATAR_NOT_FOUND: 404,
  UNSUPPORTED_IMAGE: 422,
  AVATAR_TOO_LARGE: 413,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and sizes and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<ProfileErrorCode, string>> = {
  AVATAR_NOT_FOUND: 'Photo not found',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG, WebP or GIF image',
  AVATAR_TOO_LARGE: 'The photo is larger than 5 MB',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the profile: read and edit one's own (nickname, color, bio), send or take off the
 *  photo, and read a photo by id. The account is always the session's, never the body's.
 *
 *  Example: `app.register(profilesRoutes(service), { prefix: '/api' })` */
export function profilesRoutes(service: ProfilesService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser([...AVATAR_MIME_TYPES], { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    app.setErrorHandler(replyWithApiError);
    registerProfileRoutes(app, service);
    registerAvatarRoutes(app, service);
    registerAvatarReadRoute(app, service);
  };
}

function registerProfileRoutes(app: FastifyInstance, service: ProfilesService): void {
  const { requireAuth, userOf } = app.authGuards;
  app.get(PROFILE_URL, { preHandler: requireAuth }, async (request) => {
    return { profile: await service.profileOf(userOf(request).id) } satisfies ProfileResponseDto;
  });
  // preHandler: added after the auth guard, so the key is the signed-in user.
  const limit = perUser(PROFILE_SAVES_PER_MINUTE, 'preHandler', (r) => userOf(r).id);
  app.patch(PROFILE_URL, { preHandler: requireAuth, config: { rateLimit: limit } }, async (r) => {
    const changes = updateProfileRequestDto.parse(r.body);
    return { profile: await service.update(userOf(r).id, changes) } satisfies ProfileResponseDto;
  });
}

function registerAvatarRoutes(app: FastifyInstance, service: ProfilesService): void {
  const { requireAuth, userOf } = app.authGuards;
  // onRequest: who is not signed in is refused before a 5 MiB body is read; the limit runs on
  // preParsing, after the guard (the key is the user) and before the body.
  const guard = requireAuth as onRequestAsyncHookHandler;
  const limit = perUser(AVATAR_SENDS_PER_MINUTE, 'preParsing', (r) => userOf(r).id);
  const sendOptions = {
    onRequest: guard,
    bodyLimit: AVATAR_MAX_BYTES,
    config: { rateLimit: limit },
  };
  app.put(AVATAR_URL, sendOptions, async (request) => {
    const bytes = photoBytesOf(request);
    const profile = await service.replaceAvatar(userOf(request).id, bytes);
    return { profile } satisfies ProfileResponseDto;
  });
  app.delete(AVATAR_URL, { preHandler: requireAuth }, async (request) => {
    return { profile: await service.removeAvatar(userOf(request).id) } satisfies ProfileResponseDto;
  });
}

// Session required, membership not: the photo belongs to the account, and its id only reaches
// whoever shares a table with the person.
function registerAvatarReadRoute(app: FastifyInstance, service: ProfilesService): void {
  const { requireAuth } = app.authGuards;
  app.get('/avatars/:avatarId', { preHandler: requireAuth }, async (request, reply) => {
    const stored = await service.openAvatar(avatarIdOf(request));
    return reply
      .header('content-type', AVATAR_CONTENT_TYPE)
      .header('content-length', stored.size)
      .header('cache-control', AVATAR_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(stored.body);
  });
}

// JSON still has its parser here (the PATCH needs it): a JSON body on the photo route is a 415.
function photoBytesOf(request: FastifyRequest): Uint8Array {
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  throw new AvatarMediaTypeError(String(request.headers['content-type']));
}

function avatarIdOf(request: FastifyRequest): string {
  const parsed = avatarParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.avatarId;
  throw new AvatarNotFoundError(JSON.stringify(request.params));
}

function perUser(
  max: number,
  hook: 'preHandler' | 'preParsing',
  userIdOf: (request: FastifyRequest) => string,
): object {
  return { max, timeWindow: '1 minute', hook, keyGenerator: userIdOf };
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): ProfileRateLimitedError {
  return new ProfileRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function profileErrorReply(error: ProfileError): ApiErrorDto {
  const retry =
    error instanceof ProfileRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

function statusOf(error: ProfileError): number {
  return error instanceof AvatarMediaTypeError ? 415 : STATUS_BY_CODE[error.code];
}

// Fastify refuses a body before any handler runs: those refusals get the photo codes.
function fastifyBodyError(error: FastifyError, request: FastifyRequest): ProfileError | null {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AvatarTooLargeError(AVATAR_MAX_BYTES, null);
  }
  const isPhotoSend = request.routeOptions.url === `/api${AVATAR_URL}`;
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' && isPhotoSend) {
    return new AvatarMediaTypeError(String(request.headers['content-type']));
  }
  return null;
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const known = fastifyBodyError(error, request) ?? (error instanceof ProfileError ? error : null);
  if (known !== null) return reply.code(statusOf(known)).send(profileErrorReply(known));
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the profiles module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
