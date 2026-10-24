import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAuthApi } from '@/services/auth-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const ANA = {
  id: '7d0f8c39-2b8e-4f4e-9d1a-5c6b7a8e9f01',
  username: 'ana',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
  color: 'teal',
  avatarId: null,
};
const CREDENTIALS = { email: 'ana@mesa.com', password: 'segredo', rememberMe: true };

describe('HttpAuthApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAuthApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAuthApi(transport);
  });

  it('a 200 signed-in login posts the credentials and yields the user', async () => {
    transport.respondWith(200, { status: 'signed-in', user: ANA });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: true, value: ANA });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/auth/login', body: CREDENTIALS },
    ]);
  });

  it('a 200 two-factor-required login becomes the two_factor_required failure', async () => {
    transport.respondWith(200, { status: 'two-factor-required' });
    expect(await api.login(CREDENTIALS)).toEqual({
      ok: false,
      failure: { kind: 'two_factor_required' },
    });
  });

  it('a 200 two-factor-required login that also carries a user becomes unexpected', async () => {
    transport.respondWith(200, { status: 'two-factor-required', user: ANA });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('a 200 login in the old shape, without status, becomes unexpected', async () => {
    transport.respondWith(200, { user: ANA });
    expect(await api.login(CREDENTIALS)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
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
    transport.respondWith(200, { status: 'signed-in', user: { ...ANA, role: 'god' } });
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

  describe('verifyTwoFactor', () => {
    it('posts the code to /auth/login/two-factor and yields the user signed in', async () => {
      transport.respondWith(200, { status: 'signed-in', user: ANA });
      expect(await api.verifyTwoFactor({ code: '123456' })).toEqual({ ok: true, value: ANA });
      expect(transport.requests).toEqual([
        { method: 'POST', path: '/auth/login/two-factor', body: { code: '123456' } },
      ]);
    });

    it.each([
      ['TWO_FACTOR_CODE_INVALID', 'two_factor_code_invalid'],
      ['TWO_FACTOR_CHALLENGE_EXPIRED', 'two_factor_challenge_expired'],
    ] as const)('a 401 %s fails as %s (the code tells them apart)', async (code, kind) => {
      transport.respondWith(401, { code, message: 'x' });
      expect(await api.verifyTwoFactor({ recoveryCode: 'k7m2p-9qrst' })).toEqual({
        ok: false,
        failure: { kind },
      });
    });

    it('a 429 carries the Retry-After seconds', async () => {
      transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '20' });
      expect(await api.verifyTwoFactor({ code: '123456' })).toEqual({
        ok: false,
        failure: { kind: 'rate_limited', retryAfterSeconds: 20 },
      });
    });

    it('a 200 that still asks for the code is unexpected', async () => {
      transport.respondWith(200, { status: 'two-factor-required' });
      expect(await api.verifyTwoFactor({ code: '123456' })).toEqual({
        ok: false,
        failure: { kind: 'unexpected' },
      });
    });

    it('offline fails as offline', async () => {
      transport.failWithNetworkDown();
      expect(await api.verifyTwoFactor({ code: '123456' })).toEqual({
        ok: false,
        failure: { kind: 'offline' },
      });
    });
  });
});
