import rateLimit from '@fastify/rate-limit';
import {
  BLOCKS_MAX,
  FRIENDS_MAX,
  OUTGOING_REQUESTS_MAX,
  blockRequestDto,
  friendRequestDto,
  friendUserParamsDto,
  type ApiErrorDto,
  type BlockedUserDto,
  type FriendDto,
  type FriendRequestResponseDto,
  type FriendsOverviewDto,
} from '@lorkarium/contracts';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { FriendsError, FriendsRateLimitedError, type FriendsErrorCode } from './friends.error';
import type { FriendsService } from './friends.service';

// One count per user over every write of the module: blocks a burst of requests (spec §8.4).
const FRIEND_WRITES_PER_MINUTE = 30;

const STATUS_BY_CODE: Readonly<Record<FriendsErrorCode, number>> = {
  USER_NOT_FOUND: 404,
  ALREADY_FRIENDS: 409,
  REQUEST_ALREADY_SENT: 409,
  REQUEST_TO_SELF: 409,
  USER_BLOCKED_BY_YOU: 409,
  FRIEND_LIMIT: 403,
  OUTGOING_REQUEST_LIMIT: 403,
  REQUEST_NOT_FOUND: 404,
  FRIEND_NOT_FOUND: 404,
  ALREADY_BLOCKED: 409,
  BLOCK_LIMIT: 403,
  BLOCK_NOT_FOUND: 404,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<FriendsErrorCode, string>> = {
  USER_NOT_FOUND: 'No account with that @',
  ALREADY_FRIENDS: 'You are already friends',
  REQUEST_ALREADY_SENT: 'You already sent a request to this account',
  REQUEST_TO_SELF: 'That is your own account',
  USER_BLOCKED_BY_YOU: 'You blocked this account; unblock it first',
  FRIEND_LIMIT: `An account has at most ${FRIENDS_MAX} friends`,
  OUTGOING_REQUEST_LIMIT: `You have ${OUTGOING_REQUESTS_MAX} pending requests; wait for an answer`,
  REQUEST_NOT_FOUND: 'No such request',
  FRIEND_NOT_FOUND: 'This account is not your friend',
  ALREADY_BLOCKED: 'You already blocked this account',
  BLOCK_LIMIT: `You can block at most ${BLOCKS_MAX} accounts`,
  BLOCK_NOT_FOUND: 'This account is not blocked',
  RATE_LIMITED: 'Too many changes in a row',
};

/** HTTP edge of friends and blocks. The account is always the session's, never the body's.
 *
 *  Example: `app.register(friendsRoutes(service), { prefix: '/api' })` */
export function friendsRoutes(service: FriendsService): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    const { requireAuth, userOf } = app.authGuards;
    const limit = app.rateLimit(perUserRateLimit(FRIEND_WRITES_PER_MINUTE, '1 minute', userOf));
    const writes = [requireAuth, limit];
    registerFriendRoutes(app, service, writes);
    registerBlockRoutes(app, service, writes);
  };
}

function registerFriendRoutes(
  app: FastifyInstance,
  service: FriendsService,
  writes: readonly preHandlerHookHandler[],
): void {
  const { requireAuth, userOf } = app.authGuards;
  app.get('/friends', { preHandler: requireAuth }, async (request) => {
    return (await service.overview(userOf(request).id)) satisfies FriendsOverviewDto;
  });
  app.post('/friends/requests', { preHandler: [...writes] }, async (request) => {
    const { username } = friendRequestDto.parse(request.body);
    return (await service.request(userOf(request).id, username)) satisfies FriendRequestResponseDto;
  });
  app.post('/friends/requests/:userId/accept', { preHandler: [...writes] }, async (request) => {
    const { userId } = friendUserParamsDto.parse(request.params);
    return (await service.accept(userOf(request).id, userId)) satisfies FriendDto;
  });
  app.delete('/friends/requests/:userId', { preHandler: [...writes] }, async (request, reply) => {
    const { userId } = friendUserParamsDto.parse(request.params);
    await service.withdraw(userOf(request).id, userId);
    return reply.code(204).send();
  });
  app.delete('/friends/:userId', { preHandler: [...writes] }, async (request, reply) => {
    const { userId } = friendUserParamsDto.parse(request.params);
    await service.unfriend(userOf(request).id, userId);
    return reply.code(204).send();
  });
}

function registerBlockRoutes(
  app: FastifyInstance,
  service: FriendsService,
  writes: readonly preHandlerHookHandler[],
): void {
  const { userOf } = app.authGuards;
  app.post('/blocks', { preHandler: [...writes] }, async (request, reply) => {
    const target = blockRequestDto.parse(request.body);
    const blocked = await service.block(userOf(request).id, target);
    return reply.code(201).send(blocked satisfies BlockedUserDto);
  });
  app.delete('/blocks/:userId', { preHandler: [...writes] }, async (request, reply) => {
    const { userId } = friendUserParamsDto.parse(request.params);
    await service.unblock(userOf(request).id, userId);
    return reply.code(204).send();
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): FriendsRateLimitedError {
  return new FriendsRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function friendsErrorBody(error: FriendsError): ApiErrorDto {
  const retry =
    error instanceof FriendsRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof FriendsError) {
    return reply.code(STATUS_BY_CODE[error.code]).send(friendsErrorBody(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the friends module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
