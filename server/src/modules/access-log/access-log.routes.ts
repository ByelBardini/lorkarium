import type { FastifyReply, FastifyRequest, onResponseAsyncHookHandler } from 'fastify';
import type { AccessLogService } from './access-log.service';

/** The account logged in on a request, or `null`; the auth guards know it, this module never
 *  reads the cookie. */
export type AccountOfRequest = (request: FastifyRequest) => string | null;

/** The root `onResponse` hook that records every answered request: each `/api` route, the static
 *  files and the SPA fallback. Logs the declared route, never the raw URL.
 *
 *  Example: `app.addHook('onResponse', accessLogResponseHook(service, accountOf))` */
export function accessLogResponseHook(
  service: AccessLogService,
  accountOf: AccountOfRequest,
): onResponseAsyncHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    service.recordHttp({
      ip: request.ip,
      userId: accountOf(request),
      method: request.method,
      routePattern: request.routeOptions.url,
      url: request.url,
      status: reply.statusCode,
    });
  };
}
