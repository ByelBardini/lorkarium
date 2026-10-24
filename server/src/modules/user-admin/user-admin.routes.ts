import rateLimit from '@fastify/rate-limit';
import {
  adminUserParamsDto,
  mailSampleParamsDto,
  sendMailSampleRequestDto,
  type MailSamplesResponseDto,
  type SendMailSampleResponseDto,
  updateUserRoleRequestDto,
  type AdminDirectoryResponseDto,
  type AdminUserResponseDto,
  type ApiErrorDto,
  type UserDeletionCheckDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import type { AdminAction } from './user-admin.bo';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { MailSamplesService } from './mail-samples.service';
import {
  OwnsSharedCampaignsError,
  UserAdminError,
  UserAdminRateLimitedError,
  type UserAdminErrorCode,
} from './user-admin.error';
import type { AdminActor, UserAdminService } from './user-admin.service';

// Each test is a real e-mail: a handful in a row is a test, more is a mailer being abused.
const MAIL_TESTS_PER_10_MINUTES = 30;

const STATUS_BY_CODE: Readonly<Record<UserAdminErrorCode, number>> = {
  SELF_ACTION: 409,
  USER_NOT_FOUND: 404,
  OWNS_SHARED_CAMPAIGNS: 409,
  MAIL_SAMPLE_NOT_FOUND: 404,
  MAIL_DELIVERY_FAILED: 502,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<UserAdminErrorCode, string>> = {
  SELF_ACTION: 'Admins cannot do this to their own account',
  USER_NOT_FOUND: 'Account not found',
  OWNS_SHARED_CAMPAIGNS: 'The account owns tables where other people play',
  MAIL_SAMPLE_NOT_FOUND: 'No such system e-mail',
  MAIL_DELIVERY_FAILED: 'The mail server refused or did not answer',
  RATE_LIMITED: 'Too many attempts',
};

/** HTTP edge of the backoffice over the accounts, every route for an admin only; each action is
 *  logged with the admin and the target (never an e-mail).
 *
 *  Example: `await app.register(userAdminRoutes(service), { prefix: '/api' })` */
export function userAdminRoutes(
  service: UserAdminService,
  mailTest: MailSamplesService,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerMailTestRoutes(app, mailTest);
    const admin = { preHandler: app.authGuards.requireRole('admin') };
    app.get('/admin/users', admin, async () => {
      return (await service.directory()) satisfies AdminDirectoryResponseDto;
    });
    app.patch('/admin/users/:userId', admin, async (request) => {
      const { role } = updateUserRoleRequestDto.parse(request.body);
      const target = audited(app, request, 'change the role of');
      return {
        user: await service.changeRole(target.actor, target.userId, role),
      } satisfies AdminUserResponseDto;
    });
    registerStandingRoutes(app, service);
    registerDeletionRoutes(app, service);
  };
}

function registerStandingRoutes(app: FastifyInstance, service: UserAdminService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.post('/admin/users/:userId/suspend', admin, async (request) => {
    const { actor, userId } = audited(app, request, 'suspend');
    return { user: await service.suspend(actor, userId) } satisfies AdminUserResponseDto;
  });
  app.post('/admin/users/:userId/reactivate', admin, async (request) => {
    const { actor, userId } = audited(app, request, 'reactivate');
    return { user: await service.reactivate(actor, userId) } satisfies AdminUserResponseDto;
  });
}

function registerDeletionRoutes(app: FastifyInstance, service: UserAdminService): void {
  const admin = { preHandler: app.authGuards.requireRole('admin') };
  app.get('/admin/users/:userId/deletion-check', admin, async (request) => {
    const { userId } = adminUserParamsDto.parse(request.params);
    const actor = actorOf(app, request);
    return (await service.deletionCheck(actor, userId)) satisfies UserDeletionCheckDto;
  });
  app.delete('/admin/users/:userId', admin, async (request, reply) => {
    const { actor, userId } = audited(app, request, 'delete');
    await service.delete(actor, userId);
    return reply.code(204).send();
  });
}

function registerMailTestRoutes(app: FastifyInstance, mailTest: MailSamplesService): void {
  const { requireRole, userOf } = app.authGuards;
  const admin = { preHandler: requireRole('admin') };
  app.get('/admin/mail-samples', admin, async () => {
    return { samples: mailTest.list() } satisfies MailSamplesResponseDto;
  });
  const limit = perUserRateLimit(MAIL_TESTS_PER_10_MINUTES, '10 minutes', userOf);
  const send = { ...admin, config: { rateLimit: limit } };
  app.post('/admin/mail-samples/:sampleId/send', send, async (request) => {
    const { sampleId } = mailSampleParamsDto.parse(request.params);
    const { to } = sendMailSampleRequestDto.parse(request.body);
    const adminId = userOf(request).id;
    request.log.info({ adminId, sampleId, action: 'mail-test' }, 'backoffice action');
    return (await mailTest.send(sampleId, to)) satisfies SendMailSampleResponseDto;
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): UserAdminRateLimitedError {
  return new UserAdminRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function actorOf(app: FastifyInstance, request: FastifyRequest): AdminActor {
  const user = app.authGuards.userOf(request);
  return { id: user.id, name: user.name };
}

// The trail for a future activity log: who did what to whom, never an address nor a token.
function audited(
  app: FastifyInstance,
  request: FastifyRequest,
  action: AdminAction,
): Readonly<{ actor: AdminActor; userId: string }> {
  const { userId } = adminUserParamsDto.parse(request.params);
  const actor = actorOf(app, request);
  request.log.info({ adminId: actor.id, targetUserId: userId, action }, 'backoffice action');
  return { actor, userId };
}

function toApiError(error: UserAdminError): ApiErrorDto {
  const blocking =
    error instanceof OwnsSharedCampaignsError
      ? { blockingCampaigns: [...error.blockingCampaigns] }
      : {};
  const retry =
    error instanceof UserAdminRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...blocking, ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof UserAdminError) {
    if (error.code === 'MAIL_DELIVERY_FAILED') request.log.warn({ err: error }, 'mail test failed');
    return reply.code(STATUS_BY_CODE[error.code]).send(toApiError(error));
  }
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the user-admin module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
