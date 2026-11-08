import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSavedColorsApi } from '@/services/saved-colors-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const ROUTE = '/account/saved-colors';

function apiError(code: string): object {
  return { code, message: 'x' };
}

describe('HttpSavedColorsApi', () => {
  let transport: HttpTransportFake;
  let api: HttpSavedColorsApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpSavedColorsApi(transport);
  });

  it('list gets the route and yields the colors of the answer', async () => {
    transport.respondWith(200, { colors: ['#336699', '#aabbcc'] });

    expect(await api.list()).toEqual({ ok: true, value: ['#336699', '#aabbcc'] });
    expect(transport.requests).toEqual([{ method: 'GET', path: ROUTE, body: undefined }]);
  });

  it('save posts the color and yields the whole new list', async () => {
    transport.respondWith(200, { colors: ['#336699'] });

    expect(await api.save('#336699')).toEqual({ ok: true, value: ['#336699'] });
    expect(transport.requests).toEqual([
      { method: 'POST', path: ROUTE, body: { color: '#336699' } },
    ]);
  });

  it('remove deletes by the hex without its # and yields the whole new list', async () => {
    transport.respondWith(200, { colors: [] });

    expect(await api.remove('#aabbcc')).toEqual({ ok: true, value: [] });
    expect(transport.requests).toEqual([
      { method: 'DELETE', path: `${ROUTE}/aabbcc`, body: undefined },
    ]);
  });

  it('an answer outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { colors: ['url(x)'] });

    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a 409 SAVED_COLORS_LIMIT answers saved_colors_limit', async () => {
    transport.respondWith(409, apiError('SAVED_COLORS_LIMIT'));

    expect(await api.save('#336699')).toEqual({
      ok: false,
      failure: { kind: 'saved_colors_limit' },
    });
  });

  it.each([
    [400, 'INVALID_BODY', 'invalid'],
    [401, 'UNAUTHENTICATED', 'unauthenticated'],
    [500, 'INTERNAL_ERROR', 'unexpected'],
  ])('a %i %s on a command answers %s', async (status, code, kind) => {
    transport.respondWith(status, apiError(code));

    expect(await api.remove('#336699')).toEqual({ ok: false, failure: { kind } });
  });

  it('a 429 answers rate_limited with the seconds of Retry-After', async () => {
    transport.respondWith(429, apiError('RATE_LIMITED'), { 'retry-after': '12' });

    expect(await api.save('#336699')).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 12 },
    });
  });

  it('a fallen session on the read answers unauthenticated', async () => {
    transport.respondWith(401, apiError('UNAUTHENTICATED'));

    expect(await api.list()).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
  });

  it.each([
    ['list', (target: HttpSavedColorsApi) => target.list()],
    ['save', (target: HttpSavedColorsApi) => target.save('#336699')],
    ['remove', (target: HttpSavedColorsApi) => target.remove('#336699')],
  ] as const)('a network failure on %s comes back as a value', async (_name, call) => {
    transport.failWithNetworkDown();

    expect(await call(api)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
