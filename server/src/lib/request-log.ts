import type { FastifyBaseLogger } from 'fastify';
import type { Logger } from 'pino';

/** Adds fields to every later line of a request log (the route, the signed-in account), so a
 *  `log.error` of that request reports them.
 *
 *  Example: `bindToRequestLog(request.log, { userId: user.id, username: user.username })` */
export function bindToRequestLog(
  log: FastifyBaseLogger,
  bindings: Readonly<Record<string, string>>,
): void {
  if (canSetBindings(log)) log.setBindings(bindings);
}

// Fastify types the request log as the base logger; at runtime it is a pino child.
function canSetBindings(log: object): log is Pick<Logger, 'setBindings'> {
  return 'setBindings' in log && typeof log.setBindings === 'function';
}
