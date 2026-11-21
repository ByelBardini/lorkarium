import {
  breadcrumbsIntegration,
  browserApiErrorsIntegration,
  dedupeIntegration,
  globalHandlersIntegration,
  httpContextIntegration,
  init,
  linkedErrorsIntegration,
  Scope,
  type BrowserOptions,
  type ErrorEvent,
  type EventHint,
} from '@sentry/browser';
import type { ClientErrorGate } from '@/lib/client-error-gate';
import type { ClientErrorContext, ClientErrorSink } from '@/lib/client-error-sink';
import { desktopShellOf } from '@/lib/desktop-shell';
import type { ErrorReportingSettings } from '@/services/error-reports-api';

/** The server's tunnel: the browser never talks to Sentry, and the server stamps the account. */
export const ERROR_REPORT_TUNNEL = '/api/error-reports';

// Marks what `capture` sends: the gate already admitted it, so `beforeSend` does not count it twice.
const ADMITTED = 'lorkariumAdmitted';

// Nothing personal is inferred by the SDK: the account comes from the session, on the server.
const COLLECT_NOTHING_PERSONAL: NonNullable<BrowserOptions['dataCollection']> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

export type SentryClientSinkOptions = Readonly<{
  settings: ErrorReportingSettings;
  gate: ClientErrorGate;
  userAgent: string;
  /** Specs pass a transport fake; the page keeps the SDK's fetch transport. */
  transport?: BrowserOptions['transport'];
}>;

/** The only import of `@sentry/browser` (loaded by `import()` once the settings have a DSN):
 *  errors only, through the tunnel, no console nor click breadcrumbs, the same gate for what the
 *  SDK's own handlers catch.
 *
 *  Example: `attach(createSentryClientErrorSink({ settings, gate, userAgent: navigator.userAgent }))` */
export function createSentryClientErrorSink(options: SentryClientSinkOptions): ClientErrorSink {
  const client = init(browserOptionsOf(options));
  if (!client) throw new Error(`Sentry did not start for the DSN ${options.settings.dsn}`);
  // A scope passed to the client replaces the current one, so it carries the runtime too.
  const runtimeTags = runtimeTagsOf(options.userAgent);
  return {
    capture: (error: unknown, context: ClientErrorContext): void => {
      const hint: EventHint = { originalException: error, data: { [ADMITTED]: true } };
      client.captureException(error, hint, scopeOf(context, runtimeTags));
    },
  };
}

function browserOptionsOf(options: SentryClientSinkOptions): BrowserOptions {
  const { dsn, environment, release } = options.settings;
  return {
    dsn,
    tunnel: ERROR_REPORT_TUNNEL,
    environment,
    ...(release === null ? {} : { release }),
    dataCollection: COLLECT_NOTHING_PERSONAL,
    defaultIntegrations: false,
    integrations: [
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      browserApiErrorsIntegration(),
      httpContextIntegration(),
      // Fetch, XHR and navigation only: no clicks (DOM); console lines are not breadcrumbs in v11.
      breadcrumbsIntegration({ dom: false }),
    ],
    initialScope: { tags: runtimeTagsOf(options.userAgent) },
    beforeSend: (event, hint) => admittedOrNull(options.gate, event, hint),
    ...(options.transport ? { transport: options.transport } : {}),
  };
}

function admittedOrNull(
  gate: ClientErrorGate,
  event: ErrorEvent,
  hint: EventHint,
): ErrorEvent | null {
  if (isRecord(hint.data) && hint.data[ADMITTED] === true) return event;
  return gate.admits(hint.originalException ?? event.message) ? event : null;
}

function runtimeTagsOf(userAgent: string): Record<string, string> {
  const shell = desktopShellOf(userAgent);
  return shell ? { runtime: 'desktop', desktop_version: shell.version } : { runtime: 'browser' };
}

function scopeOf(context: ClientErrorContext, runtimeTags: Record<string, string>): Scope {
  const scope = new Scope();
  scope.setTags(runtimeTags);
  scope.setTag('source', context.source);
  if (context.routePattern) scope.setExtra('routePattern', context.routePattern);
  return scope;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
