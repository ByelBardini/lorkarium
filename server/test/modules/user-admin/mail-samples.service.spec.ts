import { describe, expect, it } from 'vitest';
import { MailSamplesService } from '../../../src/modules/user-admin/mail-samples.service';
import { MailerFake } from '../../support/account-security-fakes';
import { ClockFake } from '../../support/auth-fakes';

const PUBLIC_URL = 'https://mesa.example.com';
// 13:37 in São Paulo (UTC−3).
const SENT_AT = new Date('2026-10-24T16:37:00Z');

function serviceWith(mailer: MailerFake): MailSamplesService {
  return new MailSamplesService({
    mailer,
    appPublicUrl: PUBLIC_URL,
    clock: new ClockFake(SENT_AT),
  });
}

describe('MailSamplesService', () => {
  it('lists every system e-mail with its id, name and subject, in the catalog order', () => {
    const samples = serviceWith(new MailerFake()).list();
    expect(samples).toHaveLength(11);
    expect(samples[0]).toEqual({
      id: 'email-confirmation',
      name: 'Confirmação do novo e-mail',
      subject: 'Confirme seu novo e-mail no Lorkarium',
    });
    expect(samples.at(-1)).toEqual({
      id: 'promoted-to-admin',
      name: 'Agora é admin',
      subject: 'Você agora é admin do Lorkarium',
    });
  });

  it('sends the chosen sample, and only it, to the typed address', async () => {
    const mailer = new MailerFake();
    const sent = await serviceWith(mailer).send('invitation', 'eu@exemplo.com');
    expect(sent).toEqual({ subject: 'Seu convite para o Lorkarium', to: 'eu@exemplo.com' });
    expect(mailer.sent.map((mail) => [mail.to, mail.subject])).toEqual([
      ['eu@exemplo.com', 'Seu convite para o Lorkarium'],
    ]);
    expect(mailer.sent[0]?.text).toContain(`${PUBLIC_URL}/invite#token=amostra`);
  });

  it('the "Quando" of a notice is the moment of the send, in Brasília time', async () => {
    const mailer = new MailerFake();
    await serviceWith(mailer).send('two-factor-on', 'eu@exemplo.com');
    expect(mailer.sent[0]?.text).toContain(
      'Quando: 24 de outubro de 2026 às 13:37 (horário de Brasília)',
    );
  });

  it('an unknown id is MAIL_SAMPLE_NOT_FOUND citing it, and nothing is sent', async () => {
    const mailer = new MailerFake();
    await expect(serviceWith(mailer).send('newsletter', 'eu@exemplo.com')).rejects.toMatchObject({
      code: 'MAIL_SAMPLE_NOT_FOUND',
      message: expect.stringContaining('newsletter'),
    });
    expect(mailer.sent).toEqual([]);
  });

  it('a mailer failure is MAIL_DELIVERY_FAILED with the subject and the reason, not swallowed', async () => {
    const mailer = new MailerFake();
    mailer.failWith = new Error('connect ECONNREFUSED 127.0.0.1:1025');
    await expect(
      serviceWith(mailer).send('password-changed', 'eu@exemplo.com'),
    ).rejects.toMatchObject({
      code: 'MAIL_DELIVERY_FAILED',
      message: expect.stringMatching(/Sua senha do Lorkarium foi trocada.*ECONNREFUSED/),
    });
  });
});
