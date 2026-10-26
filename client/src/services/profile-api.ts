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

/** What a profile command can fail with; the photo and the dice texture have their own refusals
 *  (file and link). */
export type ProfileFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'avatar_too_large' }>
  | Readonly<{ kind: 'dice_texture_too_large' }>
  | Readonly<{ kind: 'unsupported_image' }>
  | Readonly<{ kind: 'link_blocked' }>
  | Readonly<{ kind: 'link_unreachable' }>
  | Readonly<{ kind: 'link_not_image' }>;

/** What the "Minha conta" screen needs from `/api/account/profile` and `/api/account/avatar`;
 *  failures come back as values, never thrown. */
export interface ProfileApi {
  get(): Promise<AccountResult<ProfileDto, AccountLoadFailure>>;
  update(input: UpdateProfileRequestDto): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  uploadAvatar(file: Blob): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  /** The photo from a web link (an animated GIF stays animated); the server downloads it. */
  avatarFromLink(url: string): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  removeAvatar(): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  /** The dice texture from a file; the server keeps a still 512 × 512 WebP of it. */
  uploadDiceTexture(file: Blob): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  diceTextureFromLink(url: string): Promise<AccountResult<ProfileDto, ProfileFailure>>;
  /** Back to the dice in the profile color. */
  removeDiceTexture(): Promise<AccountResult<ProfileDto, ProfileFailure>>;
}

const AVATAR_TOO_LARGE = { kind: 'avatar_too_large' } as const;
const DICE_TEXTURE_TOO_LARGE = { kind: 'dice_texture_too_large' } as const;
const UNSUPPORTED_IMAGE = { kind: 'unsupported_image' } as const;

const PROFILE_FAILURE_BY_CODE = {
  AVATAR_TOO_LARGE,
  DICE_TEXTURE_TOO_LARGE,
  UNSUPPORTED_IMAGE,
  LINK_BLOCKED: { kind: 'link_blocked' },
  LINK_UNREACHABLE: { kind: 'link_unreachable' },
  LINK_NOT_IMAGE: { kind: 'link_not_image' },
} as const;

// A body cut by the server's own limit may not carry the code: the status still says it.
type FailureByStatus = Readonly<Record<number, ProfileFailure>>;

const AVATAR_FAILURE_BY_STATUS: FailureByStatus = {
  413: AVATAR_TOO_LARGE,
  415: UNSUPPORTED_IMAGE,
  422: UNSUPPORTED_IMAGE,
};

const DICE_TEXTURE_FAILURE_BY_STATUS: FailureByStatus = {
  ...AVATAR_FAILURE_BY_STATUS,
  413: DICE_TEXTURE_TOO_LARGE,
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
    const call = await callUpload(this.transport, '/account/avatar', file, 'PUT');
    return profileOutcome(call, AVATAR_FAILURE_BY_STATUS);
  }

  async avatarFromLink(url: string): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    const call = await callApi(this.transport, 'POST', '/account/avatar/link', { url });
    return profileOutcome(call, AVATAR_FAILURE_BY_STATUS);
  }

  async removeAvatar(): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    return profileOutcome(await callApi(this.transport, 'DELETE', '/account/avatar'));
  }

  async uploadDiceTexture(file: Blob): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    const call = await callUpload(this.transport, '/account/dice-texture', file, 'PUT');
    return profileOutcome(call, DICE_TEXTURE_FAILURE_BY_STATUS);
  }

  async diceTextureFromLink(url: string): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    const call = await callApi(this.transport, 'POST', '/account/dice-texture/link', { url });
    return profileOutcome(call, DICE_TEXTURE_FAILURE_BY_STATUS);
  }

  async removeDiceTexture(): Promise<AccountResult<ProfileDto, ProfileFailure>> {
    return profileOutcome(await callApi(this.transport, 'DELETE', '/account/dice-texture'));
  }
}

function profileOutcome(
  call: ApiCall,
  failureByStatus: FailureByStatus = {},
): AccountResult<ProfileDto, ProfileFailure> {
  if (call.kind === 'ok') return profileOf(call.body);
  return { ok: false, failure: profileFailureOf(call, failureByStatus) };
}

function profileFailureOf(
  call: Exclude<ApiCall, { kind: 'ok' }>,
  failureByStatus: FailureByStatus,
): ProfileFailure {
  const byStatus = call.kind === 'refused' ? failureByStatus[call.response.status] : null;
  const failure = commandFailureOf<ProfileFailure>(call, PROFILE_FAILURE_BY_CODE);
  return failure.kind === 'unexpected' && byStatus ? byStatus : failure;
}

function profileOf(body: unknown): AccountResult<ProfileDto, Readonly<{ kind: 'unexpected' }>> {
  return parseOk(profileResponseDto, body, (parsed) => parsed.profile);
}
