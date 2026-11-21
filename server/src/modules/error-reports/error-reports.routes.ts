import rateLimit from '@fastify/rate-limit';
import type { ApiErrorDto, ErrorReportingSettingsDto } from '@lorkarium/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { ClientErrorSender } from './client-error-envelope.bo';
import type { ClientErrorRelayService } from './client-error-relay.service';
import {
  ErrorReportError,
  ErrorReportRateLimitedError,
  ErrorReportTestError,
  type ErrorReportErrorCode,
} from './error-reports.error';

// A browser envelope is a few KB; a stack trace with breadcrumbs stays far below this.
export const ERROR_REPORT_BODY_LIMIT = 200 * 1024;
const REPORTS_PER_MINUTE_PER_IP = 20;
const TESTS_PER_MINUTE = 5;
const ENVELOPE_CONTENT_TYPE = 'application/x-sentry-envelope';

const STATUS_BY_CODE: Readonly<Record<ErrorReportErrorCode, number>> = {
  INVALID_ENVELOPE: 400,
  UNKNOWN_DSN: 403,
  RATE_LIMITED: 429,
};

const PUBLIC_MESSAGE: Readonly<Record<ErrorReportErrorCode, string>> = {
  INVALID_ENVELOPE: 'The body is not a Sentry envelope',
  UNKNOWN_DSN: 'The envelope is not for this server',
  RATE_LIMITED: 'Too many error reports in a row',
};

export type ErrorReportsRouteServices = Readonly<{
  settings: ErrorReportingSettingsDto;
  /** null = no `SENTRY_DSN`: the tunnel answers 204 and forwards nothing. */
  relay: ClientErrorRelayService | null;
  /** The name of the session cookie the tunnel reads the optional account from. */
  sessionCookie: string;
}>;

/** HTTP edge of the error reports: the public settings and tunnel of the browser SDK (the account
 *  comes from the session cookie, never from the body) and the admin's server test.
 *
 *  Example: `app.register(errorReportsRoutes({ settings, relay }), { prefix: '/api' })` */
export function errorReportsRoutes(
  services: ErrorReportsRouteServices,
): (app: FastifyInstance) => Promise<void> {
  return async (app: FastifyInstance): Promise<void> => {
    await app.register(rateLimit, { global: false, errorResponseBuilder: rateLimitedError });
    app.addContentTypeParser(ENVELOPE_CONTENT_TYPE, { parseAs: 'string' }, (_request, body, done) =>
      done(null, body),
    );
    app.setErrorHandler(replyWithApiError);
    app.get('/error-reports/settings', async () => services.settings);
    registerTunnel(app, services);
    registerServerTest(app);
  };
}

function registerTunnel(app: FastifyInstance, services: ErrorReportsRouteServices): void {
  const { relay, sessionCookie } = services;
  const options = {
    bodyLimit: ERROR_REPORT_BODY_LIMIT,
    config: { rateLimit: { max: REPORTS_PER_MINUTE_PER_IP, timeWindow: '1 minute' } },
  };
  app.post('/error-reports', options, async (request, reply) => {
    if (!relay) return reply.code(204).send();
    const outcome = await relay.relay(
      envelopeTextOf(request),
      await senderOf(app, request.cookies[sessionCookie]),
    );
    request.log.info({ outcome }, 'browser error report relayed');
    return reply.code(200).send({});
  });
}

function registerServerTest(app: FastifyInstance): void {
  const { requireRole, userOf } = app.authGuards;
  const limit = app.rateLimit(perUserRateLimit(TESTS_PER_MINUTE, '1 minute', userOf));
  app.post(
    '/admin/error-reports/test',
    { preHandler: [requireRole('admin'), limit] },
    (request) => {
      throw new ErrorReportTestError(userOf(request).id);
    },
  );
}

// Anonymous is fine (the sign-in screen reports too); a forged body never names anyone.
async function senderOf(
  app: FastifyInstance,
  token: string | undefined,
): Promise<ClientErrorSender | null> {
  const session = await app.authGuards.authenticateConnection(token);
  return session ? { id: session.user.id, username: session.user.username } : null;
}

function envelopeTextOf(request: FastifyRequest): string {
  if (typeof request.body === 'string') return request.body;
  const contentType = JSON.stringify(request.headers['content-type'] ?? 'nothing');
  throw new ErrorReportError(
    'INVALID_ENVELOPE',
    `the body must be the envelope as text (received ${contentType})`,
  );
}

function rateLimitedError(
  _request: FastifyRequest,
  context: { ttl: number },
): ErrorReportRateLimitedError {
  return new ErrorReportRateLimitedError(Math.max(1, Math.ceil(context.ttl / 1000)));
}

function errorReportBody(error: ErrorReportError): ApiErrorDto {
  const retry =
    error instanceof ErrorReportRateLimitedError
      ? { retryAfterSeconds: error.retryAfterSeconds }
      : {};
  return { code: error.code, message: PUBLIC_MESSAGE[error.code], ...retry };
}

async function replyWithApiError(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (error instanceof ErrorReportError) {
    request.log.info({ code: error.code, detail: error.message }, 'error report refused');
    return reply.code(STATUS_BY_CODE[error.code]).send(errorReportBody(error));
  }
  if (error.statusCode !== undefined && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send({ code: error.code, message: error.message } satisfies ApiErrorDto);
  }
  request.log.error({ err: error }, 'unexpected error in the error reports module');
  return reply
    .code(500)
    .send({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' } satisfies ApiErrorDto);
}
