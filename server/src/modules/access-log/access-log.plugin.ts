import type { onResponseAsyncHookHandler } from 'fastify';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import { accessLogGateway } from './access-log.gateway';
import { accessLogResponseHook, type AccountOfRequest } from './access-log.routes';
import { AccessLogService, type AccessLogServiceDeps } from './access-log.service';

export type AccessLogModuleOptions = AccessLogServiceDeps &
  Readonly<{
    /** The same `TRUST_PROXY` as Fastify's, so a connection logs the IP a request would. */
    trustProxyHops: number;
    accountOf: AccountOfRequest;
  }>;

export type AccessLogModule = Readonly<{
  service: AccessLogService;
  /** For the root, so every route, the static files and the SPA fallback pass through it. */
  onResponse: onResponseAsyncHookHandler;
  gateway: (socket: RealtimeSocket) => void;
}>;

/** The access log (Marco Civil, art. 15): one service fed by the HTTP hook and the connection
 *  listener; the app adds both and starts and closes the service.
 *
 *  Example: `app.addHook('onResponse', createAccessLogModule(options).onResponse)` */
export function createAccessLogModule(options: AccessLogModuleOptions): AccessLogModule {
  const service = new AccessLogService(options);
  return {
    service,
    onResponse: accessLogResponseHook(service, options.accountOf),
    gateway: accessLogGateway(service, options.trustProxyHops),
  };
}
