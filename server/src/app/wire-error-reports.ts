import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/env';
import { SESSION_COOKIE } from '../modules/auth/auth.routes';
import { DiscardedClientErrorRelay } from '../infrastructure/error-reporting/discarded-client-error-relay';
import { SentryIngestRelay } from '../infrastructure/error-reporting/sentry-ingest-relay';
import type { ClockPort } from '../modules/auth/clock.port';
import type { ClientErrorRelay } from '../modules/error-reports/client-error-relay.port';
import { createErrorReportsModule } from '../modules/error-reports/error-reports.plugin';
import { ErrorReportThrottleBo } from '../modules/error-reports/error-report-throttle.bo';
import type { ErrorReportSink } from '../modules/error-reports/error-report-sink.port';
import { UnexpectedErrorsService } from '../modules/error-reports/unexpected-errors.service';
import { DiscardedErrorReportSink } from '../infrastructure/error-reporting/discarded-error-report-sink';

// One report per failure per minute: a loop does not spend the free monthly quota.
const REPORT_WINDOW_MS = 60_000;

/** The listener the logger hands every `error` line to; without a sink, the reports go nowhere.
 *
 *  Example: `Fastify({ logger: loggerOptions(env, unexpectedErrorsOf(deps.errorReportSink, clock)) })` */
export function unexpectedErrorsOf(
  sink: ErrorReportSink | undefined,
  clock: ClockPort,
): UnexpectedErrorsService {
  const throttle = new ErrorReportThrottleBo({ windowMs: REPORT_WINDOW_MS });
  return new UnexpectedErrorsService({
    sink: sink ?? new DiscardedErrorReportSink(),
    clock,
    throttle,
  });
}

/** Registers the settings, the browser tunnel and the admin's test under `prefix`; the tunnel
 *  forwards to the ingest of `env.errorReporting` unless a spec passes its own relay.
 *
 *  Example: `await wireErrorReports(app, { env, relay: deps.clientErrorRelay }, '/api')` */
export async function wireErrorReports(
  app: FastifyInstance,
  wiring: Readonly<{ env: Env; relay?: ClientErrorRelay }>,
  prefix: string,
): Promise<void> {
  const config = wiring.env.errorReporting;
  const relay = wiring.relay ?? relayOf(config?.dsn ?? null);
  const module = createErrorReportsModule({
    config,
    nodeEnv: wiring.env.nodeEnv,
    relay,
    log: app.log,
    sessionCookie: SESSION_COOKIE,
  });
  await app.register(module.plugin, { prefix });
}

function relayOf(dsn: string | null): ClientErrorRelay {
  if (dsn === null) return new DiscardedClientErrorRelay();
  return new SentryIngestRelay({ dsn, fetch: (url, init) => fetch(url, init) });
}
