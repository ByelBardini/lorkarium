import { beforeEach, describe, expect, it } from 'vitest';
import { AccountSecurityService } from '../../../src/modules/account-security/account-security.service';
import { CurrentPasswordService } from '../../../src/modules/account-security/current-password.service';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { EmailChangeRequestsDaoFake, MailerFake } from '../../support/account-security-fakes';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  SessionEndedFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, authSessionPo, userPo } from '../../support/auth-factories';
import { RecoveryCodesDaoFake, TwoFactorDaoFake } from '../../support/two-factor-fakes';

const NOW = new Date('2026-10-14T12:00:00Z');

/** The users table writing its password changes into the shared journal. */
class JournalingUsersDao extends UsersDaoFake {
  constructor(private readonly journal: string[]) {
    super([userPo({ passwordHash: 'hashed:senha-velha' })]);
  }

  override async updatePassword(userId: string, hash: string, at: Date): Promise<void> {
    this.journal.push(`updatePassword ${hash} ${at.toISOString()}`);
    await super.updatePassword(userId, hash, at);
  }
}

/** The sessions table writing its bulk deletes into the shared journal. */
class JournalingSessionsDao extends AuthSessionsDaoFake {
  constructor(private readonly journal: string[]) {
    super([
      authSessionPo({ id: 'sha:atual', publicId: '11111111-1111-4111-8111-111111111111' }),
      authSessionPo({ id: 'sha:outra', publicId: '22222222-2222-4222-8222-222222222222' }),
    ]);
  }

  override async deleteOthersOf(userId: string, keptSessionId: string): Promise<string[]> {
    this.journal.push(`deleteOthersOf ${keptSessionId}`);
    return super.deleteOthersOf(userId, keptSessionId);
  }
}

describe('AccountSecurityService', () => {
  let journal: string[];
  let users: JournalingUsersDao;
  let sessions: JournalingSessionsDao;
  let sessionEnded: SessionEndedFake;
  let mailer: MailerFake;
  let emailChanges: EmailChangeRequestsDaoFake;
  let twoFactor: TwoFactorDaoFake;
  let recoveryCodes: RecoveryCodesDaoFake;
  let reported: string[];
  let service: AccountSecurityService;

  beforeEach(() => {
    journal = [];
    users = new JournalingUsersDao(journal);
    sessions = new JournalingSessionsDao(journal);
    sessionEnded = new SessionEndedFake();
    sessionEnded.whenEnded = (sessionId) => journal.push(`sessionEnded ${sessionId}`);
    mailer = new MailerFake();
    emailChanges = new EmailChangeRequestsDaoFake();
    twoFactor = new TwoFactorDaoFake();
    recoveryCodes = new RecoveryCodesDaoFake();
    reported = [];
    const hasher = new PasswordHasherFake();
    service = new AccountSecurityService({
      users,
      currentPassword: new CurrentPasswordService(users, hasher),
      hasher,
      sessions,
      sessionEnded,
      emailChanges,
      twoFactor,
      recoveryCodes,
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      notices: new SecurityNoticesService(mailer, (_error, subject) => reported.push(subject)),
    });
  });

  const change = { currentPassword: 'senha-velha', newPassword: 'senha-nova-123' };

  describe('changePassword', () => {
    it('stores the new hash, then ends the other sessions, then drops their connections', async () => {
      await service.changePassword(ANA_ID, 'sha:atual', change);
      expect(journal).toEqual([
        `updatePassword hashed:senha-nova-123 ${NOW.toISOString()}`,
        'deleteOthersOf sha:atual',
        'sessionEnded sha:outra',
      ]);
      expect(users.rows[0]?.passwordChangedAt).toEqual(NOW);
    });

    it('keeps the session making the request', async () => {
      await service.changePassword(ANA_ID, 'sha:atual', change);
      expect([...sessions.rows.keys()]).toEqual(['sha:atual']);
    });

    it('a wrong current password is CURRENT_PASSWORD_INVALID and nothing is written', async () => {
      const wrong = { ...change, currentPassword: 'errada' };
      await expect(service.changePassword(ANA_ID, 'sha:atual', wrong)).rejects.toMatchObject({
        code: 'CURRENT_PASSWORD_INVALID',
      });
      expect(journal).toEqual([]);
      expect(mailer.sent).toEqual([]);
    });

    it('sends "Sua senha foi trocada" to the account e-mail', async () => {
      await service.changePassword(ANA_ID, 'sha:atual', change);
      expect(mailer.sent.map((mail) => [mail.to, mail.subject])).toEqual([
        ['ana@mesa.com', 'Sua senha foi trocada'],
      ]);
    });

    it('a mail server down does not fail the change: the failure is reported', async () => {
      mailer.failWith = new Error('connect ECONNREFUSED 127.0.0.1:1025');
      await service.changePassword(ANA_ID, 'sha:atual', change);
      expect(users.rows[0]?.passwordHash).toBe('hashed:senha-nova-123');
      expect(reported).toEqual(['Sua senha foi trocada']);
    });
  });

  describe('overview', () => {
    it('without changes: the e-mail opened, no date, nothing pending, 2FA off', async () => {
      expect(await service.overview(ANA_ID)).toEqual({
        email: 'ana@mesa.com',
        passwordChangedAt: null,
        pendingEmail: null,
        twoFactor: { enabled: false, recoveryCodesLeft: 0 },
      });
    });

    it('after a password change it says when', async () => {
      await service.changePassword(ANA_ID, 'sha:atual', change);
      expect((await service.overview(ANA_ID)).passwordChangedAt).toBe(NOW.toISOString());
    });

    it('a pending change shows the new address masked; an expired one shows nothing', async () => {
      const pending = {
        id: 'sha:link',
        userId: ANA_ID,
        emailCipher: `sealed:pending-email:${ANA_ID}:bianca@x.com`,
        emailIndex: 'idx:email-index:bianca@x.com',
        expiresAt: new Date('2026-10-14T12:10:00Z'),
      };
      await emailChanges.replace(pending);
      expect((await service.overview(ANA_ID)).pendingEmail).toBe('b*****@x.com');
      await emailChanges.replace({ ...pending, expiresAt: NOW });
      expect((await service.overview(ANA_ID)).pendingEmail).toBeNull();
    });

    it('2FA on counts the recovery codes still unused', async () => {
      await twoFactor.savePending(ANA_ID, 'sealed');
      await twoFactor.enable(ANA_ID, NOW, 1);
      await recoveryCodes.replace(ANA_ID, ['idx:a', 'idx:b', 'idx:c']);
      await recoveryCodes.use(ANA_ID, 'idx:a', NOW);
      expect((await service.overview(ANA_ID)).twoFactor).toEqual({
        enabled: true,
        recoveryCodesLeft: 2,
      });
    });
  });
});
