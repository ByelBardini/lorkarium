import {
  profileCardResponseDto,
  profileLookupParamsDto,
  type ProfileCardDto,
  type ReputationVoteValue,
  type UserReportRequestDto,
} from '@lorkarium/contracts';
import {
  commandFailureOf,
  loadFailureOf,
  type AccountCommonFailure,
  type AccountLoadFailure,
  type AccountResult,
} from './account-failure';
import { callApi, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';

/** A card read: suspended or missing accounts answer 404. */
export type ProfileCardLoadFailure = AccountLoadFailure | Readonly<{ kind: 'user_not_found' }>;

/** A card looked up by the @: a text outside the @ format is `user_not_found` too, and the route
 *  has its own per-account limit (429). */
export type ProfileLookupFailure =
  ProfileCardLoadFailure | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>;

/** A vote of someone with no table in common (403 `REPUTATION_NOT_ALLOWED`). */
export type ReputationFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'reputation_not_allowed' }>
  | Readonly<{ kind: 'user_not_found' }>;

/** A second open report on the same person is 409 `REPORT_ALREADY_OPEN`. */
export type UserReportFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'report_already_open' }>
  | Readonly<{ kind: 'user_not_found' }>;

/** Another account's card, the reader's vote on it and a report; failures come back as values.
 *
 *  Example: `const result = await profileCardApi.card(userId); if (result.ok) result.value.name` */
export interface ProfileCardApi {
  card(userId: string): Promise<AccountResult<ProfileCardDto, ProfileCardLoadFailure>>;
  /** The card of the exact @ as typed (with or without "@", any case). */
  cardByUsername(typed: string): Promise<AccountResult<ProfileCardDto, ProfileLookupFailure>>;
  vote(userId: string, value: ReputationVoteValue): Promise<AccountResult<null, ReputationFailure>>;
  removeVote(userId: string): Promise<AccountResult<null, ReputationFailure>>;
  report(
    userId: string,
    report: UserReportRequestDto,
  ): Promise<AccountResult<null, UserReportFailure>>;
}

const USER_NOT_FOUND = { kind: 'user_not_found' } as const;

const REPUTATION_FAILURE_BY_CODE = {
  REPUTATION_NOT_ALLOWED: { kind: 'reputation_not_allowed' },
  REPUTATION_TARGET_NOT_FOUND: USER_NOT_FOUND,
} as const;

const REPORT_FAILURE_BY_CODE = {
  REPORT_ALREADY_OPEN: { kind: 'report_already_open' },
  REPORT_TARGET_NOT_FOUND: USER_NOT_FOUND,
} as const;

function pathOf(userId: string, rest: string): string {
  return `/users/${encodeURIComponent(userId)}/${rest}`;
}

/** `ProfileCardApi` over HTTP; the card is validated by `profileCardResponseDto`.
 *
 *  Example: `await new HttpProfileCardApi(transport).vote(userId, 1)` */
export class HttpProfileCardApi implements ProfileCardApi {
  constructor(private readonly transport: HttpTransport) {}

  async card(userId: string): Promise<AccountResult<ProfileCardDto, ProfileCardLoadFailure>> {
    const call = await callApi(this.transport, 'GET', pathOf(userId, 'card'));
    if (call.kind === 'ok') return parseOk(profileCardResponseDto, call.body, (body) => body.card);
    if (call.kind === 'refused' && call.response.status === 404)
      return { ok: false, failure: USER_NOT_FOUND };
    return { ok: false, failure: loadFailureOf(call) };
  }

  async cardByUsername(
    typed: string,
  ): Promise<AccountResult<ProfileCardDto, ProfileLookupFailure>> {
    const params = profileLookupParamsDto.safeParse({ username: typed });
    if (!params.success) return { ok: false, failure: USER_NOT_FOUND };
    const path = `/users/by-username/${encodeURIComponent(params.data.username)}/card`;
    const call = await callApi(this.transport, 'GET', path);
    if (call.kind === 'ok') return parseOk(profileCardResponseDto, call.body, (body) => body.card);
    return { ok: false, failure: lookupFailureOf(call) };
  }

  async vote(
    userId: string,
    value: ReputationVoteValue,
  ): Promise<AccountResult<null, ReputationFailure>> {
    const call = await callApi(this.transport, 'PUT', pathOf(userId, 'reputation'), { value });
    return emptied(call, REPUTATION_FAILURE_BY_CODE);
  }

  async removeVote(userId: string): Promise<AccountResult<null, ReputationFailure>> {
    const call = await callApi(this.transport, 'DELETE', pathOf(userId, 'reputation'));
    return emptied(call, REPUTATION_FAILURE_BY_CODE);
  }

  async report(
    userId: string,
    report: UserReportRequestDto,
  ): Promise<AccountResult<null, UserReportFailure>> {
    const call = await callApi(this.transport, 'POST', pathOf(userId, 'reports'), report);
    return emptied(call, REPORT_FAILURE_BY_CODE);
  }
}

// A 400 is the server's format check agreeing with the client's: the @ does not exist.
function lookupFailureOf(call: Exclude<ApiCall, { kind: 'ok' }>): ProfileLookupFailure {
  if (call.kind === 'offline') return loadFailureOf(call);
  const { status } = call.response;
  if (status === 404 || status === 400) return USER_NOT_FOUND;
  if (status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(call.response) };
  return loadFailureOf(call);
}

function emptied<F>(
  call: ApiCall,
  byCode: Readonly<Record<string, F>>,
): AccountResult<null, F | AccountCommonFailure> {
  if (call.kind === 'ok') return { ok: true, value: null };
  return { ok: false, failure: commandFailureOf(call, byCode) };
}
