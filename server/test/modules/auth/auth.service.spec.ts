import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../../../src/modules/auth/auth.service';
import {
  AuthSessionsDaoFake,
  ClockFake,
  PasswordHasherFake,
  SessionEndedFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, authSessionPo, userPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-14T12:00:00Z');
const DECOY_HASH = 'hashed:decoy';
const ANA_DTO = { id: ANA_ID, name: 'Ana', email: 'ana@mesa.com', role: 'user' };

describe('AuthService', () => {
  let users: UsersDaoFake;
  let sessions: AuthSessionsDaoFake;
  let hasher: PasswordHasherFake;
  let sessionEnded: SessionEndedFake;
  let service: AuthService;

  beforeEach(() => {
    users = new UsersDaoFake([userPo({ passwordHash: 'hashed:segredo-da-ana' })]);
    sessions = new AuthSessionsDaoFake();
    hasher = new PasswordHasherFake();
    sessionEnded = new SessionEndedFake();
    service = new AuthService({
      users,
      sessions,
      hasher,
      tokens: new SessionTokenFake(),
      clock: new ClockFake(NOW),
      decoyHash: DECOY_HASH,
      sessionEnded,
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
        user: ANA_DTO,
        token: 'token-1',
        expiresAt: new Date('2026-11-13T12:00:00Z'),
        persistent: true,
      });
      expect([...sessions.rows.keys()]).toEqual(['sha:token-1']);
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
