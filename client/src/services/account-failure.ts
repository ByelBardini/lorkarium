import { errorCodeOf, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse } from './http-transport';

/** The outcome of an account call: the value, or the failure the screen turns into a message. */
export type AccountResult<T, F> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: F }>;

/** What a read of the account can fail with (the `loader`): the session fell, offline or broken. */
export type AccountLoadFailure =
  | Readonly<{ kind: 'unauthenticated' }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

/** What any account command can fail with, besides its own codes. */
export type AccountCommonFailure =
  | AccountLoadFailure
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>;

/** The failure each `ApiErrorDto.code` of a route means; a code outside it falls to the status. */
export type FailureByCode<F> = Readonly<Record<string, F>>;

type RefusedOrOffline = Exclude<ApiCall, { kind: 'ok' }>;

const OFFLINE = { kind: 'offline' } as const;
const UNEXPECTED = { kind: 'unexpected' } as const;
const UNAUTHENTICATED = { kind: 'unauthenticated' } as const;

/** The failure of a read: only a fallen session is told apart from offline and broken.
 *
 *  Example: `if (call.kind !== 'ok') return { ok: false, failure: loadFailureOf(call) }` */
export function loadFailureOf(call: RefusedOrOffline): AccountLoadFailure {
  if (call.kind === 'offline') return OFFLINE;
  return call.response.status === 401 ? UNAUTHENTICATED : UNEXPECTED;
}

/** The failure of a command: the route's own code first (a 400 or 403 with a meaning), then the
 *  status (400 invalid, 401 session, 429 limit), then `unexpected`.
 *
 *  Example: `commandFailureOf(call, { EMAIL_TAKEN: { kind: 'email_taken' } })` */
export function commandFailureOf<F>(
  call: RefusedOrOffline,
  byCode: FailureByCode<F>,
): F | AccountCommonFailure {
  if (call.kind === 'offline') return OFFLINE;
  const code = errorCodeOf(call.response);
  const named = code === null ? undefined : byCode[code];
  return named ?? statusFailureOf(call.response);
}

function statusFailureOf(response: HttpResponse): AccountCommonFailure {
  if (response.status === 400) return { kind: 'invalid' };
  if (response.status === 401) return UNAUTHENTICATED;
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  return UNEXPECTED;
}
