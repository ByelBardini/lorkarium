import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const ANA = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
};
const CREDENTIALS = { email: 'ana@mesa.com', password: 'segredo', rememberMe: true };

describe('HttpAuthApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAuthApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAuthApi(transport);
  });

  it('a 200 login posts the credentials and yields the user', async () => {
    transport.respondWith(200, { user: ANA });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: true, value: ANA });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/auth/login', body: CREDENTIALS },
    ]);
  });

  it('a 401 login becomes the invalid_credentials failure', async () => {
    transport.respondWith(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'E-mail or password is incorrect',
    });
    expect(await api.login(CREDENTIALS)).toEqual({
      ok: false,
      failure: { kind: 'invalid_credentials' },
    });
  });

  it('a 429 with Retry-After: 42 becomes rate_limited for 42 seconds', async () => {
    transport.respondWith(
      429,
      { code: 'RATE_LIMITED', message: 'Too many' },
      { 'retry-after': '42' },
    );
    expect(await api.login(CREDENTIALS)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 42 },
    });
  });

  it('a network failure becomes offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.login(CREDENTIALS)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  it('a 200 body outside the DTO becomes unexpected', async () => {
    transport.respondWith(200, { user: { ...ANA, role: 'god' } });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a 500 becomes unexpected', async () => {
    transport.respondWith(500, { code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('me with user null yields null', async () => {
    transport.respondWith(200, { user: null });
    expect(await api.me()).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'GET', path: '/auth/me', body: undefined }]);
  });

  it('logout answered 204 yields success', async () => {
    transport.respondWith(204, null);
    expect(await api.logout()).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([{ method: 'POST', path: '/auth/logout', body: undefined }]);
  });
});
