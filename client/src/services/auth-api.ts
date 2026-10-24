import {
  loginResponseDto,
  meResponseDto,
  type AuthUserDto,
  type LoginRequestDto,
  type LoginResponseDto,
  type TwoFactorLoginRequestDto,
} from '@lorkarium/contracts';
import { callApi, errorCodeOf, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

export type AuthFailure =
  | Readonly<{ kind: 'invalid_credentials' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type AuthResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: AuthFailure }>;

/** The password was right, but the account has 2FA: no session yet, the code comes next. */
export type LoginFailure = AuthFailure | Readonly<{ kind: 'two_factor_required' }>;

export type LoginResult =
  Readonly<{ ok: true; value: AuthUserDto }> | Readonly<{ ok: false; failure: LoginFailure }>;

/** The second step of the login: the code was wrong, or the challenge is gone (5 min or 5 errors). */
export type TwoFactorLoginFailure =
  | Readonly<{ kind: 'two_factor_code_invalid' }>
  | Readonly<{ kind: 'two_factor_challenge_expired' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type TwoFactorLoginResult =
  | Readonly<{ ok: true; value: AuthUserDto }>
  | Readonly<{ ok: false; failure: TwoFactorLoginFailure }>;

/** What the screens need from `/api/auth`; failures come back as values, never thrown. */
export interface AuthApi {
  login(credentials: LoginRequestDto): Promise<LoginResult>;
  /** The code (or a recovery code) after a `two_factor_required` login; the challenge is a cookie. */
  verifyTwoFactor(input: TwoFactorLoginRequestDto): Promise<TwoFactorLoginResult>;
  me(): Promise<AuthResult<AuthUserDto | null>>;
  logout(): Promise<AuthResult<null>>;
}

/** `AuthApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAuthApi(transport).login(credentials); if (result.ok) …` */
export class HttpAuthApi implements AuthApi {
  constructor(private readonly transport: HttpTransport) {}

  async login(credentials: LoginRequestDto): Promise<LoginResult> {
    const call = await callApi(this.transport, 'POST', '/auth/login', credentials);
    if (call.kind !== 'ok') return failed(call);
    const parsed = parseOk(loginResponseDto, call.body, (body) => body);
    return parsed.ok ? loginResultOf(parsed.value) : parsed;
  }

  async verifyTwoFactor(input: TwoFactorLoginRequestDto): Promise<TwoFactorLoginResult> {
    const call = await callApi(this.transport, 'POST', '/auth/login/two-factor', input);
    if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
    if (call.kind === 'refused') return { ok: false, failure: twoFactorFailureOf(call.response) };
    const parsed = parseOk(loginResponseDto, call.body, (body) => body);
    if (parsed.ok && parsed.value.status === 'signed-in')
      return { ok: true, value: parsed.value.user };
    return { ok: false, failure: { kind: 'unexpected' } };
  }

  async me(): Promise<AuthResult<AuthUserDto | null>> {
    const call = await callApi(this.transport, 'GET', '/auth/me');
    if (call.kind !== 'ok') return failed(call);
    return parseOk(meResponseDto, call.body, (body) => body.user);
  }

  async logout(): Promise<AuthResult<null>> {
    const call = await callApi(this.transport, 'POST', '/auth/logout');
    return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
  }
}

function loginResultOf(answer: LoginResponseDto): LoginResult {
  if (answer.status === 'signed-in') return { ok: true, value: answer.user };
  return { ok: false, failure: { kind: 'two_factor_required' } };
}

function failed(call: Exclude<ApiCall, { kind: 'ok' }>): AuthResult<never> {
  if (call.kind === 'offline') return { ok: false, failure: { kind: 'offline' } };
  return { ok: false, failure: failureOf(call.response) };
}

function failureOf(response: HttpResponse): AuthFailure {
  if (response.status === 401) return { kind: 'invalid_credentials' };
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  return { kind: 'unexpected' };
}

const TWO_FACTOR_FAILURE_BY_CODE: Readonly<Record<string, TwoFactorLoginFailure>> = {
  TWO_FACTOR_CODE_INVALID: { kind: 'two_factor_code_invalid' },
  TWO_FACTOR_CHALLENGE_EXPIRED: { kind: 'two_factor_challenge_expired' },
};

// Both refusals are 401: only the code tells a wrong code from a challenge that is gone.
function twoFactorFailureOf(response: HttpResponse): TwoFactorLoginFailure {
  const code = errorCodeOf(response);
  const named = code === null ? undefined : TWO_FACTOR_FAILURE_BY_CODE[code];
  if (named) return named;
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  if (response.status === 401) return { kind: 'two_factor_challenge_expired' };
  return { kind: 'unexpected' };
}
