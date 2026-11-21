import type { FastifyInstance, FastifyRequest, FastifyServerOptions } from 'fastify';
import type { LoggerOptions } from 'pino';
import type { Env } from '../config/env';
import { bindToRequestLog } from '../lib/request-log';
import type { ReportFailureLog } from '../modules/error-reports/unexpected-errors.service';

// Session tokens travel in these headers; a log line must never carry one.
const REDACTED_LOG_PATHS = ['req.headers.cookie', 'res.headers["set-cookie"]'];

/** What the operational log keeps of a request: the method and the route, never the IP, the port,
 *  the host nor the query string. The access log is the only place an IP goes (Privacidade §8). */
export type RequestLogLine = Readonly<{ method: string; route: string }>;

type LoggedRequest = Pick<FastifyRequest, 'method' | 'url' | 'routeOptions'>;

/** The request line of the pino log: the declared route when one matched, else the bare path.
 *
 *  Example: `requestLogLineOf(request) // { method: 'GET', route: '/api/campaigns/:campaignId' }` */
export function requestLogLineOf(request: LoggedRequest): RequestLogLine {
  return { method: request.method, route: request.routeOptions.url ?? pathOf(request.url) };
}

/** Who hears every `error`/`fatal` line of the app: `log.error` is the alarm (Sentry), an expected
 *  failure is a `warn`. */
export type ErrorLogListener = Readonly<{
  onErrorLog: (
    args: readonly unknown[],
    bindings: Readonly<Record<string, unknown>>,
    log: ReportFailureLog,
  ) => void;
}>;

// pino's numeric `error`; `fatal` (60) is above it.
const ERROR_LEVEL = 50;

// Tests keep the `error` level so the hook still runs, but print nothing.
const DISCARDED_LINES = { write: (): void => {} };

/** The Fastify logger: request lines without the IP, cookies redacted, and every line at `error`
 *  or above handed to `errors` before it is written; in tests, nothing is printed.
 *
 *  Example: `Fastify({ logger: loggerOptions(env, unexpectedErrors), trustProxy })` */
export function loggerOptions(
  env: Pick<Env, 'nodeEnv'>,
  errors?: ErrorLogListener,
): FastifyServerOptions['logger'] {
  const test = env.nodeEnv === 'test';
  return {
    level: test ? 'error' : 'info',
    ...(test ? { stream: DISCARDED_LINES } : {}),
    redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' },
    serializers: { req: requestLogLineOf },
    hooks: { logMethod: errorLogHook(errors) },
  };
}

/** Puts the method and the route on every line of a request (the 5xx report says where).
 *
 *  Example: `bindRequestRoute(app)` before the module plugins are registered */
export function bindRequestRoute(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    bindToRequestLog(request.log, requestLogLineOf(request));
  });
}

type LogMethodHook = NonNullable<NonNullable<LoggerOptions['hooks']>['logMethod']>;

function errorLogHook(errors: ErrorLogListener | undefined): LogMethodHook {
  return function hearErrorLines(args, method, level) {
    if (errors && level >= ERROR_LEVEL) errors.onErrorLog(args, this.bindings(), this);
    method.apply(this, args);
  };
}

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
