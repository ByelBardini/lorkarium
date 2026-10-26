import rateLimit from '@fastify/rate-limit';
import {
  AVATAR_MIME_TYPES,
  updateProfileRequestDto,
  type ApiErrorDto,
  type ProfileResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { registerImageRoutes, type ProfileImageEdge } from './profile-images.routes';
import {
  AvatarMediaTypeError,
  ProfileError,
  ProfileRateLimitedError,
  type ProfileErrorCode,
} from './profiles.error';
import type { ProfilesService } from './profiles.service';

// Spec §8.4, keyed by the signed-in user: a profile save reaches every live table of the person.
const PROFILE_SAVES_PER_MINUTE = 30;
const PROFILE_URL = '/account/profile';
const API_PREFIX = '/api';

const STATUS_BY_CODE: Readonly<Record<ProfileErrorCode, number>> = {
  AVATAR_NOT_FOUND: 404,
  UNSUPPORTED_IMAGE: 422,
  AVATAR_TOO_LARGE: 413,
  DICE_TEXTURE_NOT_FOUND: 404,
  DICE_TEXTURE_TOO_LARGE: 413,
  LINK_BLOCKED: 422,
  LINK_UNREACHABLE: 422,
  LINK_NOT_IMAGE: 422,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and sizes and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<ProfileErrorCode, string>> = {
  AVATAR_NOT_FOUND: 'Photo not found',
  UNSUPPORTED_IMAGE: 'The file is not a PNG, JPEG, WebP or GIF image',
  AVATAR_TOO_LARGE: 'The photo is larger than 5 MB',
  DICE_TEXTURE_NOT_FOUND: 'Dice texture not found',
  DICE_TEXTURE_TOO_LARGE: 'The texture is larger than 5 MB',
  LINK_BLOCKED: 'This link cannot be used',
  LINK_UNREACHABLE: 'The link could not be opened',
  LINK_NOT_IMAGE: 'The link is not a PNG, JPEG, WebP or GIF image',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of the profile: read and edit one's own (nickname, color, bio, dice number color),
 *  send or take off the photo and the dice texture, and read either by id. The account is always
 *  the session's, never the body's.
 *
 *  Example: `app.register(profilesRoutes(service, profileImageEdgesOf(service)), { prefix: '/api' })` */
export function profilesRoutes(
  service: ProfilesService,
  edges: readonly ProfileImageEdge[],
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser([...AVATAR_MIME_TYPES], { parseAs: 'buffer' }, (_req, body, done) =>
      done(null, body),
    );
    app.setErrorHandler(errorHandlerFor(edges));
    registerProfileRoutes(app, service);
    for (const edge of edges) registerImageRoutes(app, edge);
  };
}

function registerProfileRoutes(app: FastifyInstance, service: ProfilesService): void {
  const { requireAuth, userOf } = app.authGuards;
  app.get(PROFILE_URL, { preHandler: requireAuth }, async (request) => {
    return { profile: await service.profileOf(userOf(request).id) } satisfies ProfileResponseDto;
  });
  // preHandler: added after the auth guard, so the key is the signed-in user.
  const limit = perUserRateLimit(PROFILE_SAVES_PER_MINUTE, '1 minute', userOf);
  app.patch(PROFILE_URL, { preHandler: requireAuth, config: { rateLimit: limit } }, async (r) => {
    const changes = updateProfileRequestDto.parse(r.body);
    return { profile: await service.update(userOf(r).id, changes) } satisfies ProfileResponseDto;
  });
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

// Fastify refuses a body before any handler runs: those refusals get the codes of the image the
// route sends (only the send routes take a raw body).
function fastifyBodyError(
  error: FastifyError,
  request: FastifyRequest,
  edges: readonly ProfileImageEdge[],
): ProfileError | null {
  const edge = edges.find((each) => request.routeOptions.url === `${API_PREFIX}${each.sendUrl}`);
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE' && edge) return edge.tooLarge();
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' && edge) {
    return new AvatarMediaTypeError(String(request.headers['content-type']));
  }
  return null;
}

function errorHandlerFor(
  edges: readonly ProfileImageEdge[],
): (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply> {
  return async (error, request, reply) => {
    const known =
      fastifyBodyError(error, request, edges) ?? (error instanceof ProfileError ? error : null);
    if (known !== null) return reply.code(statusOf(known)).send(profileErrorReply(known));
    if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
    return replyWithUnknownError(error, request, reply);
  };
}

async function replyWithUnknownError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
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
