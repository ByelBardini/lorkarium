import {
  apiErrorDto,
  loginResponseDto,
  meResponseDto,
  type AuthUserDto,
  type LoginRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { NetworkUnavailableError, type HttpResponse, type HttpTransport } from './http-transport';

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

const UNEXPECTED: AuthResult<never> = { ok: false, failure: { kind: 'unexpected' } };

/** `AuthApi` over HTTP: validates every answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAuthApi(transport).login(credentials); if (result.ok) …` */
export class HttpAuthApi implements AuthApi {
  constructor(private readonly transport: HttpTransport) {}

  async login(credentials: LoginRequestDto): Promise<AuthResult<AuthUserDto>> {
    const result = await this.call('POST', '/auth/login', credentials);
    if (!result.ok) return result;
    return parseOk(loginResponseDto, result.value, (body) => body.user);
  }

  async me(): Promise<AuthResult<AuthUserDto | null>> {
    const result = await this.call('GET', '/auth/me');
    if (!result.ok) return result;
    return parseOk(meResponseDto, result.value, (body) => body.user);
  }

  async logout(): Promise<AuthResult<null>> {
    const result = await this.call('POST', '/auth/logout');
    return result.ok ? { ok: true, value: null } : result;
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<AuthResult<unknown>> {
    try {
      const response = await this.transport.request(method, path, body);
      if (response.status < 300) return { ok: true, value: response.body };
      return { ok: false, failure: failureOf(response) };
    } catch (error) {
      if (error instanceof NetworkUnavailableError)
        return { ok: false, failure: { kind: 'offline' } };
      throw error;
    }
  }
}

function parseOk<S extends z.ZodType, T>(
  schema: S,
  body: unknown,
  pick: (parsed: z.infer<S>) => T,
): AuthResult<T> {
  const parsed = schema.safeParse(body);
  return parsed.success ? { ok: true, value: pick(parsed.data) } : UNEXPECTED;
}

function failureOf(response: HttpResponse): AuthFailure {
  if (response.status === 401) return { kind: 'invalid_credentials' };
  if (response.status === 429)
    return { kind: 'rate_limited', retryAfterSeconds: retryAfterOf(response) };
  return { kind: 'unexpected' };
}

// Retry-After is the standard; the body field covers a proxy that strips the header.
function retryAfterOf(response: HttpResponse): number {
  const fromHeader = Number(response.header('retry-after'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader);
  const body = apiErrorDto.safeParse(response.body);
  return body.success && body.data.retryAfterSeconds ? body.data.retryAfterSeconds : 60;
}
