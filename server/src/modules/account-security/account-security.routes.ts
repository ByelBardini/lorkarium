import rateLimit from '@fastify/rate-limit';
import {
  changeEmailRequestDto,
  changePasswordRequestDto,
  confirmEmailRequestDto,
  sessionParamsDto,
  type AccountSecurityResponseDto,
  type AccountSessionsResponseDto,
  type ApiErrorDto,
  type ChangeEmailResponseDto,
  type RevokeOthersResponseDto,
} from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import { AuthError, type AuthErrorCode } from '../auth/auth.error';
import type { AccountSessionsService } from './account-sessions.service';
import {
  AccountRateLimitedError,
  AccountSecurityError,
  SessionNotFoundError,
  type AccountSecurityErrorCode,
} from './account-security.error';
import type { AccountSecurityService } from './account-security.service';
import type { EmailChangeService } from './email-change.service';

// Spec §8.4: per user (the e-mail confirm, which is public, per IP).
const PASSWORD_CHANGES_PER_MINUTE = 5;
const EMAIL_REQUESTS_PER_10_MINUTES = 3;
const EMAIL_CONFIRMS_PER_MINUTE = 10;

type RefusalCode = AccountSecurityErrorCode | AuthErrorCode;

const STATUS_BY_CODE: Readonly<Partial<Record<RefusalCode, number>>> = {
  CURRENT_PASSWORD_INVALID: 403,
  SESSION_NOT_FOUND: 404,
  CURRENT_SESSION: 409,
  EMAIL_UNCHANGED: 400,
  EMAIL_TAKEN: 409,
  EMAIL_TOKEN_INVALID: 404,
  TWO_FACTOR_ALREADY_ENABLED: 409,
  TWO_FACTOR_NOT_STARTED: 409,
  TWO_FACTOR_NOT_ENABLED: 409,
  // 403 here, unlike the login's 401: the session is fine, only the code is wrong.
  TWO_FACTOR_CODE_INVALID: 403,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites ids and addresses and stays in the log.
const PUBLIC_MESSAGE: Readonly<Partial<Record<RefusalCode, string>>> = {
  CURRENT_PASSWORD_INVALID: 'The current password is incorrect',
  SESSION_NOT_FOUND: 'Session not found',
  CURRENT_SESSION: 'This is the session in use; sign out instead',
  EMAIL_UNCHANGED: 'The new e-mail is the current one',
  EMAIL_TAKEN: 'This e-mail is already in use',
  EMAIL_TOKEN_INVALID: 'This link expired or was already used',
  TWO_FACTOR_ALREADY_ENABLED: 'Two-factor authentication is already on',
  TWO_FACTOR_NOT_STARTED: 'Start the two-factor setup first',
  TWO_FACTOR_NOT_ENABLED: 'Two-factor authentication is off',
  TWO_FACTOR_CODE_INVALID: 'The two-factor code is incorrect',
  RATE_LIMITED: 'Too many attempts',
};

export type AccountSecurityRoutesServices = Readonly<{
  security: AccountSecurityService;
  sessions: AccountSessionsService;
  emailChange: EmailChangeService;
}>;

/** HTTP edge of the account's security: password, sessions and e-mail; every route acts on the
 *  session's own account, except the public e-mail confirmation (the token is the proof). Sets the
 *  limiter and the error handler of the module's context, which the 2FA routes share.
 *
 *  Example: `await accountSecurityRoutes(services)(app); registerTwoFactorRoutes(app, twoFactor)` */
export function accountSecurityRoutes(
  services: AccountSecurityRoutesServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerPasswordRoutes(app, services.security);
    registerSessionRoutes(app, services.sessions);
    registerEmailRoutes(app, services.emailChange);
  };
}

function registerPasswordRoutes(app: FastifyInstance, service: AccountSecurityService): void {
  const { requireAuth, userOf, sessionIdOf } = app.authGuards;
  app.get('/account/security', { preHandler: requireAuth }, async (request) => {
    const security = await service.overview(userOf(request).id);
    return { security } satisfies AccountSecurityResponseDto;
  });
  const limit = perUserRateLimit(PASSWORD_CHANGES_PER_MINUTE, '1 minute', userOf);
  const options = { preHandler: requireAuth, config: { rateLimit: limit } };
  app.post('/account/password', options, async (request, reply) => {
    const input = changePasswordRequestDto.parse(request.body);
    await service.changePassword(userOf(request).id, sessionIdOf(request), input);
    return reply.code(204).send();
  });
}

function registerSessionRoutes(app: FastifyInstance, service: AccountSessionsService): void {
  const { requireAuth, userOf, sessionIdOf } = app.authGuards;
  app.get('/account/sessions', { preHandler: requireAuth }, async (request) => {
    const sessions = await service.list(userOf(request).id, sessionIdOf(request));
    return { sessions } satisfies AccountSessionsResponseDto;
  });
  app.delete(
    '/account/sessions/:sessionId',
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = userOf(request).id;
      await service.revoke(userId, sessionIdOf(request), publicSessionIdOf(request, userId));
      return reply.code(204).send();
    },
  );
  app.post('/account/sessions/revoke-others', { preHandler: requireAuth }, async (request) => {
    const revoked = await service.revokeOthers(userOf(request).id, sessionIdOf(request));
    return { revoked } satisfies RevokeOthersResponseDto;
  });
}

function registerEmailRoutes(app: FastifyInstance, service: EmailChangeService): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = perUserRateLimit(EMAIL_REQUESTS_PER_10_MINUTES, '10 minutes', userOf);
  const options = { preHandler: requireAuth, config: { rateLimit: limit } };
  app.post('/account/email', options, async (request, reply) => {
    const input = changeEmailRequestDto.parse(request.body);
    const pendingEmail = await service.request(userOf(request).id, input);
    return reply.code(202).send({ pendingEmail } satisfies ChangeEmailResponseDto);
  });
  app.delete('/account/email', { preHandler: requireAuth }, async (request, reply) => {
    await service.cancel(userOf(request).id);
    return reply.code(204).send();
  });
  // Public on purpose: the link may be opened signed out (or on another device).
  const confirmLimit = { max: EMAIL_CONFIRMS_PER_MINUTE, timeWindow: '1 minute' };
  app.post(
    '/account/email/confirm',
    { config: { rateLimit: confirmLimit } },
    async (request, reply) => {
      await service.confirm(confirmEmailRequestDto.parse(request.body).token);
      return reply.code(204).send();
    },
  );
}

// A malformed id is the same 404 as someone else's: no shape of an existing id leaks.
function publicSessionIdOf(request: FastifyRequest, userId: string): string {
  const parsed = sessionParamsDto.safeParse(request.params);
  if (parsed.success) return parsed.data.sessionId;
  throw new SessionNotFoundError(userId, JSON.stringify(request.params));
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): AccountRateLimitedError {
  return new AccountRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function toApiError(error: AccountSecurityError | AuthError): ApiErrorDto {
  const retry =
    error instanceof AccountRateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  const message = PUBLIC_MESSAGE[error.code] ?? 'Request refused';
  return { code: error.code, message, ...retry };
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
  request.log.error({ err: error }, 'unexpected error in the account-security module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}

// Auth refusals reach here too (a wrong 2FA code comes from the auth module's check).
function refusalOf(error: unknown): Readonly<{ status: number; body: ApiErrorDto }> | undefined {
  if (!(error instanceof AccountSecurityError) && !(error instanceof AuthError)) return undefined;
  const status = STATUS_BY_CODE[error.code];
  return status === undefined ? undefined : { status, body: toApiError(error) };
}
