import { beforeEach, describe, expect, it } from 'vitest';
import {
  InvitationsService,
  type AcceptanceDaos,
} from '../../../src/modules/account-links/invitations.service';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import type { UserPo } from '../../../src/modules/auth/users.po';
import { InvitationsDaoFake } from '../../support/account-links-fakes';
import { MailerFake } from '../../support/account-security-fakes';
import {
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { userPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-24T12:00:00Z');
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const LUCAS = { id: '11111111-1111-4111-8111-111111111111', name: 'Lucas' };

/** Starts a session for whoever is accepted, and keeps who it was. */
class SessionStarterFake {
  readonly started: Array<{ userId: string; persistent: boolean }> = [];

  async startSession(row: UserPo, persistent: boolean) {
    this.started.push({ userId: row.id, persistent });
    const user = {
      id: row.id,
      username: row.username,
      name: row.name,
      email: 'x@x.com',
      role: row.role,
      color: 'gold' as const,
      avatarId: null,
    };
    return { user, token: 'session-token', expiresAt: NOW, persistent };
  }
}

describe('InvitationsService', () => {
  let invitations: InvitationsDaoFake;
  let users: UsersDaoFake;
  let mailer: MailerFake;
  let clock: ClockFake;
  let sessions: SessionStarterFake;
  let ids: number;
  let service: InvitationsService;

  beforeEach(() => {
    invitations = new InvitationsDaoFake((userId) => (userId === LUCAS.id ? 'lucas' : null));
    users = new UsersDaoFake([
      userPo({ id: LUCAS.id, email: 'lucas@x.com', name: 'Lucas', role: 'admin' }),
    ]);
    mailer = new MailerFake();
    clock = new ClockFake(NOW);
    sessions = new SessionStarterFake();
    ids = 0;
    const daos: AcceptanceDaos = { invitations, users };
    service = new InvitationsService({
      invitations,
      users,
      transaction: (work) => work(daos),
      sessions,
      linkTokens: new SessionTokenFake(),
      hasher: new PasswordHasherFake(),
      cipher: new DataCipherFake(),
      clock,
      notices: new SecurityNoticesService(mailer, () => undefined),
      newId: () => `id-${(ids += 1)}`,
      appPublicUrl: 'https://mesa.example.com',
    });
  });

  const marina = { email: 'marina@exemplo.com', role: 'user' } as const;

  describe('invite', () => {
    it('stores the token hash and the address sealed with its index, for 7 days', async () => {
      await service.invite(LUCAS, marina);
      expect(invitations.rows).toEqual([
        {
          id: 'id-1',
          tokenHash: 'sha:token-1',
          emailCipher: 'sealed:invitation-email:id-1:marina@exemplo.com',
          emailIndex: 'idx:email-index:marina@exemplo.com',
          role: 'user',
          invitedBy: LUCAS.id,
          sentAt: NOW,
          expiresAt: new Date(NOW.getTime() + SEVEN_DAYS),
        },
      ]);
    });

    it('answers the link once and mails the same link to the address', async () => {
      const { invitation, link } = await service.invite(LUCAS, marina);
      expect(link).toBe('https://mesa.example.com/invite#token=token-1');
      expect(invitation).toMatchObject({
        id: 'id-1',
        email: 'marina@exemplo.com',
        invitedBy: 'lucas',
      });
      const [mail] = mailer.to('marina@exemplo.com');
      expect(mail?.subject).toBe('Seu convite para o Lorkarium');
      expect(mail?.text).toContain(link);
    });

    it('an address of an account is EMAIL_TAKEN and nothing is stored', async () => {
      await expect(
        service.invite(LUCAS, { email: 'lucas@x.com', role: 'user' }),
      ).rejects.toMatchObject({
        code: 'EMAIL_TAKEN',
      });
      expect(invitations.rows).toEqual([]);
    });

    it('a pending invitation for the address is ALREADY_INVITED with its id', async () => {
      await service.invite(LUCAS, marina);
      await expect(service.invite(LUCAS, marina)).rejects.toMatchObject({
        code: 'ALREADY_INVITED',
        invitationId: 'id-1',
      });
    });
  });

  describe('resend and cancel', () => {
    it('resend gives a new token and deadline: the old hash is gone and a new mail leaves', async () => {
      await service.invite(LUCAS, marina);
      clock.current = new Date(NOW.getTime() + 1000);
      const { link } = await service.resend('id-1');
      expect(link).toBe('https://mesa.example.com/invite#token=token-2');
      expect(invitations.rows[0]).toMatchObject({
        tokenHash: 'sha:token-2',
        expiresAt: new Date(NOW.getTime() + 1000 + SEVEN_DAYS),
      });
      expect(mailer.to('marina@exemplo.com')).toHaveLength(2);
    });

    it('resending an unknown invitation is INVITATION_NOT_FOUND', async () => {
      await expect(service.resend('nada')).rejects.toMatchObject({
        code: 'INVITATION_NOT_FOUND',
      });
    });

    it('cancel deletes it, twice is fine', async () => {
      await service.invite(LUCAS, marina);
      await service.cancel('id-1');
      await service.cancel('id-1');
      expect(invitations.rows).toEqual([]);
    });
  });

  describe('inspect', () => {
    it('answers the address and an @ from it that is free', async () => {
      users.rows.push(userPo({ id: 'm', email: 'marina@outro.com' }));
      await service.invite(LUCAS, marina);
      expect(await service.inspect('token-1')).toEqual({
        email: 'marina@exemplo.com',
        suggestedUsername: 'marina2',
      });
    });

    it('an expired invitation is ACCOUNT_LINK_INVALID', async () => {
      await service.invite(LUCAS, marina);
      clock.current = new Date(NOW.getTime() + SEVEN_DAYS);
      await expect(service.inspect('token-1')).rejects.toMatchObject({
        code: 'ACCOUNT_LINK_INVALID',
      });
    });
  });

  describe('accept', () => {
    const acceptance = {
      token: 'token-1',
      username: 'marina',
      password: 'senha-da-marina',
      persistent: true,
    };

    it('creates the account with the @ as nickname, the sealed address and the role, then signs in', async () => {
      await service.invite(LUCAS, { email: 'marina@exemplo.com', role: 'admin' });
      await service.accept(acceptance);
      expect(users.inserted).toEqual([
        {
          id: 'id-2',
          name: 'marina',
          username: 'marina',
          emailCipher: 'sealed:user-email:id-2:marina@exemplo.com',
          emailIndex: 'idx:email-index:marina@exemplo.com',
          passwordHash: 'hashed:senha-da-marina',
          role: 'admin',
        },
      ]);
      expect(invitations.rows).toEqual([]);
      expect(sessions.started).toEqual([{ userId: 'id-2', persistent: true }]);
    });

    it('an unknown token is ACCOUNT_LINK_INVALID and nothing is written', async () => {
      await service.invite(LUCAS, marina);
      await expect(service.accept({ ...acceptance, token: 'inventado' })).rejects.toMatchObject({
        code: 'ACCOUNT_LINK_INVALID',
      });
      expect(users.inserted).toEqual([]);
    });

    it('an expired invitation is ACCOUNT_LINK_INVALID and nothing is written', async () => {
      await service.invite(LUCAS, marina);
      clock.current = new Date(NOW.getTime() + SEVEN_DAYS);
      await expect(service.accept(acceptance)).rejects.toMatchObject({
        code: 'ACCOUNT_LINK_INVALID',
      });
      expect(users.inserted).toEqual([]);
    });

    it('the same link twice: the second is ACCOUNT_LINK_INVALID', async () => {
      await service.invite(LUCAS, marina);
      await service.accept(acceptance);
      await expect(service.accept(acceptance)).rejects.toMatchObject({
        code: 'ACCOUNT_LINK_INVALID',
      });
    });
  });
});
