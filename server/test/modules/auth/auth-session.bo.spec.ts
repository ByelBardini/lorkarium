import { describe, expect, it } from 'vitest';
import { AuthSessionBo } from '../../../src/modules/auth/auth-session.bo';
import { authSessionPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-14T12:00:00Z');

function sessionEndingAt(expiresAt: string, persistent: boolean): AuthSessionBo {
  return new AuthSessionBo(authSessionPo({ expiresAt: new Date(expiresAt), persistent }));
}

describe('AuthSessionBo', () => {
  it('a session started with rememberMe lasts 30 days', () => {
    expect(AuthSessionBo.startedAt(NOW, true)).toEqual({
      expiresAt: new Date('2026-11-13T12:00:00Z'),
      persistent: true,
    });
  });

  it('a session started without rememberMe lasts 12 hours', () => {
    expect(AuthSessionBo.startedAt(NOW, false)).toEqual({
      expiresAt: new Date('2026-10-15T00:00:00Z'),
      persistent: false,
    });
  });

  it('a session is expired at the exact instant of its deadline', () => {
    expect(sessionEndingAt('2026-10-14T12:00:00Z', true).isExpiredAt(NOW)).toBe(true);
  });

  it('a session is still valid one millisecond before its deadline', () => {
    expect(sessionEndingAt('2026-10-14T12:00:00.001Z', true).isExpiredAt(NOW)).toBe(false);
  });

  it('a 30-day session with 14 days left renews to now + 30 days', () => {
    const session = sessionEndingAt('2026-10-28T12:00:00Z', true);
    expect(session.renewalAt(NOW)).toEqual(new Date('2026-11-13T12:00:00Z'));
  });

  it('a 30-day session with 16 days left is not renewed', () => {
    expect(sessionEndingAt('2026-10-30T12:00:00Z', true).renewalAt(NOW)).toBeNull();
  });

  it('a 12-hour session with 5 hours left renews to now + 12 hours', () => {
    const session = sessionEndingAt('2026-10-14T17:00:00Z', false);
    expect(session.renewalAt(NOW)).toEqual(new Date('2026-10-15T00:00:00Z'));
  });
});
