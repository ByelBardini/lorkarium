import { beforeEach, describe, expect, it } from 'vitest';
import { PasswordLinksService } from '../../../src/modules/account-links/password-links.service';
import { SignUpService, type SignUpDeps } from '../../../src/modules/account-links/sign-up.service';
import type {
  InvitationPo,
  NewInvitationPo,
} from '../../../src/modules/account-links/invitations.po';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import {
  HeldNoticesFake,
  HumanCheckFake,
  InvitationsDaoFake,
  PasswordResetsDaoFake,
} from '../../support/account-links-fakes';
import { MailerFake } from '../../support/account-security-fakes';
import {
  ClockFake,
  DataCipherFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { userPo } from '../../support/auth-factories';
import { BannedEmailsFake } from '../../support/user-admin-fakes';

const NOW = new Date('2026-11-20T12:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const IP = '203.0.113.7';
const ANA_ID = '22222222-2222-4222-8222-222222222222';
const MARINA = { email: 'marina@exemplo.com', humanCheckToken: 'tok' };

/** Answers the unique index of the address as taken, as when another request inserted first. */
class RacedInvitationsDaoFake extends InvitationsDaoFake {
  override async insert(invitation: NewInvitationPo): Promise<InvitationPo> {
    throw new Error(`duplicate key for ${invitation.emailIndex}`, {
      cause: { code: '23505', constraint: 'invitations_email_index_unique' },
    });
  }
}

describe('SignUpService.request', () => {
  let invitations: InvitationsDaoFake;
  let users: UsersDaoFake;
  let resets: PasswordResetsDaoFake;
  let bannedEmails: BannedEmailsFake;
  let humanCheck: HumanCheckFake;
  let mailer: MailerFake;
  let clock: ClockFake;
  let ids: number;

  function serviceWith(overrides: Partial<SignUpDeps> = {}): SignUpService {
    const linkTokens = new SessionTokenFake();
    const appPublicUrl = 'https://mesa.example.com';
    return new SignUpService({
      registrationOpen: true,
      humanCheck,
      invitations,
      users,
      bannedEmails,
      resets,
      passwordLinks: new PasswordLinksService({ resets, linkTokens, clock, appPublicUrl }),
      linkTokens,
      cipher: new DataCipherFake(),
      clock,
      notices: new SecurityNoticesService(mailer, () => undefined),
      newId: () => `id-${(ids += 1)}`,
      appPublicUrl,
      ...overrides,
    });
  }

  beforeEach(() => {
    invitations = new InvitationsDaoFake();
    users = new UsersDaoFake([userPo({ id: ANA_ID, email: 'ana@exemplo.com', name: 'Ana' })]);
    resets = new PasswordResetsDaoFake();
    bannedEmails = new BannedEmailsFake();
    humanCheck = new HumanCheckFake();
    mailer = new MailerFake();
    clock = new ClockFake(NOW);
    ids = 0;
  });

  it('with the sign-up closed it is REGISTRATION_CLOSED before checking the token', async () => {
    const service = serviceWith({ registrationOpen: false });
    await expect(service.request(MARINA, IP)).rejects.toMatchObject({
      code: 'REGISTRATION_CLOSED',
    });
    expect(humanCheck.checked).toEqual([]);
    expect(invitations.rows).toEqual([]);
  });

  it('a refused token is HUMAN_CHECK_FAILED without the address, and nothing is stored', async () => {
    humanCheck.passes = false;
    const request = serviceWith().request(MARINA, IP);
    await expect(request).rejects.toMatchObject({ code: 'HUMAN_CHECK_FAILED' });
    await expect(request).rejects.not.toThrow(/marina/);
    expect(humanCheck.checked).toEqual([{ token: 'tok', remoteIp: IP }]);
    expect(invitations.rows).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });

  it('a new address gets a 24-hour sign-up link of role user, from nobody', async () => {
    await serviceWith().request(MARINA, IP);
    expect(invitations.rows).toEqual([
      {
        id: 'id-1',
        tokenHash: 'sha:token-1',
        emailCipher: 'sealed:invitation-email:id-1:marina@exemplo.com',
        emailIndex: 'idx:email-index:marina@exemplo.com',
        role: 'user',
        origin: 'self',
        invitedBy: null,
        sentAt: NOW,
        expiresAt: new Date(NOW.getTime() + DAY),
      },
    ]);
  });

  it('the new address is mailed the link to /sign-up/confirm', async () => {
    await serviceWith().request(MARINA, IP);
    const [mail] = mailer.to('marina@exemplo.com');
    expect(mail?.subject).toBe('Confirme seu cadastro no Lorkarium');
    expect(mail?.text).toContain('https://mesa.example.com/sign-up/confirm#token=token-1');
    expect(mail?.text).toContain('O link vale 24 horas');
  });

  it('the address of an account is told it exists, with the @ and a new-password link', async () => {
    await serviceWith().request({ ...MARINA, email: 'ana@exemplo.com' }, IP);
    expect(invitations.rows).toEqual([]);
    expect(resets.rows).toMatchObject([{ userId: ANA_ID, tokenHash: 'sha:token-1' }]);
    const [mail] = mailer.to('ana@exemplo.com');
    expect(mail?.subject).toBe('Você já tem uma conta no Lorkarium');
    expect(mail?.text).toContain(`@${userPo({ email: 'ana@exemplo.com' }).username}`);
    expect(mail?.text).toContain('https://mesa.example.com/reset-password#token=token-1');
  });

  it('a suspended account gets nothing', async () => {
    users.rows[0] = { ...userPo({ id: ANA_ID, email: 'ana@exemplo.com' }), suspendedAt: NOW };
    await serviceWith().request({ ...MARINA, email: 'ana@exemplo.com' }, IP);
    expect(resets.rows).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });

  it('a banned address gets nothing and stores nothing', async () => {
    await bannedEmails.ban('idx:email-index:marina@exemplo.com', new Date(NOW.getTime() - DAY));
    await serviceWith().request(MARINA, IP);
    expect(invitations.rows).toEqual([]);
    expect(mailer.sent).toEqual([]);
  });

  it('a second request within 2 minutes sends nothing and keeps the first link', async () => {
    const service = serviceWith();
    await service.request(MARINA, IP);
    clock.current = new Date(NOW.getTime() + 60 * 1000);
    await service.request(MARINA, IP);
    expect(invitations.rows.map((row) => row.tokenHash)).toEqual(['sha:token-1']);
    expect(mailer.to('marina@exemplo.com')).toHaveLength(1);
  });

  it('a pending admin invitation is renewed keeping its role and origin, for 7 days', async () => {
    await invitations.insert({
      id: 'inv-admin',
      tokenHash: 'sha:old',
      emailCipher: 'sealed:invitation-email:inv-admin:marina@exemplo.com',
      emailIndex: 'idx:email-index:marina@exemplo.com',
      role: 'admin',
      origin: 'admin',
      invitedBy: 'lucas-id',
      sentAt: new Date(NOW.getTime() - 10 * DAY),
      expiresAt: new Date(NOW.getTime() - 3 * DAY),
    });
    await serviceWith().request(MARINA, IP);
    expect(invitations.rows).toMatchObject([
      { id: 'inv-admin', tokenHash: 'sha:token-1', role: 'admin', origin: 'admin', sentAt: NOW },
    ]);
    expect(invitations.rows[0]?.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(mailer.to('marina@exemplo.com')[0]?.text).toContain('/invite#token=token-1');
  });

  it('another request inserting the address first is treated as nothing, without an error', async () => {
    invitations = new RacedInvitationsDaoFake();
    await expect(serviceWith().request(MARINA, IP)).resolves.toBeUndefined();
    expect(mailer.sent).toEqual([]);
  });

  it('the reply does not wait for the e-mail to leave', async () => {
    const held = new HeldNoticesFake();
    await serviceWith({ notices: held }).request(MARINA, IP);
    expect(held.sent.map((mail) => mail.to)).toEqual(['marina@exemplo.com']);
    expect(held.delivered).toBe(0);
    held.release();
  });

  it('an e-mail that fails goes to the report and the request still resolves', async () => {
    const reported: string[] = [];
    mailer.failWith = new Error('smtp down');
    const notices = new SecurityNoticesService(mailer, (_error, subject) => reported.push(subject));
    await expect(serviceWith({ notices }).request(MARINA, IP)).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(reported).toEqual(['Confirme seu cadastro no Lorkarium']);
  });
});
