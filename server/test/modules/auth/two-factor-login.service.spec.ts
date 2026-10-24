import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthService, IssuedSession } from '../../../src/modules/auth/auth.service';
import { TwoFactorCheckService } from '../../../src/modules/auth/two-factor-check.service';
import { TwoFactorLoginService } from '../../../src/modules/auth/two-factor-login.service';
import type { UserPo } from '../../../src/modules/auth/users.po';
import {
  ClockFake,
  DataCipherFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';
import {
  RecoveryCodesDaoFake,
  TotpFake,
  TwoFactorChallengesDaoFake,
  TwoFactorDaoFake,
} from '../../support/two-factor-fakes';

const NOW = new Date('2026-10-14T12:00:00Z');
const CURRENT_STEP = Math.floor(NOW.getTime() / 30_000);

/** Records who got a session and with which "keep me signed in"; issues a fixed one. */
class SessionStarterFake implements Pick<AuthService, 'startSession'> {
  readonly started: Array<{ userId: string; persistent: boolean; userAgent?: string }> = [];

  async startSession(row: UserPo, persistent: boolean, userAgent?: string): Promise<IssuedSession> {
    this.started.push({ userId: row.id, persistent, ...(userAgent ? { userAgent } : {}) });
    const user = { id: row.id, username: row.username, name: row.name, email: 'ana@mesa.com' };
    const extra = { role: row.role, color: 'teal' as const, avatarId: null };
    return { user: { ...user, ...extra }, token: 'session-token', expiresAt: NOW, persistent };
  }
}

describe('TwoFactorLoginService', () => {
  let challenges: TwoFactorChallengesDaoFake;
  let twoFactor: TwoFactorDaoFake;
  let recoveryCodes: RecoveryCodesDaoFake;
  let totp: TotpFake;
  let sessions: SessionStarterFake;
  let clock: ClockFake;
  let service: TwoFactorLoginService;

  beforeEach(async () => {
    challenges = new TwoFactorChallengesDaoFake();
    twoFactor = new TwoFactorDaoFake();
    recoveryCodes = new RecoveryCodesDaoFake();
    totp = new TotpFake();
    sessions = new SessionStarterFake();
    clock = new ClockFake(NOW);
    const cipher = new DataCipherFake();
    const check = new TwoFactorCheckService({ twoFactor, recoveryCodes, totp, cipher, clock });
    const users = new UsersDaoFake([userPo()]);
    const tokens = new SessionTokenFake();
    service = new TwoFactorLoginService({ challenges, users, check, sessions, tokens, clock });
    await twoFactor.savePending(ANA_ID, `sealed:totp-secret:${ANA_ID}:ANASECRET`);
    await twoFactor.enable(ANA_ID, new Date('2026-10-01T00:00:00Z'), CURRENT_STEP - 10);
    const expiresAt = new Date('2026-10-14T12:05:00Z');
    await challenges.insert({ id: 'sha:challenge', userId: ANA_ID, persistent: true, expiresAt });
    totp.stepsByCode.set('111111', CURRENT_STEP);
  });

  it('the right code issues the session with the persistence of the challenge and deletes it', async () => {
    const issued = await service.complete('challenge', { kind: 'totp', code: '111111' }, 'UA/1');
    expect(issued.token).toBe('session-token');
    expect(sessions.started).toEqual([{ userId: ANA_ID, persistent: true, userAgent: 'UA/1' }]);
    expect(challenges.rows.has('sha:challenge')).toBe(false);
  });

  it('a recovery code also signs in and is marked used', async () => {
    await recoveryCodes.replace(ANA_ID, ['idx:recovery-code:k7m2p-9qrst']);
    await service.complete('challenge', { kind: 'recovery', code: 'k7m2p-9qrst' });
    expect(recoveryCodes.rows[0]?.usedAt).toEqual(NOW);
    expect(sessions.started).toHaveLength(1);
  });

  it('a wrong code counts a failure, keeps the challenge and issues no session', async () => {
    const attempt = service.complete('challenge', { kind: 'totp', code: '000000' });
    await expect(attempt).rejects.toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });
    expect(challenges.rows.get('sha:challenge')?.failures).toBe(1);
    expect(sessions.started).toEqual([]);
  });

  it('the 5th wrong code deletes the challenge; the next try finds it expired', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.complete('challenge', { kind: 'totp', code: '000000' }),
      ).rejects.toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });
    }
    expect(challenges.rows.has('sha:challenge')).toBe(false);
    await expect(
      service.complete('challenge', { kind: 'totp', code: '111111' }),
    ).rejects.toMatchObject({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' });
  });

  it('the 4th wrong code still keeps the challenge', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await service.complete('challenge', { kind: 'totp', code: '000000' }).catch(() => undefined);
    }
    expect(challenges.rows.get('sha:challenge')?.failures).toBe(4);
  });

  it('a challenge past its 5 minutes is refused as expired and deleted', async () => {
    clock.current = new Date('2026-10-14T12:05:00Z');
    await expect(
      service.complete('challenge', { kind: 'totp', code: '111111' }),
    ).rejects.toMatchObject({
      code: 'TWO_FACTOR_CHALLENGE_EXPIRED',
      received: 'an expired challenge',
    });
    expect(challenges.rows.has('sha:challenge')).toBe(false);
  });

  it('without the cookie it is refused as expired', async () => {
    await expect(
      service.complete(undefined, { kind: 'totp', code: '111111' }),
    ).rejects.toMatchObject({
      code: 'TWO_FACTOR_CHALLENGE_EXPIRED',
      received: 'no challenge cookie',
    });
  });

  it('an unknown challenge token is refused as expired', async () => {
    await expect(
      service.complete('forjado', { kind: 'totp', code: '111111' }),
    ).rejects.toMatchObject({ received: 'an unknown challenge' });
  });
});
