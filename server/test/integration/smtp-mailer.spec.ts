import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { SmtpMailer } from '../../src/infrastructure/mailer/smtp-mailer';

// The disposable Mailpit of the /testar recipe (1026/8026) or the CI step (1025/8025).
const SMTP_URL = process.env.MAILPIT_SMTP_URL ?? 'smtp://localhost:1026';
const API_URL = process.env.MAILPIT_API_URL ?? 'http://localhost:8026';
const FROM = 'Lorkarium <no-reply@lorkarium.dev>';

type MailpitSummary = Readonly<{
  ID: string;
  From: Readonly<{ Address: string; Name: string }>;
  To: ReadonlyArray<Readonly<{ Address: string }>>;
  Subject: string;
}>;

async function messagesTo(address: string): Promise<MailpitSummary[]> {
  const response = await fetch(`${API_URL}/api/v1/messages?limit=200`);
  const body = (await response.json()) as { messages: MailpitSummary[] };
  return body.messages.filter((message) => message.To.some((to) => to.Address === address));
}

async function bodyOf(id: string): Promise<Readonly<{ Text: string; HTML: string }>> {
  const response = await fetch(`${API_URL}/api/v1/message/${id}`);
  return (await response.json()) as { Text: string; HTML: string };
}

describe('SmtpMailer', () => {
  const mailer = new SmtpMailer(SMTP_URL, FROM);

  afterAll(() => mailer.close());

  it('delivers with the sender, the subject and both bodies', async () => {
    const to = `ana-${randomUUID()}@mesa.com`;
    await mailer.send({
      to,
      subject: 'Sua senha foi trocada',
      text: 'corpo em texto',
      html: '<p>corpo em html</p>',
    });
    const [message] = await messagesTo(to);
    expect(message?.From).toEqual({ Address: 'no-reply@lorkarium.dev', Name: 'Lorkarium' });
    expect(message?.Subject).toBe('Sua senha foi trocada');
    const body = await bodyOf(message?.ID ?? '');
    expect(body.Text.trim()).toBe('corpo em texto');
    expect(body.HTML).toContain('<p>corpo em html</p>');
  });

  it('an SMTP server that is down fails citing the host, never the password of the URL', async () => {
    const down = new SmtpMailer('smtp://mailer:segredo-smtp@127.0.0.1:1', FROM);
    const failure: unknown = await down
      .send({ to: 'ana@mesa.com', subject: 'x', text: 'x', html: '<p>x</p>' })
      .catch((error) => error);
    down.close();
    expect(failure).toMatchObject({ name: 'MailDeliveryError', host: '127.0.0.1:1' });
    expect(String((failure as Error).message)).toContain('127.0.0.1:1');
    expect(String((failure as Error).message)).not.toContain('segredo-smtp');
  });
});
