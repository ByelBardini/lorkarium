import { beforeEach, describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import {
  SanctionsService,
  type SanctionsDeps,
  type SanctionWriteDaos,
} from '../../../src/modules/sanctions/sanctions.service';
import { PasswordResetsDaoFake } from '../../support/account-links-fakes';
import { MailerFake } from '../../support/account-security-fakes';
import { authSessionPo, userPo } from '../../support/auth-factories';
import {
  AuthSessionsDaoFake,
  ClockFake,
  DataCipherFake,
  SessionEndedFake,
} from '../../support/auth-fakes';
import {
  AccountDeletionFake,
  AccountSanctionsDaoFake,
  NoticesJournalFake,
} from '../../support/sanctions-fakes';
import { UserAdminDaoFake } from '../../support/user-admin-fakes';

const NOW = new Date('2026-11-19T12:00:00Z');
const ADMIN = { id: 'ad000000-0000-4000-8000-000000000001', name: 'Fernanda' };
const CAIO_ID = 'ca100000-0000-4000-8000-000000000002';
const REPORT_ID = '7e700000-0000-4000-8000-000000000003';
const CONTACT = 'contato@lorkarium.example.com';
const UNTIL = '2026-11-25T15:00:00.000Z';
const HARASSMENT = { rule: 'harassment', statement: 'Ameaçou um jogador real.' } as const;

describe('SanctionsService', () => {
  let accounts: UserAdminDaoFake;
  let sanctions: AccountSanctionsDaoFake;
  let sessions: AuthSessionsDaoFake;
  let resets: PasswordResetsDaoFake;
  let sessionEnded: SessionEndedFake;
  let journal: string[];
  let notices: NoticesJournalFake;
  let deletion: AccountDeletionFake;
  let service: SanctionsService;

  function serviceWith(overrides: Partial<SanctionsDeps> = {}): SanctionsService {
    const daos: SanctionWriteDaos = { accounts, sanctions, sessions, passwordResets: resets };
    return new SanctionsService({
      accounts,
      sanctions,
      transaction: async (work) => {
        const result = await work(daos);
        journal.push('commit');
        return result;
      },
      deletion,
      sessionEnded,
      notices,
      cipher: new DataCipherFake(),
      clock: new ClockFake(NOW),
      appPublicUrl: 'https://mesa.example.com',
      sitePublicUrl: 'https://lorkarium.example.com',
      replyTo: CONTACT,
      ...overrides,
    });
  }

  beforeEach(() => {
    accounts = new UserAdminDaoFake([
      userPo({ id: ADMIN.id, email: 'fernanda@x.com', username: 'fernanda', role: 'admin' }),
      userPo({ id: CAIO_ID, email: 'caio@x.com', username: 'caio', name: 'Caio' }),
    ]);
    sanctions = new AccountSanctionsDaoFake();
    sanctions.usernames.set(ADMIN.id, 'fernanda');
    sanctions.reports.set(REPORT_ID, CAIO_ID);
    sessions = new AuthSessionsDaoFake([
      authSessionPo({ id: 'sha:caio-1', userId: CAIO_ID }),
      authSessionPo({ id: 'sha:fernanda', userId: ADMIN.id }),
    ]);
    resets = new PasswordResetsDaoFake();
    sessionEnded = new SessionEndedFake();
    journal = [];
    sessionEnded.whenEnded = (sessionId) => journal.push(`ended ${sessionId}`);
    notices = new NoticesJournalFake(journal);
    deletion = new AccountDeletionFake(journal);
    service = serviceWith();
  });

  describe('a suspension', () => {
    it('stores the measure, suspends until the end, signs out after the commit, then e-mails', async () => {
      await resets.replace({ userId: CAIO_ID, tokenHash: 'h', createdAt: NOW, expiresAt: NOW });

      const issued = await service.issue(ADMIN, CAIO_ID, {
        kind: 'suspension',
        ...HARASSMENT,
        until: UNTIL,
      });

      expect(issued?.sanction).toMatchObject({
        kind: 'suspension',
        until: UNTIL,
        issuedBy: 'fernanda',
      });
      expect(issued?.user.status).toBe('suspended');
      const caio = await accounts.findAccount(CAIO_ID);
      expect(caio).toMatchObject({ suspendedAt: NOW, suspendedUntil: new Date(UNTIL) });
      expect([...sessions.rows.keys()]).toEqual(['sha:fernanda']);
      expect(resets.rows).toEqual([]);
      expect(journal).toEqual([
        'commit',
        'ended sha:caio-1',
        'mail Sua conta no Lorkarium foi suspensa',
      ]);
    });

    it('the e-mail carries the reasons and answers to MAIL_REPLY_TO, not the generic notice', async () => {
      await service.issue(ADMIN, CAIO_ID, { kind: 'suspension', ...HARASSMENT });

      const [mail] = notices.sent;
      expect(mail).toMatchObject({ to: 'caio@x.com', replyTo: CONTACT });
      expect(mail?.text).toContain('Ameaçou um jogador real.');
      expect(mail?.text).toContain('Prazo: sem prazo');
      expect(mail?.subject).not.toBe('Seu acesso ao Lorkarium foi suspenso');
    });

    it('a measure tied to a report about the account keeps the report', async () => {
      const issued = await service.issue(ADMIN, CAIO_ID, {
        kind: 'suspension',
        ...HARASSMENT,
        reportId: REPORT_ID,
      });

      expect(issued?.sanction.reportId).toBe(REPORT_ID);
    });

    it('a report about someone else is SANCTION_REPORT_NOT_FOUND and nothing is stored', async () => {
      sanctions.reports.set(REPORT_ID, ADMIN.id);

      const issue = service.issue(ADMIN, CAIO_ID, {
        kind: 'warning',
        ...HARASSMENT,
        reportId: REPORT_ID,
      });

      await expect(issue).rejects.toMatchObject({ code: 'SANCTION_REPORT_NOT_FOUND' });
      expect(sanctions.rows).toEqual([]);
      expect(notices.sent).toEqual([]);
    });

    it('an account already suspended is ALREADY_SUSPENDED and nobody is told', async () => {
      await accounts.setSuspendedAt(CAIO_ID, NOW);

      const issue = service.issue(ADMIN, CAIO_ID, { kind: 'suspension', ...HARASSMENT });

      await expect(issue).rejects.toMatchObject({ code: 'ALREADY_SUSPENDED' });
      expect(sanctions.rows).toEqual([]);
      expect(journal).toEqual([]);
    });

    it('an e-mail that fails keeps the measure and the suspension', async () => {
      const mailer = new MailerFake();
      mailer.failWith = new Error('smtp down');
      const failing = serviceWith({ notices: new SecurityNoticesService(mailer, () => undefined) });

      const issued = await failing.issue(ADMIN, CAIO_ID, { kind: 'suspension', ...HARASSMENT });

      expect(issued?.user.status).toBe('suspended');
      expect(sanctions.rows).toHaveLength(1);
    });
  });

  describe('a warning and a content removal', () => {
    it.each([
      ['warning', 'Um aviso sobre a sua conta no Lorkarium'],
      ['content_removal', 'Removemos um conteúdo da sua conta no Lorkarium'],
    ] as const)(
      'a %s is only recorded and e-mailed: no suspension, no sign-out',
      async (kind, subject) => {
        const issued = await service.issue(ADMIN, CAIO_ID, { kind, ...HARASSMENT });

        expect(issued?.user.status).toBe('active');
        expect([...sessions.rows.keys()]).toEqual(['sha:caio-1', 'sha:fernanda']);
        expect(journal).toEqual(['commit', `mail ${subject}`]);
      },
    );

    it('against an unknown account it is USER_NOT_FOUND', async () => {
      const unknown = '99999999-9999-4999-8999-999999999999';
      await expect(
        service.issue(ADMIN, unknown, { kind: 'warning', ...HARASSMENT }),
      ).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });

  describe('a ban', () => {
    it('e-mails first, then deletes keeping the e-mail index, and answers nothing', async () => {
      const issued = await service.issue(ADMIN, CAIO_ID, { kind: 'ban', ...HARASSMENT });

      expect(issued).toBeNull();
      expect(journal).toEqual([
        `check ${CAIO_ID}`,
        'mail Sua conta no Lorkarium foi excluída',
        `delete ${CAIO_ID} banned 2026-11-19T12:00:00.000Z`,
      ]);
      expect(notices.sent[0]?.replyTo).toBe(CONTACT);
    });

    it('a blocked deletion (OWNS_SHARED_CAMPAIGNS) e-mails nobody and deletes nothing', async () => {
      deletion.blocking = [{ id: 'vharn', name: 'Vharn', otherMembers: 2 }];

      const issue = service.issue(ADMIN, CAIO_ID, { kind: 'ban', ...HARASSMENT });

      await expect(issue).rejects.toMatchObject({
        code: 'OWNS_SHARED_CAMPAIGNS',
        blockingCampaigns: [{ id: 'vharn', name: 'Vharn', otherMembers: 2 }],
      });
      expect(journal).toEqual([`check ${CAIO_ID}`]);
    });

    it('a ban of another admin is TARGET_IS_ADMIN before any check', async () => {
      await accounts.setRole(CAIO_ID, 'admin');

      await expect(
        service.issue(ADMIN, CAIO_ID, { kind: 'ban', ...HARASSMENT }),
      ).rejects.toMatchObject({
        code: 'TARGET_IS_ADMIN',
      });
      expect(journal).toEqual([]);
    });
  });

  describe('the appeal', () => {
    async function suspendCaio(): Promise<string> {
      const issued = await service.issue(ADMIN, CAIO_ID, { kind: 'suspension', ...HARASSMENT });
      journal.length = 0;
      notices.sent.length = 0;
      return issued?.sanction.id ?? '';
    }

    it('its arrival records when it came and changes nothing else', async () => {
      const sanctionId = await suspendCaio();

      const answer = await service.recordAppeal(ADMIN, sanctionId, { outcome: 'received' });

      expect(answer.sanction.appeal).toMatchObject({
        receivedAt: NOW.toISOString(),
        outcome: null,
      });
      expect(answer.user.status).toBe('suspended');
      expect(notices.sent).toEqual([]);
    });

    it('reverting the suspension in force lifts it and welcomes back after the commit', async () => {
      const sanctionId = await suspendCaio();

      const answer = await service.recordAppeal(ADMIN, sanctionId, {
        outcome: 'reverted',
        note: 'Era outra pessoa.',
      });

      expect(answer.user.status).toBe('active');
      expect(answer.sanction.appeal).toMatchObject({ outcome: 'reverted', decidedBy: 'fernanda' });
      expect((await accounts.findAccount(CAIO_ID))?.suspendedAt).toBeNull();
      expect(journal).toEqual(['commit', 'mail Seu acesso ao Lorkarium voltou']);
    });

    it('upholding it only records', async () => {
      const sanctionId = await suspendCaio();

      const answer = await service.recordAppeal(ADMIN, sanctionId, {
        outcome: 'upheld',
        note: 'O print confirma.',
      });

      expect(answer.user.status).toBe('suspended');
      expect(notices.sent).toEqual([]);
    });

    it('reverting a warning only records', async () => {
      const warning = await service.issue(ADMIN, CAIO_ID, { kind: 'warning', ...HARASSMENT });
      notices.sent.length = 0;

      await service.recordAppeal(ADMIN, warning?.sanction.id ?? '', {
        outcome: 'reverted',
        note: 'x',
      });

      expect(notices.sent).toEqual([]);
    });

    it('deciding an appeal already decided is APPEAL_ALREADY_DECIDED', async () => {
      const sanctionId = await suspendCaio();
      await service.recordAppeal(ADMIN, sanctionId, { outcome: 'upheld', note: 'Mantida.' });

      const again = service.recordAppeal(ADMIN, sanctionId, { outcome: 'reverted', note: 'x' });

      await expect(again).rejects.toMatchObject({ code: 'APPEAL_ALREADY_DECIDED' });
      expect((await accounts.findAccount(CAIO_ID))?.suspendedAt).toEqual(NOW);
    });

    it('an unknown measure is SANCTION_NOT_FOUND', async () => {
      const unknown = '5a0c7100-0000-4000-8000-999999999999';
      await expect(
        service.recordAppeal(ADMIN, unknown, { outcome: 'received' }),
      ).rejects.toMatchObject({ code: 'SANCTION_NOT_FOUND' });
    });
  });

  describe('history', () => {
    it('lists the measures of the account, the newest first', async () => {
      await service.issue(ADMIN, CAIO_ID, { kind: 'warning', ...HARASSMENT });
      sanctions.rows[0] = { ...sanctions.rows[0]!, issuedAt: new Date('2026-11-01T00:00:00Z') };
      await service.issue(ADMIN, CAIO_ID, { kind: 'suspension', ...HARASSMENT });

      const { sanctions: listed } = await service.history(CAIO_ID);

      expect(listed.map((item) => item.kind)).toEqual(['suspension', 'warning']);
    });

    it('of an unknown account is USER_NOT_FOUND', async () => {
      await expect(service.history('99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({
        code: 'USER_NOT_FOUND',
      });
    });
  });
});
