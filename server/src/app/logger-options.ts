import type { FastifyRequest, FastifyServerOptions } from 'fastify';
import type { Env } from '../config/env';

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

/** The Fastify logger: silent in tests, request lines without the IP, cookies redacted.
 *
 *  Example: `Fastify({ logger: loggerOptions(env), trustProxy })` */
export function loggerOptions(env: Pick<Env, 'nodeEnv'>): FastifyServerOptions['logger'] {
  return {
    level: env.nodeEnv === 'test' ? 'silent' : 'info',
    redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' },
    serializers: { req: requestLogLineOf },
  };
}

function pathOf(url: string): string {
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}
