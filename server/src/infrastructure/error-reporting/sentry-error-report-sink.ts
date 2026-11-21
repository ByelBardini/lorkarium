import {
  init,
  linkedErrorsIntegration,
  onUncaughtExceptionIntegration,
  onUnhandledRejectionIntegration,
  Scope,
  type ErrorEvent,
  type NodeClient,
  type NodeOptions,
} from '@sentry/node';
import type { ErrorReportingConfig } from '../../config/error-reporting-env';
import type {
  ErrorReport,
  ErrorReportSink,
} from '../../modules/error-reports/error-report-sink.port';

// The SDK infers none of these: the user comes from the session, the rest never leaves.
const COLLECT_NOTHING_PERSONAL: NonNullable<NodeOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};

export type SentrySinkOptions = Readonly<{
  config: ErrorReportingConfig;
  /** Specs pass a transport fake; production keeps the SDK's own HTTPS transport. */
  transport?: NodeOptions['transport'];
  /** The process-wide handlers (uncaught exception, unhandled rejection): only the real server. */
  catchProcessFailures?: boolean;
}>;

/** The only import of `@sentry/node`: errors only, no tracing, no default integrations; a crash
 *  is reported and the process still dies (`strict` keeps Node's own behavior).
 *
 *  Example: `new SentryErrorReportSink({ config: env.errorReporting, catchProcessFailures: true })` */
export class SentryErrorReportSink implements ErrorReportSink {
  private readonly client: NodeClient;

  constructor(options: SentrySinkOptions) {
    const client = init(sentryOptionsOf(options));
    if (!client) throw new Error(`Sentry did not start for the DSN ${options.config.dsn}`);
    this.client = client;
  }

  capture(report: ErrorReport): void {
    const scope = scopeOf(report);
    if (report.error) {
      // The linked-errors integration walks `cause` from the original exception of the hint.
      this.client.captureException(report.error, { originalException: report.error }, scope);
      return;
    }
    this.client.captureMessage(report.message, 'error', undefined, scope);
  }

  flush(timeoutMs: number): Promise<boolean> {
    return Promise.resolve(this.client.flush(timeoutMs));
  }
}

function sentryOptionsOf(options: SentrySinkOptions): NodeOptions {
  const { dsn, environment, release } = options.config;
  const processHandlers = options.catchProcessFailures
    ? [onUncaughtExceptionIntegration(), onUnhandledRejectionIntegration({ mode: 'strict' })]
    : [];
  return {
    dsn,
    environment,
    ...(release === null ? {} : { release }),
    dataCollection: COLLECT_NOTHING_PERSONAL,
    defaultIntegrations: false,
    enableRuntimeChannelInjection: false,
    integrations: [linkedErrorsIntegration(), ...processHandlers],
    initialScope: { tags: { runtime: 'server' } },
    beforeSend: withoutPersonalData,
    ...(options.transport ? { transport: options.transport } : {}),
  };
}

function scopeOf(report: ErrorReport): Scope {
  const scope = new Scope();
  scope.setTag('runtime', 'server');
  if (report.context.route) scope.setTag('route', report.context.route);
  if (report.context.method) scope.setTag('method', report.context.method);
  if (report.user)
    scope.setUser({ id: report.user.id, username: report.user.username ?? undefined });
  scope.setExtras({ ...report.fields, log_message: report.message });
  if (report.context.reqId) scope.setExtra('reqId', report.context.reqId);
  if (report.suppressed > 0) scope.setExtra('suppressed', report.suppressed);
  return scope;
}

/** The last word before an event leaves: no IP, no request, no host name, no query params (the
 *  mapper already took them out of the error; this also covers the crash handlers).
 *
 *  Example: `beforeSend: withoutPersonalData` */
export function withoutPersonalData(event: ErrorEvent): ErrorEvent {
  delete event.request;
  delete event.server_name;
  if (event.user) delete event.user.ip_address;
  if (event.extra) delete event.extra.params;
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = exception.value.replace(/\nparams: [\s\S]*$/, '');
  }
  return event;
}
