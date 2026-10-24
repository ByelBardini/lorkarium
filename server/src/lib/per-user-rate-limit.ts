import type { FastifyRequest } from 'fastify';

/** The `@fastify/rate-limit` route config of a signed-in route, keyed by the user: it runs on
 *  `preHandler`, after the auth guard, so `userOf` already knows who asks.
 *
 *  Example: `{ preHandler: requireAuth, config: { rateLimit: perUserRateLimit(5, '1 minute', userOf) } }` */
export function perUserRateLimit(
  max: number,
  timeWindow: string,
  userOf: (request: FastifyRequest) => Readonly<{ id: string }>,
): object {
  return {
    max,
    timeWindow,
    hook: 'preHandler',
    keyGenerator: (request: FastifyRequest) => userOf(request).id,
  };
}
