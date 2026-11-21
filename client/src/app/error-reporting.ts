import { createClientErrorGate } from '@/lib/client-error-gate';
import { createBufferedClientErrorSink, type ClientErrorSink } from '@/lib/client-error-sink';
import type { ErrorReportsApi, ErrorReportingSettings } from '@/services/error-reports-api';

// A render loop must not spend the monthly quota: past this, the page reports nothing more.
const REPORTS_PER_PAGE = 10;

type SentrySinkFactory = (
  options: Readonly<{
    settings: ErrorReportingSettings;
    gate: ReturnType<typeof createClientErrorGate>;
    userAgent: string;
  }>,
) => ClientErrorSink;

export type ErrorReportingDeps = Readonly<{
  api: ErrorReportsApi;
  userAgent: string;
  scope: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** The SDK, behind `import()`: it never weighs on the first load. */
  loadSentry: () => Promise<SentrySinkFactory>;
}>;

const DISCARDED: ClientErrorSink = { capture: () => undefined };

/** The sink of the app from its first line: it buffers until the settings arrive, then hands over
 *  to Sentry (with a DSN) or drops everything (without one, or if the SDK chunk fails to load).
 *
 *  Example: `const errors = startErrorReporting({ api, userAgent, scope: window, loadSentry })` */
export function startErrorReporting(deps: ErrorReportingDeps): ClientErrorSink {
  const gate = createClientErrorGate({ maxPerPage: REPORTS_PER_PAGE });
  const buffered = createBufferedClientErrorSink({
    gate,
    maxBuffered: REPORTS_PER_PAGE,
    scope: deps.scope,
  });
  const connect = async (): Promise<ClientErrorSink> => {
    const settings = await deps.api.settings();
    if (!settings) return DISCARDED;
    const createSink = await deps.loadSentry();
    return createSink({ settings, gate, userAgent: deps.userAgent });
  };
  void connect()
    .catch(() => DISCARDED)
    .then((real) => buffered.attach(real));
  return buffered.sink;
}
