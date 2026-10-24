import { describe, expect, it } from 'vitest';
import { LogMailer, type MailLog } from '../../../src/infrastructure/mailer/log-mailer';

/** Keeps every line the mailer logged. */
class MailLogFake implements MailLog {
  readonly lines: Array<{ fields: object; message: string }> = [];

  info(fields: object, message: string): void {
    this.lines.push({ fields, message });
  }
}

describe('LogMailer', () => {
  it('writes the sender, recipient, subject and plain text to the log instead of sending', async () => {
    const log = new MailLogFake();
    const mailer = new LogMailer(log, 'Lorkarium <no-reply@lorkarium.dev>');
    await mailer.send({ to: 'ana@mesa.com', subject: 'Oi', text: 'corpo', html: '<p>corpo</p>' });
    expect(log.lines).toEqual([
      {
        fields: {
          mail: {
            from: 'Lorkarium <no-reply@lorkarium.dev>',
            to: 'ana@mesa.com',
            subject: 'Oi',
            text: 'corpo',
          },
        },
        message: 'e-mail written to the log',
      },
    ]);
  });
});
