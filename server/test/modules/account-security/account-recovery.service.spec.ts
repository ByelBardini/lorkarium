import { beforeEach, describe, expect, it } from 'vitest';
import {
  AccountRecoveryService,
  type RecoveryWriteDaos,
} from '../../../src/modules/account-security/account-recovery.service';
import {
  AccountRecoveryTokensDaoFake,
  EmailChangeRequestsDaoFake,
} from '../../support/account-security-fakes';
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
import { TwoFactorChallengesDaoFake } from '../../support/two-factor-fakes';

const NOW = new Date('2026-10-24T12:00:00Z');
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const BIA_ID = '0b5c3d1e-9a7f-4c2b-8e6d-1f2a3b4c5d6e';

describe('AccountRecoveryService', () => {
  let users: UsersDaoFake;
  let sessions: AuthSessionsDaoFake;
  let tokens: AccountRecoveryTokensDaoFake;
  let emailChanges: EmailChangeRequestsDaoFake;
  let challenges: TwoFactorChallengesDaoFake;
  let sessionEnded: SessionEndedFake;
  let clock: ClockFake;
  let journal: string[];
  let service: AccountRecoveryService;

  beforeEach(() => {
    users = new UsersDaoFake([
      userPo({ email: 'nova@x.com', passwordHash: 'hashed:do-invasor' }),
      userPo({ id: BIA_ID, email: 'bia@x.com', name: 'Bia' }),
    ]);
    sessions = new AuthSessionsDaoFake([
      authSessionPo({ id: 'sha:ana-1', userId: ANA_ID }),
      authSessionPo({ id: 'sha:ana-2', userId: ANA_ID }),
      authSessionPo({ id: 'sha:bia-1', userId: BIA_ID }),
    ]);
    tokens = new AccountRecoveryTokensDaoFake();
    emailChanges = new EmailChangeRequestsDaoFake();
    challenges = new TwoFactorChallengesDaoFake();
    sessionEnded = new SessionEndedFake();
    clock = new ClockFake(NOW);
    journal = [];
    sessionEnded.whenEnded = (sessionId) => journal.push(`ended ${sessionId}`);
    const daos: RecoveryWriteDaos = { tokens, users, emailChanges, sessions, challenges };
    service = new AccountRecoveryService({
      tokens,
      emailChanges,
      transaction: async (work) => {
        const result = await work(daos);
        journal.push('commit');
        return result;
      },
      linkTokens: new SessionTokenFake(),
      hasher: new PasswordHasherFake(),
      cipher: new DataCipherFake(),
      clock,
      sessionEnded,
      appPublicUrl: 'https://mesa.example.com',
    });
  });

  function tokenOf(link: string): string {
    return decodeURIComponent(link.split('#token=')[1] ?? '');
  }

  describe('issue', () => {
    it('stores only the hash with 7 days and answers the link with the token in the fragment', async () => {
      const link = await service.issue(ANA_ID, 'revert-password-change');
      expect(link).toBe('https://mesa.example.com/account/recover#token=token-1');
      expect(tokens.rows.get('sha:token-1')).toMatchObject({
        userId: ANA_ID,
        kind: 'revert-password-change',
        emailCipher: null,
        expiresAt: new Date(NOW.getTime() + SEVEN_DAYS),
      });
    });

    it('a revert keeps the old address sealed for the account, with its index', async () => {
      await service.issue(ANA_ID, 'revert-email-change', 'ana@x.com');
      expect(tokens.rows.get('sha:token-1')).toMatchObject({
        emailCipher: `sealed:user-email:${ANA_ID}:ana@x.com`,
        emailIndex: 'idx:email-index:ana@x.com',
      });
    });
  });

  describe('check', () => {
    it('a password link says its kind and no address', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-password-change'));
      expect(await service.check(token)).toEqual({ kind: 'revert-password-change', email: null });
    });

    it('a revert says the address coming back, masked', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-email-change', 'ana@x.com'));
      expect(await service.check(token)).toEqual({
        kind: 'revert-email-change',
        email: 'a**@x.com',
      });
    });

    it('a cancel says the pending address, masked', async () => {
      await emailChanges.replace({
        id: 'sha:confirm',
        userId: ANA_ID,
        emailCipher: `sealed:pending-email:${ANA_ID}:bandido@x.com`,
        emailIndex: 'idx:email-index:bandido@x.com',
        expiresAt: NOW,
      });
      const token = tokenOf(await service.issue(ANA_ID, 'cancel-email-change'));
      expect(await service.check(token)).toEqual({
        kind: 'cancel-email-change',
        email: 'b******@x.com',
      });
    });

    it('an expired link is RECOVERY_TOKEN_INVALID', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-password-change'));
      clock.current = new Date(NOW.getTime() + SEVEN_DAYS);
      await expect(service.check(token)).rejects.toMatchObject({ code: 'RECOVERY_TOKEN_INVALID' });
    });

    it('an unknown token is RECOVERY_TOKEN_INVALID', async () => {
      await expect(service.check('inventado')).rejects.toMatchObject({
        code: 'RECOVERY_TOKEN_INVALID',
      });
    });
  });

  describe('recover', () => {
    it('sets the new password and signs every device of the account out only after the commit', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-password-change'));
      await service.recover(token, 'senha-nova-da-ana');
      expect(users.rows[0]).toMatchObject({
        passwordHash: 'hashed:senha-nova-da-ana',
        passwordChangedAt: NOW,
      });
      expect(journal).toEqual(['commit', 'ended sha:ana-1', 'ended sha:ana-2']);
      expect([...sessions.rows.keys()]).toEqual(['sha:bia-1']);
    });

    it('a revert brings the old address back', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-email-change', 'ana@x.com'));
      await service.recover(token, 'senha-nova-da-ana');
      expect(users.rows[0]).toMatchObject({
        emailCipher: `sealed:user-email:${ANA_ID}:ana@x.com`,
        emailIndex: 'idx:email-index:ana@x.com',
      });
    });

    it('drops the pending e-mail change, the 2FA challenges and every other link', async () => {
      await emailChanges.replace({
        id: 'sha:confirm',
        userId: ANA_ID,
        emailCipher: 'x',
        emailIndex: 'y',
        expiresAt: NOW,
      });
      await challenges.insert({
        id: 'sha:challenge',
        userId: ANA_ID,
        persistent: false,
        expiresAt: NOW,
      });
      const token = tokenOf(await service.issue(ANA_ID, 'cancel-email-change'));
      await service.issue(ANA_ID, 'revert-password-change');
      await service.recover(token, 'senha-nova-da-ana');
      expect(emailChanges.rows).toEqual([]);
      expect(challenges.rows.size).toBe(0);
      expect(tokens.rows.size).toBe(0);
    });

    it('an old address now owned by another account is EMAIL_TAKEN and the password stays', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-email-change', 'bia@x.com'));
      await expect(service.recover(token, 'senha-nova-da-ana')).rejects.toMatchObject({
        code: 'EMAIL_TAKEN',
      });
      expect(users.rows[0]?.passwordHash).toBe('hashed:do-invasor');
      expect(sessions.rows.size).toBe(3);
      expect(sessionEnded.ended).toEqual([]);
    });

    it('the same link twice is RECOVERY_TOKEN_INVALID the second time', async () => {
      const token = tokenOf(await service.issue(ANA_ID, 'revert-password-change'));
      await service.recover(token, 'senha-nova-da-ana');
      await expect(service.recover(token, 'outra-senha-nova')).rejects.toMatchObject({
        code: 'RECOVERY_TOKEN_INVALID',
      });
    });
  });
});
