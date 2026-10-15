import {
  loginResponseDto,
  meResponseDto,
  type AuthUserDto,
  type LoginRequestDto,
} from '@lorkarium/contracts';
import { callApi, parseOk, retryAfterOf, type ApiCall } from './api-call';
import type { HttpResponse, HttpTransport } from './http-transport';

export type AuthFailure =
  | Readonly<{ kind: 'invalid_credentials' }>
  | Readonly<{ kind: 'rate_limited'; retryAfterSeconds: number }>
  | Readonly<{ kind: 'offline' }>
  | Readonly<{ kind: 'unexpected' }>;

export type AuthResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: AuthFailure }>;

/** What the screens need from `/api/auth`; failures come back as values, never thrown. */
export interface AuthApi {
  login(credentials: LoginRequestDto): Promise<AuthResult<AuthUserDto>>;
  me(): Promise<AuthResult<AuthUserDto | null>>;
  logout(): Promise<AuthResult<null>>;
}

/** `AuthApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAuthApi(transport).login(credentials); if (result.ok) …` */
export class HttpAuthApi implements AuthApi {
  constructor(private readonly transport: HttpTransport) {}

  async login(credentials: LoginRequestDto): Promise<AuthResult<AuthUserDto>> {
    const call = await callApi(this.transport, 'POST', '/auth/login', credentials);
    if (call.kind !== 'ok') return failed(call);
    return parseOk(loginResponseDto, call.body, (body) => body.user);
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
