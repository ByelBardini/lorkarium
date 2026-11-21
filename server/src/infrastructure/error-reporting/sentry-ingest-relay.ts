import type { ClientErrorRelay } from '../../modules/error-reports/client-error-relay.port';

// The browser already gave up its own copy; a slow ingest must not hold a request open.
export const INGEST_TIMEOUT_MS = 5000;

/** The one call this adapter makes: `fetch`'s shape, passed in so a spec answers for Sentry. */
export type IngestFetch = (url: string, init: RequestInit) => Promise<Response>;

export type SentryIngestRelayDeps = Readonly<{
  dsn: string;
  fetch: IngestFetch;
  /** Defaults to `INGEST_TIMEOUT_MS`; a spec waits less. */
  timeoutMs?: number;
}>;

/** Posts an envelope to the ingest of the DSN's host, as the SDK would; no `X-Forwarded-For`, so
 *  Sentry sees the server, never the player's IP.
 *
 *  Example: `await new SentryIngestRelay({ dsn, fetch }).forward(envelope)` */
export class SentryIngestRelay implements ClientErrorRelay {
  private readonly url: string;

  constructor(private readonly deps: SentryIngestRelayDeps) {
    this.url = ingestUrlOf(deps.dsn);
  }

  async forward(envelope: string): Promise<void> {
    const response = await this.post(envelope);
    if (!response.ok) throw new Error(`Sentry ingest answered ${response.status} at ${this.url}`);
  }

  private get timeoutMs(): number {
    return this.deps.timeoutMs ?? INGEST_TIMEOUT_MS;
  }

  private async post(envelope: string): Promise<Response> {
    try {
      return await this.deps.fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-sentry-envelope' },
        body: envelope,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(`Sentry ingest did not answer within ${this.timeoutMs} ms`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}

/** Example: `ingestUrlOf('https://k@o1.ingest.de.sentry.io/123') // 'https://o1.ingest.de.sentry.io/api/123/envelope/'` */
export function ingestUrlOf(dsn: string): string {
  const url = new URL(dsn);
  const segments = url.pathname.split('/').filter(Boolean);
  const project = segments.pop() ?? '';
  const prefix = segments.length === 0 ? '' : `/${segments.join('/')}`;
  return `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`;
}
