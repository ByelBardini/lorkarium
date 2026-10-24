import { beforeEach, describe, expect, it } from 'vitest';
import { HttpAccountSecurityApi } from '@/services/account-security-api';
import {
  ANA_SECURITY,
  RECOVERY_CODES,
  TWO_FACTOR_SETUP,
  anaSessions,
} from '../support/account-security-api-fake';
import { TEST_NOW } from '../support/app-dependencies';
import { HttpTransportFake } from '../support/http-transport-fake';

const SESSION_ID = 'c1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b';

describe('HttpAccountSecurityApi', () => {
  let transport: HttpTransportFake;
  let api: HttpAccountSecurityApi;

  beforeEach(() => {
    transport = new HttpTransportFake();
    api = new HttpAccountSecurityApi(transport);
  });

  function refuse(status: number, code: string): void {
    transport.respondWith(status, { code, message: 'x' });
  }

  it('security reads GET /account/security', async () => {
    transport.respondWith(200, { security: ANA_SECURITY });
    expect(await api.security()).toEqual({ ok: true, value: ANA_SECURITY });
    expect(transport.requests[0]).toMatchObject({ method: 'GET', path: '/account/security' });
  });

  it('sessions reads GET /account/sessions', async () => {
    const sessions = anaSessions(TEST_NOW);
    transport.respondWith(200, { sessions });
    expect(await api.sessions()).toEqual({ ok: true, value: sessions });
  });

  it('a read answered 401 fails as unauthenticated', async () => {
    refuse(401, 'UNAUTHENTICATED');
    expect(await api.sessions()).toEqual({ ok: false, failure: { kind: 'unauthenticated' } });
  });

  it('changePassword POSTs /account/password and a 204 is done', async () => {
    transport.respondWith(204, null);
    const input = { currentPassword: 'velha', newPassword: 'nova-senha' };
    expect(await api.changePassword(input)).toEqual({ ok: true, value: null });
    expect(transport.requests).toEqual([
      { method: 'POST', path: '/account/password', body: input },
    ]);
  });

  it('a 403 CURRENT_PASSWORD_INVALID is the field refusal, not a fallen session', async () => {
    refuse(403, 'CURRENT_PASSWORD_INVALID');
    expect(await api.changePassword({ currentPassword: 'x', newPassword: 'y'.repeat(8) })).toEqual({
      ok: false,
      failure: { kind: 'current_password_invalid' },
    });
  });

  it.each([
    [409, 'EMAIL_TAKEN', 'email_taken'],
    [400, 'EMAIL_UNCHANGED', 'email_unchanged'],
    [403, 'CURRENT_PASSWORD_INVALID', 'current_password_invalid'],
  ] as const)('requestEmailChange refused %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    const result = await api.requestEmailChange({ newEmail: 'bia@x.com', currentPassword: 'x' });
    expect(result).toEqual({ ok: false, failure: { kind } });
  });

  it('requestEmailChange yields the masked pending address', async () => {
    transport.respondWith(202, { pendingEmail: 'b**@x.com' });
    const result = await api.requestEmailChange({ newEmail: 'bia@x.com', currentPassword: 'x' });
    expect(result).toEqual({ ok: true, value: 'b**@x.com' });
    expect(transport.requests[0]).toMatchObject({ method: 'POST', path: '/account/email' });
  });

  it('cancelEmailChange DELETEs /account/email', async () => {
    transport.respondWith(204, null);
    expect(await api.cancelEmailChange()).toEqual({ ok: true, value: null });
    expect(transport.requests[0]).toMatchObject({ method: 'DELETE', path: '/account/email' });
  });

  it('confirmEmail refused 404 EMAIL_TOKEN_INVALID fails as email_token_invalid', async () => {
    refuse(404, 'EMAIL_TOKEN_INVALID');
    expect(await api.confirmEmail({ token: 't' })).toEqual({
      ok: false,
      failure: { kind: 'email_token_invalid' },
    });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/account/email/confirm',
      body: { token: 't' },
    });
  });

  it.each([
    [404, 'SESSION_NOT_FOUND', 'session_not_found'],
    [409, 'CURRENT_SESSION', 'current_session'],
  ] as const)('revokeSession refused %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    expect(await api.revokeSession(SESSION_ID)).toEqual({ ok: false, failure: { kind } });
    expect(transport.requests[0]).toMatchObject({
      method: 'DELETE',
      path: `/account/sessions/${SESSION_ID}`,
    });
  });

  it('revokeOtherSessions yields how many sessions ended', async () => {
    transport.respondWith(200, { revoked: 2 });
    expect(await api.revokeOtherSessions()).toEqual({ ok: true, value: 2 });
    expect(transport.requests[0]).toMatchObject({
      method: 'POST',
      path: '/account/sessions/revoke-others',
    });
  });

  it('setupTwoFactor yields the secret, the URI and the QR', async () => {
    transport.respondWith(200, TWO_FACTOR_SETUP);
    expect(await api.setupTwoFactor({ currentPassword: 'x' })).toEqual({
      ok: true,
      value: TWO_FACTOR_SETUP,
    });
  });

  it('setupTwoFactor refused 409 TWO_FACTOR_ALREADY_ENABLED fails as two_factor_already_enabled', async () => {
    refuse(409, 'TWO_FACTOR_ALREADY_ENABLED');
    expect(await api.setupTwoFactor({ currentPassword: 'x' })).toEqual({
      ok: false,
      failure: { kind: 'two_factor_already_enabled' },
    });
  });

  it('enableTwoFactor yields the 10 recovery codes', async () => {
    transport.respondWith(200, { recoveryCodes: RECOVERY_CODES });
    expect(await api.enableTwoFactor({ code: '123456' })).toEqual({
      ok: true,
      value: RECOVERY_CODES,
    });
    expect(transport.requests[0]).toMatchObject({ path: '/account/two-factor/enable' });
  });

  it.each([
    [403, 'TWO_FACTOR_CODE_INVALID', 'two_factor_code_invalid'],
    [409, 'TWO_FACTOR_NOT_STARTED', 'two_factor_not_started'],
  ] as const)('enableTwoFactor refused %i %s fails as %s', async (status, code, kind) => {
    refuse(status, code);
    expect(await api.enableTwoFactor({ code: '123456' })).toEqual({ ok: false, failure: { kind } });
  });

  it('disableTwoFactor refused 409 TWO_FACTOR_NOT_ENABLED fails as two_factor_not_enabled', async () => {
    refuse(409, 'TWO_FACTOR_NOT_ENABLED');
    expect(await api.disableTwoFactor({ currentPassword: 'x', code: '123456' })).toEqual({
      ok: false,
      failure: { kind: 'two_factor_not_enabled' },
    });
    expect(transport.requests[0]).toMatchObject({ path: '/account/two-factor/disable' });
  });

  it('regenerateRecoveryCodes POSTs /account/two-factor/recovery-codes', async () => {
    transport.respondWith(200, { recoveryCodes: RECOVERY_CODES });
    const result = await api.regenerateRecoveryCodes({ currentPassword: 'x', code: '123456' });
    expect(result).toEqual({ ok: true, value: RECOVERY_CODES });
    expect(transport.requests[0]).toMatchObject({ path: '/account/two-factor/recovery-codes' });
  });

  it('a command offline fails as offline', async () => {
    transport.failWithNetworkDown();
    expect(await api.cancelEmailChange()).toEqual({ ok: false, failure: { kind: 'offline' } });
  });

  describe('recovery link', () => {
    it('checkRecovery POSTs /account/recovery/check and validates the answer by the DTO', async () => {
      const recovery = { kind: 'revert-email-change', email: 'l****@x.com' } as const;
      transport.respondWith(200, { recovery });
      expect(await api.checkRecovery('t1')).toEqual({ ok: true, value: recovery });
      expect(transport.requests).toEqual([
        { method: 'POST', path: '/account/recovery/check', body: { token: 't1' } },
      ]);
    });

    it('a check answer outside the DTO is unexpected', async () => {
      transport.respondWith(200, { recovery: { kind: 'disable-2fa', email: null } });
      expect(await api.checkRecovery('t1')).toEqual({ ok: false, failure: { kind: 'unexpected' } });
    });

    it('recover POSTs the token and the new password and a 204 is done', async () => {
      transport.respondWith(204, null);
      expect(await api.recover('t1', 'senha-nova-1')).toEqual({ ok: true, value: null });
      expect(transport.requests[0]).toEqual({
        method: 'POST',
        path: '/account/recovery',
        body: { token: 't1', newPassword: 'senha-nova-1' },
      });
    });

    it.each([
      [404, 'RECOVERY_TOKEN_INVALID', { kind: 'recovery_token_invalid' }],
      [409, 'EMAIL_TAKEN', { kind: 'email_taken' }],
      [429, 'RATE_LIMITED', { kind: 'rate_limited', retryAfterSeconds: 60 }],
    ] as const)('recover refused %i %s fails as %o', async (status, code, failure) => {
      refuse(status, code);
      expect(await api.recover('t1', 'senha-nova-1')).toEqual({ ok: false, failure });
    });
  });
});
