import rateLimit from '@fastify/rate-limit';
import {
  acceptInvitationRequestDto,
  accountLinkTokenDto,
  adminUserParamsDto,
  completePasswordResetRequestDto,
  createInvitationRequestDto,
  invitationParamsDto,
  type AcceptInvitationResponseDto,
  type ApiErrorDto,
  type InvitationInspectResponseDto,
  type InvitationLinkResponseDto,
  type PasswordResetInspectResponseDto,
  type PasswordResetLinkResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { AuthError } from '../auth/auth.error';
import {
  AccountLinksError,
  AccountLinksRateLimitedError,
  AlreadyInvitedError,
  type AccountLinksErrorCode,
} from './account-links.error';
import type { InvitationsService, Inviter } from './invitations.service';
import type { PasswordResetsService } from './password-resets.service';

// Spec §8.4: links an admin issues, per admin; the public routes, per IP.
const ADMIN_LINKS_PER_10_MINUTES = 20;
const PUBLIC_ATTEMPTS_PER_MINUTE = 10;

type RefusalCode = AccountLinksErrorCode | 'ACCOUNT_SUSPENDED';

const STATUS_BY_CODE: Readonly<Record<RefusalCode, number>> = {
  ACCOUNT_LINK_INVALID: 404,
  EMAIL_TAKEN: 409,
  ALREADY_INVITED: 409,
  INVITATION_NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  USER_NOT_FOUND: 404,
  SELF_ACTION: 409,
  RATE_LIMITED: 429,
  // A conflict here, not the login's 403: the admin's session is fine, the target is suspended.
  ACCOUNT_SUSPENDED: 409,
};

// Public text only: the internal message cites addresses and ids and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<RefusalCode, string>> = {
  ACCOUNT_LINK_INVALID: 'This link expired or was already used',
  EMAIL_TAKEN: 'This e-mail already belongs to an account',
  ALREADY_INVITED: 'This e-mail already has a pending invitation',
  INVITATION_NOT_FOUND: 'Invitation not found',
  USERNAME_TAKEN: 'This @ is already taken',
  USER_NOT_FOUND: 'Account not found',
  SELF_ACTION: 'Admins cannot do this to their own account',
  RATE_LIMITED: 'Too many attempts',
  ACCOUNT_SUSPENDED: 'The account is suspended',
};

export type AccountLinksRoutesServices = Readonly<{
  invitations: InvitationsService;
  passwordResets: PasswordResetsService;
}>;

/** HTTP edge of the one-time links: the admin issues invitations and new-password links
 *  (`/admin/*`, admin only); whoever got the link inspects and uses it (public, the token is the
 *  proof). Sets the limiter and the error handler of the module's context.
 *
 *  Example: `await app.register(accountLinksRoutes(services), { prefix: '/api' })` */
export function accountLinksRoutes(
  services: AccountLinksRoutesServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerInvitationAdminRoutes(app, services.invitations);
    registerPasswordResetAdminRoute(app, services.passwordResets);
    registerInvitationPublicRoutes(app, services.invitations);
    registerPasswordResetPublicRoutes(app, services.passwordResets);
  };
}

function adminOptions(app: FastifyInstance, limited: boolean): object {
  const { requireRole, userOf } = app.authGuards;
  const limit = perUserRateLimit(ADMIN_LINKS_PER_10_MINUTES, '10 minutes', userOf);
  return { preHandler: requireRole('admin'), ...(limited ? { config: { rateLimit: limit } } : {}) };
}

function publicOptions(): object {
  return { config: { rateLimit: { max: PUBLIC_ATTEMPTS_PER_MINUTE, timeWindow: '1 minute' } } };
}

function inviterOf(app: FastifyInstance, request: FastifyRequest): Inviter {
  const user = app.authGuards.userOf(request);
  return { id: user.id, name: user.name };
}

