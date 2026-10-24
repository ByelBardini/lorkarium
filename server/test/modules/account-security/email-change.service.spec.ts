import { beforeEach, describe, expect, it } from 'vitest';
import { CurrentPasswordService } from '../../../src/modules/account-security/current-password.service';
import { EmailChangeService } from '../../../src/modules/account-security/email-change.service';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { EmailChangeRequestsDaoFake, MailerFake } from '../../support/account-security-fakes';
import {
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  SessionTokenFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';

const NOW = new Date('2026-10-14T12:00:00Z');
const BIA_ID = '2c9e4b1a-7d3f-4a8e-b6c5-0f1e2d3c4b5a';
const APP = 'https://mesa.example.com';

describe('EmailChangeService', () => {
  let users: UsersDaoFake;
  let requests: EmailChangeRequestsDaoFake;
  let mailer: MailerFake;
  let clock: ClockFake;
  let service: EmailChangeService;

  beforeEach(() => {
    users = new UsersDaoFake([
      userPo({ passwordHash: 'hashed:senha-da-ana' }),
      userPo({ id: BIA_ID, email: 'bia@mesa.com' }),
    ]);
    requests = new EmailChangeRequestsDaoFake();
    mailer = new MailerFake();
    clock = new ClockFake(NOW);
    const hasher = new PasswordHasherFake();
    service = new EmailChangeService({
      users,
      currentPassword: new CurrentPasswordService(users, hasher),
      requests,
      tokens: new SessionTokenFake(),
      cipher: new DataCipherFake(),
      clock,
      mailer,
      notices: new SecurityNoticesService(mailer, () => undefined),
      appPublicUrl: APP,
    });
  });

  const ask = { newEmail: 'bianca@x.com', currentPassword: 'senha-da-ana' };

  describe('request', () => {
    it('stores the token hash and the new address sealed, for 30 minutes; answers it masked', async () => {
      expect(await service.request(ANA_ID, ask)).toBe('b*****@x.com');
      expect(requests.rows).toEqual([
        expect.objectContaining({
          id: 'sha:token-1',
          userId: ANA_ID,
          emailCipher: `sealed:pending-email:${ANA_ID}:bianca@x.com`,
          emailIndex: 'idx:email-index:bianca@x.com',
          expiresAt: new Date('2026-10-14T12:30:00Z'),
        }),
      ]);
    });

    it('mails the link with the token in the fragment to the new address only', async () => {
      await service.request(ANA_ID, ask);
      const [link] = mailer.to('bianca@x.com');
      expect(link?.text).toContain(`${APP}/account/email/confirm#token=token-1`);
      expect(
        mailer
          .to('ana@mesa.com')
          .map((mail) => mail.text)
          .join(),
      ).not.toContain('token-1');
    });

    it('tells the current address that a change was asked', async () => {
      await service.request(ANA_ID, ask);
      expect(mailer.to('ana@mesa.com').map((mail) => mail.subject)).toEqual([
        'Pedido de troca de e-mail',
      ]);
    });

    it('a second request replaces the first: one row, the newest token', async () => {
      await service.request(ANA_ID, ask);
      await service.request(ANA_ID, { ...ask, newEmail: 'ana@outro.com' });
      expect(requests.rows.map((row) => row.id)).toEqual(['sha:token-2']);
    });

    it('a wrong password is CURRENT_PASSWORD_INVALID and nothing is stored or mailed', async () => {
      const wrong = service.request(ANA_ID, { ...ask, currentPassword: 'errada' });
      await expect(wrong).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
      expect(requests.rows).toEqual([]);
      expect(mailer.sent).toEqual([]);
    });

    it('the current address is EMAIL_UNCHANGED', async () => {
      const same = service.request(ANA_ID, { ...ask, newEmail: 'ana@mesa.com' });
      await expect(same).rejects.toMatchObject({ code: 'EMAIL_UNCHANGED' });
    });

    it('an address of another account is EMAIL_TAKEN, found by the blind index', async () => {
      const taken = service.request(ANA_ID, { ...ask, newEmail: 'bia@mesa.com' });
      await expect(taken).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
      expect(users.lookedUp).toEqual(['idx:email-index:bia@mesa.com']);
    });

    it('a link that cannot leave fails the request (the person must know)', async () => {
      mailer.failWith = new Error('connect ECONNREFUSED');
      await expect(service.request(ANA_ID, ask)).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('confirm', () => {
    beforeEach(async () => {
      await service.request(ANA_ID, ask);
    });

    it('swaps the cipher and the index of the account, deletes the request and tells the old address', async () => {
      await service.confirm('token-1');
      expect(users.rows[0]).toMatchObject({
        emailCipher: `sealed:user-email:${ANA_ID}:bianca@x.com`,
        emailIndex: 'idx:email-index:bianca@x.com',
      });
      expect(requests.rows).toEqual([]);
      expect(mailer.to('ana@mesa.com').map((mail) => mail.subject)).toContain(
        'O e-mail da sua conta foi trocado',
      );
    });

    it('the same link a second time is EMAIL_TOKEN_INVALID', async () => {
      await service.confirm('token-1');
      await expect(service.confirm('token-1')).rejects.toMatchObject({
        code: 'EMAIL_TOKEN_INVALID',
        received: 'an unknown token',
      });
    });

    it('a link past its 30 minutes is EMAIL_TOKEN_INVALID and the e-mail stays', async () => {
      clock.current = new Date('2026-10-14T12:30:00Z');
      await expect(service.confirm('token-1')).rejects.toMatchObject({
        received: 'an expired token',
      });
      expect(users.rows[0]?.emailIndex).toBe('idx:email-index:ana@mesa.com');
    });

    it('an address taken between the request and the click is EMAIL_TAKEN (the unique index)', async () => {
      users.rows.push(userPo({ id: 'user-caio', email: 'bianca@x.com' }));
      await expect(service.confirm('token-1')).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    });

    it('a cancelled request no longer confirms', async () => {
      await service.cancel(ANA_ID);
      await expect(service.confirm('token-1')).rejects.toMatchObject({
        code: 'EMAIL_TOKEN_INVALID',
      });
    });
  });
});
