import { beforeEach, describe, expect, it } from 'vitest';
import { HttpSignUpApi } from '@/services/sign-up-api';
import { HttpTransportFake } from '../support/http-transport-fake';

const SIGN_UP = { email: 'ana@exemplo.com', humanCheckToken: 'token-ok' } as const;
const RESET = { identifier: 'biaflor', humanCheckToken: 'token-ok' } as const;

describe('HttpSignUpApi', () => {
  let transport: HttpTransportFake;
  let api: HttpSignUpApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpSignUpApi(transport);
  });

  it('settings GETs the public route and answers whether registration is open and the site key', async () => {
    transport.respondWith(200, { registrationOpen: true, humanCheckSiteKey: '0x4AAA' });
    expect(await api.settings()).toEqual({
      ok: true,
      value: { registrationOpen: true, humanCheckSiteKey: '0x4AAA' },
    });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/sign-up/settings' });
  });

  it('settings outside the DTO is unexpected, never trusted', async () => {
    transport.respondWith(200, { registrationOpen: 'yes', humanCheckSiteKey: null });
    expect(await api.settings()).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });

  it('requestSignUp POSTs the address and the token, and a 202 without body is ok', async () => {
    transport.respondWith(202, null);
    expect(await api.requestSignUp(SIGN_UP)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toEqual({ method: 'POST', path: '/sign-up', body: SIGN_UP });
  });

  it('requestPasswordReset POSTs the e-mail or @ and the token, and a 202 is ok', async () => {
    transport.respondWith(202, null);
    expect(await api.requestPasswordReset(RESET)).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/password-resets/request',
      body: RESET,
    });
  });

  it.each([
    [403, { code: 'REGISTRATION_CLOSED' }, { kind: 'registration_closed' }],
    [400, { code: 'HUMAN_CHECK_FAILED' }, { kind: 'human_check_failed' }],
    [400, { code: 'INVALID_BODY' }, { kind: 'invalid' }],
    [
      429,
      { code: 'RATE_LIMITED', retryAfterSeconds: 120 },
      { kind: 'rate_limited', retryAfterSeconds: 120 },
    ],
    [500, { code: 'INTERNAL_ERROR' }, { kind: 'unexpected' }],
  ] as const)('a sign-up answered %i %o fails as %o', async (status, body, failure) => {
    transport.respondWith(status, { message: 'x', ...body });
    expect(await api.requestSignUp(SIGN_UP)).toEqual({ ok: false, failure });
  });

  it('a 429 takes the seconds from Retry-After', async () => {
    transport.respondWith(429, { code: 'RATE_LIMITED', message: 'x' }, { 'retry-after': '300' });
    expect(await api.requestPasswordReset(RESET)).toEqual({
      ok: false,
      failure: { kind: 'rate_limited', retryAfterSeconds: 300 },
    });
  });

  it('a password reset refused by the human check fails as human_check_failed', async () => {
    transport.respondWith(400, { code: 'HUMAN_CHECK_FAILED', message: 'x' });
    expect(await api.requestPasswordReset(RESET)).toEqual({
      ok: false,
      failure: { kind: 'human_check_failed' },
    });
  });

  it('without network every call fails as offline', async () => {
    transport.failWithNetworkDown().failWithNetworkDown();
    expect(await api.settings()).toEqual({ ok: false, failure: { kind: 'offline' } });
    expect(await api.requestSignUp(SIGN_UP)).toEqual({ ok: false, failure: { kind: 'offline' } });
  });
});
