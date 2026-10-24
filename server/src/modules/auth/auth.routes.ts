import rateLimit from '@fastify/rate-limit';
import {
  loginRequestDto,
  twoFactorLoginRequestDto,
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
import { toSecondFactor } from './auth.mapper';
import type { AuthService, IssuedChallenge, IssuedSession, ResolvedSession } from './auth.service';
import { TWO_FACTOR_CHALLENGE_MS } from './two-factor-challenge.bo';
import type { TwoFactorLoginService } from './two-factor-login.service';
import type { UserRole } from './user-access.bo';

export const SESSION_COOKIE = 'lk_session';

/** The challenge of the second login step; only the login routes ever receive it. */
export const TWO_FACTOR_COOKIE = 'lk_2fa';
const TWO_FACTOR_COOKIE_PATH = '/api/auth';

// Spec §8.4: per IP + e-mail, so one attacker cannot lock every account and one account
// cannot be brute-forced from one address.
const LOGIN_ATTEMPTS_PER_MINUTE = 5;
// Per IP: the second step carries no e-mail, and the challenge itself dies after 5 wrong codes.
const TWO_FACTOR_ATTEMPTS_PER_MINUTE = 5;

const STATUS_BY_CODE: Readonly<Record<AuthErrorCode, number>> = {
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  RATE_LIMITED: 429,
  TWO_FACTOR_CODE_INVALID: 401,
  TWO_FACTOR_CHALLENGE_EXPIRED: 401,
};

// Public text only: the internal message cites the e-mail and stays in the log.
const PUBLIC_MESSAGE: Readonly<Record<AuthErrorCode, string>> = {
  INVALID_CREDENTIALS: 'E-mail or password is incorrect',
  UNAUTHENTICATED: 'A valid session is required',
  FORBIDDEN_ROLE: 'Your account cannot access this resource',
  RATE_LIMITED: 'Too many login attempts',
  TWO_FACTOR_CODE_INVALID: 'The two-factor code is incorrect',
  TWO_FACTOR_CHALLENGE_EXPIRED: 'The time to type the two-factor code is over; sign in again',
};

export type AuthCookiePolicy = Readonly<{ secure: boolean }>;

/** Prehandlers other modules put on their routes; `userOf` reads who passed them. */
export type AuthGuards = Readonly<{
  requireAuth: preHandlerAsyncHookHandler;
  requireRole: (required: UserRole) => preHandlerAsyncHookHandler;
  userOf: (request: FastifyRequest) => ResolvedSession['user'];
  /** The id (token hash) of the session that passed the guard: tells "this device" apart. */
  sessionIdOf: (request: FastifyRequest) => string;
  /** For the realtime handshake and its rechecks, which have no request to guard: `null` = no
   *  valid session. The connection keeps the session id and `recheckAt` from it. */
  authenticateConnection: (token: string | undefined) => Promise<ResolvedSession | null>;
}>;

export type AuthRoutesServices = Readonly<{
  auth: AuthService;
  twoFactorLogin: TwoFactorLoginService;
}>;

/** HTTP edge of auth: login (with its 2FA step), logout and "who am I", with the session in an
 *  HttpOnly cookie.
 *
 *  Example: `app.register(authRoutes({ auth, twoFactorLogin }, { secure: true }), { prefix: '/api' })` */
export function authRoutes(
  services: AuthRoutesServices,
  cookiePolicy: AuthCookiePolicy,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.setErrorHandler(replyWithApiError);
    registerLoginRoutes(app, services, cookiePolicy);
    registerSessionRoutes(app, services.auth, cookiePolicy);
  };
}

function registerLoginRoutes(
  app: FastifyInstance,
  { auth, twoFactorLogin }: AuthRoutesServices,
  cookiePolicy: AuthCookiePolicy,
): void {
  app.post('/auth/login', { config: { rateLimit: loginRateLimit() } }, async (request, reply) => {
    const input = loginRequestDto.parse(request.body);
    const outcome = await auth.login(input, request.headers['user-agent']);
    if (outcome.status === 'signed-in') return signedIn(reply, outcome, cookiePolicy);
    setTwoFactorCookie(reply, outcome.challenge, cookiePolicy);
    return { status: 'two-factor-required' } satisfies LoginResponseDto;
  });
  const twoFactorOptions = { config: { rateLimit: twoFactorRateLimit() } };
  app.post('/auth/login/two-factor', twoFactorOptions, async (request, reply) => {
    const input = twoFactorLoginRequestDto.parse(request.body);
    const factor = toSecondFactor('code' in input ? input.code : input.recoveryCode);
    const challenge = request.cookies[TWO_FACTOR_COOKIE];
    const issued = await twoFactorLogin.complete(challenge, factor, request.headers['user-agent']);
    reply.clearCookie(TWO_FACTOR_COOKIE, { path: TWO_FACTOR_COOKIE_PATH });
    return signedIn(reply, issued, cookiePolicy);
  });
}

function registerSessionRoutes(
  app: FastifyInstance,
  service: AuthService,
  cookiePolicy: AuthCookiePolicy,
): void {
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
}

function signedIn(
  reply: FastifyReply,
  issued: IssuedSession,
  cookiePolicy: AuthCookiePolicy,
): LoginResponseDto {
  setSessionCookie(reply, issued.token, issued.persistent, cookiePolicy);
  return { status: 'signed-in', user: issued.user };
}

/** Guards that resolve the session cookie and answer 401/403 as `ApiErrorDto`.
 *
 *  Example: `app.get('/admin/users', { preHandler: guards.requireRole('admin') }, handler)` */
export function createAuthGuards(service: AuthService, cookiePolicy: AuthCookiePolicy): AuthGuards {
  const passed = new WeakMap<FastifyRequest, ResolvedSession>();
  const requireRole = (required: UserRole): preHandlerAsyncHookHandler => {
    return async (request, reply) => {
      try {
        const resolved = await service.authorize(request.cookies[SESSION_COOKIE], required);
        refreshSessionCookie(request, reply, resolved, cookiePolicy);
        passed.set(request, resolved);
      } catch (error) {
        if (!(error instanceof AuthError)) throw error;
        return reply.code(STATUS_BY_CODE[error.code]).send(toApiError(error));
      }
    };
  };
  return {
    requireAuth: requireRole('user'),
    requireRole,
    userOf: (request) => sessionFrom(passed, request).user,
    sessionIdOf: (request) => sessionFrom(passed, request).sessionId,
    authenticateConnection: (token) => sessionOfToken(service, token),
  };
}

async function sessionOfToken(
  service: AuthService,
  token: string | undefined,
): Promise<ResolvedSession | null> {
  try {
    return await service.authorize(token, 'user');
  } catch (error) {
    if (error instanceof AuthError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

function sessionFrom(
  passed: WeakMap<FastifyRequest, ResolvedSession>,
  request: FastifyRequest,
): ResolvedSession {
  const session = passed.get(request);
  if (!session) throw new Error(`no auth guard ran before ${request.method} ${request.url}`);
  return session;
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

function twoFactorRateLimit(): object {
  return {
    max: TWO_FACTOR_ATTEMPTS_PER_MINUTE,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => request.ip,
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

// Path=/api/auth: only the login routes ever see it; it lives exactly as long as the challenge.
function setTwoFactorCookie(
  reply: FastifyReply,
  challenge: IssuedChallenge,
  policy: AuthCookiePolicy,
): void {
  reply.setCookie(TWO_FACTOR_COOKIE, challenge.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: TWO_FACTOR_COOKIE_PATH,
    secure: policy.secure,
    maxAge: TWO_FACTOR_CHALLENGE_MS / 1000,
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
