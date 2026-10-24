import { beforeEach, describe, expect, it } from 'vitest';
import { USER_AGENT_MAX_LENGTH } from '../../../src/modules/auth/auth-sessions.po';
import { AuthService } from '../../../src/modules/auth/auth.service';
import { TwoFactorCheckService } from '../../../src/modules/auth/two-factor-check.service';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  SessionEndedFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, authSessionPo, userPo } from '../../support/auth-factories';
import {
  RecoveryCodesDaoFake,
  TotpFake,
  TwoFactorChallengesDaoFake,
  TwoFactorDaoFake,
} from '../../support/two-factor-fakes';

const NOW = new Date('2026-10-14T12:00:00Z');
const DECOY_HASH = 'hashed:decoy';
const ANA_DTO = {
  id: ANA_ID,
  username: 'ana',
  name: 'Ana',
  email: 'ana@mesa.com',
  role: 'user',
  color: 'teal',
  avatarId: null,
};

describe('AuthService', () => {
  let users: UsersDaoFake;
  let sessions: AuthSessionsDaoFake;
  let hasher: PasswordHasherFake;
  let sessionEnded: SessionEndedFake;
  let twoFactor: TwoFactorDaoFake;
  let challenges: TwoFactorChallengesDaoFake;
  let service: AuthService;

  beforeEach(() => {
    users = new UsersDaoFake([userPo({ passwordHash: 'hashed:segredo-da-ana' })]);
    sessions = new AuthSessionsDaoFake();
    hasher = new PasswordHasherFake();
    sessionEnded = new SessionEndedFake();
    twoFactor = new TwoFactorDaoFake();
    challenges = new TwoFactorChallengesDaoFake();
    const clock = new ClockFake(NOW);
    const cipher = new DataCipherFake();
    const recoveryCodes = new RecoveryCodesDaoFake();
    const totp = new TotpFake();
    const check = new TwoFactorCheckService({ twoFactor, recoveryCodes, totp, cipher, clock });
    service = new AuthService({
      users,
      sessions,
      hasher,
      tokens: new SessionTokenFake(),
      clock,
      cipher,
      decoyHash: DECOY_HASH,
      sessionEnded,
      twoFactor: check,
      challenges,
    });
  });

  function storeSession(expiresAt: string, persistent: boolean): void {
    const row = authSessionPo({ id: 'sha:cookie', expiresAt: new Date(expiresAt), persistent });
    sessions.rows.set('sha:cookie', row);
  }

  describe('login', () => {
    it('right credentials issue a token and store only its hash', async () => {
      const issued = await service.login({
        email: 'ana@mesa.com',
        password: 'segredo-da-ana',
        rememberMe: true,
      });
      expect(issued).toEqual({
        status: 'signed-in',
        user: ANA_DTO,
        token: 'token-1',
        expiresAt: new Date('2026-11-13T12:00:00Z'),
        persistent: true,
      });
      expect([...sessions.rows.keys()]).toEqual(['sha:token-1']);
    });

    it('looks the account up by the blind index of the e-mail, never by the e-mail in clear', async () => {
      await service.login({ email: 'ana@mesa.com', password: 'segredo-da-ana', rememberMe: false });
      expect(users.lookedUp).toEqual(['idx:email-index:ana@mesa.com']);
    });

    it('the e-mail of the issued user is the one opened from the row, bound to its id', async () => {
      users.rows[0] = userPo({ email: 'ana@outra.com', passwordHash: 'hashed:segredo-da-ana' });
      users.rows[0] = { ...users.rows[0], emailIndex: 'idx:email-index:ana@mesa.com' };
      const issued = await service.login({
        email: 'ana@mesa.com',
        password: 'segredo-da-ana',
        rememberMe: false,
      });
      expect(issued).toMatchObject({ status: 'signed-in', user: { email: 'ana@outra.com' } });
    });

    it('an unknown e-mail is refused with INVALID_CREDENTIALS after verifying the decoy hash', async () => {
      const login = service.login({
        email: 'bia@mesa.com',
        password: 'qualquer',
        rememberMe: false,
      });
      await expect(login).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(hasher.verifications).toEqual([{ hashed: DECOY_HASH, password: 'qualquer' }]);
    });

    it('a wrong password is refused with the same INVALID_CREDENTIALS and creates no session', async () => {
      const login = service.login({ email: 'ana@mesa.com', password: 'errada', rememberMe: false });
      await expect(login).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(sessions.rows.size).toBe(0);
    });

    it('keeps the user agent on the session, cut to USER_AGENT_MAX_LENGTH', async () => {
      const agent = 'M'.repeat(600);
      await service.login(
        { email: 'ana@mesa.com', password: 'segredo-da-ana', rememberMe: false },
        agent,
      );
      expect(sessions.rows.get('sha:token-1')?.userAgent).toBe('M'.repeat(512));
      expect(USER_AGENT_MAX_LENGTH).toBe(512);
    });

    it('without a user agent the session keeps null', async () => {
      await service.login({ email: 'ana@mesa.com', password: 'segredo-da-ana', rememberMe: false });
      expect(sessions.rows.get('sha:token-1')?.userAgent).toBeNull();
    });
  });

  describe('login with 2FA on', () => {
    const enabledTwoFactor = {
      userId: ANA_ID,
      secretCipher: `sealed:totp-secret:${ANA_ID}:SECRET`,
      enabledAt: new Date('2026-10-02T12:00:00Z'),
      lastStep: null,
      createdAt: new Date('2026-10-02T12:00:00Z'),
    };

    beforeEach(() => {
      twoFactor.rows.set(ANA_ID, enabledTwoFactor);
    });

    it('the right password stores a 5-minute challenge with "keep me signed in" and issues no session', async () => {
      const outcome = await service.login({
        email: 'ana@mesa.com',
        password: 'segredo-da-ana',
        rememberMe: true,
      });
      expect(outcome).toEqual({
        status: 'two-factor-required',
        challenge: { token: 'token-1', expiresAt: new Date('2026-10-14T12:05:00Z') },
      });
      expect(challenges.rows.get('sha:token-1')).toMatchObject({
        userId: ANA_ID,
        persistent: true,
        expiresAt: new Date('2026-10-14T12:05:00Z'),
      });
      expect(sessions.rows.size).toBe(0);
    });

    it('a pending setup (never confirmed) does not ask for the second step', async () => {
      twoFactor.rows.set(ANA_ID, { ...enabledTwoFactor, enabledAt: null });
      const outcome = await service.login({
        email: 'ana@mesa.com',
        password: 'segredo-da-ana',
        rememberMe: false,
      });
      expect(outcome.status).toBe('signed-in');
      expect(challenges.rows.size).toBe(0);
    });

    it('a wrong password is still INVALID_CREDENTIALS and stores no challenge', async () => {
      const login = service.login({ email: 'ana@mesa.com', password: 'errada', rememberMe: false });
      await expect(login).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(challenges.rows.size).toBe(0);
    });
  });

  describe('resolveSession', () => {
    it('a missing cookie resolves to null', async () => {
      expect(await service.resolveSession(undefined)).toBeNull();
    });

    it('an unknown token resolves to null', async () => {
      expect(await service.resolveSession('nunca-emitido')).toBeNull();
    });

    it('an expired session resolves to null and its row is deleted', async () => {
      storeSession('2026-10-14T12:00:00Z', true);
      expect(await service.resolveSession('cookie')).toBeNull();
      expect(sessions.rows.has('sha:cookie')).toBe(false);
    });

    it('a session far from its deadline resolves to the user without renewing', async () => {
      storeSession('2026-11-10T12:00:00Z', true);
      expect(await service.resolveSession('cookie')).toEqual({
        user: ANA_DTO,
        sessionId: 'sha:cookie',
        expiresAt: new Date('2026-11-10T12:00:00Z'),
        recheckAt: new Date('2026-10-26T12:00:00Z'),
        persistent: true,
        renewed: false,
      });
    });

    it('a session near its deadline is renewed and the new deadline is stored', async () => {
      storeSession('2026-10-14T17:00:00Z', false);
      const resolved = await service.resolveSession('cookie');
      expect(resolved).toMatchObject({
        expiresAt: new Date('2026-10-15T00:00:00Z'),
        recheckAt: new Date('2026-10-14T18:00:00Z'),
        renewed: true,
      });
      expect(sessions.rows.get('sha:cookie')?.expiresAt).toEqual(new Date('2026-10-15T00:00:00Z'));
    });
  });

  describe('last activity in steps of 5 min', () => {
    function storeSeen(lastSeenAt: string): void {
      const row = authSessionPo({
        id: 'sha:cookie',
        expiresAt: new Date('2026-11-10T12:00:00Z'),
        lastSeenAt: new Date(lastSeenAt),
      });
      sessions.rows.set('sha:cookie', row);
    }

    it('a session seen 4 min ago is not rewritten', async () => {
      storeSeen('2026-10-14T11:56:00Z');
      await service.resolveSession('cookie');
      expect(sessions.touched).toEqual([]);
    });

    it('a session seen 6 min ago is touched with now', async () => {
      storeSeen('2026-10-14T11:54:00Z');
      await service.resolveSession('cookie');
      expect(sessions.touched).toEqual([{ sessionId: 'sha:cookie', lastSeenAt: NOW }]);
    });

    it('an expired session is deleted, never touched', async () => {
      sessions.rows.set(
        'sha:cookie',
        authSessionPo({
          id: 'sha:cookie',
          expiresAt: NOW,
          lastSeenAt: new Date('2026-10-01T00:00:00Z'),
        }),
      );
      await service.resolveSession('cookie');
      expect(sessions.touched).toEqual([]);
    });
  });

  describe('logout', () => {
    it('deletes the session of the given token', async () => {
      storeSession('2026-11-10T12:00:00Z', true);
      await service.logout('cookie');
      expect(sessions.rows.has('sha:cookie')).toBe(false);
    });

    it('tells the realtime side that the session ended, after deleting it', async () => {
      storeSession('2026-11-10T12:00:00Z', true);
      const rowWhenEnded: boolean[] = [];
      sessionEnded.whenEnded = () => rowWhenEnded.push(sessions.rows.has('sha:cookie'));
      await service.logout('cookie');
      expect(sessionEnded.ended).toEqual(['sha:cookie']);
      expect(rowWhenEnded).toEqual([false]);
    });

    it('without a cookie nothing is deleted and no session is announced as ended', async () => {
      await service.logout(undefined);
      expect(sessionEnded.ended).toEqual([]);
    });

    it('an unknown token does not throw', async () => {
      await expect(service.logout('nunca-emitido')).resolves.toBeUndefined();
    });
  });

  describe('authorize', () => {
    it('without a valid session it is refused with UNAUTHENTICATED', async () => {
      await expect(service.authorize('nunca-emitido', 'user')).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('a user session asking for admin is refused with FORBIDDEN_ROLE', async () => {
      storeSession('2026-11-10T12:00:00Z', true);
      await expect(service.authorize('cookie', 'admin')).rejects.toMatchObject({
        code: 'FORBIDDEN_ROLE',
      });
    });

    it('an admin session asking for admin resolves to that admin', async () => {
      users.rows[0] = userPo({ role: 'admin' });
      storeSession('2026-11-10T12:00:00Z', true);
      const resolved = await service.authorize('cookie', 'admin');
      expect(resolved.user).toEqual({ ...ANA_DTO, role: 'admin' });
    });
  });
});
