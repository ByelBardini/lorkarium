import {
  signUpSettingsDto,
  type PasswordResetRequestDto,
  type SignUpRequestDto,
  type SignUpSettingsDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';

/** Every refusal of the public sign-up and "esqueci minha senha" routes the pages tell apart. */
export type SignUpFailure =
  | Readonly<{ kind: 'registration_closed' }>
  | Readonly<{ kind: 'human_check_failed' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type SignUpResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: SignUpFailure }>;

/** The public routes a person without an account uses: the sign-up and the new-password request.
 *  Both requests answer the same 202 whether the account exists or not. */
export interface SignUpApi {
  settings(): Promise<SignUpResult<SignUpSettingsDto>>;
  requestSignUp(input: SignUpRequestDto): Promise<SignUpResult<null>>;
  requestPasswordReset(input: PasswordResetRequestDto): Promise<SignUpResult<null>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, SignUpFailure>> = {
  REGISTRATION_CLOSED: { kind: 'registration_closed' },
  HUMAN_CHECK_FAILED: { kind: 'human_check_failed' },
};

/** `SignUpApi` over HTTP: validates the settings by the contracts DTO.
 *
 *  Example: `const result = await new HttpSignUpApi(transport).requestSignUp({ email, humanCheckToken })` */
export class HttpSignUpApi implements SignUpApi {
  constructor(private readonly transport: HttpTransport) {}

  async settings(): Promise<SignUpResult<SignUpSettingsDto>> {
    const call = await callApi(this.transport, 'GET', '/sign-up/settings');
    if (call.kind !== 'ok') return { ok: false, failure: failureOf(call) };
    return parseOk(signUpSettingsDto, call.body, (body) => body);
  }

  async requestSignUp(input: SignUpRequestDto): Promise<SignUpResult<null>> {
    return acceptedOf(await callApi(this.transport, 'POST', '/sign-up', input));
  }

  async requestPasswordReset(input: PasswordResetRequestDto): Promise<SignUpResult<null>> {
    return acceptedOf(await callApi(this.transport, 'POST', '/password-resets/request', input));
  }
}

function acceptedOf(call: ApiCall): SignUpResult<null> {
  return call.kind === 'ok' ? { ok: true, value: null } : { ok: false, failure: failureOf(call) };
}

function failureOf(call: Exclude<ApiCall, { kind: 'ok' }>): SignUpFailure {
  if (call.kind === 'offline') return { kind: 'offline' };
  const code = errorCodeOf(call.response);
  const named = code === null ? undefined : FAILURE_BY_CODE[code];
  if (named) return named;
  const { status } = call.response;
  if (status === 400) return { kind: 'invalid' };
  if (status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(call.response) };
  return { kind: 'unexpected' };
}
