import { beforeEach, describe, expect, it } from 'vitest';
import {
  PasswordResetsService,
  type ResetCompletionDaos,
} from '../../../src/modules/account-links/password-resets.service';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { PasswordResetsDaoFake } from '../../support/account-links-fakes';
import { MailerFake, RecoveryIssuerFake } from '../../support/account-security-fakes';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  SessionEndedFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { authSessionPo, userPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-24T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const BIA_ID = '22222222-2222-4222-8222-222222222222';

describe('PasswordResetsService', () => {
  let resets: PasswordResetsDaoFake;
  let users: UsersDaoFake;
  let sessions: AuthSessionsDaoFake;
  let sessionEnded: SessionEndedFake;
  let mailer: MailerFake;
  let clock: ClockFake;
  let journal: string[];
  let service: PasswordResetsService;

  beforeEach(() => {
    resets = new PasswordResetsDaoFake();
    users = new UsersDaoFake([
      userPo({ id: ADMIN_ID, email: 'lucas@x.com', role: 'admin' }),
      userPo({ id: BIA_ID, email: 'bia@x.com', name: 'Bia', passwordHash: 'hashed:velha' }),
    ]);
    sessions = new AuthSessionsDaoFake([
      authSessionPo({ id: 'sha:bia-1', userId: BIA_ID }),
      authSessionPo({ id: 'sha:admin', userId: ADMIN_ID }),
    ]);
    sessionEnded = new SessionEndedFake();
    mailer = new MailerFake();
    clock = new ClockFake(NOW);
    journal = [];
    sessionEnded.whenEnded = (sessionId) => journal.push(`ended ${sessionId}`);
    const daos: ResetCompletionDaos = { resets, users, sessions };
    service = new PasswordResetsService({
      resets,
      users,
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
      notices: new SecurityNoticesService(mailer, () => undefined),
      recovery: new RecoveryIssuerFake(),
      appPublicUrl: 'https://mesa.example.com',
    });
  });

  describe('issue', () => {
    it('stores one link for the account, for one hour, and mails it', async () => {
      const issued = await service.issue(ADMIN_ID, BIA_ID);
      expect(issued).toEqual({
        link: 'https://mesa.example.com/reset-password#token=token-1',
        expiresAt: new Date(NOW.getTime() + HOUR).toISOString(),
      });
      expect(resets.rows).toMatchObject([{ userId: BIA_ID, tokenHash: 'sha:token-1' }]);
      expect(mailer.to('bia@x.com')[0]?.text).toContain(issued.link);
    });

    it('a second link replaces the first', async () => {
      await service.issue(ADMIN_ID, BIA_ID);
      await service.issue(ADMIN_ID, BIA_ID);
      expect(resets.rows.map((row) => row.tokenHash)).toEqual(['sha:token-2']);
    });

    it('a suspended account is ACCOUNT_SUSPENDED and gets no link', async () => {
      users.rows[1] = { ...users.rows[1]!, suspendedAt: NOW };
      await expect(service.issue(ADMIN_ID, BIA_ID)).rejects.toMatchObject({
        code: 'ACCOUNT_SUSPENDED',
      });
      expect(resets.rows).toEqual([]);
    });

    it('to the own account is SELF_ACTION', async () => {
      await expect(service.issue(ADMIN_ID, ADMIN_ID)).rejects.toMatchObject({
        code: 'SELF_ACTION',
      });
    });
  });

  describe('complete', () => {
    it('sets the password, drops the link, signs every device out after the commit and tells the account', async () => {
      await service.issue(ADMIN_ID, BIA_ID);
      await service.complete('token-1', 'senha-nova-da-bia', null);
      expect(users.rows[1]).toMatchObject({
        passwordHash: 'hashed:senha-nova-da-bia',
        passwordChangedAt: NOW,
      });
      expect(resets.rows).toEqual([]);
      expect(journal).toEqual(['commit', 'ended sha:bia-1']);
      expect(mailer.to('bia@x.com').at(-1)?.subject).toBe('Sua senha do Lorkarium foi trocada');
    });

    it('an expired link is refused and the password stays', async () => {
      await service.issue(ADMIN_ID, BIA_ID);
      clock.current = new Date(NOW.getTime() + HOUR);
      await expect(service.complete('token-1', 'senha-nova-da-bia', null)).rejects.toMatchObject({
        code: 'ACCOUNT_LINK_INVALID',
      });
      expect(users.rows[1]?.passwordHash).toBe('hashed:velha');
    });

    it('inspect names the @ of the account', async () => {
      await service.issue(ADMIN_ID, BIA_ID);
      expect(await service.inspect('token-1')).toEqual({ username: 'bia' });
    });
  });
});
