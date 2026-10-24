import {
  profileResponseDto,
  type ProfileDto,
  type UpdateProfileRequestDto,
} from '@lorkarium/contracts';
import { callApi, callUpload, parseOk, type ApiCall } from './api-call';
import {
  commandFailureOf,
  loadFailureOf,
  type AccountCommonFailure,
  type AccountLoadFailure,
  type AccountResult,
} from './account-failure';
import type { HttpTransport } from './http-transport';

/** What a profile command can fail with; the photo has its own two refusals. */
export type ProfileFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'avatar_too_large' }>
  | Readonly<{ kind: 'unsupported_image' }>;

/** What the "Minha conta" screen needs from `/api/account/profile` and `/api/account/avatar`;
 *  failures come back as values, never thrown. */
export interface ProfileApi {
  get(): Promise<AccountResult<ProfileDto, AccountLoadFailure>>;
  update(input: UpdateProfileRequestDto): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  uploadAvatar(file: Blob): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  removeAvatar(): Promise<AccountResult<ProfileDto, ProfileFailure>>;
}

const AVATAR_TOO_LARGE = { kind: 'avatar_too_large' } as const;
const UNSUPPORTED_IMAGE = { kind: 'unsupported_image' } as const;

const PROFILE_FAILURE_BY_CODE = {
  AVATAR_TOO_LARGE,
  UNSUPPORTED_IMAGE,
} as const;

// A body cut by the server's own limit may not carry the code: the status still says it.
const AVATAR_FAILURE_BY_STATUS: Readonly<Record<number, ProfileFailure>> = {
  413: AVATAR_TOO_LARGE,
  415: UNSUPPORTED_IMAGE,
  422: UNSUPPORTED_IMAGE,
};

/** `ProfileApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpProfileApi(transport).update({ name: 'Ana' }); if (result.ok) …` */
export class HttpProfileApi implements ProfileApi {
  constructor(private readonly transport: HttpTransport) {}

  async get(): Promise<AccountResult<ProfileDto, AccountLoadFailure>> {
    const call = await callApi(this.transport, 'GET', '/account/profile');
    if (call.kind !== 'ok') return { ok: false, failure: loadFailureOf(call) };
    return profileOf(call.body);
  }

  async update(input: UpdateProfileRequestDto): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    return profileOutcome(await callApi(this.transport, 'PATCH', '/account/profile', input));
  }

  async uploadAvatar(file: Blob): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    return profileOutcome(await callUpload(this.transport, '/account/avatar', file, 'PUT'));
  }

  async removeAvatar(): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    return profileOutcome(await callApi(this.transport, 'DELETE', '/account/avatar'));
  }
}

function profileOutcome(call: ApiCall): AccountResult<ProfileDto, ProfileFailure> {
  if (call.kind === 'ok') return profileOf(call.body);
  return { ok: false, failure: profileFailureOf(call) };
}

function profileFailureOf(call: Exclude<ApiCall, { kind: 'ok' }>): ProfileFailure {
  const byStatus = call.kind === 'refused' ? AVATAR_FAILURE_BY_STATUS[call.response.status] : null;
  const failure = commandFailureOf<ProfileFailure>(call, PROFILE_FAILURE_BY_CODE);
  return failure.kind === 'unexpected' && byStatus ? byStatus : failure;
}

function profileOf(body: unknown): AccountResult<ProfileDto, Readonly<{ kind: 'unexpected' }>> {
  return parseOk(profileResponseDto, body, (parsed) => parsed.profile);
}