function registerInvitationAdminRoutes(app: FastifyInstance, service: InvitationsService): void {
  app.post('/admin/invitations', adminOptions(app, true), async (request, reply) => {
    const input = createInvitationRequestDto.parse(request.body);
    const inviter = inviterOf(app, request);
    const created = await service.invite(inviter, input);
    const audit = { adminId: inviter.id, invitationId: created.invitation.id, action: 'invite' };
    request.log.info(audit, 'backoffice action');
    return reply.code(201).send(created satisfies InvitationLinkResponseDto);
  });
  app.post('/admin/invitations/:invitationId/resend', adminOptions(app, true), async (request) => {
    const { invitationId } = invitationParamsDto.parse(request.params);
    const inviter = inviterOf(app, request);
    request.log.info({ adminId: inviter.id, invitationId, action: 'resend' }, 'backoffice action');
    return (await service.resend(invitationId)) satisfies InvitationLinkResponseDto;
  });
  app.delete(
    '/admin/invitations/:invitationId',
    adminOptions(app, false),
    async (request, reply) => {
      const { invitationId } = invitationParamsDto.parse(request.params);
      const adminId = app.authGuards.userOf(request).id;
      request.log.info({ adminId, invitationId, action: 'cancel' }, 'backoffice action');
      await service.cancel(invitationId);
      return reply.code(204).send();
    },
  );
}

function registerPasswordResetAdminRoute(
  app: FastifyInstance,
  service: PasswordResetsService,
): void {
  app.post('/admin/users/:userId/password-reset', adminOptions(app, true), async (request) => {
    const { userId } = adminUserParamsDto.parse(request.params);
    const adminId = app.authGuards.userOf(request).id;
    const audit = { adminId, targetUserId: userId, action: 'password-reset' };
    request.log.info(audit, 'backoffice action');
    return (await service.issue(adminId, userId)) satisfies PasswordResetLinkResponseDto;
  });
}

// Public on purpose: whoever was invited has no account yet.
function registerInvitationPublicRoutes(app: FastifyInstance, service: InvitationsService): void {
  app.post('/invitations/inspect', publicOptions(), async (request) => {
    const { token } = accountLinkTokenDto.parse(request.body);
    return (await service.inspect(token)) satisfies InvitationInspectResponseDto;
  });
  app.post('/invitations/accept', publicOptions(), async (request, reply) => {
    const input = acceptInvitationRequestDto.parse(request.body);
    const issued = await service.accept(input, request.headers['user-agent']);
    app.authGuards.setSessionCookie(reply, issued);
    return { status: 'signed-in', user: issued.user } satisfies AcceptInvitationResponseDto;
  });
}

// Public on purpose: the link may be opened signed out (it is how the password comes back).
function registerPasswordResetPublicRoutes(
  app: FastifyInstance,
  service: PasswordResetsService,
): void {
  app.post('/password-resets/inspect', publicOptions(), async (request) => {
    const { token } = accountLinkTokenDto.parse(request.body);
    return (await service.inspect(token)) satisfies PasswordResetInspectResponseDto;
  });
  app.post('/password-resets/complete', publicOptions(), async (request, reply) => {
    const input = completePasswordResetRequestDto.parse(request.body);
    await service.complete(input.token, input.newPassword, request.headers['user-agent'] ?? null);
    return reply.code(204).send();
  });
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): AccountLinksRateLimitedError {
  return new AccountLinksRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function toApiError(error: AccountLinksError | AuthError): ApiErrorDto {
  const code = error.code as RefusalCode;
  const retry =
    error instanceof AccountLinksRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  const invited = error instanceof AlreadyInvitedError ? { invitationId: error.invitationId } : {};
  return { code, message: PUBLIC_MESSAGE[code], ...retry, ...invited };
}

function refusalOf(error: unknown): Readonly<{ status: number; body: ApiErrorDto }> | undefined {
  const known =
    error instanceof AccountLinksError ||
    (error instanceof AuthError && error.code === 'ACCOUNT_SUSPENDED');
  if (!known) return undefined;
  return { status: STATUS_BY_CODE[error.code as RefusalCode], body: toApiError(error) };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const refusal = refusalOf(error);
  if (refusal) return reply.code(refusal.status).send(refusal.body);
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the account-links module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
