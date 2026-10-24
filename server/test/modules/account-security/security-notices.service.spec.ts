import { describe, expect, it } from 'vitest';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { MailerFake } from '../../support/account-security-fakes';

const NOTICE = {
  to: 'ana@mesa.com',
  subject: 'Sua senha foi trocada',
  text: 't',
  html: '<p>t</p>',
};

describe('SecurityNoticesService', () => {
  it('hands the notice to the mailer', async () => {
    const mailer = new MailerFake();
    await new SecurityNoticesService(mailer, () => undefined).send(NOTICE);
    expect(mailer.sent).toEqual([NOTICE]);
  });

  it('a failure is reported with the subject instead of thrown', async () => {
    const mailer = new MailerFake();
    mailer.failWith = new Error('connect ECONNREFUSED');
    const reported: Array<[string, string]> = [];
    const notices = new SecurityNoticesService(mailer, (error, subject) => {
      reported.push([(error as Error).message, subject]);
    });
    await expect(notices.send(NOTICE)).resolves.toBeUndefined();
    expect(reported).toEqual([['connect ECONNREFUSED', 'Sua senha foi trocada']]);
  });
});
