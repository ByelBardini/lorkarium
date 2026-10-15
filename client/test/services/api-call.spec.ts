import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { callApi, errorCodeOf, parseOk, retryAfterOf } from '@/services/api-call';
import { HttpTransportFake } from '../support/http-transport-fake';

const greetingDto = z.strictObject({ greeting: z.string() });

async function refusedResponse(status: number, body: unknown, headers = {}) {
  const transport = new HttpTransportFake().respondWith(status, body, headers);
  const call = await callApi(transport, 'GET', '/x');
  if (call.kind !== 'refused') throw new Error(`expected refused, got ${call.kind}`);
  return call.response;
}

describe('callApi', () => {
  it('a status below 300 is ok with the body', async () => {
    const transport = new HttpTransportFake().respondWith(201, { greeting: 'oi' });
    expect(await callApi(transport, 'POST', '/x', { a: 1 })).toEqual({
      kind: 'ok',
      body: { greeting: 'oi' },
    });
    expect(transport.requests).toEqual([{ method: 'POST', path: '/x', body: { a: 1 } }]);
  });

  it('a 404 is handed back as refused so the caller picks the failure kind', async () => {
    expect((await refusedResponse(404, { code: 'NOPE', message: 'no' })).status).toBe(404);
  });

  it('a network failure becomes offline', async () => {
    const transport = new HttpTransportFake().failWithNetworkDown();
    expect(await callApi(transport, 'GET', '/x')).toEqual({ kind: 'offline' });
  });
});

describe('retryAfterOf', () => {
  it('reads Retry-After: 7 as 7 seconds', async () => {
    const response = await refusedResponse(429, {}, { 'retry-after': '7' });
    expect(retryAfterOf(response)).toBe(7);
  });

  it('falls back to retryAfterSeconds in the body when the header is missing', async () => {
    const body = { code: 'RATE_LIMITED', message: 'x', retryAfterSeconds: 12 };
    expect(retryAfterOf(await refusedResponse(429, body))).toBe(12);
  });

  it('falls back to 60 seconds when neither header nor body says', async () => {
    expect(retryAfterOf(await refusedResponse(429, null))).toBe(60);
  });
});

describe('errorCodeOf', () => {
  it('reads the code of an ApiErrorDto body', async () => {
    const response = await refusedResponse(403, {
      code: 'CAMPAIGN_PASSWORD_REQUIRED',
      message: 'x',
    });
    expect(errorCodeOf(response)).toBe('CAMPAIGN_PASSWORD_REQUIRED');
  });

  it('is null for a body outside the ApiErrorDto', async () => {
    expect(errorCodeOf(await refusedResponse(403, '<html>'))).toBeNull();
  });
});

describe('parseOk', () => {
  it('a body inside the schema yields the picked value', () => {
    expect(parseOk(greetingDto, { greeting: 'oi' }, (body) => body.greeting)).toEqual({
      ok: true,
      value: 'oi',
    });
  });

  it('a body outside the schema becomes unexpected', () => {
    expect(parseOk(greetingDto, { greeting: 1 }, (body) => body.greeting)).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });
});
