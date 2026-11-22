import { ErrorReportError } from './error-reports.error';

type Loose = Readonly<Record<string, unknown>>;

/** A browser event: the fields the tunnel rewrites, and the rest as it came. */
export type ClientErrorEvent = Loose & {
  user?: unknown;
  request?: (Loose & { url?: string | undefined }) | undefined;
  breadcrumbs?:
    | (Loose & { values?: (Loose & { data?: Record<string, unknown> | undefined })[] | undefined })
    | undefined;
};

/** One item of an envelope: its header line, its payload as text and, for an `event`, read. */
export type ClientErrorEnvelopeItem = Readonly<{
  header: Loose & { type: string; length?: number | undefined };
  payload: string;
  event: ClientErrorEvent | null;
}>;

/** A Sentry envelope as the browser SDK sends it: a header line, then header + payload per item. */
export type ClientErrorEnvelope = Readonly<{
  header: Loose & { dsn?: string | undefined };
  items: readonly ClientErrorEnvelopeItem[];
}>;

/** The signed-in account the tunnel stamps on the event, from the session cookie. */
export type ClientErrorSender = Readonly<{ id: string; username: string }>;

const BREADCRUMB_URL_KEYS = ['url', 'from', 'to'] as const;
// The body may name anyone; the account comes from the session only.
const FORGEABLE_EVENT_KEYS: ReadonlySet<string> = new Set(['user']);
const REQUEST_DATA_KEYS: ReadonlySet<string> = new Set([
  'headers',
  'cookies',
  'query_string',
  'data',
]);

/** What the tunnel forwards of a browser envelope: only ours (the DSN), only the events (no
 *  sessions, replays nor attachments), the account from the session and never from the body,
 *  URLs without query or fragment (a reset token rides in one) and, of the headers, only the
 *  User-Agent.
 *
 *  Example: `new ClientErrorEnvelopeBo(env.errorReporting.dsn).forwardable(envelope, sender)` */
export class ClientErrorEnvelopeBo {
  constructor(private readonly ownDsn: string) {}

  /** null = nothing in it is worth forwarding. */
  forwardable(
    envelope: ClientErrorEnvelope,
    sender: ClientErrorSender | null,
  ): ClientErrorEnvelope | null {
    const { dsn } = envelope.header;
    if (dsn !== this.ownDsn) {
      const received = dsn === undefined ? 'nothing' : JSON.stringify(dsn);
      throw new ErrorReportError(
        'UNKNOWN_DSN',
        `the envelope DSN is not ours (received ${received})`,
      );
    }
    const events = envelope.items.filter((item) => item.header.type === 'event');
    if (events.length === 0) return null;
    return { header: envelope.header, items: events.map((item) => stamped(item, sender)) };
  }
}

function stamped(
  item: ClientErrorEnvelopeItem,
  sender: ClientErrorSender | null,
): ClientErrorEnvelopeItem {
  const event = item.event ?? {};
  const rest = withoutKeys(event, FORGEABLE_EVENT_KEYS);
  const clean: Record<string, unknown> & ClientErrorEvent = {
    ...rest,
    ...withoutRequestData(event),
    ...withBareBreadcrumbs(event),
  };
  if (sender) clean.user = { id: sender.id, username: sender.username };
  return { header: item.header, payload: JSON.stringify(clean), event: clean };
}

function withoutRequestData(event: ClientErrorEvent): Partial<ClientErrorEvent> {
  if (!event.request) return {};
  const request = withoutKeys(event.request, REQUEST_DATA_KEYS);
  const { url } = event.request;
  const headers = userAgentOf(event.request.headers);
  const bare = url === undefined ? request : { ...request, url: withoutQuery(url) };
  return { request: headers ? { ...bare, headers } : bare };
}

// The browser and the system of the report come from it; every other header stays behind.
function userAgentOf(headers: unknown): Readonly<{ 'User-Agent': string }> | null {
  if (typeof headers !== 'object' || headers === null || !('User-Agent' in headers)) return null;
  const userAgent = headers['User-Agent'];
  return typeof userAgent === 'string' ? { 'User-Agent': userAgent } : null;
}

function withoutKeys(object: Loose, keys: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.has(key)));
}

function withBareBreadcrumbs(event: ClientErrorEvent): Partial<ClientErrorEvent> {
  const values = event.breadcrumbs?.values;
  if (!event.breadcrumbs || !values) return {};
  return { breadcrumbs: { ...event.breadcrumbs, values: values.map(bareBreadcrumb) } };
}

function bareBreadcrumb<Crumb extends { data?: Record<string, unknown> | undefined }>(
  crumb: Crumb,
): Crumb {
  if (!crumb.data) return crumb;
  const data = { ...crumb.data };
  for (const key of BREADCRUMB_URL_KEYS) {
    const value = data[key];
    if (typeof value === 'string') data[key] = withoutQuery(value);
  }
  return { ...crumb, data };
}

/** Example: `withoutQuery('/reset-password?token=abc#x') // '/reset-password'` */
export function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}
