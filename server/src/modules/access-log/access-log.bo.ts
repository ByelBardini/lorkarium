/** One answered HTTP request in the access log (Marco Civil, art. 15): when, from which IP and,
 *  when logged in, which account. Nothing else goes in (LGPD, art. 6, III): never the e-mail, a
 *  cookie, a token or a body. */
export type HttpAccessRecord = Readonly<{
  kind: 'http';
  at: string;
  ip: string;
  userId: string | null;
  method: string;
  route: string;
  status: number;
}>;

export type RealtimeAccessKind = 'realtime-connect' | 'realtime-disconnect';

/** A live table connection opening or closing: the span the person used the app, from that IP. */
export type RealtimeAccessRecord = Readonly<{
  kind: RealtimeAccessKind;
  at: string;
  ip: string;
  userId: string;
}>;

export type AccessRecord = HttpAccessRecord | RealtimeAccessRecord;

/** What the HTTP edge knows once a request is answered. */
export type HttpAccessFacts = Readonly<{
  at: Date;
  ip: string;
  userId: string | null;
  method: string;
  /** The route as declared (`/api/campaigns/:campaignId`); `undefined` when no route matched. */
  routePattern: string | undefined;
  url: string;
  status: number;
}>;

export type RealtimeAccessFacts = Readonly<{ at: Date; ip: string; userId: string }>;

export const ACCESS_LOG_PREFIX = 'access-log';

// The container's HEALTHCHECK polls it from 127.0.0.1 every few seconds: not a person using the app.
const HEALTH_ROUTE = '/api/health';

// A path no route matched is whatever the client typed; the cap keeps junk from bloating a line.
export const ROUTE_MAX_LENGTH = 512;

/** The line of an answered request, or `null` for the health check. The route is the declared
 *  pattern, so ids and the query string stay out; with no match, the path without the query.
 *
 *  Example: `httpAccessRecordOf({ ...facts, routePattern: '/api/campaigns/:campaignId' })?.route // '/api/campaigns/:campaignId'` */
export function httpAccessRecordOf(facts: HttpAccessFacts): HttpAccessRecord | null {
  if (facts.routePattern === HEALTH_ROUTE) return null;
  const { ip, userId, method, status } = facts;
  const route = routeOf(facts);
  return { kind: 'http', at: facts.at.toISOString(), ip, userId, method, route, status };
}

/** The line of a live connection that opened or closed.
 *
 *  Example: `realtimeAccessRecordOf('realtime-connect', { at, ip: '203.0.113.7', userId }).kind // 'realtime-connect'` */
export function realtimeAccessRecordOf(
  kind: RealtimeAccessKind,
  facts: RealtimeAccessFacts,
): RealtimeAccessRecord {
  return { kind, at: facts.at.toISOString(), ip: facts.ip, userId: facts.userId };
}

/** The key of a batch: one folder per UTC day of its first line, then that line's time, the boot
 *  and the sequence, so the two instances of a rolling update never write the same key.
 *
 *  Example: `batchKeyOf('2026-10-25T03:04:05.678Z', 'a1b2c3d4', 7) // 'access-log/2026/10/25/030405Z-a1b2c3d4-7.jsonl.gz'` */
export function batchKeyOf(firstAt: string, bootId: string, sequence: number): string {
  return `${ACCESS_LOG_PREFIX}/${dayFolderOf(firstAt)}/${clockTimeOf(firstAt)}-${bootId}-${sequence}.jsonl.gz`;
}

/** The key of the empty batch each boot writes: it proves the archive takes writes before the app
 *  serves anyone, and it dates every start of the server.
 *
 *  Example: `bootKeyOf(new Date('2026-10-25T03:04:05Z'), 'a1b2c3d4') // 'access-log/boots/2026/10/25/030405Z-a1b2c3d4.jsonl.gz'` */
export function bootKeyOf(at: Date, bootId: string): string {
  const iso = at.toISOString();
  return `${ACCESS_LOG_PREFIX}/boots/${dayFolderOf(iso)}/${clockTimeOf(iso)}-${bootId}.jsonl.gz`;
}

function routeOf(facts: HttpAccessFacts): string {
  const route = facts.routePattern ?? pathOf(facts.url);
  return route.slice(0, ROUTE_MAX_LENGTH);
}

function pathOf(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

// '2026-10-25T03:04:05.678Z' → '2026/10/25'
function dayFolderOf(iso: string): string {
  return iso.slice(0, 10).replaceAll('-', '/');
}

// '2026-10-25T03:04:05.678Z' → '030405Z'
function clockTimeOf(iso: string): string {
  return `${iso.slice(11, 19).replaceAll(':', '')}Z`;
}
