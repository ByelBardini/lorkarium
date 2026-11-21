import type { FastifyInstance } from 'fastify';
import type { ErrorReportingConfig } from '../../config/error-reporting-env';
import { ClientErrorEnvelopeBo } from './client-error-envelope.bo';
import type { ClientErrorRelay } from './client-error-relay.port';
import { ClientErrorRelayService } from './client-error-relay.service';
import { errorReportsRoutes } from './error-reports.routes';
import type { ReportFailureLog } from './unexpected-errors.service';

export type ErrorReportsModuleOptions = Readonly<{
  /** `env.errorReporting`; null = the tunnel forwards nothing and the client loads no SDK. */
  config: ErrorReportingConfig | null;
  /** The environment the client reports under when there is no DSN (shown, never used). */
  nodeEnv: string;
  relay: ClientErrorRelay;
  log: ReportFailureLog;
  sessionCookie: string;
}>;

/** Wires the error reports: the settings, the browser tunnel and the admin's server test.
 *
 *  Example: `await app.register(createErrorReportsModule({ config, nodeEnv, relay, log }).plugin, { prefix: '/api' })` */
export function createErrorReportsModule(options: ErrorReportsModuleOptions): {
  plugin: (app: FastifyInstance) => Promise<void>;
} {
  const { config } = options;
  const settings = config
    ? { dsn: config.dsn, environment: config.environment, release: config.release }
    : { dsn: null, environment: options.nodeEnv, release: null };
  const relay = config
    ? new ClientErrorRelayService({
        relay: options.relay,
        envelope: new ClientErrorEnvelopeBo(config.dsn),
        log: options.log,
      })
    : null;
  return { plugin: errorReportsRoutes({ settings, relay, sessionCookie: options.sessionCookie }) };
}
