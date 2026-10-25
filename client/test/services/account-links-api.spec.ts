import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAccountLinksApi } from '@/services/account-links-api';
import { MARINA } from '../support/account-links-api-fake';
import { HttpTransportFake } from '../support/http-transport-fake';

describe('HttpAccountLinksApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAccountLinksApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAccountLinksApi(transport);
  });

  it('inspectInvitation POSTs the token and answers the address and the @', async () => {
    transport.respondWith(200, { email: 'marina@exemplo.com', suggestedUsername: 'marina' });
    expect(await api.inspectInvitation('t1')).toEqual({
      ok: true,
      value: { email: 'marina@exemplo.com', suggestedUsername: 'marina' },
    });
    expect(transport.requests[0]).toEqual({
      method: 'POST',
      path: '/invitations/inspect',
      body: { token: 't1' },
    });
  });

  it('acceptInvitation answers the signed-in user', async () => {
    transport.respondWith(200, { status: 'signed-in', user: MARINA });
    const input = {
      token: 't1',
      username: 'marina',
      password: '12345678',
      persistent: false,
      acceptedTerms: true,
    } as const;
    expect(await api.acceptInvitation(input)).toEqual({ ok: true, value: MARINA });
    expect(transport.requests[0]).toMatchObject({ path: '/invitations/accept', body: input });
  });

  it('inspectPasswordReset answers the @ and completePasswordReset a 204', async () => {
    transport.respondWith(200, { username: 'biaflor' });
    expect(await api.inspectPasswordReset('t1')).toEqual({ ok: true, value: 'biaflor' });
    transport.respondWith(204, null);
    expect(await api.completePasswordReset('t1', 'senha-nova-1')).toEqual({
      ok: true,
      value: null,
    });
    expect(transport.requests[1]).toEqual({
      method: 'POST',
      path: '/password-resets/complete',
      body: { token: 't1', newPassword: 'senha-nova-1' },
    });
  });

  it.each([
    [404, { code: 'ACCOUNT_LINK_INVALID' }, { kind: 'link_invalid' }],
    [409, { code: 'USERNAME_TAKEN' }, { kind: 'username_taken' }],
    [409, { code: 'EMAIL_TAKEN' }, { kind: 'email_taken' }],
    [400, { code: 'INVALID_BODY' }, { kind: 'invalid' }],
    [
      429,
      { code: 'RATE_LIMITED', retryAfterSeconds: 9 },
      { kind: 'rate_limited', retryAfterSeconds: 9 },
    ],
    [500, { code: 'INTERNAL_ERROR' }, { kind: 'unexpected' }],
  ] as const)('a %i %o fails as %o', async (status, body, failure) => {
    transport.respondWith(status, { message: 'x', ...body });
    const input = {
      token: 't1',
      username: 'marina',
      password: '12345678',
      persistent: false,
      acceptedTerms: true,
    } as const;
    expect(await api.acceptInvitation(input)).toEqual({ ok: false, failure });
  });

  it('offline fails as offline; an answer outside the DTO is unexpected', async () => {
    transport.failWithNetworkDown();
    expect(await api.inspectInvitation('t1')).toEqual({ ok: false, failure: { kind: 'offline' } });
    transport.respondWith(200, { email: 'not-an-email' });
    expect(await api.inspectInvitation('t1')).toEqual({
      ok: false,
      failure: { kind: 'unexpected' },
    });
  });
});
