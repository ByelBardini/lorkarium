import rateLimit from '@fastify/rate-limit';
import {
  loginRequestDto,
  type ApiErrorDto,
  type LoginResponseDto,
  type MeResponseDto,
} from '@lorkarium/contracts';
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { ZodError } from 'zod';
import { invalidBodyError } from '../../lib/invalid-body';
import { PERSISTENT_SESSION_MS } from './auth-session.bo';
import { AuthError, RateLimitedError, type AuthErrorCode } from './auth.error';
import type { AuthService, ResolvedSession } from './auth.service';
import type { UserRole } from './user-access.bo';

export const SESSION_COOKIE = 'lk_session';

// Spec §8.4: per IP + e-mail, so one attacker cannot lock every account and one account
// cannot be brute-forced from one address.
const LOGIN_ATTEMPTS_PER_MINUTE = 5;

const STATUS_BY_CODE: Readonly<Record<AuthErrorCode, number>> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  RATE_LIMITED: 429,
};

// Public text only: the internal message cites the e-mail and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<AuthErrorCode, string>> = {
  INVALID_CREDENTIALS: 'E-mail or password is incorrect',
  UNAUTHENTICATED: 'A valid session is required',
  FORBIDDEN_ROLE: 'Your account cannot access this resource',
  RATE_LIMITED: 'Too many login attempts',
};

export type AuthCookiePolicy = Readonly<{ secure: boolean }>;

/** Prehandlers other modules put on their routes; `userOf` reads who passed them. */
export type AuthGuards = Readonly<{
  requireAuth: preHandlerAsyncHookHandler;
  requireRole: (required: UserRole) => preHandlerAsyncHookHandler;
  userOf: (request: FastifyRequest) => ResolvedSession['user'];
  /** For the realtime handshake, which has no request to guard: `null` = no valid session. */
  authenticateToken: (token: string | undefined) => Promise<ResolvedSession['user'] | null>;
}>;

/** HTTP edge of auth: login, logout and "who am I", with the session in an HttpOnly cookie.
 *
 *  Example: `app.register(authRoutes(service, { secure: true }), { prefix: '/api' })` */
export function authRoutes(
  service: AuthService,
  cookiePolicy: AuthCookiePolicy,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    app.post('/auth/login', { config: { rateLimit: loginRateLimit() } }, async (request, reply) => {
      const issued = await service.login(loginRequestDto.parse(request.body));
      setSessionCookie(reply, issued.token, issued.persistent, cookiePolicy);
      return { user: issued.user } satisfies LoginResponseDto;
    });
    app.post('/auth/logout', async (request, reply) => {
      await service.logout(request.cookies[SESSION_COOKIE]);
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
      return reply.code(204).send();
    });
    app.get('/auth/me', async (request, reply) => {
      const resolved = await service.resolveSession(request.cookies[SESSION_COOKIE]);
      if (resolved) refreshSessionCookie(request, reply, resolved, cookiePolicy);
      return { user: resolved?.user ?? null } satisfies MeResponseDto;
    });
  };
}

/** Guards that resolve the session cookie and answer 401/403 as `ApiErrorDto`.
 *
 *  Example: `app.get('/admin/users', { preHandler: guards.requireRole('admin') }, handler)` */
export function createAuthGuards(service: AuthService, cookiePolicy: AuthCookiePolicy): AuthGuards {
  const signedIn = new WeakMap<FastifyRequest, ResolvedSession['user']>();
  const requireRole = (required: UserRole): preHandlerAsyncHookHandler => {
    return async (request, reply) => {
      try {
        const resolved = await service.authorize(request.cookies[SESSION_COOKIE], required);
        refreshSessionCookie(request, reply, resolved, cookiePolicy);
        signedIn.set(request, resolved.user);
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        return reply.code(STATUS_BY_CODE[error.code]).send(toApiError(error));
      }
    };
  };
  return {
    requireAuth: requireRole('user'),
    requireRole,
    userOf: (request) => userFrom(signedIn, request),
    authenticateToken: (token) => userOfToken(service, token),
  };
}

async function userOfToken(
  service: AuthService,
  token: string | undefined,
): Promise<ResolvedSession['user'] | null> {
  try {
    return (await service.authorize(token, 'user')).user;
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

function userFrom(
  signedIn: WeakMap<FastifyRequest, ResolvedSession['user']>,
  request: FastifyRequest,
): ResolvedSession['user'] {
  const user = signedIn.get(request);
  if (!user) throw new Error(`no auth guard ran before ${request.method} ${request.url}`);
  return user;
}

function loginRateLimit(): object {
  return {
    max: LOGIN_ATTEMPTS_PER_MINUTE,
    timeWindow: '1 minute',
    // preHandler: the body is parsed by then, so the key can carry the e-mail.
    hook: 'preHandler',
    keyGenerator: (request: FastifyRequest) => `${request.ip}|${emailOf(request.body)}`,
  };
}

function emailOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('email' in body)) return '';
  return String(body.email).trim().toLowerCase();
}

function rateLimitedError(_request: FastifyRequest, context: { ttl: number }): RateLimitedError {
  return new RateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  persistent: boolean,
  policy: AuthCookiePolicy,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: policy.secure,
    // Without Max-Age the browser drops the cookie on close: that is "keep me signed in" unchecked.
    ...(persistent ? { maxAge: PERSISTENT_SESSION_MS / 1000 } : {}),
  });
}

// A renewed persistent session also needs a renewed cookie, or the browser expires it first.
function refreshSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  resolved: ResolvedSession,
  policy: AuthCookiePolicy,
): void {
  const token = request.cookies[SESSION_COOKIE];
  if (!token || !resolved.renewed || !resolved.persistent) return;
  setSessionCookie(reply, token, true, policy);
}

function toApiError(error: AuthError): ApiErrorDto {
  const retry =
    error instanceof RateLimitedError ? { retryAfterSeconds: error.retryAfterSeconds } : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof AuthError)
    return reply.code(STATUS_BY_CODE[error.code]).send(toApiError(error));
  if (error instanceof ZodError) return reply.code(400).send(invalidBodyError(error));
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the auth module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
