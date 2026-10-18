import { apiErrorDto } from '@lorkarium/contracts';
import type { z } from 'zod';
import {
  NetworkUnavailableError,
  type HttpMethod,
  type HttpResponse,
  type HttpTransport,
} from './http-transport';

/** One HTTP exchange before the service names the failure: ok, refused by status, or offline. */
export type ApiCall =
  | Readonly<{ kind: 'ok'; body: unknown }>
  | Readonly<{ kind: 'refused'; response: HttpResponse }>
  | Readonly<{ kind: 'offline' }>;

export type ParsedBody<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; failure: Readonly<{ kind: 'unexpected' }> }>;

const DEFAULT_RETRY_AFTER_SECONDS = 60;

/** Sends one request; a status of 300+ comes back as `refused`, a network failure as `offline`.
 *
 *  Example: `const call = await callApi(transport, 'GET', '/campaigns'); if (call.kind === 'ok') …` */
export async function callApi(
  transport: HttpTransport,
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<ApiCall> {
  return exchange(() => transport.request(method, path, body));
}

/** Posts a file as the raw body (its own content type), with the same outcomes as `callApi`.
 *
 *  Example: `await callUpload(transport, '/campaigns/<id>/assets?purpose=token', file)` */
export async function callUpload(
  transport: HttpTransport,
  path: string,
  file: Blob,
): Promise<ApiCall> {
  return exchange(() => transport.upload(path, file));
}

async function exchange(send: () => Promise<HttpResponse>): Promise<ApiCall> {
  try {
    const response = await send();
    if (response.status < 300) return { kind: 'ok', body: response.body };
    return { kind: 'refused', response };
  } catch (error) {
    if (error instanceof NetworkUnavailableError) return { kind: 'offline' };
    throw error;
  }
}

/** Validates a 2xx body by its DTO; a body outside it is `unexpected`, never trusted.
 *
 *  Example: `parseOk(meResponseDto, call.body, (body) => body.user)` */
export function parseOk<S extends z.ZodType, T>(
  schema: S,
  body: unknown,
  pick: (parsed: z.infer<S>) => T,
): ParsedBody<T> {
  const parsed = schema.safeParse(body);
  return parsed.success
    ? { ok: true, value: pick(parsed.data) }
    : { ok: false, failure: { kind: 'unexpected' } };
}

/** Seconds to wait after a 429.
 *  Retry-After is the standard; the body field covers a proxy that strips the header.
 *
 *  Example: `retryAfterOf(response) // 42` */
export function retryAfterOf(response: HttpResponse): number {
  const fromHeader = Number(response.header('retry-after'));
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader);
  const body = apiErrorDto.safeParse(response.body);
  return body.success && body.data.retryAfterSeconds
    ? body.data.retryAfterSeconds
    : DEFAULT_RETRY_AFTER_SECONDS;
}

/** The `code` of an `ApiErrorDto` body, or `null` when the body is something else.
 *
 *  Example: `errorCodeOf(response) === 'CAMPAIGN_PASSWORD_REQUIRED'` */
export function errorCodeOf(response: HttpResponse): string | null {
  const body = apiErrorDto.safeParse(response.body);
  return body.success ? body.data.code : null;
}
